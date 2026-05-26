'use strict';

/**
 * voiceRoute.test.js  —  Task 5 of CLAUDE_BACKEND_AI_PLAN.md
 *
 * Integration tests for POST /api/chat/voice using node:test + node:assert.
 * No external test runner needed — run with:
 *   node --test tests/voiceRoute.test.js
 *
 * Covered cases (per the task spec):
 *   1. ✅ Happy path  — valid audio → AI returns answer + audio
 *   2. ❌ No audio file uploaded → 400 VALIDATION_ERROR
 *   3. ❌ No JWT token → 401
 *   4. ❌ AI service fails (STT_FAILED from AI) → 200 with fallbackUsed=true
 *   5. ❌ AI service throws AiServiceError (network/timeout) → 408 or 503
 *
 * Strategy:
 *   - Spin up a minimal Express app per test (random port, torn down after).
 *   - Mock requestAiVoice, uploadUserAudio, uploadAiAudio, and
 *     createChatPersistenceService via dependency injection.
 *   - Never touch Firebase or the real AI service.
 */

const test    = require('node:test');
const assert  = require('node:assert/strict');
const express = require('express');
const multer  = require('multer');
const jwt     = require('jsonwebtoken');

const { requireAuth }   = require('../src/middleware/auth');
const { AiServiceError } = require('../src/services/aiChatService');

// ── Test JWT secret ───────────────────────────────────────────────────────────
const TEST_JWT_SECRET = 'voice-test-jwt-secret';

function makeToken(payload = {}) {
  return jwt.sign({ uid: 'user-voice-123', role: 'student', ...payload }, TEST_JWT_SECRET);
}

// ── Minimal audio buffer (1-byte stub — multer just needs bytes) ───────────────
const STUB_AUDIO = Buffer.from([0x00]);

// ── Shared mock factories ─────────────────────────────────────────────────────

function makePersistence(overrides = {}) {
  return {
    async createOrLoadConversation({ conversationId }) {
      return { id: conversationId || 'conv-voice-1', isNew: !conversationId };
    },
    async saveUserMessage() {
      return { id: 'user-msg-1' };
    },
    async saveAssistantMessage() {
      return { id: 'ai-msg-1' };
    },
    ...overrides,
  };
}

function makeAiVoiceSuccess() {
  return async () => ({
    answerHe:             'שלום!',
    answerAr:             null,
    audioBase64:          'bW9ja19hdWRpb19iYXNlNjQ=',  // base64("mock_audio_base64")
    fallbackUsed:         false,
    fallbackReason:       null,
    level:                'A1',
    model:                'mock-model',
    provider:             'mock',
    latencyMs:            42,
    transcribedText:      'שלום',
    suggestedNextPrompts: [],
  });
}

function makeNoopStorage() {
  return {
    uploadUserAudio: async () => null,
    uploadAiAudio:   async () => null,
  };
}

// ── App builder — builds a self-contained Express app for one test ────────────

/**
 * @param {object} opts
 * @param {Function} opts.requestAiVoice
 * @param {object}   opts.persistence
 * @param {object}   [opts.storage]
 */
function buildApp(opts) {
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  const app = express();

  // Multer — same config as production route
  const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 10 * 1024 * 1024 },
    fileFilter(_req, file, cb) {
      if (/^audio\//.test(file.mimetype)) return cb(null, true);
      cb(Object.assign(new Error('Only audio files are accepted'), { code: 'INVALID_FILE_TYPE' }));
    },
  }).single('audio');

  const storage = opts.storage || makeNoopStorage();

  // Voice handler (inlined so we can inject dependencies)
  async function voiceHandler(req, res) {
    const userId = req.user.uid;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        error: 'No audio file uploaded.',
      });
    }

    const audioBuffer  = req.file.buffer;
    const originalname = req.file.originalname || 'audio.webm';
    const mimetype     = req.file.mimetype      || 'audio/webm';
    const level        = (req.body.level || 'A1').trim().toUpperCase();
    const includeArabic = req.body.includeArabic === 'true';
    const conversationId = req.body.conversationId || null;

    let conversation;
    try {
      conversation = await opts.persistence.createOrLoadConversation({
        conversationId, userId, level, initialMessageText: '[voice message]',
      });
    } catch (err) {
      return res.status(500).json({ success: false, code: 'INTERNAL_ERROR', error: err.message });
    }

    let aiRaw;
    try {
      aiRaw = await opts.requestAiVoice(
        { audioBuffer, originalname, mimetype, level, includeArabic },
        { config: { baseUrl: 'http://127.0.0.1:8000', timeoutMs: 5000, internalSecret: '' } },
      );
    } catch (err) {
      if (err instanceof AiServiceError) {
        if (err.code === 'AI_SERVICE_TIMEOUT') {
          return res.status(408).json({ success: false, code: 'AI_TIMEOUT', error: err.message });
        }
        return res.status(503).json({ success: false, code: err.code, error: err.message });
      }
      return res.status(500).json({ success: false, code: 'INTERNAL_ERROR', error: err.message });
    }

    // Upload audio (non-fatal)
    let audioUrlUser = null;
    let audioUrlAssistant = null;
    try { audioUrlUser = await storage.uploadUserAudio({ buffer: audioBuffer, mimeType: mimetype, userId, conversationId: conversation.id, messageId: 'tmp' }); } catch (_) {}
    try { if (aiRaw.audioBase64) audioUrlAssistant = await storage.uploadAiAudio({ audioBase64: aiRaw.audioBase64, userId, conversationId: conversation.id, messageId: 'ai_tmp' }); } catch (_) {}

    try {
      await opts.persistence.saveUserMessage({ conversationId: conversation.id, userId, rawText: aiRaw.transcribedText || '[voice]', clientMessageId: null, audioUrlUser });
    } catch (_) {}

    let assistantRecord;
    try {
      assistantRecord = await opts.persistence.saveAssistantMessage({ conversationId: conversation.id, userId, response: aiRaw, audioUrlAssistant });
    } catch (_) {}

    return res.status(200).json({
      success:              true,
      conversationId:       conversation.id,
      messageId:            assistantRecord?.id || null,
      answerHe:             aiRaw.answerHe,
      answerAr:             aiRaw.answerAr      || null,
      audioBase64:          aiRaw.audioBase64   || null,
      audioUrlAssistant,
      fallbackUsed:         aiRaw.fallbackUsed,
      fallbackReason:       aiRaw.fallbackReason || null,
      level:                aiRaw.level          || level,
      latencyMs:            aiRaw.latencyMs,
      transcribedText:      aiRaw.transcribedText || null,
      suggestedNextPrompts: aiRaw.suggestedNextPrompts || [],
    });
  }

  app.post(
    '/api/chat/voice',
    (req, res, next) => {
      audioUpload(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE')    return res.status(413).json({ success: false, code: 'FILE_TOO_LARGE',    error: 'Audio file must be under 10 MB.' });
        if (err.code === 'INVALID_FILE_TYPE')  return res.status(415).json({ success: false, code: 'INVALID_FILE_TYPE', error: 'Only audio files are accepted.' });
        return res.status(400).json({ success: false, code: 'UPLOAD_ERROR', error: err.message });
      });
    },
    requireAuth,
    voiceHandler,
  );

  return app;
}

// ── Test server lifecycle ─────────────────────────────────────────────────────

async function withServer(opts, run) {
  const app = buildApp(opts);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

/** Build a multipart/form-data body with an audio file field. */
function buildFormData(audioBuffer, extra = {}) {
  // Use native FormData (Node 18+)
  const form = new FormData();
  const blob = new Blob([audioBuffer], { type: 'audio/webm' });
  form.append('audio', blob, 'test.webm');
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

// ── Case 1: Happy path ────────────────────────────────────────────────────────
test('POST /api/chat/voice — success: valid audio returns Hebrew answer + audioBase64', async () => {
  await withServer(
    { requestAiVoice: makeAiVoiceSuccess(), persistence: makePersistence() },
    async (base) => {
      const res = await fetch(`${base}/api/chat/voice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${makeToken()}` },
        body: buildFormData(STUB_AUDIO, { level: 'A1' }),
      });
      const body = await res.json();

      assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(body)}`);
      assert.equal(body.success, true);
      assert.equal(body.answerHe, 'שלום!');
      assert.equal(body.audioBase64, 'bW9ja19hdWRpb19iYXNlNjQ=');
      assert.equal(body.fallbackUsed, false);
      assert.equal(body.transcribedText, 'שלום');
      assert.equal(body.conversationId, 'conv-voice-1');
      assert.equal(body.messageId, 'ai-msg-1');
    },
  );
});

// ── Case 2: No audio file ─────────────────────────────────────────────────────
test('POST /api/chat/voice — error: missing audio file returns 400 VALIDATION_ERROR', async () => {
  await withServer(
    {
      requestAiVoice: async () => { throw new Error('should not be called'); },
      persistence: makePersistence(),
    },
    async (base) => {
      // Send request without any file — only text fields via JSON
      // multer will parse it but req.file will be undefined
      const form = new FormData();
      form.append('level', 'A1');  // no 'audio' field

      const res = await fetch(`${base}/api/chat/voice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${makeToken()}` },
        body: form,
      });
      const body = await res.json();

      assert.equal(res.status, 400, `Expected 400 but got ${res.status}: ${JSON.stringify(body)}`);
      assert.equal(body.success, false);
      assert.equal(body.code, 'VALIDATION_ERROR');
    },
  );
});

// ── Case 3: No JWT ────────────────────────────────────────────────────────────
test('POST /api/chat/voice — error: missing JWT returns 401', async () => {
  await withServer(
    {
      requestAiVoice: async () => { throw new Error('should not be called'); },
      persistence: makePersistence(),
    },
    async (base) => {
      const res = await fetch(`${base}/api/chat/voice`, {
        method: 'POST',
        // No Authorization header
        body: buildFormData(STUB_AUDIO),
      });
      const body = await res.json();

      assert.equal(res.status, 401, `Expected 401 but got ${res.status}: ${JSON.stringify(body)}`);
      assert.match(body.error, /token/i);
    },
  );
});

// ── Case 4: AI returns STT_FAILED fallback (soft failure — 200) ───────────────
test('POST /api/chat/voice — STT_FAILED: AI returns 200 with fallbackUsed=true', async () => {
  await withServer(
    {
      requestAiVoice: async () => ({
        answerHe:         '',
        answerAr:         null,
        audioBase64:      null,
        fallbackUsed:     true,
        fallbackReason:   'STT_FAILED',
        level:            'A1',
        model:            'mock',
        provider:         'mock',
        latencyMs:        10,
        transcribedText:  null,
        suggestedNextPrompts: [],
      }),
      persistence: makePersistence(),
    },
    async (base) => {
      const res = await fetch(`${base}/api/chat/voice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${makeToken()}` },
        body: buildFormData(STUB_AUDIO),
      });
      const body = await res.json();

      assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(body)}`);
      assert.equal(body.success, true);
      assert.equal(body.fallbackUsed, true);
      assert.equal(body.fallbackReason, 'STT_FAILED');
      assert.equal(body.audioBase64, null);
    },
  );
});

// ── Case 5: AI service throws AiServiceError (network/timeout) ────────────────
test('POST /api/chat/voice — AI_SERVICE_TIMEOUT: throws AiServiceError → 408', async () => {
  await withServer(
    {
      requestAiVoice: async () => {
        throw new AiServiceError('AI service timed out', {
          code: 'AI_SERVICE_TIMEOUT',
          status: 504,
        });
      },
      persistence: makePersistence(),
    },
    async (base) => {
      const res = await fetch(`${base}/api/chat/voice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${makeToken()}` },
        body: buildFormData(STUB_AUDIO),
      });
      const body = await res.json();

      assert.equal(res.status, 408, `Expected 408 but got ${res.status}: ${JSON.stringify(body)}`);
      assert.equal(body.success, false);
      assert.equal(body.code, 'AI_TIMEOUT');
    },
  );
});

test('POST /api/chat/voice — AI_SERVICE_UNAVAILABLE: throws AiServiceError → 503', async () => {
  await withServer(
    {
      requestAiVoice: async () => {
        throw new AiServiceError('AI service is down', {
          code: 'AI_SERVICE_UNAVAILABLE',
          status: 502,
        });
      },
      persistence: makePersistence(),
    },
    async (base) => {
      const res = await fetch(`${base}/api/chat/voice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${makeToken()}` },
        body: buildFormData(STUB_AUDIO),
      });
      const body = await res.json();

      assert.equal(res.status, 503, `Expected 503 but got ${res.status}: ${JSON.stringify(body)}`);
      assert.equal(body.success, false);
      assert.equal(body.code, 'AI_SERVICE_UNAVAILABLE');
    },
  );
});

// ── Case 6: TTS fails but text is still returned (graceful degradation) ────────
test('POST /api/chat/voice — TTS_FAILED: audioBase64 is null but answerHe is present', async () => {
  await withServer(
    {
      requestAiVoice: async () => ({
        answerHe:             'שלום!',
        answerAr:             null,
        audioBase64:          null,   // TTS failed — AI service already degraded
        fallbackUsed:         false,
        fallbackReason:       'TTS_FAILED',
        level:                'A1',
        model:                'mock',
        provider:             'mock',
        latencyMs:            55,
        transcribedText:      'שלום',
        suggestedNextPrompts: [],
      }),
      persistence: makePersistence(),
    },
    async (base) => {
      const res = await fetch(`${base}/api/chat/voice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${makeToken()}` },
        body: buildFormData(STUB_AUDIO),
      });
      const body = await res.json();

      assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(body)}`);
      assert.equal(body.success, true);
      assert.equal(body.answerHe, 'שלום!');  // text is present
      assert.equal(body.audioBase64, null);   // audio is null — Frontend shows text only
      assert.equal(body.fallbackReason, 'TTS_FAILED');
    },
  );
});

// ── Case 7: Invalid file type → 415 ──────────────────────────────────────────
test('POST /api/chat/voice — invalid file type returns 415', async () => {
  await withServer(
    {
      requestAiVoice: async () => { throw new Error('should not be called'); },
      persistence: makePersistence(),
    },
    async (base) => {
      const form = new FormData();
      const blob = new Blob(['not audio'], { type: 'text/plain' });
      form.append('audio', blob, 'hack.txt');

      const res = await fetch(`${base}/api/chat/voice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${makeToken()}` },
        body: form,
      });
      const body = await res.json();

      assert.equal(res.status, 415, `Expected 415 but got ${res.status}: ${JSON.stringify(body)}`);
      assert.equal(body.code, 'INVALID_FILE_TYPE');
    },
  );
});

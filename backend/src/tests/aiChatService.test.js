'use strict';
/**
 * aiChatService.test.js
 *
 * Unit tests for the AI service client using Node.js built-in test runner.
 * No real HTTP calls — axios is mocked via module-level patching.
 */
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ── Minimal axios mock ────────────────────────────────────────────────────────
let _axiosPostImpl = async () => ({ data: {} });
let _axiosGetImpl  = async () => ({ data: {} });

require.cache[require.resolve('axios')] = {
  exports: {
    post: async (...args) => _axiosPostImpl(...args),
    get: async (...args) => _axiosGetImpl(...args),
  },
};

const {
  sendChatMessageToAi,
  sendVoiceMessageToAi,
  getAiChatServiceUrl,
  getAiVoiceServiceUrl,
  mapAiServiceError,
  normalizeAiServiceBaseUrl,
} = require('../services/aiChatService');

// ── sendChatMessageToAi ───────────────────────────────────────────────────────

describe('sendChatMessageToAi', () => {
  beforeEach(() => {
    _axiosPostImpl = async () => ({ data: { answerHe: 'שלום', fallbackUsed: false } });
  });

  test('normalizes AI_SERVICE_URL when it points at the chat endpoint', () => {
    const previousUrl = process.env.AI_SERVICE_URL;
    process.env.AI_SERVICE_URL = 'http://127.0.0.1:8000/api/ai/chat';

    assert.equal(normalizeAiServiceBaseUrl(), 'http://127.0.0.1:8000');
    assert.equal(getAiChatServiceUrl(), 'http://127.0.0.1:8000/api/ai/chat');
    assert.equal(getAiVoiceServiceUrl(), 'http://127.0.0.1:8000/api/ai/chat/voice');

    if (previousUrl === undefined) {
      delete process.env.AI_SERVICE_URL;
    } else {
      process.env.AI_SERVICE_URL = previousUrl;
    }
  });

  test('sends user id header when a user token is proxied', async () => {
    let capturedConfig = null;
    _axiosPostImpl = async (_url, _body, config) => {
      capturedConfig = config;
      return { data: {} };
    };

    await sendChatMessageToAi({
      message: 'שלום',
      level: 'A1',
      userId: 'uid-123',
      userToken: 'frontend-token',
    });

    assert.equal(capturedConfig.headers.Authorization, 'Bearer frontend-token');
    assert.equal(capturedConfig.headers['X-User-ID'], 'uid-123');
  });

  test('returns data from axios response', async () => {
    const result = await sendChatMessageToAi({ message: 'שלום', level: 'A1' });
    assert.equal(result.answerHe, 'שלום');
    assert.equal(result.fallbackUsed, false);
  });

  test('sends voiceMode: false in body', async () => {
    let capturedBody = null;
    _axiosPostImpl = async (_url, body) => { capturedBody = body; return { data: {} }; };
    await sendChatMessageToAi({ message: 'מה שלומך?', level: 'A1' });
    assert.equal(capturedBody.voiceMode, false);
  });

  test('sends userId in body when provided', async () => {
    let capturedBody = null;
    _axiosPostImpl = async (_url, body) => { capturedBody = body; return { data: {} }; };
    await sendChatMessageToAi({ message: 'שלום', level: 'A1', userId: 'uid-123' });
    assert.equal(capturedBody.userId, 'uid-123');
  });

  test('sends sessionId in body when provided', async () => {
    let capturedBody = null;
    _axiosPostImpl = async (_url, body) => { capturedBody = body; return { data: {} }; };
    await sendChatMessageToAi({ message: 'שלום', level: 'A1', sessionId: 'sess-abc' });
    assert.equal(capturedBody.sessionId, 'sess-abc');
  });

  test('sends learnerName in body when provided', async () => {
    let capturedBody = null;
    _axiosPostImpl = async (_url, body) => { capturedBody = body; return { data: {} }; };
    await sendChatMessageToAi({
      message: 'שלום',
      level: 'A1',
      learnerName: 'Layan',
    });
    assert.equal(capturedBody.learnerName, 'Layan');
  });

  test('omits userId from body when not provided', async () => {
    let capturedBody = null;
    _axiosPostImpl = async (_url, body) => { capturedBody = body; return { data: {} }; };
    await sendChatMessageToAi({ message: 'שלום', level: 'A1' });
    assert.equal('userId' in capturedBody, false);
  });

  test('throws mapped error on axios failure', async () => {
    _axiosPostImpl = async () => { throw { code: 'ECONNABORTED' }; };
    await assert.rejects(
      () => sendChatMessageToAi({ message: 'שלום', level: 'A1' }),
      (err) => { assert.equal(err.code, 'AI_TIMEOUT'); return true; }
    );
  });
});

// ── sendVoiceMessageToAi ──────────────────────────────────────────────────────

describe('sendVoiceMessageToAi', () => {
  beforeEach(() => {
    _axiosPostImpl = async () => ({ data: { answerHe: 'שלום', transcribedText: 'שלום' } });
  });

  test('returns data from axios response', async () => {
    const result = await sendVoiceMessageToAi({
      audioBuffer: Buffer.from('audio'),
      level: 'A1',
    });
    assert.equal(result.answerHe, 'שלום');
  });

  test('appends userId to FormData when provided', async () => {
    let capturedForm = null;
    _axiosPostImpl = async (_url, form) => { capturedForm = form; return { data: {} }; };
    await sendVoiceMessageToAi({
      audioBuffer: Buffer.from('audio'),
      level: 'A1',
      userId: 'uid-456',
    });
    assert.ok(capturedForm instanceof FormData);
    assert.equal(capturedForm.get('userId'), 'uid-456');
  });

  test('appends sessionId to FormData when provided', async () => {
    let capturedForm = null;
    _axiosPostImpl = async (_url, form) => { capturedForm = form; return { data: {} }; };
    await sendVoiceMessageToAi({
      audioBuffer: Buffer.from('audio'),
      level: 'A1',
      sessionId: 'sess-xyz',
    });
    assert.equal(capturedForm.get('sessionId'), 'sess-xyz');
  });

  test('appends learnerName to FormData when provided', async () => {
    let capturedForm = null;
    _axiosPostImpl = async (_url, form) => { capturedForm = form; return { data: {} }; };
    await sendVoiceMessageToAi({
      audioBuffer: Buffer.from('audio'),
      level: 'A1',
      learnerName: 'Dana',
    });
    assert.equal(capturedForm.get('learnerName'), 'Dana');
  });

  test('throws mapped error on 503 response', async () => {
    _axiosPostImpl = async () => {
      throw { response: { status: 503, data: { detail: 'down' } } };
    };
    await assert.rejects(
      () => sendVoiceMessageToAi({ audioBuffer: Buffer.from('x'), level: 'A1' }),
      (err) => { assert.equal(err.status, 503); return true; }
    );
  });
});

// ── mapAiServiceError ─────────────────────────────────────────────────────────

describe('mapAiServiceError', () => {
  test('maps ECONNABORTED to AI_TIMEOUT', () => {
    const mapped = mapAiServiceError({ code: 'ECONNABORTED' });
    assert.equal(mapped.status, 408);
    assert.equal(mapped.code, 'AI_TIMEOUT');
  });

  test('maps axios response error with status', () => {
    const mapped = mapAiServiceError({ response: { status: 429, data: { detail: 'quota' } } });
    assert.equal(mapped.status, 429);
  });

  test('maps no-response error to 503', () => {
    const mapped = mapAiServiceError({ request: {} });
    assert.equal(mapped.status, 503);
    assert.equal(mapped.code, 'AI_SERVICE_UNAVAILABLE');
  });

  test('maps generic error to 500', () => {
    const mapped = mapAiServiceError({ message: 'unknown' });
    assert.equal(mapped.status, 500);
    assert.equal(mapped.code, 'AI_SERVICE_ERROR');
  });
});

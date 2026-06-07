/**
 * e2e-smoke.js — Phase 0.3 headless proof of the real stack (in-process).
 *
 * Boots the real backend app (createApp) on an ephemeral port to avoid any
 * port collisions, points it at a running ai-service, and drives the full
 * chain with auth ON (no SKIP_AUTH):
 *   backend (requireAuth) → ai-service (internal secret) →
 *   Azure STT → pronunciation → Gemini chat → Firestore persistence.
 *
 * Storage upload is skipped (SKIP_VOICE_STORAGE) only because the project's
 * Storage bucket isn't enabled yet; everything else is real.
 *
 * Prereq: ai-service running (default :8001). Override with AI_PORT.
 *   node scripts/e2e-smoke.js
 */
const path = require('path');
const fs = require('fs');

// Must be set BEFORE requiring the server (dotenv won't override existing env).
const AI_PORT = process.env.AI_PORT || '8001';
process.env.SKIP_VOICE_STORAGE = 'true';
process.env.AI_SERVICE_URL = `http://127.0.0.1:${AI_PORT}/api/ai/chat`;

const { app } = require(path.join(__dirname, '..', 'src', 'server'));
const axios = require('axios');
const FormData = require('form-data');
const jwt = require('jsonwebtoken');

const CLIP = process.env.CLIP ||
  path.join(__dirname, '..', '..', 'ai-service', 'evals', 'voice_stt_audio', 'stt_he_shalom.webm');

const token = jwt.sign(
  { uid: 'e2e-test-user', role: 'student', email: 'e2e@test.local' },
  process.env.JWT_SECRET,
);
const authHeaders = { Authorization: `Bearer ${token}` };

let failures = 0;
const ok = (label, cond, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!cond) failures++;
};

async function run(BASE) {
  console.log(`E2E smoke @ ${BASE}  (auth ON; SKIP_VOICE_STORAGE for upload only)\n`);

  // 1. VOICE round-trip (auto-creates conversation)
  console.log('1) POST /api/chat/voice (real webm → Azure STT → pron → chat)');
  const form = new FormData();
  form.append('audio', fs.createReadStream(CLIP), { filename: 'voice-message.webm', contentType: 'audio/webm' });
  form.append('level', 'A1');
  const vr = await axios.post(`${BASE}/api/chat/voice`, form, {
    headers: { ...authHeaders, ...form.getHeaders() }, timeout: 45000,
  });
  const v = vr.data;
  const conversationId = v.conversationId;
  ok('voice HTTP 200 with auth ON', vr.status === 200);
  ok('transcribedText present', Boolean(v.transcribedText), JSON.stringify(v.transcribedText));
  ok('answerHe non-empty Hebrew reply', Boolean(v.answerHe && v.answerHe.trim()), JSON.stringify(v.answerHe));
  ok('pronunciationScore is a number', typeof v.pronunciationScore === 'number', String(v.pronunciationScore));
  ok('conversationId returned', Boolean(conversationId), conversationId);
  const storageOn = process.env.SKIP_VOICE_STORAGE !== 'true';
  if (storageOn) ok('audioUrl is a real storage URL', Boolean(v.audioUrl) && !String(v.audioUrl).startsWith('local-dev://'), v.audioUrl);
  else console.log('  SKIP  audioUrl — Firebase Storage not enabled yet (SKIP_VOICE_STORAGE on)');

  // 2. TEXT round-trip on the same conversation
  console.log('\n2) POST /api/chat/:id/ai-message (text → chat)');
  const tr = await axios.post(`${BASE}/api/chat/${conversationId}/ai-message`,
    { text: 'מה שלומך' }, { headers: authHeaders, timeout: 30000 });
  const aiMsg = tr.data.aiMessage || tr.data.assistantMessage || {};
  ok('text HTTP 200', tr.status === 200);
  ok('AI text reply non-empty', Boolean((aiMsg.text || aiMsg.answerHe || '').trim()),
    JSON.stringify(aiMsg.text || aiMsg.answerHe));

  // 3. PERSISTENCE: list + reopen
  console.log('\n3) GET conversations + reopen');
  const listR = await axios.get(`${BASE}/api/chat/conversations`, { headers: authHeaders });
  ok('conversation appears in list', JSON.stringify(listR.data).includes(conversationId));
  const openR = await axios.get(`${BASE}/api/chat/${conversationId}`, { headers: authHeaders });
  const openStr = JSON.stringify(openR.data);
  ok('reopened chat has the voice transcript', Boolean(v.transcribedText) && openStr.includes(v.transcribedText));
  if (storageOn) ok('reopened chat has audioUrl persisted', v.audioUrl ? openStr.includes(v.audioUrl) : false);
  else console.log('  SKIP  audioUrl persistence — pending Firebase Storage enable');
}

const server = app.listen(0, async () => {
  const BASE = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(BASE);
    console.log(`\n${'='.repeat(56)}`);
    console.log(failures === 0 ? 'E2E RESULT: ALL PASS ✓' : `E2E RESULT: ${failures} FAIL ✗`);
  } catch (e) {
    const r = e.response;
    console.log('\nE2E ERROR:', e.message);
    if (r) console.log('  HTTP', r.status, JSON.stringify(r.data).slice(0, 400));
    failures = failures || 99;
  } finally {
    server.close();
    process.exit(failures === 0 ? 0 : 1);
  }
});

/**
 * fresh-test.js — Complete happy-path test from scratch.
 * Tests: login / text chat / voice chat / pronunciation / persistence.
 * Outputs: completion percentage + detailed results.
 *
 * Boots real backend on ephemeral port (no :3000 collision).
 */
const path = require('path');
const fs = require('fs');
process.env.SKIP_VOICE_STORAGE = 'true';  // Storage not enabled yet
process.env.AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000/api/ai/chat';
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const axios = require('axios');
const FormData = require('form-data');
const jwt = require('jsonwebtoken');
const { app } = require(path.join(__dirname, '..', 'src', 'server'));

const CLIP = path.join(__dirname, '..', '..', 'ai-service', 'evals', 'voice_stt_audio', 'stt_he_shalom.webm');

let passed = 0, failed = 0;
const results = [];

const test = (name, ok, detail = '') => {
  if (ok) { passed++; results.push(`✅ ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; results.push(`❌ ${name}${detail ? ' — ' + detail : ''}`); }
};

const server = app.listen(0, async () => {
  const BASE = `http://127.0.0.1:${server.address().port}`;
  console.log(`🧪 FRESH TEST — Happy Path from Scratch (${BASE})\n`);

  try {
    // 1. LOGIN (dev user)
    console.log('1️⃣  Login / Auth');
    const loginResp = await axios.post(`${BASE}/api/auth/login`,
      { email: 'student', password: '123456' },
      { validateStatus: () => true });
    const token = loginResp.data?.token;
    test('Dev user login', loginResp.status === 200, `HTTP ${loginResp.status}`);
    test('Token received', Boolean(token));

    if (!token) {
      console.log('  Login failed. Dev credentials: email=student, password=123456');
      server.close();
      process.exit(1);
    }

    const authHeaders = { Authorization: `Bearer ${token}` };

    // 2. CREATE CHAT
    console.log('\n2️⃣  Text Chat');
    const createResp = await axios.post(`${BASE}/api/chat`, {},
      { headers: authHeaders, validateStatus: () => true });
    let chatId = createResp.data?.chat?.id || createResp.data?.chatId;
    test('Chat creation', createResp.status === 201 || createResp.status === 200, `HTTP ${createResp.status}`);
    test('Chat ID returned', Boolean(chatId), chatId ? chatId.slice(0, 8) + '...' : 'none');

    // 3. SEND TEXT MESSAGE
    const textMsg = await axios.post(`${BASE}/api/chat/${chatId || 'new'}/ai-message`,
      { text: 'שלום, מה שלומך?' },
      { headers: authHeaders, validateStatus: () => true }
    );
    test('Text message sent', textMsg.status === 200, `HTTP ${textMsg.status}`);
    test('AI text reply', Boolean(textMsg.data?.aiMessage?.text || textMsg.data?.aiMessage?.answerHe),
      textMsg.data?.aiMessage?.answerHe ? textMsg.data.aiMessage.answerHe.slice(0, 20) + '...' : 'empty');

    const actualChatId = chatId || textMsg.data?.chatId;

    // 4. VOICE MESSAGE
    console.log('\n3️⃣  Voice Chat');
    if (!fs.existsSync(CLIP)) {
      test('Voice clip exists', false, 'clip not found');
    } else {
      const form = new FormData();
      form.append('audio', fs.createReadStream(CLIP), { filename: 'voice.webm', contentType: 'audio/webm' });
      form.append('level', 'A1');

      const voiceResp = await axios.post(`${BASE}/api/chat/voice`, form, {
        headers: { ...authHeaders, ...form.getHeaders() },
        timeout: 45000,
        validateStatus: () => true,
      });

      test('Voice message sent', voiceResp.status === 200, `HTTP ${voiceResp.status}`);
      test('STT transcript', Boolean(voiceResp.data?.transcribedText), voiceResp.data?.transcribedText || 'none');
      test('Pronunciation score', typeof voiceResp.data?.pronunciationScore === 'number', voiceResp.data?.pronunciationScore);
      test('Voice reply', Boolean(voiceResp.data?.answerHe), voiceResp.data?.answerHe ? voiceResp.data.answerHe.slice(0, 20) : 'empty');

      const voiceChatId = voiceResp.data?.conversationId || actualChatId;

      // 5. PERSISTENCE
      console.log('\n4️⃣  Persistence & Reopen');
      const listResp = await axios.get(`${BASE}/api/chat/conversations`, { headers: authHeaders, validateStatus: () => true });
      test('Conversations list', listResp.status === 200 && Array.isArray(listResp.data), `HTTP ${listResp.status}`);

      if (voiceChatId) {
        const openResp = await axios.get(`${BASE}/api/chat/${voiceChatId}`, { headers: authHeaders, validateStatus: () => true });
        test('Reopen conversation', openResp.status === 200, `HTTP ${openResp.status}`);
        const messages = openResp.data?.messages || [];
        test('Messages persisted', messages.length > 0, `${messages.length} messages`);
        const hasVoice = messages.some(m => m.transcript || m.transcribedText);
        test('Voice transcript saved', hasVoice);
        const hasReply = messages.some(m => m.answerHe || m.answer);
        test('AI replies saved', hasReply);
      }
    }

    // 6. ERROR HANDLING
    console.log('\n5️⃣  Error Handling');
    const badAuth = await axios.post(`${BASE}/api/chat/voice`, {},
      { validateStatus: () => true }
    );
    test('Auth required', badAuth.status === 401 || badAuth.status === 400);

    const badMsg = await axios.post(`${BASE}/api/chat/fake-id/ai-message`,
      { text: 'test' },
      { headers: authHeaders, validateStatus: () => true }
    );
    test('Not found returns 404', badMsg.status === 404 || badMsg.status === 403);

  } catch (e) {
    results.push(`⚠️  Unexpected error: ${e.message}`);
  }

  // SUMMARY
  console.log('\n' + '='.repeat(56));
  results.forEach(r => console.log(r));
  console.log('='.repeat(56));

  const total = passed + failed;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

  console.log(`\n📊 COMPLETION: ${passed}/${total} tests passed = ${pct}%\n`);

  if (pct >= 95) console.log('🎉 Production Ready!');
  else if (pct >= 85) console.log('✨ Nearly there — minor polish needed.');
  else if (pct >= 70) console.log('⚙️  Core working — UX/testing gaps.');
  else console.log('🔨 Significant work ahead.');

  server.close();
  process.exit(pct >= 95 ? 0 : 1);
});

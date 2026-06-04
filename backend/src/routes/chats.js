const express = require('express');
const axios = require('axios');
const { pipeline } = require('node:stream/promises');

const router = express.Router();

const chatController = require('../controllers/chatController');

const { requireAuth } = require('../middleware/auth');
const { handleVoiceUpload } = require('../middleware/voiceUpload');
const { voiceRateLimit } = require('../middleware/voiceRateLimit');
const { createAiRequestConfig } = require('../services/aiChatService');

const AI_SERVICE_BASE = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const STREAM_TIMEOUT_MS = Number(
  process.env.AI_SERVICE_STREAM_TIMEOUT_MS || 60000
);

router.post(
  '/',
  requireAuth,
  chatController.createChat
);

router.post(
  '/preferences',
  requireAuth,
  chatController.saveChatPreferences
);

router.get(
  '/my',
  requireAuth,
  chatController.getMyChats
);

router.get(
  '/conversations',
  requireAuth,
  chatController.getMyChats
);

router.post(
  '/conversations/:id/archive',
  requireAuth,
  chatController.archiveConversation
);

router.get(
  '/:chatId',
  requireAuth,
  chatController.getChatById
);

router.post(
  '/:chatId/messages',
  requireAuth,
  chatController.addMessage
);

router.delete(
  '/:chatId',
  requireAuth,
  chatController.deleteChat
);

router.delete(
  '/:chatId',
  requireAuth,
  chatController.deleteChat
);

router.post(
  '/:chatId/ai-message',
  requireAuth,
  chatController.sendAiMessage
);

router.post(
  '/voice',
  requireAuth,
  voiceRateLimit,
  handleVoiceUpload,
  chatController.sendVoiceMessage
);

// ── SSE streaming proxy ───────────────────────────────────────────────────────
// Uses stream.pipeline() (not pipe()) so backpressure propagates upstream:
// if the client buffer fills, axios pauses reading from ai-service.
router.post('/:chatId/stream', requireAuth, async (req, res) => {
  let upstream;
  try {
    const { chatId } = req.params;
    const { text, level = 'A1', includeArabic = false } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required',
        code: 'MISSING_TEXT',
      });
    }

    const userToken = req.headers.authorization?.replace('Bearer ', '') || null;
    const config = createAiRequestConfig({
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...(userToken ? { 'Authorization': `Bearer ${userToken}` } : {}),
      },
      responseType: 'stream',
      timeout: STREAM_TIMEOUT_MS,
    });

    upstream = await axios.post(
      `${AI_SERVICE_BASE}/api/ai/chat/stream`,
      {
        message: text,
        level,
        includeArabic,
        sessionId: chatId,
        userId: req.user?.uid || undefined,
      },
      config
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Abort upstream if client disconnects (saves LLM tokens).
    req.on('close', () => {
      if (!res.writableEnded && upstream?.data?.destroy) {
        upstream.data.destroy();
      }
    });

    // pipeline() handles backpressure + cleanup automatically.
    await pipeline(upstream.data, res);
  } catch (error) {
    // If headers already sent, we can only write to the open SSE stream.
    if (res.headersSent && !res.writableEnded) {
      try {
        res.write('data: [ERROR]\n\n');
      } catch (_) { /* ignored */ }
      try { res.end(); } catch (_) { /* ignored */ }
      return;
    }
    if (!res.headersSent) {
      const status = error?.response?.status || 502;
      return res.status(status).json({
        success: false,
        error: 'Streaming failed',
        code: 'AI_STREAM_ERROR',
      });
    }
  } finally {
    if (upstream?.data?.destroy && !upstream.data.destroyed) {
      try { upstream.data.destroy(); } catch (_) { /* ignored */ }
    }
  }
});

// ── Pronunciation assessment proxy ────────────────────────────────────────────
router.post('/:chatId/pronunciation', requireAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { audioBase64, transcribedText, level = 'A1' } = req.body;

    if (!audioBase64 || !transcribedText) {
      return res.status(400).json({
        success: false,
        error: 'audioBase64 and transcribedText are required',
        code: 'MISSING_FIELDS',
      });
    }

    const userToken = req.headers.authorization?.replace('Bearer ', '') || null;
    const response = await axios.post(
      `${AI_SERVICE_BASE}/api/ai/pronunciation/assess`,
      { audioBase64, transcribedText, level, sessionId: chatId },
      createAiRequestConfig({
        headers: {
          'Content-Type': 'application/json',
          ...(userToken ? { 'Authorization': `Bearer ${userToken}` } : {}),
          ...(req.user?.uid ? { 'X-User-ID': req.user.uid } : {}),
        },
      })
    );
    return res.status(200).json(response.data);
  } catch (error) {
    const status = error?.response?.status || 502;
    return res.status(status).json({
      success: false,
      error: 'Pronunciation assessment failed',
      code: 'PRONUNCIATION_ERROR',
    });
  }
});

module.exports = router;

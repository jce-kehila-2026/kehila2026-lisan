const express = require('express');
const axios = require('axios');
const { pipeline } = require('node:stream/promises');

const router = express.Router();

const chatController = require('../controllers/chatController');

const { requireAuth } = require('../middleware/auth');
const { handleVoiceUpload } = require('../middleware/voiceUpload');
const { voiceRateLimit } = require('../middleware/voiceRateLimit');
const {
  createAiRequestConfig,
  normalizeAiServiceBaseUrl,
  synthesizeTextViaAi,
  transcribeAudioViaAi,
} = require('../services/aiChatService');

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

router.post(
  '/:chatId/review',
  requireAuth,
  chatController.submitChatReview
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

// STT-only proxy: audio -> { transcribedText }. Powers voice-edit (the
// student transcribes, reviews/edits the text, then sends it normally).
router.post(
  '/transcribe',
  requireAuth,
  voiceRateLimit,
  handleVoiceUpload,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Audio file is required',
          code: 'VOICE_FILE_REQUIRED',
        });
      }

      const userToken =
        req.headers.authorization?.replace('Bearer ', '') || null;

      const data = await transcribeAudioViaAi({
        audioBuffer: req.file.buffer,
        fileName: req.file.originalname || 'voice.webm',
        mimeType: req.file.mimetype,
        userId: req.user?.uid,
        userToken,
      });

      return res.status(200).json(data);
    } catch (error) {
      const status = error?.status || 502;
      return res.status(status).json({
        success: false,
        error: error?.message || 'Transcription failed',
        code: error?.code || 'AI_SERVICE_ERROR',
      });
    }
  }
);

// Text-to-speech proxy: text -> { audioBase64 }.
router.post('/tts', requireAuth, async (req, res) => {
  try {
    const text = typeof req.body?.text === 'string'
      ? req.body.text.trim()
      : '';

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required',
        code: 'MISSING_TEXT',
      });
    }

    const rawPronunciationScore = Number(req.body?.pronunciationScore);
    const pronunciationScore = Number.isFinite(rawPronunciationScore)
      ? rawPronunciationScore
      : null;
    const userToken = req.headers.authorization?.replace('Bearer ', '') || null;

    const data = await synthesizeTextViaAi({
      text,
      isFallback: req.body?.isFallback === true,
      pronunciationScore,
      userId: req.user?.uid,
      userToken,
    });

    return res.status(200).json(data);
  } catch (error) {
    const status = error?.status || 502;
    return res.status(status).json({
      success: false,
      error: error?.message || 'Text-to-speech failed',
      code: error?.code || 'AI_SERVICE_ERROR',
    });
  }
});

// SSE streaming proxy. Uses stream.pipeline() so backpressure propagates
// upstream: if the client buffer fills, axios pauses reading from ai-service.
router.post('/:chatId/stream', requireAuth, async (req, res) => {
  let upstream;

  try {
    const { chatId } = req.params;

    const {
      text,
      level = 'A1',
      includeArabic = false,
      scenario = null,
      activityTitle = null,
      activitySubtitle = null,
    } = req.body;

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
        Accept: 'text/event-stream',
        ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
      },
      responseType: 'stream',
      timeout: STREAM_TIMEOUT_MS,
    });

    upstream = await axios.post(
      `${normalizeAiServiceBaseUrl()}/api/ai/chat/stream`,
      {
        message: text,
        level,
        includeArabic,
        sessionId: chatId,
        userId: req.user?.uid || undefined,
        scenario: scenario || undefined,
        activityTitle: activityTitle || undefined,
        activitySubtitle: activitySubtitle || undefined,
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
      } catch (_) {
        /* ignored */
      }

      try {
        res.end();
      } catch (_) {
        /* ignored */
      }

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
      try {
        upstream.data.destroy();
      } catch (_) {
        /* ignored */
      }
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
      `${normalizeAiServiceBaseUrl()}/api/ai/pronunciation/assess`,
      { audioBase64, transcribedText, level, sessionId: chatId },
      createAiRequestConfig({
        headers: {
          'Content-Type': 'application/json',
          ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
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

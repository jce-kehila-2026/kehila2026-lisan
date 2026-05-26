'use strict';

/**
 * chatController.js
 *
 * Sprint 3 + 5: Full AI Gateway with Firestore persistence.
 *
 * POST /api/chat/
 *   - Validates input (message, level, includeArabic, optional conversationId)
 *   - Creates a new conversation OR verifies ownership of an existing one
 *   - Saves the user message to Firestore
 *   - Calls the FastAPI AI service (via aiChatService — URL + secret hidden from client)
 *   - Saves the assistant response with full metadata (latencyMs, fallbackUsed, etc.)
 *   - Updates the conversation document (lastMessageAt, lastMessagePreview, messageCount)
 *   - Returns the structured response to the React client
 *
 * GET  /api/chat/conversations           → list user's conversations (desc by updatedAt)
 * GET  /api/chat/conversations/:id       → get conversation + messages (asc by createdAt)
 * DELETE /api/chat/conversations/:id     → soft-delete conversation
 *
 * Security guarantees:
 *   - AI_SERVICE_URL and INTERNAL_API_SECRET never leave the server process
 *   - Every Firestore read/write is ownership-checked via chatPersistenceService
 *   - No raw prompts, API keys, or internal model names are stored in Firestore
 */

const axios = require('axios'); // kept for legacy chats.js helpers below

const { admin, db } = require('../config/firebase');

const {
  requestAiChat,
  requestAiVoice,
  buildBackendChatResponse,
  buildSafeChatFallback,
  AiServiceError,
  getAiServiceConfig,
} = require('../services/aiChatService');

const {
  uploadUserAudio,
  uploadAiAudio,
  AudioStorageError,
} = require('../services/audioStorageService');

const {
  createChatPersistenceService,
  ChatPersistenceError,
} = require('../services/chatPersistenceService');

// ── Singletons ────────────────────────────────────────────────────────────────
const persistence = createChatPersistenceService();

// ── Constants ─────────────────────────────────────────────────────────────────
const VALID_LEVELS   = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const MAX_MSG_LENGTH = 1_000;
const AI_TIMEOUT_MS  = 6_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function errBody(code, message) {
  return { success: false, code, error: message };
}

function mapPersistenceError(err, res) {
  if (err instanceof ChatPersistenceError) {
    return res.status(err.status).json(errBody(err.code, err.message));
  }
  console.error('[chatController] Unexpected persistence error:', err);
  return res.status(500).json(errBody('INTERNAL_ERROR', 'Unexpected server error.'));
}

// ══════════════════════════════════════════════════════════════════════════════
// postChat  (Sprint 3 + 5)
// ══════════════════════════════════════════════════════════════════════════════

exports.postChat = async (req, res) => {
  const userId = req.user.uid;

  // ── 1. Validate input ──────────────────────────────────────────────────────

  const {
    message,
    level,
    includeArabic    = false,
    conversationId   = null,
    clientMessageId  = null,
  } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json(errBody('VALIDATION_ERROR', '"message" is required and must be a non-empty string.'));
  }
  if (message.trim().length > MAX_MSG_LENGTH) {
    return res.status(400).json(errBody('VALIDATION_ERROR', `"message" must not exceed ${MAX_MSG_LENGTH} characters.`));
  }
  if (!level || typeof level !== 'string') {
    return res.status(400).json(errBody('VALIDATION_ERROR', '"level" is required.'));
  }
  if (!VALID_LEVELS.has(level)) {
    return res.status(422).json(errBody('INVALID_LEVEL', `"level" must be one of: ${[...VALID_LEVELS].join(', ')}.`));
  }
  if (typeof includeArabic !== 'boolean') {
    return res.status(400).json(errBody('VALIDATION_ERROR', '"includeArabic" must be a boolean.'));
  }

  const trimmedMessage = message.trim();

  // ── 2. Create or load conversation (ownership check included) ──────────────

  let conversation;
  try {
    conversation = await persistence.createOrLoadConversation({
      conversationId,
      userId,
      level,
      initialMessageText: trimmedMessage,
    });
  } catch (err) {
    return mapPersistenceError(err, res);
  }

  // ── 3. Save user message ───────────────────────────────────────────────────

  let userMessageRecord;
  try {
    userMessageRecord = await persistence.saveUserMessage({
      conversationId: conversation.id,
      userId,
      rawText: trimmedMessage,
      clientMessageId,
    });
  } catch (err) {
    return mapPersistenceError(err, res);
  }

  // ── 4. Call AI service ─────────────────────────────────────────────────────

  let aiRaw;
  try {
    aiRaw = await requestAiChat(
      { message: trimmedMessage, level, includeArabic },
      { config: { ...getAiServiceConfig(), timeoutMs: AI_TIMEOUT_MS } }
    );
  } catch (err) {
    if (err instanceof AiServiceError) {
      // Save a fallback assistant message so the user message is not orphaned
      const fallbackReason = err.code === 'AI_SERVICE_TIMEOUT' ? 'MODEL_TIMEOUT' : 'SERVICE_UNAVAILABLE';
      const fallbackResponse = buildSafeChatFallback({ fallbackReason, level });
      try {
        await persistence.saveAssistantMessage({
          conversationId: conversation.id,
          userId,
          response: fallbackResponse,
        });
      } catch (_) { /* non-fatal */ }

      if (err.code === 'AI_SERVICE_TIMEOUT') {
        return res.status(408).json(errBody('AI_TIMEOUT', 'AI service did not respond in time. Please try again.'));
      }
      return res.status(503).json(errBody(err.code, err.message));
    }
    console.error('[chatController.postChat] Unexpected AI error:', err);
    return res.status(500).json(errBody('INTERNAL_ERROR', 'Unexpected server error.'));
  }

  // ── 5. Save assistant message (with metadata — no raw prompts stored) ──────

  let assistantMessageRecord;
  try {
    assistantMessageRecord = await persistence.saveAssistantMessage({
      conversationId: conversation.id,
      userId,
      response: aiRaw,          // answerHe, answerAr, fallbackUsed, fallbackReason,
                                 // latencyMs, cacheHit, routerHit — all safe metadata
    });
  } catch (err) {
    // Non-fatal: AI response is ready; log the persistence failure and continue
    console.error('[chatController.postChat] Failed to save assistant message:', err);
  }

  // ── 6. Build and return response to client ─────────────────────────────────

  const payload = buildBackendChatResponse(aiRaw, {
    conversationId:       conversation.id,
    messageId:            assistantMessageRecord?.id || null,
    suggestedNextPrompts: aiRaw.suggestedNextPrompts || [],
  });

  return res.status(200).json(payload);
};

// ══════════════════════════════════════════════════════════════════════════════
// createPostChatHandler  — dependency-injectable factory (used by tests)
//
// Accepts the same options bag as the production singletons but allows callers
// (e.g. unit tests) to inject mock implementations:
//   {
//     db                    — Firestore-compatible db (used to fetch user level)
//     chatPersistenceService — mock or real persistence
//     requestAiChat          — mock or real AI call
//   }
// Returns an Express request handler with the same behaviour as postChat.
// ══════════════════════════════════════════════════════════════════════════════

const DEFAULT_SUGGESTIONS = [
  'מה השם שלך?',
  'איך אומרים תודה?',
  'אני רוצה לתרגל משפט קצר.',
  'אפשר הסבר בערבית?',
];

exports.createPostChatHandler = function createPostChatHandler(options = {}) {
  const injectedPersistence   = options.chatPersistenceService || persistence;
  const injectedRequestAiChat = options.requestAiChat          || requestAiChat;
  const injectedDb            = options.db                     || db;

  return async function postChatHandler(req, res) {
    const userId = req.user.uid;

    // ── 1. Validate input ────────────────────────────────────────────────────
    const {
      message,
      includeArabic   = false,
      conversationId  = null,
      clientMessageId = null,
    } = req.body;

    const errors = [];
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      errors.push('message is required');
    } else if (message.trim().length > MAX_MSG_LENGTH) {
      errors.push(`message must not exceed ${MAX_MSG_LENGTH} characters`);
    }
    if (errors.length) {
      return res.status(400).json({ error: 'Invalid chat request', details: errors });
    }
    if (typeof includeArabic !== 'boolean') {
      return res.status(400).json({ error: 'Invalid chat request', details: ['"includeArabic" must be a boolean'] });
    }

    const trimmedMessage = message.trim();

    // ── 2. Resolve user level (from db or request body) ──────────────────────
    let level = req.body.level || 'A1';
    try {
      const userDoc = await injectedDb.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData?.level) level = userData.level;
      }
    } catch (_) {
      // non-fatal — fall back to request body level
    }

    if (!VALID_LEVELS.has(level)) {
      return res.status(422).json({ error: 'Invalid chat request', details: [`"level" must be one of: ${[...VALID_LEVELS].join(', ')}`] });
    }

    // ── 3. Create or load conversation ───────────────────────────────────────
    let conversation;
    try {
      conversation = await injectedPersistence.createOrLoadConversation({
        conversationId,
        userId,
        level,
        initialMessageText: trimmedMessage,
      });
    } catch (err) {
      return mapPersistenceError(err, res);
    }

    // ── 4. Save user message ─────────────────────────────────────────────────
    try {
      await injectedPersistence.saveUserMessage({
        conversationId: conversation.id,
        userId,
        rawText: trimmedMessage,
        clientMessageId,
      });
    } catch (err) {
      return mapPersistenceError(err, res);
    }

    // ── 5. Call AI service ───────────────────────────────────────────────────
    let aiRaw;
    try {
      aiRaw = await injectedRequestAiChat(
        { message: trimmedMessage, level, includeArabic },
        { config: { ...getAiServiceConfig(), timeoutMs: AI_TIMEOUT_MS } },
      );
    } catch (err) {
      if (err instanceof AiServiceError) {
        // Timeout → graceful fallback (200) instead of hard error
        const fallbackReason = err.code === 'AI_SERVICE_TIMEOUT' ? 'MODEL_TIMEOUT' : 'SERVICE_UNAVAILABLE';
        const fallbackResponse = buildSafeChatFallback({ fallbackReason, level });

        let assistantRecord;
        try {
          assistantRecord = await injectedPersistence.saveAssistantMessage({
            conversationId: conversation.id,
            userId,
            response: fallbackResponse,
          });
        } catch (_) {}

        return res.status(200).json({
          ...fallbackResponse,
          conversationId: conversation.id,
          messageId:      assistantRecord?.id || null,
          suggestedNextPrompts: DEFAULT_SUGGESTIONS,
        });
      }
      console.error('[createPostChatHandler] Unexpected AI error:', err);
      return res.status(500).json(errBody('INTERNAL_ERROR', 'Unexpected server error.'));
    }

    // ── 6. Save assistant message ────────────────────────────────────────────
    let assistantMessageRecord;
    try {
      assistantMessageRecord = await injectedPersistence.saveAssistantMessage({
        conversationId: conversation.id,
        userId,
        response: aiRaw,
      });
    } catch (err) {
      console.error('[createPostChatHandler] Failed to save assistant message:', err);
    }

    // ── 7. Build response ────────────────────────────────────────────────────
    const suggestions = Array.isArray(aiRaw.suggestedNextPrompts) && aiRaw.suggestedNextPrompts.length
      ? aiRaw.suggestedNextPrompts
      : DEFAULT_SUGGESTIONS;

    const payload = buildBackendChatResponse(aiRaw, {
      conversationId:       conversation.id,
      messageId:            assistantMessageRecord?.id || null,
      suggestedNextPrompts: suggestions,
    });

    return res.status(200).json(payload);
  };
};

// ══════════════════════════════════════════════════════════════════════════════
// createConversationControllerHelpers — DI factory for list/get/delete handlers
// ══════════════════════════════════════════════════════════════════════════════

exports.createConversationControllerHelpers = function createConversationControllerHelpers(options = {}) {
  const injectedPersistence = options.chatPersistenceService || persistence;

  return {
    listConversations: async (req, res) => {
      const userId = req.user.uid;
      try {
        const conversations = await injectedPersistence.listConversations({ userId });
        return res.status(200).json({ success: true, conversations });
      } catch (err) {
        return mapPersistenceError(err, res);
      }
    },

    getConversation: async (req, res) => {
      const userId = req.user.uid;
      const { conversationId } = req.params;
      if (!conversationId) {
        return res.status(400).json(errBody('VALIDATION_ERROR', '"conversationId" param is required.'));
      }
      try {
        const { conversation, messages } = await injectedPersistence.getConversationWithMessages({ conversationId, userId });
        return res.status(200).json({ success: true, conversation, messages });
      } catch (err) {
        return mapPersistenceError(err, res);
      }
    },

    deleteConversation: async (req, res) => {
      const userId = req.user.uid;
      const { conversationId } = req.params;
      if (!conversationId) {
        return res.status(400).json(errBody('VALIDATION_ERROR', '"conversationId" param is required.'));
      }
      try {
        const result = await injectedPersistence.softDeleteConversation({ conversationId, userId });
        return res.status(200).json({ success: true, id: result.id });
      } catch (err) {
        return mapPersistenceError(err, res);
      }
    },
  };
};

// ══════════════════════════════════════════════════════════════════════════════
// postVoiceChat  (Sprint Voice — Task 2)  POST /api/chat/voice
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Accepts a multipart/form-data request with:
 *   - audio  (file)    — required
 *   - level  (string)  — optional, default "A1"
 *   - includeArabic (bool string) — optional, default false
 *   - conversationId (string) — optional, attaches to existing conversation
 *
 * Flow:
 *   multer (MemoryStorage) → requireAuth → chatPostRateLimit
 *   → validate file present
 *   → create/load conversation
 *   → forward audio Buffer to AI service via requestAiVoice
 *   → save user message (transcribedText) + assistant message to Firestore
 *   → return voice response to client
 */
exports.postVoiceChat = async (req, res) => {
  const userId = req.user.uid;

  // ── 1. Validate uploaded file ──────────────────────────────────────────────
  if (!req.file) {
    return res.status(400).json(errBody('VALIDATION_ERROR', 'No audio file uploaded. Send a file field named "audio".'));
  }

  const audioBuffer   = req.file.buffer;
  const originalname  = req.file.originalname || 'audio.webm';
  const mimetype      = req.file.mimetype      || 'audio/webm';

  // ── 2. Parse form fields ───────────────────────────────────────────────────
  const rawLevel        = (req.body.level || 'A1').trim().toUpperCase();
  const level           = VALID_LEVELS.has(rawLevel) ? rawLevel : 'A1';
  const includeArabic   = req.body.includeArabic === 'true';
  const conversationId  = req.body.conversationId || null;

  // ── 3. Create or load conversation ────────────────────────────────────────
  let conversation;
  try {
    conversation = await persistence.createOrLoadConversation({
      conversationId,
      userId,
      level,
      initialMessageText: '[voice message]',
    });
  } catch (err) {
    return mapPersistenceError(err, res);
  }

  // ── 4. Forward audio to AI service ────────────────────────────────────────
  let aiRaw;
  try {
    aiRaw = await requestAiVoice(
      { audioBuffer, originalname, mimetype, level, includeArabic },
      { config: { ...getAiServiceConfig(), timeoutMs: getAiServiceConfig().voiceTimeoutMs } },
    );
  } catch (err) {
    if (err instanceof AiServiceError) {
      if (err.code === 'AI_SERVICE_TIMEOUT') {
        return res.status(408).json(errBody('AI_TIMEOUT', 'Voice AI service did not respond in time. Please try again.'));
      }
      return res.status(503).json(errBody(err.code, err.message));
    }
    console.error('[chatController.postVoiceChat] Unexpected AI error:', err);
    return res.status(500).json(errBody('INTERNAL_ERROR', 'Unexpected server error.'));
  }

  const userText = aiRaw.transcribedText || '[voice message]';

  // ── 5. Upload user audio to Cloud Storage (non-fatal) ─────────────────────
  let audioUrlUser = null;
  try {
    audioUrlUser = await uploadUserAudio({
      buffer:         audioBuffer,
      mimeType:       mimetype,
      userId,
      conversationId: conversation.id,
      messageId:      `tmp_${Date.now()}`,   // placeholder — refined below after saveUserMessage
    });
  } catch (err) {
    if (err instanceof AudioStorageError && err.code === 'STORAGE_NOT_CONFIGURED') {
      // Storage not set up in this environment — skip silently
    } else {
      console.error('[chatController.postVoiceChat] User audio upload failed:', err);
    }
  }

  // ── 6. Save user message with audio URL ───────────────────────────────────
  try {
    await persistence.saveUserMessage({
      conversationId: conversation.id,
      userId,
      rawText:      userText,
      clientMessageId: null,
      audioUrlUser,
    });
  } catch (err) {
    console.error('[chatController.postVoiceChat] Failed to save user voice message:', err);
    // non-fatal — continue
  }

  // ── 7. Upload AI audio to Cloud Storage (non-fatal) ───────────────────────
  let audioUrlAssistant = null;
  if (aiRaw.audioBase64) {
    try {
      audioUrlAssistant = await uploadAiAudio({
        audioBase64:    aiRaw.audioBase64,
        userId,
        conversationId: conversation.id,
        messageId:      `ai_${Date.now()}`,
      });
    } catch (err) {
      if (err instanceof AudioStorageError && err.code === 'STORAGE_NOT_CONFIGURED') {
        // skip silently
      } else {
        console.error('[chatController.postVoiceChat] AI audio upload failed:', err);
      }
    }
  }

  // ── 8. Save assistant message with audio URL ──────────────────────────────
  let assistantMessageRecord;
  try {
    assistantMessageRecord = await persistence.saveAssistantMessage({
      conversationId: conversation.id,
      userId,
      response: aiRaw,
      audioUrlAssistant,
    });
  } catch (err) {
    console.error('[chatController.postVoiceChat] Failed to save assistant message:', err);
  }

  // ── 9. Return response to client ──────────────────────────────────────────
  return res.status(200).json({
    success: true,
    conversationId:       conversation.id,
    messageId:            assistantMessageRecord?.id || null,
    answerHe:             aiRaw.answerHe,
    answerAr:             aiRaw.answerAr      || null,
    audioBase64:          aiRaw.audioBase64   || null,
    audioUrlAssistant,                              // Cloud Storage URL (if uploaded)
    fallbackUsed:         aiRaw.fallbackUsed,
    fallbackReason:       aiRaw.fallbackReason || null,
    level:                aiRaw.level          || level,
    latencyMs:            aiRaw.latencyMs,
    transcribedText:      aiRaw.transcribedText || null,
    suggestedNextPrompts: aiRaw.suggestedNextPrompts || [],
  });
};

// ══════════════════════════════════════════════════════════════════════════════
// listConversations  (Sprint 5)  GET /api/chat/conversations
// ══════════════════════════════════════════════════════════════════════════════

exports.listConversations = async (req, res) => {
  const userId = req.user.uid;

  try {
    const conversations = await persistence.listConversations({ userId });
    // listConversations returns sorted desc by updatedAt, soft-deletes already filtered
    return res.status(200).json({ success: true, conversations });
  } catch (err) {
    return mapPersistenceError(err, res);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// getConversation  (Sprint 5)  GET /api/chat/conversations/:conversationId
// ══════════════════════════════════════════════════════════════════════════════

exports.getConversation = async (req, res) => {
  const userId         = req.user.uid;
  const { conversationId } = req.params;

  if (!conversationId) {
    return res.status(400).json(errBody('VALIDATION_ERROR', '"conversationId" param is required.'));
  }

  try {
    const { conversation, messages } = await persistence.getConversationWithMessages({
      conversationId,
      userId,
    });
    // messages are sorted asc by createdAt inside the service
    return res.status(200).json({ success: true, conversation, messages });
  } catch (err) {
    return mapPersistenceError(err, res);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// deleteConversation  (Sprint 5)  DELETE /api/chat/conversations/:conversationId
// ══════════════════════════════════════════════════════════════════════════════

exports.deleteConversation = async (req, res) => {
  const userId             = req.user.uid;
  const { conversationId } = req.params;

  if (!conversationId) {
    return res.status(400).json(errBody('VALIDATION_ERROR', '"conversationId" param is required.'));
  }

  try {
    const result = await persistence.softDeleteConversation({ conversationId, userId });
    return res.status(200).json({ success: true, id: result.id });
  } catch (err) {
    return mapPersistenceError(err, res);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// Legacy helpers preserved for chats.js router (Sprint 0 code)
// ══════════════════════════════════════════════════════════════════════════════

const AI_SERVICE_URL = 'http://localhost:8000/api/ai/chat';

exports.createChat = async (req, res) => {
  try {
    const { title, level } = req.body;

    const userId = req.user.uid;

    const chatData = {
      userId,
      title: title || 'New Chat',
      level: level || 'A1',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      messages: []
    };

    const docRef = await db
      .collection('chatSessions')
      .add(chatData);

    return res.status(201).json({
      success: true,
      chat: {
        id: docRef.id,
        userId,
        title: chatData.title,
        level: chatData.level,
        messages: [],
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Create chat error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.getMyChats = async (req, res) => {
  try {
    const userId = req.user.uid;

    const snapshot = await db
      .collection('chatSessions')
      .where('userId', '==', userId)
      .get();

    const chats = [];

    snapshot.forEach(doc => {
      const data = doc.data();

      chats.push({
        id: doc.id,
        userId: data.userId,
        title: data.title,
        level: data.level,
        startedAt: data.startedAt || null,
        updatedAt: data.updatedAt || null,
        messages: data.messages || [],
        messagesCount: data.messages ? data.messages.length : 0
      });
    });

    return res.status(200).json({
      success: true,
      chats
    });
  } catch (error) {
    console.error('Get my chats error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.getChatById = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { chatId } = req.params;

    const chatDoc = await db
      .collection('chatSessions')
      .doc(chatId)
      .get();

    if (!chatDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found',
        code: 'CHAT_NOT_FOUND'
      });
    }

    const chat = chatDoc.data();

    if (chat.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    return res.status(200).json({
      success: true,
      chat: {
        id: chatDoc.id,
        ...chat
      }
    });
  } catch (error) {
    console.error('Get chat by id error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.sendAiMessage = async (req, res) => {
  try {
    const userId = req.user.uid;

    const { chatId } = req.params;

    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required',
        code: 'MISSING_TEXT'
      });
    }

    const chatRef = db
      .collection('chatSessions')
      .doc(chatId);

    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found',
        code: 'CHAT_NOT_FOUND'
      });
    }

    const chat = chatDoc.data();

    if (chat.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    // حفظ رسالة المستخدم
    const userMessage = {
      sender: 'user',
      text,
      createdAt: new Date().toISOString()
    };

    await chatRef.update({
      messages: admin.firestore.FieldValue.arrayUnion(userMessage),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // إرسال الرسالة للـ AI service
    const aiResponse = await axios.post(AI_SERVICE_URL, {
      message: text,
      level: chat.level || 'A1',
      includeArabic: false
    });

    const aiText =
      aiResponse.data?.answerHe ||
      'אני מבין. בוא נמשיך לתרגל.';

    // حفظ رد الـ AI
    const aiMessage = {
      sender: 'ai',
      text: aiText,
      createdAt: new Date().toISOString()
    };

    await chatRef.update({
      messages: admin.firestore.FieldValue.arrayUnion(aiMessage),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      success: true,
      userMessage,
      aiMessage
    });
  } catch (error) {
    console.error('AI message error:', error);

    return res.status(500).json({
      success: false,
      error: 'AI service failed',
      code: 'AI_SERVICE_ERROR'
    });
  }
};

exports.addMessage = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { chatId } = req.params;
    const { sender, text } = req.body;

    if (!sender || !text) {
      return res.status(400).json({
        success: false,
        error: 'sender and text are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    const allowedSenders = ['user', 'ai'];

    if (!allowedSenders.includes(sender)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sender',
        code: 'INVALID_SENDER'
      });
    }

    const chatRef = db
      .collection('chatSessions')
      .doc(chatId);

    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found',
        code: 'CHAT_NOT_FOUND'
      });
    }

    const chat = chatDoc.data();

    if (chat.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    const message = {
      sender,
      text,
      createdAt: new Date().toISOString()
    };

    await chatRef.update({
      messages: admin.firestore.FieldValue.arrayUnion(message),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(201).json({
      success: true,
      message
    });
  } catch (error) {
    console.error('Add message error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.deleteChat = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { chatId } = req.params;

    const chatRef = db
      .collection('chatSessions')
      .doc(chatId);

    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found',
        code: 'CHAT_NOT_FOUND'
      });
    }

    const chat = chatDoc.data();

    if (chat.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    await chatRef.delete();

    return res.status(200).json({
      success: true,
      message: 'Chat deleted successfully'
    });
  } catch (error) {
    console.error('Delete chat error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};
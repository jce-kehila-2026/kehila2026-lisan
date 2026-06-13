const { admin, db } = require('../config/firebase');
const {
  VOICE_UPLOAD_MAX_BYTES,
} = require('../middleware/voiceUpload');
const {
  sendChatMessageToAi,
  sendVoiceMessageToAi,
} = require('../services/aiChatService');
const {
  applyAutoTitleToChatIfNeeded,
  createChatSession,
  DEFAULT_CHAT_TITLE,
  DEFAULT_VOICE_CHAT_TITLE,
  uploadStudentVoiceAudio,
} = require('../services/chatPersistenceService');
const { logger, toErrorPayload, hashUserId } = require('../lib/logger');

const AI_VOICE_FAILURE_MESSAGE = 'אוי, יש בעיה. נסו שוב מאוחר יותר.';

function shouldStoreVoiceAudio() {
  return String(process.env.STORE_VOICE_AUDIO || '').trim() === 'true';
}

exports.createChat = async (req, res) => {
  try {
    const { title, scenario } = req.body;

    const userId = req.user.uid;
    const userPreferences = await getUserChatPreferences(userId);
    const effectiveLevel = await resolveEffectiveUserLevel(req);
    const { chatId, chat } = await createChatSession({
      userId,
      level: effectiveLevel,
      title,
      defaultIncludeArabic: userPreferences.defaultIncludeArabic,
      defaultTitle: DEFAULT_CHAT_TITLE,
      scenario,
    });

    return res.status(201).json({
      success: true,
      chat: {
        id: chatId,
        userId,
        title: chat.title,
        level: chat.level,
        defaultIncludeArabic: chat.defaultIncludeArabic === true,
        scenario: chat.scenario || null,
        messages: [],
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logChatError('create_chat_failed', error, {
      userId: req.user?.uid || null,
    });

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.getMyChats = async (req, res) => {
  const includeArchived = parseBooleanFlag(req.query?.includeArchived);

  try {
    const userId = req.user.uid;

    const snapshot = await db
      .collection('chatSessions')
      .where('userId', '==', userId)
      .get();

    const chats = [];

    snapshot.forEach(doc => {
      const data = doc.data();

      if (!includeArchived && data.isArchived === true) {
        return;
      }

      chats.push({
        id: doc.id,
        userId: data.userId,
        title: data.title,
        level: data.level,
        isArchived: data.isArchived === true,
        archivedAt: data.archivedAt || null,
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
    logChatError('get_my_chats_failed', error, {
      userId: req.user?.uid || null,
      includeArchived,
    });

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
    logChatError('get_chat_by_id_failed', error, {
      userId: req.user?.uid || null,
      conversationId: req.params?.chatId || null,
    });

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.sendAiMessage = async (req, res) => {
  const normalizedClientMessageId = normalizeOptionalString(req.body?.clientMessageId);

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
    const existingTextMessagePair = normalizedClientMessageId
      ? findStoredMessagePairByClientMessageId(chat.messages, normalizedClientMessageId)
      : null;

    if (existingTextMessagePair?.userMessage && existingTextMessagePair?.assistantMessage) {
      return res.status(200).json({
        success: true,
        userMessage: existingTextMessagePair.userMessage,
        aiMessage: existingTextMessagePair.assistantMessage,
        deduplicated: true,
      });
    }

    const userMessage = {
      sender: 'user',
      text,
      clientMessageId: normalizedClientMessageId,
      createdAt: new Date().toISOString()
    };

    await applyAutoTitleToChatIfNeeded({
      chatRef,
      chat,
      firstUserMessageText: text,
      fallbackTitle: DEFAULT_CHAT_TITLE,
    });

    if (!existingTextMessagePair?.userMessage) {
      await chatRef.update({
        messages: admin.firestore.FieldValue.arrayUnion(userMessage),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    const userToken = req.headers.authorization?.replace('Bearer ', '') || null;
    const aiResponse = await sendChatMessageToAi({
      message: text,
      level: chat.level || 'A1',
      includeArabic: chat.defaultIncludeArabic === true,
      userId,
      sessionId: chatId,
      userToken,
      scenario: chat.scenario || null,
    });


    const aiText =
      aiResponse?.answerHe ||
      'אני מבין. בוא נמשיך לתרגל.';

    // حفظ رد الـ AI
    const aiMessage = {
      sender: 'ai',
      text: aiText,
      replyToClientMessageId: normalizedClientMessageId,
      createdAt: new Date().toISOString()
    };

    await chatRef.update({
      messages: admin.firestore.FieldValue.arrayUnion(aiMessage),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const inputTokens = aiResponse?.inputTokens || 0;
    const outputTokens = aiResponse?.outputTokens || 0;
    if (inputTokens > 0 || outputTokens > 0) {
      await db.collection('tokenUsage').add({
        userId,
        chatId,
        inputTokens,
        outputTokens,
        provider: aiResponse?.provider || null,
        model: aiResponse?.model || null,
        type: 'text',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return res.status(200).json({
      success: true,
      userMessage,
      aiMessage,
      answerAr: aiResponse?.answerAr || null,
      suggestedNextPrompts: aiResponse?.suggestedNextPrompts || [],
      cacheHit: aiResponse?.cacheHit === true,
      routerHit: aiResponse?.routerHit === true,
      contextChunkIds: aiResponse?.contextChunkIds || [],
      fallbackUsed: aiResponse?.fallbackUsed === true,
      fallbackReason: aiResponse?.fallbackReason || null,
    });
  } catch (error) {
    logChatError('send_ai_message_failed', error, {
      userId: req.user?.uid || null,
      conversationId: req.params?.chatId || null,
      clientMessageId: normalizedClientMessageId,
    });

    return res.status(error.status || 500).json({
      success: false,
      error: error.message || 'AI service failed',
      code: error.code || 'AI_SERVICE_ERROR'
    });
  }
};

exports.archiveConversation = async (req, res) => {
  try {
    const userId = req.user.uid;
    const conversationId = normalizeOptionalString(req.params?.id);

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        error: 'Conversation id is required',
        code: 'MISSING_CONVERSATION_ID'
      });
    }

    const chatRef = db.collection('chatSessions').doc(conversationId);
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

    if (chat.isArchived === true) {
      return res.status(200).json({
        success: true,
        archived: true,
        conversationId,
      });
    }

    const archivedAt = new Date().toISOString();

    await chatRef.update({
      isArchived: true,
      archivedAt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true,
      archived: true,
      conversationId,
      archivedAt,
    });
  } catch (error) {
    logChatError('archive_conversation_failed', error, {
      userId: req.user?.uid || null,
      conversationId: req.params?.id || null,
    });

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.saveChatPreferences = async (req, res) => {
  try {
    const userId = req.user.uid;
    const defaultIncludeArabic = parseBooleanFlag(req.body?.defaultIncludeArabic);

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    await userRef.update({
      chatPreferences: {
        ...(userDoc.data()?.chatPreferences || {}),
        defaultIncludeArabic,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true,
      preferences: {
        defaultIncludeArabic,
      }
    });
  } catch (error) {
    logChatError('save_chat_preferences_failed', error, {
      userId: req.user?.uid || null,
    });

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.sendVoiceMessage = async (req, res) => {
  let chatId = null;
  let chatRef = null;
  let chat = null;
  let uploadedAudio = null;
  let normalizedLevel = 'A1';
  let normalizedClientMessageId = null;
  let includeArabic = false;
  let audioFile = null;
  let existingVoiceMessagePair = null;

  try {
    const userId = req.user.uid;
    const {
      conversationId = null,
      level = 'A1',
      clientMessageId = null,
    } = req.body || {};
    audioFile = req.file;

    if (!audioFile) {
      return res.status(400).json({
        success: false,
        error: 'Audio file is required',
        code: 'VOICE_FILE_REQUIRED'
      });
    }

    if (!audioFile.buffer || audioFile.size <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Audio file is empty',
        code: 'VOICE_FILE_EMPTY'
      });
    }

    if (audioFile.size > VOICE_UPLOAD_MAX_BYTES) {
      return res.status(413).json({
        success: false,
        error: 'Audio file is too large',
        code: 'VOICE_FILE_TOO_LARGE'
      });
    }

    const normalizedConversationId = normalizeOptionalString(conversationId);
    normalizedClientMessageId = normalizeOptionalString(clientMessageId);
    normalizedLevel = normalizedConversationId
      ? normalizeOptionalString(level) || 'A1'
      : await resolveEffectiveUserLevel(req);
    ({ chatId, chatRef, chat } = await ensureVoiceConversation({
      userId,
      conversationId: normalizedConversationId,
      level: normalizedLevel,
    }));
    includeArabic = resolveIncludeArabicPreference(
      req.body?.includeArabic,
      chat?.defaultIncludeArabic === true
    );

    existingVoiceMessagePair = normalizedClientMessageId
      ? findStoredMessagePairByClientMessageId(chat.messages, normalizedClientMessageId)
      : null;

    if (existingVoiceMessagePair?.userMessage && existingVoiceMessagePair?.assistantMessage) {
      return res.status(200).json(
        buildVoiceIdempotentResponse({
          chatId,
          userMessage: existingVoiceMessagePair.userMessage,
          assistantMessage: existingVoiceMessagePair.assistantMessage,
        })
      );
    }

    if (existingVoiceMessagePair?.userMessage?.audioUrl) {
      uploadedAudio = {
        audioUrl: existingVoiceMessagePair.userMessage.audioUrl,
      };
    } else if (shouldStoreVoiceAudio()) {
      uploadedAudio = await uploadStudentVoiceAudio({
        userId,
        conversationId: chatId,
        audioBuffer: audioFile.buffer,
        fileName: audioFile.originalname || 'voice-message.webm',
        mimeType: audioFile.mimetype,
      });
    }

    req.voiceRequest = {
      userId: req.user?.uid || null,
      conversationId: chatId,
      clientMessageId: normalizedClientMessageId,
      level: normalizedLevel,
      includeArabic,
      audio: {
        fieldName: audioFile.fieldname,
        originalName: audioFile.originalname,
        mimeType: audioFile.mimetype,
        size: audioFile.size,
        audioUrl: uploadedAudio?.audioUrl || null,
      }
    };

    const userToken = req.headers.authorization?.replace('Bearer ', '') || null;
    const aiVoiceResponse = await sendVoiceMessageToAi({
      audioBuffer: audioFile.buffer,
      fileName: audioFile.originalname || 'voice-message.webm',
      mimeType: audioFile.mimetype,
      level: normalizedLevel,
      includeArabic,
      userId,
      sessionId: chatId,
      userToken,
    });


    const userVoiceMessage = {
      sender: 'user',
      type: 'voice',
      text: aiVoiceResponse?.transcribedText || null,
      clientMessageId: normalizedClientMessageId,
      audioUrl: uploadedAudio?.audioUrl || null,
      transcribedText: aiVoiceResponse?.transcribedText || null,
      fallbackUsed: false,
      fallbackReason: null,
      audioStored: Boolean(uploadedAudio?.audioUrl),
      createdAt: new Date().toISOString(),
    };

    const assistantVoiceMessage = {
      sender: 'ai',
      type: 'voice',
      text: aiVoiceResponse?.answerHe || '',
      replyToClientMessageId: normalizedClientMessageId,
      audioUrl: null,
      transcribedText: aiVoiceResponse?.transcribedText || null,
      fallbackUsed: aiVoiceResponse?.fallbackUsed === true,
      fallbackReason: aiVoiceResponse?.fallbackReason || null,
      createdAt: new Date().toISOString(),
    };

    if (aiVoiceResponse?.transcribedText) {
      await applyAutoTitleToChatIfNeeded({
        chatRef,
        chat,
        firstUserMessageText: aiVoiceResponse.transcribedText,
        fallbackTitle: DEFAULT_VOICE_CHAT_TITLE,
      });
    }

    const messagesToPersist = existingVoiceMessagePair?.userMessage
      ? [assistantVoiceMessage]
      : [userVoiceMessage, assistantVoiceMessage];

    await chatRef.update({
      messages: admin.firestore.FieldValue.arrayUnion(...messagesToPersist),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const inputTokens = aiVoiceResponse?.inputTokens || 0;
    const outputTokens = aiVoiceResponse?.outputTokens || 0;
    if (inputTokens > 0 || outputTokens > 0) {
      await db.collection('tokenUsage').add({
        userId,
        chatId,
        inputTokens,
        outputTokens,
        provider: aiVoiceResponse?.provider || null,
        model: aiVoiceResponse?.model || null,
        type: 'voice',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return res.status(200).json({
      ...aiVoiceResponse,
      conversationId: chatId,
      audioUrl: uploadedAudio?.audioUrl || null,
      audioStored: Boolean(uploadedAudio?.audioUrl),
      pronunciationScore: aiVoiceResponse?.pronunciationScore ?? null,
      ssmlText: aiVoiceResponse?.ssmlText ?? null,
      suggestedNextPrompts: aiVoiceResponse?.suggestedNextPrompts || [],
    });
  } catch (error) {
    logChatError('send_voice_message_failed', error, {
      userId: req.user?.uid || null,
      conversationId: chatId,
      clientMessageId: normalizedClientMessageId,
    });

    if (chatRef && audioFile) {
      try {
        await persistFailedVoiceAttempt({
          chatRef,
          uploadedAudio,
          audioFile,
          clientMessageId: normalizedClientMessageId,
          existingUserMessage: existingVoiceMessagePair?.userMessage || null,
          fallbackReason: error.code || 'AI_SERVICE_ERROR',
          fallbackMessage: AI_VOICE_FAILURE_MESSAGE,
        });
      } catch (persistenceError) {
        logChatError('persist_failed_voice_attempt_failed', persistenceError, {
          userId: req.user?.uid || null,
          conversationId: chatId,
          clientMessageId: normalizedClientMessageId,
        });
      }
    }

    return res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Voice gateway request failed',
      code: error.code || 'SERVER_ERROR',
      conversationId: chatId,
      fallbackUsed: true,
      fallbackReason: error.code || 'AI_SERVICE_ERROR',
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
    logChatError('add_message_failed', error, {
      userId: req.user?.uid || null,
      conversationId: req.params?.chatId || null,
    });

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
    logChatError('delete_chat_failed', error, {
      userId: req.user?.uid || null,
      conversationId: req.params?.chatId || null,
    });

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function parseBooleanFlag(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  return false;
}

function resolveIncludeArabicPreference(rawValue, defaultValue = false) {
  if (typeof rawValue === 'undefined' || rawValue === null || rawValue === '') {
    return defaultValue === true;
  }

  return parseBooleanFlag(rawValue);
}

async function getUserChatPreferences(userId) {
  if (!userId) {
    return {
      defaultIncludeArabic: false,
    };
  }

  try {
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return {
        defaultIncludeArabic: false,
      };
    }

    const user = userDoc.data() || {};
    return {
      defaultIncludeArabic: user.chatPreferences?.defaultIncludeArabic === true,
    };
  } catch (error) {
    logChatError('get_user_chat_preferences_failed', error, {
      userId,
    });
    return {
      defaultIncludeArabic: false,
    };
  }
}

async function resolveEffectiveUserLevel(req) {
  const tokenLevel = normalizeOptionalString(req?.user?.level);
  if (tokenLevel) {
    return tokenLevel;
  }

  const userId = normalizeOptionalString(req?.user?.uid);
  if (!userId) {
    return 'A1';
  }

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return 'A1';
    }

    const user = userDoc.data() || {};
    return normalizeOptionalString(user.level) || 'A1';
  } catch (error) {
    logChatError('resolve_effective_user_level_failed', error, {
      userId,
    });
    return 'A1';
  }
}

async function ensureVoiceConversation({
  userId,
  conversationId = null,
  level = 'A1',
}) {
  if (conversationId) {
    const chatRef = db.collection('chatSessions').doc(conversationId);
    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
      throw {
        status: 404,
        code: 'CHAT_NOT_FOUND',
        message: 'Chat not found'
      };
    }

    const chat = chatDoc.data();
    if (chat.userId !== userId) {
      throw {
        status: 403,
        code: 'ACCESS_DENIED',
        message: 'Access denied'
      };
    }

    return {
      chatId: conversationId,
      chatRef,
      chat,
      isNewConversation: false,
    };
  }

  const userPreferences = await getUserChatPreferences(userId);
  const createdChat = await createChatSession({
    userId,
    level,
    defaultIncludeArabic: userPreferences.defaultIncludeArabic,
    defaultTitle: DEFAULT_VOICE_CHAT_TITLE,
  });

  return {
    ...createdChat,
    isNewConversation: true,
  };
}

async function persistFailedVoiceAttempt({
  chatRef,
  uploadedAudio,
  audioFile,
  clientMessageId = null,
  existingUserMessage = null,
  fallbackReason,
  fallbackMessage,
}) {
  const createdAt = new Date().toISOString();

  const userVoiceMessage = {
    sender: 'user',
    type: 'voice',
    text: null,
    clientMessageId,
    audioUrl: uploadedAudio?.audioUrl || null,
    transcribedText: null,
    fallbackUsed: false,
    fallbackReason: null,
    audioMimeType: audioFile.mimetype,
    audioStored: Boolean(uploadedAudio?.audioUrl),
    createdAt,
  };

  const assistantVoiceMessage = {
    sender: 'ai',
    type: 'voice',
    text: fallbackMessage,
    replyToClientMessageId: clientMessageId,
    audioUrl: null,
    transcribedText: null,
    fallbackUsed: true,
    fallbackReason: fallbackReason || 'AI_SERVICE_ERROR',
    createdAt,
  };

  const messagesToPersist = existingUserMessage
    ? [assistantVoiceMessage]
    : [userVoiceMessage, assistantVoiceMessage];

  await chatRef.update({
    messages: admin.firestore.FieldValue.arrayUnion(...messagesToPersist),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

function findStoredMessagePairByClientMessageId(messages, clientMessageId) {
  if (!Array.isArray(messages) || !clientMessageId) {
    return null;
  }

  for (let index = 0; index < messages.length; index += 1) {
    const currentMessage = messages[index];

    if (
      currentMessage?.sender !== 'user' ||
      currentMessage?.clientMessageId !== clientMessageId
    ) {
      continue;
    }

    let assistantMessage = null;

    for (let nextIndex = index + 1; nextIndex < messages.length; nextIndex += 1) {
      const nextMessage = messages[nextIndex];

      if (nextMessage?.sender !== 'ai') {
        continue;
      }

      if (
        !nextMessage.replyToClientMessageId ||
        nextMessage.replyToClientMessageId === clientMessageId
      ) {
        assistantMessage = nextMessage;
        break;
      }
    }

    return {
      userMessage: currentMessage,
      assistantMessage,
    };
  }

  return null;
}

function buildVoiceIdempotentResponse({
  chatId,
  userMessage,
  assistantMessage,
}) {
  return {
    success: true,
    deduplicated: true,
    answerHe: assistantMessage?.text || '',
    answerAr: null,
    fallbackUsed: assistantMessage?.fallbackUsed === true,
    fallbackReason: assistantMessage?.fallbackReason || null,
    transcribedText:
      userMessage?.transcribedText ||
      assistantMessage?.transcribedText ||
      null,
    conversationId: chatId,
    audioUrl: userMessage?.audioUrl || null,
    audioStored: Boolean(userMessage?.audioUrl),
  };
}

function logChatError(event, error, context = {}) {
  // PII redaction: hash userId before it hits any sink (stdout/Sentry/log aggregator)
  const safeContext = { ...context };
  if (safeContext.userId !== undefined) {
    safeContext.userId = hashUserId(safeContext.userId);
  }
  logger.error(
    {
      event,
      ...safeContext,
      error: toErrorPayload(error),
    },
    event
  );
}

exports.submitChatReview = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { chatId } = req.params;
    const { rating, comment = '', role = 'student' } = req.body || {};

    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        error: 'rating must be an integer 1-5',
        code: 'VALIDATION_ERROR',
      });
    }
    if (role !== 'student' && role !== 'teacher') {
      return res.status(400).json({
        success: false,
        error: 'role must be student or teacher',
        code: 'VALIDATION_ERROR',
      });
    }

    const review = {
      chatId: chatId || null,
      userId,
      role,
      rating: numericRating,
      comment: String(comment).slice(0, 1000),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection('chatReviews').add(review);

    return res.status(201).json({ success: true, id: ref.id, review });
  } catch (error) {
    logChatError('submit_chat_review_failed', error, {
      userId: req.user?.uid || null,
    });
    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR',
    });
  }
};

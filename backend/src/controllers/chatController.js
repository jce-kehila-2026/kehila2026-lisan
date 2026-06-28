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
    const { title } = req.body || {};
    const activityContext = resolveActivityContext({ body: req.body });

    const userId = req.user.uid;
    const userPreferences = await getUserChatPreferences(userId);
    const effectiveLevel = await resolveEffectiveUserLevel(req);

    const effectiveTitle =
      activityContext.activityTitle ||
      normalizeOptionalString(title) ||
      DEFAULT_CHAT_TITLE;

    // Keep only the last 2 chats per user — delete the oldest when a 3rd is created.
    // Sort in JS (not Firestore) to avoid needing a composite index.
    const existingChatsSnap = await db.collection('chatSessions')
      .where('userId', '==', userId)
      .get();

    if (existingChatsSnap.size >= 2) {
      const sorted = existingChatsSnap.docs
        .slice()
        .sort((a, b) => {
          const aTime = a.data().startedAt?.toMillis?.() || 0;
          const bTime = b.data().startedAt?.toMillis?.() || 0;
          return aTime - bTime;
        });
      // Delete all but the most recent one (keep 1, new one will be #2)
      const toDelete = sorted.slice(0, sorted.length - 1);
      await Promise.all(toDelete.map((doc) => doc.ref.delete()));
    }

    const requestedDefaultIncludeArabic = req.body?.defaultIncludeArabic;
    const effectiveDefaultIncludeArabic =
      typeof requestedDefaultIncludeArabic !== 'undefined' && requestedDefaultIncludeArabic !== null
        ? parseBooleanFlag(requestedDefaultIncludeArabic)
        : userPreferences.defaultIncludeArabic;

    const { chatId, chat } = await createChatSession({
      userId,
      level: effectiveLevel,
      title: effectiveTitle,
      defaultIncludeArabic: effectiveDefaultIncludeArabic,
      defaultTitle: DEFAULT_CHAT_TITLE,
      scenario: activityContext.scenario,
      activityTitle: activityContext.activityTitle,
      activitySubtitle: activityContext.activitySubtitle,
    });

    const activityFields = buildActivityFields(activityContext);

    if (Object.keys(activityFields).length > 0) {
      await db.collection('chatSessions').doc(chatId).set(activityFields, { merge: true });
    }

    return res.status(201).json({
      success: true,
      chat: {
        id: chatId,
        userId,
        title: activityContext.activityTitle || chat.title,
        level: chat.level,
        defaultIncludeArabic: chat.defaultIncludeArabic === true,
        scenario: activityContext.scenario || chat.scenario || null,
        activityTitle: activityContext.activityTitle || chat.activityTitle || null,
        activitySubtitle: activityContext.activitySubtitle || chat.activitySubtitle || null,
        messages: [],
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logChatError('create_chat_failed', error, {
      userId: req.user?.uid || null,
    });

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR',
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
        scenario: data.scenario || null,
        activityTitle: data.activityTitle || null,
        activitySubtitle: data.activitySubtitle || null,
        isArchived: data.isArchived === true,
        archivedAt: data.archivedAt || null,
        startedAt: data.startedAt || null,
        updatedAt: data.updatedAt || null,
        messages: data.messages || [],
        messagesCount: data.messages ? data.messages.length : 0,
      });
    });

    return res.status(200).json({
      success: true,
      chats,
    });
  } catch (error) {
    logChatError('get_my_chats_failed', error, {
      userId: req.user?.uid || null,
      includeArchived,
    });

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR',
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
        code: 'CHAT_NOT_FOUND',
      });
    }

    const chat = chatDoc.data();

    if (chat.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED',
      });
    }

    return res.status(200).json({
      success: true,
      chat: {
        id: chatDoc.id,
        ...chat,
        scenario: chat.scenario || null,
        activityTitle: chat.activityTitle || null,
        activitySubtitle: chat.activitySubtitle || null,
      },
    });
  } catch (error) {
    logChatError('get_chat_by_id_failed', error, {
      userId: req.user?.uid || null,
      conversationId: req.params?.chatId || null,
    });

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR',
    });
  }
};

exports.sendAiMessage = async (req, res) => {
  const normalizedClientMessageId = normalizeOptionalString(req.body?.clientMessageId);

  try {
    const userId = req.user.uid;
    const { chatId } = req.params;
    const text = normalizeOptionalString(req.body?.text);

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required',
        code: 'MISSING_TEXT',
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
        code: 'CHAT_NOT_FOUND',
      });
    }

    const chat = chatDoc.data();

    if (chat.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED',
      });
    }

    const activityContext = resolveActivityContext({
      body: req.body,
      chat,
    });

    const activityPatch = buildMissingActivityPatch({
      chat,
      activityContext,
    });

    if (Object.keys(activityPatch).length > 0) {
      await chatRef.set(activityPatch, { merge: true });
    }

    const effectiveLevel =
      normalizeOptionalString(req.body?.level) ||
      normalizeOptionalString(chat.level) ||
      'A1';

    const includeArabic = resolveIncludeArabicPreference(
      req.body?.includeArabic,
      chat.defaultIncludeArabic === true
    );

    const existingTextMessagePair = normalizedClientMessageId
      ? findStoredMessagePairByClientMessageId(chat.messages, normalizedClientMessageId)
      : null;

    if (existingTextMessagePair?.userMessage && existingTextMessagePair?.assistantMessage) {
      return res.status(200).json({
        success: true,
        userMessage: existingTextMessagePair.userMessage,
        aiMessage: existingTextMessagePair.assistantMessage,
        deduplicated: true,
        scenario: activityContext.scenario,
        activityTitle: activityContext.activityTitle,
        activitySubtitle: activityContext.activitySubtitle,
      });
    }

    const userMessage = {
      sender: 'user',
      text,
      clientMessageId: normalizedClientMessageId,
      createdAt: new Date().toISOString(),
    };

    await applyAutoTitleToChatIfNeeded({
      chatRef,
      chat,
      firstUserMessageText: text,
      fallbackTitle: activityContext.activityTitle || DEFAULT_CHAT_TITLE,
    });

    if (!existingTextMessagePair?.userMessage) {
      await chatRef.update({
        messages: admin.firestore.FieldValue.arrayUnion(userMessage),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    const userToken = req.headers.authorization?.replace('Bearer ', '') || null;

    const aiResponse = await sendChatMessageToAi({
      message: text,
      level: effectiveLevel,
      includeArabic,
      userId,
      sessionId: chatId,
      userToken,
      scenario: activityContext.scenario,
      activityTitle: activityContext.activityTitle,
      activitySubtitle: activityContext.activitySubtitle,
    });

    const aiText =
      aiResponse?.answerHe ||
      'אני מבין. בוא נמשיך לתרגל.';

    const aiMessage = {
      sender: 'ai',
      text: aiText,
      replyToClientMessageId: normalizedClientMessageId,
      createdAt: new Date().toISOString(),
    };

    await chatRef.update({
      messages: admin.firestore.FieldValue.arrayUnion(aiMessage),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        scenario: activityContext.scenario,
        activityTitle: activityContext.activityTitle,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
      scenario: activityContext.scenario,
      activityTitle: activityContext.activityTitle,
      activitySubtitle: activityContext.activitySubtitle,
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
      code: error.code || 'AI_SERVICE_ERROR',
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
        code: 'MISSING_CONVERSATION_ID',
      });
    }

    const chatRef = db.collection('chatSessions').doc(conversationId);
    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found',
        code: 'CHAT_NOT_FOUND',
      });
    }

    const chat = chatDoc.data();

    if (chat.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED',
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
      code: 'SERVER_ERROR',
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
        code: 'USER_NOT_FOUND',
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
      },
    });
  } catch (error) {
    logChatError('save_chat_preferences_failed', error, {
      userId: req.user?.uid || null,
    });

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR',
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
  let activityContext = {
    scenario: null,
    activityTitle: null,
    activitySubtitle: null,
  };

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
        code: 'VOICE_FILE_REQUIRED',
      });
    }

    if (!audioFile.buffer || audioFile.size <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Audio file is empty',
        code: 'VOICE_FILE_EMPTY',
      });
    }

    if (audioFile.size > VOICE_UPLOAD_MAX_BYTES) {
      return res.status(413).json({
        success: false,
        error: 'Audio file is too large',
        code: 'VOICE_FILE_TOO_LARGE',
      });
    }

    const normalizedConversationId = normalizeOptionalString(conversationId);
    normalizedClientMessageId = normalizeOptionalString(clientMessageId);

    normalizedLevel = normalizedConversationId
      ? normalizeOptionalString(level) || 'A1'
      : await resolveEffectiveUserLevel(req);

    const requestedActivityContext = resolveActivityContext({
      body: req.body,
    });

    ({ chatId, chatRef, chat } = await ensureVoiceConversation({
      userId,
      conversationId: normalizedConversationId,
      level: normalizedLevel,
      scenario: requestedActivityContext.scenario,
      activityTitle: requestedActivityContext.activityTitle,
      activitySubtitle: requestedActivityContext.activitySubtitle,
    }));

    activityContext = resolveActivityContext({
      body: req.body,
      chat,
    });

    const activityPatch = buildMissingActivityPatch({
      chat,
      activityContext,
    });

    if (Object.keys(activityPatch).length > 0) {
      await chatRef.set(activityPatch, { merge: true });
      chat = {
        ...chat,
        ...activityPatch,
      };
    }

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
          activityContext,
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
      scenario: activityContext.scenario,
      activityTitle: activityContext.activityTitle,
      activitySubtitle: activityContext.activitySubtitle,
      audio: {
        fieldName: audioFile.fieldname,
        originalName: audioFile.originalname,
        mimeType: audioFile.mimetype,
        size: audioFile.size,
        audioUrl: uploadedAudio?.audioUrl || null,
      },
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
      scenario: activityContext.scenario,
      activityTitle: activityContext.activityTitle,
      activitySubtitle: activityContext.activitySubtitle,
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
        fallbackTitle: activityContext.activityTitle || DEFAULT_VOICE_CHAT_TITLE,
      });
    }

    const messagesToPersist = existingVoiceMessagePair?.userMessage
      ? [assistantVoiceMessage]
      : [userVoiceMessage, assistantVoiceMessage];

    await chatRef.update({
      messages: admin.firestore.FieldValue.arrayUnion(...messagesToPersist),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        scenario: activityContext.scenario,
        activityTitle: activityContext.activityTitle,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
      scenario: activityContext.scenario,
      activityTitle: activityContext.activityTitle,
      activitySubtitle: activityContext.activitySubtitle,
    });
  } catch (error) {
    logChatError('send_voice_message_failed', error, {
      userId: req.user?.uid || null,
      conversationId: chatId,
      clientMessageId: normalizedClientMessageId,
      scenario: activityContext.scenario,
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

    // Notify admins about AI voice failure (fire-and-forget)
    try {
      const adminSnap = await db.collection('users').where('role', '==', 'admin').get();
      const errorCode = error.code || 'AI_SERVICE_ERROR';
      const createdAt = new Date().toISOString();
      await Promise.all(
        adminSnap.docs.map((d) =>
          db.collection('notifications').add({
            userId: d.id,
            type: 'ai_service_error',
            title: 'תקלה בשירות ה-AI',
            message: 'שירות ה-AI נכשל בשיחה קולית. קוד שגיאה: ' + errorCode,
            relatedChatId: chatId || null,
            errorCode,
            isRead: false,
            createdAt,
          })
        )
      );
    } catch (notifErr) { console.error('Failed to send AI error notification:', notifErr); }

    return res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Voice gateway request failed',
      code: error.code || 'SERVER_ERROR',
      conversationId: chatId,
      fallbackUsed: true,
      fallbackReason: error.code || 'AI_SERVICE_ERROR',
      scenario: activityContext.scenario,
      activityTitle: activityContext.activityTitle,
      activitySubtitle: activityContext.activitySubtitle,
    });
  }
};

exports.addMessage = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { chatId } = req.params;
    const { sender } = req.body;
    const text = normalizeOptionalString(req.body?.text);

    if (!sender || !text) {
      return res.status(400).json({
        success: false,
        error: 'sender and text are required',
        code: 'MISSING_REQUIRED_FIELDS',
      });
    }

    const allowedSenders = ['user', 'ai'];

    if (!allowedSenders.includes(sender)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sender',
        code: 'INVALID_SENDER',
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
        code: 'CHAT_NOT_FOUND',
      });
    }

    const chat = chatDoc.data();

    if (chat.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED',
      });
    }

    const message = {
      sender,
      text,
      createdAt: new Date().toISOString(),
    };

    await chatRef.update({
      messages: admin.firestore.FieldValue.arrayUnion(message),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({
      success: true,
      message,
    });
  } catch (error) {
    logChatError('add_message_failed', error, {
      userId: req.user?.uid || null,
      conversationId: req.params?.chatId || null,
    });

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR',
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
        code: 'CHAT_NOT_FOUND',
      });
    }

    const chat = chatDoc.data();

    if (chat.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED',
      });
    }

    await chatRef.delete();

    return res.status(200).json({
      success: true,
      message: 'Chat deleted successfully',
    });
  } catch (error) {
    logChatError('delete_chat_failed', error, {
      userId: req.user?.uid || null,
      conversationId: req.params?.chatId || null,
    });

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR',
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

function resolveActivityContext({ body = {}, chat = {} } = {}) {
  return {
    scenario:
      normalizeOptionalString(body?.scenario) ||
      normalizeOptionalString(chat?.scenario),
    activityTitle:
      normalizeOptionalString(body?.activityTitle) ||
      normalizeOptionalString(chat?.activityTitle),
    activitySubtitle:
      normalizeOptionalString(body?.activitySubtitle) ||
      normalizeOptionalString(chat?.activitySubtitle),
  };
}

function buildActivityFields(activityContext = {}) {
  const fields = {};

  if (activityContext.scenario) {
    fields.scenario = activityContext.scenario;
  }

  if (activityContext.activityTitle) {
    fields.activityTitle = activityContext.activityTitle;
  }

  if (activityContext.activitySubtitle) {
    fields.activitySubtitle = activityContext.activitySubtitle;
  }

  return fields;
}

function buildMissingActivityPatch({ chat = {}, activityContext = {} } = {}) {
  const patch = {};

  if (activityContext.scenario && chat.scenario !== activityContext.scenario) {
    patch.scenario = activityContext.scenario;
  }

  if (activityContext.activityTitle && chat.activityTitle !== activityContext.activityTitle) {
    patch.activityTitle = activityContext.activityTitle;
  }

  if (activityContext.activitySubtitle && chat.activitySubtitle !== activityContext.activitySubtitle) {
    patch.activitySubtitle = activityContext.activitySubtitle;
  }

  return patch;
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
  scenario = null,
  activityTitle = null,
  activitySubtitle = null,
}) {
  const requestedActivityContext = resolveActivityContext({
    body: {
      scenario,
      activityTitle,
      activitySubtitle,
    },
  });

  if (conversationId) {
    const chatRef = db.collection('chatSessions').doc(conversationId);
    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
      throw {
        status: 404,
        code: 'CHAT_NOT_FOUND',
        message: 'Chat not found',
      };
    }

    const chat = chatDoc.data();

    if (chat.userId !== userId) {
      throw {
        status: 403,
        code: 'ACCESS_DENIED',
        message: 'Access denied',
      };
    }

    const activityContext = resolveActivityContext({
      body: requestedActivityContext,
      chat,
    });

    const activityPatch = buildMissingActivityPatch({
      chat,
      activityContext,
    });

    if (Object.keys(activityPatch).length > 0) {
      await chatRef.set(activityPatch, { merge: true });
    }

    return {
      chatId: conversationId,
      chatRef,
      chat: {
        ...chat,
        ...activityPatch,
      },
      isNewConversation: false,
    };
  }

  const userPreferences = await getUserChatPreferences(userId);

  const createdChat = await createChatSession({
    userId,
    level,
    title: requestedActivityContext.activityTitle || DEFAULT_VOICE_CHAT_TITLE,
    defaultIncludeArabic: userPreferences.defaultIncludeArabic,
    defaultTitle: DEFAULT_VOICE_CHAT_TITLE,
    scenario: requestedActivityContext.scenario,
    activityTitle: requestedActivityContext.activityTitle,
    activitySubtitle: requestedActivityContext.activitySubtitle,
  });

  const activityFields = buildActivityFields(requestedActivityContext);

  if (Object.keys(activityFields).length > 0) {
    await db.collection('chatSessions').doc(createdChat.chatId).set(activityFields, { merge: true });
  }

  return {
    ...createdChat,
    chat: {
      ...createdChat.chat,
      ...activityFields,
    },
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
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
  activityContext = {},
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
    scenario: activityContext.scenario || null,
    activityTitle: activityContext.activityTitle || null,
    activitySubtitle: activityContext.activitySubtitle || null,
  };
}

function logChatError(event, error, context = {}) {
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

    const activityContext = resolveActivityContext({
      body: req.body,
    });

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
      scenario: activityContext.scenario || null,
      activityTitle: activityContext.activityTitle || null,
      activitySubtitle: activityContext.activitySubtitle || null,
      rating: numericRating,
      comment: String(comment).slice(0, 1000),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection('chatReviews').add(review);

    // Notify assigned teachers and admins (fire-and-forget)
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      const studentName = userData.name || 'תלמידה';
      const teacherIds = Array.isArray(userData.teacherIds) ? userData.teacherIds : [];

      const adminSnap = await db.collection('users').where('role', '==', 'admin').get();
      const adminIds = adminSnap.docs.map((d) => d.id);

      const recipients = [...new Set([...teacherIds, ...adminIds])].filter((id) => id !== userId);

      if (recipients.length > 0) {
        const stars = '★'.repeat(numericRating) + '☆'.repeat(5 - numericRating);
        const activityLabel = activityContext.activityTitle || 'שיחה חופשית';
        const createdAt = new Date().toISOString();

        await Promise.all(
          recipients.map((recipientId) =>
            db.collection('notifications').add({
              userId: recipientId,
              type: 'chat_review_submitted',
              title: studentName + ' סיימה שיחה',
              message: studentName + ' סיימה שיחת "' + activityLabel + '" עם דירוג ' + stars,
              ...(comment ? { preview: String(comment).slice(0, 200) } : {}),
              relatedChatId: chatId || null,
              relatedReviewId: ref.id,
              studentId: userId,
              studentName,
              rating: numericRating,
              isRead: false,
              createdAt,
            })
          )
        );
      }
    } catch (notifError) {
      console.error('Failed to send review notifications:', notifError);
    }

    return res.status(201).json({
      success: true,
      id: ref.id,
      review,
    });
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


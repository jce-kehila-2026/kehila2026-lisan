const { admin, db } = require('../config/firebase');

const CHAT_CONVERSATIONS_COLLECTION = 'chatConversations';
const CHAT_MESSAGES_SUBCOLLECTION = 'messages';
const DEFAULT_CONVERSATION_TITLE = 'Hebrew practice';
const MAX_PREVIEW_LENGTH = 80;

class ChatPersistenceError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ChatPersistenceError';
    this.code = options.code || 'CHAT_PERSISTENCE_ERROR';
    this.status = options.status || 500;
    this.cause = options.cause;
  }
}

function createChatPersistenceService(deps = {}) {
  const firestore = deps.db || db;
  const firebaseAdmin = deps.admin || admin;

  function serverTimestamp() {
    return firebaseAdmin.firestore.FieldValue.serverTimestamp();
  }

  function incrementBy(value) {
    return firebaseAdmin.firestore.FieldValue.increment(value);
  }

  function buildPreview(text) {
    const normalizedText = typeof text === 'string' ? text.trim() : '';

    if (!normalizedText) {
      return '';
    }

    return normalizedText.slice(0, MAX_PREVIEW_LENGTH);
  }

  function buildConversationTitle(initialMessageText) {
    return buildPreview(initialMessageText) || DEFAULT_CONVERSATION_TITLE;
  }

  function normalizeTimestamp(value) {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value?.toDate === 'function') {
      return value.toDate().toISOString();
    }

    return null;
  }

  function sortByTimestampDesc(left, right) {
    const leftTimestamp = left.updatedAt || left.createdAt || '';
    const rightTimestamp = right.updatedAt || right.createdAt || '';

    return String(rightTimestamp).localeCompare(String(leftTimestamp));
  }

  function sortByTimestampAsc(left, right) {
    const leftTimestamp = left.createdAt || '';
    const rightTimestamp = right.createdAt || '';

    return String(leftTimestamp).localeCompare(String(rightTimestamp));
  }

  function normalizeConversation(doc) {
    const data = doc.data();

    return {
      id: doc.id,
      userId: data.userId,
      level: data.level || 'A1',
      title: data.title || DEFAULT_CONVERSATION_TITLE,
      createdAt: normalizeTimestamp(data.createdAt),
      updatedAt: normalizeTimestamp(data.updatedAt),
      lastMessageAt: normalizeTimestamp(data.lastMessageAt),
      lastMessagePreview: data.lastMessagePreview || '',
      messageCount: Number(data.messageCount || 0),
      deletedAt: normalizeTimestamp(data.deletedAt),
    };
  }

  function normalizeMessage(doc) {
    const data = doc.data();

    return {
      id: doc.id,
      userId: data.userId,
      role: data.role,
      textHe: data.textHe || null,
      textAr: data.textAr || null,
      rawText: data.rawText || null,
      fallbackUsed: data.fallbackUsed === true,
      fallbackReason: data.fallbackReason || null,
      cacheHit: data.cacheHit === true,
      routerHit: data.routerHit === true,
      latencyMs: Number.isFinite(data.latencyMs) ? data.latencyMs : null,
      createdAt: normalizeTimestamp(data.createdAt),
      clientMessageId: data.clientMessageId || null,
      // Voice fields (Task 3)
      audioUrlUser:      data.audioUrlUser      || null,
      audioUrlAssistant: data.audioUrlAssistant || null,
    };
  }

  async function getOwnedConversation({ conversationId, userId }) {
    const conversationRef = firestore
      .collection(CHAT_CONVERSATIONS_COLLECTION)
      .doc(conversationId);

    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      throw new ChatPersistenceError('Conversation not found', {
        code: 'CONVERSATION_NOT_FOUND',
        status: 404,
      });
    }

    const conversation = conversationDoc.data();

    if (conversation?.deletedAt) {
      throw new ChatPersistenceError('Conversation not found', {
        code: 'CONVERSATION_NOT_FOUND',
        status: 404,
      });
    }

    if (conversation?.userId !== userId) {
      throw new ChatPersistenceError('Conversation does not belong to the authenticated user', {
        code: 'CONVERSATION_FORBIDDEN',
        status: 403,
      });
    }

    return {
      id: conversationDoc.id,
      ref: conversationRef,
      data: conversation,
    };
  }

  async function createConversation({ userId, level, initialMessageText }) {
    const conversationRef = firestore
      .collection(CHAT_CONVERSATIONS_COLLECTION)
      .doc();

    await conversationRef.set({
      userId,
      level,
      title: buildConversationTitle(initialMessageText),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessageAt: null,
      lastMessagePreview: '',
      messageCount: 0,
      deletedAt: null,
    });

    return {
      id: conversationRef.id,
      ref: conversationRef,
      data: {
        userId,
        level,
      },
      isNew: true,
    };
  }

  async function createOrLoadConversation({ conversationId, userId, level, initialMessageText }) {
    if (conversationId) {
      return {
        ...(await getOwnedConversation({ conversationId, userId })),
        isNew: false,
      };
    }

    return createConversation({
      userId,
      level,
      initialMessageText,
    });
  }

  async function saveMessage({
    conversationId,
    userId,
    role,
    textHe = null,
    textAr = null,
    rawText = null,
    fallbackUsed = null,
    fallbackReason = null,
    cacheHit = null,
    routerHit = null,
    latencyMs = null,
    clientMessageId = null,
    // Voice fields (Task 3) — null for text-only messages
    audioUrlUser      = null,
    audioUrlAssistant = null,
  }) {
    const conversationRef = firestore
      .collection(CHAT_CONVERSATIONS_COLLECTION)
      .doc(conversationId);

    const messagePayload = {
      userId,
      role,
      textHe,
      textAr,
      rawText,
      fallbackUsed,
      fallbackReason,
      cacheHit,
      routerHit,
      latencyMs,
      createdAt: serverTimestamp(),
      clientMessageId,
      audioUrlUser,
      audioUrlAssistant,
    };

    const messageRef = await conversationRef
      .collection(CHAT_MESSAGES_SUBCOLLECTION)
      .add(messagePayload);

    const lastMessagePreview = buildPreview(
      role === 'assistant'
        ? (textHe || textAr || rawText || '')
        : (rawText || textHe || '')
    );

    await conversationRef.update({
      updatedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      lastMessagePreview,
      messageCount: incrementBy(1),
    });

    return {
      id: messageRef.id,
      ...messagePayload,
    };
  }

  async function saveUserMessage({
    conversationId,
    userId,
    rawText,
    clientMessageId = null,
    audioUrlUser = null,    // Task 3: Cloud Storage URL of the user's audio file
  }) {
    return saveMessage({
      conversationId,
      userId,
      role: 'user',
      rawText,
      clientMessageId,
      audioUrlUser,
    });
  }

  async function saveAssistantMessage({
    conversationId,
    userId,
    response,
    audioUrlAssistant = null,  // Task 3: Cloud Storage URL of the AI's TTS audio
  }) {
    // Guard: do not persist an assistant message that has no content at all
    // (e.g. a hard AI failure where both answerHe and answerAr are empty/null).
    // Fallback messages built by buildSafeChatFallback always have a non-empty
    // answerHe (Hebrew error string), so this only skips truly content-free calls.
    const hasContent = (typeof response.answerHe === 'string' && response.answerHe.trim().length > 0)
      || (typeof response.answerAr === 'string' && response.answerAr.trim().length > 0);

    if (!hasContent) {
      return null;
    }

    return saveMessage({
      conversationId,
      userId,
      role: 'assistant',
      textHe: response.answerHe || null,
      textAr: response.answerAr || null,
      rawText: null,
      fallbackUsed: response.fallbackUsed === true,
      fallbackReason: response.fallbackReason || null,
      cacheHit: response.cacheHit === true,
      routerHit: response.routerHit === true,
      latencyMs: Number.isFinite(response.latencyMs) ? response.latencyMs : null,
      clientMessageId: null,
      audioUrlAssistant,
    });
  }

  async function listConversations({ userId }) {
    const snapshot = await firestore
      .collection(CHAT_CONVERSATIONS_COLLECTION)
      .where('userId', '==', userId)
      .get();

    return snapshot.docs
      .map(normalizeConversation)
      .filter((conversation) => conversation.deletedAt === null)
      .sort(sortByTimestampDesc);
  }

  async function getConversationWithMessages({ conversationId, userId }) {
    const conversation = await getOwnedConversation({ conversationId, userId });
    const messagesSnapshot = await conversation.ref
      .collection(CHAT_MESSAGES_SUBCOLLECTION)
      .get();

    const messages = messagesSnapshot.docs
      .map(normalizeMessage)
      .sort(sortByTimestampAsc);

    return {
      conversation: normalizeConversation({
        id: conversation.id,
        data() {
          return conversation.data;
        },
      }),
      messages,
    };
  }

  async function softDeleteConversation({ conversationId, userId }) {
    const conversation = await getOwnedConversation({ conversationId, userId });

    await conversation.ref.update({
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      id: conversation.id,
      success: true,
    };
  }

  return {
    createConversation,
    createOrLoadConversation,
    getOwnedConversation,
    getConversationWithMessages,
    listConversations,
    saveAssistantMessage,
    saveUserMessage,
    softDeleteConversation,
  };
}

module.exports = {
  CHAT_CONVERSATIONS_COLLECTION,
  CHAT_MESSAGES_SUBCOLLECTION,
  ChatPersistenceError,
  createChatPersistenceService,
};

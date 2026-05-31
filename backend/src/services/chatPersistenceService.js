const crypto = require('crypto');
const path = require('path');

const { bucket } = require('../config/firebase');
const { admin, db } = require('../config/firebase');

const SIGNED_URL_EXPIRY = '2100-01-01';
const DEFAULT_CHAT_TITLE = 'New Chat';
const DEFAULT_VOICE_CHAT_TITLE = 'Voice Chat';
const AUTO_TITLE_MAX_WORDS = 10;

function ensureStorageBucketConfigured() {
  if (!process.env.FIREBASE_STORAGE_BUCKET) {
    throw {
      code: 'STORAGE_BUCKET_NOT_CONFIGURED',
      message: 'Firebase Storage bucket is not configured'
    };
  }
}

function sanitizeFileName(fileName) {
  const originalName = String(fileName || 'voice-message.webm').trim();
  const ext = path.extname(originalName) || '.webm';
  const baseName = path.basename(originalName, ext);
  const safeBaseName = baseName
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'voice-message';

  return `${safeBaseName}${ext.toLowerCase()}`;
}

function buildChatTitleFromFirstMessage(firstMessageText, fallbackTitle = DEFAULT_CHAT_TITLE) {
  if (typeof firstMessageText !== 'string') {
    return fallbackTitle;
  }

  const normalizedText = firstMessageText
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalizedText) {
    return fallbackTitle;
  }

  const titleWords = normalizedText
    .split(' ')
    .slice(0, AUTO_TITLE_MAX_WORDS);

  return titleWords.join(' ') || fallbackTitle;
}

async function createChatSession({
  userId,
  level = 'A1',
  title = null,
  firstUserMessageText = null,
  defaultIncludeArabic = false,
  defaultTitle = DEFAULT_CHAT_TITLE,
}) {
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  const chatTitle =
    normalizedTitle ||
    buildChatTitleFromFirstMessage(firstUserMessageText, defaultTitle);

  const chatData = {
    userId,
    title: chatTitle,
    level,
    defaultIncludeArabic: defaultIncludeArabic === true,
    isArchived: false,
    archivedAt: null,
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    messages: []
  };

  const docRef = await db.collection('chatSessions').add(chatData);

  return {
    chatId: docRef.id,
    chatRef: docRef,
    chat: chatData,
  };
}

async function applyAutoTitleToChatIfNeeded({
  chatRef,
  chat,
  firstUserMessageText,
  fallbackTitle = DEFAULT_CHAT_TITLE,
}) {
  const nextTitle = buildChatTitleFromFirstMessage(firstUserMessageText, fallbackTitle);
  const currentTitle = typeof chat?.title === 'string' ? chat.title.trim() : '';
  const currentMessagesCount = Array.isArray(chat?.messages) ? chat.messages.length : 0;
  const genericTitles = new Set([DEFAULT_CHAT_TITLE, DEFAULT_VOICE_CHAT_TITLE, fallbackTitle]);

  if (!nextTitle || nextTitle === fallbackTitle) {
    return currentTitle || fallbackTitle;
  }

  if (!genericTitles.has(currentTitle) || currentMessagesCount > 0) {
    return currentTitle || fallbackTitle;
  }

  await chatRef.update({
    title: nextTitle,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (chat) {
    chat.title = nextTitle;
  }

  return nextTitle;
}

function buildVoiceStoragePath({
  userId,
  conversationId = null,
  fileName,
  now = new Date(),
}) {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const randomId = crypto.randomUUID();
  const safeConversationId = conversationId || 'unassigned';

  return [
    'chat-audio',
    userId || 'anonymous',
    safeConversationId,
    year,
    month,
    day,
    `${timestamp}-${randomId}-${sanitizeFileName(fileName)}`
  ].join('/');
}

async function uploadStudentVoiceAudio({
  userId,
  conversationId = null,
  audioBuffer,
  fileName,
  mimeType,
}) {
  ensureStorageBucketConfigured();

  if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    throw {
      code: 'VOICE_AUDIO_BUFFER_INVALID',
      message: 'Audio buffer is missing or empty'
    };
  }

  const storagePath = buildVoiceStoragePath({
    userId,
    conversationId,
    fileName,
  });

  const storageFile = bucket.file(storagePath);

  await storageFile.save(audioBuffer, {
    metadata: {
      contentType: mimeType || 'application/octet-stream',
      metadata: {
        userId: userId || '',
        conversationId: conversationId || '',
        source: 'voice-chat',
      },
    },
    resumable: false,
    validation: 'crc32c',
  });

  const [audioUrl] = await storageFile.getSignedUrl({
    action: 'read',
    expires: SIGNED_URL_EXPIRY,
  });

  return {
    audioUrl,
    storagePath,
    bucketName: bucket.name,
    contentType: mimeType || 'application/octet-stream',
    sizeBytes: audioBuffer.length,
  };
}

module.exports = {
  applyAutoTitleToChatIfNeeded,
  buildVoiceStoragePath,
  buildChatTitleFromFirstMessage,
  createChatSession,
  DEFAULT_CHAT_TITLE,
  DEFAULT_VOICE_CHAT_TITLE,
  sanitizeFileName,
  uploadStudentVoiceAudio,
};

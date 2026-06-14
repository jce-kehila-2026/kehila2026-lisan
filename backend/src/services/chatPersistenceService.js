const crypto = require('crypto');
const path = require('path');

const { admin, bucket, db } = require('../config/firebase');

const SIGNED_URL_EXPIRY = '2100-01-01';
const DEFAULT_CHAT_TITLE = 'New Chat';
const DEFAULT_VOICE_CHAT_TITLE = 'Voice Chat';
const AUTO_TITLE_MAX_WORDS = 10;

// Quick-activity scenario ids. Must match scenario_engine.py in the ai-service
// and the route ids in frontend/src/pages/ScenarioChat.jsx. Anything else is
// stored as null (normal chat) so a bad client value can't change behaviour.
const ALLOWED_SCENARIOS = new Set([
  // Quick-activity modes
  'speaking',
  'daily-word',
  'letters',
  'listening',
  'quiz',
  'culture',
  // Home-page story role-plays (must match scenario_engine._STORY_ROLEPLAYS
  // and frontend/src/data/studentStories.jsx)
  'family-visit',
  'morning-routine',
  'airport-journey',
  'doctor-appointment',
  'first-day-school',
  'at-restaurant',
  'shopping-day',
  'job-interview',
  'music-festival',
  'lost-pet',
]);

function normalizeScenarioId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return ALLOWED_SCENARIOS.has(id) ? id : null;
}

function ensureStorageBucketConfigured() {
  if (!bucket?.name) {
    throw {
      code: 'STORAGE_BUCKET_NOT_CONFIGURED',
      message: 'Firebase Storage bucket is not configured'
    };
  }
}

async function verifyVoiceStorageBucketAvailable() {
  if (String(process.env.SKIP_VOICE_STORAGE || '').trim() === 'true') {
    return {
      status: 'skipped',
      bucketName: 'local-dev',
    };
  }

  ensureStorageBucketConfigured();

  try {
    const [exists] = await bucket.exists();
    if (!exists) {
      throw {
        code: 'STORAGE_BUCKET_NOT_FOUND',
        message:
          `Firebase Storage bucket "${bucket.name}" was not found. ` +
          'Enable Firebase Storage for the project or set FIREBASE_STORAGE_BUCKET to an existing bucket.'
      };
    }

    return {
      status: 'ok',
      bucketName: bucket.name,
    };
  } catch (error) {
    if (error?.code === 'STORAGE_BUCKET_NOT_FOUND') {
      throw error;
    }

    if (error?.code === 404) {
      throw {
        code: 'STORAGE_BUCKET_NOT_FOUND',
        message:
          `Firebase Storage bucket "${bucket.name}" was not found. ` +
          'Enable Firebase Storage for the project or set FIREBASE_STORAGE_BUCKET to an existing bucket.'
      };
    }

    throw {
      code: 'STORAGE_BUCKET_CHECK_FAILED',
      message: error?.message || 'Firebase Storage bucket check failed',
      details: error,
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
  scenario = null,
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
    // Active quick-activity mode for the whole conversation (null = normal
    // chat). Set once at creation so every turn carries it to the ai-service.
    scenario: normalizeScenarioId(scenario),
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

  if (String(process.env.SKIP_VOICE_STORAGE || '').trim() === 'true') {
    return {
      audioUrl: `local-dev://${storagePath}`,
      storagePath,
      bucketName: 'local-dev',
      contentType: mimeType || 'application/octet-stream',
      sizeBytes: audioBuffer.length,
    };
  }

  await verifyVoiceStorageBucketAvailable();

  const storageFile = bucket.file(storagePath);

  try {
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
  } catch (error) {
    throw {
      code: error?.code === 404
        ? 'STORAGE_BUCKET_NOT_FOUND'
        : 'VOICE_AUDIO_UPLOAD_FAILED',
      message: error?.code === 404
        ? `Firebase Storage bucket "${bucket.name}" was not found.`
        : error?.message || 'Failed to upload voice audio',
      details: error,
    };
  }

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
  normalizeScenarioId,
  sanitizeFileName,
  uploadStudentVoiceAudio,
  verifyVoiceStorageBucketAvailable,
};

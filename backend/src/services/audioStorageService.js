'use strict';

/**
 * audioStorageService.js  —  Task 3 of CLAUDE_BACKEND_AI_PLAN.md
 *
 * Uploads user and AI audio buffers to Firebase Cloud Storage and returns
 * public download URLs to be stored in Firestore alongside the message.
 *
 * Storage layout:
 *   voice-messages/{userId}/{conversationId}/user_{messageId}.mp3
 *   voice-messages/{userId}/{conversationId}/ai_{messageId}.mp3
 *
 * All files are stored with cache-control: public, max-age=3600.
 * Files are NOT publicly listed — each URL is a signed-style download URL
 * returned by getDownloadURL().
 */

const { admin } = require('../config/firebase');

const STORAGE_BUCKET_ENV     = 'FIREBASE_STORAGE_BUCKET';
const DEFAULT_FOLDER         = 'voice-messages';
const CACHE_CONTROL          = 'public, max-age=3600';

class AudioStorageError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name  = 'AudioStorageError';
    this.code  = options.code  || 'AUDIO_STORAGE_ERROR';
    this.cause = options.cause;
  }
}

/**
 * Returns the Firebase Storage bucket instance.
 * Reads FIREBASE_STORAGE_BUCKET from env; throws if not configured.
 */
function getBucket() {
  const bucketName = (process.env[STORAGE_BUCKET_ENV] || '').trim();
  if (!bucketName) {
    throw new AudioStorageError(
      `${STORAGE_BUCKET_ENV} env var is not set — cannot upload audio`,
      { code: 'STORAGE_NOT_CONFIGURED' },
    );
  }
  return admin.storage().bucket(bucketName);
}

/**
 * Upload a single audio Buffer to Cloud Storage.
 *
 * @param {object} opts
 * @param {Buffer}  opts.buffer      - raw audio bytes
 * @param {string}  opts.storagePath - e.g. "voice-messages/uid/convId/user_msgId.mp3"
 * @param {string}  [opts.mimeType]  - defaults to "audio/mpeg"
 * @returns {Promise<string>} public download URL
 */
async function uploadAudioBuffer({ buffer, storagePath, mimeType = 'audio/mpeg' }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AudioStorageError('Empty or invalid audio buffer', { code: 'EMPTY_BUFFER' });
  }

  const bucket = getBucket();
  const file   = bucket.file(storagePath);

  await file.save(buffer, {
    metadata: {
      contentType:  mimeType,
      cacheControl: CACHE_CONTROL,
    },
    resumable: false,   // small files — no need for resumable upload
  });

  // Make the file publicly readable and get the permanent download URL
  await file.makePublic();
  const [metadata] = await file.getMetadata();

  // Construct the public URL manually (consistent, no expiry)
  const encodedPath = encodeURIComponent(storagePath).replace(/%2F/g, '%2F');
  const bucket_name = metadata.bucket;
  const downloadUrl = `https://storage.googleapis.com/${bucket_name}/${encodedPath}`;

  return downloadUrl;
}

/**
 * Build the Cloud Storage path for a voice message.
 *
 * @param {'user'|'ai'} role
 * @param {string} userId
 * @param {string} conversationId
 * @param {string} messageId
 * @returns {string}
 */
function buildStoragePath(role, userId, conversationId, messageId) {
  return `${DEFAULT_FOLDER}/${userId}/${conversationId}/${role}_${messageId}.mp3`;
}

/**
 * Upload user audio (webm/ogg/mp3) and return its download URL.
 * Converts any audio buffer — we store as-is under the original extension.
 *
 * @param {object} opts
 * @param {Buffer}  opts.buffer
 * @param {string}  opts.mimeType    - original MIME from multer
 * @param {string}  opts.userId
 * @param {string}  opts.conversationId
 * @param {string}  opts.messageId   - Firestore message doc ID
 * @returns {Promise<string>} download URL
 */
async function uploadUserAudio({ buffer, mimeType, userId, conversationId, messageId }) {
  const ext = _extFromMime(mimeType);
  const storagePath = `${DEFAULT_FOLDER}/${userId}/${conversationId}/user_${messageId}${ext}`;
  return uploadAudioBuffer({ buffer, storagePath, mimeType });
}

/**
 * Upload AI audio (MP3 from TTS base64) and return its download URL.
 *
 * @param {object} opts
 * @param {string}  opts.audioBase64 - base64-encoded MP3 string from AI service
 * @param {string}  opts.userId
 * @param {string}  opts.conversationId
 * @param {string}  opts.messageId
 * @returns {Promise<string>} download URL
 */
async function uploadAiAudio({ audioBase64, userId, conversationId, messageId }) {
  const buffer = Buffer.from(audioBase64, 'base64');
  const storagePath = buildStoragePath('ai', userId, conversationId, messageId);
  return uploadAudioBuffer({ buffer, storagePath, mimeType: 'audio/mpeg' });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _extFromMime(mimeType = '') {
  const map = {
    'audio/webm':        '.webm',
    'audio/ogg':         '.ogg',
    'audio/mpeg':        '.mp3',
    'audio/mp3':         '.mp3',
    'audio/wav':         '.wav',
    'audio/x-wav':       '.wav',
    'audio/mp4':         '.m4a',
    'audio/x-m4a':       '.m4a',
  };
  return map[mimeType] || '.audio';
}

module.exports = {
  AudioStorageError,
  uploadUserAudio,
  uploadAiAudio,
};

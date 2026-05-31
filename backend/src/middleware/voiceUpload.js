const multer = require('multer');

const VOICE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/webm',
]);

const storage = multer.memoryStorage();

function createVoiceUploadError({
  status = 400,
  code,
  message,
}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function fileFilter(req, file, cb) {
  if (!file || !ALLOWED_AUDIO_MIME_TYPES.has(file.mimetype)) {
    const error = createVoiceUploadError({
      status: 400,
      code: 'VOICE_FILE_UNSUPPORTED_TYPE',
      message: 'Unsupported audio format',
    });
    return cb(error);
  }

  return cb(null, true);
}

const voiceUpload = multer({
  storage,
  limits: {
    fileSize: VOICE_UPLOAD_MAX_BYTES,
    files: 1,
  },
  fileFilter,
});

const uploadVoiceAudio = voiceUpload.single('audio');

function handleVoiceUpload(req, res, next) {
  uploadVoiceAudio(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: 'Audio file is too large',
          code: 'VOICE_FILE_TOO_LARGE'
        });
      }

      return res.status(400).json({
        success: false,
        error: 'Invalid audio upload payload',
        code: 'VOICE_UPLOAD_INVALID'
      });
    }

    if (error?.code === 'VOICE_FILE_UNSUPPORTED_TYPE') {
      return res.status(error.status || 400).json({
        success: false,
        error: error.message || 'Unsupported audio format',
        code: error.code
      });
    }

    if (error?.code === 'VOICE_UPLOAD_INVALID') {
      return res.status(error.status || 400).json({
        success: false,
        error: error.message || 'Invalid audio upload payload',
        code: error.code
      });
    }

    return next(error);
  });
}

module.exports = {
  ALLOWED_AUDIO_MIME_TYPES,
  VOICE_UPLOAD_MAX_BYTES,
  handleVoiceUpload,
  uploadVoiceAudio,
  voiceUpload,
};

const multer = require('multer');
const Busboy = require('busboy');

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

/**
 * Firebase Cloud Functions (Gen2 / Cloud Run) buffers the whole request body
 * into `req.rawBody` BEFORE Express middleware runs. multer parses the request
 * as a stream, but that stream is already drained, so busboy throws
 * "Unexpected end of form" and every voice upload 500s.
 *
 * When `req.rawBody` is present we parse the multipart payload from that buffer
 * with busboy directly (populating `req.file` / `req.body` exactly like
 * multer.single('audio') would). Local/dev runs (plain `node server.js`) have
 * no rawBody, so they keep using multer's streaming parser unchanged.
 */
function parseMultipartFromRawBody(req, res, next) {
  let bb;
  try {
    bb = Busboy({
      headers: req.headers,
      limits: { fileSize: VOICE_UPLOAD_MAX_BYTES, files: 1 },
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: 'Invalid audio upload payload',
      code: 'VOICE_UPLOAD_INVALID',
    });
  }

  const fields = {};
  const fileChunks = [];
  let fileInfo = null;
  let fileTooLarge = false;
  let unsupportedType = false;
  let settled = false;

  const fail = (status, error, code) => {
    if (settled) return;
    settled = true;
    res.status(status).json({ success: false, error, code });
  };

  bb.on('field', (name, value) => {
    fields[name] = value;
  });

  bb.on('file', (name, stream, info) => {
    const mimeType = info?.mimeType || info?.mimetype;

    if (name !== 'audio' || !ALLOWED_AUDIO_MIME_TYPES.has(mimeType)) {
      unsupportedType = true;
      stream.resume(); // drain so busboy can finish
      return;
    }

    fileInfo = {
      fieldname: name,
      originalname: info?.filename || 'voice-message.webm',
      mimetype: mimeType,
      encoding: info?.encoding || '7bit',
    };

    stream.on('limit', () => {
      fileTooLarge = true;
    });
    stream.on('data', (chunk) => {
      fileChunks.push(chunk);
    });
  });

  bb.on('error', () => {
    fail(400, 'Invalid audio upload payload', 'VOICE_UPLOAD_INVALID');
  });

  bb.on('close', () => {
    if (settled) return;

    if (fileTooLarge) {
      return fail(413, 'Audio file is too large', 'VOICE_FILE_TOO_LARGE');
    }

    if (unsupportedType || !fileInfo) {
      return fail(400, 'Unsupported audio format', 'VOICE_FILE_UNSUPPORTED_TYPE');
    }

    const buffer = Buffer.concat(fileChunks);
    req.file = { ...fileInfo, buffer, size: buffer.length };
    req.body = { ...(req.body || {}), ...fields };

    settled = true;
    next();
  });

  bb.end(req.rawBody);
}

function handleVoiceUpload(req, res, next) {
  // Cloud Functions path: the body is already buffered into req.rawBody.
  if (Buffer.isBuffer(req.rawBody)) {
    return parseMultipartFromRawBody(req, res, next);
  }

  // Local / streaming path: multer reads the live request stream.
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

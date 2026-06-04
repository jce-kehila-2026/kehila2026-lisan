const pino = require('pino');
const crypto = require('crypto');

// PII redaction mode:
//   "hash" — replace userId with sha256 prefix (default, GDPR-safe)
//   "raw"  — log raw userId (dev only)
//   "drop" — strip userId entirely
const PII_MODE = String(process.env.LOG_PII_MODE || 'hash').toLowerCase();

const logger = pino({
  name: 'lisan-backend',
  level: process.env.LOG_LEVEL || 'info',
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      // Never log secrets even if accidentally passed
      'req.headers.authorization',
      'req.headers["x-internal-service-secret"]',
      'headers.authorization',
      'headers["x-internal-service-secret"]',
      'password',
      'passwordHash',
      'serviceAccount',
    ],
    censor: '[REDACTED]',
  },
});

function hashUserId(uid) {
  if (!uid) return null;
  if (PII_MODE === 'raw') return uid;
  if (PII_MODE === 'drop') return null;
  // hash mode (default): short, deterministic, non-reversible
  return 'uid_' + crypto
    .createHash('sha256')
    .update(String(uid))
    .digest('hex')
    .slice(0, 12);
}

function toErrorPayload(error) {
  if (!error) {
    return undefined;
  }

  return {
    message: error.message || 'Unknown error',
    code: error.code || null,
    status: error.status || null,
    stack: error.stack || null,
  };
}

module.exports = {
  logger,
  toErrorPayload,
  hashUserId,
};

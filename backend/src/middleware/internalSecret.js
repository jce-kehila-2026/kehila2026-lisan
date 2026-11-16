const crypto = require('crypto');
const { requireAuth } = require('./auth');

/**
 * Service-to-service auth: the ai-service sends X-Internal-Service-Secret
 * matching AI_SERVICE_INTERNAL_SECRET (same value on both sides).
 *
 * When the secret is not configured:
 * - NODE_ENV=production -> reject (fail closed)
 * - otherwise           -> allow (local dev / tests)
 */

function getExpectedSecret() {
  return String(process.env.AI_SERVICE_INTERNAL_SECRET || '').trim();
}

function isProduction() {
  return String(process.env.NODE_ENV || '').trim() === 'production';
}

function getProvidedSecret(req) {
  return String(req.headers['x-internal-service-secret'] || '').trim();
}

function secretsMatch(provided, expected) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireInternalSecret(req, res, next) {
  const expected = getExpectedSecret();

  if (!expected) {
    if (isProduction()) {
      return res.status(401).json({
        success: false,
        error: 'Internal service secret is not configured',
        code: 'INTERNAL_SECRET_NOT_CONFIGURED',
      });
    }
    return next();
  }

  const provided = getProvidedSecret(req);

  if (!provided) {
    return res.status(401).json({
      success: false,
      error: 'Missing internal service secret',
      code: 'MISSING_SECRET',
    });
  }

  if (!secretsMatch(provided, expected)) {
    return res.status(403).json({
      success: false,
      error: 'Invalid internal service secret',
      code: 'INVALID_SECRET',
    });
  }

  return next();
}

/**
 * Accepts either a valid internal secret header (ai-service) or a logged-in
 * user (Bearer JWT). Never open to anonymous callers.
 */
function requireUserOrInternalSecret(req, res, next) {
  const expected = getExpectedSecret();
  const provided = getProvidedSecret(req);

  if (provided) {
    if (expected && secretsMatch(provided, expected)) {
      req.isInternalService = true;
      return next();
    }
    return res.status(403).json({
      success: false,
      error: 'Invalid internal service secret',
      code: 'INVALID_SECRET',
    });
  }

  return requireAuth(req, res, next);
}

module.exports = {
  requireInternalSecret,
  requireUserOrInternalSecret,
};

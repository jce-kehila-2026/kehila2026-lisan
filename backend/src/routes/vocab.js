const express = require('express');

const router = express.Router();

const vocabController = require('../controllers/vocabController');

/**
 * Internal-secret guard — mirrors the pattern used by ai-service.
 * Requests must include X-Internal-Service-Secret header matching
 * the AI_SERVICE_INTERNAL_SECRET env var (same value on both sides).
 */
function requireInternalSecret(req, res, next) {
  const expected = (process.env.AI_SERVICE_INTERNAL_SECRET || '').trim();

  // If the secret is not configured, allow all (dev / test environments)
  if (!expected) return next();

  const provided = (
    req.headers['x-internal-service-secret'] || ''
  ).trim();

  if (!provided) {
    return res.status(401).json({
      success: false,
      error: 'Missing internal service secret',
      code: 'MISSING_SECRET',
    });
  }

  if (provided !== expected) {
    return res.status(403).json({
      success: false,
      error: 'Invalid internal service secret',
      code: 'INVALID_SECRET',
    });
  }

  return next();
}

// POST /api/vocab/progress — called from ai-service (fire-and-forget)
router.post('/progress', requireInternalSecret, vocabController.trackVocabProgress);

// GET /api/vocab/progress/:userId — for teacher dashboard / admin
router.get('/progress/:userId', requireInternalSecret, vocabController.getVocabProgress);

module.exports = router;

'use strict';

/**
 * /api/internal — service-to-service endpoints for ai-service.
 * Protected by X-Internal-Service-Secret (AI_SERVICE_INTERNAL_SECRET).
 * Fails CLOSED in production when the secret is not configured.
 */
const crypto = require('crypto');
const express = require('express');

const reviewService = require('../services/aiReviewService');
const summaryService = require('../services/aiCorrectionSummaryService');

const router = express.Router();

function secretsMatch(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireInternalSecret(req, res, next) {
  const expected = String(process.env.AI_SERVICE_INTERNAL_SECRET || '').trim();
  const isProduction = String(process.env.NODE_ENV || '').trim() === 'production';

  if (!expected) {
    if (isProduction) {
      return res.status(503).json({
        success: false,
        error: 'Internal service secret is not configured',
        code: 'INTERNAL_SECRET_NOT_CONFIGURED',
      });
    }
    return next();
  }

  const provided = String(req.headers['x-internal-service-secret'] || '').trim();
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

router.get('/ai-corrections', requireInternalSecret, async (req, res) => {
  try {
    const corrections = await reviewService.getActiveCorrectionsForLevel(req.query.level);
    // AI summary of these rules — only when it covers exactly the current
    // active rules; otherwise null and ai-service uses the raw list.
    let summary = null;
    try {
      const level = String(req.query.level || '').trim().toUpperCase();
      summary = await summaryService.getServableSummary(level, corrections);
    } catch (error) {
      console.error('[internal] ai-correction summary:', error?.message || error);
    }
    return res.status(200).json({ success: true, corrections, summary });
  } catch (error) {
    const status = error?.status || 500;
    if (status >= 500) console.error('[internal] ai-corrections:', error?.message || error);
    return res.status(status).json({
      success: false,
      error: status >= 500 ? 'Server error' : error.message,
      code: status >= 500 ? 'AI_CORRECTIONS_ERROR' : error.code,
    });
  }
});

module.exports = router;

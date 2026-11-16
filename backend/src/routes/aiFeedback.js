'use strict';

/**
 * Owner approval queue for reviewer feedback — ADMIN ONLY (not teachers).
 * Mounted under /api/admin before the generic admin router. Guards are
 * per-route (not router.use) so unmatched /api/admin/* requests fall through
 * to the admin router untouched.
 */
const express = require('express');

const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const reviewService = require('../services/aiReviewService');

const router = express.Router();
const adminOnly = [requireAuth, requireRole('admin')];

function sendError(res, error, fallbackCode) {
  const status = error?.status || 500;
  if (status >= 500) {
    console.error(`[ai-feedback] ${fallbackCode}:`, error?.message || error);
  }
  return res.status(status).json({
    success: false,
    error: status >= 500 ? 'Server error' : error.message,
    code: status >= 500 ? fallbackCode : error.code,
  });
}

router.get('/ai-feedback', ...adminOnly, async (req, res) => {
  try {
    const feedback = await reviewService.listFeedback({
      status: req.query.status || 'pending',
    });
    return res.status(200).json({ success: true, feedback });
  } catch (error) {
    return sendError(res, error, 'AI_FEEDBACK_LIST_ERROR');
  }
});

router.post('/ai-feedback/:id/approve', ...adminOnly, async (req, res) => {
  try {
    const correction = await reviewService.approveFeedback(req.params.id, req.user.uid, req.body);
    return res.status(200).json({ success: true, correction });
  } catch (error) {
    return sendError(res, error, 'AI_FEEDBACK_APPROVE_ERROR');
  }
});

router.post('/ai-feedback/:id/reject', ...adminOnly, async (req, res) => {
  try {
    const result = await reviewService.rejectFeedback(req.params.id, req.user.uid, req.body);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, 'AI_FEEDBACK_REJECT_ERROR');
  }
});

router.get('/ai-corrections', ...adminOnly, async (req, res) => {
  try {
    const corrections = await reviewService.listCorrections({
      activeOnly: req.query.active === 'true',
    });
    return res.status(200).json({ success: true, corrections });
  } catch (error) {
    return sendError(res, error, 'AI_CORRECTIONS_LIST_ERROR');
  }
});

router.patch('/ai-corrections/:id', ...adminOnly, async (req, res) => {
  try {
    const result = await reviewService.setCorrectionActive(
      req.params.id,
      req.body?.active,
      req.user.uid
    );
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, 'AI_CORRECTIONS_UPDATE_ERROR');
  }
});

module.exports = router;

'use strict';

/**
 * /api/review — volunteer reviewers (and admins) read AI tutor conversations
 * anonymously and flag wrong AI replies. Reviewers get NOTHING else: every
 * other teacher/admin route keeps its own role guard that excludes them.
 */
const express = require('express');

const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { adminRateLimit } = require('../middleware/adminRateLimit');
const reviewService = require('../services/aiReviewService');

const router = express.Router();

router.use(requireAuth, requireRole('reviewer', 'admin'), adminRateLimit);

function sendError(res, error, fallbackCode) {
  const status = error?.status || 500;
  if (status >= 500) {
    console.error(`[review] ${fallbackCode}:`, error?.message || error);
  }
  return res.status(status).json({
    success: false,
    error: status >= 500 ? 'Server error' : error.message,
    code: status >= 500 ? fallbackCode : error.code,
  });
}

router.get('/conversations', async (req, res) => {
  try {
    const { level, status, cursor } = req.query;
    const result = await reviewService.listConversations({
      level: level || undefined,
      status: status || undefined,
      cursor: cursor || undefined,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, 'REVIEW_LIST_ERROR');
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await reviewService.getReviewerStats(req.user.uid);
    return res.status(200).json({ success: true, stats });
  } catch (error) {
    return sendError(res, error, 'REVIEW_STATS_ERROR');
  }
});

router.get('/conversations/:id', async (req, res) => {
  try {
    const conversation = await reviewService.getConversation(req.params.id, req.user.uid);
    return res.status(200).json({ success: true, conversation });
  } catch (error) {
    return sendError(res, error, 'REVIEW_GET_ERROR');
  }
});

router.post('/conversations/:id/flags', async (req, res) => {
  try {
    const flag = await reviewService.createFlag(req.params.id, req.user.uid, req.body);
    return res.status(201).json({ success: true, flag });
  } catch (error) {
    return sendError(res, error, 'REVIEW_FLAG_ERROR');
  }
});

router.post('/conversations/:id/complete', async (req, res) => {
  try {
    const result = await reviewService.completeReview(req.params.id, req.user.uid);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, 'REVIEW_COMPLETE_ERROR');
  }
});

module.exports = router;

'use strict';

/**
 * Approval queue for reviewer feedback and the AI summary of the approved
 * rules — admins and teachers (not reviewers or students).
 * Mounted under /api/admin before the generic admin router. Guards are
 * per-route (not router.use) so unmatched /api/admin/* requests fall through
 * to the admin router untouched.
 */
const express = require('express');

const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const reviewService = require('../services/aiReviewService');
const summaryService = require('../services/aiCorrectionSummaryService');

const router = express.Router();
// Teachers and admins both review the volunteers' flags (owner decision 2026-11-16).
const staffOnly = [requireAuth, requireRole('admin', 'teacher')];

// Rebuild the AI summary of the affected level(s) off the request path.
function regenerateSummariesFor(ruleLevel) {
  summaryService.triggerForRuleLevel(ruleLevel).catch((error) => {
    console.error('[ai-feedback] summary regeneration failed:', error?.message || error);
  });
}

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

router.get('/ai-feedback', ...staffOnly, async (req, res) => {
  try {
    const feedback = await reviewService.listFeedback({
      status: req.query.status || 'pending',
    });
    return res.status(200).json({ success: true, feedback });
  } catch (error) {
    return sendError(res, error, 'AI_FEEDBACK_LIST_ERROR');
  }
});

router.post('/ai-feedback/:id/approve', ...staffOnly, async (req, res) => {
  try {
    const correction = await reviewService.approveFeedback(req.params.id, req.user.uid, req.body);
    regenerateSummariesFor(correction.level);
    return res.status(200).json({ success: true, correction });
  } catch (error) {
    return sendError(res, error, 'AI_FEEDBACK_APPROVE_ERROR');
  }
});

router.post('/ai-feedback/:id/reject', ...staffOnly, async (req, res) => {
  try {
    const result = await reviewService.rejectFeedback(req.params.id, req.user.uid, req.body);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, 'AI_FEEDBACK_REJECT_ERROR');
  }
});

router.get('/ai-corrections', ...staffOnly, async (req, res) => {
  try {
    const corrections = await reviewService.listCorrections({
      activeOnly: req.query.active === 'true',
    });
    return res.status(200).json({ success: true, corrections });
  } catch (error) {
    return sendError(res, error, 'AI_CORRECTIONS_LIST_ERROR');
  }
});

router.patch('/ai-corrections/:id', ...staffOnly, async (req, res) => {
  try {
    const result = await reviewService.setCorrectionActive(
      req.params.id,
      req.body?.active,
      req.user.uid
    );
    regenerateSummariesFor(result.level);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, 'AI_CORRECTIONS_UPDATE_ERROR');
  }
});

// ── AI summary of the active rules per level ────────────────────────────────

router.get('/ai-correction-summaries', ...staffOnly, async (req, res) => {
  try {
    const summaries = await summaryService.listSummaries();
    return res.status(200).json({ success: true, summaries });
  } catch (error) {
    return sendError(res, error, 'AI_SUMMARIES_LIST_ERROR');
  }
});

router.put('/ai-correction-summaries/:level', ...staffOnly, async (req, res) => {
  try {
    const summary = await summaryService.editSummary(req.params.level, req.body?.text, req.user.uid);
    return res.status(200).json({ success: true, summary });
  } catch (error) {
    return sendError(res, error, 'AI_SUMMARY_EDIT_ERROR');
  }
});

router.post('/ai-correction-summaries/:level/regenerate', ...staffOnly, async (req, res) => {
  try {
    const summary = await summaryService.regenerateSummary(req.params.level);
    return res.status(200).json({ success: true, summary });
  } catch (error) {
    return sendError(res, error, 'AI_SUMMARY_REGENERATE_ERROR');
  }
});

router.post('/ai-correction-summaries/:level/revert', ...staffOnly, async (req, res) => {
  try {
    const summary = await summaryService.revertSummary(req.params.level, req.user.uid);
    return res.status(200).json({ success: true, summary });
  } catch (error) {
    return sendError(res, error, 'AI_SUMMARY_REVERT_ERROR');
  }
});

module.exports = router;

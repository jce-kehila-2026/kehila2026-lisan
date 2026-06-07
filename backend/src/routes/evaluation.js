const express = require('express');
const axios = require('axios');

const router = express.Router();

const evaluationController = require('../controllers/evaluationController');
const { requireAuth } = require('../middleware/auth');
const {
  createAiRequestConfig,
  mapAiServiceError,
  normalizeAiServiceBaseUrl,
} = require('../services/aiChatService');

router.get('/context', evaluationController.getContext);
router.post('/attempts', evaluationController.saveAttempt);

// ── Speaking evaluation proxy ────────────────────────────────────────────────
router.post('/speaking', requireAuth, async (req, res) => {
  try {
    const userToken = req.headers.authorization?.replace('Bearer ', '') || null;
    const response = await axios.post(
      `${normalizeAiServiceBaseUrl()}/api/ai/evaluate-speaking`,
      req.body,
      createAiRequestConfig({
        headers: {
          'Content-Type': 'application/json',
          ...(userToken ? { 'Authorization': `Bearer ${userToken}` } : {}),
          ...(req.user?.uid ? { 'X-User-ID': req.user.uid } : {}),
        },
      })
    );
    return res.status(200).json(response.data);
  } catch (error) {
    const mapped = mapAiServiceError(error);
    return res.status(mapped.status).json({
      success: false,
      error: mapped.message,
      code: mapped.code,
    });
  }
});

module.exports = router;

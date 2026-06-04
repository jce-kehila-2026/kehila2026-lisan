const express = require('express');
const axios = require('axios');

const router = express.Router();

const adminController = require('../controllers/adminController');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { adminRateLimit } = require('../middleware/adminRateLimit');
const { createAiRequestConfig } = require('../services/aiChatService');

// Apply rate limit to ALL admin routes — prevents log/analytics hammering
router.use(adminRateLimit);

router.get('/users', requireAuth, requireRole('admin'), adminController.getAllUsers);

router.get('/chat/stats', requireAuth, requireRole('admin'), adminController.getChatStats);

router.post('/users', requireAuth, requireRole('admin'), adminController.createUser);

router.put('/users/:id', requireAuth, requireRole('admin'), adminController.updateUser);

router.delete('/users/:id', requireAuth, requireRole('admin'), adminController.deleteUser);

// ── AI service analytics proxy ────────────────────────────────────────────────
const AI_SERVICE_BASE = process.env.AI_SERVICE_URL || 'http://localhost:8000';

router.get('/ai/analytics', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const response = await axios.get(
      `${AI_SERVICE_BASE}/api/ai/analytics`,
      createAiRequestConfig()
    );
    return res.status(200).json(response.data);
  } catch (error) {
    const status = error?.response?.status || 502;
    return res.status(status).json({
      success: false,
      error: 'Failed to fetch AI analytics',
      code: 'AI_ANALYTICS_ERROR',
    });
  }
});

// ── Voice circuit breaker reset (admin recovery action) ─────────────────────
router.post(
  '/ai/circuits/reset',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      const response = await axios.post(
        `${AI_SERVICE_BASE}/api/ai/admin/circuits/reset`,
        {},
        createAiRequestConfig({
          headers: { 'Content-Type': 'application/json' },
        })
      );
      return res.status(200).json(response.data);
    } catch (error) {
      const status = error?.response?.status || 502;
      return res.status(status).json({
        success: false,
        error: 'Failed to reset AI circuits',
        code: 'AI_CIRCUIT_RESET_ERROR',
      });
    }
  }
);

// ── AI provider logs proxy ────────────────────────────────────────────────────
router.get('/ai/logs', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { provider, status, limit = 100 } = req.query;
    const params = new URLSearchParams();
    if (provider) params.set('provider', provider);
    if (status) params.set('status', status);
    params.set('limit', String(limit));

    const response = await axios.get(
      `${AI_SERVICE_BASE}/api/ai/logs?${params.toString()}`,
      createAiRequestConfig()
    );
    return res.status(200).json(response.data);
  } catch (error) {
    const status = error?.response?.status || 502;
    return res.status(status).json({
      success: false,
      error: 'Failed to fetch AI logs',
      code: 'AI_LOGS_ERROR',
    });
  }
});

module.exports = router;

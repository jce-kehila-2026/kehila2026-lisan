const express = require('express');
const axios = require('axios');
const multer = require('multer');

const router = express.Router();

const adminController = require('../controllers/adminController');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { adminRateLimit } = require('../middleware/adminRateLimit');
const { createAiRequestConfig } = require('../services/aiChatService');

router.use(adminRateLimit);

const AI_SERVICE_BASE = process.env.AI_SERVICE_URL || 'http://localhost:8000';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

router.get('/users', requireAuth, requireRole('admin'), adminController.getAllUsers);

router.get('/chat/stats', requireAuth, requireRole('admin'), adminController.getChatStats);

router.post('/users', requireAuth, requireRole('admin'), adminController.createUser);

router.put('/users/:id', requireAuth, requireRole('admin'), adminController.updateUser);

router.delete('/users/:id', requireAuth, requireRole('admin'), adminController.deleteUser);

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
      code: 'AI_ANALYTICS_ERROR'
    });
  }
});

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
          headers: { 'Content-Type': 'application/json' }
        })
      );

      return res.status(200).json(response.data);
    } catch (error) {
      const status = error?.response?.status || 502;

      return res.status(status).json({
        success: false,
        error: 'Failed to reset AI circuits',
        code: 'AI_CIRCUIT_RESET_ERROR'
      });
    }
  }
);

router.get('/ai/logs', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { provider, status, limit = 100 } = req.query;

    const params = new URLSearchParams();

    if (provider) {
      params.set('provider', provider);
    }

    if (status) {
      params.set('status', status);
    }

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
      code: 'AI_LOGS_ERROR'
    });
  }
});

router.post(
  '/audio-recordings',
  requireAuth,
  requireRole('admin'),
  upload.fields([
    { name: 'audioFile', maxCount: 1 },
    { name: 'jsonFile', maxCount: 1 }
  ]),
  adminController.createAudioRecording
);

router.get(
  '/audio-recordings',
  requireAuth,
  requireRole('admin'),
  adminController.getAudioRecordings
);

router.get(
  '/audio-recordings/:id',
  requireAuth,
  requireRole('admin'),
  adminController.getAudioRecordingById
);

router.put(
  '/audio-recordings/:id',
  requireAuth,
  requireRole('admin'),
  upload.fields([
    { name: 'audioFile', maxCount: 1 },
    { name: 'jsonFile', maxCount: 1 }
  ]),
  adminController.updateAudioRecording
);

router.delete(
  '/audio-recordings/:id',
  requireAuth,
  requireRole('admin'),
  adminController.deleteAudioRecording
);

router.get(
  '/conversations',
  requireAuth,
  requireRole('admin'),
  adminController.getAllConversations
);

router.get(
  '/conversations/:id',
  requireAuth,
  requireRole('admin'),
  adminController.getConversationById
);

module.exports = router;
const express = require('express');

const router = express.Router();

const vocabController = require('../controllers/vocabController');
const { requireInternalSecret } = require('../middleware/internalSecret');

// Internal-secret guard (see middleware/internalSecret.js). Fails closed when
// AI_SERVICE_INTERNAL_SECRET is unset in production.

// POST /api/vocab/progress — called from ai-service (fire-and-forget)
router.post('/progress', requireInternalSecret, vocabController.trackVocabProgress);

// GET /api/vocab/progress/:userId — for teacher dashboard / admin
router.get('/progress/:userId', requireInternalSecret, vocabController.getVocabProgress);

module.exports = router;

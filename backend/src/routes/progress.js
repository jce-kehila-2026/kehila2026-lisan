const express = require('express');

const router = express.Router();

const progressController = require('../controllers/progressController');

const { requireAuth } = require('../middleware/auth');

router.get(
  '/me',
  requireAuth,
  progressController.getMyProgress
);

router.get(
  '/me/attempts',
  requireAuth,
  progressController.getMyAttempts
);
router.get(
  '/game',
  requireAuth,
  progressController.getMyGameProgress
);

router.post(
  '/game/complete',
  requireAuth,
  progressController.completeGameLevel
);
module.exports = router;
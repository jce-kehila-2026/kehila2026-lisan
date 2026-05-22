const express = require('express');

const router = express.Router();

const chatController = require('../controllers/chatController');

const { requireAuth } = require('../middleware/auth');

router.post(
  '/',
  requireAuth,
  chatController.createChat
);

router.get(
  '/my',
  requireAuth,
  chatController.getMyChats
);

router.get(
  '/:chatId',
  requireAuth,
  chatController.getChatById
);

router.post(
  '/:chatId/messages',
  requireAuth,
  chatController.addMessage
);

module.exports = router;
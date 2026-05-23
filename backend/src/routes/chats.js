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

router.delete(
  '/:chatId',
  requireAuth,
  chatController.deleteChat
);

router.delete(
  '/:chatId',
  requireAuth,
  chatController.deleteChat
);

router.post(
  '/:chatId/ai-message',
  requireAuth,
  chatController.sendAiMessage
);

module.exports = router;
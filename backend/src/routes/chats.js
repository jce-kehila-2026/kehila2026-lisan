const express = require('express');

const router = express.Router();

const chatController = require('../controllers/chatController');

const { requireAuth } = require('../middleware/auth');
const { handleVoiceUpload } = require('../middleware/voiceUpload');
const { voiceRateLimit } = require('../middleware/voiceRateLimit');

router.post(
  '/',
  requireAuth,
  chatController.createChat
);

router.post(
  '/preferences',
  requireAuth,
  chatController.saveChatPreferences
);

router.get(
  '/my',
  requireAuth,
  chatController.getMyChats
);

router.get(
  '/conversations',
  requireAuth,
  chatController.getMyChats
);

router.post(
  '/conversations/:id/archive',
  requireAuth,
  chatController.archiveConversation
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

router.post(
  '/voice',
  requireAuth,
  voiceRateLimit,
  handleVoiceUpload,
  chatController.sendVoiceMessage
);

module.exports = router;

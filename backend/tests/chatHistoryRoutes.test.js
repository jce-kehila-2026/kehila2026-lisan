const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const { requireAuth } = require('../src/middleware/auth');
const { createConversationControllerHelpers } = require('../src/controllers/chatController');
const { ChatPersistenceError } = require('../src/services/chatPersistenceService');

function createMockChatPersistenceService() {
  const calls = {
    listConversations: [],
    getConversationWithMessages: [],
    softDeleteConversation: [],
  };

  return {
    calls,
    async listConversations(payload) {
      calls.listConversations.push(payload);

      return [
        {
          id: 'conversation-1',
          title: 'Practice greeting',
          level: 'A1',
          createdAt: '2026-05-22T10:00:00.000Z',
          updatedAt: '2026-05-22T10:03:00.000Z',
          lastMessageAt: '2026-05-22T10:03:00.000Z',
          lastMessagePreview: 'Hello back',
          messageCount: 2,
        },
      ];
    },
    async getConversationWithMessages(payload) {
      calls.getConversationWithMessages.push(payload);

      if (payload.conversationId === 'missing') {
        throw new ChatPersistenceError('Conversation not found', {
          code: 'CONVERSATION_NOT_FOUND',
          status: 404,
        });
      }

      return {
        conversation: {
          id: payload.conversationId,
          title: 'Practice greeting',
          level: 'A1',
          createdAt: '2026-05-22T10:00:00.000Z',
          updatedAt: '2026-05-22T10:03:00.000Z',
          lastMessageAt: '2026-05-22T10:03:00.000Z',
          lastMessagePreview: 'Hello back',
          messageCount: 2,
        },
        messages: [
          {
            id: 'message-1',
            role: 'user',
            rawText: 'Hello',
            createdAt: '2026-05-22T10:01:00.000Z',
          },
          {
            id: 'message-2',
            role: 'assistant',
            textHe: 'Hello back',
            textAr: null,
            fallbackUsed: false,
            fallbackReason: null,
            createdAt: '2026-05-22T10:02:00.000Z',
          },
        ],
      };
    },
    async softDeleteConversation(payload) {
      calls.softDeleteConversation.push(payload);

      if (payload.conversationId === 'forbidden') {
        throw new ChatPersistenceError('Conversation access denied', {
          code: 'CONVERSATION_FORBIDDEN',
          status: 403,
        });
      }

      return { id: payload.conversationId, success: true };
    },
  };
}

async function withServer(chatPersistenceService, run) {
  const app = express();
  const controllerHelpers = createConversationControllerHelpers({
    chatPersistenceService,
  });

  app.use(express.json());
  app.get('/api/chat/conversations', requireAuth, controllerHelpers.listConversations);
  app.get('/api/chat/conversations/:conversationId', requireAuth, controllerHelpers.getConversation);
  app.delete('/api/chat/conversations/:conversationId', requireAuth, controllerHelpers.deleteConversation);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

function createAuthToken(payload = {}) {
  return jwt.sign({
    uid: 'user-123',
    role: 'student',
    ...payload,
  }, process.env.JWT_SECRET);
}

test('GET /api/chat/conversations returns the authenticated user conversation list', async () => {
  process.env.JWT_SECRET = 'chat-history-test-secret';
  const chatPersistenceService = createMockChatPersistenceService();

  await withServer(chatPersistenceService, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat/conversations`, {
      headers: {
        Authorization: `Bearer ${createAuthToken()}`,
      },
    });

    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.conversations.length, 1);
    assert.equal(body.conversations[0].id, 'conversation-1');
    assert.deepEqual(chatPersistenceService.calls.listConversations[0], {
      userId: 'user-123',
    });
  });
});

test('GET /api/chat/conversations/:conversationId returns one conversation with messages', async () => {
  process.env.JWT_SECRET = 'chat-history-test-secret';
  const chatPersistenceService = createMockChatPersistenceService();

  await withServer(chatPersistenceService, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat/conversations/conversation-1`, {
      headers: {
        Authorization: `Bearer ${createAuthToken()}`,
      },
    });

    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.conversation.id, 'conversation-1');
    assert.equal(body.messages.length, 2);
    assert.equal(body.messages[0].role, 'user');
    assert.equal(body.messages[1].role, 'assistant');
  });
});

test('GET /api/chat/conversations/:conversationId returns 404 for missing conversations', async () => {
  process.env.JWT_SECRET = 'chat-history-test-secret';
  const chatPersistenceService = createMockChatPersistenceService();

  await withServer(chatPersistenceService, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat/conversations/missing`, {
      headers: {
        Authorization: `Bearer ${createAuthToken()}`,
      },
    });

    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error, 'Conversation not found');
  });
});

test('DELETE /api/chat/conversations/:conversationId soft deletes the conversation', async () => {
  process.env.JWT_SECRET = 'chat-history-test-secret';
  const chatPersistenceService = createMockChatPersistenceService();

  await withServer(chatPersistenceService, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat/conversations/conversation-1`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${createAuthToken()}`,
      },
    });

    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(chatPersistenceService.calls.softDeleteConversation[0], {
      conversationId: 'conversation-1',
      userId: 'user-123',
    });
  });
});

test('DELETE /api/chat/conversations/:conversationId returns 403 for forbidden access', async () => {
  process.env.JWT_SECRET = 'chat-history-test-secret';
  const chatPersistenceService = createMockChatPersistenceService();

  await withServer(chatPersistenceService, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat/conversations/forbidden`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${createAuthToken()}`,
      },
    });

    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error, 'Conversation access denied');
  });
});

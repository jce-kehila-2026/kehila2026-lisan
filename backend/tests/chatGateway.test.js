const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const { requireAuth } = require('../src/middleware/auth');
const { createPostChatHandler } = require('../src/controllers/chatController');
const { AiServiceError } = require('../src/services/aiChatService');

function createMockDb(level = 'A2') {
  return {
    collection(name) {
      assert.equal(name, 'users');

      return {
        doc(uid) {
          return {
            async get() {
              return {
                exists: true,
                data() {
                  return { uid, level };
                },
              };
            },
          };
        },
      };
    },
  };
}

function createMockChatPersistenceService() {
  const calls = {
    createOrLoadConversation: [],
    saveUserMessage: [],
    saveAssistantMessage: [],
  };

  return {
    calls,
    async createOrLoadConversation(payload) {
      calls.createOrLoadConversation.push(payload);

      return {
        id: payload.conversationId || 'conversation-new',
        isNew: !payload.conversationId,
      };
    },
    async saveUserMessage(payload) {
      calls.saveUserMessage.push(payload);

      return {
        id: 'user-message-1',
        ...payload,
      };
    },
    async saveAssistantMessage(payload) {
      calls.saveAssistantMessage.push(payload);

      return {
        id: 'assistant-message-1',
        ...payload,
      };
    },
  };
}

async function withServer(options, run) {
  const app = express();
  app.use(express.json());
  app.post('/api/chat', requireAuth, createPostChatHandler(options));

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

test('POST /api/chat rejects requests without a JWT', async () => {
  process.env.JWT_SECRET = 'chat-gateway-test-secret';
  const chatPersistenceService = createMockChatPersistenceService();

  await withServer({
    db: createMockDb(),
    chatPersistenceService,
    requestAiChat: async () => {
      throw new Error('should not be called');
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'שלום',
      }),
    });

    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error, 'No token provided');
  });
});

test('POST /api/chat forwards a valid request through the authenticated gateway', async () => {
  process.env.JWT_SECRET = 'chat-gateway-test-secret';
  let receivedPayload = null;
  const chatPersistenceService = createMockChatPersistenceService();

  await withServer({
    db: createMockDb('A2'),
    chatPersistenceService,
    requestAiChat: async (payload) => {
      receivedPayload = payload;

      return {
        answerHe: 'שלום!',
        answerAr: null,
        fallbackUsed: false,
        fallbackReason: null,
        level: payload.level,
        model: 'mock-model',
        latencyMs: 42,
        cacheHit: true,
        routerHit: false,
        contextChunkIds: [],
        guardrail: {
          vocabularyLeakage: false,
          blockedTokens: [],
        },
      };
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${createAuthToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: '  שלום  ',
        includeArabic: true,
      }),
    });

    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(receivedPayload, {
      message: 'שלום',
      level: 'A2',
      includeArabic: true,
    });
    assert.equal(body.conversationId, 'conversation-new');
    assert.equal(body.messageId, 'assistant-message-1');
    assert.equal(body.answerHe, 'שלום!');
    assert.equal(body.level, 'A2');
    assert.equal(body.cacheHit, true);
    assert.deepEqual(body.suggestedNextPrompts, [
      'מה השם שלך?',
      'איך אומרים תודה?',
      'אני רוצה לתרגל משפט קצר.',
      'אפשר הסבר בערבית?',
    ]);
    assert.equal(chatPersistenceService.calls.saveUserMessage.length, 1);
    assert.equal(chatPersistenceService.calls.saveAssistantMessage.length, 1);
  });
});

test('POST /api/chat returns a validation error for an empty message', async () => {
  process.env.JWT_SECRET = 'chat-gateway-test-secret';
  const chatPersistenceService = createMockChatPersistenceService();

  await withServer({
    db: createMockDb(),
    chatPersistenceService,
    requestAiChat: async () => {
      throw new Error('should not be called');
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${createAuthToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: '   ',
      }),
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'Invalid chat request');
    assert.deepEqual(body.details, ['message is required']);
  });
});

test('POST /api/chat returns a safe timeout fallback when the AI service times out', async () => {
  process.env.JWT_SECRET = 'chat-gateway-test-secret';
  const chatPersistenceService = createMockChatPersistenceService();

  await withServer({
    db: createMockDb(),
    chatPersistenceService,
    requestAiChat: async () => {
      throw new AiServiceError('timed out', {
        code: 'AI_SERVICE_TIMEOUT',
        status: 504,
      });
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${createAuthToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'שלום',
      }),
    });

    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.fallbackUsed, true);
    assert.equal(body.fallbackReason, 'MODEL_TIMEOUT');
    assert.equal(body.messageId, 'assistant-message-1');
    assert.equal(body.answerHe, 'המערכת איטית כרגע. נסה שוב בעוד רגע.');
    assert.equal(chatPersistenceService.calls.saveAssistantMessage[0].response.fallbackReason, 'MODEL_TIMEOUT');
  });
});

test('POST /api/chat returns a safe service fallback when the AI service fails', async () => {
  process.env.JWT_SECRET = 'chat-gateway-test-secret';
  const chatPersistenceService = createMockChatPersistenceService();

  await withServer({
    db: createMockDb(),
    chatPersistenceService,
    requestAiChat: async () => {
      throw new AiServiceError('down', {
        code: 'AI_SERVICE_UNAVAILABLE',
        status: 502,
      });
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${createAuthToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'שלום',
        conversationId: 'conversation-1',
      }),
    });

    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.conversationId, 'conversation-1');
    assert.equal(body.messageId, 'assistant-message-1');
    assert.equal(body.fallbackUsed, true);
    assert.equal(body.fallbackReason, 'SERVICE_UNAVAILABLE');
    assert.equal(body.answerHe, 'נסה שוב עם שאלה קצרה.');
  });
});

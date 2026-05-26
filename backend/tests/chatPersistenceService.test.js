const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ChatPersistenceError,
  createChatPersistenceService,
} = require('../src/services/chatPersistenceService');

function createMockAdmin() {
  return {
    firestore: {
      FieldValue: {
        serverTimestamp() {
          return { __op: 'serverTimestamp' };
        },
        increment(value) {
          return { __op: 'increment', value };
        },
      },
    },
  };
}

function createMockDb() {
  let docCounter = 0;
  let messageCounter = 0;
  const store = new Map();

  function pathKey(segments) {
    return segments.join('/');
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function ensureDoc(pathSegments) {
    const key = pathKey(pathSegments);

    if (!store.has(key)) {
      store.set(key, {
        data: null,
      });
    }

    return store.get(key);
  }

  function applyFieldValuePatch(target, patch) {
    const next = { ...(target || {}) };

    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === 'object' && value.__op === 'increment') {
        next[key] = (Number(next[key]) || 0) + value.value;
        continue;
      }

      if (value && typeof value === 'object' && value.__op === 'serverTimestamp') {
        next[key] = '__server_timestamp__';
        continue;
      }

      next[key] = value;
    }

    return next;
  }

  function createDocumentRef(pathSegments) {
    return {
      id: pathSegments[pathSegments.length - 1],
      async get() {
        const doc = ensureDoc(pathSegments);

        return {
          id: pathSegments[pathSegments.length - 1],
          exists: doc.data !== null,
          data() {
            return doc.data === null ? undefined : clone(doc.data);
          },
        };
      },
      async set(data) {
        const doc = ensureDoc(pathSegments);
        doc.data = applyFieldValuePatch({}, data);
      },
      async update(patch) {
        const doc = ensureDoc(pathSegments);

        if (doc.data === null) {
          throw new Error(`Document does not exist: ${pathKey(pathSegments)}`);
        }

        doc.data = applyFieldValuePatch(doc.data, patch);
      },
      collection(name) {
        return createCollectionRef([...pathSegments, name]);
      },
    };
  }

  function createCollectionRef(pathSegments) {
    function getDirectDocuments() {
      const directDepth = pathSegments.length + 1;
      const docs = [];

      for (const [key, value] of store.entries()) {
        const segments = key.split('/');

        if (
          segments.length === directDepth
          && pathKey(segments.slice(0, pathSegments.length)) === pathKey(pathSegments)
          && value.data !== null
        ) {
          docs.push({
            id: segments[segments.length - 1],
            data() {
              return clone(value.data);
            },
          });
        }
      }

      return docs;
    }

    return {
      doc(id) {
        const resolvedId = id || `doc-${++docCounter}`;
        return createDocumentRef([...pathSegments, resolvedId]);
      },
      async add(data) {
        const messageId = `message-${++messageCounter}`;
        const ref = createDocumentRef([...pathSegments, messageId]);
        await ref.set(data);
        return ref;
      },
      async get() {
        return {
          docs: getDirectDocuments(),
        };
      },
      where(field, operator, expectedValue) {
        assert.equal(operator, '==');

        return {
          async get() {
            return {
              docs: getDirectDocuments().filter((doc) => doc.data()?.[field] === expectedValue),
            };
          },
        };
      },
    };
  }

  return {
    collection(name) {
      return createCollectionRef([name]);
    },
    dump(path) {
      const entry = store.get(path);
      return entry ? clone(entry.data) : null;
    },
    dumpCollection(prefix) {
      const results = [];

      for (const [key, value] of store.entries()) {
        if (key.startsWith(prefix) && value.data !== null) {
          results.push({
            path: key,
            data: clone(value.data),
          });
        }
      }

      return results;
    },
  };
}

test('chat persistence creates a new conversation and stores both messages', async () => {
  const db = createMockDb();
  const service = createChatPersistenceService({
    db,
    admin: createMockAdmin(),
  });

  const conversation = await service.createOrLoadConversation({
    conversationId: null,
    userId: 'user-1',
    level: 'A1',
    initialMessageText: 'First practice question',
  });

  const userMessage = await service.saveUserMessage({
    conversationId: conversation.id,
    userId: 'user-1',
    rawText: 'First practice question',
    clientMessageId: 'client-1',
  });

  const assistantMessage = await service.saveAssistantMessage({
    conversationId: conversation.id,
    userId: 'user-1',
    response: {
      answerHe: 'Short answer',
      answerAr: null,
      fallbackUsed: false,
      fallbackReason: null,
      cacheHit: true,
      routerHit: false,
      latencyMs: 32,
    },
  });

  const conversationDoc = db.dump(`chatConversations/${conversation.id}`);
  const messages = db.dumpCollection(`chatConversations/${conversation.id}/messages/`);

  assert.equal(conversationDoc.userId, 'user-1');
  assert.equal(conversationDoc.level, 'A1');
  assert.equal(conversationDoc.messageCount, 2);
  assert.equal(conversationDoc.lastMessagePreview, 'Short answer');
  assert.equal(messages.length, 2);
  assert.equal(userMessage.id, 'message-1');
  assert.equal(assistantMessage.id, 'message-2');
});

test('chat persistence loads an owned conversation and appends messages', async () => {
  const db = createMockDb();
  const service = createChatPersistenceService({
    db,
    admin: createMockAdmin(),
  });

  const conversation = await service.createConversation({
    userId: 'user-1',
    level: 'A2',
    initialMessageText: 'Existing conversation',
  });

  const loaded = await service.createOrLoadConversation({
    conversationId: conversation.id,
    userId: 'user-1',
    level: 'A2',
    initialMessageText: 'Ignored text',
  });

  await service.saveUserMessage({
    conversationId: loaded.id,
    userId: 'user-1',
    rawText: 'Another question',
  });

  const conversationDoc = db.dump(`chatConversations/${conversation.id}`);

  assert.equal(loaded.id, conversation.id);
  assert.equal(conversationDoc.messageCount, 1);
  assert.equal(conversationDoc.lastMessagePreview, 'Another question');
});

test('chat persistence blocks access to another user conversation', async () => {
  const db = createMockDb();
  const service = createChatPersistenceService({
    db,
    admin: createMockAdmin(),
  });

  const conversation = await service.createConversation({
    userId: 'user-1',
    level: 'A1',
    initialMessageText: 'Private chat',
  });

  await assert.rejects(
    () => service.createOrLoadConversation({
      conversationId: conversation.id,
      userId: 'user-2',
      level: 'A1',
      initialMessageText: 'Ignored text',
    }),
    (error) => {
      assert.ok(error instanceof ChatPersistenceError);
      assert.equal(error.code, 'CONVERSATION_FORBIDDEN');
      return true;
    }
  );
});

test('chat persistence stores assistant fallback responses after AI failure', async () => {
  const db = createMockDb();
  const service = createChatPersistenceService({
    db,
    admin: createMockAdmin(),
  });

  const conversation = await service.createConversation({
    userId: 'user-1',
    level: 'A1',
    initialMessageText: 'Question',
  });

  await service.saveUserMessage({
    conversationId: conversation.id,
    userId: 'user-1',
    rawText: 'Question',
  });

  const fallbackMessage = await service.saveAssistantMessage({
    conversationId: conversation.id,
    userId: 'user-1',
    response: {
      answerHe: 'Try again with a shorter question.',
      answerAr: null,
      fallbackUsed: true,
      fallbackReason: 'SERVICE_UNAVAILABLE',
      cacheHit: false,
      routerHit: false,
      latencyMs: 0,
    },
  });

  const savedMessages = db.dumpCollection(`chatConversations/${conversation.id}/messages/`);
  const savedFallback = savedMessages.find((entry) => entry.path.endsWith(fallbackMessage.id));

  assert.equal(savedFallback.data.role, 'assistant');
  assert.equal(savedFallback.data.fallbackUsed, true);
  assert.equal(savedFallback.data.fallbackReason, 'SERVICE_UNAVAILABLE');
  assert.equal(savedFallback.data.textHe, 'Try again with a shorter question.');
});

test('chat persistence lists only active conversations for the authenticated user', async () => {
  const db = createMockDb();
  const service = createChatPersistenceService({
    db,
    admin: createMockAdmin(),
  });

  const archivedConversation = await service.createConversation({
    userId: 'user-1',
    level: 'A1',
    initialMessageText: 'Archived conversation',
  });
  const activeConversation = await service.createConversation({
    userId: 'user-1',
    level: 'A2',
    initialMessageText: 'Active conversation',
  });
  await service.createConversation({
    userId: 'user-2',
    level: 'B1',
    initialMessageText: 'Other user conversation',
  });

  await service.softDeleteConversation({
    conversationId: archivedConversation.id,
    userId: 'user-1',
  });

  const conversations = await service.listConversations({ userId: 'user-1' });

  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].id, activeConversation.id);
  assert.equal(conversations[0].title, 'Active conversation');
});

test('chat persistence returns a conversation with ordered messages', async () => {
  const db = createMockDb();
  const service = createChatPersistenceService({
    db,
    admin: createMockAdmin(),
  });

  const conversation = await service.createConversation({
    userId: 'user-1',
    level: 'A1',
    initialMessageText: 'Warmup',
  });

  await service.saveUserMessage({
    conversationId: conversation.id,
    userId: 'user-1',
    rawText: 'Hello',
  });

  await service.saveAssistantMessage({
    conversationId: conversation.id,
    userId: 'user-1',
    response: {
      answerHe: 'Hello back',
      answerAr: null,
      fallbackUsed: false,
      fallbackReason: null,
      cacheHit: false,
      routerHit: false,
      latencyMs: 12,
    },
  });

  const payload = await service.getConversationWithMessages({
    conversationId: conversation.id,
    userId: 'user-1',
  });

  assert.equal(payload.conversation.id, conversation.id);
  assert.equal(payload.messages.length, 2);
  assert.equal(payload.messages[0].role, 'user');
  assert.equal(payload.messages[0].rawText, 'Hello');
  assert.equal(payload.messages[1].role, 'assistant');
  assert.equal(payload.messages[1].textHe, 'Hello back');
});

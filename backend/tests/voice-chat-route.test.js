const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const jwt = require('jsonwebtoken');
const request = require('supertest');

const backendRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(backendRoot, 'src');

function clearBackendModuleCache() {
  for (const modulePath of Object.keys(require.cache)) {
    if (modulePath.startsWith(srcRoot)) {
      delete require.cache[modulePath];
    }
  }
}

function createFirebaseMock() {
  const chats = new Map();
  const users = new Map();
  let nextChatId = 1;

  const FieldValue = {
    serverTimestamp() {
      return { __op: 'serverTimestamp' };
    },
    arrayUnion(...items) {
      return { __op: 'arrayUnion', items };
    },
  };

  function cloneChatData(data = {}) {
    return {
      ...data,
      messages: Array.isArray(data.messages) ? [...data.messages] : [],
    };
  }

  function applyUpdate(target, update = {}) {
    for (const [key, value] of Object.entries(update)) {
      if (value && value.__op === 'arrayUnion') {
        const existing = Array.isArray(target[key]) ? target[key] : [];
        target[key] = [...existing, ...value.items];
        continue;
      }

      if (value && value.__op === 'serverTimestamp') {
        target[key] = 'SERVER_TIMESTAMP';
        continue;
      }

      target[key] = value;
    }
  }

  function seedChat(data = {}) {
    const id = data.id || `chat-${nextChatId++}`;
    chats.set(id, cloneChatData(data));
    return id;
  }

  function seedUser(data = {}) {
    const id = data.id || data.uid || `user-${users.size + 1}`;
    users.set(id, { ...data });
    return id;
  }

  const tokenUsage = [];
  const tokenUsageCollection = {
    async add(data) {
      tokenUsage.push(data);
      return { id: `token-${tokenUsage.length}` };
    }
  };

  const chatCollection = {
    async get() {
      const docs = Array.from(chats.entries()).map(([id, chat]) => ({
        id,
        data: () => chat,
      }));

      return {
        forEach(callback) {
          docs.forEach((doc) => callback(doc));
        },
        docs,
      };
    },
    async add(data) {
      const id = `chat-${nextChatId++}`;
      chats.set(id, cloneChatData(data));
      return {
        id,
        async update(update) {
          const target = chats.get(id);
          applyUpdate(target, update);
        },
        async get() {
          return {
            exists: true,
            data: () => chats.get(id),
          };
        },
      };
    },
    doc(id) {
      return {
        async get() {
          const chat = chats.get(id);
          return {
            exists: Boolean(chat),
            data: () => chat,
          };
        },
        async update(update) {
          if (!chats.has(id)) {
            throw new Error(`Chat not found: ${id}`);
          }
          applyUpdate(chats.get(id), update);
        },
        async delete() {
          chats.delete(id);
        },
      };
    },
    where(field, operator, value) {
      return {
        async get() {
          const docs = Array.from(chats.entries())
            .filter(([, chat]) => {
              if (operator !== '==') {
                return true;
              }

              return chat?.[field] === value;
            })
            .map(([id, chat]) => ({
              id,
              data: () => chat,
            }));

          return {
            forEach(callback) {
              docs.forEach((doc) => callback(doc));
            },
            docs,
          };
        },
      };
    },
  };

  const db = {
    collection(name) {
      if (name === 'chatSessions') {
        return chatCollection;
      }

      if (name === 'users') {
        return {
          doc(id) {
            return {
              async get() {
                const user = users.get(id);
                return {
                  exists: Boolean(user),
                  data: () => user,
                };
              },
              async update(update) {
                if (!users.has(id)) {
                  throw new Error(`User not found: ${id}`);
                }
                applyUpdate(users.get(id), update);
              },
            };
          },
        };
      }

      if (name === 'tokenUsage') {
        return tokenUsageCollection;
      }

      throw new Error(`Unexpected collection access: ${name}`);
    },
  };

  return {
    admin: {
      firestore: {
        FieldValue,
      },
    },
    db,
    chats,
    seedChat,
    users,
    seedUser,
    tokenUsage,
  };
}

function loadAppWithMocks(options = {}) {
  clearBackendModuleCache();

  process.env.JWT_SECRET = 'test-jwt-secret';
  delete process.env.SKIP_AUTH;
  delete process.env.SKIP_AUTH_ROLE;
  process.env.VOICE_RATE_LIMIT_WINDOW_MS = String(options.voiceWindowMs ?? 60 * 1000);
  process.env.VOICE_RATE_LIMIT_MAX = String(options.voiceLimit ?? 5);
  if (options.storeVoiceAudio) {
    process.env.STORE_VOICE_AUDIO = 'true';
  } else {
    delete process.env.STORE_VOICE_AUDIO;
  }

  const firebaseMock = createFirebaseMock();
  const aiCalls = [];
  const uploadCalls = [];

  const configFirebasePath = path.join(srcRoot, 'config', 'firebase.js');
  const aiServicePath = path.join(srcRoot, 'services', 'aiChatService.js');
  const persistencePath = path.join(srcRoot, 'services', 'chatPersistenceService.js');

  require.cache[configFirebasePath] = {
    id: configFirebasePath,
    filename: configFirebasePath,
    loaded: true,
    exports: firebaseMock,
  };

  require.cache[aiServicePath] = {
    id: aiServicePath,
    filename: aiServicePath,
    loaded: true,
    exports: {
      sendChatMessageToAi: async () => ({
        answerHe: 'בסדר.',
        inputTokens: 12,
        outputTokens: 8,
        provider: 'mock-provider',
        model: 'mock-model',
      }),
      sendVoiceMessageToAi: async (payload) => {
        aiCalls.push(payload);
        if (options.aiError) {
          throw options.aiError;
        }

        return options.aiResponse || {
          answerHe: 'שלום',
          answerAr: null,
          fallbackUsed: false,
          fallbackReason: null,
          level: payload.level || 'A1',
          model: 'mock-model',
          provider: 'mock-provider',
          latencyMs: 120,
          transcribedText: 'שלום',
          suggestedNextPrompts: ['מה שלומך?'],
          inputTokens: 15,
          outputTokens: 10,
        };
      },
    },
  };

  require.cache[persistencePath] = {
    id: persistencePath,
    filename: persistencePath,
    loaded: true,
    exports: {
      DEFAULT_CHAT_TITLE: 'New Chat',
      DEFAULT_VOICE_CHAT_TITLE: 'Voice Chat',
      createChatSession: async ({
        userId,
        level = 'A1',
        title = null,
        firstUserMessageText = null,
        defaultIncludeArabic = false,
        defaultTitle = 'New Chat',
      }) => {
        const chatTitle =
          (typeof title === 'string' && title.trim()) ||
          (typeof firstUserMessageText === 'string' && firstUserMessageText.trim()) ||
          defaultTitle;
        const docRef = await firebaseMock.db.collection('chatSessions').add({
          userId,
          title: chatTitle,
          level,
          defaultIncludeArabic: defaultIncludeArabic === true,
          isArchived: false,
          archivedAt: null,
          startedAt: firebaseMock.admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebaseMock.admin.firestore.FieldValue.serverTimestamp(),
          messages: [],
        });

        return {
          chatId: docRef.id,
          chatRef: docRef,
          chat: {
            userId,
            title: chatTitle,
            level,
            defaultIncludeArabic: defaultIncludeArabic === true,
            messages: [],
          },
        };
      },
      applyAutoTitleToChatIfNeeded: async ({
        chatRef,
        chat,
        firstUserMessageText,
        fallbackTitle = 'New Chat',
      }) => {
        if (typeof firstUserMessageText !== 'string' || !firstUserMessageText.trim()) {
          return chat?.title || fallbackTitle;
        }

        const nextTitle = firstUserMessageText
          .trim()
          .split(/\s+/)
          .slice(0, 10)
          .join(' ');

        await chatRef.update({
          title: nextTitle,
          updatedAt: firebaseMock.admin.firestore.FieldValue.serverTimestamp(),
        });

        if (chat) {
          chat.title = nextTitle;
        }

        return nextTitle;
      },
      uploadStudentVoiceAudio: async (payload) => {
        uploadCalls.push(payload);
        return {
          audioUrl: 'https://storage.example.test/audio.webm',
          storagePath: 'chat-audio/test/chat-1/audio.webm',
          bucketName: 'test-bucket',
          contentType: payload.mimeType,
          sizeBytes: payload.audioBuffer.length,
        };
      },
    },
  };

  const { app } = require(path.join(srcRoot, 'server.js'));

  return {
    app,
    chats: firebaseMock.chats,
    seedChat: firebaseMock.seedChat,
    users: firebaseMock.users,
    seedUser: firebaseMock.seedUser,
    tokenUsage: firebaseMock.tokenUsage,
    aiCalls,
    uploadCalls,
  };
}

function createAuthToken(overrides = {}) {
  return jwt.sign(
    {
      uid: overrides.uid || 'student-1',
      role: overrides.role || 'student',
      ...(overrides.level ? { level: overrides.level } : {}),
    },
    process.env.JWT_SECRET
  );
}

test('POST /api/chat/preferences saves defaultIncludeArabic on the user document', async () => {
  const { app, seedUser, users } = loadAppWithMocks();
  const token = createAuthToken({ uid: 'student-preferences' });
  seedUser({
    id: 'student-preferences',
    chatPreferences: {
      defaultIncludeArabic: false,
    },
  });

  const response = await request(app)
    .post('/api/chat/preferences')
    .set('Authorization', `Bearer ${token}`)
    .send({
      defaultIncludeArabic: true,
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.preferences.defaultIncludeArabic, true);
  assert.equal(
    users.get('student-preferences').chatPreferences.defaultIncludeArabic,
    true
  );
});

test('GET /api/admin/chat/stats returns daily chat analytics for admins only', async () => {
  const { app, seedChat } = loadAppWithMocks();
  const adminToken = createAuthToken({
    uid: 'admin-stats',
    role: 'admin',
  });
  const studentToken = createAuthToken({
    uid: 'student-stats',
    role: 'student',
  });
  const now = new Date();
  const todayIso = now.toISOString();
  const yesterdayIso = new Date(now.getTime() - (24 * 60 * 60 * 1000)).toISOString();

  seedChat({
    id: 'chat-today-1',
    userId: 'student-a',
    title: 'Today 1',
    level: 'A1',
    startedAt: todayIso,
    messages: [
      { sender: 'user', text: 'hi', createdAt: todayIso },
      { sender: 'ai', text: 'hello', createdAt: todayIso },
    ],
  });
  seedChat({
    id: 'chat-today-2',
    userId: 'student-b',
    title: 'Today 2',
    level: 'B1',
    startedAt: todayIso,
    messages: [
      { sender: 'user', text: 'hey', createdAt: todayIso },
    ],
  });
  seedChat({
    id: 'chat-yesterday',
    userId: 'student-a',
    title: 'Yesterday',
    level: 'A2',
    startedAt: yesterdayIso,
    messages: [
      { sender: 'user', text: 'old', createdAt: yesterdayIso },
    ],
  });

  const deniedResponse = await request(app)
    .get('/api/admin/chat/stats')
    .set('Authorization', `Bearer ${studentToken}`);

  assert.equal(deniedResponse.status, 403);

  const response = await request(app)
    .get('/api/admin/chat/stats')
    .set('Authorization', `Bearer ${adminToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.stats.messagesToday, 3);
  assert.equal(response.body.stats.newConversationsToday, 2);
  assert.equal(response.body.stats.activeUsersToday, 2);
});

test('POST /api/chat/:chatId/messages handles 100 sequential writes without major response degradation', async () => {
  const { app, seedUser, chats } = loadAppWithMocks();
  const token = createAuthToken({
    uid: 'student-load-test',
    role: 'student',
    level: 'B1',
  });

  seedUser({
    id: 'student-load-test',
    level: 'B1',
    chatPreferences: {
      defaultIncludeArabic: false,
    },
  });

  const createChatResponse = await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Load test chat',
      level: 'A1',
    });

  assert.equal(createChatResponse.status, 201);
  const chatId = createChatResponse.body.chat.id;
  const durationsMs = [];

  for (let index = 0; index < 100; index += 1) {
    const startedAt = process.hrtime.bigint();
    const response = await request(app)
      .post(`/api/chat/${chatId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sender: 'user',
        text: `load-test-message-${index + 1}`,
      });
    const endedAt = process.hrtime.bigint();

    assert.equal(response.status, 201);
    durationsMs.push(Number(endedAt - startedAt) / 1e6);
  }

  const averageMs =
    durationsMs.reduce((sum, duration) => sum + duration, 0) / durationsMs.length;
  const firstTwentyAverageMs =
    durationsMs.slice(0, 20).reduce((sum, duration) => sum + duration, 0) / 20;
  const lastTwentyAverageMs =
    durationsMs.slice(-20).reduce((sum, duration) => sum + duration, 0) / 20;

  const storedChat = chats.get(chatId);
  assert.ok(storedChat);
  assert.equal(storedChat.messages.length, 100);
  assert.ok(
    averageMs < 50,
    `Expected average response time < 50ms, received ${averageMs.toFixed(2)}ms`
  );
  assert.ok(
    lastTwentyAverageMs <= (firstTwentyAverageMs * 3) + 5,
    `Expected tail latency to stay controlled, first20=${firstTwentyAverageMs.toFixed(2)}ms last20=${lastTwentyAverageMs.toFixed(2)}ms`
  );
});

test('POST /api/chat/voice uses the saved defaultIncludeArabic preference for a new conversation', async () => {
  const { app, seedUser, aiCalls, chats } = loadAppWithMocks();
  const token = createAuthToken({ uid: 'student-pref-voice' });
  seedUser({
    id: 'student-pref-voice',
    chatPreferences: {
      defaultIncludeArabic: true,
    },
  });

  const response = await request(app)
    .post('/api/chat/voice')
    .set('Authorization', `Bearer ${token}`)
    .field('level', 'A1')
    .attach('audio', Buffer.from('voice-pref-default'), {
      filename: 'pref.webm',
      contentType: 'audio/webm',
    });

  assert.equal(response.status, 200);
  assert.equal(aiCalls.length, 1);
  assert.equal(aiCalls[0].includeArabic, true);

  const storedChat = chats.get(response.body.conversationId);
  assert.ok(storedChat);
  assert.equal(storedChat.defaultIncludeArabic, true);
});

test('POST /api/chat/voice ignores request level for new conversations and uses req.user.level', async () => {
  const { app, aiCalls, chats } = loadAppWithMocks();
  const token = createAuthToken({
    uid: 'student-level-sync',
    level: 'B2',
  });

  const response = await request(app)
    .post('/api/chat/voice')
    .set('Authorization', `Bearer ${token}`)
    .field('level', 'A1')
    .attach('audio', Buffer.from('voice-level-sync'), {
      filename: 'level-sync.webm',
      contentType: 'audio/webm',
    });

  assert.equal(response.status, 200);
  assert.equal(aiCalls.length, 1);
  assert.equal(aiCalls[0].level, 'B2');

  const storedChat = chats.get(response.body.conversationId);
  assert.ok(storedChat);
  assert.equal(storedChat.level, 'B2');
});

test('POST /api/chat/voice saves the voice exchange and forwards the audio buffer', async () => {
  const { app, chats, aiCalls, uploadCalls } = loadAppWithMocks();
  const token = createAuthToken();

  const response = await request(app)
    .post('/api/chat/voice')
    .set('Authorization', `Bearer ${token}`)
    .field('level', 'A1')
    .field('includeArabic', 'false')
    .attach('audio', Buffer.from('voice-bytes-success'), {
      filename: 'sample.webm',
      contentType: 'audio/webm',
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.answerHe, 'שלום');
  assert.equal(response.body.transcribedText, 'שלום');
  assert.equal(response.body.audioUrl, null);
  assert.equal(response.body.audioStored, false);
  assert.match(response.body.conversationId, /^chat-\d+$/);

  assert.equal(uploadCalls.length, 0);

  assert.equal(aiCalls.length, 1);
  assert.equal(aiCalls[0].mimeType, 'audio/webm');
  assert.equal(Buffer.isBuffer(aiCalls[0].audioBuffer), true);
  assert.equal(aiCalls[0].level, 'A1');

  const storedChat = chats.get(response.body.conversationId);
  assert.ok(storedChat);
  assert.equal(storedChat.title, response.body.transcribedText);
  assert.equal(storedChat.messages.length, 2);
  assert.equal(storedChat.messages[0].type, 'voice');
  assert.equal(storedChat.messages[0].audioUrl, null);
  assert.equal(storedChat.messages[0].audioStored, false);
  assert.equal(storedChat.messages[0].transcribedText, 'שלום');
  assert.equal(storedChat.messages[1].sender, 'ai');
  assert.equal(storedChat.messages[1].text, 'שלום');
  assert.equal(storedChat.messages[1].fallbackUsed, false);
});

test('POST /api/chat/voice uploads audio only when STORE_VOICE_AUDIO is enabled', async () => {
  const { app, chats, uploadCalls } = loadAppWithMocks({ storeVoiceAudio: true });
  const token = createAuthToken({ uid: 'student-store-audio' });

  const response = await request(app)
    .post('/api/chat/voice')
    .set('Authorization', `Bearer ${token}`)
    .field('level', 'A1')
    .attach('audio', Buffer.from('voice-bytes-store'), {
      filename: 'store.webm',
      contentType: 'audio/webm',
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.audioUrl, 'https://storage.example.test/audio.webm');
  assert.equal(response.body.audioStored, true);
  assert.equal(uploadCalls.length, 1);
  assert.equal(uploadCalls[0].mimeType, 'audio/webm');
  assert.equal(Buffer.isBuffer(uploadCalls[0].audioBuffer), true);

  const storedChat = chats.get(response.body.conversationId);
  assert.ok(storedChat);
  assert.equal(storedChat.messages[0].audioUrl, 'https://storage.example.test/audio.webm');
  assert.equal(storedChat.messages[0].audioStored, true);
});

test('POST /api/chat/voice reuses the previous response when clientMessageId is retried', async () => {
  const { app, chats, aiCalls, uploadCalls } = loadAppWithMocks();
  const token = createAuthToken({ uid: 'student-idempotent-voice' });

  const firstResponse = await request(app)
    .post('/api/chat/voice')
    .set('Authorization', `Bearer ${token}`)
    .field('level', 'A1')
    .field('clientMessageId', 'voice-msg-1')
    .attach('audio', Buffer.from('voice-idempotent-first'), {
      filename: 'first.webm',
      contentType: 'audio/webm',
    });

  assert.equal(firstResponse.status, 200);

  const secondResponse = await request(app)
    .post('/api/chat/voice')
    .set('Authorization', `Bearer ${token}`)
    .field('conversationId', firstResponse.body.conversationId)
    .field('level', 'A1')
    .field('clientMessageId', 'voice-msg-1')
    .attach('audio', Buffer.from('voice-idempotent-retry'), {
      filename: 'retry.webm',
      contentType: 'audio/webm',
    });

  assert.equal(secondResponse.status, 200);
  assert.equal(secondResponse.body.deduplicated, true);
  assert.equal(secondResponse.body.conversationId, firstResponse.body.conversationId);
  assert.equal(secondResponse.body.answerHe, firstResponse.body.answerHe);
  assert.equal(secondResponse.body.audioUrl, firstResponse.body.audioUrl);
  assert.equal(aiCalls.length, 1);
  assert.equal(uploadCalls.length, 0);

  const storedChat = chats.get(firstResponse.body.conversationId);
  assert.ok(storedChat);
  assert.equal(storedChat.messages.length, 2);
});

test('POST /api/chat/conversations/:id/archive marks the conversation as archived', async () => {
  const { app, chats, seedChat } = loadAppWithMocks();
  const token = createAuthToken({ uid: 'student-archive-owner' });
  const conversationId = seedChat({
    userId: 'student-archive-owner',
    title: 'Archive me',
    level: 'A1',
    isArchived: false,
    archivedAt: null,
    messages: [],
  });

  const response = await request(app)
    .post(`/api/chat/conversations/${conversationId}/archive`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.archived, true);
  assert.equal(response.body.conversationId, conversationId);

  const storedChat = chats.get(conversationId);
  assert.ok(storedChat);
  assert.equal(storedChat.isArchived, true);
  assert.ok(storedChat.archivedAt);
});

test('GET /api/chat/conversations excludes archived chats by default and includes them on request', async () => {
  const { app, seedChat } = loadAppWithMocks();
  const token = createAuthToken({ uid: 'student-list-owner' });

  seedChat({
    id: 'chat-active',
    userId: 'student-list-owner',
    title: 'Active chat',
    level: 'A1',
    isArchived: false,
    archivedAt: null,
    messages: [],
  });
  seedChat({
    id: 'chat-archived',
    userId: 'student-list-owner',
    title: 'Archived chat',
    level: 'A1',
    isArchived: true,
    archivedAt: '2026-05-28T10:00:00.000Z',
    messages: [],
  });
  seedChat({
    id: 'chat-other-user',
    userId: 'other-student',
    title: 'Other user chat',
    level: 'A1',
    isArchived: false,
    archivedAt: null,
    messages: [],
  });

  const defaultResponse = await request(app)
    .get('/api/chat/conversations')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(defaultResponse.status, 200);
  assert.equal(defaultResponse.body.chats.length, 1);
  assert.equal(defaultResponse.body.chats[0].id, 'chat-active');
  assert.equal(defaultResponse.body.chats[0].isArchived, false);

  const includeArchivedResponse = await request(app)
    .get('/api/chat/conversations?includeArchived=true')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(includeArchivedResponse.status, 200);
  assert.equal(includeArchivedResponse.body.chats.length, 2);
  assert.deepEqual(
    includeArchivedResponse.body.chats.map((chat) => chat.id).sort(),
    ['chat-active', 'chat-archived']
  );
});

test('POST /api/chat/voice rejects requests without an audio file', async () => {
  const { app } = loadAppWithMocks();
  const token = createAuthToken();

  const response = await request(app)
    .post('/api/chat/voice')
    .set('Authorization', `Bearer ${token}`)
    .field('level', 'A1');

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'VOICE_FILE_REQUIRED');
});

test('POST /api/chat/voice rejects unsupported MIME types before calling downstream services', async () => {
  const { app, aiCalls, uploadCalls, chats } = loadAppWithMocks();
  const token = createAuthToken();

  const response = await request(app)
    .post('/api/chat/voice')
    .set('Authorization', `Bearer ${token}`)
    .attach('audio', Buffer.from('not-audio'), {
      filename: 'sample.txt',
      contentType: 'text/plain',
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'VOICE_FILE_UNSUPPORTED_TYPE');
  assert.equal(aiCalls.length, 0);
  assert.equal(uploadCalls.length, 0);
  assert.equal(chats.size, 0);
});

test('POST /api/chat/voice saves fallback history when the AI service fails', async () => {
  const aiFailure = {
    status: 503,
    code: 'AI_SERVICE_UNAVAILABLE',
    message: 'AI service is unavailable',
  };
  const { app, chats, aiCalls, uploadCalls } = loadAppWithMocks({
    aiError: aiFailure,
  });
  const token = createAuthToken({ uid: 'student-ai-failure' });

  const response = await request(app)
    .post('/api/chat/voice')
    .set('Authorization', `Bearer ${token}`)
    .field('level', 'A1')
    .attach('audio', Buffer.from('voice-ai-failure'), {
      filename: 'failure.webm',
      contentType: 'audio/webm',
    });

  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'AI_SERVICE_UNAVAILABLE');
  assert.equal(response.body.fallbackUsed, true);
  assert.equal(response.body.fallbackReason, 'AI_SERVICE_UNAVAILABLE');
  assert.match(response.body.conversationId, /^chat-\d+$/);

  assert.equal(uploadCalls.length, 0);
  assert.equal(aiCalls.length, 1);

  const storedChat = chats.get(response.body.conversationId);
  assert.ok(storedChat);
  assert.equal(storedChat.messages.length, 2);
  assert.equal(storedChat.messages[0].sender, 'user');
  assert.equal(storedChat.messages[0].type, 'voice');
  assert.equal(storedChat.messages[0].audioUrl, null);
  assert.equal(storedChat.messages[0].audioStored, false);
  assert.equal(storedChat.messages[0].transcribedText, null);
  assert.equal(storedChat.messages[1].sender, 'ai');
  assert.equal(storedChat.messages[1].fallbackUsed, true);
  assert.equal(storedChat.messages[1].fallbackReason, 'AI_SERVICE_UNAVAILABLE');
  assert.equal(storedChat.messages[1].text, 'אוי, יש בעיה. נסו שוב מאוחר יותר.');
});

test('POST /api/chat/voice rejects oversized audio files before calling downstream services', async () => {
  const { app, aiCalls, uploadCalls, chats } = loadAppWithMocks();
  const token = createAuthToken({ uid: 'student-oversized-file' });
  const oversizedAudio = Buffer.alloc((10 * 1024 * 1024) + 1, 1);

  const response = await request(app)
    .post('/api/chat/voice')
    .set('Authorization', `Bearer ${token}`)
    .attach('audio', oversizedAudio, {
      filename: 'oversized.webm',
      contentType: 'audio/webm',
    });

  assert.equal(response.status, 413);
  assert.equal(response.body.code, 'VOICE_FILE_TOO_LARGE');
  assert.equal(aiCalls.length, 0);
  assert.equal(uploadCalls.length, 0);
  assert.equal(chats.size, 0);
});

test('POST /api/chat/voice enforces the dedicated voice rate limit', async () => {
  const { app } = loadAppWithMocks({ voiceLimit: 1 });
  const token = createAuthToken({ uid: 'student-rate-limit' });

  const firstResponse = await request(app)
    .post('/api/chat/voice')
    .set('Authorization', `Bearer ${token}`)
    .attach('audio', Buffer.from('voice-first'), {
      filename: 'first.webm',
      contentType: 'audio/webm',
    });

  const secondResponse = await request(app)
    .post('/api/chat/voice')
    .set('Authorization', `Bearer ${token}`)
    .attach('audio', Buffer.from('voice-second'), {
      filename: 'second.webm',
      contentType: 'audio/webm',
    });

  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 429);
  assert.equal(secondResponse.body.code, 'VOICE_RATE_LIMITED');
  assert.ok(secondResponse.headers['retry-after']);
});

test('POST /api/chat/:chatId/ai-message records token usage in Firestore on success', async () => {
  const { app, seedUser, tokenUsage } = loadAppWithMocks();
  const token = createAuthToken({ uid: 'student-tokens-text' });
  seedUser({
    id: 'student-tokens-text',
    level: 'A1',
    chatPreferences: { defaultIncludeArabic: false }
  });

  const createChatResponse = await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Token chat', level: 'A1' });

  const chatId = createChatResponse.body.chat.id;

  const response = await request(app)
    .post(`/api/chat/${chatId}/ai-message`)
    .set('Authorization', `Bearer ${token}`)
    .send({ text: 'שלום' });

  assert.equal(response.status, 200);
  assert.equal(tokenUsage.length, 1);
  assert.equal(tokenUsage[0].userId, 'student-tokens-text');
  assert.equal(tokenUsage[0].chatId, chatId);
  assert.equal(tokenUsage[0].inputTokens, 12);
  assert.equal(tokenUsage[0].outputTokens, 8);
  assert.equal(tokenUsage[0].provider, 'mock-provider');
  assert.equal(tokenUsage[0].model, 'mock-model');
  assert.equal(tokenUsage[0].type, 'text');
});

test('POST /api/chat/voice records token usage in Firestore on success', async () => {
  const { app, tokenUsage } = loadAppWithMocks();
  const token = createAuthToken({ uid: 'student-tokens-voice' });

  const response = await request(app)
    .post('/api/chat/voice')
    .set('Authorization', `Bearer ${token}`)
    .field('level', 'A1')
    .attach('audio', Buffer.from('voice-tokens-test'), {
      filename: 'tokens.webm',
      contentType: 'audio/webm',
    });

  assert.equal(response.status, 200);
  assert.equal(tokenUsage.length, 1);
  assert.equal(tokenUsage[0].userId, 'student-tokens-voice');
  assert.equal(tokenUsage[0].chatId, response.body.conversationId);
  assert.equal(tokenUsage[0].inputTokens, 15);
  assert.equal(tokenUsage[0].outputTokens, 10);
  assert.equal(tokenUsage[0].provider, 'mock-provider');
  assert.equal(tokenUsage[0].model, 'mock-model');
  assert.equal(tokenUsage[0].type, 'voice');
});

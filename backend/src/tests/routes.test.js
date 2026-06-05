'use strict';

/**
 * routes.test.js
 *
 * Integration-style tests for backend routes using supertest.
 * Firebase and ai-service calls are mocked so no real network is needed.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const firestoreMock = Object.assign(() => ({
  collection: () => ({
    doc: () => ({ get: async () => ({ exists: false }) }),
    where: () => ({ get: async () => ({ empty: true, forEach: () => {} }) }),
    add: async () => ({ id: 'mock-id' }),
    limit: () => ({ get: async () => ({ empty: true }) }),
  }),
}), {
  FieldValue: {
    serverTimestamp: () => 'TIMESTAMP',
    arrayUnion: (...args) => args,
  },
});

const firebaseAdminMock = {
  apps: [true],
  initializeApp: () => {},
  credential: { cert: () => {} },
  firestore: firestoreMock,
};

require.cache[require.resolve('firebase-admin')] = {
  exports: firebaseAdminMock,
};

require.cache[require.resolve('../config/firebase')] = {
  exports: {
    db: {
      collection: () => ({
        doc: () => ({ get: async () => ({ exists: false }) }),
        where: () => ({ get: async () => ({ empty: true, forEach: () => {} }) }),
        add: async () => ({ id: 'mock-id' }),
        limit: () => ({ get: async () => ({ empty: true }) }),
      }),
    },
    admin: firebaseAdminMock,
  },
};

require.cache[require.resolve('axios')] = {
  exports: {
    get: async () => ({ data: { uptime_seconds: 1, cache: {}, latency: {} } }),
    post: async () => ({ data: { answerHe: 'שלום' } }),
  },
};

const supertest = require('supertest');
const { app } = require('../server');

describe('GET /api/health', () => {
  test('returns 200 with status ok', async () => {
    const res = await supertest(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  test('response has timestamp field', async () => {
    const res = await supertest(app).get('/api/health');
    assert.ok(res.body.timestamp);
  });
});

describe('GET /api/admin/ai/analytics (no auth)', () => {
  test('returns 401 without Authorization header', async () => {
    const res = await supertest(app).get('/api/admin/ai/analytics');
    assert.ok(
      res.status === 401 || res.status === 403,
      `Expected 401/403, got ${res.status}`,
    );
  });
});

describe('GET /api/admin/ai/logs (no auth)', () => {
  test('returns 401 without Authorization header', async () => {
    const res = await supertest(app).get('/api/admin/ai/logs');
    assert.ok(
      res.status === 401 || res.status === 403,
      `Expected 401/403, got ${res.status}`,
    );
  });
});

describe('POST /api/chats/:chatId/stream (no auth)', () => {
  test('returns 401 without Authorization header', async () => {
    const res = await supertest(app)
      .post('/api/chats/test-chat-id/stream')
      .send({ text: 'שלום', level: 'A1' });
    assert.ok(
      res.status === 401 || res.status === 403,
      `Expected 401/403, got ${res.status}`,
    );
  });
});

describe('POST /api/chats/:chatId/pronunciation (no auth)', () => {
  test('returns 401 without Authorization header', async () => {
    const res = await supertest(app)
      .post('/api/chats/test-chat-id/pronunciation')
      .send({ audioBase64: 'abc', transcribedText: 'שלום' });
    assert.ok(
      res.status === 401 || res.status === 403,
      `Expected 401/403, got ${res.status}`,
    );
  });
});

describe('GET /', () => {
  test('returns running message', async () => {
    const res = await supertest(app).get('/');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('running'));
  });
});

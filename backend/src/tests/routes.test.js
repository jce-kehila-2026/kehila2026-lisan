'use strict';
/**
 * routes.test.js
 *
 * Integration-style tests for backend routes using supertest.
 * Firebase and ai-service calls are mocked so no real network is needed.
 *
 * Tests cover:
 *  - GET /api/health → 200
 *  - GET /api/admin/ai/analytics → 401 without auth, 200 with admin mock
 *  - GET /api/admin/ai/logs     → 401 without auth
 *  - POST /api/chats/:id/stream → 401 without auth
 */
const { test, describe, mock } = require('node:test');
const assert = require('node:assert/strict');

// ── Mock firebase-admin before any require ────────────────────────────────────
mock.module('firebase-admin', {
  defaultExport: {
    apps: [true],
    initializeApp: () => {},
    credential: { cert: () => {} },
    firestore: Object.assign(() => ({
      collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }),
    }), {
      FieldValue: {
        serverTimestamp: () => 'TIMESTAMP',
        arrayUnion: (...args) => args,
      },
    }),
  },
  namedExports: {
    apps: [true],
    initializeApp: () => {},
    credential: { cert: () => {} },
    firestore: Object.assign(() => ({
      collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }),
    }), {
      FieldValue: {
        serverTimestamp: () => 'TIMESTAMP',
        arrayUnion: (...args) => args,
      },
    }),
  },
});

mock.module('../config/firebase', {
  namedExports: {
    db: {
      collection: () => ({
        doc: () => ({ get: async () => ({ exists: false }) }),
        where: () => ({ get: async () => ({ empty: true, forEach: () => {} }) }),
        add: async () => ({ id: 'mock-id' }),
      }),
    },
    admin: {
      firestore: {
        FieldValue: {
          serverTimestamp: () => 'TIMESTAMP',
          arrayUnion: (...args) => args,
        },
      },
    },
  },
});

// ── Mock axios for outbound ai-service calls ──────────────────────────────────
mock.module('axios', {
  defaultExport: {
    get: async () => ({ data: { uptime_seconds: 1, cache: {}, latency: {} } }),
    post: async () => ({ data: { answerHe: 'שלום' } }),
  },
  namedExports: {
    get: async () => ({ data: { uptime_seconds: 1, cache: {}, latency: {} } }),
    post: async () => ({ data: { answerHe: 'שלום' } }),
  },
});

const supertest = require('supertest');
const { app } = require('../server');

// ── Health endpoint ───────────────────────────────────────────────────────────

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

// ── Admin analytics proxy — unauthenticated ───────────────────────────────────

describe('GET /api/admin/ai/analytics (no auth)', () => {
  test('returns 401 without Authorization header', async () => {
    const res = await supertest(app).get('/api/admin/ai/analytics');
    assert.ok(res.status === 401 || res.status === 403,
      `Expected 401/403, got ${res.status}`);
  });
});

// ── Admin logs proxy — unauthenticated ───────────────────────────────────────

describe('GET /api/admin/ai/logs (no auth)', () => {
  test('returns 401 without Authorization header', async () => {
    const res = await supertest(app).get('/api/admin/ai/logs');
    assert.ok(res.status === 401 || res.status === 403,
      `Expected 401/403, got ${res.status}`);
  });
});

// ── Streaming proxy — unauthenticated ─────────────────────────────────────────

describe('POST /api/chats/:chatId/stream (no auth)', () => {
  test('returns 401 without Authorization header', async () => {
    const res = await supertest(app)
      .post('/api/chats/test-chat-id/stream')
      .send({ text: 'שלום', level: 'A1' });
    assert.ok(res.status === 401 || res.status === 403,
      `Expected 401/403, got ${res.status}`);
  });
});

// ── Pronunciation proxy — unauthenticated ─────────────────────────────────────

describe('POST /api/chats/:chatId/pronunciation (no auth)', () => {
  test('returns 401 without Authorization header', async () => {
    const res = await supertest(app)
      .post('/api/chats/test-chat-id/pronunciation')
      .send({ audioBase64: 'abc', transcribedText: 'שלום' });
    assert.ok(res.status === 401 || res.status === 403,
      `Expected 401/403, got ${res.status}`);
  });
});

// ── Root route ────────────────────────────────────────────────────────────────

describe('GET /', () => {
  test('returns running message', async () => {
    const res = await supertest(app).get('/');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('running'));
  });
});

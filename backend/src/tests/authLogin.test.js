'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const { loadAppWithMemoryDb } = require('./helpers/loadAppWithMemoryDb');

function firebaseAuthError(message) {
  const err = new Error('Request failed');
  err.response = { status: 400, data: { error: { message } } };
  return err;
}

describe('POST /api/auth/login returns stable error codes', () => {
  before(() => {
    process.env.FB_WEB_API_KEY = 'test-key';
  });
  after(() => {
    delete process.env.FB_WEB_API_KEY;
  });

  test('missing fields -> 400 MISSING_FIELDS', async () => {
    const { app } = loadAppWithMemoryDb();
    const res = await request(app).post('/api/auth/login').send({ email: 'a@x.com' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'MISSING_FIELDS');
  });

  test('wrong password -> 401 INVALID_CREDENTIALS', async () => {
    const { app } = loadAppWithMemoryDb({
      axiosMock: { post: async () => { throw firebaseAuthError('INVALID_LOGIN_CREDENTIALS'); } },
    });
    const res = await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'bad' });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'INVALID_CREDENTIALS');
  });

  test('disabled account -> 403 ACCOUNT_INACTIVE', async () => {
    const { app } = loadAppWithMemoryDb({
      axiosMock: { post: async () => { throw firebaseAuthError('USER_DISABLED'); } },
    });
    const res = await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'x' });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ACCOUNT_INACTIVE');
  });

  test('inactive profile -> 403 ACCOUNT_INACTIVE', async () => {
    const { app, db } = loadAppWithMemoryDb({
      axiosMock: { post: async () => ({ data: { localId: 'u1' } }) },
    });
    db.seed('users', 'u1', { role: 'student', level: 'A1', isActive: false });
    const res = await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'x' });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ACCOUNT_INACTIVE');
  });

  test('auth provider unreachable -> 500 SERVER_ERROR', async () => {
    const { app } = loadAppWithMemoryDb({
      axiosMock: { post: async () => { throw new Error('ECONNRESET'); } },
    });
    const res = await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'x' });
    assert.equal(res.status, 500);
    assert.equal(res.body.code, 'SERVER_ERROR');
  });

  test('success normalizes a legacy Hebrew level in the token and response', async () => {
    const { app, db } = loadAppWithMemoryDb({
      axiosMock: { post: async () => ({ data: { localId: 'u2' } }) },
    });
    db.seed('users', 'u2', { role: 'student', level: 'ג', email: 'b@x.com' });
    const res = await request(app).post('/api/auth/login').send({ email: 'b@x.com', password: 'x' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(jwt.decode(res.body.token).level, 'B2');
    assert.equal(res.body.user.level, 'B2');
    assert.equal(res.body.user.levelLabel, 'ג');
  });
});

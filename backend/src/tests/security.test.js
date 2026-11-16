'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');

const { loadAppWithMemoryDb, signToken } = require('./helpers/loadAppWithMemoryDb');

const studentToken = (uid = 'stu-1') => signToken({ uid, role: 'student', level: 'A1' });
const teacherToken = () => signToken({ uid: 'teacher-1', role: 'teacher' });

describe('evaluation endpoints require auth', () => {
  test('GET /api/evaluation/context without token -> 401', async () => {
    const { app } = loadAppWithMemoryDb();
    const res = await request(app).get('/api/evaluation/context?userId=u1&activityId=a1');
    assert.equal(res.status, 401);
  });

  test('POST /api/evaluation/attempts without token -> 401', async () => {
    const { app, db } = loadAppWithMemoryDb();
    const res = await request(app)
      .post('/api/evaluation/attempts')
      .send({ userId: 'victim', activityId: 'a1', recognizedTextHe: 'שלום' });
    assert.equal(res.status, 401);
    assert.equal(db._collections.get('studentAttempts'), undefined);
  });

  test('POST /api/evaluation/attempts uses the token uid, not body userId', async () => {
    const { app, db } = loadAppWithMemoryDb();
    const res = await request(app)
      .post('/api/evaluation/attempts')
      .set('Authorization', `Bearer ${studentToken('stu-1')}`)
      .send({ userId: 'victim', activityId: 'a1', recognizedTextHe: 'שלום' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const attempts = Array.from(db._collections.get('studentAttempts').values());
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].userId, 'stu-1');
  });

  test('GET /api/evaluation/context: a student cannot read another user context', async () => {
    const { app, db } = loadAppWithMemoryDb();
    db.seed('users', 'stu-1', { role: 'student', level: 'A1' });
    db.seed('users', 'victim', { role: 'student', level: 'B2' });
    db.seed('activities', 'a1', { title: 'x' });
    const res = await request(app)
      .get('/api/evaluation/context?userId=victim&activityId=a1')
      .set('Authorization', `Bearer ${studentToken('stu-1')}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.context.userId, 'stu-1');
  });

  test('GET /api/evaluation/context: a teacher may read a student context', async () => {
    const { app, db } = loadAppWithMemoryDb();
    db.seed('users', 'stu-1', { role: 'student', level: 'א1' });
    db.seed('activities', 'a1', { title: 'x' });
    const res = await request(app)
      .get('/api/evaluation/context?userId=stu-1&activityId=a1')
      .set('Authorization', `Bearer ${teacherToken()}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.context.userId, 'stu-1');
    assert.equal(res.body.context.level, 'A1');
  });
});

describe('/uploads requires auth', () => {
  const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads', '__test__');
  const filePath = path.join(uploadsDir, 'file.txt');

  test('GET /uploads/... without token -> 401; with token -> 200', async (t) => {
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(filePath, 'secret material');
    t.after(() => fs.rmSync(uploadsDir, { recursive: true, force: true }));

    const { app } = loadAppWithMemoryDb();
    const anon = await request(app).get('/uploads/__test__/file.txt');
    assert.equal(anon.status, 401);

    const authed = await request(app)
      .get('/uploads/__test__/file.txt')
      .set('Authorization', `Bearer ${studentToken()}`);
    assert.equal(authed.status, 200);
    assert.equal(authed.text, 'secret material');
  });
});

describe('vocab internal secret fails closed in production', () => {
  test('production + no secret configured -> 401', async () => {
    const { app } = loadAppWithMemoryDb({
      env: { NODE_ENV: 'production', AI_SERVICE_INTERNAL_SECRET: '' },
    });
    try {
      const res = await request(app).post('/api/vocab/progress').send({ userId: 'u', words: ['a'] });
      assert.equal(res.status, 401);
    } finally {
      delete process.env.NODE_ENV;
    }
  });

  test('secret configured + missing header -> 401', async () => {
    const { app } = loadAppWithMemoryDb({ env: { AI_SERVICE_INTERNAL_SECRET: 's3cret' } });
    try {
      const res = await request(app).get('/api/vocab/progress/u1');
      assert.equal(res.status, 401);
    } finally {
      delete process.env.AI_SERVICE_INTERNAL_SECRET;
    }
  });
});

describe('transcripts require a user or the internal secret', () => {
  test('anonymous GET -> 401', async () => {
    const { app } = loadAppWithMemoryDb({ env: { AI_SERVICE_INTERNAL_SECRET: 's3cret' } });
    try {
      for (const url of ['/api/transcripts', '/api/transcripts/search?q=x', '/api/transcripts/level/A1']) {
        const res = await request(app).get(url);
        assert.equal(res.status, 401, url);
      }
    } finally {
      delete process.env.AI_SERVICE_INTERNAL_SECRET;
    }
  });

  test('wrong internal secret -> 401/403', async () => {
    const { app } = loadAppWithMemoryDb({ env: { AI_SERVICE_INTERNAL_SECRET: 's3cret' } });
    try {
      const res = await request(app)
        .get('/api/transcripts/level/A1')
        .set('X-Internal-Service-Secret', 'wrong');
      assert.ok([401, 403].includes(res.status));
    } finally {
      delete process.env.AI_SERVICE_INTERNAL_SECRET;
    }
  });

  test('internal secret (ai-service) -> 200', async () => {
    const { app } = loadAppWithMemoryDb({ env: { AI_SERVICE_INTERNAL_SECRET: 's3cret' } });
    try {
      const res = await request(app)
        .get('/api/transcripts/level/A1')
        .set('X-Internal-Service-Secret', 's3cret');
      assert.equal(res.status, 200, JSON.stringify(res.body));
    } finally {
      delete process.env.AI_SERVICE_INTERNAL_SECRET;
    }
  });

  test('logged-in user -> 200', async () => {
    const { app } = loadAppWithMemoryDb();
    const res = await request(app)
      .get('/api/transcripts/level/A1')
      .set('Authorization', `Bearer ${studentToken()}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });
});

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { loadAppWithMemoryDb, signToken } = require('./helpers/loadAppWithMemoryDb');

const adminToken = () => signToken({ uid: 'admin-1', role: 'admin' });

function users(db) {
  return db._collections.get('users');
}

describe('admin user level normalization', () => {
  test('creating a student with label ג stores level B2 and label ג', async () => {
    const { app, db } = loadAppWithMemoryDb();
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ email: 'S1@x.com', password: '123456789', name: 'S1', role: 'student', level: 'ג' });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.user.level, 'B2');
    assert.equal(res.body.user.levelLabel, 'ג');
    const stored = users(db).get(res.body.user.id);
    assert.equal(stored.level, 'B2');
    assert.equal(stored.levelLabel, 'ג');
  });

  test('creating a student with label א1 stores level A1', async () => {
    const { app, db } = loadAppWithMemoryDb();
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ email: 's2@x.com', password: '123456789', name: 'S2', role: 'student', level: 'א1' });

    assert.equal(res.status, 201);
    const stored = users(db).get(res.body.user.id);
    assert.equal(stored.level, 'A1');
    assert.equal(stored.levelLabel, 'א1');
  });

  test('an unknown level is rejected', async () => {
    const { app } = loadAppWithMemoryDb();
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ email: 's3@x.com', password: '123456789', name: 'S3', role: 'student', level: 'Z9' });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_LEVEL');
  });

  test('updating a student level normalizes it', async () => {
    const { app, db } = loadAppWithMemoryDb();
    db.seed('users', 'stu-1', { email: 'a@x.com', role: 'student', level: 'beginner' });

    const res = await request(app)
      .put('/api/admin/users/stu-1')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ level: 'ב1' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(users(db).get('stu-1').level, 'B1');
    assert.equal(users(db).get('stu-1').levelLabel, 'ב1');
  });

  test('updating with an unknown level is rejected', async () => {
    const { app, db } = loadAppWithMemoryDb();
    db.seed('users', 'stu-x', { email: 'x@x.com', role: 'student', level: 'A1' });
    const res = await request(app)
      .put('/api/admin/users/stu-x')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ level: 'nope' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_LEVEL');
    assert.equal(users(db).get('stu-x').level, 'A1');
  });

  test('user list returns normalized levels with labels for legacy records', async () => {
    const { app, db } = loadAppWithMemoryDb();
    db.seed('users', 'legacy-1', { email: 'l1@x.com', role: 'student', level: 'א1' });
    db.seed('users', 'legacy-2', { email: 'l2@x.com', role: 'student', level: 'ג' });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken()}`);

    assert.equal(res.status, 200);
    const byId = Object.fromEntries(res.body.users.map((u) => [u.id, u]));
    assert.equal(byId['legacy-1'].level, 'A1');
    assert.equal(byId['legacy-1'].levelLabel, 'א1');
    assert.equal(byId['legacy-2'].level, 'B2');
    assert.equal(byId['legacy-2'].levelLabel, 'ג');
  });
});

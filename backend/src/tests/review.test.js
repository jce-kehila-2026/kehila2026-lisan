'use strict';

/**
 * review.test.js — volunteer reviewer API, owner approval queue and the
 * internal ai-corrections endpoint. Firestore is replaced by an in-memory
 * fake; nothing touches the network.
 */
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'test-jwt-secret-for-review-tests-0123456789';
process.env.AI_SERVICE_INTERNAL_SECRET = '';
process.env.ADMIN_RATE_LIMIT_MAX = '100000';

// ── In-memory Firestore fake ────────────────────────────────────────────────
function createFakeDb() {
  const store = new Map(); // collection -> Map(id -> data)
  let autoId = 0;

  const col = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name);
  };

  const makeSnap = (name, id) => {
    const data = col(name).get(id);
    return {
      id,
      exists: data !== undefined,
      data: () => (data === undefined ? undefined : structuredClone(data)),
    };
  };

  const compare = (a, b) => {
    const norm = (v) => (v instanceof Date ? v.getTime() : v);
    const x = norm(a);
    const y = norm(b);
    if (x === y) return 0;
    if (x === undefined || x === null) return -1;
    if (y === undefined || y === null) return 1;
    return x < y ? -1 : 1;
  };

  const makeQuery = (name, state = { filters: [], order: null, lim: null, after: null }) => ({
    where: (field, op, value) => {
      assert.equal(op, '==', 'fake only supports ==');
      return makeQuery(name, { ...state, filters: [...state.filters, [field, value]] });
    },
    orderBy: (field, dir = 'asc') => makeQuery(name, { ...state, order: [field, dir] }),
    limit: (n) => makeQuery(name, { ...state, lim: n }),
    startAfter: (snap) => makeQuery(name, { ...state, after: snap.id }),
    get: async () => {
      let ids = [...col(name).keys()].filter((id) =>
        state.filters.every(([f, v]) => col(name).get(id)[f] === v)
      );
      if (state.order) {
        const [field, dir] = state.order;
        ids.sort((a, b) => compare(col(name).get(a)[field], col(name).get(b)[field]));
        if (dir === 'desc') ids.reverse();
      }
      if (state.after) {
        const idx = ids.indexOf(state.after);
        ids = ids.slice(idx + 1);
      }
      if (state.lim !== null) ids = ids.slice(0, state.lim);
      const docs = ids.map((id) => makeSnap(name, id));
      return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn) => docs.forEach(fn) };
    },
  });

  const db = {
    _store: store,
    collection: (name) => ({
      ...makeQuery(name),
      doc: (id) => ({
        id,
        get: async () => makeSnap(name, id),
        set: async (data, opts) => {
          const prev = opts?.merge ? col(name).get(id) || {} : {};
          col(name).set(id, { ...prev, ...data });
        },
        update: async (data) => {
          if (!col(name).has(id)) throw new Error('NOT_FOUND');
          col(name).set(id, { ...col(name).get(id), ...data });
        },
      }),
      add: async (data) => {
        autoId += 1;
        const id = `${name}-${autoId}`;
        col(name).set(id, { ...data });
        return { id };
      },
    }),
  };
  return db;
}

let fakeDb = createFakeDb();
const dbProxy = { collection: (name) => fakeDb.collection(name) };

const firebaseAdminMock = {
  apps: [true],
  initializeApp: () => {},
  credential: { cert: () => {} },
  firestore: Object.assign(() => dbProxy, {
    FieldValue: { serverTimestamp: () => new Date(), arrayUnion: (...a) => a },
  }),
};
require.cache[require.resolve('firebase-admin')] = { exports: firebaseAdminMock };
require.cache[require.resolve('../config/firebase')] = {
  exports: { db: dbProxy, admin: firebaseAdminMock, bucket: {} },
};
require.cache[require.resolve('axios')] = {
  exports: { get: async () => ({ data: {} }), post: async () => ({ data: {} }) },
};

const jwt = require('jsonwebtoken');
const supertest = require('supertest');
const { app } = require('../server');
const { studentAlias } = require('../services/aiReviewService');

const tokenFor = (role, uid = `${role}-uid`) =>
  `Bearer ${jwt.sign({ uid, role, level: 'A1' }, process.env.JWT_SECRET)}`;
const REVIEWER = tokenFor('reviewer', 'rev-1');
const REVIEWER2 = tokenFor('reviewer', 'rev-2');
const ADMIN = tokenFor('admin', 'admin-1');
const TEACHER = tokenFor('teacher', 'teacher-1');
const STUDENT = tokenFor('student', 'student-1');

function seedChat(id, { userId = 'student-secret-uid', level = 'A1', updatedAt, messages } = {}) {
  fakeDb._store.get('chatSessions') || fakeDb._store.set('chatSessions', new Map());
  fakeDb._store.get('chatSessions').set(id, {
    userId,
    title: 'אני פאטמה',
    level,
    learnerName: 'Fatima',
    updatedAt: updatedAt || new Date('2026-11-01T10:00:00Z'),
    startedAt: new Date('2026-11-01T09:00:00Z'),
    messages: messages || [
      { sender: 'user', text: 'שלום, אני רוצה קפה', clientMessageId: 'c1', createdAt: '2026-11-01T09:00:00Z' },
      { sender: 'ai', text: 'בטח! אתה רוצה חלב?', createdAt: '2026-11-01T09:00:01Z' },
      { sender: 'user', type: 'voice', text: 'כן', audioUrl: 'https://storage/x.webm', createdAt: '2026-11-01T09:00:02Z' },
      { sender: 'ai', text: 'מצוין. עוד משהו?', createdAt: '2026-11-01T09:00:03Z' },
    ],
  });
}

beforeEach(() => {
  fakeDb = createFakeDb();
  process.env.AI_SERVICE_INTERNAL_SECRET = '';
  delete process.env.NODE_ENV;
});

describe('access control', () => {
  test('anonymous request is rejected', async () => {
    const res = await supertest(app).get('/api/review/conversations');
    assert.equal(res.status, 401);
  });

  for (const [name, token] of [['student', STUDENT], ['teacher', TEACHER]]) {
    test(`${name} cannot use /api/review`, async () => {
      const res = await supertest(app).get('/api/review/conversations').set('Authorization', token);
      assert.equal(res.status, 403);
    });
  }

  test('reviewer and admin can use /api/review', async () => {
    for (const token of [REVIEWER, ADMIN]) {
      const res = await supertest(app).get('/api/review/conversations').set('Authorization', token);
      assert.equal(res.status, 200);
    }
  });

  test('reviewer cannot reach admin, teacher or analytics endpoints', async () => {
    const paths = [
      '/api/admin/users',
      '/api/admin/analytics/full',
      '/api/admin/conversations',
      '/api/admin/ai-feedback',
      '/api/admin/ai-corrections',
      '/api/teacher/students',
    ];
    for (const p of paths) {
      const res = await supertest(app).get(p).set('Authorization', REVIEWER);
      assert.ok([403, 404].includes(res.status), `${p} returned ${res.status}`);
      assert.notEqual(res.status, 200, p);
    }
  });

  test('reviewer token is confined to /api/review (student APIs -> 403)', async () => {
    const denied = [
      ['post', '/api/chat'],
      ['get', '/api/chat/my'],
      ['post', '/api/chats/c1/ai-message'],
      ['post', '/api/chat/c1/stream'],
      ['post', '/api/chat/tts'],
      ['get', '/api/progress/me'],
      ['post', '/api/progress/game/complete'],
      ['post', '/api/evaluation/attempts'],
      ['post', '/api/evaluation/speaking'],
      ['get', '/api/vocab/progress/x'],
      ['get', '/api/notifications/my'],
      ['get', '/api/shared-chats/my'],
      ['put', '/api/users/me'],
      ['get', '/api/internal/ai-corrections?level=A1'],
      ['get', '/api/CHAT/my'],
    ];
    for (const [method, path] of denied) {
      const res = await supertest(app)[method](path).set('Authorization', REVIEWER).send({});
      assert.equal(res.status, 403, `${method} ${path} returned ${res.status}`);
    }
    const stats = await supertest(app).get('/api/review/stats').set('Authorization', REVIEWER);
    assert.equal(stats.status, 200);
  });

  test('reviewer scope guard leaves other roles and bad tokens alone', async () => {
    const { isAllowedForReviewer } = require('../middleware/reviewerScope');
    assert.equal(isAllowedForReviewer('GET', '/users/me'), true);
    assert.equal(isAllowedForReviewer('PUT', '/users/me'), false);
    assert.equal(isAllowedForReviewer('POST', '/auth/login'), true);
    assert.equal(isAllowedForReviewer('GET', '/reviewers'), false);
    const bad = await supertest(app).get('/api/chat/my').set('Authorization', 'Bearer not-a-jwt');
    assert.equal(bad.status, 401);
    const student = await supertest(app).get('/api/review/stats').set('Authorization', STUDENT);
    assert.equal(student.status, 403);
  });

  test('teacher cannot use the owner approval queue', async () => {
    const res = await supertest(app).get('/api/admin/ai-feedback').set('Authorization', TEACHER);
    assert.equal(res.status, 403);
  });
});

describe('GET /api/review/conversations', () => {
  test('lists newest first with an opaque alias and no PII', async () => {
    seedChat('old', { updatedAt: new Date('2026-10-01T00:00:00Z') });
    seedChat('new', { updatedAt: new Date('2026-11-05T00:00:00Z'), userId: 'other-student' });
    seedChat('empty', { messages: [{ sender: 'user', text: 'hi' }] });

    const res = await supertest(app).get('/api/review/conversations').set('Authorization', REVIEWER);
    assert.equal(res.status, 200);
    const ids = res.body.conversations.map((c) => c.id);
    assert.deepEqual(ids, ['new', 'old']);

    const first = res.body.conversations[0];
    assert.equal(first.studentAlias, studentAlias('other-student'));
    assert.match(first.studentAlias, /^[0-9a-f]{6}$/);
    assert.equal(first.level, 'A1');
    assert.equal(first.messageCount, 4);
    assert.equal(first.reviewStatus, 'unreviewed');

    const raw = JSON.stringify(res.body);
    for (const secret of ['student-secret-uid', 'other-student', 'Fatima', 'פאטמה', 'userId', 'email']) {
      assert.ok(!raw.includes(secret), `response leaked ${secret}`);
    }
  });

  test('filters by level and review status, paginates with cursor', async () => {
    for (let i = 0; i < 25; i += 1) {
      seedChat(`a1-${i}`, { updatedAt: new Date(Date.UTC(2026, 10, 1, 0, i)) });
    }
    seedChat('b1-x', { level: 'B1' });

    const page1 = await supertest(app).get('/api/review/conversations?level=A1').set('Authorization', REVIEWER);
    assert.equal(page1.body.conversations.length, 20);
    assert.ok(page1.body.conversations.every((c) => c.level === 'A1'));
    assert.ok(page1.body.nextCursor);

    const page2 = await supertest(app)
      .get(`/api/review/conversations?level=A1&cursor=${page1.body.nextCursor}`)
      .set('Authorization', REVIEWER);
    assert.equal(page2.body.conversations.length, 5);
    assert.equal(page2.body.nextCursor, null);

    await supertest(app).post('/api/review/conversations/a1-3/complete').set('Authorization', REVIEWER);
    const unreviewed = await supertest(app)
      .get('/api/review/conversations?level=A1&status=unreviewed')
      .set('Authorization', REVIEWER);
    assert.ok(!unreviewed.body.conversations.some((c) => c.id === 'a1-3'));
    const reviewed = await supertest(app)
      .get('/api/review/conversations?status=reviewed')
      .set('Authorization', REVIEWER);
    assert.deepEqual(reviewed.body.conversations.map((c) => c.id), ['a1-3']);
  });

  test('rejects invalid level/status', async () => {
    const a = await supertest(app).get('/api/review/conversations?level=Z9').set('Authorization', REVIEWER);
    assert.equal(a.status, 400);
    const b = await supertest(app).get('/api/review/conversations?status=nope').set('Authorization', REVIEWER);
    assert.equal(b.status, 400);
  });
});

describe('GET /api/review/conversations/:id', () => {
  test('returns whitelisted messages only', async () => {
    seedChat('c1');
    const res = await supertest(app).get('/api/review/conversations/c1').set('Authorization', REVIEWER);
    assert.equal(res.status, 200);
    const conv = res.body.conversation;
    assert.equal(conv.messages.length, 4);
    assert.deepEqual(Object.keys(conv.messages[0]).sort(), ['index', 'role', 'text', 'timestamp', 'type']);
    assert.equal(conv.messages[1].role, 'ai');
    assert.equal(conv.messages[0].role, 'student');
    const raw = JSON.stringify(res.body);
    for (const secret of ['student-secret-uid', 'Fatima', 'audioUrl', 'storage/x.webm', 'clientMessageId', 'title']) {
      assert.ok(!raw.includes(secret), `response leaked ${secret}`);
    }
  });

  test('masks the learner name inside message text', async () => {
    fakeDb._store.set('users', new Map([['student-secret-uid', { name: 'יסמין חדאד', role: 'student' }]]));
    seedChat('c1', {
      messages: [
        { sender: 'user', text: 'שלום, קוראים לי יסמין', learnerName: 'יסמין חדאד' },
        { sender: 'ai', text: 'שלום יסמין! נעים מאוד, Fatima.' },
        { sender: 'user', text: 'ליסמין יש חתול' },
        { sender: 'ai', text: 'יופי. ספרי עוד.' },
      ],
    });
    const res = await supertest(app).get('/api/review/conversations/c1').set('Authorization', REVIEWER);
    assert.equal(res.status, 200);
    const texts = res.body.conversation.messages.map((m) => m.text);
    assert.deepEqual(texts, [
      'שלום, קוראים לי [שם]',
      'שלום [שם]! נעים מאוד, [שם].',
      'ל[שם] יש חתול',
      'יופי. ספרי עוד.',
    ]);
    const raw = JSON.stringify(res.body);
    for (const secret of ['יסמין', 'חדאד', 'Fatima']) assert.ok(!raw.includes(secret), secret);

    const flag = await supertest(app).post('/api/review/conversations/c1/flags').set('Authorization', REVIEWER)
      .send({ messageIndex: 1, category: 'other', comment: 'check' });
    assert.equal(flag.status, 201);
    const stored = [...fakeDb._store.get('aiReviewFlags').values()][0];
    assert.equal(stored.aiMessageText, 'שלום [שם]! נעים מאוד, [שם].');
    assert.equal(stored.studentMessageText, 'שלום, קוראים לי [שם]');
  });

  test('404 for unknown conversation', async () => {
    const res = await supertest(app).get('/api/review/conversations/nope').set('Authorization', REVIEWER);
    assert.equal(res.status, 404);
  });
});

describe('POST /api/review/conversations/:id/flags', () => {
  const valid = { messageIndex: 1, category: 'hebrew_error', comment: 'Should be את (feminine)', suggestedCorrection: 'בטח! את רוצה חלב?' };

  test('stores a pending flag with snapshots', async () => {
    seedChat('c1', { level: 'A2' });
    const res = await supertest(app).post('/api/review/conversations/c1/flags').set('Authorization', REVIEWER).send(valid);
    assert.equal(res.status, 201);
    const stored = [...fakeDb._store.get('aiReviewFlags').values()];
    assert.equal(stored.length, 1);
    const flag = stored[0];
    assert.equal(flag.status, 'pending');
    assert.equal(flag.reviewerId, 'rev-1');
    assert.equal(flag.chatId, 'c1');
    assert.equal(flag.level, 'A2');
    assert.equal(flag.aiMessageText, 'בטח! אתה רוצה חלב?');
    assert.equal(flag.studentMessageText, 'שלום, אני רוצה קפה');
    assert.ok(flag.createdAt instanceof Date);

    const list = await supertest(app).get('/api/review/conversations?status=has_flags').set('Authorization', REVIEWER);
    assert.deepEqual(list.body.conversations.map((c) => c.id), ['c1']);
  });

  const invalidCases = [
    ['student message index', { ...valid, messageIndex: 0 }],
    ['out of range index', { ...valid, messageIndex: 99 }],
    ['non-integer index', { ...valid, messageIndex: '1' }],
    ['bad category', { ...valid, category: 'rude' }],
    ['missing comment', { ...valid, comment: '   ' }],
    ['long comment', { ...valid, comment: 'x'.repeat(1001) }],
    ['long correction', { ...valid, suggestedCorrection: 'x'.repeat(1001) }],
    ['non-string correction', { ...valid, suggestedCorrection: 5 }],
  ];
  for (const [name, body] of invalidCases) {
    test(`rejects ${name}`, async () => {
      seedChat('c1');
      const res = await supertest(app).post('/api/review/conversations/c1/flags').set('Authorization', REVIEWER).send(body);
      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.equal(fakeDb._store.get('aiReviewFlags'), undefined);
    });
  }
});

describe('POST /api/review/conversations/:id/complete and stats', () => {
  test('marks reviewed with zero flags and counts my reviews', async () => {
    seedChat('c1');
    seedChat('c2');
    const r1 = await supertest(app).post('/api/review/conversations/c1/complete').set('Authorization', REVIEWER);
    assert.equal(r1.status, 200);
    assert.equal(r1.body.reviewStatus, 'reviewed');
    // completing twice does not double count
    await supertest(app).post('/api/review/conversations/c1/complete').set('Authorization', REVIEWER);
    await supertest(app).post('/api/review/conversations/c2/complete').set('Authorization', REVIEWER2);

    assert.equal(fakeDb._store.get('aiReviewStatus').get('c1').reviewCount, 1);
    const stats = await supertest(app).get('/api/review/stats').set('Authorization', REVIEWER);
    assert.equal(stats.body.stats.reviewedConversations, 1);

    const detail = await supertest(app).get('/api/review/conversations/c1').set('Authorization', REVIEWER);
    assert.equal(detail.body.conversation.completedByMe, true);
    assert.equal(detail.body.conversation.reviewStatus, 'reviewed');
  });
});

describe('owner approval queue', () => {
  async function createPendingFlag() {
    seedChat('c1', { level: 'B1' });
    const res = await supertest(app).post('/api/review/conversations/c1/flags').set('Authorization', REVIEWER).send({
      messageIndex: 1, category: 'hebrew_error', comment: 'masculine form', suggestedCorrection: 'את רוצה חלב?',
    });
    return res.body.flag.id;
  }

  test('lists pending feedback with a suggested rule', async () => {
    const id = await createPendingFlag();
    const res = await supertest(app).get('/api/admin/ai-feedback?status=pending').set('Authorization', ADMIN);
    assert.equal(res.status, 200);
    assert.equal(res.body.feedback.length, 1);
    assert.equal(res.body.feedback[0].id, id);
    assert.ok(res.body.feedback[0].suggestedRuleText.includes('את רוצה חלב?'));
    assert.ok(res.body.feedback[0].suggestedRuleText.length <= 300);
  });

  test('approve writes an active aiCorrections doc with edited text', async () => {
    const id = await createPendingFlag();
    const res = await supertest(app).post(`/api/admin/ai-feedback/${id}/approve`)
      .set('Authorization', ADMIN).send({ ruleText: 'Always address the learner in feminine forms.', level: 'b1' });
    assert.equal(res.status, 200);
    const corrections = [...fakeDb._store.get('aiCorrections').values()];
    assert.equal(corrections.length, 1);
    assert.deepEqual(
      { level: corrections[0].level, ruleText: corrections[0].ruleText, category: corrections[0].category, sourceFlagId: corrections[0].sourceFlagId, active: corrections[0].active, approvedBy: corrections[0].approvedBy },
      { level: 'B1', ruleText: 'Always address the learner in feminine forms.', category: 'hebrew_error', sourceFlagId: id, active: true, approvedBy: 'admin-1' }
    );
    assert.equal(fakeDb._store.get('aiReviewFlags').get(id).status, 'approved');

    const again = await supertest(app).post(`/api/admin/ai-feedback/${id}/approve`)
      .set('Authorization', ADMIN).send({ ruleText: 'Another rule text', level: 'B1' });
    assert.equal(again.status, 409);
  });

  test('approve validates rule text and level', async () => {
    const id = await createPendingFlag();
    for (const body of [{ ruleText: '', level: 'B1' }, { ruleText: 'x'.repeat(301), level: 'B1' }, { ruleText: 'Valid rule', level: 'Z1' }, { ruleText: 'Valid rule', level: 'C1' }, { ruleText: 'Valid rule', level: 'C2' }]) {
      const res = await supertest(app).post(`/api/admin/ai-feedback/${id}/approve`).set('Authorization', ADMIN).send(body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  });

  test('reject marks the flag rejected', async () => {
    const id = await createPendingFlag();
    const res = await supertest(app).post(`/api/admin/ai-feedback/${id}/reject`).set('Authorization', ADMIN).send({});
    assert.equal(res.status, 200);
    assert.equal(fakeDb._store.get('aiReviewFlags').get(id).status, 'rejected');
    assert.equal(fakeDb._store.get('aiCorrections'), undefined);
  });

  test('deactivate toggle and internal endpoint returns active rules for the level only', async () => {
    const id = await createPendingFlag();
    await supertest(app).post(`/api/admin/ai-feedback/${id}/approve`).set('Authorization', ADMIN)
      .send({ ruleText: 'B1 rule one', level: 'B1' });
    fakeDb._store.get('aiCorrections').set('all-rule', { level: 'ALL', ruleText: 'Global rule', active: true, approvedAt: new Date('2020-01-01') });
    fakeDb._store.get('aiCorrections').set('a1-rule', { level: 'A1', ruleText: 'A1 rule', active: true, approvedAt: new Date() });

    let res = await supertest(app).get('/api/internal/ai-corrections?level=B1');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.corrections.map((c) => c.ruleText), ['B1 rule one', 'Global rule']);

    const list = await supertest(app).get('/api/admin/ai-corrections').set('Authorization', ADMIN);
    const ruleId = list.body.corrections.find((c) => c.ruleText === 'B1 rule one').id;
    const off = await supertest(app).patch(`/api/admin/ai-corrections/${ruleId}`).set('Authorization', ADMIN).send({ active: false });
    assert.equal(off.status, 200);

    res = await supertest(app).get('/api/internal/ai-corrections?level=b1');
    assert.deepEqual(res.body.corrections.map((c) => c.ruleText), ['Global rule']);
  });
});

describe('internal endpoint secret', () => {
  test('requires the secret when configured', async () => {
    process.env.AI_SERVICE_INTERNAL_SECRET = 'shh';
    const none = await supertest(app).get('/api/internal/ai-corrections?level=A1');
    assert.equal(none.status, 401);
    const wrong = await supertest(app).get('/api/internal/ai-corrections?level=A1').set('X-Internal-Service-Secret', 'nope');
    assert.equal(wrong.status, 403);
    const ok = await supertest(app).get('/api/internal/ai-corrections?level=A1').set('X-Internal-Service-Secret', 'shh');
    assert.equal(ok.status, 200);
  });

  test('fails closed in production when the secret is unset', async () => {
    process.env.NODE_ENV = 'production';
    const res = await supertest(app).get('/api/internal/ai-corrections?level=A1');
    assert.equal(res.status, 503);
  });

  test('rejects invalid level', async () => {
    const res = await supertest(app).get('/api/internal/ai-corrections?level=x');
    assert.equal(res.status, 400);
  });
});

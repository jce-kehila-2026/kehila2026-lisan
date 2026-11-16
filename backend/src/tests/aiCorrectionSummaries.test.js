'use strict';

/**
 * aiCorrectionSummaries.test.js — AI summary of the reviewer rules per level:
 * regeneration on approve/deactivate, coverage validation, ALL fan-out, the
 * internal endpoint, edit/revert/regenerate routes and role guards.
 * Firestore and the ai-service are faked; nothing touches the network.
 */
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'test-jwt-secret-for-summary-tests-0123456789';
process.env.AI_SERVICE_INTERNAL_SECRET = '';
process.env.ADMIN_RATE_LIMIT_MAX = '100000';
process.env.AI_SERVICE_URL = 'http://ai.test';

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

// Fake ai-service summarizer: every call is recorded; the reply is scripted.
let summarizerCalls = [];
let summarizerReply = coverAll;
function coverAll(body) {
  return {
    summary: `Summary for ${body.level}: ${body.rules.map((r) => r.ruleText).join(' ')}`.slice(0, 800),
    sentences: [{ text: 'All rules.', ruleIds: body.rules.map((r) => r.id) }],
    model: 'fake-model',
  };
}
require.cache[require.resolve('axios')] = {
  exports: {
    get: async () => ({ data: {} }),
    post: async (url, body) => {
      if (!url.includes('/api/ai/internal/summarize-corrections')) return { data: {} };
      summarizerCalls.push({ url, body });
      const reply = summarizerReply(body, summarizerCalls.length);
      if (reply instanceof Error) throw reply;
      return { data: reply };
    },
  },
};

const jwt = require('jsonwebtoken');
const supertest = require('supertest');
const { app } = require('../server');
const summaries = require('../services/aiCorrectionSummaryService');

const tokenFor = (role, uid = `${role}-uid`) =>
  `Bearer ${jwt.sign({ uid, role, level: 'A1' }, process.env.JWT_SECRET)}`;
const ADMIN = tokenFor('admin', 'admin-1');
const TEACHER = tokenFor('teacher', 'teacher-1');
const REVIEWER = tokenFor('reviewer', 'rev-1');
const STUDENT = tokenFor('student', 'student-1');

function seedRule(id, level, ruleText, active = true) {
  if (!fakeDb._store.has('aiCorrections')) fakeDb._store.set('aiCorrections', new Map());
  fakeDb._store.get('aiCorrections').set(id, { level, ruleText, active, approvedAt: new Date() });
}
function seedFlag(id, level = 'B1') {
  if (!fakeDb._store.has('aiReviewFlags')) fakeDb._store.set('aiReviewFlags', new Map());
  fakeDb._store.get('aiReviewFlags').set(id, {
    chatId: 'c1', messageIndex: 1, reviewerId: 'rev-1', level, category: 'hebrew_error',
    comment: 'masculine', suggestedCorrection: 'את רוצה?', aiMessageText: 'אתה רוצה?', status: 'pending',
    createdAt: new Date(),
  });
}
function summaryDoc(level) {
  return fakeDb._store.get('aiCorrectionSummaries')?.get(level);
}

beforeEach(async () => {
  await summaries.waitForIdle();
  fakeDb = createFakeDb();
  summarizerCalls = [];
  summarizerReply = coverAll;
  process.env.AI_SERVICE_INTERNAL_SECRET = '';
  delete process.env.NODE_ENV;
});

describe('coverage validator', () => {
  const rules = [{ id: 'r1', ruleText: 'a' }, { id: 'r2', ruleText: 'b' }];

  test('accepts full coverage', () => {
    const v = summaries.validateSummary({
      summary: 'Do a. Do b.',
      sentences: [{ text: 'Do a.', ruleIds: ['r1'] }, { text: 'Do b.', ruleIds: ['r2', 'r1'] }],
    }, rules);
    assert.equal(v.ok, true);
    assert.equal(v.text, 'Do a. Do b.');
  });

  test('rejects a missing rule id', () => {
    const v = summaries.validateSummary({ summary: 'Do a.', sentences: [{ text: 'Do a.', ruleIds: ['r1'] }] }, rules);
    assert.equal(v.ok, false);
    assert.match(v.error, /r2/);
  });

  test('rejects unknown ids', () => {
    const v = summaries.validateSummary({ summary: 'x', sentences: [{ text: 'x', ruleIds: ['r1', 'r2', 'ghost'] }] }, rules);
    assert.equal(v.ok, false);
    assert.match(v.error, /ghost/);
  });

  test('rejects too long or empty summaries', () => {
    const long = summaries.validateSummary({ summary: 'x'.repeat(901), sentences: [{ text: 'x', ruleIds: ['r1', 'r2'] }] }, rules);
    assert.equal(long.ok, false);
    assert.equal(summaries.validateSummary({ summary: '', sentences: [] }, rules).ok, false);
    assert.equal(summaries.validateSummary(null, rules).ok, false);
  });
});

describe('regeneration', () => {
  test('approve triggers regeneration for the rule level and returns before it finishes', async () => {
    seedFlag('f1', 'B1');
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    summarizerReply = (body) => gate.then(() => coverAll(body));
    const res = await supertest(app).post('/api/admin/ai-feedback/f1/approve')
      .set('Authorization', ADMIN).send({ ruleText: 'Use feminine forms always.', level: 'B1' });
    assert.equal(res.status, 200);
    assert.equal(summaryDoc('B1'), undefined, 'approve must not wait for the summary');
    release();
    await summaries.waitForIdle();
    assert.equal(summarizerCalls.length, 1);
    assert.equal(summarizerCalls[0].body.level, 'B1');
    const doc = summaryDoc('B1');
    assert.equal(doc.status, 'ok');
    assert.equal(doc.version, 1);
    assert.equal(doc.generatedBy, 'ai');
    assert.equal(doc.model, 'fake-model');
    assert.deepEqual(doc.ruleIds, [res.body.correction.id]);
  });

  test('deactivate and reactivate regenerate the level', async () => {
    seedRule('r1', 'A2', 'Rule one');
    seedRule('r2', 'A2', 'Rule two');
    const off = await supertest(app).patch('/api/admin/ai-corrections/r1').set('Authorization', TEACHER).send({ active: false });
    assert.equal(off.status, 200);
    await summaries.waitForIdle();
    assert.equal(summarizerCalls.length, 1);
    assert.deepEqual(summarizerCalls[0].body.rules.map((r) => r.id), ['r2']);
    const on = await supertest(app).patch('/api/admin/ai-corrections/r1').set('Authorization', ADMIN).send({ active: true });
    assert.equal(on.status, 200);
    await summaries.waitForIdle();
    assert.equal(summarizerCalls.length, 2);
    assert.equal(summaryDoc('A2').version, 2);
    assert.deepEqual(summaryDoc('A2').previous.version, 1);
  });

  test('ALL rule fans out to every level', async () => {
    seedRule('g1', 'ALL', 'Global rule');
    await summaries.triggerForRuleLevel('ALL');
    assert.deepEqual(summarizerCalls.map((c) => c.body.level).sort(), ['A1', 'A2', 'B1', 'B2']);
    for (const level of ['A1', 'A2', 'B1', 'B2']) assert.equal(summaryDoc(level).status, 'ok');
  });

  test('concurrent triggers for one level are serialized and collapse (latest wins)', async () => {
    seedRule('r1', 'A1', 'Rule one');
    let inFlight = 0;
    let maxInFlight = 0;
    summarizerReply = async (body) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight -= 1;
      return coverAll(body);
    };
    summaries.scheduleRegeneration('A1');
    seedRule('r2', 'A1', 'Rule two');
    summaries.scheduleRegeneration('A1');
    summaries.scheduleRegeneration('A1');
    await summaries.waitForIdle();
    assert.equal(maxInFlight, 1);
    assert.equal(summarizerCalls.length, 2);
    assert.deepEqual(new Set(summaryDoc('A1').ruleIds), new Set(['r1', 'r2']));
  });

  test('invalid summary: retry once, then keep the previous good summary and mark failed', async () => {
    seedRule('r1', 'B2', 'Rule one');
    await summaries.scheduleRegeneration('B2');
    const good = summaryDoc('B2');
    assert.equal(good.status, 'ok');

    seedRule('r2', 'B2', 'Rule two');
    summarizerCalls = [];
    summarizerReply = (body) => ({ summary: 'only one', sentences: [{ text: 'x', ruleIds: [body.rules[0].id] }] });
    await summaries.scheduleRegeneration('B2');
    assert.equal(summarizerCalls.length, 2, 'one retry');
    const doc = summaryDoc('B2');
    assert.equal(doc.status, 'failed');
    assert.match(doc.error, /does not cover/);
    assert.equal(doc.text, good.text);
    assert.equal(doc.version, good.version);

    // Not covering the current rules -> internal endpoint falls back to the raw list.
    const res = await supertest(app).get('/api/internal/ai-corrections?level=B2');
    assert.equal(res.body.summary, null);
    assert.equal(res.body.corrections.length, 2);
  });

  test('ai-service error also retries once then marks failed', async () => {
    seedRule('r1', 'A1', 'Rule one');
    summarizerReply = () => new Error('connect ECONNREFUSED');
    await summaries.scheduleRegeneration('A1');
    assert.equal(summarizerCalls.length, 2);
    assert.equal(summaryDoc('A1').status, 'failed');
    assert.match(summaryDoc('A1').error, /ECONNREFUSED/);
  });

  test('a retry that succeeds is accepted', async () => {
    seedRule('r1', 'A1', 'Rule one');
    summarizerReply = (body, n) => (n === 1 ? { summary: 'x'.repeat(2000), sentences: [{ text: 'x', ruleIds: ['r1'] }] } : coverAll(body));
    await summaries.scheduleRegeneration('A1');
    assert.equal(summarizerCalls.length, 2);
    assert.equal(summaryDoc('A1').status, 'ok');
  });
});

describe('internal endpoint', () => {
  test('returns the summary only when it covers the current active rules (+ALL)', async () => {
    seedRule('r1', 'A1', 'A1 rule');
    seedRule('g1', 'ALL', 'Global rule');
    let res = await supertest(app).get('/api/internal/ai-corrections?level=A1');
    assert.equal(res.body.summary, null, 'no summary yet');

    await summaries.scheduleRegeneration('A1');
    res = await supertest(app).get('/api/internal/ai-corrections?level=a1');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.summary, { text: summaryDoc('A1').text, version: 1 });
    assert.equal(res.body.corrections.length, 2);

    // A new rule the summary does not know -> raw list again.
    seedRule('r3', 'A1', 'Newer rule');
    res = await supertest(app).get('/api/internal/ai-corrections?level=A1');
    assert.equal(res.body.summary, null);

    // Other level is unaffected by A1's summary.
    res = await supertest(app).get('/api/internal/ai-corrections?level=B1');
    assert.equal(res.body.summary, null);
  });

  test('still requires the internal secret', async () => {
    process.env.AI_SERVICE_INTERNAL_SECRET = 'shh';
    const res = await supertest(app).get('/api/internal/ai-corrections?level=A1');
    assert.equal(res.status, 401);
  });
});

describe('admin summary routes', () => {
  test('list shows every level with status and coverage', async () => {
    seedRule('r1', 'A1', 'A1 rule');
    await summaries.scheduleRegeneration('A1');
    const res = await supertest(app).get('/api/admin/ai-correction-summaries').set('Authorization', TEACHER);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.summaries.map((s) => s.level), ['A1', 'A2', 'B1', 'B2']);
    const a1 = res.body.summaries[0];
    assert.equal(a1.status, 'ok');
    assert.equal(a1.version, 1);
    assert.equal(a1.coversCurrentRules, true);
    assert.equal(a1.activeRuleCount, 1);
    assert.equal(res.body.summaries[1].status, 'none');
  });

  test('edit saves version+1 marked with the editor uid and goes live', async () => {
    seedRule('r1', 'A1', 'A1 rule');
    await summaries.scheduleRegeneration('A1');
    const aiText = summaryDoc('A1').text;
    const res = await supertest(app).put('/api/admin/ai-correction-summaries/a1').set('Authorization', ADMIN)
      .send({ text: 'Always address her as את.' });
    assert.equal(res.status, 200);
    assert.equal(res.body.summary.version, 2);
    assert.equal(res.body.summary.edited, true);
    assert.equal(summaryDoc('A1').generatedBy, 'admin-1');
    assert.equal(summaryDoc('A1').previous.text, aiText);
    const internal = await supertest(app).get('/api/internal/ai-corrections?level=A1');
    assert.deepEqual(internal.body.summary, { text: 'Always address her as את.', version: 2 });
  });

  test('edit validates text', async () => {
    for (const body of [{}, { text: '' }, { text: 'x'.repeat(1201) }]) {
      const res = await supertest(app).put('/api/admin/ai-correction-summaries/A1').set('Authorization', ADMIN).send(body);
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 40));
    }
    const bad = await supertest(app).put('/api/admin/ai-correction-summaries/C1').set('Authorization', ADMIN).send({ text: 'valid text' });
    assert.equal(bad.status, 400);
  });

  test('revert restores the previous text as a new version', async () => {
    seedRule('r1', 'A1', 'A1 rule');
    await summaries.scheduleRegeneration('A1');
    const aiText = summaryDoc('A1').text;
    await supertest(app).put('/api/admin/ai-correction-summaries/A1').set('Authorization', ADMIN).send({ text: 'Edited text here.' });
    const res = await supertest(app).post('/api/admin/ai-correction-summaries/A1/revert').set('Authorization', TEACHER);
    assert.equal(res.status, 200);
    assert.equal(res.body.summary.text, aiText);
    assert.equal(res.body.summary.version, 3);
    assert.equal(res.body.summary.previous.text, 'Edited text here.');
    assert.equal(res.body.summary.coversCurrentRules, true);
  });

  test('revert without a previous version is 409', async () => {
    const res = await supertest(app).post('/api/admin/ai-correction-summaries/B1/revert').set('Authorization', ADMIN);
    assert.equal(res.status, 409);
  });

  test('regenerate runs now and returns the fresh summary', async () => {
    seedRule('r1', 'B1', 'B1 rule');
    const res = await supertest(app).post('/api/admin/ai-correction-summaries/B1/regenerate').set('Authorization', ADMIN);
    assert.equal(res.status, 200);
    assert.equal(res.body.summary.status, 'ok');
    assert.equal(res.body.summary.version, 1);
    assert.equal(summarizerCalls.length, 1);
  });

  test('failed status is reported with its error', async () => {
    seedRule('r1', 'B1', 'B1 rule');
    summarizerReply = () => ({ summary: 'x', sentences: [{ text: 'x', ruleIds: ['nope'] }] });
    const res = await supertest(app).post('/api/admin/ai-correction-summaries/B1/regenerate').set('Authorization', ADMIN);
    assert.equal(res.status, 200);
    assert.equal(res.body.summary.status, 'failed');
    assert.match(res.body.summary.error, /unknown rule ids/);
  });

  test('reviewer and student are forbidden; anonymous is 401', async () => {
    const calls = [
      ['get', '/api/admin/ai-correction-summaries'],
      ['put', '/api/admin/ai-correction-summaries/A1'],
      ['post', '/api/admin/ai-correction-summaries/A1/regenerate'],
      ['post', '/api/admin/ai-correction-summaries/A1/revert'],
    ];
    for (const [method, path] of calls) {
      for (const token of [REVIEWER, STUDENT]) {
        const res = await supertest(app)[method](path).set('Authorization', token).send({ text: 'some text' });
        assert.equal(res.status, 403, `${method} ${path}`);
      }
      const anon = await supertest(app)[method](path).send({ text: 'some text' });
      assert.equal(anon.status, 401, `${method} ${path}`);
    }
    assert.equal(summarizerCalls.length, 0);
  });
});

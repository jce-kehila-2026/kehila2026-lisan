'use strict';

/**
 * Ops monitoring tests: event model, fire-and-forget recording, capture
 * middleware, access control, aggregation and health thresholds.
 * Everything is mocked — no Firestore, no network.
 */
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const supertest = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
const SECRET = process.env.JWT_SECRET;

const model = require('../services/ops/opsModel');
const recorder = require('../services/ops/opsRecorder');
const agg = require('../services/ops/opsAggregation');
const live = require('../services/ops/opsLiveChecks');
const { opsTracker, opsErrorHandler } = require('../middleware/opsTracker');
const { clearOpsAccessCache } = require('../middleware/opsAccess');
const { createOpsRouter } = require('../routes/ops');

// ── Fake Firestore ──────────────────────────────────────────────────────────
function createFakeDb(seed = {}) {
  const store = new Map(); // collection -> Map(id -> data)
  const writes = [];
  let auto = 0;
  const col = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name);
  };
  for (const [name, docs] of Object.entries(seed)) {
    for (const [id, data] of Object.entries(docs)) col(name).set(id, data);
  }
  const snapOf = (id, data) => ({ id, exists: data !== undefined, data: () => data });
  const query = (name, filters = [], limitN = null) => ({
    where(field, op, value) { return query(name, [...filters, { field, op, value }], limitN); },
    orderBy() { return query(name, filters, limitN); },
    limit(n) { return query(name, filters, n); },
    async get() {
      let docs = [...col(name).entries()].filter(([, d]) => filters.every((f) =>
        (f.op === '==' ? d[f.field] === f.value : f.op === 'in' ? f.value.includes(d[f.field]) : true)));
      if (limitN !== null) docs = docs.slice(0, limitN);
      const mapped = docs.map(([id, d]) => snapOf(id, d));
      return { docs: mapped, empty: mapped.length === 0, forEach: (cb) => mapped.forEach(cb) };
    },
  });
  const db = {
    store,
    writes,
    collection(name) {
      return {
        ...query(name),
        doc(id) {
          return {
            id,
            async get() { return snapOf(id, col(name).get(id)); },
            async set(data, opts) { writes.push({ op: 'set', name, id, data, opts }); col(name).set(id, data); },
          };
        },
        async add(data) {
          auto += 1;
          writes.push({ op: 'add', name, data });
          col(name).set(`auto${auto}`, data);
          return { id: `auto${auto}` };
        },
      };
    },
    async getAll(...refs) { return Promise.all(refs.map((r) => r.get())); },
  };
  return db;
}

const fakeAdmin = { firestore: { FieldValue: { increment: (n) => ({ __inc: n }) } } };
const inc = (n) => ({ __inc: n });
const flush = () => new Promise((resolve) => setImmediate(resolve));
const token = (payload) => `Bearer ${jwt.sign(payload, SECRET)}`;

// ── Model ───────────────────────────────────────────────────────────────────
describe('opsModel', () => {
  test('buildEvent normalises an AI text interaction with provider cost', () => {
    const e = model.buildEvent({
      kind: 'text', status: 200, uid: 'user-1', role: 'student', level: 'A1', chatId: 'chat-9',
      provider: 'openrouter', model: 'google/gemini-2.5-flash-lite', latencyMs: 1234,
      inputTokens: 100, outputTokens: 20, providerCostUsd: 0.00003,
    }, { now: new Date('2026-11-16T10:00:00Z') });
    assert.equal(e.outcome, 'ok');
    assert.equal(e.isError, false);
    assert.equal(e.costUsd, 0.00003);
    assert.equal(e.costSource, 'provider');
    assert.match(e.userAlias, /^u_[0-9a-f]{10}$/);
    assert.notEqual(e.userAlias, 'user-1');
    assert.match(e.chatAlias, /^c_/);
    assert.equal(e.day, '2026-11-16');
    assert.equal(e.hour, '12'); // Asia/Jerusalem = UTC+2 in November
  });

  test('fallback for upstream 429 is flagged as rate limited', () => {
    const e = model.buildEvent({ kind: 'text', status: 200, fallbackUsed: true, fallbackReason: 'PROVIDER_QUOTA' });
    assert.equal(e.outcome, 'fallback');
    assert.equal(e.rateLimited, true);
    assert.equal(e.errorCode, 'PROVIDER_QUOTA');
  });

  test('HTTP failures become errors with a code', () => {
    const e = model.buildEvent({ kind: 'voice', status: 503 });
    assert.equal(e.outcome, 'error');
    assert.equal(e.errorCode, 'HTTP_503');
    assert.equal(model.buildEvent({ kind: 'text', status: 429 }).rateLimited, true);
  });

  test('estimateCost: tokens → price table, unknown model → null, speech by seconds/chars', () => {
    const est = model.estimateCost({ kind: 'text', model: 'google/gemini-2.5-flash-lite', inputTokens: 1e6, outputTokens: 1e6 });
    assert.equal(est.costUsd, 0.5);
    assert.equal(est.costSource, 'estimate');
    assert.deepEqual(model.estimateCost({ kind: 'text', model: 'mystery', inputTokens: 10, outputTokens: 10 }),
      { costUsd: null, costSource: null });
    assert.equal(model.estimateCost({ kind: 'stt', audioSeconds: 3600 }).costUsd, 1);
    assert.equal(model.estimateCost({ kind: 'tts', ttsChars: 1e6, ttsProvider: 'azure' }).costUsd, 16);
  });

  test('OPS_PRICES env overrides model prices', () => {
    const env = { OPS_PRICES: JSON.stringify({ models: { mystery: { in: 1, out: 1 } } }) };
    assert.equal(model.estimateCost({ kind: 'text', model: 'mystery', inputTokens: 1e6, outputTokens: 0 }, env).costUsd, 1);
  });

  test('buildDailyUpdate increments totals, model, hour histogram, chats, active users', () => {
    const e = model.buildEvent({
      kind: 'text', status: 200, uid: 'u1', role: 'student', chatId: 'c1', provider: 'openrouter',
      model: 'm/x', latencyMs: 900, inputTokens: 5, outputTokens: 7, providerCostUsd: 0.01,
    });
    const u = model.buildDailyUpdate(e, { inc, ts: 'TS' });
    assert.deepEqual(u.totals.events, inc(1));
    assert.deepEqual(u.totals.messages, inc(1));
    assert.deepEqual(u.totals.costUsd, inc(0.01));
    assert.deepEqual(u.byModel['openrouter__m_x'].events, inc(1));
    assert.deepEqual(u.hours[e.hour].lat.le1000, inc(1));
    assert.equal(u.activeUsers[e.userAlias], 'student');
    assert.deepEqual(u.chats[e.chatAlias], inc(1));
    assert.equal(u.errors, undefined);
  });

  test('buildDailyUpdate records error keys and login counters', () => {
    const login = model.buildEvent({ kind: 'login', status: 401, errorCode: 'INVALID_LOGIN_CREDENTIALS', route: '/api/auth/login' });
    const u = model.buildDailyUpdate(login, { inc, ts: 'TS' });
    assert.deepEqual(u.logins.failure, inc(1));
    const [key] = Object.keys(u.errors);
    assert.equal(u.errors[key].code, 'INVALID_LOGIN_CREDENTIALS');
    assert.ok(!key.includes('/'));
    assert.equal(u.activeUsers, undefined);
  });

  test('percentileFromHistogram returns bucket upper bounds', () => {
    const hist = { le500: 50, le1000: 40, le5000: 10 };
    assert.equal(model.percentileFromHistogram(hist, 0.5), 500);
    assert.equal(model.percentileFromHistogram(hist, 0.95), 5000);
    assert.equal(model.percentileFromHistogram({}, 0.5), null);
  });

  test('lastDayKeys / lastHourSlots are ordered and unique', () => {
    const now = new Date('2026-11-16T10:30:00Z');
    assert.deepEqual(model.lastDayKeys(3, now), ['2026-11-14', '2026-11-15', '2026-11-16']);
    const slots = model.lastHourSlots(2, now);
    assert.deepEqual(slots, [{ day: '2026-11-16', hour: '11' }, { day: '2026-11-16', hour: '12' }]);
  });
});

// ── Recorder ────────────────────────────────────────────────────────────────
describe('opsRecorder (fire-and-forget)', () => {
  test('writes opsEvents (with TTL), opsDaily and opsUsers', async () => {
    const db = createFakeDb();
    recorder.setFirebaseForTests({ db, admin: fakeAdmin });
    const now = new Date('2026-11-16T10:00:00Z');
    const event = await recorder.recordOpsEvent({ kind: 'text', status: 200, uid: 'u1', role: 'student' }, { now });
    assert.equal(event.kind, 'text');
    const names = db.writes.map((w) => w.name).sort();
    assert.deepEqual(names, ['opsDaily', 'opsEvents', 'opsUsers']);
    const ev = db.writes.find((w) => w.name === 'opsEvents').data;
    assert.equal(ev.expireAt.getTime() - now.getTime(), 90 * 24 * 3600 * 1000);
    assert.equal(db.writes.find((w) => w.name === 'opsDaily').opts.merge, true);
  });

  test('never throws or rejects when Firestore fails (sync or async)', async () => {
    recorder.setFirebaseForTests({
      db: { collection() { throw new Error('boom'); } },
      admin: fakeAdmin,
    });
    const r1 = await recorder.recordOpsEvent({ kind: 'text', status: 200, uid: 'u1' });
    assert.ok(r1 === null || typeof r1 === 'object');

    recorder.setFirebaseForTests({
      db: {
        collection() {
          return {
            add: () => Promise.reject(new Error('quota')),
            doc: () => ({ set: () => Promise.reject(new Error('quota')) }),
          };
        },
      },
      admin: fakeAdmin,
    });
    await recorder.recordOpsEvent({ kind: 'voice', status: 200, uid: 'u2' });
    await recorder.markActivity({ uid: 'u3', role: 'student' });

    recorder.setFirebaseForTests({ db: null, admin: null });
    await recorder.recordOpsEvent({ kind: 'text', status: 200 });
  });

  test('markActivity is throttled per user', async () => {
    const db = createFakeDb();
    recorder.setFirebaseForTests({ db, admin: fakeAdmin });
    const now = new Date('2026-11-16T10:00:00Z');
    assert.equal(await recorder.markActivity({ uid: 'u1', role: 'student' }, { now }), true);
    assert.equal(await recorder.markActivity({ uid: 'u1', role: 'student' }, { now: new Date(now.getTime() + 60000) }), false);
    assert.equal(await recorder.markActivity({ uid: 'u1', role: 'student' },
      { now: new Date(now.getTime() + recorder.ACTIVITY_THROTTLE_MS + 1) }), true);
  });
});

// ── Capture middleware ──────────────────────────────────────────────────────
function buildTrackedApp() {
  const app = express();
  app.use(opsTracker);
  app.use(express.json());
  const auth = (req, res, next) => {
    try {
      req.user = jwt.verify(String(req.headers.authorization || '').replace('Bearer ', ''), SECRET);
      return next();
    } catch (_) {
      return res.status(401).json({ error: 'Invalid' });
    }
  };
  const chats = express.Router();
  chats.post('/:chatId/ai-message', auth, (req, res) => {
    res.locals.ops = { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite', inputTokens: 50, outputTokens: 10, costUsd: 0.0001 };
    res.status(200).json({ success: true, fallbackUsed: req.body.fallback === true, fallbackReason: req.body.fallback ? 'PROVIDER_QUOTA' : null });
  });
  chats.post('/voice', auth, (req, res) => res.status(503).json({ success: false, code: 'AI_SERVICE_UNAVAILABLE' }));
  chats.get('/my', auth, (req, res) => res.json({ ok: true }));
  chats.get('/explode', () => { throw new Error('kaboom'); });
  app.use('/api/chats', chats);
  app.use('/api/chat', chats);
  app.post('/api/auth/login', (req, res) => {
    if (req.body.password === 'good') return res.json({ token: 't', user: { uid: 'u-login', role: 'student' } });
    return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_LOGIN_CREDENTIALS' });
  });
  app.use(opsErrorHandler);
  return app;
}

describe('opsTracker middleware', () => {
  let db;
  beforeEach(() => {
    db = createFakeDb();
    recorder.setFirebaseForTests({ db, admin: fakeAdmin });
  });
  const events = () => db.writes.filter((w) => w.name === 'opsEvents').map((w) => w.data);

  test('records a text AI event with provider/model/tokens/cost and hashed ids', async () => {
    const app = buildTrackedApp();
    const res = await supertest(app).post('/api/chat/chat-42/ai-message')
      .set('Authorization', token({ uid: 'stu-1', role: 'student', level: 'A2' })).send({ text: 'שלום' });
    assert.equal(res.status, 200);
    await flush();
    const [e] = events();
    assert.equal(e.kind, 'text');
    assert.equal(e.route, '/api/chats/:chatId/ai-message');
    assert.equal(e.provider, 'openrouter');
    assert.equal(e.model, 'google/gemini-2.5-flash-lite');
    assert.equal(e.inputTokens, 50);
    assert.equal(e.costUsd, 0.0001);
    assert.equal(e.level, 'A2');
    assert.equal(e.role, 'student');
    assert.equal(e.userAlias, model.userAlias('stu-1'));
    assert.equal(e.chatAlias, model.chatAlias('chat-42'));
    assert.equal(typeof e.latencyMs, 'number');
  });

  test('records 429 fallbacks and AI errors', async () => {
    const app = buildTrackedApp();
    const auth = token({ uid: 'stu-1', role: 'student' });
    await supertest(app).post('/api/chats/c/ai-message').set('Authorization', auth).send({ fallback: true });
    await supertest(app).post('/api/chats/voice').set('Authorization', auth);
    await flush();
    const [fb, err] = events();
    assert.equal(fb.outcome, 'fallback');
    assert.equal(fb.rateLimited, true);
    assert.equal(err.kind, 'voice');
    assert.equal(err.outcome, 'error');
    assert.equal(err.errorCode, 'AI_SERVICE_UNAVAILABLE');
  });

  test('records login success and failure without storing the email', async () => {
    const app = buildTrackedApp();
    await supertest(app).post('/api/auth/login').send({ email: 'a@b.c', password: 'bad' });
    await supertest(app).post('/api/auth/login').send({ email: 'a@b.c', password: 'good' });
    await flush();
    const [fail, ok] = events();
    assert.equal(fail.kind, 'login');
    assert.equal(fail.outcome, 'error');
    assert.equal(fail.errorCode, 'INVALID_LOGIN_CREDENTIALS');
    assert.equal(ok.outcome, 'ok');
    assert.equal(ok.userAlias, model.userAlias('u-login'));
    assert.ok(!JSON.stringify(db.writes).includes('a@b.c'));
  });

  test('unhandled errors are answered as JSON 500 and recorded with route + code', async () => {
    const app = buildTrackedApp();
    const res = await supertest(app).get('/api/chats/explode');
    assert.equal(res.status, 500);
    assert.equal(res.body.code, 'UNHANDLED_ERROR');
    await flush();
    const [e] = events();
    assert.equal(e.kind, 'http');
    assert.equal(e.route, '/api/chats/explode');
    assert.equal(e.errorCode, 'UNHANDLED_ERROR');
  });

  test('non-AI authenticated requests only mark activity', async () => {
    const app = buildTrackedApp();
    await supertest(app).get('/api/chats/my').set('Authorization', token({ uid: 'stu-9', role: 'student' }));
    await flush();
    assert.equal(events().length, 0);
    const daily = db.writes.find((w) => w.name === 'opsDaily');
    assert.equal(daily.data.activeUsers[model.userAlias('stu-9')], 'student');
  });

  test('student request still succeeds when ops writes blow up', async () => {
    recorder.setFirebaseForTests({ db: { collection() { throw new Error('down'); } }, admin: fakeAdmin });
    const app = buildTrackedApp();
    const res = await supertest(app).post('/api/chats/c/ai-message')
      .set('Authorization', token({ uid: 'stu-1', role: 'student' })).send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    await flush();
  });
});

// ── Access control ──────────────────────────────────────────────────────────
function buildOpsApp({ env, db = createFakeDb({ users: { adm: { email: 'Owner@Example.com', role: 'admin' }, adm2: { email: 'other@example.com', role: 'admin' } } }) } = {}) {
  clearOpsAccessCache();
  const http = { get: async () => ({ status: 200, data: {} }) };
  const app = express();
  app.use('/api/ops', createOpsRouter({ db, env, http, ai: { baseUrl: 'http://ai', config: {} } }));
  return app;
}

describe('ops routes access control', () => {
  const env = { OPS_ADMIN_EMAILS: 'owner@example.com' };

  test('no token → 401', async () => {
    const res = await supertest(buildOpsApp({ env })).get('/api/ops/summary');
    assert.equal(res.status, 401);
  });

  test('teacher and student → 403', async () => {
    const app = buildOpsApp({ env });
    for (const role of ['teacher', 'student']) {
      const res = await supertest(app).get('/api/ops/summary').set('Authorization', token({ uid: 'adm', role }));
      assert.equal(res.status, 403);
    }
  });

  test('admin not on the allowlist → 403', async () => {
    const res = await supertest(buildOpsApp({ env })).get('/api/ops/access')
      .set('Authorization', token({ uid: 'adm2', role: 'admin' }));
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'OPS_NOT_ALLOWED');
  });

  test('allowlist unset → everyone denied (fail closed)', async () => {
    const res = await supertest(buildOpsApp({ env: {} })).get('/api/ops/access')
      .set('Authorization', token({ uid: 'adm', role: 'admin' }));
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'OPS_DISABLED');
  });

  test('allowlisted admin (case-insensitive email) → 200 on every endpoint', async () => {
    const app = buildOpsApp({ env });
    const auth = token({ uid: 'adm', role: 'admin' });
    for (const path of ['access', 'summary?range=24h', 'summary?range=30d', 'health', 'errors?range=7d', 'dropoff']) {
      const res = await supertest(app).get(`/api/ops/${path}`).set('Authorization', auth);
      assert.equal(res.status, 200, `${path}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.success, true);
    }
  });

  test('empty database → honest empty summary (no fake numbers)', async () => {
    const res = await supertest(buildOpsApp({ env })).get('/api/ops/summary?range=7d')
      .set('Authorization', token({ uid: 'adm', role: 'admin' }));
    assert.equal(res.body.hasData, false);
    assert.equal(res.body.projectedMonthlyCostUsd, null);
    assert.equal(res.body.costPerActiveStudentUsd, null);
    assert.equal(res.body.totals.costUsd, 0);
  });
});

// ── Aggregation ─────────────────────────────────────────────────────────────
describe('opsAggregation', () => {
  const days = [
    { day: '2026-11-14', data: null },
    {
      day: '2026-11-15',
      data: {
        totals: { events: 10, messages: 8, voiceMessages: 2, audioSeconds: 120, costUsd: 0.2, ok: 8, fallback: 1, error: 1, rateLimited: 1 },
        logins: { success: 3, failure: 1 },
        activeUsers: { u_a: 'student', u_b: 'student', u_t: 'teacher' },
        byModel: { 'openrouter__x': { provider: 'openrouter', model: 'x', events: 10, costUsd: 0.2 } },
        byKind: { text: { events: 8, costUsd: 0.15, latencyMsSum: 8000 } },
      },
    },
    {
      day: '2026-11-16',
      data: {
        totals: { events: 5, messages: 5, costUsd: 0.1, ok: 5 },
        activeUsers: { u_a: 'student', u_c: 'student' },
        byModel: { 'openrouter__x': { provider: 'openrouter', model: 'x', events: 5, costUsd: 0.1 } },
      },
    },
  ];

  test('summarize: active students, totals, cost per student, projection', () => {
    const s = agg.summarize(days, { range: '7d', wauDays: days });
    assert.equal(s.hasData, true);
    assert.equal(s.daysWithData, 2);
    assert.equal(s.totals.activeStudents, 3); // teacher excluded
    assert.equal(s.totals.dau, 2);
    assert.equal(s.totals.wau, 3);
    assert.equal(s.totals.messages, 13);
    assert.equal(s.totals.voiceMinutes, 2);
    assert.equal(s.totals.costUsd, 0.3);
    assert.equal(s.costPerActiveStudentUsd, 0.1);
    assert.equal(s.avgDailyCostUsd, 0.15);
    assert.equal(s.projectedMonthlyCostUsd, 4.5);
    assert.equal(s.totals.loginFailure, 1);
    assert.equal(s.costByProviderModel[0].events, 15);
    assert.equal(s.byKind[0].avgLatencyMs, 1000);
    assert.equal(s.series[0].hasData, false);
  });

  test('summarize with no data returns nulls, not zeros, for derived values', () => {
    const s = agg.summarize([{ day: 'd', data: null }]);
    assert.equal(s.hasData, false);
    assert.equal(s.projectedMonthlyCostUsd, null);
    assert.equal(s.totals.fallbackRate, null);
  });

  test('dropoff funnel, short sessions, inactive students and errors before abandonment', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    const day = 24 * 3600 * 1000;
    const r = agg.dropoff({
      now,
      students: [
        { alias: 'u_never', createdAtMs: now - 3 * day, lastLoginAtMs: null },
        { alias: 'u_login_only', lastLoginAtMs: now - 10 * day },
        { alias: 'u_active', lastLoginAtMs: now - 1 * day },
        { alias: 'u_gone_err', lastLoginAtMs: now - 20 * day },
        { alias: 'u_disabled', isActive: false, lastLoginAtMs: now - day },
      ],
      opsUsers: {
        u_active: { aiMessages: 12, lastActiveAt: new Date(now - day) },
        u_gone_err: {
          aiMessages: 2, lastActiveAt: new Date(now - 9 * day), lastAiAt: new Date(now - 9 * day),
          lastOutcome: 'fallback', lastKind: 'voice', lastErrorKind: 'voice', lastErrorCode: 'STT_FAILED',
          lastErrorAt: new Date(now - 9 * day),
        },
      },
      chatDays: [
        { day: '2026-11-14', chats: { c1: 1, c2: 5 } },
        { day: '2026-11-15', chats: { c1: 1, c3: 2 } },
      ],
    });
    assert.deepEqual(r.funnel, { accounts: 4, everLoggedIn: 3, sentFirstAiMessage: 2, active7d: 1 });
    assert.equal(r.neverLoggedIn, 1);
    assert.deepEqual(r.inactiveOver7d.map((x) => x.alias), ['u_login_only', 'u_gone_err']);
    assert.equal(r.inactiveOver7d[1].daysInactive, 9);
    assert.equal(r.sessions.total, 3);
    assert.equal(r.sessions.endedAfter1to2Messages, 2); // c1 (2 total) and c3 (2)
    assert.deepEqual(r.errorsBeforeAbandonment, [{ kind: 'voice', code: 'STT_FAILED', students: 1 }]);
    assert.ok(!JSON.stringify(r).includes('name'));
  });

  test('errorsReport merges days and ranks by count', () => {
    const r = agg.errorsReport([
      { data: { errors: { k1: { kind: 'text', code: 'PROVIDER_QUOTA', route: '/r', provider: 'openrouter', count: 3, lastSeen: new Date('2026-11-15T00:00:00Z') } }, fallbackReasons: { PROVIDER_QUOTA: 3 } } },
      { data: { errors: { k1: { kind: 'text', code: 'PROVIDER_QUOTA', route: '/r', provider: 'openrouter', count: 2, lastSeen: new Date('2026-11-16T00:00:00Z') }, k2: { code: 'HTTP_500', route: '/x', count: 1 } } } },
      { data: null },
    ]);
    assert.equal(r.total, 6);
    assert.equal(r.top[0].count, 5);
    assert.equal(r.top[0].lastSeen, '2026-11-16T00:00:00.000Z');
    assert.equal(r.byProvider[0].provider, 'openrouter');
    assert.deepEqual(r.fallbackReasons, [{ reason: 'PROVIDER_QUOTA', count: 3 }]);
  });
});

// ── Health thresholds ───────────────────────────────────────────────────────
describe('ops health thresholds', () => {
  const metrics = (over) => ({
    events: 100, fallbackRate: 0, rateLimitedRate: 0, errorRate: 0,
    textLatency: { p50: 1000, p95: 2000 }, voiceLatency: { p50: 3000, p95: 5000 }, ...over,
  });
  const byId = (checks) => Object.fromEntries(checks.map((c) => [c.id, c.status]));

  test('ok / warn / critical bands', () => {
    assert.equal(byId(agg.evaluateMetricChecks(metrics(), metrics())).fallback_rate_1h, 'ok');
    assert.equal(byId(agg.evaluateMetricChecks(metrics({ fallbackRate: 0.12 }), metrics())).fallback_rate_1h, 'warn');
    assert.equal(byId(agg.evaluateMetricChecks(metrics({ rateLimitedRate: 0.2 }), metrics())).rate_limited_1h, 'critical');
    assert.equal(byId(agg.evaluateMetricChecks(metrics(), metrics({ textLatency: { p95: 12000 } }))).text_p95_24h, 'critical');
    assert.equal(byId(agg.evaluateMetricChecks(metrics(), metrics({ voiceLatency: { p95: 12000 } }))).voice_p95_24h, 'warn');
  });

  test('no traffic → unknown, never a fake green', () => {
    const checks = agg.evaluateMetricChecks(metrics({ events: 0, fallbackRate: null }), metrics({ events: 0, textLatency: { p95: null }, voiceLatency: { p95: null } }));
    assert.equal(byId(checks).fallback_rate_1h, 'unknown');
    assert.equal(byId(checks).text_p95_24h, 'unknown');
  });

  test('OpenRouter balance by amount and by days left', () => {
    assert.equal(agg.evaluateBalance({ status: 'ok', remainingUsd: 50 }, 1).status, 'ok');
    assert.equal(agg.evaluateBalance({ status: 'ok', remainingUsd: 4 }, 0.01).status, 'warn');
    assert.equal(agg.evaluateBalance({ status: 'ok', remainingUsd: 0.5 }, null).status, 'critical');
    assert.equal(agg.evaluateBalance({ status: 'ok', remainingUsd: 20 }, 10).status, 'critical'); // 2 days left
    assert.equal(agg.evaluateBalance({ status: 'unknown', reason: 'not_configured' }, 1).status, 'unknown');
  });

  test('overallStatus picks the worst', () => {
    assert.equal(agg.overallStatus([{ status: 'ok' }, { status: 'warn' }]), 'warn');
    assert.equal(agg.overallStatus([{ status: 'critical' }, { status: 'warn' }]), 'critical');
    assert.equal(agg.overallStatus([{ status: 'unknown' }, { status: 'ok' }]), 'ok');
  });
});

describe('ops live checks', () => {
  beforeEach(() => live.resetBalanceCache());

  test('balance from /credits (management key)', async () => {
    const calls = [];
    const http = { get: async (url) => { calls.push(url); return { status: 200, data: { data: { total_credits: 20, total_usage: 7.5 } } }; } };
    const b = await live.fetchOpenRouterBalance(http, { OPENROUTER_API_KEY_OPS: 'k' });
    assert.equal(b.remainingUsd, 12.5);
    assert.equal(b.source, 'credits');
    assert.equal(calls.length, 1);
  });

  test('balance falls back to /key when /credits is forbidden', async () => {
    const http = {
      get: async (url) => (url.endsWith('/credits')
        ? { status: 403, data: {} }
        : { status: 200, data: { data: { limit: 10, limit_remaining: 3.2, usage_daily: 0.4 } } }),
    };
    const b = await live.fetchOpenRouterBalance(http, { OPENROUTER_API_KEY_OPS: 'k' });
    assert.equal(b.remainingUsd, 3.2);
    assert.equal(b.source, 'key');
    assert.equal(b.usageDailyUsd, 0.4);
  });

  test('balance without key → unknown, no network call', async () => {
    let called = false;
    const b = await live.fetchOpenRouterBalance({ get: async () => { called = true; } }, {});
    assert.equal(b.status, 'unknown');
    assert.equal(called, false);
  });

  test('ai-service down → critical; circuits open → critical', async () => {
    const down = { get: async () => { throw new Error('ECONNREFUSED'); } };
    assert.equal((await live.checkAiReady(down, 'http://ai', {})).status, 'critical');
    const open = { get: async () => ({ status: 200, data: { stt_circuit: 'open', tts_circuit: 'closed' } }) };
    assert.equal((await live.checkCircuits(open, 'http://ai', {})).status, 'critical');
    const degraded = { get: async () => ({ status: 503, data: { checks: { cache: 'cold' } } }) };
    assert.equal((await live.checkAiReady(degraded, 'http://ai', {})).status, 'warn');
  });
});

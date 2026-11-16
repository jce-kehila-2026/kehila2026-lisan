'use strict';

/**
 * Operations monitoring API (owner / technical operator only).
 *
 *   GET /api/ops/access              → { allowed: true } (used to show the nav link)
 *   GET /api/ops/summary?range=      → usage + spend
 *   GET /api/ops/health              → live checks + strain metrics with thresholds
 *   GET /api/ops/dropoff             → funnel, short sessions, inactive students
 *   GET /api/ops/errors?range=       → top error codes/routes/providers + recent 50
 *
 * Guard: requireAuth → requireRole('admin','teacher') → OPS_ADMIN_EMAILS allowlist
 * (the allowlist is the real gate; the owner's account is a teacher account)
 * (fail closed). Responses are cached in memory briefly so the page's 60 s
 * auto-refresh does not multiply Firestore reads.
 */

const express = require('express');

const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { requireOpsAllowlist } = require('../middleware/opsAccess');
const {
  getTimezone,
  lastDayKeys,
  lastHourSlots,
  userAlias,
} = require('../services/ops/opsModel');
const {
  collectHourBuckets,
  dropoff,
  errorsReport,
  evaluateBalance,
  evaluateMetricChecks,
  overallStatus,
  parseRange,
  RANGES,
  summarize,
  toMillis,
  windowMetrics,
} = require('../services/ops/opsAggregation');
const live = require('../services/ops/opsLiveChecks');

const CACHE_TTL_MS = {
  summary: 60 * 1000,
  health: 30 * 1000,
  errors: 2 * 60 * 1000,
  dropoff: 10 * 60 * 1000,
};

async function readDocs(db, collection, ids) {
  if (!ids.length) return [];
  const refs = ids.map((id) => db.collection(collection).doc(id));
  if (typeof db.getAll === 'function') {
    const snaps = await db.getAll(...refs);
    return snaps.map((s, i) => ({ id: ids[i], data: s.exists ? s.data() : null }));
  }
  const snaps = await Promise.all(refs.map((r) => r.get()));
  return snaps.map((s, i) => ({ id: ids[i], data: s.exists ? s.data() : null }));
}

function createOpsRouter(deps = {}) {
  const router = express.Router();
  const getDb = () => deps.db || require('../config/firebase').db;
  const getHttp = () => deps.http || require('axios');
  const getNow = () => (deps.now ? deps.now() : new Date());
  const getAi = () => {
    if (deps.ai) return deps.ai;
    const { normalizeAiServiceBaseUrl, createAiRequestConfig } = require('../services/aiChatService');
    return { baseUrl: normalizeAiServiceBaseUrl(), config: createAiRequestConfig() };
  };

  const cache = new Map();
  async function cached(key, ttl, compute) {
    const hit = cache.get(key);
    const nowMs = Date.now();
    if (hit && nowMs - hit.at < ttl) return { ...hit.value, cachedAt: new Date(hit.at).toISOString() };
    const value = await compute();
    cache.set(key, { at: nowMs, value });
    return value;
  }
  router.clearCache = () => cache.clear();

  router.use(requireAuth, requireRole('admin', 'teacher'), requireOpsAllowlist({ db: deps.db, env: deps.env }));

  const handle = (fn) => async (req, res) => {
    try {
      const body = await fn(req);
      res.set('Cache-Control', 'no-store');
      return res.status(200).json({ success: true, ...body });
    } catch (error) {
      res.locals.opsErrorCode = 'OPS_QUERY_FAILED';
      return res.status(500).json({
        success: false,
        error: 'Ops query failed',
        code: 'OPS_QUERY_FAILED',
        detail: String(error && error.message ? error.message : error).slice(0, 300),
      });
    }
  };

  async function loadDays(keys) {
    const docs = await readDocs(getDb(), 'opsDaily', keys);
    return docs.map((d) => ({ day: d.id, data: d.data }));
  }

  async function trackingSince() {
    try {
      const snap = await getDb().collection('opsDaily').orderBy('day', 'asc').limit(1).get();
      const doc = snap.docs && snap.docs[0];
      return doc ? (doc.data().day || doc.id) : null;
    } catch (_) {
      return null;
    }
  }

  router.get('/access', (req, res) => res.status(200).json({ success: true, allowed: true }));

  router.get('/summary', handle(async (req) => {
    const range = parseRange(req.query.range);
    return cached(`summary:${range}`, CACHE_TTL_MS.summary, async () => {
      const now = getNow();
      const numDays = Math.max(RANGES[range], 7);
      const days = await loadDays(lastDayKeys(numDays, now));
      const rangeDays = days.slice(-RANGES[range]);
      const summary = summarize(rangeDays, { range, wauDays: days.slice(-7) });
      let hourly = null;
      if (range === '24h') {
        const slots = lastHourSlots(24, now);
        const byDay = Object.fromEntries(days.map((d) => [d.day, d.data]));
        hourly = slots.map((slot, i) => {
          const b = collectHourBuckets(byDay, [slot])[0] || {};
          return {
            day: slot.day, hour: slot.hour, index: i,
            events: Number(b.events) || 0, messages: Number(b.messages) || 0,
            costUsd: Number(b.costUsd) || 0, fallback: Number(b.fallback) || 0, error: Number(b.error) || 0,
          };
        });
      }
      return {
        generatedAt: now.toISOString(),
        timezone: getTimezone(),
        trackingSince: await trackingSince(),
        ...summary,
        hourly,
      };
    });
  }));

  router.get('/health', handle(async () => cached('health', CACHE_TTL_MS.health, async () => {
    const now = getNow();
    const db = getDb();
    const http = getHttp();
    const ai = getAi();

    const [firestore, aiReady, circuits, balance, days] = await Promise.all([
      live.checkFirestore(db),
      live.checkAiReady(http, ai.baseUrl, ai.config),
      live.checkCircuits(http, ai.baseUrl, ai.config),
      live.fetchOpenRouterBalance(http, deps.env || process.env),
      loadDays(lastDayKeys(8, now)).catch(() => []),
    ]);

    const byDay = Object.fromEntries(days.map((d) => [d.day, d.data]));
    const recent = windowMetrics(collectHourBuckets(byDay, lastHourSlots(2, now)));
    const day = windowMetrics(collectHourBuckets(byDay, lastHourSlots(24, now)));
    const summary7 = summarize(days.slice(-7), { range: '7d' });
    const avgDailyCost = summary7.avgDailyCostUsd;

    const balanceCheck = evaluateBalance(balance, avgDailyCost);
    const metricChecks = evaluateMetricChecks(recent, day);
    const liveChecks = [firestore, aiReady, circuits];
    const checks = [...liveChecks, balanceCheck, ...metricChecks];

    return {
      generatedAt: now.toISOString(),
      status: overallStatus(checks),
      checks,
      windows: {
        recent: { label: 'last_2_clock_hours', ...recent },
        last24h: day,
      },
      openrouter: balance,
      avgDailyCostUsd: avgDailyCost,
      providerChain: (aiReady.checks && aiReady.checks.provider_chain) || null,
    };
  })));

  router.get('/errors', handle(async (req) => {
    const range = parseRange(req.query.range);
    return cached(`errors:${range}`, CACHE_TTL_MS.errors, async () => {
      const now = getNow();
      const days = await loadDays(lastDayKeys(RANGES[range], now));
      const report = errorsReport(days);
      let recent = [];
      let recentError = null;
      try {
        const snap = await getDb()
          .collection('opsEvents')
          .where('outcome', 'in', ['error', 'fallback'])
          .orderBy('ts', 'desc')
          .limit(50)
          .get();
        recent = snap.docs.map((doc) => {
          const e = doc.data();
          const tsMs = toMillis(e.ts);
          return {
            id: doc.id,
            ts: tsMs ? new Date(tsMs).toISOString() : null,
            kind: e.kind, route: e.route, status: e.status, outcome: e.outcome,
            code: e.errorCode, provider: e.provider, model: e.model,
            latencyMs: e.latencyMs, level: e.level, role: e.role, userAlias: e.userAlias,
          };
        });
      } catch (error) {
        // Most likely the composite index is not deployed yet.
        recentError = String(error && error.message ? error.message : error).slice(0, 300);
      }
      return { generatedAt: now.toISOString(), range, ...report, recent, recentError };
    });
  }));

  router.get('/dropoff', handle(async () => cached('dropoff', CACHE_TTL_MS.dropoff, async () => {
    const now = getNow();
    const db = getDb();
    const [usersSnap, opsUsersSnap] = await Promise.all([
      db.collection('users').where('role', '==', 'student').get(),
      db.collection('opsUsers').get(),
    ]);
    const students = usersSnap.docs.map((doc) => {
      const u = doc.data() || {};
      return {
        alias: userAlias(doc.id),
        createdAtMs: toMillis(u.createdAt),
        lastLoginAtMs: toMillis(u.lastLoginAt),
        isActive: u.isActive,
      };
    });
    const opsUsers = {};
    opsUsersSnap.docs.forEach((doc) => { opsUsers[doc.id] = doc.data(); });

    // Completed days only (exclude today: its sessions may still be running).
    const dayKeys = lastDayKeys(8, now).slice(0, -1);
    const days = await loadDays(dayKeys);
    const chatDays = days.filter((d) => d.data).map((d) => ({ day: d.day, chats: d.data.chats || {} }));

    return {
      generatedAt: now.toISOString(),
      trackingSince: await trackingSince(),
      ...dropoff({ students, opsUsers, chatDays, now }),
    };
  })));

  return router;
}

const defaultRouter = createOpsRouter();

module.exports = defaultRouter;
module.exports.createOpsRouter = createOpsRouter;
module.exports.readDocs = readDocs;

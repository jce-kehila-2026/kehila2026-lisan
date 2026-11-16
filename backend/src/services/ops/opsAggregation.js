'use strict';

/**
 * Pure aggregation over opsDaily / opsUsers / users documents.
 * Inputs are plain objects (already read from Firestore); no I/O here.
 */

const { mergeHistograms, percentileFromHistogram } = require('./opsModel');

const RANGES = { '24h': 1, '7d': 7, '30d': 30 };

function parseRange(value, fallback = '7d') {
  return Object.prototype.hasOwnProperty.call(RANGES, value) ? value : fallback;
}

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function round(value, digits = 4) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function rate(part, total) {
  return total > 0 ? round(part / total, 4) : null;
}

function toMillis(value) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function studentAliases(activeUsers) {
  return Object.entries(activeUsers || {})
    .filter(([, role]) => role === 'student')
    .map(([alias]) => alias);
}

/**
 * @param {Array<{day: string, data: object|null}>} days oldest → newest
 * @param {object} opts { range, wauDays?: same shape for last 7 days }
 */
function summarize(days, { range = '7d', wauDays = null } = {}) {
  const series = [];
  const rangeStudents = new Set();
  const totals = {
    events: 0, messages: 0, voiceMessages: 0, audioSeconds: 0, ttsChars: 0,
    inputTokens: 0, outputTokens: 0, costUsd: 0, unpricedEvents: 0,
    ok: 0, fallback: 0, error: 0, rateLimited: 0,
    loginSuccess: 0, loginFailure: 0,
  };
  const byModel = new Map();
  const byKind = new Map();
  let daysWithData = 0;

  for (const { day, data } of days) {
    const d = data || {};
    const t = d.totals || {};
    const students = studentAliases(d.activeUsers);
    students.forEach((a) => rangeStudents.add(a));
    const hasData = Boolean(data);
    if (hasData) daysWithData += 1;

    series.push({
      day,
      hasData,
      activeStudents: students.length,
      messages: n(t.messages),
      voiceMessages: n(t.voiceMessages),
      voiceMinutes: round(n(t.audioSeconds) / 60, 1),
      costUsd: round(n(t.costUsd), 4),
      events: n(t.events),
      fallback: n(t.fallback),
      error: n(t.error),
      rateLimited: n(t.rateLimited),
    });

    for (const key of Object.keys(totals)) {
      if (key === 'loginSuccess' || key === 'loginFailure') continue;
      totals[key] += n(t[key]);
    }
    totals.loginSuccess += n(d.logins && d.logins.success);
    totals.loginFailure += n(d.logins && d.logins.failure);

    for (const [key, m] of Object.entries(d.byModel || {})) {
      const cur = byModel.get(key) || {
        provider: m.provider || null, model: m.model || null,
        events: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, fallback: 0, error: 0, rateLimited: 0,
      };
      cur.events += n(m.events);
      cur.costUsd += n(m.costUsd);
      cur.inputTokens += n(m.inputTokens);
      cur.outputTokens += n(m.outputTokens);
      cur.fallback += n(m.fallback);
      cur.error += n(m.error);
      cur.rateLimited += n(m.rateLimited);
      byModel.set(key, cur);
    }
    for (const [kind, k] of Object.entries(d.byKind || {})) {
      const cur = byKind.get(kind) || { kind, events: 0, costUsd: 0, fallback: 0, error: 0, latencyMsSum: 0 };
      cur.events += n(k.events);
      cur.costUsd += n(k.costUsd);
      cur.fallback += n(k.fallback);
      cur.error += n(k.error);
      cur.latencyMsSum += n(k.latencyMsSum);
      byKind.set(kind, cur);
    }
  }

  const today = days.length ? days[days.length - 1] : null;
  const dau = today ? studentAliases(today.data && today.data.activeUsers).length : 0;
  let wau = null;
  if (wauDays) {
    const set = new Set();
    for (const { data } of wauDays) studentAliases(data && data.activeUsers).forEach((a) => set.add(a));
    wau = set.size;
  }

  const activeStudents = rangeStudents.size;
  const costUsd = round(totals.costUsd, 4);
  // Projection: average daily spend over days that have data, × 30.
  const avgDailyCost = daysWithData > 0 ? totals.costUsd / daysWithData : null;

  return {
    range,
    hasData: daysWithData > 0,
    daysWithData,
    series,
    totals: {
      ...totals,
      costUsd,
      voiceMinutes: round(totals.audioSeconds / 60, 1),
      activeStudents,
      dau,
      wau,
      fallbackRate: rate(totals.fallback, totals.events),
      errorRate: rate(totals.error, totals.events),
    },
    costPerActiveStudentUsd: activeStudents > 0 ? round(totals.costUsd / activeStudents, 4) : null,
    avgDailyCostUsd: avgDailyCost === null ? null : round(avgDailyCost, 4),
    projectedMonthlyCostUsd: avgDailyCost === null ? null : round(avgDailyCost * 30, 2),
    projectionBasisDays: daysWithData,
    costByProviderModel: [...byModel.values()]
      .map((m) => ({ ...m, costUsd: round(m.costUsd, 4) }))
      .sort((a, b) => b.costUsd - a.costUsd || b.events - a.events),
    byKind: [...byKind.values()]
      .map((k) => ({
        kind: k.kind,
        events: k.events,
        costUsd: round(k.costUsd, 4),
        fallbackRate: rate(k.fallback, k.events),
        errorRate: rate(k.error, k.events),
        avgLatencyMs: k.events > 0 ? Math.round(k.latencyMsSum / k.events) : null,
      }))
      .sort((a, b) => b.events - a.events),
  };
}

/**
 * Window metrics from hourly buckets.
 * @param {Array<object>} buckets hour bucket objects (opsDaily.hours[HH])
 */
function windowMetrics(buckets) {
  const acc = { events: 0, ok: 0, fallback: 0, error: 0, rateLimited: 0, http5xx: 0, costUsd: 0, messages: 0 };
  const lat = {};
  const latVoice = {};
  for (const b of buckets) {
    if (!b) continue;
    for (const key of Object.keys(acc)) acc[key] += n(b[key]);
    mergeHistograms(lat, b.lat);
    mergeHistograms(latVoice, b.latVoice);
  }
  return {
    ...acc,
    costUsd: round(acc.costUsd, 4),
    fallbackRate: rate(acc.fallback, acc.events),
    rateLimitedRate: rate(acc.rateLimited, acc.events),
    errorRate: rate(acc.error, acc.events),
    textLatency: { p50: percentileFromHistogram(lat, 0.5), p95: percentileFromHistogram(lat, 0.95) },
    voiceLatency: { p50: percentileFromHistogram(latVoice, 0.5), p95: percentileFromHistogram(latVoice, 0.95) },
  };
}

/**
 * Collect the hourly buckets for the last `hours` hours.
 * @param {object} dailyByDay { 'YYYY-MM-DD': opsDaily data }
 * @param {Array<{day, hour}>} hourSlots from opsModel.lastHourSlots
 */
function collectHourBuckets(dailyByDay, hourSlots) {
  return hourSlots.map(({ day, hour }) => {
    const d = dailyByDay[day];
    return (d && d.hours && d.hours[hour]) || null;
  });
}

const THRESHOLDS = {
  fallbackRate: { warn: 0.10, critical: 0.25 },
  rateLimitedRate: { warn: 0.02, critical: 0.10 },
  errorRate: { warn: 0.02, critical: 0.10 },
  textP95Ms: { warn: 6000, critical: 12000 },
  voiceP95Ms: { warn: 10000, critical: 20000 },
  openrouterBalanceUsd: { warn: 5, critical: 1 },
  openrouterDaysLeft: { warn: 7, critical: 2 },
  minSample: 5,
};

function levelHigherIsWorse(value, t) {
  if (value === null || value === undefined) return 'unknown';
  if (value >= t.critical) return 'critical';
  if (value >= t.warn) return 'warn';
  return 'ok';
}

function levelLowerIsWorse(value, t) {
  if (value === null || value === undefined) return 'unknown';
  if (value <= t.critical) return 'critical';
  if (value <= t.warn) return 'warn';
  return 'ok';
}

/** Rate checks need a minimum sample; below it we say so instead of guessing. */
function rateCheck(id, label, value, events, t) {
  if (!events) return { id, label, status: 'unknown', value: null, sample: 0, note: 'no_data' };
  const status = levelHigherIsWorse(value, t);
  return {
    id, label, value, sample: events, thresholds: t,
    status: events < THRESHOLDS.minSample && status !== 'ok' ? 'warn' : status,
    note: events < THRESHOLDS.minSample ? 'low_sample' : null,
  };
}

function evaluateMetricChecks(recent, day) {
  const checks = [];
  checks.push(rateCheck('fallback_rate_1h', 'fallback_rate_recent', recent.fallbackRate, recent.events, THRESHOLDS.fallbackRate));
  checks.push(rateCheck('fallback_rate_24h', 'fallback_rate_24h', day.fallbackRate, day.events, THRESHOLDS.fallbackRate));
  checks.push(rateCheck('rate_limited_1h', 'rate_limited_recent', recent.rateLimitedRate, recent.events, THRESHOLDS.rateLimitedRate));
  checks.push(rateCheck('rate_limited_24h', 'rate_limited_24h', day.rateLimitedRate, day.events, THRESHOLDS.rateLimitedRate));
  checks.push(rateCheck('error_rate_1h', 'error_rate_recent', recent.errorRate, recent.events, THRESHOLDS.errorRate));
  checks.push(rateCheck('error_rate_24h', 'error_rate_24h', day.errorRate, day.events, THRESHOLDS.errorRate));
  checks.push({
    id: 'text_p95_24h', label: 'text_p95_24h', value: day.textLatency.p95,
    status: levelHigherIsWorse(day.textLatency.p95, THRESHOLDS.textP95Ms), thresholds: THRESHOLDS.textP95Ms,
  });
  checks.push({
    id: 'voice_p95_24h', label: 'voice_p95_24h', value: day.voiceLatency.p95,
    status: levelHigherIsWorse(day.voiceLatency.p95, THRESHOLDS.voiceP95Ms), thresholds: THRESHOLDS.voiceP95Ms,
  });
  return checks;
}

function evaluateBalance(balance, avgDailyCostUsd) {
  if (!balance || balance.status !== 'ok' || balance.remainingUsd === null || balance.remainingUsd === undefined) {
    return {
      id: 'openrouter_balance', label: 'openrouter_balance',
      status: 'unknown', value: null, note: (balance && balance.reason) || 'not_configured',
      source: balance && balance.source,
    };
  }
  const daysLeft = avgDailyCostUsd && avgDailyCostUsd > 0 ? round(balance.remainingUsd / avgDailyCostUsd, 1) : null;
  const byAmount = levelLowerIsWorse(balance.remainingUsd, THRESHOLDS.openrouterBalanceUsd);
  const byDays = daysLeft === null ? 'ok' : levelLowerIsWorse(daysLeft, THRESHOLDS.openrouterDaysLeft);
  const order = ['ok', 'warn', 'critical'];
  const status = order[Math.max(order.indexOf(byAmount), order.indexOf(byDays))];
  return {
    id: 'openrouter_balance', label: 'openrouter_balance', status,
    value: balance.remainingUsd, daysLeft, source: balance.source,
    usageDailyUsd: balance.usageDailyUsd ?? null,
    thresholds: { usd: THRESHOLDS.openrouterBalanceUsd, days: THRESHOLDS.openrouterDaysLeft },
  };
}

function overallStatus(checks) {
  if (checks.some((c) => c.status === 'critical')) return 'critical';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  if (checks.every((c) => c.status === 'unknown')) return 'unknown';
  return 'ok';
}

/**
 * Drop-off funnel.
 * @param {object} p
 *   students: [{ alias, createdAtMs, lastLoginAtMs, isActive }]
 *   opsUsers: { alias: opsUsers doc }
 *   chatDays: [{ day, chats: {chatAlias: count} }] — completed days only
 *   now: Date
 */
function dropoff({ students, opsUsers, chatDays, now = new Date() }) {
  const nowMs = now.getTime();
  const DAY = 24 * 3600 * 1000;
  const funnel = { accounts: 0, everLoggedIn: 0, sentFirstAiMessage: 0, active7d: 0 };
  const inactive = [];
  const neverLoggedIn = [];
  const errorsBeforeAbandon = new Map();

  for (const s of students) {
    if (s.isActive === false) continue;
    funnel.accounts += 1;
    const ops = opsUsers[s.alias] || null;
    const lastActiveMs = Math.max(
      toMillis(ops && ops.lastActiveAt) || 0,
      toMillis(ops && ops.lastAiAt) || 0,
      s.lastLoginAtMs || 0
    ) || null;
    const loggedIn = Boolean(s.lastLoginAtMs) || Boolean(ops && ops.lastLoginAt);
    if (!loggedIn) {
      neverLoggedIn.push({ alias: s.alias, accountAgeDays: s.createdAtMs ? Math.floor((nowMs - s.createdAtMs) / DAY) : null });
      continue;
    }
    funnel.everLoggedIn += 1;
    if (ops && n(ops.aiMessages) > 0) funnel.sentFirstAiMessage += 1;
    if (lastActiveMs && nowMs - lastActiveMs <= 7 * DAY) {
      funnel.active7d += 1;
      continue;
    }
    const daysInactive = lastActiveMs ? Math.floor((nowMs - lastActiveMs) / DAY) : null;
    const row = {
      alias: s.alias,
      daysInactive,
      aiMessages: ops ? n(ops.aiMessages) : 0,
      lastKind: (ops && ops.lastKind) || null,
      lastOutcome: (ops && ops.lastOutcome) || null,
      lastErrorCode: (ops && ops.lastErrorCode) || null,
    };
    inactive.push(row);

    // "Error preceded abandonment": the last thing this student experienced
    // was an error/fallback, or an error happened within an hour of the end.
    const lastErrorMs = toMillis(ops && ops.lastErrorAt);
    const lastAiMs = toMillis(ops && ops.lastAiAt);
    const errorAtEnd = ops && (ops.lastOutcome === 'error' || ops.lastOutcome === 'fallback' ||
      (lastErrorMs && lastAiMs && lastAiMs - lastErrorMs <= 3600 * 1000));
    if (errorAtEnd) {
      const key = `${ops.lastErrorKind || ops.lastKind || 'unknown'}|${ops.lastErrorCode || 'UNKNOWN'}`;
      const cur = errorsBeforeAbandon.get(key) || {
        kind: ops.lastErrorKind || ops.lastKind || 'unknown', code: ops.lastErrorCode || 'UNKNOWN', students: 0,
      };
      cur.students += 1;
      errorsBeforeAbandon.set(key, cur);
    }
  }

  const sessionTotals = new Map();
  for (const { chats } of chatDays || []) {
    for (const [alias, count] of Object.entries(chats || {})) {
      sessionTotals.set(alias, (sessionTotals.get(alias) || 0) + n(count));
    }
  }
  const sessions = sessionTotals.size;
  const shortSessions = [...sessionTotals.values()].filter((c) => c >= 1 && c <= 2).length;
  const distribution = { '1': 0, '2': 0, '3-5': 0, '6-10': 0, '11+': 0 };
  for (const c of sessionTotals.values()) {
    if (c <= 1) distribution['1'] += 1;
    else if (c === 2) distribution['2'] += 1;
    else if (c <= 5) distribution['3-5'] += 1;
    else if (c <= 10) distribution['6-10'] += 1;
    else distribution['11+'] += 1;
  }

  inactive.sort((a, b) => (b.daysInactive ?? 0) - (a.daysInactive ?? 0));

  return {
    funnel,
    funnelSteps: [
      { id: 'accounts', count: funnel.accounts },
      { id: 'everLoggedIn', count: funnel.everLoggedIn },
      { id: 'sentFirstAiMessage', count: funnel.sentFirstAiMessage },
      { id: 'active7d', count: funnel.active7d },
    ],
    neverLoggedIn: neverLoggedIn.length,
    inactiveOver7d: inactive,
    sessions: {
      total: sessions,
      endedAfter1to2Messages: shortSessions,
      shortRate: rate(shortSessions, sessions),
      distribution,
      days: (chatDays || []).map((d) => d.day),
    },
    errorsBeforeAbandonment: [...errorsBeforeAbandon.values()].sort((a, b) => b.students - a.students),
  };
}

/** Merge `errors` maps across days → top lists. */
function errorsReport(days) {
  const merged = new Map();
  const fallbackReasons = new Map();
  for (const { data } of days) {
    if (!data) continue;
    for (const [key, e] of Object.entries(data.errors || {})) {
      const cur = merged.get(key) || {
        key, kind: e.kind || null, status: e.status ?? null, code: e.code || null,
        route: e.route || null, provider: e.provider || null, outcome: e.outcome || null,
        count: 0, lastSeenMs: 0,
      };
      cur.count += n(e.count);
      cur.lastSeenMs = Math.max(cur.lastSeenMs, toMillis(e.lastSeen) || 0);
      merged.set(key, cur);
    }
    for (const [reason, count] of Object.entries(data.fallbackReasons || {})) {
      fallbackReasons.set(reason, (fallbackReasons.get(reason) || 0) + n(count));
    }
  }
  const rows = [...merged.values()].map((r) => ({
    ...r, lastSeen: r.lastSeenMs ? new Date(r.lastSeenMs).toISOString() : null,
  }));
  const group = (field) => {
    const m = new Map();
    for (const r of rows) {
      const k = r[field] || 'unknown';
      const cur = m.get(k) || { [field]: k, count: 0, lastSeenMs: 0 };
      cur.count += r.count;
      cur.lastSeenMs = Math.max(cur.lastSeenMs, r.lastSeenMs);
      m.set(k, cur);
    }
    return [...m.values()]
      .map(({ lastSeenMs, ...rest }) => ({ ...rest, lastSeen: lastSeenMs ? new Date(lastSeenMs).toISOString() : null }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  };
  return {
    total: rows.reduce((s, r) => s + r.count, 0),
    top: rows
      .sort((a, b) => b.count - a.count)
      .slice(0, 25)
      .map(({ lastSeenMs, ...rest }) => rest),
    byCode: group('code'),
    byRoute: group('route'),
    byProvider: group('provider'),
    fallbackReasons: [...fallbackReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

module.exports = {
  RANGES,
  THRESHOLDS,
  collectHourBuckets,
  dropoff,
  errorsReport,
  evaluateBalance,
  evaluateMetricChecks,
  overallStatus,
  parseRange,
  summarize,
  toMillis,
  windowMetrics,
};

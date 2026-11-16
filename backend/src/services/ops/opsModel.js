'use strict';

/**
 * Pure helpers for operations monitoring (no Firestore, no network).
 *
 * Data model (written by opsRecorder.js):
 *   opsEvents/{auto}      one doc per AI interaction / login / HTTP error,
 *                         expires via TTL on `expireAt` (default 90 days)
 *   opsDaily/{YYYY-MM-DD} one doc per local day, FieldValue.increment counters
 *                         (totals, per kind, per provider/model, per hour,
 *                         latency histograms, error keys, active users, chats)
 *   opsUsers/{alias}      one doc per user alias: last activity / last outcome
 *                         (used for the drop-off funnel)
 *
 * Users are never stored by name or raw uid: `alias` is a short sha256 prefix.
 */

const crypto = require('crypto');

const DEFAULT_TIMEZONE = 'Asia/Jerusalem';
const EVENT_TTL_DAYS = 90;

// Latency histogram upper bounds (ms). Last bucket is open-ended.
const LATENCY_BUCKETS = [250, 500, 1000, 2000, 3000, 5000, 8000, 12000, 20000, 30000];

const AI_KINDS = new Set(['text', 'voice', 'tts', 'stt', 'pronunciation']);
const MESSAGE_KINDS = new Set(['text', 'voice']);

// USD per 1M tokens. Estimates used only when the provider does not report
// the cost itself (OpenRouter does). Override with OPS_PRICES (JSON).
const DEFAULT_PRICES = {
  models: {
    'google/gemini-2.5-flash-lite': { in: 0.10, out: 0.40 },
    'gemini-2.5-flash-lite': { in: 0.10, out: 0.40 },
    'google/gemini-2.5-flash': { in: 0.30, out: 2.50 },
    'gemini-2.5-flash': { in: 0.30, out: 2.50 },
    'gemini-2.0-flash': { in: 0.10, out: 0.40 },
    'gpt-4o-mini': { in: 0.15, out: 0.60 },
    'llama-3.1-8b-instant': { in: 0.05, out: 0.08 },
  },
  // Azure Speech standard tier: $1 per audio hour.
  sttUsdPerSecond: 1 / 3600,
  // Per 1M characters of synthesized speech, by provider.
  ttsUsdPerMChars: { azure: 16, elevenlabs: 80, default: 16 },
  // Pronunciation assessment is billed as speech-to-text audio time.
  pronunciationUsdPerSecond: 1 / 3600,
  // Encoded bytes per second of uploaded voice audio (webm/opus ≈ 32 kbps).
  voiceBytesPerSecond: 4000,
};

let cachedPrices = null;
let cachedPricesRaw = null;

function getPrices(env = process.env) {
  const raw = String(env.OPS_PRICES || '');
  if (cachedPrices && cachedPricesRaw === raw) return cachedPrices;
  let override = {};
  if (raw.trim()) {
    try {
      override = JSON.parse(raw) || {};
    } catch (_) {
      override = {};
    }
  }
  cachedPrices = {
    ...DEFAULT_PRICES,
    ...override,
    models: { ...DEFAULT_PRICES.models, ...(override.models || {}) },
    ttsUsdPerMChars: { ...DEFAULT_PRICES.ttsUsdPerMChars, ...(override.ttsUsdPerMChars || {}) },
  };
  cachedPricesRaw = raw;
  return cachedPrices;
}

function hashShort(value, prefix, length = 10) {
  if (value === undefined || value === null || value === '') return null;
  return prefix + crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, length);
}

function userAlias(uid) {
  return hashShort(uid, 'u_');
}

function chatAlias(chatId) {
  return hashShort(chatId, 'c_');
}

function getTimezone(env = process.env) {
  return String(env.OPS_TIMEZONE || '').trim() || DEFAULT_TIMEZONE;
}

/** Local calendar parts for a date in the ops timezone. */
function localParts(date, timeZone = getTimezone()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: parts.hour };
}

function dayKey(date = new Date(), timeZone) {
  return localParts(date, timeZone).day;
}

function hourKey(date = new Date(), timeZone) {
  return localParts(date, timeZone).hour;
}

/** Day keys (oldest → newest) for the last `n` local days ending at `now`. */
function lastDayKeys(n, now = new Date(), timeZone) {
  const keys = [];
  const seen = new Set();
  // Step in 6h increments so DST shifts never skip or duplicate a day.
  for (let i = 0; keys.length < n && i < n * 8; i += 1) {
    const key = dayKey(new Date(now.getTime() - i * 6 * 3600 * 1000), timeZone);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys.reverse();
}

/** [{day, hour}] for the last `n` clock hours (oldest → newest), local time. */
function lastHourSlots(n, now = new Date(), timeZone) {
  const slots = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const parts = localParts(new Date(now.getTime() - i * 3600 * 1000), timeZone || getTimezone());
    if (!slots.some((s) => s.day === parts.day && s.hour === parts.hour)) slots.push(parts);
  }
  return slots;
}

function latencyBucketKey(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return null;
  for (const bound of LATENCY_BUCKETS) {
    if (value <= bound) return `le${bound}`;
  }
  return 'inf';
}

/** Percentile from a histogram {le250: n, ...}; returns the bucket upper bound. */
function percentileFromHistogram(hist, p) {
  if (!hist) return null;
  const total = Object.values(hist).reduce((s, n) => s + (Number(n) || 0), 0);
  if (!total) return null;
  const target = total * p;
  let cumulative = 0;
  for (const bound of LATENCY_BUCKETS) {
    cumulative += Number(hist[`le${bound}`]) || 0;
    if (cumulative >= target) return bound;
  }
  return LATENCY_BUCKETS[LATENCY_BUCKETS.length - 1] + 1; // ">30s"
}

function mergeHistograms(target, source) {
  if (!source) return target;
  for (const [k, v] of Object.entries(source)) {
    target[k] = (target[k] || 0) + (Number(v) || 0);
  }
  return target;
}

/** Firestore map keys: keep them short and free of path-like characters. */
function safeKey(value, fallback = 'unknown') {
  const s = String(value === undefined || value === null || value === '' ? fallback : value)
    .replace(/[.\/#\[\]*`~\s]+/g, '_')
    .slice(0, 120);
  return s || fallback;
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Estimate the USD cost of one interaction.
 * Returns { costUsd, costSource } where costSource is
 *   'provider' (reported by OpenRouter), 'estimate', or null (unknown).
 */
function estimateCost(event, env = process.env) {
  const prices = getPrices(env);
  let total = 0;
  let known = false;
  let source = null;

  const reported = Number(event.providerCostUsd);
  if (Number.isFinite(reported) && reported >= 0 && event.providerCostUsd !== null) {
    total += reported;
    known = true;
    source = 'provider';
  } else if ((event.inputTokens || 0) + (event.outputTokens || 0) > 0) {
    const price = prices.models[event.model] || prices.models[String(event.model || '').split('/').pop()];
    if (price) {
      total += ((event.inputTokens || 0) * price.in + (event.outputTokens || 0) * price.out) / 1e6;
      known = true;
      source = 'estimate';
    }
  }

  if (event.audioSeconds > 0 && (event.kind === 'voice' || event.kind === 'stt')) {
    total += event.audioSeconds * prices.sttUsdPerSecond;
    known = true;
    source = source || 'estimate';
  }
  if (event.audioSeconds > 0 && event.kind === 'pronunciation') {
    total += event.audioSeconds * prices.pronunciationUsdPerSecond;
    known = true;
    source = source || 'estimate';
  }
  if (event.ttsChars > 0) {
    const provider = String(event.ttsProvider || 'azure').toLowerCase();
    const perM = prices.ttsUsdPerMChars[provider] ?? prices.ttsUsdPerMChars.default;
    total += (event.ttsChars * perM) / 1e6;
    known = true;
    if (source === 'provider') source = 'mixed';
    else source = source || 'estimate';
  }

  return known ? { costUsd: round6(total), costSource: source } : { costUsd: null, costSource: null };
}

function classifyOutcome({ kind, status, fallbackUsed }) {
  if (status >= 500) return 'error';
  if (AI_KINDS.has(kind) && status >= 400) return 'error';
  if (kind === 'login' && status >= 400) return 'error';
  if (status >= 400) return 'error';
  if (fallbackUsed) return 'fallback';
  return 'ok';
}

function isRateLimited({ status, errorCode, fallbackReason }) {
  if (status === 429) return true;
  const codes = [errorCode, fallbackReason].map((c) => String(c || '').toUpperCase());
  return codes.some((c) => c === 'PROVIDER_QUOTA' || c === 'AI_RATE_LIMITED' || c.includes('429'));
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalise raw capture data into one ops event document (without Firestore
 * timestamps). All fields are plain JSON values.
 */
function buildEvent(raw, { now = new Date(), env = process.env } = {}) {
  const status = Number(raw.status) || 0;
  const kind = raw.kind || 'http';
  const fallbackUsed = raw.fallbackUsed === true;
  const fallbackReason = raw.fallbackReason || null;
  let errorCode = raw.errorCode || null;
  const outcome = classifyOutcome({ kind, status, fallbackUsed });
  if (!errorCode && outcome === 'error') errorCode = `HTTP_${status}`;
  if (!errorCode && outcome === 'fallback') errorCode = fallbackReason || 'FALLBACK';

  const event = {
    kind,
    route: raw.route || null,
    method: raw.method || null,
    status,
    outcome,
    isError: outcome === 'error',
    rateLimited: isRateLimited({ status, errorCode, fallbackReason }),
    userAlias: raw.uid ? userAlias(raw.uid) : null,
    role: raw.role || null,
    level: raw.level || null,
    chatAlias: raw.chatId ? chatAlias(raw.chatId) : null,
    provider: raw.provider || null,
    model: raw.model || null,
    fallbackUsed,
    fallbackReason,
    errorCode,
    latencyMs: num(raw.latencyMs),
    aiLatencyMs: num(raw.aiLatencyMs),
    inputTokens: num(raw.inputTokens) || 0,
    outputTokens: num(raw.outputTokens) || 0,
    audioSeconds: num(raw.audioSeconds) || 0,
    ttsChars: num(raw.ttsChars) || 0,
    ttsProvider: raw.ttsProvider || null,
    cacheHit: raw.cacheHit === true,
    stream: raw.stream === true,
    day: dayKey(now, getTimezone(env)),
    hour: hourKey(now, getTimezone(env)),
  };
  const { costUsd, costSource } = estimateCost({ ...event, providerCostUsd: raw.providerCostUsd ?? null }, env);
  event.costUsd = costUsd;
  event.costSource = costSource;
  return event;
}

function errorKey(event) {
  return safeKey([event.kind, event.status, event.errorCode, event.route].join('|'));
}

/**
 * Nested object for `opsDaily/{day}.set(update, {merge: true})`.
 * `inc(n)` is FieldValue.increment; `ts` is the event time value.
 */
function buildDailyUpdate(event, { inc, ts }) {
  const isAi = AI_KINDS.has(event.kind);
  const isMessage = MESSAGE_KINDS.has(event.kind) && event.status < 400;
  const update = { day: event.day, updatedAt: ts };

  if (event.kind === 'login') {
    update.logins = { [event.outcome === 'error' ? 'failure' : 'success']: inc(1) };
  }

  if (isAi) {
    const totals = {
      events: inc(1),
      [event.outcome]: inc(1),
    };
    if (event.rateLimited) totals.rateLimited = inc(1);
    if (isMessage) totals.messages = inc(1);
    if (isMessage && event.kind === 'voice') totals.voiceMessages = inc(1);
    if (event.inputTokens) totals.inputTokens = inc(event.inputTokens);
    if (event.outputTokens) totals.outputTokens = inc(event.outputTokens);
    if (event.audioSeconds) totals.audioSeconds = inc(event.audioSeconds);
    if (event.ttsChars) totals.ttsChars = inc(event.ttsChars);
    if (event.costUsd !== null) totals.costUsd = inc(event.costUsd);
    else totals.unpricedEvents = inc(1);
    update.totals = totals;

    const kindStats = { events: inc(1), [event.outcome]: inc(1) };
    if (event.costUsd !== null) kindStats.costUsd = inc(event.costUsd);
    if (event.latencyMs !== null) kindStats.latencyMsSum = inc(event.latencyMs);
    update.byKind = { [event.kind]: kindStats };

    if (event.provider || event.model) {
      const modelKey = safeKey(`${event.provider || 'unknown'}__${event.model || 'unknown'}`);
      const modelStats = {
        provider: event.provider || null,
        model: event.model || null,
        events: inc(1),
        [event.outcome]: inc(1),
      };
      if (event.rateLimited) modelStats.rateLimited = inc(1);
      if (event.inputTokens) modelStats.inputTokens = inc(event.inputTokens);
      if (event.outputTokens) modelStats.outputTokens = inc(event.outputTokens);
      if (event.costUsd !== null) modelStats.costUsd = inc(event.costUsd);
      update.byModel = { [modelKey]: modelStats };
    }

    if (event.fallbackUsed && event.fallbackReason) {
      update.fallbackReasons = { [safeKey(event.fallbackReason)]: inc(1) };
    }
  }

  // Hourly bucket: drives "recent" health metrics (fallback / 429 / latency).
  const hourStats = {};
  if (isAi) {
    hourStats.events = inc(1);
    hourStats[event.outcome] = inc(1);
    if (event.rateLimited) hourStats.rateLimited = inc(1);
    if (isMessage) hourStats.messages = inc(1);
    if (event.costUsd !== null) hourStats.costUsd = inc(event.costUsd);
    const bucket = latencyBucketKey(event.latencyMs);
    if (bucket && (event.kind === 'text' || event.kind === 'voice') && !event.stream) {
      const histName = event.kind === 'voice' ? 'latVoice' : 'lat';
      hourStats[histName] = { [bucket]: inc(1) };
    }
  }
  if (event.status >= 500) hourStats.http5xx = inc(1);
  if (Object.keys(hourStats).length) update.hours = { [event.hour]: hourStats };

  if (event.outcome === 'error' || event.outcome === 'fallback') {
    update.errors = {
      [errorKey(event)]: {
        kind: event.kind,
        status: event.status,
        code: event.errorCode,
        route: event.route,
        provider: event.provider || null,
        outcome: event.outcome,
        count: inc(1),
        lastSeen: ts,
      },
    };
  }

  if (event.status >= 500) update.http = { errors5xx: inc(1) };
  else if (event.status >= 400) update.http = { errors4xx: inc(1) };

  if (event.userAlias && event.status < 400) {
    update.activeUsers = { [event.userAlias]: event.role || 'unknown' };
  }

  if (isMessage && event.chatAlias && event.role === 'student') {
    update.chats = { [event.chatAlias]: inc(1) };
  }

  return update;
}

/** Update for opsUsers/{alias} (merge). Null when no user is attached. */
function buildUserUpdate(event, { inc, ts }) {
  if (!event.userAlias) return null;
  const update = {
    alias: event.userAlias,
    role: event.role || null,
    lastSeenAt: ts,
  };
  if (event.status < 400) update.lastActiveAt = ts;
  if (AI_KINDS.has(event.kind)) {
    update.lastAiAt = ts;
    update.lastKind = event.kind;
    update.lastOutcome = event.outcome;
    if (MESSAGE_KINDS.has(event.kind) && event.status < 400) update.aiMessages = inc(1);
  }
  if (event.kind === 'login' && event.outcome !== 'error') update.lastLoginAt = ts;
  if (event.outcome === 'error' || event.outcome === 'fallback') {
    update.lastErrorAt = ts;
    update.lastErrorCode = event.errorCode;
    update.lastErrorKind = event.kind;
  }
  return update;
}

module.exports = {
  AI_KINDS,
  DEFAULT_PRICES,
  EVENT_TTL_DAYS,
  LATENCY_BUCKETS,
  buildDailyUpdate,
  buildEvent,
  buildUserUpdate,
  chatAlias,
  dayKey,
  errorKey,
  estimateCost,
  getPrices,
  getTimezone,
  hourKey,
  isRateLimited,
  lastDayKeys,
  lastHourSlots,
  latencyBucketKey,
  mergeHistograms,
  percentileFromHistogram,
  safeKey,
  userAlias,
};

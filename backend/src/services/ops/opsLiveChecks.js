'use strict';

/**
 * Live dependency checks for GET /api/ops/health.
 * Every check resolves (never rejects) to { id, status, ... } with
 * status ∈ ok | warn | critical | unknown. HTTP client is injectable for tests.
 */

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const BALANCE_CACHE_MS = 5 * 60 * 1000;

let balanceCache = { at: 0, value: null, key: null };

function resetBalanceCache() {
  balanceCache = { at: 0, value: null, key: null };
}

async function timed(fn) {
  const started = Date.now();
  try {
    const value = await fn();
    return { value, ms: Date.now() - started };
  } catch (error) {
    return { error, ms: Date.now() - started };
  }
}

async function checkFirestore(db) {
  const r = await timed(() => db.collection('opsDaily').limit(1).get());
  if (r.error) {
    return { id: 'firestore', status: 'critical', latencyMs: r.ms, detail: String(r.error.message || r.error).slice(0, 200) };
  }
  return { id: 'firestore', status: r.ms > 2000 ? 'warn' : 'ok', latencyMs: r.ms };
}

async function checkAiReady(http, baseUrl, config) {
  const r = await timed(() => http.get(`${baseUrl}/api/ai/ready`, { ...config, timeout: 5000, validateStatus: () => true }));
  if (r.error) {
    return { id: 'ai_service', status: 'critical', latencyMs: r.ms, detail: `unreachable: ${String(r.error.message || r.error).slice(0, 160)}` };
  }
  const res = r.value;
  const checks = (res.data && res.data.checks) || {};
  if (res.status === 200) {
    return { id: 'ai_service', status: r.ms > 3000 ? 'warn' : 'ok', latencyMs: r.ms, checks };
  }
  // 503 "degraded" (e.g. cold cache on a Render cold start) is a warning; any
  // other status means the service cannot answer.
  return {
    id: 'ai_service',
    status: res.status === 503 ? 'warn' : 'critical',
    latencyMs: r.ms,
    httpStatus: res.status,
    checks,
  };
}

async function checkCircuits(http, baseUrl, config) {
  const r = await timed(() => http.get(`${baseUrl}/api/ai/chat/voice/health`, { ...config, timeout: 5000 }));
  if (r.error) {
    return { id: 'voice_circuits', status: 'unknown', detail: 'unavailable' };
  }
  const data = r.value.data || {};
  const states = { stt: data.stt_circuit || 'unknown', tts: data.tts_circuit || 'unknown' };
  const values = Object.values(states);
  let status = 'ok';
  if (values.includes('open')) status = 'critical';
  else if (values.includes('half_open')) status = 'warn';
  else if (values.every((v) => v === 'unknown')) status = 'unknown';
  return { id: 'voice_circuits', status, states };
}

/**
 * OpenRouter balance. Prefers GET /credits (management key: purchased − used),
 * falls back to GET /key (limit_remaining of that key). Cached 5 min.
 * Returns { status: 'ok', remainingUsd, source, ... } or { status: 'unknown', reason }.
 */
async function fetchOpenRouterBalance(http, env = process.env, now = Date.now()) {
  const key = String(env.OPENROUTER_API_KEY_OPS || '').trim();
  if (!key) return { status: 'unknown', reason: 'not_configured' };
  if (balanceCache.value && balanceCache.key === key && now - balanceCache.at < BALANCE_CACHE_MS) {
    return { ...balanceCache.value, cached: true };
  }
  const headers = { Authorization: `Bearer ${key}` };
  let result = null;

  try {
    const res = await http.get(`${OPENROUTER_BASE}/credits`, { headers, timeout: 5000, validateStatus: () => true });
    const d = res && res.data && res.data.data;
    if (res.status === 200 && d && Number.isFinite(Number(d.total_credits))) {
      result = {
        status: 'ok',
        source: 'credits',
        totalCreditsUsd: Number(d.total_credits),
        totalUsageUsd: Number(d.total_usage) || 0,
        remainingUsd: Math.round((Number(d.total_credits) - (Number(d.total_usage) || 0)) * 100) / 100,
      };
    }
  } catch (_) {
    /* fall through to /key */
  }

  if (!result) {
    try {
      const res = await http.get(`${OPENROUTER_BASE}/key`, { headers, timeout: 5000, validateStatus: () => true });
      const d = res && res.data && res.data.data;
      if (res.status === 200 && d) {
        const remaining = d.limit_remaining === null || d.limit_remaining === undefined
          ? null : Number(d.limit_remaining);
        result = {
          status: remaining === null ? 'unknown' : 'ok',
          reason: remaining === null ? 'key_has_no_limit' : undefined,
          source: 'key',
          remainingUsd: remaining,
          limitUsd: d.limit ?? null,
          usageDailyUsd: d.usage_daily ?? null,
          usageMonthlyUsd: d.usage_monthly ?? null,
          isFreeTier: d.is_free_tier ?? null,
        };
      } else {
        result = { status: 'unknown', reason: `http_${res && res.status}` };
      }
    } catch (error) {
      result = { status: 'unknown', reason: 'unreachable' };
    }
  }

  balanceCache = { at: now, value: result, key };
  return result;
}

module.exports = {
  checkAiReady,
  checkCircuits,
  checkFirestore,
  fetchOpenRouterBalance,
  resetBalanceCache,
};

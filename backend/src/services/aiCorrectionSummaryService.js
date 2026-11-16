'use strict';

/**
 * aiCorrectionSummaryService.js — AI-written summary of the active reviewer
 * rules per level, injected into the tutor prompt instead of the raw list.
 *
 * Owner decision (2026-11-16): the summary goes live immediately after every
 * approve / deactivate / reactivate (no second approval), but it is visible
 * and editable on /admin/ai-feedback.
 *
 * Safety: an AI summary is accepted only when every active rule id of the
 * level (+ALL) appears in the union of its sentence ruleIds, it references no
 * unknown id, and it fits the length cap. On rejection we retry once, then
 * keep the previous summary and mark the doc status 'failed'. The internal
 * endpoint serves a summary only when its ruleIds equal the current active
 * rule ids — otherwise ai-service falls back to the raw rule list.
 *
 * Firestore: aiCorrectionSummaries/{level}
 *   { text, ruleIds, sentences, version, generatedAt, generatedBy ('ai'|uid),
 *     model, status ('ok'|'failed'), error, failedAt, previous: {text, version, ruleIds} }
 *
 * Regeneration runs off the request path and is serialized per level inside
 * this process: while one run is in flight, further triggers collapse into a
 * single follow-up run that reads the latest rules (latest wins).
 */

const axios = require('axios');

const reviewService = require('./aiReviewService');
const { createAiRequestConfig, normalizeAiServiceBaseUrl } = require('./aiChatService');

const COLLECTION = 'aiCorrectionSummaries';
const SUMMARY_LEVELS = Object.freeze(['A1', 'A2', 'B1', 'B2']);
const AI_SUMMARY_MAX_CHARS = 900;
const HUMAN_SUMMARY_MAX_CHARS = 1200;
const MIN_HUMAN_SUMMARY_CHARS = 5;
const MAX_ATTEMPTS = 2; // first try + one retry
const DEFAULT_SUMMARY_TIMEOUT_MS = 30000;

function getDb() {
  return require('../config/firebase').db;
}

function httpError(status, code, error) {
  const err = new Error(error);
  err.status = status;
  err.code = code;
  return err;
}

function toIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000).toISOString();
  return null;
}

function normalizeSummaryLevel(level) {
  const value = String(level || '').trim().toUpperCase();
  if (!SUMMARY_LEVELS.includes(value)) {
    throw httpError(400, 'INVALID_LEVEL', 'Invalid level');
  }
  return value;
}

/** Levels whose summary depends on a rule of this level ('ALL' -> every level). */
function levelsAffectedBy(ruleLevel) {
  const value = String(ruleLevel || '').trim().toUpperCase();
  if (value === 'ALL') return [...SUMMARY_LEVELS];
  return SUMMARY_LEVELS.includes(value) ? [value] : [];
}

function sameIdSet(a, b) {
  const left = new Set(Array.isArray(a) ? a.map(String) : []);
  const right = new Set(Array.isArray(b) ? b.map(String) : []);
  if (left.size !== right.size) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

/**
 * Coverage validator (owner's safety requirement).
 * Returns { ok: true, text, sentences } or { ok: false, error }.
 */
function validateSummary(result, rules, { maxChars = AI_SUMMARY_MAX_CHARS } = {}) {
  if (!result || typeof result !== 'object') return { ok: false, error: 'Empty summary response' };
  const text = typeof result.summary === 'string' ? result.summary.replace(/\s+/g, ' ').trim() : '';
  if (!text) return { ok: false, error: 'Summary text is missing' };
  if (text.length > maxChars) {
    return { ok: false, error: `Summary is too long (${text.length} > ${maxChars} characters)` };
  }
  if (!Array.isArray(result.sentences) || result.sentences.length === 0) {
    return { ok: false, error: 'Summary sentences are missing' };
  }
  const known = new Set(rules.map((rule) => String(rule.id)));
  const covered = new Set();
  const unknown = new Set();
  const sentences = [];
  for (const sentence of result.sentences) {
    const ids = Array.isArray(sentence?.ruleIds) ? sentence.ruleIds.map(String) : [];
    for (const id of ids) {
      if (known.has(id)) covered.add(id);
      else unknown.add(id);
    }
    sentences.push({ text: String(sentence?.text || '').trim(), ruleIds: ids });
  }
  if (unknown.size > 0) {
    return { ok: false, error: `Summary references unknown rule ids: ${[...unknown].join(', ')}` };
  }
  const missing = [...known].filter((id) => !covered.has(id));
  if (missing.length > 0) {
    return { ok: false, error: `Summary does not cover rule ids: ${missing.join(', ')}` };
  }
  return { ok: true, text, sentences };
}

function summaryTimeoutMs() {
  const configured = Number(process.env.AI_SUMMARY_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_SUMMARY_TIMEOUT_MS;
}

async function requestSummary(level, rules) {
  const url = `${normalizeAiServiceBaseUrl()}/api/ai/internal/summarize-corrections`;
  const response = await axios.post(
    url,
    { level, rules: rules.map((rule) => ({ id: String(rule.id), ruleText: String(rule.ruleText || '') })) },
    createAiRequestConfig({ timeout: summaryTimeoutMs(), headers: { 'Content-Type': 'application/json' } })
  );
  return response?.data || null;
}

function summaryRef(level) {
  return getDb().collection(COLLECTION).doc(level);
}

async function readSummaryDoc(level) {
  const snap = await summaryRef(level).get();
  return snap.exists ? snap.data() || {} : null;
}

function previousOf(current) {
  if (!current || typeof current.text !== 'string' || !current.text) return null;
  return {
    text: current.text,
    version: Number(current.version) || 0,
    ruleIds: Array.isArray(current.ruleIds) ? current.ruleIds : [],
  };
}

/** One regeneration for one level (not serialized — use scheduleRegeneration). */
async function regenerateLevelNow(level) {
  const rules = await reviewService.getActiveCorrectionsForLevel(level);
  const ruleIds = rules.map((rule) => String(rule.id));
  const current = await readSummaryDoc(level);
  const ref = summaryRef(level);
  const now = new Date();

  if (rules.length === 0) {
    if (current && !current.text && sameIdSet(current.ruleIds, []) && current.status === 'ok') {
      return current;
    }
    const doc = {
      level,
      text: '',
      ruleIds: [],
      sentences: [],
      version: (Number(current?.version) || 0) + 1,
      generatedAt: now,
      generatedBy: 'ai',
      model: null,
      status: 'ok',
      error: null,
      failedAt: null,
      previous: previousOf(current) || current?.previous || null,
    };
    await ref.set(doc);
    return doc;
  }

  let lastError = 'Unknown error';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await requestSummary(level, rules);
      const verdict = validateSummary(result, rules);
      if (verdict.ok) {
        const doc = {
          level,
          text: verdict.text,
          ruleIds,
          sentences: verdict.sentences,
          version: (Number(current?.version) || 0) + 1,
          generatedAt: new Date(),
          generatedBy: 'ai',
          model: result.model || null,
          status: 'ok',
          error: null,
          failedAt: null,
          previous: previousOf(current),
        };
        await ref.set(doc);
        return doc;
      }
      lastError = verdict.error;
    } catch (error) {
      lastError = error?.response?.data?.detail || error?.message || String(error);
    }
    console.warn(`[ai-summary] ${level} attempt ${attempt} rejected: ${lastError}`);
  }

  // Keep the previous good summary; just record the failure (visible in UI).
  const failure = { level, status: 'failed', error: String(lastError).slice(0, 500), failedAt: new Date() };
  await ref.set(failure, { merge: true });
  return { ...(current || {}), ...failure };
}

// ── Per-level serialization (latest wins) ───────────────────────────────────
const runners = new Map(); // level -> { promise, pending }

function scheduleRegeneration(level) {
  const normalized = normalizeSummaryLevel(level);
  const existing = runners.get(normalized);
  if (existing) {
    existing.pending = true;
    return existing.promise;
  }
  const state = { pending: false, promise: null };
  state.promise = (async () => {
    let result = null;
    try {
      do {
        state.pending = false;
        try {
          result = await regenerateLevelNow(normalized);
        } catch (error) {
          console.error(`[ai-summary] ${normalized} regeneration crashed:`, error?.message || error);
        }
      } while (state.pending);
    } finally {
      runners.delete(normalized);
    }
    return result;
  })();
  runners.set(normalized, state);
  return state.promise;
}

/** Fire-and-forget hook for rule changes. Returns a promise for tests. */
function triggerForRuleLevel(ruleLevel) {
  return Promise.all(levelsAffectedBy(ruleLevel).map((level) => scheduleRegeneration(level)));
}

function isRegenerating(level) {
  return runners.has(level);
}

async function waitForIdle() {
  while (runners.size > 0) {
    await Promise.all([...runners.values()].map((state) => state.promise));
  }
}

// ── Admin API ───────────────────────────────────────────────────────────────

function serializeSummary(level, data, activeRules) {
  const activeIds = activeRules.map((rule) => String(rule.id));
  const doc = data || {};
  const text = typeof doc.text === 'string' ? doc.text : '';
  return {
    level,
    text,
    version: Number(doc.version) || 0,
    ruleIds: Array.isArray(doc.ruleIds) ? doc.ruleIds : [],
    generatedAt: toIso(doc.generatedAt),
    generatedBy: doc.generatedBy || null,
    edited: Boolean(doc.generatedBy && doc.generatedBy !== 'ai'),
    model: doc.model || null,
    status: data ? doc.status || 'ok' : 'none',
    error: doc.status === 'failed' ? doc.error || null : null,
    failedAt: toIso(doc.failedAt),
    previous: doc.previous && doc.previous.text
      ? { text: doc.previous.text, version: Number(doc.previous.version) || 0 }
      : null,
    activeRuleCount: activeIds.length,
    coversCurrentRules: Boolean(text) && sameIdSet(doc.ruleIds, activeIds),
    regenerating: isRegenerating(level),
  };
}

async function listSummaries() {
  return Promise.all(
    SUMMARY_LEVELS.map(async (level) => {
      const [data, rules] = await Promise.all([
        readSummaryDoc(level),
        reviewService.getActiveCorrectionsForLevel(level),
      ]);
      return serializeSummary(level, data, rules);
    })
  );
}

async function getSummary(level) {
  const normalized = normalizeSummaryLevel(level);
  const [data, rules] = await Promise.all([
    readSummaryDoc(normalized),
    reviewService.getActiveCorrectionsForLevel(normalized),
  ]);
  return serializeSummary(normalized, data, rules);
}

/** Human edit: accepted as-is (no coverage check), marked as edited by uid. */
async function editSummary(level, text, uid) {
  const normalized = normalizeSummaryLevel(level);
  if (typeof text !== 'string') throw httpError(400, 'TEXT_REQUIRED', 'text is required');
  const clean = text.replace(/[ \t]+/g, ' ').trim();
  if (clean.length < MIN_HUMAN_SUMMARY_CHARS) throw httpError(400, 'TEXT_REQUIRED', 'text is required');
  if (clean.length > HUMAN_SUMMARY_MAX_CHARS) {
    throw httpError(400, 'TEXT_TOO_LONG', `text must be at most ${HUMAN_SUMMARY_MAX_CHARS} characters`);
  }
  const [current, rules] = await Promise.all([
    readSummaryDoc(normalized),
    reviewService.getActiveCorrectionsForLevel(normalized),
  ]);
  await summaryRef(normalized).set({
    level: normalized,
    text: clean,
    // The editor saw the current rule set; the edit stands in for all of them.
    ruleIds: rules.map((rule) => String(rule.id)),
    sentences: [],
    version: (Number(current?.version) || 0) + 1,
    generatedAt: new Date(),
    generatedBy: String(uid),
    model: null,
    status: 'ok',
    error: null,
    failedAt: null,
    previous: previousOf(current),
  });
  return getSummary(normalized);
}

/** One-step revert: previous becomes current (as a new version), current becomes previous. */
async function revertSummary(level, uid) {
  const normalized = normalizeSummaryLevel(level);
  const current = await readSummaryDoc(normalized);
  if (!current?.previous?.text) {
    throw httpError(409, 'NO_PREVIOUS_SUMMARY', 'There is no previous version to restore');
  }
  await summaryRef(normalized).set({
    level: normalized,
    text: current.previous.text,
    ruleIds: Array.isArray(current.previous.ruleIds) ? current.previous.ruleIds : [],
    sentences: [],
    version: (Number(current.version) || 0) + 1,
    revertedFromVersion: Number(current.version) || 0,
    generatedAt: new Date(),
    generatedBy: String(uid),
    model: null,
    status: 'ok',
    error: null,
    failedAt: null,
    previous: previousOf(current),
  });
  return getSummary(normalized);
}

async function regenerateSummary(level) {
  const normalized = normalizeSummaryLevel(level);
  await scheduleRegeneration(normalized);
  return getSummary(normalized);
}

/**
 * For the internal endpoint: the summary is served only when it exists and
 * its covered rule ids equal the current active rule ids of the level (+ALL).
 * A failed regeneration keeps the previous text, which then no longer matches
 * the changed rule set — so ai-service falls back to the raw list.
 */
async function getServableSummary(level, activeRules) {
  const data = await readSummaryDoc(level);
  if (!data || typeof data.text !== 'string' || !data.text.trim()) return null;
  if (activeRules.length === 0) return null;
  if (!sameIdSet(data.ruleIds, activeRules.map((rule) => rule.id))) return null;
  return { text: data.text, version: Number(data.version) || 0 };
}

module.exports = {
  COLLECTION,
  SUMMARY_LEVELS,
  AI_SUMMARY_MAX_CHARS,
  HUMAN_SUMMARY_MAX_CHARS,
  levelsAffectedBy,
  validateSummary,
  regenerateLevelNow,
  scheduleRegeneration,
  triggerForRuleLevel,
  waitForIdle,
  listSummaries,
  getSummary,
  editSummary,
  revertSummary,
  regenerateSummary,
  getServableSummary,
};

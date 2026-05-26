'use strict';

/**
 * chatRateLimit.js  —  Sprint 6: Chat-specific rate limiting
 *
 * Two limiters are exported:
 *
 *  chatPostRateLimit      (default singleton)
 *    Applied to POST /api/chat/ only.
 *    Window  : 60 s (configurable via CHAT_RATE_LIMIT_WINDOW_MS env var)
 *    Max     : 15 requests per window (configurable via CHAT_RATE_LIMIT_MAX)
 *    Key     : req.user.uid when authenticated (preferred), falls back to IP
 *              so the limit is per-user, not per-IP, once the JWT is verified.
 *
 *  chatReadRateLimit      (lighter limit for GET history endpoints)
 *    Window  : 60 s
 *    Max     : 60 requests per window — generous because listing conversations
 *              is cheap and we don't want to block the history sidebar.
 *
 * Why uid-first key?
 *   IP-based rate limiting can penalise shared networks (schools, offices).
 *   Using the Firebase UID after requireAuth() ensures limits track the
 *   actual learner, not their network.
 *
 * Headers sent to the client:
 *   RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset  (RFC-standard)
 *   Retry-After (seconds until the window resets)
 *   X-RateLimit-* legacy headers are disabled.
 *
 * Body-size guard:
 *   This file does NOT set the body-size limit — that is applied per-router
 *   in server.js with express.json({ limit: '10kb' }) on the /api/chat path
 *   to block oversized payload attacks before the controller is reached.
 */

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

// ── Defaults ──────────────────────────────────────────────────────────────────
const DEFAULT_WINDOW_MS   = 60_000;  // 1 minute
const DEFAULT_POST_MAX    = 15;      // AI calls per minute (Sprint 6 spec)
const DEFAULT_READ_MAX    = 60;      // history reads per minute

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getChatRateLimitConfig(env = process.env) {
  return {
    windowMs: normalizePositiveInteger(env.CHAT_RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS),
    max:      normalizePositiveInteger(env.CHAT_RATE_LIMIT_MAX,        DEFAULT_POST_MAX),
    readMax:  normalizePositiveInteger(env.CHAT_READ_RATE_LIMIT_MAX,   DEFAULT_READ_MAX),
  };
}

/**
 * Prefer the authenticated user's UID so limits are per-user, not per-IP.
 * Falls back to the request IP (from express/proxy) when no JWT is present.
 */
function chatKeyGenerator(req) {
  // Prefer authenticated UID — limits are per-learner, not per-IP
  if (req.user?.uid) return `uid:${req.user.uid}`;
  // Fall back to ipKeyGenerator which handles IPv4-mapped IPv6 correctly
  return ipKeyGenerator(req);
}

// ── Factory ───────────────────────────────────────────────────────────────────

function createChatRateLimit(overrides = {}) {
  const base = getChatRateLimitConfig(overrides.env);

  return rateLimit({
    windowMs:       overrides.windowMs ?? base.windowMs,
    limit:          overrides.max      ?? base.max,
    standardHeaders: 'draft-7',   // RateLimit-* RFC headers
    legacyHeaders:   false,        // no X-RateLimit-* clutter
    keyGenerator:    chatKeyGenerator,
    handler(_req, res) {
      return res.status(429).json({
        success: false,
        code:    'CHAT_RATE_LIMITED',
        error:   'Too many chat requests',
      });
    },
    // Skip rate-limiting entirely for health-check or internal probes
    skip(req) {
      return req.path === '/api/health';
    },
  });
}

// ── Exported singletons ───────────────────────────────────────────────────────

/** Applied to POST /api/chat/ — 15 AI calls per user per minute */
const chatPostRateLimit = createChatRateLimit();

/** Applied to GET /api/chat/conversations* — 60 reads per minute */
const chatReadRateLimit = createChatRateLimit({
  max: getChatRateLimitConfig().readMax,
});

module.exports = {
  chatPostRateLimit,
  chatReadRateLimit,
  createChatRateLimit,
  getChatRateLimitConfig,
};

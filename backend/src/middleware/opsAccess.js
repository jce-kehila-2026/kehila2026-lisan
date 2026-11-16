'use strict';

/**
 * Server-side allowlist for the operations page.
 *
 * Runs after requireAuth + requireRole('admin','teacher'). Fails closed: when
 * OPS_ADMIN_EMAILS is unset or empty, nobody gets in. Entries are matched
 * case-insensitively against the user's email (looked up in users/{uid},
 * because the session JWT only carries uid/role/level).
 */

const EMAIL_CACHE_MS = 5 * 60 * 1000;
const emailCache = new Map(); // uid -> { email, at }

function parseAllowlist(env = process.env) {
  return String(env.OPS_ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function clearOpsAccessCache() {
  emailCache.clear();
}

async function lookupEmail(uid, db) {
  const cached = emailCache.get(uid);
  if (cached && Date.now() - cached.at < EMAIL_CACHE_MS) return cached.email;
  const snap = await db.collection('users').doc(uid).get();
  const email = snap && snap.exists ? String((snap.data() || {}).email || '').trim().toLowerCase() : '';
  emailCache.set(uid, { email, at: Date.now() });
  return email;
}

function deny(res, code) {
  return res.status(403).json({ success: false, error: 'Access denied', code });
}

function requireOpsAllowlist(options = {}) {
  return async (req, res, next) => {
    const allowlist = parseAllowlist(options.env || process.env);
    if (allowlist.length === 0) return deny(res, 'OPS_DISABLED');
    if (!req.user || !req.user.uid) return deny(res, 'OPS_NOT_ALLOWED');

    try {
      const tokenEmail = String(req.user.email || '').trim().toLowerCase();
      const db = options.db || require('../config/firebase').db;
      const email = tokenEmail || await lookupEmail(req.user.uid, db);
      if (!email || !allowlist.includes(email)) return deny(res, 'OPS_NOT_ALLOWED');
      return next();
    } catch (_) {
      return deny(res, 'OPS_NOT_ALLOWED');
    }
  };
}

module.exports = {
  clearOpsAccessCache,
  parseAllowlist,
  requireOpsAllowlist,
};

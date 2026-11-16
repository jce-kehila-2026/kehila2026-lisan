'use strict';

/**
 * Volunteer reviewers get a JWT like every other user, and many student
 * endpoints only check requireAuth (any role). This app-level guard confines
 * a reviewer token to the reviewer area: /api/review, /api/auth and reading
 * their own profile (GET /api/users/me). Everything else -> 403.
 *
 * Tokens that are missing/invalid are left alone: the route's own
 * requireAuth still answers 401 as before. Other roles are untouched.
 */
const jwt = require('jsonwebtoken');

function isAllowedForReviewer(method, path) {
  if (path === '/review' || path.startsWith('/review/')) return true;
  if (path === '/auth' || path.startsWith('/auth/')) return true;
  if (method === 'GET' && (path === '/users/me' || path === '/users/me/')) return true;
  if (path === '/health' || path === '/ready') return true;
  return false;
}

function restrictReviewerScope(req, res, next) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return next();

  let decoded;
  try {
    decoded = jwt.verify(header.slice('Bearer '.length), process.env.JWT_SECRET);
  } catch {
    return next();
  }
  if (decoded?.role !== 'reviewer') return next();

  // Mounted on /api, so req.path is relative to it (e.g. "/review/stats").
  if (isAllowedForReviewer(req.method, req.path)) return next();

  return res.status(403).json({
    success: false,
    error: 'Access denied',
    code: 'ACCESS_DENIED',
  });
}

module.exports = { restrictReviewerScope, isAllowedForReviewer };

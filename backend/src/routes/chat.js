'use strict';

/**
 * routes/chat.js  —  Sprint 6: Security hardening
 *
 * Security layers per route
 * ──────────────────────────────────────────────────────────────────────────
 *  POST /api/chat/
 *    ① express.json({ limit: '10kb' })  — reject oversized payloads before
 *      the controller touches them (guards against payload-flooding attacks)
 *    ② requireAuth                       — JWT verification
 *    ③ chatPostRateLimit                 — 15 AI calls / user / minute
 *    ④ postChat                          — validate → proxy → persist → respond
 *
 *  GET /api/chat/conversations
 *    ① requireAuth
 *    ② chatReadRateLimit                 — 60 reads / user / minute
 *    ③ listConversations
 *
 *  GET /api/chat/conversations/:id
 *    ① requireAuth
 *    ② chatReadRateLimit
 *    ③ getConversation
 *
 *  DELETE /api/chat/conversations/:id
 *    ① requireAuth
 *    ② deleteConversation  (soft-delete; no rate limit needed for low-frequency op)
 *
 * The FastAPI URL and INTERNAL_API_SECRET are env-var-only and never reach
 * the client.
 */

const express = require('express');
const multer  = require('multer');

const { requireAuth }                          = require('../middleware/auth');
const { chatPostRateLimit, chatReadRateLimit } = require('../middleware/chatRateLimit');
const {
  postChat,
  postVoiceChat,
  listConversations,
  getConversation,
  deleteConversation,
} = require('../controllers/chatController');

const router = express.Router();

// Body-size limiter applied only to this router (10 kb is ample for any
// legitimate chat message; blocks accidental or malicious large payloads).
const chatBodyParser = express.json({ limit: '10kb' });

// Multer — MemoryStorage, accept only audio MIME types, max 10 MB per upload.
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(_req, file, cb) {
    const allowed = /^audio\//;
    if (allowed.test(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('Only audio files are accepted'), { code: 'INVALID_FILE_TYPE' }));
  },
}).single('audio');

// ── Path map (contract-frozen, Sprint 1 + Voice) ─────────────────────────────
const CHAT_ROUTE_PATHS = Object.freeze({
  postMessage:        '/',
  postVoiceMessage:   '/voice',
  listConversations:  '/conversations',
  getConversation:    '/conversations/:conversationId',
  deleteConversation: '/conversations/:conversationId',
});

// POST /api/chat/ ─────────────────────────────────────────────────────────────
router.post(
  CHAT_ROUTE_PATHS.postMessage,
  chatBodyParser,       // ① 10 kb body cap — reject before auth overhead
  requireAuth,          // ② JWT check
  chatPostRateLimit,    // ③ 15 req/user/min
  postChat              // ④ validate → AI proxy → Firestore → respond
);

// POST /api/chat/voice ────────────────────────────────────────────────────────
//  ① multer MemoryStorage (10 MB limit, audio/* only)
//  ② requireAuth — JWT check
//  ③ chatPostRateLimit — same 15 req/user/min as text chat
//  ④ postVoiceChat — forward audio → AI service → Firestore → respond
router.post(
  CHAT_ROUTE_PATHS.postVoiceMessage,
  (req, res, next) => {
    audioUpload(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, code: 'FILE_TOO_LARGE', error: 'Audio file must be under 10 MB.' });
      }
      if (err.code === 'INVALID_FILE_TYPE') {
        return res.status(415).json({ success: false, code: 'INVALID_FILE_TYPE', error: 'Only audio files are accepted.' });
      }
      return res.status(400).json({ success: false, code: 'UPLOAD_ERROR', error: err.message });
    });
  },
  requireAuth,
  chatPostRateLimit,
  postVoiceChat,
);

// GET /api/chat/conversations ─────────────────────────────────────────────────
router.get(
  CHAT_ROUTE_PATHS.listConversations,
  requireAuth,
  chatReadRateLimit,    // 60 reads/user/min — generous for sidebar refreshes
  listConversations
);

// GET /api/chat/conversations/:conversationId ─────────────────────────────────
router.get(
  CHAT_ROUTE_PATHS.getConversation,
  requireAuth,
  chatReadRateLimit,
  getConversation
);

// DELETE /api/chat/conversations/:conversationId ──────────────────────────────
router.delete(
  CHAT_ROUTE_PATHS.deleteConversation,
  requireAuth,
  deleteConversation
);

module.exports = {
  router,
  CHAT_ROUTE_PATHS,
};

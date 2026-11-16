'use strict';

/**
 * App-level capture middleware for operations monitoring.
 *
 * - AI routes (text / stream / voice / stt / tts / pronunciation) and login:
 *   one ops event per request, built from the status code, the JSON body the
 *   route already sends, and optional `res.locals.ops` extras.
 * - Any other matched route answering >= 400 (or any 5xx): an `http` error event.
 * - Any other authenticated 2xx/3xx request: a throttled activity marker.
 *
 * Recording happens after the response is finished and is never awaited, so
 * it cannot fail or slow down the request.
 */

const { recordOpsEvent, markActivity } = require('../services/ops/opsRecorder');
const { getPrices } = require('../services/ops/opsModel');

const ROUTE_KINDS = {
  '/api/chats/:chatId/ai-message': 'text',
  '/api/chats/:chatId/stream': 'text',
  '/api/chats/voice': 'voice',
  '/api/chats/transcribe': 'stt',
  '/api/chats/tts': 'tts',
  '/api/chats/:chatId/pronunciation': 'pronunciation',
  '/api/auth/login': 'login',
};

const SKIP_PREFIXES = ['/api/ops', '/api/health', '/api/ready', '/uploads'];

function normalizeRoute(baseUrl, routePath) {
  if (routePath === undefined || routePath === null) return null;
  const joined = `${baseUrl || ''}${typeof routePath === 'string' ? routePath : String(routePath)}`;
  return joined.replace(/^\/api\/chat(?=\/|$)/, '/api/chats').replace(/\/+$/, '') || '/';
}

function snapshot(req, snap) {
  if (snap.route) return;
  if (req.route && req.route.path !== undefined) {
    let base = req.baseUrl || '';
    if (!base) {
      // When an error leaves a router, Express restores baseUrl; rebuild it
      // from the original path minus the route pattern's segment count.
      const segs = String(req.originalUrl || '').split('?')[0].split('/').filter(Boolean);
      const routeSegs = String(req.route.path).split('/').filter(Boolean).length;
      if (segs.length > routeSegs) base = `/${segs.slice(0, segs.length - routeSegs).join('/')}`;
    }
    snap.route = normalizeRoute(base, req.route.path);
    snap.params = { ...(req.params || {}) };
  }
}

function estimateUploadSeconds(file, prices) {
  if (!file || !file.size) return 0;
  const isWav = /wav/i.test(file.mimetype || '') || /\.wav$/i.test(file.originalname || '');
  const bytesPerSecond = isWav ? 32000 : prices.voiceBytesPerSecond;
  return Math.round((file.size / bytesPerSecond) * 10) / 10;
}

function estimateBase64Seconds(b64) {
  if (typeof b64 !== 'string' || !b64) return 0;
  const bytes = Math.floor((b64.length * 3) / 4);
  return Math.round((bytes / 32000) * 10) / 10; // assumes 16 kHz mono PCM WAV
}

function buildRaw({ kind, req, status, body, locals, latencyMs, snap }) {
  const b = body && typeof body === 'object' ? body : {};
  const x = { ...b, ...(locals || {}) };
  const ok = status < 400;
  const user = req.user || {};
  const prices = getPrices();

  const raw = {
    kind,
    route: snap.route,
    method: req.method,
    status,
    uid: user.uid || null,
    role: user.role || null,
    level: (req.body && req.body.level) || x.level || user.level || null,
    chatId: (snap.params && snap.params.chatId) || x.conversationId || null,
    provider: x.provider || null,
    model: x.model || null,
    fallbackUsed: x.fallbackUsed === true,
    fallbackReason: x.fallbackReason || null,
    errorCode: ok ? (x.errorCode || null) : (x.code || x.errorCode || null),
    latencyMs,
    aiLatencyMs: ok ? (x.aiLatencyMs ?? x.latencyMs ?? null) : null,
    inputTokens: x.inputTokens || 0,
    outputTokens: x.outputTokens || 0,
    providerCostUsd: typeof x.costUsd === 'number' ? x.costUsd : null,
    cacheHit: x.cacheHit === true,
    stream: x.stream === true,
  };

  if (kind === 'login') {
    raw.uid = (b.user && (b.user.uid || b.user.id)) || null;
    raw.role = (b.user && b.user.role) || null;
    raw.level = (b.user && b.user.level) || null;
    raw.provider = null;
    raw.model = null;
    if (!ok && !raw.errorCode) raw.errorCode = 'LOGIN_FAILED';
  }

  if (kind === 'voice' || kind === 'stt') {
    raw.audioSeconds = estimateUploadSeconds(req.file, prices);
    if (kind === 'stt') raw.provider = x.provider || 'azure-speech';
  }
  if (kind === 'voice' && ok && b.audioBase64 && typeof b.answerHe === 'string') {
    raw.ttsChars = b.answerHe.length;
    raw.ttsProvider = x.ttsProvider || 'azure';
  }
  if (kind === 'tts') {
    raw.provider = x.provider || 'azure';
    raw.ttsProvider = raw.provider;
    if (ok && b.audioBase64 && req.body && typeof req.body.text === 'string') {
      raw.ttsChars = req.body.text.trim().length;
    }
  }
  if (kind === 'pronunciation') {
    raw.provider = x.provider || 'azure-speech';
    raw.audioSeconds = estimateBase64Seconds(req.body && req.body.audioBase64);
  }
  return raw;
}

function opsTracker(req, res, next) {
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (SKIP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return next();
  }

  const startedAt = Date.now();
  const snap = {};
  let done = false;

  const originalJson = res.json;
  res.json = function opsJson(body) {
    try {
      snap.body = body;
      snapshot(req, snap);
    } catch (_) {
      /* never break the response */
    }
    return originalJson.call(this, body);
  };

  const finalize = (closedEarly) => {
    if (done) return;
    done = true;
    try {
      snapshot(req, snap);
      const kind = snap.route ? ROUTE_KINDS[snap.route] : null;
      const locals = (res.locals && res.locals.ops) || null;
      let status = res.statusCode || 0;
      if (closedEarly && !res.writableFinished) status = 499; // client gave up
      if (locals && locals.streamError) status = 502;
      const latencyMs = Date.now() - startedAt;

      if (kind) {
        if (status === 499 && kind === 'login') return;
        const raw = buildRaw({ kind, req, status, body: snap.body, locals, latencyMs, snap });
        if (status === 499) raw.errorCode = 'CLIENT_CLOSED';
        if (locals && locals.streamError) raw.errorCode = locals.errorCode || 'AI_STREAM_ERROR';
        recordOpsEvent(raw);
        return;
      }

      if (status >= 500 || (status >= 400 && status !== 499 && snap.route)) {
        const b = snap.body && typeof snap.body === 'object' ? snap.body : {};
        recordOpsEvent({
          kind: 'http',
          route: snap.route || 'unmatched',
          method: req.method,
          status,
          uid: req.user && req.user.uid,
          role: req.user && req.user.role,
          errorCode: b.code || (res.locals && res.locals.opsErrorCode) || null,
          latencyMs,
        });
        return;
      }

      if (req.user && req.user.uid && status < 400 && status !== 0) {
        markActivity({ uid: req.user.uid, role: req.user.role });
      }
    } catch (_) {
      /* ops capture must never surface */
    }
  };

  res.on('finish', () => finalize(false));
  res.on('close', () => finalize(true));
  return next();
}

/**
 * Final Express error handler: answers JSON and lets opsTracker record the
 * route, status and code. Mounted last in server.js.
 */
// eslint-disable-next-line no-unused-vars
function opsErrorHandler(err, req, res, next) {
  const status = Number(err && (err.status || err.statusCode)) || 500;
  const code = (err && typeof err.code === 'string' && err.code) ||
    (err && err.type === 'entity.parse.failed' ? 'INVALID_JSON' : null) ||
    (err && err.message === 'Not allowed by CORS' ? 'CORS_REJECTED' : null) ||
    (status >= 500 ? 'UNHANDLED_ERROR' : 'REQUEST_ERROR');
  res.locals.opsErrorCode = code;

  if (res.headersSent) {
    return next(err);
  }

  if (status >= 500) {
    try {
      const { logger, toErrorPayload } = require('../lib/logger');
      logger.error({ event: 'unhandled_error', path: req.originalUrl, error: toErrorPayload(err) }, 'unhandled_error');
    } catch (_) {
      /* ignore */
    }
  }

  return res.status(status).json({
    success: false,
    error: status >= 500 ? 'Server error' : (err && err.message) || 'Request error',
    code,
  });
}

module.exports = {
  ROUTE_KINDS,
  buildRaw,
  normalizeRoute,
  opsErrorHandler,
  opsTracker,
};

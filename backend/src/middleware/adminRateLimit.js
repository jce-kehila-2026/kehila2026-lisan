const rateLimit = require('express-rate-limit');

const DEFAULT_ADMIN_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_ADMIN_RATE_LIMIT_MAX = 60;

function getAdminRateLimitWindowMs() {
  const v = Number(process.env.ADMIN_RATE_LIMIT_WINDOW_MS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_ADMIN_RATE_LIMIT_WINDOW_MS;
}

function getAdminRateLimitMax() {
  const v = Number(process.env.ADMIN_RATE_LIMIT_MAX);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_ADMIN_RATE_LIMIT_MAX;
}

const adminRateLimit = rateLimit({
  windowMs: getAdminRateLimitWindowMs(),
  limit: getAdminRateLimitMax(),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.uid || rateLimit.ipKeyGenerator(req.ip || '127.0.0.1');
  },
  handler: (req, res) => {
    const retryAfterSeconds = Math.ceil(getAdminRateLimitWindowMs() / 1000);
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      success: false,
      error: 'Too many admin requests. Please slow down.',
      code: 'ADMIN_RATE_LIMITED',
      retryAfterSeconds,
    });
  },
});

module.exports = {
  adminRateLimit,
  getAdminRateLimitMax,
  getAdminRateLimitWindowMs,
};

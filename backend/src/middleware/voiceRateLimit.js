const rateLimit = require('express-rate-limit');

const DEFAULT_VOICE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_VOICE_RATE_LIMIT_MAX = 5;

function getVoiceRateLimitWindowMs() {
  const configuredWindowMs = Number(process.env.VOICE_RATE_LIMIT_WINDOW_MS);

  if (Number.isFinite(configuredWindowMs) && configuredWindowMs > 0) {
    return configuredWindowMs;
  }

  return DEFAULT_VOICE_RATE_LIMIT_WINDOW_MS;
}

function getVoiceRateLimitMax() {
  const configuredMax = Number(process.env.VOICE_RATE_LIMIT_MAX);

  if (Number.isFinite(configuredMax) && configuredMax > 0) {
    return configuredMax;
  }

  return DEFAULT_VOICE_RATE_LIMIT_MAX;
}

const voiceRateLimit = rateLimit({
  windowMs: getVoiceRateLimitWindowMs(),
  limit: getVoiceRateLimitMax(),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.uid || rateLimit.ipKeyGenerator(req.ip || '127.0.0.1');
  },
  handler: (req, res) => {
    const retryAfterSeconds = Math.ceil(getVoiceRateLimitWindowMs() / 1000);
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      success: false,
      error: 'Too many voice uploads. Please try again later.',
      code: 'VOICE_RATE_LIMITED',
      retryAfterSeconds,
    });
  },
});

module.exports = {
  getVoiceRateLimitMax,
  getVoiceRateLimitWindowMs,
  voiceRateLimit,
};

const AI_SERVICE_CHAT_PATH       = '/api/ai/chat';
const AI_SERVICE_VOICE_CHAT_PATH = '/api/ai/chat/voice';
const DEFAULT_AI_SERVICE_URL = 'http://127.0.0.1:8000';
const DEFAULT_AI_SERVICE_TIMEOUT_MS        = 8000;
const DEFAULT_AI_SERVICE_VOICE_TIMEOUT_MS  = 20000;  // voice needs STT+LLM+TTS time
const DEFAULT_CHAT_RATE_LIMIT_WINDOW_MS = 60000;
const DEFAULT_CHAT_RATE_LIMIT_MAX = 20;
const AI_SERVICE_INTERNAL_SECRET_HEADER = 'X-Internal-Service-Secret';
const DEFAULT_SERVICE_UNAVAILABLE_MESSAGE = 'נסה שוב עם שאלה קצרה.';
const DEFAULT_TIMEOUT_MESSAGE = 'המערכת איטית כרגע. נסה שוב בעוד רגע.';

class AiServiceError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AiServiceError';
    this.code = options.code || 'AI_SERVICE_ERROR';
    this.status = options.status || 502;
    this.cause = options.cause;
  }
}

function getAiServiceConfig(env = process.env) {
  return {
    baseUrl:        env.AI_SERVICE_URL     || DEFAULT_AI_SERVICE_URL,
    timeoutMs:      Number(env.AI_SERVICE_TIMEOUT_MS       || DEFAULT_AI_SERVICE_TIMEOUT_MS),
    voiceTimeoutMs: Number(env.AI_SERVICE_VOICE_TIMEOUT_MS || DEFAULT_AI_SERVICE_VOICE_TIMEOUT_MS),
    rateLimitWindowMs: Number(env.CHAT_RATE_LIMIT_WINDOW_MS || DEFAULT_CHAT_RATE_LIMIT_WINDOW_MS),
    rateLimitMax: Number(env.CHAT_RATE_LIMIT_MAX || DEFAULT_CHAT_RATE_LIMIT_MAX),
    internalSecret: typeof env.AI_SERVICE_INTERNAL_SECRET === 'string'
      ? env.AI_SERVICE_INTERNAL_SECRET.trim()
      : '',
  };
}

function buildAiServiceChatPayload({ message, level, includeArabic }) {
  return {
    message,
    level,
    includeArabic,
  };
}

function buildBackendChatResponse(aiResponse, options = {}) {
  return {
    conversationId: options.conversationId || null,
    messageId: options.messageId || null,
    answerHe: aiResponse.answerHe,
    answerAr: aiResponse.answerAr,
    fallbackUsed: aiResponse.fallbackUsed,
    fallbackReason: aiResponse.fallbackReason,
    level: aiResponse.level,
    latencyMs: aiResponse.latencyMs,
    cacheHit: aiResponse.cacheHit,
    routerHit: aiResponse.routerHit,
    suggestedNextPrompts: Array.isArray(options.suggestedNextPrompts)
      ? options.suggestedNextPrompts
      : [],
  };
}

function buildSafeChatFallback(options = {}) {
  const fallbackReason = options.fallbackReason || 'SERVICE_UNAVAILABLE';
  const answerHe = fallbackReason === 'MODEL_TIMEOUT'
    ? DEFAULT_TIMEOUT_MESSAGE
    : DEFAULT_SERVICE_UNAVAILABLE_MESSAGE;

  return {
    conversationId: options.conversationId || null,
    messageId: options.messageId || null,
    answerHe,
    answerAr: null,
    fallbackUsed: true,
    fallbackReason,
    level: options.level || 'A1',
    latencyMs: 0,
    cacheHit: false,
    routerHit: false,
    suggestedNextPrompts: Array.isArray(options.suggestedNextPrompts)
      ? options.suggestedNextPrompts
      : [],
  };
}

async function requestAiChat(chatRequest, options = {}) {
  const config = options.config || getAiServiceConfig(options.env);
  const fetchImpl = options.fetchImpl || global.fetch;

  if (typeof fetchImpl !== 'function') {
    throw new AiServiceError('Fetch is not available in this runtime', {
      code: 'AI_SERVICE_FETCH_UNAVAILABLE',
      status: 500,
    });
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.timeoutMs);
  const requestUrl = `${config.baseUrl}${AI_SERVICE_CHAT_PATH}`;

  try {
    const response = await fetchImpl(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.internalSecret
          ? { [AI_SERVICE_INTERNAL_SECRET_HEADER]: config.internalSecret }
          : {}),
      },
      body: JSON.stringify(buildAiServiceChatPayload(chatRequest)),
      signal: controller.signal,
    });

    let parsedBody = null;

    try {
      parsedBody = await response.json();
    } catch (error) {
      if (!response.ok) {
        throw new AiServiceError('AI service returned a non-JSON error response', {
          code: 'AI_SERVICE_BAD_RESPONSE',
          status: 502,
          cause: error,
        });
      }
    }

    if (!response.ok) {
      throw new AiServiceError('AI service request failed', {
        code: 'AI_SERVICE_BAD_STATUS',
        status: 502,
        cause: parsedBody,
      });
    }

    if (!parsedBody || typeof parsedBody.answerHe !== 'string') {
      throw new AiServiceError('AI service response is missing required fields', {
        code: 'AI_SERVICE_INVALID_PAYLOAD',
        status: 502,
        cause: parsedBody,
      });
    }

    return parsedBody;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new AiServiceError('AI service request timed out', {
        code: 'AI_SERVICE_TIMEOUT',
        status: 504,
        cause: error,
      });
    }

    if (error instanceof AiServiceError) {
      throw error;
    }

    throw new AiServiceError('AI service request failed', {
      code: 'AI_SERVICE_UNAVAILABLE',
      status: 502,
      cause: error,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Forward a multipart audio file to the AI service voice endpoint.
 * @param {object} opts
 * @param {Buffer}  opts.audioBuffer   - raw audio bytes
 * @param {string}  opts.originalname  - original filename (e.g. "audio.webm")
 * @param {string}  opts.mimetype      - MIME type (e.g. "audio/webm")
 * @param {string}  opts.level         - CEFR level
 * @param {boolean} opts.includeArabic
 * @param {object}  [options]          - same options bag as requestAiChat
 */
async function requestAiVoice(
  { audioBuffer, originalname, mimetype, level = 'A1', includeArabic = false },
  options = {},
) {
  const config = options.config || getAiServiceConfig(options.env);

  // Use the built-in FormData + Blob available in Node 18+
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mimetype });
  formData.append('audio', blob, originalname);
  formData.append('level', level);
  formData.append('includeArabic', String(includeArabic));

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.timeoutMs);
  const requestUrl = `${config.baseUrl}${AI_SERVICE_VOICE_CHAT_PATH}`;

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        ...(config.internalSecret
          ? { [AI_SERVICE_INTERNAL_SECRET_HEADER]: config.internalSecret }
          : {}),
        // Note: do NOT set Content-Type — fetch sets the multipart boundary automatically
      },
      body: formData,
      signal: controller.signal,
    });

    let parsedBody = null;
    try {
      parsedBody = await response.json();
    } catch (err) {
      if (!response.ok) {
        throw new AiServiceError('AI voice service returned a non-JSON error response', {
          code: 'AI_SERVICE_BAD_RESPONSE',
          status: 502,
          cause: err,
        });
      }
    }

    if (!response.ok) {
      throw new AiServiceError('AI voice service request failed', {
        code: 'AI_SERVICE_BAD_STATUS',
        status: 502,
        cause: parsedBody,
      });
    }

    // STT_FAILED is a soft failure — AI service returns 200 with fallbackReason
    return parsedBody;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new AiServiceError('AI voice service request timed out', {
        code: 'AI_SERVICE_TIMEOUT',
        status: 504,
        cause: error,
      });
    }
    if (error instanceof AiServiceError) throw error;
    throw new AiServiceError('AI voice service request failed', {
      code: 'AI_SERVICE_UNAVAILABLE',
      status: 502,
      cause: error,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

module.exports = {
  AI_SERVICE_CHAT_PATH,
  AI_SERVICE_VOICE_CHAT_PATH,
  AI_SERVICE_INTERNAL_SECRET_HEADER,
  AiServiceError,
  buildAiServiceChatPayload,
  buildBackendChatResponse,
  buildSafeChatFallback,
  getAiServiceConfig,
  requestAiChat,
  requestAiVoice,
};

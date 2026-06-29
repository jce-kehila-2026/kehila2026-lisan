const axios = require('axios');

function normalizeAiServiceBaseUrl(value = process.env.AI_SERVICE_URL) {
  const raw = String(value || 'http://localhost:8000').trim();
  return raw
    .replace(/\/+$/, '')
    .replace(/\/api\/ai\/chat\/voice$/, '')
    .replace(/\/api\/ai\/chat\/stream$/, '')
    .replace(/\/api\/ai\/chat$/, '')
    .replace(/\/api\/ai$/, '');
}

const DEFAULT_AI_TIMEOUT_MS = 20000;
const DEFAULT_AI_VOICE_TIMEOUT_MS = 20000;

function getAiServiceTimeoutMs() {
  const configuredTimeout = Number(process.env.AI_SERVICE_TIMEOUT_MS);

  if (Number.isFinite(configuredTimeout) && configuredTimeout > 0) {
    return configuredTimeout;
  }

  return DEFAULT_AI_TIMEOUT_MS;
}

function getAiVoiceServiceTimeoutMs() {
  const configuredTimeout = Number(process.env.AI_SERVICE_VOICE_TIMEOUT_MS);

  if (Number.isFinite(configuredTimeout) && configuredTimeout > 0) {
    return configuredTimeout;
  }

  return DEFAULT_AI_VOICE_TIMEOUT_MS;
}

function buildInternalServiceHeaders(extraHeaders = {}) {
  const headers = {
    ...extraHeaders,
  };

  if (process.env.AI_SERVICE_INTERNAL_SECRET) {
    headers['X-Internal-Service-Secret'] =
      process.env.AI_SERVICE_INTERNAL_SECRET;
  }

  return headers;
}

function createAiRequestConfig(extra = {}) {
  return {
    timeout: getAiServiceTimeoutMs(),
    ...extra,
    headers: buildInternalServiceHeaders(extra.headers || {}),
  };
}

function getAiChatServiceUrl() {
  return `${normalizeAiServiceBaseUrl()}/api/ai/chat`;
}

function getAiVoiceServiceUrl() {
  if (process.env.AI_SERVICE_VOICE_URL) {
    return process.env.AI_SERVICE_VOICE_URL;
  }

  return `${normalizeAiServiceBaseUrl()}/api/ai/chat/voice`;
}

function getAiTranscribeServiceUrl() {
  return `${normalizeAiServiceBaseUrl()}/api/ai/chat/transcribe`;
}

function getAiTtsServiceUrl() {
  return `${normalizeAiServiceBaseUrl()}/api/ai/chat/tts`;
}

async function sendChatMessageToAi({
  message,
  level = 'A1',
  includeArabic = false,
  userId = null,
  learnerName = null,
  sessionId = null,
  userToken = null,
  scenario = null,
  activityTitle = null,
  activitySubtitle = null,
}) {
  try {
    const response = await axios.post(
      getAiChatServiceUrl(),
      {
        message,
        level,
        includeArabic,
        voiceMode: false,
        ...(userId ? { userId } : {}),
        ...(learnerName ? { learnerName } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(scenario ? { scenario } : {}),
        ...(activityTitle ? { activityTitle } : {}),
        ...(activitySubtitle ? { activitySubtitle } : {}),
      },
      createAiRequestConfig({
        headers: {
          'Content-Type': 'application/json',
          ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
          ...(userId ? { 'X-User-ID': userId } : {}),
        },
      })
    );

    return response.data;
  } catch (error) {
    throw mapAiServiceError(error);
  }
}

async function sendVoiceMessageToAi({
  audioBuffer,
  fileName = 'voice-message.webm',
  mimeType = 'audio/webm',
  level = 'A1',
  includeArabic = false,
  userId = null,
  learnerName = null,
  sessionId = null,
  userToken = null,
  scenario = null,
  activityTitle = null,
  activitySubtitle = null,
}) {
  try {
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: mimeType });

    formData.append('audio', audioBlob, fileName);
    formData.append('level', level);
    formData.append('includeArabic', String(includeArabic));

    if (userId) {
      formData.append('userId', userId);
    }

    if (learnerName) {
      formData.append('learnerName', learnerName);
    }

    if (sessionId) {
      formData.append('sessionId', sessionId);
    }

    if (scenario) {
      formData.append('scenario', scenario);
    }

    if (activityTitle) {
      formData.append('activityTitle', activityTitle);
    }

    if (activitySubtitle) {
      formData.append('activitySubtitle', activitySubtitle);
    }

    const response = await axios.post(
      getAiVoiceServiceUrl(),
      formData,
      createAiRequestConfig({
        timeout: getAiVoiceServiceTimeoutMs(),
        headers: {
          ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
          ...(userId ? { 'X-User-ID': userId } : {}),
        },
      })
    );

    return response.data;
  } catch (error) {
    throw mapAiServiceError(error);
  }
}

/**
 * STT-only: forward an audio clip to ai-service and return { transcribedText }.
 * Used by the voice-edit flow (transcribe, then the student edits before send).
 */
async function transcribeAudioViaAi({
  audioBuffer,
  fileName = 'voice.webm',
  mimeType = 'audio/webm',
  userId = null,
  userToken = null,
}) {
  try {
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: mimeType });

    formData.append('audio', audioBlob, fileName);

    if (userId) {
      formData.append('userId', userId);
    }

    const response = await axios.post(
      getAiTranscribeServiceUrl(),
      formData,
      createAiRequestConfig({
        timeout: getAiVoiceServiceTimeoutMs(),
        headers: {
          ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
          ...(userId ? { 'X-User-ID': userId } : {}),
        },
      })
    );

    return response.data;
  } catch (error) {
    throw mapAiServiceError(error);
  }
}

async function synthesizeTextViaAi({
  text,
  isFallback = false,
  pronunciationScore = null,
  userId = null,
  userToken = null,
}) {
  try {
    const response = await axios.post(
      getAiTtsServiceUrl(),
      {
        text,
        isFallback,
        pronunciationScore,
      },
      createAiRequestConfig({
        timeout: getAiVoiceServiceTimeoutMs(),
        headers: {
          'Content-Type': 'application/json',
          ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
          ...(userId ? { 'X-User-ID': userId } : {}),
        },
      })
    );

    return response.data;
  } catch (error) {
    throw mapAiServiceError(error);
  }
}

/**
 * Normalises every shape ai-service or axios may throw into:
 *   { status, code, message, details? }
 *
 * ai-service raises HTTPException → { "detail": "..." }
 * backend convention             → { success: false, error: "...", code: "..." }
 * This translates the former into the latter so the frontend only
 * needs to handle ONE shape.
 */
function mapAiServiceError(error) {
  if (error?.code === 'ECONNABORTED') {
    return {
      status: 408,
      code: 'AI_TIMEOUT',
      message: 'AI service timed out',
    };
  }

  if (error?.response) {
    const status = error.response.status || 502;
    const data = error.response.data || {};

    const message =
      data.error ||
      (typeof data.detail === 'string' ? data.detail : null) ||
      (Array.isArray(data.detail) ? JSON.stringify(data.detail) : null) ||
      'AI service returned an error';

    const code =
      data.code ||
      (status === 429 ? 'AI_RATE_LIMITED'
        : status === 401 ? 'AI_UNAUTHORIZED'
          : status === 403 ? 'AI_FORBIDDEN'
            : 'AI_SERVICE_BAD_STATUS');

    return {
      status,
      code,
      message,
      details: data,
    };
  }

  if (error?.request) {
    return {
      status: 503,
      code: 'AI_SERVICE_UNAVAILABLE',
      message: 'AI service is unavailable',
    };
  }

  return {
    status: 500,
    code: 'AI_SERVICE_ERROR',
    message: error?.message || 'AI service request failed',
  };
}

module.exports = {
  buildInternalServiceHeaders,
  normalizeAiServiceBaseUrl,
  getAiChatServiceUrl,
  createAiRequestConfig,
  getAiServiceTimeoutMs,
  getAiVoiceServiceTimeoutMs,
  getAiVoiceServiceUrl,
  getAiTtsServiceUrl,
  mapAiServiceError,
  sendChatMessageToAi,
  sendVoiceMessageToAi,
  synthesizeTextViaAi,
  transcribeAudioViaAi,
};

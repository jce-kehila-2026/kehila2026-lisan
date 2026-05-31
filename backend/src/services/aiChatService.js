const axios = require('axios');

const DEFAULT_AI_SERVICE_BASE_URL =
  process.env.AI_SERVICE_URL || 'http://localhost:8000';

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
  return `${DEFAULT_AI_SERVICE_BASE_URL}/api/ai/chat`;
}

function getAiVoiceServiceUrl() {
  if (process.env.AI_SERVICE_VOICE_URL) {
    return process.env.AI_SERVICE_VOICE_URL;
  }

  return `${DEFAULT_AI_SERVICE_BASE_URL}/api/ai/chat/voice`;
}

async function sendChatMessageToAi({
  message,
  level = 'A1',
  includeArabic = false,
  userId = null,
  userToken = null,
}) {
  try {
    const response = await axios.post(
      getAiChatServiceUrl(),
      {
        message,
        level,
        includeArabic,
      },
      createAiRequestConfig({
        headers: {
          'Content-Type': 'application/json',
          ...(userId ? { 'X-User-ID': userId } : {}),
          ...(userToken ? { 'Authorization': `Bearer ${userToken}` } : {}),
        }
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
  userToken = null,
}) {
  try {
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: mimeType });

    formData.append('audio', audioBlob, fileName);
    formData.append('level', level);
    formData.append('includeArabic', String(includeArabic));

    const response = await axios.post(
      getAiVoiceServiceUrl(),
      formData,
      createAiRequestConfig({
        timeout: getAiVoiceServiceTimeoutMs(),
        headers: {
          ...(userId ? { 'X-User-ID': userId } : {}),
          ...(userToken ? { 'Authorization': `Bearer ${userToken}` } : {}),
        }
      })
    );

    return response.data;
  } catch (error) {
    throw mapAiServiceError(error);
  }

}

function mapAiServiceError(error) {
  if (error?.code === 'ECONNABORTED') {
    return {
      status: 408,
      code: 'AI_TIMEOUT',
      message: 'AI service timed out'
    };
  }

  if (error?.response) {
    const status = error.response.status || 502;
    const responseData = error.response.data || {};

    return {
      status,
      code: responseData.code || 'AI_SERVICE_BAD_STATUS',
      message: responseData.error || responseData.detail || 'AI service returned an error',
      details: responseData,
    };
  }

  if (error?.request) {
    return {
      status: 503,
      code: 'AI_SERVICE_UNAVAILABLE',
      message: 'AI service is unavailable'
    };
  }

  return {
    status: 500,
    code: 'AI_SERVICE_ERROR',
    message: error?.message || 'AI service request failed'
  };
}

module.exports = {
  buildInternalServiceHeaders,
  getAiChatServiceUrl,
  createAiRequestConfig,
  getAiServiceTimeoutMs,
  getAiVoiceServiceTimeoutMs,
  getAiVoiceServiceUrl,
  mapAiServiceError,
  sendChatMessageToAi,
  sendVoiceMessageToAi,
};

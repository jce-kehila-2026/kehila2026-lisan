export const CHAT_API_PATH = '/api/chat';
export const CHAT_CONVERSATIONS_API_PATH = `${CHAT_API_PATH}/conversations`;
export const CHAT_VOICE_API_PATH = `${CHAT_API_PATH}/voice`;

export const DEFAULT_CHAT_LEVEL = 'A1';

export const DEFAULT_SUGGESTED_PROMPTS = Object.freeze([
  'מה השם שלך?',
  'איך אומרים תודה?',
  'אני רוצה לתרגל משפט קצר.',
  'אפשר הסבר בערבית?',
]);

const CHAT_ERROR_KEY_BY_CODE = Object.freeze({
  UNAUTHORIZED: 'chatUnauthorizedError',
  VALIDATION_ERROR: 'chatValidationError',
  INVALID_LEVEL: 'chatInvalidLevelError',
  AI_TIMEOUT: 'chatTimeoutError',
  CHAT_RATE_LIMITED: 'chatRateLimitError',
  AI_SERVICE_UNAVAILABLE: 'chatServiceError',
  AI_SERVICE_BAD_STATUS: 'chatServiceError',
  AI_SERVICE_BAD_RESPONSE: 'chatServiceError',
  AI_SERVICE_INVALID_PAYLOAD: 'chatServiceError',
  AI_SERVICE_ERROR: 'chatServiceError',
  CONVERSATION_FORBIDDEN: 'chatConversationForbiddenError',
  CONVERSATION_NOT_FOUND: 'chatConversationMissingError',
  STT_FAILED: 'chatVoiceTranscriptionError',
  STT_TIMEOUT: 'chatVoiceTranscriptionError',
  STT_CIRCUIT_OPEN: 'chatVoiceTranscriptionError',
  STT_EMPTY: 'chatVoiceTranscriptionError',
  TTS_FAILED: 'chatVoicePlaybackError',
  TTS_TIMEOUT: 'chatVoicePlaybackError',
  TTS_CIRCUIT_OPEN: 'chatVoicePlaybackError',
});

export class ChatApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ChatApiError';
    this.status = options.status ?? 500;
    this.code = options.code ?? null;
    this.details = Array.isArray(options.details) ? options.details : [];
    this.retryAfterSeconds = Number.isFinite(options.retryAfterSeconds)
      ? options.retryAfterSeconds
      : null;
    this.backendMessage = options.backendMessage ?? message;
    this.translationKey = options.translationKey ?? 'chatServiceError';
  }
}

export function buildChatRequest({
  message,
  conversationId = null,
  level = DEFAULT_CHAT_LEVEL,
  includeArabic = false,
  clientMessageId = null,
}) {
  return {
    message: typeof message === 'string' ? message.trim() : '',
    conversationId,
    level,
    includeArabic: includeArabic === true,
    clientMessageId,
  };
}

export function normalizeChatResponse(payload = {}) {
  return {
    conversationId: payload.conversationId ?? null,
    messageId: payload.messageId ?? null,
    answerHe: payload.answerHe ?? '',
    answerAr: payload.answerAr ?? null,
    fallbackUsed: payload.fallbackUsed === true,
    fallbackReason: payload.fallbackReason ?? null,
    level: payload.level ?? DEFAULT_CHAT_LEVEL,
    latencyMs: Number.isFinite(payload.latencyMs) ? payload.latencyMs : 0,
    cacheHit: payload.cacheHit === true,
    routerHit: payload.routerHit === true,
    suggestedNextPrompts: Array.isArray(payload.suggestedNextPrompts)
      ? payload.suggestedNextPrompts
      : [...DEFAULT_SUGGESTED_PROMPTS],
  };
}

export function normalizeVoiceChatResponse(payload = {}) {
  return {
    conversationId: payload.conversationId ?? null,
    messageId: payload.messageId ?? null,
    answerHe: payload.answerHe ?? '',
    answerAr: payload.answerAr ?? null,
    audioBase64: payload.audioBase64 ?? null,
    fallbackUsed: payload.fallbackUsed === true,
    fallbackReason: payload.fallbackReason ?? null,
    level: payload.level ?? DEFAULT_CHAT_LEVEL,
    latencyMs: Number.isFinite(payload.latencyMs) ? payload.latencyMs : 0,
    transcribedText: payload.transcribedText ?? null,
    suggestedNextPrompts: Array.isArray(payload.suggestedNextPrompts)
      ? payload.suggestedNextPrompts
      : [...DEFAULT_SUGGESTED_PROMPTS],
  };
}

function createClientMessageId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getChatHeaders() {
  const token = localStorage.getItem('lisan-token');

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function readRetryAfterSeconds(response) {
  const retryAfterHeader = response.headers.get('Retry-After');
  const retryAfterSeconds = Number(retryAfterHeader);
  return Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? Math.ceil(retryAfterSeconds)
    : null;
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function createChatApiError(response, responseBody = {}, fallbackMessage) {
  const code = responseBody.code ?? null;
  const backendMessage = responseBody.error ?? fallbackMessage;
  const translationKey = CHAT_ERROR_KEY_BY_CODE[code]
    ?? (response.status === 401
      ? 'chatUnauthorizedError'
      : response.status === 408
        ? 'chatTimeoutError'
        : response.status === 422
          ? 'chatInvalidLevelError'
          : response.status === 429
            ? 'chatRateLimitError'
            : response.status === 400
              ? 'chatValidationError'
              : 'chatServiceError');

  return new ChatApiError(backendMessage || fallbackMessage, {
    status: response.status,
    code,
    details: responseBody.details,
    retryAfterSeconds: readRetryAfterSeconds(response),
    backendMessage,
    translationKey,
  });
}

export function getChatErrorPresentation(error) {
  if (error instanceof ChatApiError) {
    return {
      status: error.status,
      code: error.code,
      translationKey: error.translationKey,
      retryAfterSeconds: error.retryAfterSeconds,
      backendMessage: error.backendMessage,
      details: error.details,
    };
  }

  return {
    status: error?.status ?? 500,
    code: error?.code ?? null,
    translationKey: 'chatServiceError',
    retryAfterSeconds: null,
    backendMessage: error?.message ?? null,
    details: [],
  };
}

export async function sendChatMessage({
  message,
  conversationId = null,
  level = DEFAULT_CHAT_LEVEL,
  includeArabic = false,
}) {
  const requestPayload = buildChatRequest({
    message,
    conversationId,
    level,
    includeArabic,
    clientMessageId: createClientMessageId(),
  });

  const response = await fetch(CHAT_API_PATH, {
    method: 'POST',
    headers: getChatHeaders(),
    body: JSON.stringify(requestPayload),
  });

  const responseBody = await readJsonSafe(response);

  if (!response.ok) {
    throw createChatApiError(response, responseBody, 'chatRequestFailed');
  }

  return normalizeChatResponse(responseBody);
}

export async function sendVoiceMessage({
  audioBlob,
  conversationId = null,
  level = DEFAULT_CHAT_LEVEL,
  includeArabic = false,
}) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'voice-message.webm');
  formData.append('level', level);
  formData.append('includeArabic', String(includeArabic));
  if (conversationId) {
    formData.append('conversationId', conversationId);
  }

  const token = localStorage.getItem('lisan-token');
  const response = await fetch(CHAT_VOICE_API_PATH, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const responseBody = await readJsonSafe(response);

  if (!response.ok) {
    throw createChatApiError(response, responseBody, 'chatVoiceRequestFailed');
  }

  return normalizeVoiceChatResponse(responseBody);
}

function normalizeConversationSummary(payload = {}) {
  return {
    id: payload.id ?? '',
    title: payload.title ?? 'Hebrew practice',
    level: payload.level ?? DEFAULT_CHAT_LEVEL,
    updatedAt: payload.updatedAt ?? null,
    createdAt: payload.createdAt ?? null,
    lastMessageAt: payload.lastMessageAt ?? null,
    lastMessagePreview: payload.lastMessagePreview ?? '',
    messageCount: Number.isFinite(payload.messageCount) ? payload.messageCount : 0,
  };
}

export function normalizeConversationMessage(payload = {}) {
  return {
    id: payload.id ?? '',
    role: payload.role ?? 'assistant',
    textHe: payload.textHe ?? payload.rawText ?? '',
    textAr: payload.textAr ?? null,
    rawText: payload.rawText ?? null,
    fallbackUsed: payload.fallbackUsed === true,
    fallbackReason: payload.fallbackReason ?? null,
    createdAt: payload.createdAt ?? null,
  };
}

export async function fetchConversations() {
  const response = await fetch(CHAT_CONVERSATIONS_API_PATH, {
    method: 'GET',
    headers: getChatHeaders(),
  });

  const responseBody = await readJsonSafe(response);

  if (!response.ok) {
    throw createChatApiError(response, responseBody, 'chatConversationsFailed');
  }

  return Array.isArray(responseBody.conversations)
    ? responseBody.conversations.map(normalizeConversationSummary)
    : [];
}

export async function fetchConversation(conversationId) {
  const response = await fetch(`${CHAT_CONVERSATIONS_API_PATH}/${conversationId}`, {
    method: 'GET',
    headers: getChatHeaders(),
  });

  const responseBody = await readJsonSafe(response);

  if (!response.ok) {
    throw createChatApiError(response, responseBody, 'chatConversationFailed');
  }

  return {
    conversation: normalizeConversationSummary(responseBody.conversation || {}),
    messages: Array.isArray(responseBody.messages)
      ? responseBody.messages.map(normalizeConversationMessage)
      : [],
  };
}

export async function deleteConversation(conversationId) {
  const response = await fetch(`${CHAT_CONVERSATIONS_API_PATH}/${conversationId}`, {
    method: 'DELETE',
    headers: getChatHeaders(),
  });

  const responseBody = await readJsonSafe(response);

  if (!response.ok) {
    throw createChatApiError(response, responseBody, 'chatConversationDeleteFailed');
  }

  return responseBody.success === true;
}

export const CHAT_API_PATH = '/api/chat';
export const CHAT_CONVERSATIONS_API_PATH = `${CHAT_API_PATH}/conversations`;
export const CHAT_VOICE_API_PATH = `${CHAT_API_PATH}/voice`;
export const CHAT_TTS_API_PATH = `${CHAT_API_PATH}/tts`;

export const DEFAULT_CHAT_LEVEL = 'A1';

// Client-side guard so a slow STT/TTS round-trip never leaves the user staring
// at an indefinite spinner. Backend voice latency peaks around ~8s, so 25s is a
// generous ceiling that only trips on a genuine hang.
export const VOICE_REQUEST_TIMEOUT_MS = 25_000;

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
  VOICE_CLIENT_TIMEOUT: 'chatVoiceTimeoutError',
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
  scenario = null,
  activityTitle = null,
  activitySubtitle = null,
}) {
  return {
    message: typeof message === 'string' ? message.trim() : '',
    conversationId,
    level,
    includeArabic: includeArabic === true,
    clientMessageId,
    scenario: scenario || null,
    activityTitle: activityTitle || null,
    activitySubtitle: activitySubtitle || null,
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
    pronunciationScore: Number.isFinite(payload.pronunciationScore)
      ? payload.pronunciationScore
      : null,
    suggestedNextPrompts: Array.isArray(payload.suggestedNextPrompts)
      ? payload.suggestedNextPrompts
      : [...DEFAULT_SUGGESTED_PROMPTS],
  };
}

/**
 * Maps a 0-100 Azure pronunciation score to a learner-facing feedback band.
 * Returns null when no score is available (assessment disabled or failed) so
 * the UI simply renders nothing rather than a misleading "0".
 *
 *   >= 80  excellent  — clear pronunciation
 *   >= 60  good       — understandable, encourage clearer speech
 *   <  60  practice   — needs another attempt
 */
export function getPronunciationFeedback(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;

  const value = Math.max(0, Math.min(100, Math.round(score)));
  if (value >= 80) return { score: value, tone: 'excellent', labelKey: 'chatPronunciationExcellent' };
  if (value >= 60) return { score: value, tone: 'good', labelKey: 'chatPronunciationGood' };
  return { score: value, tone: 'practice', labelKey: 'chatPronunciationPractice' };
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

async function createConversation({
  title,
  level = DEFAULT_CHAT_LEVEL,
  scenario = null,
  activityTitle = null,
  activitySubtitle = null,
}) {
  const response = await fetch(CHAT_API_PATH, {
    method: 'POST',
    headers: getChatHeaders(),
    body: JSON.stringify({
      title: activityTitle || title || 'Hebrew practice',
      level,
      ...(scenario ? { scenario } : {}),
      ...(activityTitle ? { activityTitle } : {}),
      ...(activitySubtitle ? { activitySubtitle } : {}),
    }),
  });

  const responseBody = await readJsonSafe(response);

  if (!response.ok) {
    throw createChatApiError(response, responseBody, 'chatCreateFailed');
  }

  return responseBody.chat || null;
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
  scenario = null,
  activityTitle = null,
  activitySubtitle = null,
}) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  let activeConversationId = conversationId;

  if (!activeConversationId) {
    const conversation = await createConversation({
      title: activityTitle || trimmedMessage || 'Hebrew practice',
      level,
      scenario,
      activityTitle,
      activitySubtitle,
    });

    activeConversationId = conversation?.id || null;
  }

  if (!activeConversationId) {
    throw new ChatApiError('Conversation was not created', {
      status: 500,
      code: 'CONVERSATION_NOT_CREATED',
      translationKey: 'chatServiceError',
    });
  }

  const requestPayload = buildChatRequest({
    message: trimmedMessage,
    conversationId: activeConversationId,
    level,
    includeArabic,
    clientMessageId: createClientMessageId(),
    scenario,
    activityTitle,
    activitySubtitle,
  });

  const response = await fetch(`${CHAT_API_PATH}/${activeConversationId}/ai-message`, {
    method: 'POST',
    headers: getChatHeaders(),
    body: JSON.stringify({
      text: requestPayload.message,
      clientMessageId: requestPayload.clientMessageId,
      level: requestPayload.level,
      includeArabic: requestPayload.includeArabic,
      scenario: requestPayload.scenario,
      activityTitle: requestPayload.activityTitle,
      activitySubtitle: requestPayload.activitySubtitle,
    }),
  });

  const responseBody = await readJsonSafe(response);

  if (!response.ok) {
    throw createChatApiError(response, responseBody, 'chatRequestFailed');
  }

  return normalizeChatResponse({
    ...responseBody,
    conversationId: activeConversationId,
    answerHe: responseBody.aiMessage?.text || responseBody.answerHe || '',
  });
}

export async function sendVoiceMessage({
  audioBlob,
  conversationId = null,
  level = DEFAULT_CHAT_LEVEL,
  includeArabic = false,
  scenario = null,
  activityTitle = null,
  activitySubtitle = null,
}) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'voice-message.webm');
  formData.append('level', level);
  formData.append('includeArabic', String(includeArabic));

  if (conversationId) {
    formData.append('conversationId', conversationId);
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

  const token = localStorage.getItem('lisan-token');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VOICE_REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(CHAT_VOICE_API_PATH, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    // AbortError = our own timeout fired. Surface a clear, actionable message
    // instead of a generic network failure so the user knows to retry/type.
    if (error?.name === 'AbortError') {
      throw new ChatApiError('Voice request timed out', {
        status: 408,
        code: 'VOICE_CLIENT_TIMEOUT',
        translationKey: 'chatVoiceTimeoutError',
      });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const responseBody = await readJsonSafe(response);

  if (!response.ok) {
    throw createChatApiError(response, responseBody, 'chatVoiceRequestFailed');
  }

  return normalizeVoiceChatResponse(responseBody);
}

export async function synthesizeSpeech({
  text,
  isFallback = false,
  pronunciationScore = null,
}) {
  const response = await fetch(CHAT_TTS_API_PATH, {
    method: 'POST',
    headers: getChatHeaders(),
    body: JSON.stringify({
      text: typeof text === 'string' ? text.trim() : '',
      isFallback: isFallback === true,
      pronunciationScore,
    }),
  });

  const responseBody = await readJsonSafe(response);

  if (!response.ok) {
    throw createChatApiError(response, responseBody, 'chatTextToSpeechFailed');
  }

  return {
    audioBase64: responseBody.audioBase64 ?? null,
    ssmlText: responseBody.ssmlText ?? null,
    fallbackUsed: responseBody.fallbackUsed === true,
    fallbackReason: responseBody.fallbackReason ?? null,
  };
}

function normalizeConversationSummary(payload = {}) {
  return {
    id: payload.id ?? '',
    title: payload.title ?? 'Hebrew practice',
    level: payload.level ?? DEFAULT_CHAT_LEVEL,
    scenario: payload.scenario ?? null,
    activityTitle: payload.activityTitle ?? null,
    activitySubtitle: payload.activitySubtitle ?? null,
    updatedAt: payload.updatedAt ?? null,
    createdAt: payload.createdAt ?? null,
    lastMessageAt: payload.lastMessageAt ?? null,
    lastMessagePreview: payload.lastMessagePreview ?? '',
    messageCount: Number.isFinite(payload.messageCount)
      ? payload.messageCount
      : Number.isFinite(payload.messagesCount)
        ? payload.messagesCount
        : 0,
  };
}

export function normalizeConversationMessage(payload = {}) {
  return {
    id: payload.id ?? '',
    role: payload.role ?? (payload.sender === 'ai' ? 'assistant' : 'user'),
    textHe: payload.textHe ?? payload.text ?? payload.transcribedText ?? payload.rawText ?? '',
    textAr: payload.textAr ?? null,
    rawText: payload.rawText ?? null,
    fallbackUsed: payload.fallbackUsed === true,
    fallbackReason: payload.fallbackReason ?? null,
    pronunciationScore: Number.isFinite(payload.pronunciationScore)
      ? payload.pronunciationScore
      : null,
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

  const items = Array.isArray(responseBody.conversations)
    ? responseBody.conversations
    : Array.isArray(responseBody.chats)
      ? responseBody.chats
      : [];

  return items
    .map(normalizeConversationSummary)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export async function fetchConversation(conversationId) {
  const response = await fetch(`${CHAT_API_PATH}/${conversationId}`, {
    method: 'GET',
    headers: getChatHeaders(),
  });

  const responseBody = await readJsonSafe(response);

  if (!response.ok) {
    throw createChatApiError(response, responseBody, 'chatConversationFailed');
  }

  const chat = responseBody.chat || {};

  return {
    conversation: normalizeConversationSummary({
      id: conversationId,
      ...chat,
    }),
    messages: Array.isArray(chat.messages)
      ? chat.messages.map(normalizeConversationMessage)
      : [],
  };
}

export async function deleteConversation(conversationId) {
  const response = await fetch(`${CHAT_API_PATH}/${conversationId}`, {
    method: 'DELETE',
    headers: getChatHeaders(),
  });

  const responseBody = await readJsonSafe(response);

  if (!response.ok) {
    throw createChatApiError(response, responseBody, 'chatConversationDeleteFailed');
  }

  return responseBody.success === true;
}

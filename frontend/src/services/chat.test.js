// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ChatApiError,
  VOICE_REQUEST_TIMEOUT_MS,
  getPronunciationFeedback,
  normalizeVoiceChatResponse,
  sendVoiceMessage,
} from './chat.js';

function makeJsonResponse({ ok = true, status = 200, body = {}, retryAfter = null } = {}) {
  return {
    ok,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === 'retry-after' ? retryAfter : null;
      },
    },
    json: vi.fn().mockResolvedValue(body),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('getPronunciationFeedback', () => {
  it('returns null when pronunciation scoring is unavailable', () => {
    expect(getPronunciationFeedback(null)).toBeNull();
    expect(getPronunciationFeedback(undefined)).toBeNull();
    expect(getPronunciationFeedback(Number.NaN)).toBeNull();
  });

  it('maps scores into learner-facing bands', () => {
    expect(getPronunciationFeedback(95)).toEqual({
      score: 95,
      tone: 'excellent',
      labelKey: 'chatPronunciationExcellent',
    });
    expect(getPronunciationFeedback(79.6)).toEqual({
      score: 80,
      tone: 'excellent',
      labelKey: 'chatPronunciationExcellent',
    });
    expect(getPronunciationFeedback(67)).toEqual({
      score: 67,
      tone: 'good',
      labelKey: 'chatPronunciationGood',
    });
    expect(getPronunciationFeedback(42)).toEqual({
      score: 42,
      tone: 'practice',
      labelKey: 'chatPronunciationPractice',
    });
  });

  it('clamps out-of-range scores before rendering feedback', () => {
    expect(getPronunciationFeedback(120)).toMatchObject({ score: 100, tone: 'excellent' });
    expect(getPronunciationFeedback(-12)).toMatchObject({ score: 0, tone: 'practice' });
  });
});

describe('voice fallback handling', () => {
  it('normalizes backend STT fallback responses without losing the transcript field', () => {
    expect(normalizeVoiceChatResponse({
      conversationId: 'chat-1',
      answerHe: '',
      fallbackUsed: true,
      fallbackReason: 'STT_EMPTY',
      transcribedText: '',
      pronunciationScore: null,
    })).toMatchObject({
      conversationId: 'chat-1',
      fallbackUsed: true,
      fallbackReason: 'STT_EMPTY',
      transcribedText: '',
      pronunciationScore: null,
    });
  });

  it('maps backend STT errors to the voice transcription copy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeJsonResponse({
      ok: false,
      status: 502,
      body: {
        code: 'STT_EMPTY',
        error: 'No clear speech was detected',
      },
    })));

    await expect(sendVoiceMessage({
      audioBlob: new Blob(['voice'], { type: 'audio/webm' }),
      level: 'A1',
    })).rejects.toMatchObject({
      name: 'ChatApiError',
      code: 'STT_EMPTY',
      translationKey: 'chatVoiceTranscriptionError',
      backendMessage: 'No clear speech was detected',
    });
  });

  it('turns a client-side abort into a clear timeout fallback', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => {
        reject(new DOMException('Request aborted', 'AbortError'));
      });
    })));

    const request = sendVoiceMessage({
      audioBlob: new Blob(['voice'], { type: 'audio/webm' }),
      level: 'A1',
    });
    const assertion = expect(request).rejects.toMatchObject({
      name: 'ChatApiError',
      code: 'VOICE_CLIENT_TIMEOUT',
      translationKey: 'chatVoiceTimeoutError',
    });

    await vi.advanceTimersByTimeAsync(VOICE_REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it('keeps retry-after metadata on voice rate-limit fallbacks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeJsonResponse({
      ok: false,
      status: 429,
      retryAfter: '7',
      body: {
        code: 'CHAT_RATE_LIMITED',
        error: 'Too many voice messages',
      },
    })));

    try {
      await sendVoiceMessage({
        audioBlob: new Blob(['voice'], { type: 'audio/webm' }),
        level: 'A1',
      });
      throw new Error('Expected sendVoiceMessage to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ChatApiError);
      expect(error).toMatchObject({
        status: 429,
        retryAfterSeconds: 7,
        translationKey: 'chatRateLimitError',
      });
    }
  });
});

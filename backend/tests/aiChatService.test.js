const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AI_SERVICE_INTERNAL_SECRET_HEADER,
  requestAiChat,
} = require('../src/services/aiChatService');

test('requestAiChat forwards the internal service secret header when configured', async () => {
  let capturedHeaders = null;

  const response = await requestAiChat(
    {
      message: 'שלום',
      level: 'A1',
      includeArabic: false,
    },
    {
      config: {
        baseUrl: 'http://127.0.0.1:8000',
        timeoutMs: 1000,
        internalSecret: 'shared-secret',
      },
      fetchImpl: async (_url, options) => {
        capturedHeaders = options.headers;

        return {
          ok: true,
          async json() {
            return {
              answerHe: 'שלום',
              answerAr: null,
              fallbackUsed: false,
              fallbackReason: null,
              level: 'A1',
              model: 'mock-model',
              latencyMs: 10,
              cacheHit: false,
              routerHit: true,
              contextChunkIds: [],
              guardrail: {
                vocabularyLeakage: false,
                blockedTokens: [],
              },
            };
          },
        };
      },
    }
  );

  assert.equal(response.answerHe, 'שלום');
  assert.equal(capturedHeaders[AI_SERVICE_INTERNAL_SECRET_HEADER], 'shared-secret');
});

test('requestAiChat omits the internal service secret header when not configured', async () => {
  let capturedHeaders = null;

  await requestAiChat(
    {
      message: 'שלום',
      level: 'A1',
      includeArabic: false,
    },
    {
      config: {
        baseUrl: 'http://127.0.0.1:8000',
        timeoutMs: 1000,
        internalSecret: '',
      },
      fetchImpl: async (_url, options) => {
        capturedHeaders = options.headers;

        return {
          ok: true,
          async json() {
            return {
              answerHe: 'שלום',
              answerAr: null,
              fallbackUsed: false,
              fallbackReason: null,
              level: 'A1',
              model: 'mock-model',
              latencyMs: 10,
              cacheHit: false,
              routerHit: true,
              contextChunkIds: [],
              guardrail: {
                vocabularyLeakage: false,
                blockedTokens: [],
              },
            };
          },
        };
      },
    }
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(capturedHeaders, AI_SERVICE_INTERNAL_SECRET_HEADER),
    false
  );
});

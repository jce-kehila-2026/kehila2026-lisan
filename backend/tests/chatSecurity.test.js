const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const { requireAuth } = require('../src/middleware/auth');
const { createChatRateLimit } = require('../src/middleware/chatRateLimit');

function createAuthToken(payload = {}) {
  return jwt.sign({
    uid: 'user-123',
    role: 'student',
    ...payload,
  }, process.env.JWT_SECRET);
}

async function withRateLimitedServer(options, run) {
  const app = express();
  app.use(express.json({ limit: options.jsonLimit || '32kb' }));
  app.post(
    '/api/chat',
    requireAuth,
    createChatRateLimit({ windowMs: options.windowMs, max: options.max }),
    (_req, res) => res.status(200).json({ ok: true })
  );

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

test('POST /api/chat is rate limited per authenticated user', async () => {
  process.env.JWT_SECRET = 'chat-security-test-secret';

  await withRateLimitedServer({ windowMs: 60_000, max: 1 }, async (baseUrl) => {
    const headers = {
      Authorization: `Bearer ${createAuthToken()}`,
      'Content-Type': 'application/json',
    };

    const firstResponse = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: 'שלום' }),
    });
    const secondResponse = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: 'שלום שוב' }),
    });
    const secondBody = await secondResponse.json();

    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 429);
    assert.equal(secondBody.error, 'Too many chat requests');
    assert.equal(secondBody.code, 'CHAT_RATE_LIMITED');
  });
});

test('POST /api/chat rejects oversized JSON bodies with 413', async () => {
  process.env.JWT_SECRET = 'chat-security-test-secret';

  await withRateLimitedServer({ windowMs: 60_000, max: 5, jsonLimit: '120b' }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${createAuthToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'שלום '.repeat(100),
      }),
    });

    assert.equal(response.status, 413);
  });
});

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import ar from '../i18n/ar.json';
import he from '../i18n/he.json';
import { getLoginErrorKey, login } from './auth.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('login error mapping', () => {
  it.each([
    ['MISSING_FIELDS', 400, 'loginErrorMissingFields'],
    ['INVALID_CREDENTIALS', 401, 'invalidCredentials'],
    ['ACCOUNT_INACTIVE', 403, 'loginErrorAccountInactive'],
    ['SERVER_ERROR', 500, 'genericLoginError'],
  ])('backend code %s -> %s', async (code, status, key) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(status, { error: 'English text', code })));
    await expect(login({ email: 'a@x.com', password: 'x' })).rejects.toThrow(key);
  });

  it('never surfaces raw backend English text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: 'Invalid credentials' })));
    await expect(login({ email: 'a@x.com', password: 'x' })).rejects.toThrow('invalidCredentials');
  });

  it('network failure -> loginErrorNetwork', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(login({ email: 'a@x.com', password: 'x' })).rejects.toThrow('loginErrorNetwork');
  });

  it('unknown code falls back to generic', () => {
    expect(getLoginErrorKey({ code: 'WHATEVER', status: 418 })).toBe('genericLoginError');
  });

  it.each([['ar', ar], ['he', he]])('%s has every login error key', (_lang, dict) => {
    for (const key of [
      'loginErrorMissingFields',
      'invalidCredentials',
      'loginErrorAccountInactive',
      'genericLoginError',
      'loginErrorNetwork',
      'showPasswordShort',
      'hidePasswordShort',
    ]) {
      expect(dict[key], key).toEqual(expect.any(String));
    }
  });

  it.each([['ar', ar], ['he', he]])('%s invalidCredentials no longer suggests 123456', (_lang, dict) => {
    expect(dict.invalidCredentials).not.toContain('123456');
  });
});

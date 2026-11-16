import { useEffect, useState } from 'react';

import { getStoredToken, getStoredUser } from './auth.js';

const API_BASE_URL = '/api';
const ACCESS_CACHE_KEY = 'lisan-ops-access';

export class OpsApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'OpsApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(path) {
  const token = getStoredToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    throw new OpsApiError(data.error || 'Request failed', response.status, data.code || null);
  }
  return data;
}

export const getOpsSummary = (range = '7d') => request(`/ops/summary?range=${encodeURIComponent(range)}`);
export const getOpsHealth = () => request('/ops/health');
export const getOpsDropoff = () => request('/ops/dropoff');
export const getOpsErrors = (range = '7d') => request(`/ops/errors?range=${encodeURIComponent(range)}`);

/**
 * Whether the current user may open /ops. Only admins are asked; the server
 * allowlist decides. Cached per browser session so the header does not call
 * the API on every page.
 */
export async function checkOpsAccess() {
  const user = getStoredUser();
  if (!user || !['admin', 'teacher'].includes(user.role)) return false;
  const cacheKey = `${ACCESS_CACHE_KEY}:${user.uid || user.id || ''}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached === '1') return true;
    if (cached === '0') return false;
  } catch {
    /* storage unavailable */
  }
  let allowed = false;
  try {
    const data = await request('/ops/access');
    allowed = data.allowed === true;
  } catch {
    allowed = false;
  }
  try {
    sessionStorage.setItem(cacheKey, allowed ? '1' : '0');
  } catch {
    /* ignore */
  }
  return allowed;
}

export function useOpsAccess() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let alive = true;
    checkOpsAccess().then((value) => {
      if (alive) setAllowed(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return allowed;
}

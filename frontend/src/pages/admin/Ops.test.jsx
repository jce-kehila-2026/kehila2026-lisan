// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { barHeight, formatCheckValue, formatMs, formatPercent, formatUsd, statusStyle } from './opsFormat.js';
import { checkOpsAccess } from '../../services/opsApi.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function jsonResponse(body, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

const EMPTY = {
  '/api/ops/summary?range=7d': {
    success: true, hasData: false, daysWithData: 0, series: [], hourly: null, byKind: [], costByProviderModel: [],
    totals: { costUsd: 0, messages: 0, unpricedEvents: 0 }, projectedMonthlyCostUsd: null,
    costPerActiveStudentUsd: null, projectionBasisDays: 0, trackingSince: null,
  },
  '/api/ops/health': {
    success: true, status: 'unknown', providerChain: null,
    checks: [{ id: 'openrouter_balance', status: 'unknown', value: null, note: 'not_configured' }],
    windows: {
      recent: { events: 0, textLatency: {}, voiceLatency: {} },
      last24h: { events: 0, textLatency: {}, voiceLatency: {} },
    },
  },
  '/api/ops/dropoff': {
    success: true, funnelSteps: [{ id: 'accounts', count: 0 }], sessions: { total: 0 }, inactiveOver7d: [],
  },
  '/api/ops/errors?range=7d': {
    success: true, byCode: [], byRoute: [], byProvider: [], fallbackReasons: [], recent: [], total: 0,
  },
};

describe('opsFormat', () => {
  it('formats money, percentages and latency buckets; missing → dash', () => {
    expect(formatUsd(null)).toBe('—');
    expect(formatUsd(0.00031)).toBe('$0.0003');
    expect(formatUsd(12.5)).toBe('$12.50');
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(0.25)).toBe('25%');
    expect(formatPercent(0.034)).toBe('3.4%');
    expect(formatMs(2000)).toBe('≤2 שנ׳');
    expect(formatMs(500)).toBe('≤500 מ״ש');
    expect(formatMs(30001)).toBe('>30 שנ׳');
  });

  it('maps statuses to colours and unknown to grey', () => {
    expect(statusStyle('critical').dot).toBe('bg-rose-500');
    expect(statusStyle('whatever').label).toBe('אין נתונים');
  });

  it('describes check values honestly', () => {
    expect(formatCheckValue({ id: 'openrouter_balance', value: null, note: 'not_configured' })).toBe('לא מוגדר');
    expect(formatCheckValue({ id: 'openrouter_balance', value: 12.3, daysLeft: 9 })).toBe('$12.30 · ~9 ימים');
    expect(formatCheckValue({ id: 'fallback_rate_1h', value: null, note: 'no_data' })).toBe('אין תנועה');
    expect(formatCheckValue({ id: 'voice_circuits', states: { stt: 'open', tts: 'closed' } })).toBe('STT open · TTS closed');
  });

  it('barHeight keeps zero at zero', () => {
    expect(barHeight(0, 10)).toBe(0);
    expect(barHeight(1, 1000)).toBe(4);
    expect(barHeight(10, 10)).toBe(100);
  });
});

describe('checkOpsAccess', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('never asks the server for non-admins', async () => {
    localStorage.setItem('lisan-user', JSON.stringify({ uid: 't1', role: 'teacher' }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await checkOpsAccess()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('admins depend on the server allowlist (and the answer is cached)', async () => {
    localStorage.setItem('lisan-user', JSON.stringify({ uid: 'a1', role: 'admin' }));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ code: 'OPS_NOT_ALLOWED' }, 403));
    vi.stubGlobal('fetch', fetchMock);
    expect(await checkOpsAccess()).toBe(false);
    expect(await checkOpsAccess()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    sessionStorage.clear();
    fetchMock.mockResolvedValue(jsonResponse({ success: true, allowed: true }));
    expect(await checkOpsAccess()).toBe(true);
  });
});

describe('Ops page', () => {
  let container;
  let root;

  beforeEach(() => {
    localStorage.setItem('lisan-token', 't');
    localStorage.setItem('lisan-user', JSON.stringify({ uid: 'a1', role: 'admin' }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('shows honest empty states, never invented numbers', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => jsonResponse(EMPTY[url] || { success: true, allowed: true })));
    const { default: Ops } = await import('./Ops.jsx');
    await act(async () => {
      root.render(<MemoryRouter><Ops /></MemoryRouter>);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const text = container.textContent;
    expect(text).toContain('אין עדיין נתוני שימוש');
    expect(text).toContain('אין עדיין חשבונות תלמידים');
    expect(text).toContain('לא מוגדר');
    expect(text).not.toMatch(/\$\d+\.\d+/);
  });

  it('shows an access-denied message when the server refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Access denied', code: 'OPS_NOT_ALLOWED' }, 403)));
    const { default: Ops } = await import('./Ops.jsx');
    await act(async () => {
      root.render(<MemoryRouter><Ops /></MemoryRouter>);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(container.textContent).toContain('OPS_ADMIN_EMAILS');
  });
});

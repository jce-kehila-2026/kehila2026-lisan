// Pure formatting helpers for the operations page (unit-tested).

export const STATUS_STYLES = {
  ok: { label: 'תקין', chip: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  warn: { label: 'אזהרה', chip: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  critical: { label: 'קריטי', chip: 'bg-rose-50 text-rose-800 border-rose-200', dot: 'bg-rose-500' },
  unknown: { label: 'אין נתונים', chip: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
};

export function statusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.unknown;
}

export const CHECK_LABELS = {
  firestore: 'מסד נתונים (Firestore)',
  ai_service: 'שירות AI (Render)',
  voice_circuits: 'זיהוי/הקראת דיבור (Azure)',
  openrouter_balance: 'יתרת OpenRouter',
  fallback_rate_1h: 'תשובות חלופיות · שעתיים',
  fallback_rate_24h: 'תשובות חלופיות · 24ש׳',
  rate_limited_1h: '429 / מכסה · שעתיים',
  rate_limited_24h: '429 / מכסה · 24ש׳',
  error_rate_1h: 'שגיאות · שעתיים',
  error_rate_24h: 'שגיאות · 24ש׳',
  text_p95_24h: 'זמן תגובה טקסט p95',
  voice_p95_24h: 'זמן תגובה קול p95',
};

export const KIND_LABELS = {
  text: 'צ׳אט טקסט',
  voice: 'צ׳אט קולי',
  stt: 'תמלול',
  tts: 'הקראה',
  pronunciation: 'הגייה',
  login: 'התחברות',
  http: 'בקשת API',
};

export const FUNNEL_LABELS = {
  accounts: 'חשבונות שנוצרו',
  everLoggedIn: 'התחברו לפחות פעם אחת',
  sentFirstAiMessage: 'שלחו הודעה ראשונה ל-AI',
  active7d: 'פעילים ב-7 הימים האחרונים',
};

export function isMissing(value) {
  return value === null || value === undefined || Number.isNaN(value);
}

export function formatUsd(value, { digits } = {}) {
  if (isMissing(value)) return '—';
  const n = Number(value);
  const d = digits ?? (Math.abs(n) > 0 && Math.abs(n) < 1 ? 4 : 2);
  return `$${n.toFixed(d)}`;
}

export function formatPercent(value) {
  if (isMissing(value)) return '—';
  return `${(Number(value) * 100).toFixed(Number(value) < 0.1 && Number(value) > 0 ? 1 : 0)}%`;
}

export function formatMs(value) {
  if (isMissing(value)) return '—';
  const n = Number(value);
  if (n > 30000) return '>30 שנ׳';
  if (n >= 1000) return `≤${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)} שנ׳`;
  return `≤${n} מ״ש`;
}

export function formatNumber(value) {
  if (isMissing(value)) return '—';
  return Number(value).toLocaleString('he-IL');
}

export function formatCheckValue(check) {
  if (!check) return '—';
  if (check.id === 'openrouter_balance') {
    if (isMissing(check.value)) return check.note === 'not_configured' ? 'לא מוגדר' : 'לא ידוע';
    const days = isMissing(check.daysLeft) ? '' : ` · ~${check.daysLeft} ימים`;
    return `${formatUsd(check.value, { digits: 2 })}${days}`;
  }
  if (check.id === 'voice_circuits') {
    const s = check.states || {};
    return `STT ${s.stt || '?'} · TTS ${s.tts || '?'}`;
  }
  if (check.id === 'firestore' || check.id === 'ai_service') {
    return isMissing(check.latencyMs) ? (check.detail || '—') : `${check.latencyMs} מ״ש`;
  }
  if (check.id.includes('p95')) return formatMs(check.value);
  if (check.note === 'no_data') return 'אין תנועה';
  const sample = check.sample ? ` (${check.sample})` : '';
  return `${formatPercent(check.value)}${sample}`;
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function shortDay(day) {
  if (!day) return '';
  const [, m, d] = String(day).split('-');
  return `${d}/${m}`;
}

/** Bar height in %, with a visible minimum for non-zero values. */
export function barHeight(value, max) {
  const v = Number(value) || 0;
  if (!max || v <= 0) return 0;
  return Math.max(4, Math.round((v / max) * 100));
}

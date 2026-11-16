import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Gauge,
  RefreshCw,
  ServerCog,
  TrendingDown,
  Users,
  Wallet,
} from 'lucide-react';

import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx';
import {
  getOpsDropoff,
  getOpsErrors,
  getOpsHealth,
  getOpsSummary,
} from '../../services/opsApi.js';
import {
  CHECK_LABELS,
  FUNNEL_LABELS,
  KIND_LABELS,
  barHeight,
  formatCheckValue,
  formatDateTime,
  formatMs,
  formatNumber,
  formatPercent,
  formatUsd,
  shortDay,
  statusStyle,
} from './opsFormat.js';

const REFRESH_MS = 60 * 1000;
const RANGES = [
  { id: '24h', label: '24 שעות' },
  { id: '7d', label: '7 ימים' },
  { id: '30d', label: '30 יום' },
];

const CARD = 'rounded-[24px] border border-white/80 bg-white/85 p-4 shadow-[0_14px_36px_rgba(109,40,217,0.1)] backdrop-blur md:p-5';

function Section({ id, icon: Icon, title, subtitle, children, error }) {
  return (
    <section id={id} className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-black text-[#160A52] md:text-xl">{title}</h2>
          {subtitle ? <p className="text-xs font-semibold text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {error ? <ErrorBox error={error} /> : children}
    </section>
  );
}

function ErrorBox({ error }) {
  const denied = error?.status === 403;
  return (
    <div className={`${CARD} border-rose-200 text-sm font-bold text-rose-800`}>
      {denied
        ? 'אין הרשאה. הדף פתוח רק למנהל/ת שהאימייל שלו/ה מופיע ב-OPS_ADMIN_EMAILS בשרת.'
        : `טעינת הנתונים נכשלה: ${error?.message || 'שגיאה לא ידועה'}`}
    </div>
  );
}

function Empty({ children = 'אין עדיין נתונים.' }) {
  return <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">{children}</p>;
}

function Kpi({ label, value, hint }) {
  return (
    <div className={CARD}>
      <p className="text-xs font-black text-violet-700">{label}</p>
      <p className="mt-1 text-2xl font-black text-[#160A52] md:text-3xl" dir="ltr">{value}</p>
      {hint ? <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{hint}</p> : null}
    </div>
  );
}

function StatusChip({ check }) {
  const style = statusStyle(check.status);
  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-2xl border px-3 py-2 ${style.chip}`} title={style.label}>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-xs font-black">{CHECK_LABELS[check.id] || check.id}</p>
        <p className="truncate text-xs font-semibold opacity-80" dir="auto">
          {style.label} · {formatCheckValue(check)}
        </p>
      </div>
    </div>
  );
}

function BarChart({ items, valueKey, format = formatNumber, labelKey = 'label', color = 'from-violet-700 to-fuchsia-300' }) {
  const max = Math.max(0, ...items.map((i) => Number(i[valueKey]) || 0));
  if (!max) return <Empty>אין עדיין נתונים בטווח הזה.</Empty>;
  return (
    <div className="flex h-44 items-end gap-1 overflow-x-auto rounded-2xl bg-violet-50/60 px-2 pb-2 pt-6" dir="ltr">
      {items.map((item) => (
        <div key={item[labelKey]} className="flex h-full min-w-[14px] flex-1 flex-col items-center justify-end gap-1">
          <span
            className={`w-full rounded-t-md bg-gradient-to-t ${color}`}
            style={{ height: `${barHeight(item[valueKey], max)}%` }}
            title={`${item[labelKey]}: ${format(item[valueKey])}`}
          />
          <span className="text-[10px] font-bold text-slate-500">{item[labelKey]}</span>
        </div>
      ))}
    </div>
  );
}

function HBar({ label, value, max, display, tone = 'bg-violet-500' }) {
  const width = max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs font-black text-slate-700">
        <span className="truncate">{label}</span>
        <span dir="ltr">{display ?? formatNumber(value)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-violet-50">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function Table({ head, rows, empty }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="w-full min-w-[520px] text-right text-xs">
        <thead className="bg-violet-50 text-violet-900">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-black">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-violet-50 bg-white/70 font-semibold text-slate-700">
          {rows.map((cells, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={i}>{cells.map((c, j) => <td key={j} className="px-3 py-2 align-top" dir="auto">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sections ────────────────────────────────────────────────────────────────

function StatusStrip({ health }) {
  if (!health) return null;
  const overall = statusStyle(health.status);
  return (
    <div className={CARD}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-black ${overall.chip}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${overall.dot}`} aria-hidden="true" />
          מצב כללי: {overall.label}
        </span>
        {health.providerChain ? (
          <span className="text-xs font-semibold text-slate-500" dir="ltr">LLM chain: {health.providerChain}</span>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {health.checks.map((check) => <StatusChip key={check.id} check={check} />)}
      </div>
    </div>
  );
}

function UsageSection({ summary, range }) {
  if (!summary.hasData) {
    return <Empty>אין עדיין נתוני שימוש. הנתונים נאספים מרגע הפריסה של מנגנון המעקב.</Empty>;
  }
  const t = summary.totals;
  const series = range === '24h' && summary.hourly
    ? summary.hourly.map((h) => ({ label: h.hour, messages: h.messages }))
    : summary.series.map((d) => ({ label: shortDay(d.day), messages: d.messages, students: d.activeStudents }));
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="תלמידים פעילים היום" value={formatNumber(t.dau)} />
        <Kpi label="פעילים ב-7 ימים" value={formatNumber(t.wau)} />
        <Kpi label="פעילים בטווח" value={formatNumber(t.activeStudents)} />
        <Kpi label="הודעות AI" value={formatNumber(t.messages)} hint={`מתוכן קוליות: ${formatNumber(t.voiceMessages)}`} />
        <Kpi label="דקות קול (הערכה)" value={formatNumber(t.voiceMinutes)} hint="לפי גודל קובצי השמע" />
        <Kpi label="התחברויות" value={formatNumber(t.loginSuccess)} hint={`ניסיונות כושלים: ${formatNumber(t.loginFailure)}`} />
      </div>
      <div className={`${CARD} mt-3`}>
        <p className="mb-2 text-sm font-black text-slate-700">{range === '24h' ? 'הודעות לפי שעה' : 'הודעות לפי יום'}</p>
        <BarChart items={series} valueKey="messages" />
      </div>
      {summary.byKind.length ? (
        <div className={`${CARD} mt-3`}>
          <Table
            head={['סוג', 'אירועים', 'עלות', 'חלופי', 'שגיאות', 'זמן ממוצע']}
            rows={summary.byKind.map((k) => [
              KIND_LABELS[k.kind] || k.kind, formatNumber(k.events), formatUsd(k.costUsd),
              formatPercent(k.fallbackRate), formatPercent(k.errorRate),
              k.avgLatencyMs === null ? '—' : `${formatNumber(k.avgLatencyMs)} מ״ש`,
            ])}
            empty="אין נתונים"
          />
        </div>
      ) : null}
    </>
  );
}

function SpendSection({ summary, health, range }) {
  const balance = health?.checks?.find((c) => c.id === 'openrouter_balance');
  const series = range === '24h' && summary.hourly
    ? summary.hourly.map((h) => ({ label: h.hour, cost: h.costUsd }))
    : summary.series.map((d) => ({ label: shortDay(d.day), cost: d.costUsd }));
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="עלות AI בטווח" value={summary.hasData ? formatUsd(summary.totals.costUsd) : '—'}
          hint={summary.totals.unpricedEvents ? `${formatNumber(summary.totals.unpricedEvents)} אירועים ללא תמחור` : 'OpenRouter: עלות אמיתית; דיבור: הערכה'} />
        <Kpi label="תחזית חודשית" value={formatUsd(summary.projectedMonthlyCostUsd, { digits: 2 })}
          hint={summary.projectionBasisDays ? `ממוצע ${summary.projectionBasisDays} ימים × 30` : 'אין מספיק נתונים'} />
        <Kpi label="עלות לתלמיד פעיל" value={formatUsd(summary.costPerActiveStudentUsd)} />
        <Kpi label="יתרת OpenRouter" value={balance ? formatCheckValue(balance) : '—'}
          hint={balance?.note === 'not_configured' ? 'הגדירו OPENROUTER_API_KEY_OPS בשרת' : (balance?.daysLeft ? 'ימים שנותרו לפי קצב 7 ימים' : null)} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className={CARD}>
          <p className="mb-2 text-sm font-black text-slate-700">עלות (USD)</p>
          <BarChart items={series} valueKey="cost" format={formatUsd} color="from-emerald-600 to-emerald-200" />
        </div>
        <div className={CARD}>
          <p className="mb-2 text-sm font-black text-slate-700">לפי ספק / מודל</p>
          <Table
            head={['ספק', 'מודל', 'קריאות', 'עלות', '429', 'חלופי']}
            rows={summary.costByProviderModel.map((m) => [
              m.provider || '—', <span dir="ltr">{m.model || '—'}</span>, formatNumber(m.events), formatUsd(m.costUsd),
              formatNumber(m.rateLimited), formatNumber(m.fallback),
            ])}
            empty="אין עדיין קריאות לספקים."
          />
        </div>
      </div>
    </>
  );
}

function StrainSection({ health, errors }) {
  if (!health) return null;
  const { recent, last24h } = health.windows;
  const rows = [
    ['קריאות AI', formatNumber(recent.events), formatNumber(last24h.events)],
    ['תשובות חלופיות', formatPercent(recent.fallbackRate), formatPercent(last24h.fallbackRate)],
    ['429 / מכסה', formatPercent(recent.rateLimitedRate), formatPercent(last24h.rateLimitedRate)],
    ['שגיאות', formatPercent(recent.errorRate), formatPercent(last24h.errorRate)],
    ['טקסט p50 / p95', `${formatMs(recent.textLatency.p50)} / ${formatMs(recent.textLatency.p95)}`, `${formatMs(last24h.textLatency.p50)} / ${formatMs(last24h.textLatency.p95)}`],
    ['קול p50 / p95', `${formatMs(recent.voiceLatency.p50)} / ${formatMs(recent.voiceLatency.p95)}`, `${formatMs(last24h.voiceLatency.p50)} / ${formatMs(last24h.voiceLatency.p95)}`],
    ['שגיאות 5xx בשרת', formatNumber(recent.http5xx), formatNumber(last24h.http5xx)],
  ];
  const reasons = errors?.fallbackReasons || [];
  const maxReason = Math.max(0, ...reasons.map((r) => r.count));
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className={CARD}>
        <Table head={['מדד', 'שעתיים אחרונות', '24 שעות']} rows={rows} empty="אין נתונים" />
        <p className="mt-2 text-xs font-semibold text-slate-500">זמני תגובה נמדדים בשרת (מה שהתלמיד חווה), לפי דליים — לכן מוצגים כ"עד".</p>
      </div>
      <div className={CARD}>
        <p className="mb-3 text-sm font-black text-slate-700">סיבות לתשובה חלופית (בטווח)</p>
        {reasons.length ? (
          <div className="grid gap-3">
            {reasons.slice(0, 8).map((r) => (
              <HBar key={r.reason} label={r.reason} value={r.count} max={maxReason} tone="bg-amber-500" />
            ))}
          </div>
        ) : <Empty>לא נרשמו תשובות חלופיות.</Empty>}
      </div>
    </div>
  );
}

function DropoffSection({ dropoff }) {
  const steps = dropoff.funnelSteps || [];
  const top = steps[0]?.count || 0;
  if (!top) return <Empty>אין עדיין חשבונות תלמידים.</Empty>;
  const s = dropoff.sessions;
  const dist = Object.entries(s.distribution || {});
  const maxDist = Math.max(0, ...dist.map(([, v]) => v));
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className={CARD}>
        <p className="mb-3 text-sm font-black text-slate-700">משפך</p>
        <div className="grid gap-3">
          {steps.map((step) => (
            <HBar key={step.id} label={FUNNEL_LABELS[step.id] || step.id} value={step.count} max={top}
              display={`${formatNumber(step.count)} (${formatPercent(top ? step.count / top : null)})`} />
          ))}
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-500">
          לא התחברו מעולם: {formatNumber(dropoff.neverLoggedIn)}.
          {dropoff.trackingSince ? ` "הודעה ראשונה" נספרת מאז ${dropoff.trackingSince}.` : ' "הודעה ראשונה" נספרת מרגע הפעלת המעקב.'}
        </p>
      </div>
      <div className={CARD}>
        <p className="mb-1 text-sm font-black text-slate-700">שיחות שהסתיימו אחרי 1–2 הודעות</p>
        {s.total ? (
          <>
            <p className="mb-3 text-2xl font-black text-[#160A52]" dir="ltr">
              {formatNumber(s.endedAfter1to2Messages)} / {formatNumber(s.total)} · {formatPercent(s.shortRate)}
            </p>
            <div className="grid gap-2">
              {dist.map(([bucket, count]) => (
                <HBar key={bucket} label={`${bucket} הודעות`} value={count} max={maxDist} tone="bg-fuchsia-500" />
              ))}
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-500">7 ימים שלמים אחרונים (ללא היום).</p>
          </>
        ) : <Empty>אין עדיין שיחות מתועדות.</Empty>}
      </div>
      <div className={CARD}>
        <p className="mb-2 text-sm font-black text-slate-700">שגיאה לפני נטישה</p>
        <Table
          head={['שלב', 'קוד', 'תלמידים']}
          rows={(dropoff.errorsBeforeAbandonment || []).map((e) => [KIND_LABELS[e.kind] || e.kind, <span dir="ltr">{e.code}</span>, formatNumber(e.students)])}
          empty="לא נמצאו תלמידים שנטשו מיד אחרי שגיאה."
        />
      </div>
      <div className={CARD}>
        <p className="mb-2 text-sm font-black text-slate-700">לא פעילים מעל 7 ימים (כינויים בלבד)</p>
        <Table
          head={['כינוי', 'ימים', 'הודעות AI', 'פעולה אחרונה', 'תוצאה']}
          rows={(dropoff.inactiveOver7d || []).slice(0, 30).map((u) => [
            <span dir="ltr">{u.alias}</span>, formatNumber(u.daysInactive), formatNumber(u.aiMessages),
            KIND_LABELS[u.lastKind] || u.lastKind || '—', u.lastErrorCode || u.lastOutcome || '—',
          ])}
          empty="אין תלמידים לא פעילים."
        />
      </div>
    </div>
  );
}

function ErrorsSection({ errors }) {
  const groups = [
    ['לפי קוד', errors.byCode, 'code'],
    ['לפי נתיב', errors.byRoute, 'route'],
    ['לפי ספק', errors.byProvider, 'provider'],
  ];
  return (
    <>
      <div className="grid gap-3 lg:grid-cols-3">
        {groups.map(([title, list, field]) => {
          const max = Math.max(0, ...(list || []).map((x) => x.count));
          return (
            <div key={field} className={CARD}>
              <p className="mb-3 text-sm font-black text-slate-700">{title}</p>
              {list && list.length ? (
                <div className="grid gap-3">
                  {list.slice(0, 8).map((x) => (
                    <HBar key={x[field]} label={x[field]} value={x.count} max={max} tone="bg-rose-500"
                      display={`${formatNumber(x.count)} · ${formatDateTime(x.lastSeen)}`} />
                  ))}
                </div>
              ) : <Empty>לא נרשמו שגיאות בטווח.</Empty>}
            </div>
          );
        })}
      </div>
      <div className={`${CARD} mt-3`}>
        <p className="mb-2 text-sm font-black text-slate-700">50 האירועים האחרונים (שגיאות ותשובות חלופיות)</p>
        {errors.recentError ? (
          <p className="mb-2 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">
            הרשימה לא זמינה — כנראה שהאינדקס opsEvents(outcome, ts) עוד לא נפרס.
          </p>
        ) : null}
        <Table
          head={['זמן', 'סוג', 'נתיב', 'סטטוס', 'קוד', 'ספק / מודל', 'זמן תגובה']}
          rows={(errors.recent || []).map((e) => [
            formatDateTime(e.ts), KIND_LABELS[e.kind] || e.kind, <span dir="ltr">{e.route || '—'}</span>,
            e.status, <span dir="ltr">{e.code || '—'}</span>,
            <span dir="ltr">{[e.provider, e.model].filter(Boolean).join(' / ') || '—'}</span>,
            e.latencyMs === null || e.latencyMs === undefined ? '—' : `${formatNumber(e.latencyMs)} מ״ש`,
          ])}
          empty="אין אירועים."
        />
      </div>
    </>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function Ops() {
  const [range, setRange] = useState('7d');
  const [state, setState] = useState({ summary: null, health: null, dropoff: null, errors: null, failures: {} });
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    requestId.current += 1;
    const id = requestId.current;
    setLoading(true);
    const [summary, health, dropoff, errors] = await Promise.allSettled([
      getOpsSummary(range), getOpsHealth(), getOpsDropoff(), getOpsErrors(range),
    ]);
    if (id !== requestId.current) return; // a newer load (e.g. range change) won
    const pick = (r) => (r.status === 'fulfilled' ? r.value : null);
    const fail = (r) => (r.status === 'rejected' ? r.reason : null);
    setState({
      summary: pick(summary),
      health: pick(health),
      dropoff: pick(dropoff),
      errors: pick(errors),
      failures: { summary: fail(summary), health: fail(health), dropoff: fail(dropoff), errors: fail(errors) },
    });
    setUpdatedAt(new Date());
    setLoading(false);
  }, [range]);

  useEffect(() => {
    load();
    const tick = () => {
      if (document.visibilityState === 'visible') load();
    };
    const timer = setInterval(tick, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const { summary, health, dropoff, errors, failures } = state;
  const firstLoad = loading && !updatedAt;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_12%_8%,rgba(221,214,254,0.54),transparent_30%),linear-gradient(180deg,#FBF8FF_0%,#FFF8FC_48%,#F4EEFF_100%)] px-3 py-3 text-slate-900 md:px-6 md:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-7xl pb-12" dir="rtl">
        <AdminPageHeader />

        <section className="mt-3 rounded-[24px] border border-white/80 bg-white/85 p-4 shadow-[0_26px_70px_rgba(91,33,182,0.14)] md:mt-6 md:rounded-[30px] md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-violet-100/80 px-3 py-1 text-xs font-black text-violet-700">
                <ServerCog className="h-4 w-4" aria-hidden="true" />
                תפעול טכני
              </p>
              <h1 className="mt-2 text-[clamp(1.6rem,6vw,2.4rem)] font-black leading-tight text-slate-950">מרכז תפעול</h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                שימוש, עלויות, עומס, נטישה ושגיאות — נתונים אמיתיים מהשרת. מתרענן כל דקה כשהדף פתוח.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full bg-violet-50 p-1" role="group" aria-label="טווח זמן">
                {RANGES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRange(r.id)}
                    aria-pressed={range === r.id}
                    className={`rounded-full px-3 py-1.5 text-xs font-black transition ${range === r.id ? 'bg-violet-600 text-white' : 'text-violet-800 hover:bg-white'}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-black text-violet-800 shadow-sm ring-1 ring-violet-100 transition hover:bg-violet-50 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                רענון
              </button>
              <span className="text-xs font-semibold text-slate-500">
                {updatedAt ? `עודכן ${updatedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'טוען…'}
              </span>
            </div>
          </div>
          {summary?.trackingSince ? (
            <p className="mt-2 text-xs font-semibold text-slate-500">המעקב פעיל מאז {summary.trackingSince} ({summary.timezone}).</p>
          ) : null}
        </section>

        {firstLoad ? (
          <p className="mt-6 text-center text-sm font-bold text-slate-500">טוען נתונים…</p>
        ) : (
          <>
            <Section id="status" icon={Activity} title="מצב המערכת" subtitle="בדיקות חיות + ספים (ירוק / כתום / אדום)" error={failures.health}>
              <StatusStrip health={health} />
            </Section>

            <Section id="usage" icon={Users} title="שימוש" subtitle="מי משתמש וכמה" error={failures.summary}>
              {summary ? <UsageSection summary={summary} range={range} /> : null}
            </Section>

            <Section id="spend" icon={Wallet} title="הוצאות" subtitle="עלות AI, תחזית ויתרה" error={failures.summary}>
              {summary ? <SpendSection summary={summary} health={health} range={range} /> : null}
            </Section>

            <Section id="strain" icon={Gauge} title="עומס" subtitle="איפה המערכת נלחצת או עומדת להישבר" error={failures.health}>
              <StrainSection health={health} errors={errors} />
            </Section>

            <Section id="dropoff" icon={TrendingDown} title="נטישה" subtitle="איפה תלמידים נעצרים" error={failures.dropoff}>
              {dropoff ? <DropoffSection dropoff={dropoff} /> : null}
            </Section>

            <Section id="errors" icon={AlertTriangle} title="שגיאות" subtitle="מה נכשל, איפה, ומתי לאחרונה" error={failures.errors}>
              {errors ? <ErrorsSection errors={errors} /> : null}
            </Section>
          </>
        )}
      </div>
    </main>
  );
}

export default Ops;

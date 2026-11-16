import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Pencil, RefreshCw, RotateCcw, ShieldCheck, Sparkles, XCircle } from 'lucide-react';

import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx';
import {
  approveReviewFeedback,
  getAiCorrectionSummaries,
  getAiCorrections,
  getReviewFeedback,
  regenerateAiCorrectionSummary,
  rejectReviewFeedback,
  revertAiCorrectionSummary,
  setAiCorrectionActive,
  updateAiCorrectionSummary,
} from '../../services/adminApi.js';

const MAX_RULE_CHARS = 300;
const MAX_SUMMARY_CHARS = 1200;
const SUMMARY_POLL_MS = 3000;
const SUMMARY_MAX_POLLS = 20;
const RULE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'ALL'];

const fieldClass =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100';

function FeedbackCard({ item, onDecided }) {
  const { t } = useTranslation();
  const [ruleText, setRuleText] = useState(item.suggestedRuleText || '');
  const [level, setLevel] = useState(item.level || 'A1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const decide = async (action) => {
    setSaving(true);
    setError('');
    try {
      if (action === 'approve') {
        await approveReviewFeedback(item.id, { ruleText, level });
      } else {
        await rejectReviewFeedback(item.id);
      }
      onDecided();
    } catch (requestError) {
      setError(requestError.message || t('admin.aiFeedback.error'));
      setSaving(false);
    }
  };

  return (
    <article className="rounded-[1.75rem] border border-[#EEE5FF] bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2 text-xs font-black">
        <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">{t(`review.category.${item.category}`)}</span>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-violet-700">{item.level}</span>
        {item.reviewerName ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
            {t('admin.aiFeedback.reviewer')}: {item.reviewerName}
          </span>
        ) : null}
      </div>

      <dl className="mt-4 grid gap-3 text-sm">
        <div className="rounded-2xl bg-violet-50/60 px-4 py-3">
          <dt className="text-xs font-black text-violet-700">{t('admin.aiFeedback.studentMessage')}</dt>
          <dd className="mt-1 font-semibold leading-7" dir="auto">{item.studentMessageText || '—'}</dd>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <dt className="text-xs font-black text-slate-500">{t('admin.aiFeedback.aiMessage')}</dt>
          <dd className="mt-1 font-semibold leading-7" dir="auto">{item.aiMessageText || '—'}</dd>
        </div>
        <div className="rounded-2xl bg-rose-50/60 px-4 py-3">
          <dt className="text-xs font-black text-rose-700">{t('admin.aiFeedback.comment')}</dt>
          <dd className="mt-1 font-semibold leading-7" dir="auto">{item.comment}</dd>
        </div>
        {item.suggestedCorrection ? (
          <div className="rounded-2xl bg-emerald-50/60 px-4 py-3">
            <dt className="text-xs font-black text-emerald-700">{t('admin.aiFeedback.suggestion')}</dt>
            <dd className="mt-1 font-semibold leading-7" dir="auto">{item.suggestedCorrection}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_8rem]">
        <label className="grid gap-1 text-xs font-black text-slate-700">
          {t('admin.aiFeedback.ruleLabel')}
          <textarea
            value={ruleText}
            onChange={(e) => setRuleText(e.target.value)}
            maxLength={MAX_RULE_CHARS}
            rows={3}
            dir="auto"
            className={fieldClass}
          />
          <span className="text-[11px] font-semibold text-slate-400">
            {t('admin.aiFeedback.ruleHint', { max: MAX_RULE_CHARS })}
          </span>
        </label>
        <label className="grid content-start gap-1 text-xs font-black text-slate-700">
          {t('admin.aiFeedback.level')}
          <select value={level} onChange={(e) => setLevel(e.target.value)} className={fieldClass}>
            {RULE_LEVELS.map((value) => (
              <option key={value} value={value}>
                {value === 'ALL' ? t('admin.aiFeedback.allLevels') : value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="mt-3 text-sm font-bold text-rose-700">{error}</p> : null}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => decide('reject')}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 disabled:opacity-60"
        >
          <XCircle className="h-4 w-4" />
          {t('admin.aiFeedback.reject')}
        </button>
        <button
          type="button"
          disabled={saving || ruleText.trim().length < 5}
          onClick={() => decide('approve')}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-button disabled:opacity-60"
        >
          <CheckCircle2 className="h-4 w-4" />
          {t('admin.aiFeedback.approve')}
        </button>
      </div>
    </article>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function SummaryCard({ summary, onChanged }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(summary.text || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      const data = await action();
      onChanged(data.summary);
      setEditing(false);
    } catch (requestError) {
      setError(requestError.message || t('admin.aiFeedback.error'));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    setDraft(summary.text || '');
    setEditing(true);
  };

  const revert = () => {
    if (!summary.previous) return;
    if (!window.confirm(t('admin.aiFeedback.summary.revertConfirm', { version: summary.previous.version }))) return;
    run(() => revertAiCorrectionSummary(summary.level));
  };

  const statusLabel = summary.regenerating
    ? t('admin.aiFeedback.summary.regenerating')
    : summary.status === 'failed'
      ? t('admin.aiFeedback.summary.statusFailed')
      : summary.status === 'none'
        ? t('admin.aiFeedback.summary.statusNone')
        : t('admin.aiFeedback.summary.statusOk');
  const statusClass = summary.regenerating
    ? 'bg-amber-50 text-amber-700'
    : summary.status === 'failed'
      ? 'bg-rose-50 text-rose-700'
      : summary.status === 'none'
        ? 'bg-slate-100 text-slate-600'
        : 'bg-emerald-50 text-emerald-700';
  const showRawListNotice =
    !summary.regenerating && summary.activeRuleCount > 0 && !summary.coversCurrentRules;

  return (
    <article className="rounded-[1.75rem] border border-[#EEE5FF] bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-black text-slate-950">
          <Sparkles className="h-4 w-4 text-violet-600" />
          {t('admin.aiFeedback.summary.cardTitle', { level: summary.level })}
        </h3>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClass}`}>{statusLabel}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black text-slate-500">
        {summary.version ? (
          <span className="rounded-full bg-violet-50 px-3 py-1 text-violet-700">
            {t('admin.aiFeedback.summary.version', { version: summary.version })}
          </span>
        ) : null}
        {summary.generatedAt ? (
          <span className="rounded-full bg-slate-100 px-3 py-1">
            {t('admin.aiFeedback.summary.generatedAt', { date: formatDate(summary.generatedAt) })}
          </span>
        ) : null}
        {summary.version ? (
          <span className="rounded-full bg-slate-100 px-3 py-1">
            {summary.edited ? t('admin.aiFeedback.summary.edited') : t('admin.aiFeedback.summary.byAi')}
          </span>
        ) : null}
        <span className="rounded-full bg-slate-100 px-3 py-1">
          {t('admin.aiFeedback.summary.ruleCount', { count: summary.activeRuleCount })}
        </span>
      </div>

      {summary.status === 'failed' && summary.error ? (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span dir="auto">{t('admin.aiFeedback.summary.failedNotice', { error: summary.error })}</span>
        </p>
      ) : null}
      {showRawListNotice ? (
        <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          {t('admin.aiFeedback.summary.rawListInUse')}
        </p>
      ) : null}

      {editing ? (
        <label className="mt-3 grid gap-1 text-xs font-black text-slate-700">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_SUMMARY_CHARS}
            rows={6}
            dir="auto"
            className={fieldClass}
          />
          <span className="text-[11px] font-semibold text-slate-400">
            {t('admin.aiFeedback.summary.editHint', { max: MAX_SUMMARY_CHARS })}
          </span>
        </label>
      ) : (
        <p className="mt-3 whitespace-pre-line rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold leading-7 text-slate-900" dir="auto">
          {summary.text || t('admin.aiFeedback.summary.empty')}
        </p>
      )}

      {error ? <p className="mt-3 text-sm font-bold text-rose-700">{error}</p> : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {editing ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(false)}
              className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-60"
            >
              {t('admin.aiFeedback.summary.cancel')}
            </button>
            <button
              type="button"
              disabled={busy || draft.trim().length < 5}
              onClick={() => run(() => updateAiCorrectionSummary(summary.level, draft))}
              className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-black text-white shadow-button disabled:opacity-60"
            >
              {busy ? t('admin.aiFeedback.summary.updating') : t('admin.aiFeedback.summary.save')}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy || !summary.previous}
              onClick={revert}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              {t('admin.aiFeedback.summary.revert')}
            </button>
            <button
              type="button"
              disabled={busy || summary.regenerating || summary.activeRuleCount === 0}
              onClick={() => run(() => regenerateAiCorrectionSummary(summary.level))}
              className="inline-flex items-center gap-2 rounded-2xl bg-violet-50 px-4 py-2 text-sm font-black text-violet-700 hover:bg-violet-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
              {busy ? t('admin.aiFeedback.summary.updating') : t('admin.aiFeedback.summary.regenerate')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={startEdit}
              className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2 text-sm font-black text-white shadow-button disabled:opacity-60"
            >
              <Pencil className="h-4 w-4" />
              {t('admin.aiFeedback.summary.edit')}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function AiFeedback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const pollTimer = useRef(null);
  const pollCount = useRef(0);

  // Summaries regenerate in the background after approve/deactivate — poll
  // briefly while any level is still regenerating.
  const loadSummaries = useCallback(async () => {
    clearTimeout(pollTimer.current);
    try {
      const data = await getAiCorrectionSummaries();
      const list = data.summaries || [];
      setSummaries(list);
      if (list.some((item) => item.regenerating) && pollCount.current < SUMMARY_MAX_POLLS) {
        pollCount.current += 1;
        pollTimer.current = setTimeout(loadSummaries, SUMMARY_POLL_MS);
      }
    } catch {
      setError(t('admin.aiFeedback.error'));
    }
  }, [t]);

  const refreshSummariesSoon = useCallback(() => {
    pollCount.current = 0;
    clearTimeout(pollTimer.current);
    pollTimer.current = setTimeout(loadSummaries, 1000);
  }, [loadSummaries]);

  useEffect(() => () => clearTimeout(pollTimer.current), []);

  const load = useCallback(async () => {
    setError('');
    try {
      const [feedbackData, correctionsData] = await Promise.all([
        getReviewFeedback('pending'),
        getAiCorrections(),
      ]);
      setFeedback(feedbackData.feedback || []);
      setCorrections(correctionsData.corrections || []);
    } catch {
      setError(t('admin.aiFeedback.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    loadSummaries();
  }, [load, loadSummaries]);

  const onDecided = useCallback(() => {
    load();
    refreshSummariesSoon();
  }, [load, refreshSummariesSoon]);

  const onSummaryChanged = (updated) => {
    if (!updated) return;
    setSummaries((current) => current.map((item) => (item.level === updated.level ? updated : item)));
  };

  const toggleRule = async (rule) => {
    try {
      await setAiCorrectionActive(rule.id, !rule.active);
      setCorrections((current) =>
        current.map((item) => (item.id === rule.id ? { ...item, active: !rule.active } : item)),
      );
      refreshSummariesSoon();
    } catch {
      setError(t('admin.aiFeedback.error'));
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#FCF8FF_0%,#F7F0FF_45%,#FFF6FB_100%)] px-3 py-3 text-slate-900 md:px-6 md:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-5xl" dir="rtl">
        <AdminPageHeader />

        <section className="mt-8 rounded-[1.75rem] border border-[#EEE5FF] bg-white/85 p-5 shadow-card md:mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-xl font-black text-slate-950">{t('admin.aiFeedback.title')}</h1>
                <p className="text-sm font-semibold text-slate-500">{t('admin.aiFeedback.subtitle')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/review')}
              className="rounded-2xl bg-violet-50 px-4 py-2 text-sm font-black text-violet-700 hover:bg-violet-100"
            >
              {t('admin.aiFeedback.openReviewArea')}
            </button>
          </div>
        </section>

        {error ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p> : null}

        <h2 className="mt-6 text-lg font-black text-slate-950">
          {t('admin.aiFeedback.pendingTitle', { count: feedback.length })}
        </h2>
        <div className="mt-3 grid gap-4">
          {loading ? <p className="text-sm font-bold text-slate-500">{t('review.loading')}</p> : null}
          {!loading && feedback.length === 0 ? (
            <p className="rounded-[1.5rem] bg-white/85 p-6 text-center text-sm font-black text-slate-500">
              {t('admin.aiFeedback.emptyPending')}
            </p>
          ) : null}
          {feedback.map((item) => (
            <FeedbackCard key={item.id} item={item} onDecided={onDecided} />
          ))}
        </div>

        <h2 className="mt-8 text-lg font-black text-slate-950">{t('admin.aiFeedback.summary.sectionTitle')}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">{t('admin.aiFeedback.summary.sectionSubtitle')}</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {summaries.map((summary) => (
            <SummaryCard key={summary.level} summary={summary} onChanged={onSummaryChanged} />
          ))}
        </div>

        <h2 className="mt-8 text-lg font-black text-slate-950">{t('admin.aiFeedback.rulesTitle')}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">{t('admin.aiFeedback.rulesSubtitle')}</p>
        <ul className="mt-3 grid gap-3">
          {!loading && corrections.length === 0 ? (
            <li className="rounded-[1.5rem] bg-white/85 p-6 text-center text-sm font-black text-slate-500">
              {t('admin.aiFeedback.emptyRules')}
            </li>
          ) : null}
          {corrections.map((rule) => (
            <li key={rule.id} className="flex flex-col gap-3 rounded-[1.5rem] border border-[#EEE5FF] bg-white p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className={`text-sm font-semibold leading-7 ${rule.active ? 'text-slate-900' : 'text-slate-400 line-through'}`} dir="auto">
                  {rule.ruleText}
                </p>
                <p className="mt-1 text-xs font-black text-violet-700">
                  {rule.level === 'ALL' ? t('admin.aiFeedback.allLevels') : rule.level}
                  {rule.category ? ` · ${t(`review.category.${rule.category}`)}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggleRule(rule)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-black ${
                  rule.active ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                {rule.active ? t('admin.aiFeedback.deactivate') : t('admin.aiFeedback.activate')}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

export default AiFeedback;

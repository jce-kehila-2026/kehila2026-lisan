import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Flag, MessageSquareText, ShieldCheck } from 'lucide-react';

import LisanHeader from '../../components/LisanHeader.jsx';
import { logout } from '../../services/auth.js';
import {
  FLAG_CATEGORIES,
  MAX_FEEDBACK_CHARS,
  REVIEW_LEVELS,
  completeReview,
  flagReviewMessage,
  getMyReviewStats,
  getReviewConversation,
  listReviewConversations,
} from '../../services/reviewApi.js';

const fieldClass =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100';

const STATUS_FILTERS = ['', 'unreviewed', 'has_flags', 'reviewed'];

const statusBadgeClass = {
  unreviewed: 'bg-slate-100 text-slate-600',
  reviewed: 'bg-emerald-50 text-emerald-700',
  has_flags: 'bg-rose-50 text-rose-700',
};

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function ReviewShell({ children }) {
  const navigate = useNavigate();
  const { i18n } = useTranslation();

  useEffect(() => {
    // Reviewer area is Hebrew-first; respect an explicit language choice.
    let saved = null;
    try {
      saved = localStorage.getItem('lisan-language');
    } catch {
      saved = null;
    }
    if (!saved && i18n.language !== 'he') i18n.changeLanguage('he');
  }, [i18n]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#FCF8FF_0%,#F7F0FF_45%,#FFF6FB_100%)] px-3 py-3 text-slate-900 md:px-6 md:py-8">
      <div className="mx-auto w-full max-w-3xl" dir="rtl">
        <LisanHeader
          sections={[]}
          logoTarget="/review"
          onLogout={() => {
            logout();
            navigate('/login', { replace: true });
          }}
        />
        <div className="mt-8 md:mt-10">{children}</div>
      </div>
    </main>
  );
}

function StatsBar() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    getMyReviewStats()
      .then((data) => setStats(data.stats))
      .catch(() => setStats(null));
  }, []);

  if (!stats) return null;

  return (
    <p className="mt-2 text-sm font-bold text-violet-700">
      {t('review.stats', {
        reviewed: stats.reviewedConversations,
        flags: stats.flagsSubmitted,
      })}
    </p>
  );
}

export function ReviewList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('unreviewed');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (nextCursor = null) => {
    setLoading(true);
    setError('');
    try {
      const data = await listReviewConversations({ level, status, cursor: nextCursor });
      setItems((current) => (nextCursor ? [...current, ...data.conversations] : data.conversations));
      setCursor(data.nextCursor || null);
    } catch {
      setError(t('review.loadError'));
    } finally {
      setLoading(false);
    }
  }, [level, status, t]);

  useEffect(() => {
    load(null);
  }, [load]);

  return (
    <ReviewShell>
      <section className="rounded-[1.75rem] border border-[#EEE5FF] bg-white/85 p-5 shadow-card">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-black text-slate-950">{t('review.title')}</h1>
            <p className="text-sm font-semibold text-slate-500">{t('review.subtitle')}</p>
          </div>
        </div>
        <StatsBar />

        <div className="mt-4 grid gap-3 sm:grid-cols-[10rem_1fr]">
          <label className="grid gap-1 text-xs font-black text-slate-600">
            {t('review.filters.level')}
            <select value={level} onChange={(e) => setLevel(e.target.value)} className={fieldClass}>
              <option value="">{t('review.filters.allLevels')}</option>
              {REVIEW_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>{lvl}</option>
              ))}
            </select>
          </label>
          <div className="grid gap-1 text-xs font-black text-slate-600">
            {t('review.filters.status')}
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((value) => (
                <button
                  key={value || 'all'}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={`rounded-full px-4 py-2 text-xs font-black transition ${
                    status === value ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                  }`}
                >
                  {t(`review.filters.${value || 'all'}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>
      ) : null}

      <ul className="mt-4 grid gap-3">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => navigate(`/review/${item.id}`)}
              className="flex w-full items-center justify-between gap-3 rounded-[1.5rem] border border-[#EEE5FF] bg-white p-4 text-right shadow-card transition hover:-translate-y-0.5"
            >
              <div className="min-w-0">
                <p className="font-black text-slate-950">{t('review.studentAlias', { alias: item.studentAlias })}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {item.level} · {formatDate(item.date)} · {t('review.messageCount', { count: item.messageCount })}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${statusBadgeClass[item.reviewStatus] || ''}`}>
                {t(`review.status.${item.reviewStatus}`)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {!loading && items.length === 0 && !error ? (
        <p className="mt-6 rounded-[1.5rem] bg-white/85 p-6 text-center text-sm font-black text-slate-500">
          {t('review.empty')}
        </p>
      ) : null}

      {loading ? <p className="mt-4 text-center text-sm font-bold text-slate-500">{t('review.loading')}</p> : null}

      {cursor && !loading ? (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => load(cursor)} className="rounded-2xl bg-violet-50 px-5 py-3 text-sm font-black text-violet-700 hover:bg-violet-100">
            {t('review.loadMore')}
          </button>
        </div>
      ) : null}
    </ReviewShell>
  );
}

function FlagForm({ onCancel, onSubmit, saving }) {
  const { t } = useTranslation();
  const [category, setCategory] = useState(FLAG_CATEGORIES[0]);
  const [comment, setComment] = useState('');
  const [suggestedCorrection, setSuggestedCorrection] = useState('');

  return (
    <form
      className="mt-3 grid gap-3 rounded-2xl border border-rose-100 bg-rose-50/60 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!comment.trim()) return;
        onSubmit({ category, comment: comment.trim(), suggestedCorrection: suggestedCorrection.trim() });
      }}
    >
      <label className="grid gap-1 text-xs font-black text-slate-700">
        {t('review.flag.category')}
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClass}>
          {FLAG_CATEGORIES.map((value) => (
            <option key={value} value={value}>{t(`review.category.${value}`)}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-black text-slate-700">
        {t('review.flag.comment')}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={MAX_FEEDBACK_CHARS}
          required
          rows={3}
          className={fieldClass}
          placeholder={t('review.flag.commentPlaceholder')}
        />
      </label>
      <label className="grid gap-1 text-xs font-black text-slate-700">
        {t('review.flag.suggestion')}
        <textarea
          value={suggestedCorrection}
          onChange={(e) => setSuggestedCorrection(e.target.value)}
          maxLength={MAX_FEEDBACK_CHARS}
          rows={2}
          dir="auto"
          className={fieldClass}
          placeholder={t('review.flag.suggestionPlaceholder')}
        />
      </label>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-700">
          {t('review.flag.cancel')}
        </button>
        <button type="submit" disabled={saving || !comment.trim()} className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
          {saving ? t('review.flag.saving') : t('review.flag.submit')}
        </button>
      </div>
    </form>
  );
}

export function ReviewConversation() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [conversation, setConversation] = useState(null);
  const [error, setError] = useState('');
  const [openFlagIndex, setOpenFlagIndex] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const data = await getReviewConversation(id);
      setConversation(data.conversation);
    } catch {
      setError(t('review.loadError'));
    }
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const submitFlag = async (messageIndex, values) => {
    setSaving(true);
    try {
      await flagReviewMessage(id, { messageIndex, ...values });
      setOpenFlagIndex(null);
      setNotice(t('review.flag.saved'));
      await load();
    } catch {
      setNotice(t('review.flag.error'));
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    try {
      await completeReview(id);
      navigate('/review', { replace: true });
    } catch {
      setNotice(t('review.completeError'));
      setSaving(false);
    }
  };

  const flagsByIndex = new Map();
  (conversation?.myFlags || []).forEach((flag) => {
    const list = flagsByIndex.get(flag.messageIndex) || [];
    list.push(flag);
    flagsByIndex.set(flag.messageIndex, list);
  });

  return (
    <ReviewShell>
      <button type="button" onClick={() => navigate('/review')} className="inline-flex items-center gap-2 text-sm font-black text-violet-700">
        <ArrowRight className="h-4 w-4" />
        {t('review.back')}
      </button>

      {error ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p> : null}

      {conversation ? (
        <>
          <section className="mt-3 rounded-[1.5rem] border border-[#EEE5FF] bg-white/85 p-4 shadow-card">
            <div className="flex items-center gap-3">
              <MessageSquareText className="h-5 w-5 text-violet-700" />
              <h1 className="font-black text-slate-950">{t('review.studentAlias', { alias: conversation.studentAlias })}</h1>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {conversation.level} · {formatDate(conversation.date)}
            </p>
            <p className="mt-2 text-xs font-semibold leading-6 text-slate-500">{t('review.instructions')}</p>
          </section>

          {notice ? <p className="mt-3 rounded-2xl bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700">{notice}</p> : null}

          <ol className="mt-4 grid gap-3">
            {conversation.messages.map((message) => {
              const isAi = message.role === 'ai';
              const myFlags = flagsByIndex.get(message.index) || [];
              return (
                <li key={message.index} className={`flex ${isAi ? 'justify-end' : 'justify-start'}`}>
                  <div className={`w-full max-w-[85%] rounded-[1.25rem] px-4 py-3 shadow-sm ${
                    isAi ? 'bg-white border border-[#EEE5FF]' : 'bg-violet-600 text-white'
                  } ${myFlags.length ? 'ring-2 ring-rose-300' : ''}`}>
                    <p className={`text-[11px] font-black ${isAi ? 'text-violet-700' : 'text-violet-100'}`}>
                      {isAi ? t('review.roleAi') : t('review.roleStudent')}
                      {message.type === 'voice' ? ` · ${t('review.voice')}` : ''}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-7" dir="auto">
                      {message.text || '—'}
                    </p>
                    {myFlags.map((flag) => (
                      <p key={flag.id} className="mt-2 rounded-xl bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
                        <Flag className="ml-1 inline h-3 w-3" />
                        {t(`review.category.${flag.category}`)}: {flag.comment}
                      </p>
                    ))}
                    {isAi && openFlagIndex !== message.index ? (
                      <button
                        type="button"
                        onClick={() => setOpenFlagIndex(message.index)}
                        className="mt-2 inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700 hover:bg-rose-100"
                      >
                        <Flag className="h-3 w-3" />
                        {t('review.flag.open')}
                      </button>
                    ) : null}
                    {isAi && openFlagIndex === message.index ? (
                      <FlagForm
                        saving={saving}
                        onCancel={() => setOpenFlagIndex(null)}
                        onSubmit={(values) => submitFlag(message.index, values)}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="sticky bottom-3 mt-6 flex justify-center">
            <button
              type="button"
              onClick={finish}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-black text-white shadow-button disabled:opacity-60"
            >
              <CheckCircle2 className="h-5 w-5" />
              {conversation.completedByMe ? t('review.completeAgain') : t('review.complete')}
            </button>
          </div>
        </>
      ) : null}
    </ReviewShell>
  );
}

function ReviewPage() {
  const { id } = useParams();
  return id ? <ReviewConversation /> : <ReviewList />;
}

export default ReviewPage;

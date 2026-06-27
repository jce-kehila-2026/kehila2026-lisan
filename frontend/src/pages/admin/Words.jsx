import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n/index.js';
import {
  BookOpenCheck,
  CheckCircle2,
  Layers3,
  Search,
  XCircle,
} from 'lucide-react';
import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx';
import AdminHeroVisual from '../../components/admin/AdminHeroVisual.jsx';

import { getStoredToken } from '../../services/auth.js';

const API_BASE_URL = '/api';
const LEVELS = ['A1', 'A2', 'B1', 'B2'];

const mockPendingWords = [
  {
    id: 'mock_word_001',
    word: 'להקשיב',
    translation: 'أن نصغي / نستمع',
    example: 'אני מקשיבה לשיחה בעברית.',
    status: 'pending',
    level: 'A1',
  },
  {
    id: 'mock_word_002',
    word: 'להתקדם',
    translation: 'أن نتقدّم',
    example: 'אנחנו מתקדמות בכל שיעור.',
    status: 'pending',
    level: 'A2',
  },
  {
    id: 'mock_word_003',
    word: 'בחירה',
    translation: 'اختيار',
    example: '',
    status: 'pending',
    level: 'B1',
  },
  {
    id: 'mock_word_004',
    word: 'התנסות',
    translation: 'تجربة / ممارسة',
    example: 'ההתנסות בשיחה עוזרת לזכור מילים חדשות.',
    status: 'pending',
    level: 'B2',
  },
];

function normalizeWord(rawWord) {
  return {
    id: rawWord.id,
    word: rawWord.word || rawWord.hebrew || '',
    translation: rawWord.translation || rawWord.meaning || rawWord.arabic || '',
    example: rawWord.example || rawWord.exampleSentence || rawWord.sentence || rawWord.notes || '',
    status: rawWord.status || 'pending',
    level: LEVELS.includes(rawWord.level) ? rawWord.level : 'A1',
    savedLevel: rawWord.level || 'A1',
    feedback: '',
  };
}

function statusLabel(status) {
  if (status === 'approved') return i18n.t('admin.words.status.approved');
  if (status === 'rejected') return i18n.t('admin.words.status.rejected');
  return i18n.t('admin.words.status.pending');
}

function statusClass(status) {
  if (status === 'approved') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (status === 'rejected') return 'bg-rose-50 text-rose-700 border-rose-100';
  return 'bg-violet-50 text-violet-700 border-violet-100';
}

function reviewCardClass(count) {
  if (count === 3) {
    return 'w-full flex-none';
  }

  return 'w-full flex-none md:basis-[calc(50%_-_0.5rem)]';
}

function LevelSelect({ level, onChange }) {
  return (
    <select
      value={level}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-full border border-violet-100 bg-violet-50/80 px-4 text-center text-sm font-black text-violet-800 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100 sm:w-auto"
    >
      {LEVELS.map((levelOption) => (
        <option key={levelOption} value={levelOption}>
          {levelOption}
        </option>
      ))}
    </select>
  );
}

function WordActions({ isBusy, onApprove, onReject }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-2 sm:flex sm:flex-wrap">
      <button
        type="button"
        disabled={isBusy}
        onClick={onApprove}
        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-violet-600 px-4 text-sm font-black text-white shadow-button transition hover:-translate-y-0.5 hover:bg-violet-700 disabled:opacity-50 sm:h-10"
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        {t('admin.words.actions.approve')}
      </button>

      <button
        type="button"
        disabled={isBusy}
        onClick={onReject}
        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-violet-100 bg-white px-4 text-sm font-black text-violet-700 transition hover:-translate-y-0.5 hover:bg-violet-50 disabled:opacity-50 sm:h-10"
      >
        <XCircle className="h-4 w-4" aria-hidden="true" />
        {t('admin.words.actions.reject')}
      </button>
    </div>
  );
}

function WordReviewCard({
  isBusy,
  onApprove,
  onReject,
  onSetLevel,
  word,
  wordCount,
}) {
  const { t } = useTranslation();
  return (
    <article className={`rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_18px_42px_rgba(109,40,217,0.12)] transition hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(124,58,237,0.16)] ${reviewCardClass(wordCount)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-violet-700">{t('admin.words.card.newWord')}</p>
          <h3 className="mt-1 break-words text-2xl font-black leading-tight text-slate-950">
            {word.word}
          </h3>
        </div>

        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black ${statusClass(word.status)}`}>
          {statusLabel(word.status)}
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="rounded-[18px] bg-violet-50/70 p-3">
          <p className="text-xs font-black text-violet-700">{t('admin.words.card.translation')}</p>
          <p className="mt-1 break-words text-base font-bold leading-7 text-slate-800">
            {word.translation}
          </p>
        </div>

        <div className="rounded-[18px] bg-white/80 p-3 shadow-[inset_0_0_0_1px_rgba(221,214,254,0.65)]">
          <p className="text-xs font-black text-violet-700">{t('admin.words.card.example')}</p>
          <p className="mt-1 break-words text-sm font-semibold leading-7 text-slate-600">
            {word.example || t('admin.words.card.noExample')}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-xs font-black text-violet-700">
          {t('admin.words.card.level')}
          <span className="mt-2 block">
            <LevelSelect
              level={word.level}
              onChange={(level) => onSetLevel(word.id, level)}
            />
          </span>
        </label>
      </div>

      {word.feedback ? (
        <p className="mt-3 rounded-2xl bg-violet-50 px-3 py-2 text-xs font-bold leading-5 text-violet-700">
          {word.feedback}
        </p>
      ) : null}

      <div className="mt-4">
        <WordActions
          isBusy={isBusy}
          onApprove={() => onApprove(word)}
          onReject={() => onReject(word)}
        />
      </div>
    </article>
  );
}

function Words() {
  const { t } = useTranslation();
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usingMockData, setUsingMockData] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [busyWordId, setBusyWordId] = useState('');

  const request = async (path, options = {}) => {
    const token = getStoredToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  };

  useEffect(() => {
    const loadPendingWords = async () => {
      try {
        setLoading(true);
        setError('');

        const data = await request('/admin/words/pending');
        if ((data.words || []).length === 0) {
          setWords(mockPendingWords.map(normalizeWord));
          setUsingMockData(true);
        } else {
          setWords((data.words || []).map(normalizeWord));
          setUsingMockData(false);
        }
      } catch (loadError) {
        setWords(mockPendingWords.map(normalizeWord));
        setUsingMockData(true);
        setError('');
      } finally {
        setLoading(false);
      }
    };

    loadPendingWords();
  }, []);

  const filteredWords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return words;
    }

    return words.filter((word) => {
      return (
        word.word.toLowerCase().includes(normalizedQuery) ||
        word.translation.toLowerCase().includes(normalizedQuery) ||
        word.example.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [query, words]);

  const pendingCount = words.filter((word) => word.status === 'pending').length;
  const approvedCount = words.filter((word) => word.status === 'approved').length;
  const rejectedCount = words.filter((word) => word.status === 'rejected').length;

  const updateWord = (id, updater) => {
    setWords((currentWords) =>
      currentWords.map((word) => (word.id === id ? updater(word) : word)),
    );
  };

  const setWordLevel = (id, level) => {
    updateWord(id, (word) => ({
      ...word,
      level,
      feedback: '',
    }));
  };

  const saveLevel = (id) => {
    // TODO: Connect to backend once an endpoint exists for updating a pending word level.
    updateWord(id, (word) => ({
      ...word,
      savedLevel: word.level,
      feedback: t('admin.words.alerts.levelSaved'),
    }));
  };

  const approveWord = async (word) => {
    try {
      setBusyWordId(word.id);

      if (!usingMockData) {
        await request(`/admin/words/${word.id}/approve`, {
          method: 'PUT',
          body: JSON.stringify({ level: word.level }),
        });
      }

      setWords((currentWords) =>
        currentWords.filter((currentWord) => currentWord.id !== word.id),
      );
    } catch (approveError) {
      setWords((currentWords) =>
        currentWords.filter((currentWord) => currentWord.id !== word.id),
      );
    } finally {
      setBusyWordId('');
    }
  };

  const rejectWord = async (word) => {
    try {
      setBusyWordId(word.id);

      if (!usingMockData) {
        await request(`/admin/words/${word.id}/reject`, {
          method: 'PUT',
          body: JSON.stringify({ notes: 'Rejected from admin word review page' }),
        });
      }

      setWords((currentWords) =>
        currentWords.filter((currentWord) => currentWord.id !== word.id),
      );
    } catch (rejectError) {
      setWords((currentWords) =>
        currentWords.filter((currentWord) => currentWord.id !== word.id),
      );
    } finally {
      setBusyWordId('');
    }
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_12%_8%,rgba(221,214,254,0.54),transparent_30%),linear-gradient(180deg,#FBF8FF_0%,#FFF8FC_48%,#F4EEFF_100%)] px-3 py-3 text-slate-900 md:px-6 md:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-7xl pb-12" dir="rtl">
        <AdminPageHeader icon={BookOpenCheck} label={t('admin.words.header')} />

<section
          className="relative mt-8 overflow-hidden rounded-[24px] border border-violet-100/70 bg-white/75 shadow-[0_16px_42px_rgba(109,40,217,0.1)] md:mt-10 md:rounded-[28px]"
          style={{ maxHeight: '140px' }}
        >
          <div className="flex h-full min-h-[140px] items-stretch" dir="ltr">
            <div className="relative w-[34%] shrink-0 overflow-hidden" aria-hidden="true">
              <AdminHeroVisual type="words" />
            </div>
            <div className="flex flex-1 flex-col justify-center text-right" style={{ paddingLeft: '4px', paddingRight: '20px' }} dir="rtl">
              <p className="inline-flex w-full items-center justify-start gap-2 text-xs font-black text-violet-700 mb-1 text-right">
                <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
                {t('admin.words.heroBadge')}
              </p>
              <h1 className="text-2xl font-black leading-tight text-slate-950 md:text-3xl">{t('admin.words.heroTitle')}</h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">{t('admin.words.heroSubtitle')}</p>
              
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-[0_22px_60px_rgba(91,33,182,0.11)] backdrop-blur sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">
                {t('admin.words.pendingWordsTitle')}
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {loading ? t('admin.words.loadingWords') : `${filteredWords.length}${t('admin.words.wordsDisplayedSuffix')}`}
              </p>
            </div>

            <label className="relative block w-full lg:w-80">
              <span className="sr-only">{t('admin.words.searchAria')}</span>
              <Search
                className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-violet-500"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('admin.words.searchPlaceholder')}
                className="h-12 w-full rounded-full border border-violet-100 bg-violet-50/70 py-3 pl-4 pr-12 text-right text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
              />
            </label>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/80 p-4 text-sm font-bold leading-6 text-violet-800">
              {error}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap justify-center gap-4 lg:hidden">
            {filteredWords.map((word) => (
              <WordReviewCard
                key={word.id}
                word={word}
                isBusy={busyWordId === word.id}
                onApprove={approveWord}
                onReject={rejectWord}
                onSetLevel={setWordLevel}
                wordCount={filteredWords.length}
              />
            ))}

            {!loading && filteredWords.length === 0 ? (
              <div className="rounded-[24px] border border-violet-100 bg-white/90 p-8 text-center text-sm font-bold text-slate-500 shadow-[0_14px_36px_rgba(109,40,217,0.1)]">
                {t('admin.words.noWordsToDisplay')}
              </div>
            ) : null}
          </div>

          <div className="mt-5 hidden overflow-hidden rounded-[1.5rem] border border-violet-100/70 shadow-[0_14px_34px_rgba(109,40,217,0.08)] lg:block">
            <table className="w-full border-collapse bg-white/95 text-right">
              <thead>
                <tr className="bg-violet-50/80 text-sm font-black text-violet-800">
                  <th className="px-4 py-4">{t('admin.words.table.word')}</th>
                  <th className="px-4 py-4">{t('admin.words.table.translation')}</th>
                  <th className="px-4 py-4">{t('admin.words.table.example')}</th>
                  <th className="px-4 py-4">{t('admin.words.table.status')}</th>
                  <th className="px-4 py-4">{t('admin.words.table.level')}</th>
                  <th className="px-4 py-4">{t('admin.words.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredWords.map((word) => {
                  const isBusy = busyWordId === word.id;

                  return (
                    <tr
                      key={word.id}
                      className="border-t border-violet-100/70 align-top transition hover:bg-violet-50/40"
                    >
                      <td className="px-4 py-4">
                        <p className="text-lg font-black text-slate-950">{word.word}</p>
                        {word.feedback ? (
                          <p className="mt-2 text-xs font-bold text-violet-700">{word.feedback}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-sm font-bold leading-6 text-slate-700">
                        {word.translation}
                      </td>
                      <td className="max-w-sm px-4 py-4 text-sm font-semibold leading-6 text-slate-600">
                        {word.example || t('admin.words.card.noExample')}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusClass(word.status)}`}>
                          {statusLabel(word.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <LevelSelect
                          level={word.level}
                          onChange={(level) => setWordLevel(word.id, level)}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <WordActions
                          isBusy={isBusy}
                          onApprove={() => approveWord(word)}
                          onReject={() => rejectWord(word)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!loading && filteredWords.length === 0 ? (
              <div className="bg-white p-8 text-center text-sm font-bold text-slate-500">
                {t('admin.words.noWordsToDisplay')}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

export default Words;

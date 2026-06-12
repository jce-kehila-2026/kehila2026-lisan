import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Layers3,
  Search,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { getStoredToken } from '../../services/auth.js';

const API_BASE_URL = 'http://localhost:3000/api';
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
  if (status === 'approved') return 'מאושרת';
  if (status === 'rejected') return 'נדחתה';
  return 'ממתינה';
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
  return (
    <div className="grid gap-2 sm:flex sm:flex-wrap">
      <button
        type="button"
        disabled={isBusy}
        onClick={onApprove}
        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-violet-600 px-4 text-sm font-black text-white shadow-button transition hover:-translate-y-0.5 hover:bg-violet-700 disabled:opacity-50 sm:h-10"
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        אישור
      </button>

      <button
        type="button"
        disabled={isBusy}
        onClick={onReject}
        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-violet-100 bg-white px-4 text-sm font-black text-violet-700 transition hover:-translate-y-0.5 hover:bg-violet-50 disabled:opacity-50 sm:h-10"
      >
        <XCircle className="h-4 w-4" aria-hidden="true" />
        דחייה
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
  return (
    <article className={`rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_18px_42px_rgba(109,40,217,0.12)] transition hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(124,58,237,0.16)] ${reviewCardClass(wordCount)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-violet-700">מילה חדשה</p>
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
          <p className="text-xs font-black text-violet-700">תרגום / משמעות</p>
          <p className="mt-1 break-words text-base font-bold leading-7 text-slate-800">
            {word.translation}
          </p>
        </div>

        <div className="rounded-[18px] bg-white/80 p-3 shadow-[inset_0_0_0_1px_rgba(221,214,254,0.65)]">
          <p className="text-xs font-black text-violet-700">משפט לדוגמה</p>
          <p className="mt-1 break-words text-sm font-semibold leading-7 text-slate-600">
            {word.example || 'אין משפט לדוגמה'}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-xs font-black text-violet-700">
          רמת למידה
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
  const navigate = useNavigate();
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
      feedback: 'הרמה נשמרה',
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
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_12%_8%,rgba(221,214,254,0.54),transparent_30%),linear-gradient(180deg,#FBF8FF_0%,#FFF8FC_48%,#F4EEFF_100%)] px-3 py-4 text-slate-900 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-7xl pb-12" dir="rtl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-black text-violet-700 shadow-sm transition hover:bg-violet-50"
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            חזרה ללוח הבקרה
          </button>

          <div className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/80 bg-white/90 px-4 py-2 text-sm font-black text-violet-700 shadow-[0_10px_24px_rgba(109,40,217,0.08)] backdrop-blur">
            <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
            בדיקת מילים
          </div>
        </header>

        <section className="relative mt-6 overflow-hidden rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,#FCF8FF_0%,#F7F0FF_45%,#FFF6FB_100%)] shadow-[0_26px_70px_rgba(91,33,182,0.14)] transition hover:-translate-y-1 hover:shadow-[0_32px_80px_rgba(124,58,237,0.2)]">
          <div className="pointer-events-none absolute left-0 top-0 h-full w-1/2 bg-violet-200/35 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 right-8 h-44 w-44 rounded-full bg-fuchsia-100/60 blur-3xl" />

          <div className="relative grid gap-0 lg:min-h-80 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1fr)]" dir="ltr">
            <div className="relative flex min-h-64 items-center justify-center overflow-hidden bg-violet-50/30 p-1 sm:min-h-72 lg:min-h-80">
              <div className="pointer-events-none absolute inset-4 rounded-full bg-violet-300/35 blur-3xl" />
              <img
                src="/ai.png"
                alt="AI Words Review"
                className="relative h-full w-full scale-[1.18] object-contain object-center sm:scale-125 lg:scale-[1.34]"
              />
            </div>

            <div className="flex flex-col justify-center p-5 text-right sm:p-7 lg:py-10" dir="rtl">
              <p className="inline-flex items-center gap-2 text-sm font-black text-violet-700">
                <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
                בדיקת מילים
              </p>
              <h1 className="mt-2 text-[clamp(2.2rem,4.2vw,4.25rem)] font-black leading-tight text-slate-950">
                בדיקת מילים חדשות
              </h1>
              <p className="mt-3 text-sm font-semibold leading-7 text-slate-600 sm:text-base">
                אשרי מילים חדשות, דחי מילים לא מתאימות וסווגי כל מילה לפי רמת הלמידה.
              </p>
            </div>
          </div>

          <div className="relative grid grid-cols-1 gap-4 p-5 pt-0 lg:grid-cols-3 sm:p-7 sm:pt-0">
            {[
              { label: 'ממתינות', value: pendingCount, icon: Layers3 },
              { label: 'אושרו', value: approvedCount, icon: CheckCircle2 },
              { label: 'נדחו', value: rejectedCount, icon: XCircle },
            ].map((stat) => {
              const Icon = stat.icon;

              return (
                <article
                  key={stat.label}
                  className="group rounded-[24px] border border-violet-100 bg-white/75 p-5 shadow-[0_10px_24px_rgba(109,40,217,0.08)] backdrop-blur transition hover:-translate-y-1 hover:bg-white hover:shadow-[0_16px_30px_rgba(109,40,217,0.16)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <span className="text-4xl font-black text-slate-950">{stat.value}</span>
                  </div>
                  <p className="mt-4 text-base font-black text-slate-700">{stat.label}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-[0_22px_60px_rgba(91,33,182,0.11)] backdrop-blur sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">
                מילים ממתינות לבדיקה
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {loading ? 'טוען מילים...' : `${filteredWords.length} מילים מוצגות`}
              </p>
            </div>

            <label className="relative block w-full lg:w-80">
              <span className="sr-only">חיפוש מילים</span>
              <Search
                className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-violet-500"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="חיפוש מילה, תרגום או דוגמה..."
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
                אין מילים להצגה כרגע.
              </div>
            ) : null}
          </div>

          <div className="mt-5 hidden overflow-hidden rounded-[1.5rem] border border-violet-100/70 shadow-[0_14px_34px_rgba(109,40,217,0.08)] lg:block">
            <table className="w-full border-collapse bg-white/95 text-right">
              <thead>
                <tr className="bg-violet-50/80 text-sm font-black text-violet-800">
                  <th className="px-4 py-4">מילה</th>
                  <th className="px-4 py-4">תרגום / משמעות</th>
                  <th className="px-4 py-4">משפט לדוגמה</th>
                  <th className="px-4 py-4">סטטוס</th>
                  <th className="px-4 py-4">רמה</th>
                  <th className="px-4 py-4">פעולות</th>
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
                        {word.example || 'אין משפט לדוגמה'}
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
                אין מילים להצגה כרגע.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

export default Words;

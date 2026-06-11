import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpenCheck,
  CheckCircle2,
  ChevronLeft,
  Layers3,
  Save,
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
        setWords((data.words || []).map(normalizeWord));
        setUsingMockData(false);
      } catch (loadError) {
        // TODO: Remove mock fallback after the deployed backend/admin token flow is fully ready for demos.
        setWords(mockPendingWords.map(normalizeWord));
        setUsingMockData(true);
        setError(loadError.message || 'לא ניתן לטעון מילים מהשרת כרגע.');
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
      feedback: 'הרמה נשמרה מקומית לדמו',
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

      updateWord(word.id, (currentWord) => ({
        ...currentWord,
        status: 'approved',
        savedLevel: currentWord.level,
        feedback: 'המילה אושרה',
      }));
    } catch (approveError) {
      updateWord(word.id, (currentWord) => ({
        ...currentWord,
        feedback: approveError.message || 'האישור נכשל',
      }));
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

      updateWord(word.id, (currentWord) => ({
        ...currentWord,
        status: 'rejected',
        feedback: 'המילה נדחתה',
      }));
    } catch (rejectError) {
      updateWord(word.id, (currentWord) => ({
        ...currentWord,
        feedback: rejectError.message || 'הדחייה נכשלה',
      }));
    } finally {
      setBusyWordId('');
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-3 py-4 text-slate-900 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-7xl" dir="rtl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-black text-violet-700 shadow-sm transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            חזרה ללוח ניהול
          </button>

          <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-black text-violet-700 shadow-sm">
            <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
            בדיקת מילים
          </div>
        </header>

        <section className="mt-6 overflow-hidden rounded-[2rem] border border-white/70 bg-white/95 p-5 shadow-card sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-4xl">
              <p className="text-sm font-black text-violet-700">
                תור בדיקה
              </p>
              <h1 className="mt-2 text-2xl font-black leading-tight text-slate-950 sm:text-4xl">
                בדיקת מילים חדשות
              </h1>
              <p className="mt-3 text-sm font-semibold leading-7 text-slate-600 sm:text-base">
                אשרי מילים חדשות, דחי מילים לא מתאימות וסווגי כל מילה לפי רמת הלמידה.
              </p>
            </div>

            <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-right">
              <p className="text-xs font-black text-violet-700">מקור נתונים</p>
              <p className="mt-1 text-sm font-bold text-slate-700">
                {usingMockData ? 'נתוני דמו מקומיים' : 'מחובר לשרת'}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { label: 'ממתינות', value: pendingCount, icon: Layers3 },
              { label: 'אושרו', value: approvedCount, icon: CheckCircle2 },
              { label: 'נדחו', value: rejectedCount, icon: XCircle },
            ].map((stat) => {
              const Icon = stat.icon;

              return (
                <article
                  key={stat.label}
                  className="rounded-[1.5rem] border border-violet-100/70 bg-white p-4 shadow-card"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="text-3xl font-black text-slate-950">{stat.value}</span>
                  </div>
                  <p className="mt-3 text-sm font-black text-slate-700">{stat.label}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-white/70 bg-white/95 p-4 shadow-card sm:p-6">
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
              לא ניתן היה לטעון מהשרת, לכן מוצגים נתוני דמו. פרטים: {error}
            </div>
          ) : null}

          <div className="mt-5 overflow-x-auto rounded-[1.5rem] border border-violet-100/70">
            <table className="w-full min-w-[980px] border-collapse bg-white text-right">
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
                        <select
                          value={word.level}
                          onChange={(event) => setWordLevel(word.id, event.target.value)}
                          className="h-11 rounded-full border border-violet-100 bg-violet-50/80 px-4 text-sm font-black text-violet-800 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                        >
                          {LEVELS.map((level) => (
                            <option key={level} value={level}>
                              {level}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => approveWord(word)}
                            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-violet-600 px-4 text-sm font-black text-white shadow-button transition hover:bg-violet-700 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                            אישור
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => rejectWord(word)}
                            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-violet-100 bg-white px-4 text-sm font-black text-violet-700 transition hover:bg-violet-50 disabled:opacity-50"
                          >
                            <XCircle className="h-4 w-4" aria-hidden="true" />
                            דחייה
                          </button>

                          <button
                            type="button"
                            onClick={() => saveLevel(word.id)}
                            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-violet-100 bg-violet-50 px-4 text-sm font-black text-violet-700 transition hover:bg-violet-100"
                          >
                            <Save className="h-4 w-4" aria-hidden="true" />
                            שמירת רמה
                          </button>
                        </div>
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

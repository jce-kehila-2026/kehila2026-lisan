import React, { useEffect, useState, useCallback } from 'react';
import { Star, Check, X, MessageCircle } from 'lucide-react';
import PageHeader from '../../components/PageHeader.jsx';
import BottomNav from '../../components/BottomNav.jsx';
import { getStoredToken } from '../../services/auth.js';

const API_BASE_URL = 'http://localhost:3000/api';

const STATUS_TABS = [
  { key: 'pending', label: 'ממתינות' },
  { key: 'confirmed', label: 'אושרו' },
  { key: 'rejected', label: 'נדחו' },
  { key: 'all', label: 'הכול' },
];

function Stars({ value }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className="h-4 w-4" fill={n <= value ? '#f59e0b' : 'none'} stroke={n <= value ? '#f59e0b' : '#cbd5e1'} aria-hidden="true" />
      ))}
    </span>
  );
}

function TeacherReviews() {
  const [status, setStatus] = useState('pending');
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/teacher/reviews?status=${status}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.reviews)) setReviews(data.reviews);
      else setReviews([]);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const setReviewStatus = async (id, newStatus) => {
    setBusyId(id);
    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/teacher/reviews/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        // if we're viewing a filtered list, drop the card; otherwise update it
        setReviews((cur) =>
          status === 'all'
            ? cur.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
            : cur.filter((r) => r.id !== id)
        );
      }
    } catch { /* ignore */ }
    finally { setBusyId(null); }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_12%_8%,rgba(221,214,254,0.54),transparent_30%),linear-gradient(180deg,#FBF8FF_0%,#FFF8FC_48%,#F4EEFF_100%)] text-slate-900">
      <div className="app-page-container relative" dir="rtl">
        <PageHeader showLogout />

        <section className="mt-6 rounded-[28px] border border-white/80 bg-white p-6 shadow-card sm:p-7">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <MessageCircle className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-black text-slate-950">משובי שיחות</h1>
              <p className="mt-1 text-sm font-bold text-slate-500">דירוגי התלמידים על השיחות — אשרו או דחו</p>
            </div>
          </div>

          <div className="mt-5 inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
            {STATUS_TABS.map((tab) => (
              <button key={tab.key} type="button" onClick={() => setStatus(tab.key)} className={`rounded-full px-4 py-2 text-sm font-bold transition ${status === tab.key ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-5 grid gap-4">
          {loading ? (
            <div className="rounded-[22px] border border-white/80 bg-white p-6 text-center text-sm font-bold text-slate-500 shadow-card">טוען...</div>
          ) : reviews.length === 0 ? (
            <div className="rounded-[22px] border border-white/80 bg-white p-6 text-center text-sm font-bold text-slate-500 shadow-card">אין משובים להצגה</div>
          ) : (
            reviews.map((r) => (
              <article key={r.id} className="rounded-[22px] border border-white/80 bg-white p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Stars value={r.rating} />
                      <span className="text-sm font-black text-slate-700">{r.rating}/5</span>
                    </div>
                    <p className="mt-2 text-base font-black text-slate-900">{r.studentName || 'תלמיד/ה'}</p>
                    {r.scenario ? (
                      <span className="mt-1 inline-block rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">פעילות: {r.scenario}</span>
                    ) : (
                      <span className="mt-1 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">צ'אט חופשי</span>
                    )}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${r.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : r.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                    {r.status === 'confirmed' ? 'אושר' : r.status === 'rejected' ? 'נדחה' : 'ממתין'}
                  </span>
                </div>

                {r.comment ? <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-right text-sm font-bold text-slate-700">{r.comment}</p> : null}

                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" disabled={busyId === r.id} onClick={() => setReviewStatus(r.id, 'confirmed')} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                    <Check className="h-4 w-4" aria-hidden="true" />אשר
                  </button>
                  <button type="button" disabled={busyId === r.id} onClick={() => setReviewStatus(r.id, 'rejected')} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-red-600 shadow-sm transition hover:bg-red-50 disabled:opacity-40">
                    <X className="h-4 w-4" aria-hidden="true" />דחה
                  </button>
                </div>
              </article>
            ))
          )}
        </section>

        <BottomNav />
      </div>
    </main>
  );
}

export default TeacherReviews;

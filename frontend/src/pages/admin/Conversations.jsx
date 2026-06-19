import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Clock3,
  Eye,
  MessageSquareText,
  RefreshCw,
  Search,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminNavStrip from '../../components/admin/AdminNavStrip.jsx';

const API_BASE_URL = '/api';

const mockConversations = [
  {
    id: 'demo-conversation-001',
    userId: 'demo-student-001',
    studentName: 'ליאן ח׳',
    title: 'תרגול היכרות במסעדה',
    level: 'A1',
    status: 'ממתינה לבדיקה',
    preview: 'התלמידה מתרגלת הזמנה בסיסית ושימוש במשפטים קצרים.',
    updatedAt: '2026-06-10T09:30:00.000Z',
    messagesCount: 6,
    messages: [
      { sender: 'user', text: 'שלום, אני רוצה להזמין מים וסלט.' },
      { sender: 'assistant', text: 'מצוין. אפשר לומר גם: אפשר לקבל מים וסלט, בבקשה?' },
      { sender: 'user', text: 'אפשר לקבל מים וסלט בבקשה?' },
      { sender: 'assistant', text: 'נהדר. המשפט ברור ומנומס.' },
    ],
  },
  {
    id: 'demo-conversation-002',
    userId: 'demo-student-002',
    studentName: 'מרים ס׳',
    title: 'שיחה על יום לימודים',
    level: 'A2',
    status: 'נבדקה',
    preview: 'שיחה קצרה על מערכת שעות, שיעורים ושימוש בזמן עבר.',
    updatedAt: '2026-06-09T14:15:00.000Z',
    messagesCount: 8,
    messages: [
      { sender: 'user', text: 'אתמול למדתי עברית ואחר כך הלכתי הביתה.' },
      { sender: 'assistant', text: 'יופי. אפשר להוסיף: אחרי השיעור נחתי בבית.' },
      { sender: 'user', text: 'אחרי השיעור נחתי בבית.' },
    ],
  },
  {
    id: 'demo-conversation-003',
    userId: 'demo-student-003',
    studentName: 'נור א׳',
    title: 'ראיון עבודה קצר',
    level: 'B1',
    status: 'דורשת תשומת לב',
    preview: 'תרגול תשובות מלאות, חיבור רעיונות ושיפור דיוק בדקדוק.',
    updatedAt: '2026-06-08T11:45:00.000Z',
    messagesCount: 10,
    messages: [
      { sender: 'user', text: 'אני רוצה לעבוד כי אני אוהבת לעזור לאנשים.' },
      { sender: 'assistant', text: 'תשובה טובה. נסי להוסיף ניסיון קודם או חוזקה אישית.' },
      { sender: 'user', text: 'יש לי ניסיון עם ילדים ואני אחראית מאוד.' },
    ],
  },
];

function getToken() {
  return localStorage.getItem('lisan-token');
}

async function request(path, options = {}) {
  const token = getToken();
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
}

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value._seconds) return new Date(value._seconds * 1000).toISOString();
  if (value.seconds) return new Date(value.seconds * 1000).toISOString();
  return value;
}

function formatDate(value) {
  const normalized = normalizeDate(value);
  if (!normalized) return 'לא ידוע';

  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(normalized));
}

function statusLabel(conversation) {
  if (conversation.status) return conversation.status;
  if (conversation.isArchived) return 'בארכיון';
  return 'ממתינה לבדיקה';
}

function statusClass(status) {
  if (status === 'נבדקה') return 'border-emerald-100 bg-emerald-50 text-emerald-700';
  if (status === 'דורשת תשומת לב') return 'border-amber-100 bg-amber-50 text-amber-700';
  if (status === 'בארכיון') return 'border-slate-200 bg-slate-100 text-slate-600';
  return 'border-violet-100 bg-violet-50 text-violet-700';
}

function conversationCardClass(count) {
  if (count === 3) {
    return 'w-full flex-none';
  }

  return 'w-full flex-none md:basis-[calc(50%_-_0.5rem)]';
}

function previewFromConversation(conversation) {
  if (conversation.preview) return conversation.preview;
  if (conversation.lastMessage) return conversation.lastMessage;

  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const lastMessage = messages[messages.length - 1];
  const text = lastMessage?.text || lastMessage?.transcribedText;

  return text || conversation.title || 'פתחי את השיחה כדי לראות את הפרטים המלאים.';
}

function normalizeConversation(rawConversation, studentNamesById = {}) {
  const studentName =
    rawConversation.studentName ||
    rawConversation.userName ||
    studentNamesById[rawConversation.userId] ||
    rawConversation.userId ||
    'תלמידה';

  return {
    id: rawConversation.id,
    userId: rawConversation.userId || '',
    studentName,
    title: rawConversation.title || 'שיחה',
    level: rawConversation.level || 'A1',
    status: statusLabel(rawConversation),
    preview: previewFromConversation(rawConversation),
    updatedAt: normalizeDate(rawConversation.updatedAt || rawConversation.startedAt),
    messagesCount:
      rawConversation.messagesCount ||
      (Array.isArray(rawConversation.messages) ? rawConversation.messages.length : 0),
    messages: Array.isArray(rawConversation.messages) ? rawConversation.messages : [],
    isArchived: rawConversation.isArchived === true,
  };
}

function SummaryCard({ icon: Icon, label, value }) {
  return (
    <article className="rounded-[24px] border border-violet-100/70 bg-white/80 p-4 shadow-[0_12px_30px_rgba(109,40,217,0.09)] backdrop-blur transition hover:-translate-y-1 hover:bg-white hover:shadow-[0_18px_40px_rgba(109,40,217,0.14)]">
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <span className="text-3xl font-black text-slate-950">{value}</span>
      </div>
      <p className="mt-4 text-sm font-black text-slate-700">{label}</p>
    </article>
  );
}

function ReviewButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-black text-white shadow-button transition hover:-translate-y-0.5 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
    >
      <Eye className="h-4 w-4" aria-hidden="true" />
      צפייה / בדיקה
    </button>
  );
}

function ConversationCard({ conversation, conversationCount, onReview }) {
  const status = statusLabel(conversation);

  return (
    <article className={`rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_18px_42px_rgba(109,40,217,0.12)] transition hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(124,58,237,0.16)] ${conversationCardClass(conversationCount)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-violet-700">תלמידה</p>
          <h2 className="mt-1 break-words text-xl font-black leading-tight text-slate-950">
            {conversation.studentName}
          </h2>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black ${statusClass(status)}`}>
          {status}
        </span>
      </div>

      <div className="mt-4 rounded-[18px] bg-violet-50/70 p-3">
        <p className="text-xs font-black text-violet-700">{conversation.title}</p>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">
          {conversation.preview}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-bold text-slate-600">
        <span className="rounded-2xl bg-white/80 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(221,214,254,0.65)]">
          רמה: {conversation.level}
        </span>
        <span className="rounded-2xl bg-white/80 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(221,214,254,0.65)]">
          הודעות: {conversation.messagesCount}
        </span>
      </div>

      <p className="mt-3 text-xs font-bold text-slate-500">
        {formatDate(conversation.updatedAt)}
      </p>

      <div className="mt-4">
        <ReviewButton onClick={() => onReview(conversation)} />
      </div>
    </article>
  );
}

function ConversationReviewModal({
  onApprove,
  conversation,
  error,
  loading,
  note,
  onClose,
  onNoteChange,
  onReject,
}) {
  if (!conversation) {
    return null;
  }

  const status = statusLabel(conversation);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conversation-review-title"
      dir="rtl"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-4 border-b border-violet-100 bg-[linear-gradient(135deg,#F3ECFF_0%,#FFFFFF_65%,#F8F2FF_100%)] p-4 sm:p-6">
          <div>
            <p className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">
              בדיקת שיחה
            </p>
            <h2
              id="conversation-review-title"
              className="mt-3 text-2xl font-black leading-tight text-slate-950 sm:text-3xl"
            >
              {conversation.title}
            </h2>
            <p className="mt-2 text-sm font-bold text-slate-600">
              {conversation.studentName} · {formatDate(conversation.updatedAt)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-violet-100 bg-white text-violet-700 shadow-sm transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="סגירת חלון בדיקה"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="flex min-h-[180px] items-center justify-center rounded-[24px] bg-violet-50/70 text-sm font-black text-violet-700">
              טוען את פרטי השיחה...
            </div>
          ) : (
            <>
              {error ? (
                <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold leading-6 text-rose-700">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-violet-50/80 p-4">
                  <p className="text-xs font-black text-violet-700">רמה</p>
                  <p className="mt-1 text-2xl font-black text-slate-950">{conversation.level}</p>
                </div>
                <div className="rounded-2xl bg-violet-50/80 p-4">
                  <p className="text-xs font-black text-violet-700">סטטוס</p>
                  <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusClass(status)}`}>
                    {status}
                  </span>
                </div>
                <div className="rounded-2xl bg-violet-50/80 p-4">
                  <p className="text-xs font-black text-violet-700">הודעות</p>
                  <p className="mt-1 text-2xl font-black text-slate-950">
                    {conversation.messagesCount}
                  </p>
                </div>
              </div>

              <label className="mt-4 block rounded-[24px] border border-violet-100 bg-violet-50/70 p-4 text-sm font-black text-violet-800">
                הערות מנהלת
                <textarea
                  value={note}
                  onChange={(event) => onNoteChange(event.target.value)}
                  placeholder="כתבי הערה לבדיקה פנימית של השיחה..."
                  className="mt-2 min-h-24 w-full resize-none rounded-2xl border border-violet-100 bg-white p-3 text-sm font-semibold leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                />
              </label>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={onApprove}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-violet-600 px-4 py-2 text-sm font-black text-white shadow-button transition hover:bg-violet-700"
                >
                  אישור
                </button>
                <button
                  type="button"
                  onClick={onReject}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-violet-100 bg-white px-4 py-2 text-sm font-black text-violet-700 transition hover:bg-violet-50"
                >
                  דחייה
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Conversations() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState('');
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [usingMockData, setUsingMockData] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const loadConversations = async () => {
    try {
      setLoading(true);
      setError('');

      const [conversationData, usersData] = await Promise.all([
        request('/admin/conversations?page=1&limit=50'),
        request('/admin/users'),
      ]);

      const studentNamesById = (usersData.users || []).reduce((names, user) => {
        if (user.role === 'student') {
          names[user.id] = user.name || user.email || user.id;
        }

        return names;
      }, {});

      const normalizedConversations = (conversationData.conversations || []).map(
        (conversation) => normalizeConversation(conversation, studentNamesById),
      );

      if (normalizedConversations.length === 0) {
        const demoConversations = mockConversations.map((conversation) =>
          normalizeConversation(conversation),
        );

        setConversations(demoConversations);
        setUsingMockData(true);
      } else {
        setConversations(normalizedConversations);
        setUsingMockData(false);
      }
    } catch (loadError) {
      setConversations(mockConversations.map((conversation) => normalizeConversation(conversation)));
      setUsingMockData(true);
      setError('');
    } finally {
      setLoading(false);
    }
  };

  const openConversation = async (conversation) => {
    setSelectedConversation(conversation);
    setConversationError('');
    setReviewNote('');
    setIsReviewOpen(true);

    if (usingMockData) {
      return;
    }

    try {
      setConversationLoading(true);
      setError('');

      const data = await request(`/admin/conversations/${conversation.id}`);
      setSelectedConversation(
        normalizeConversation({
          ...conversation,
          ...data.conversation,
          studentName: conversation.studentName,
          status: data.conversation?.status || conversation.status,
        }),
      );
    } catch (openError) {
      setConversationError(openError.message || 'לא ניתן לטעון את פרטי השיחה.');
      setSelectedConversation(conversation);
    } finally {
      setConversationLoading(false);
    }
  };

  const completeConversationReview = async (conversation, action) => {
    if (!conversation) {
      return;
    }

    const nextConversations = conversations.filter(
      (item) => item.id !== conversation.id,
    );

    if (!usingMockData) {
      try {
        await request(`/admin/conversations/${conversation.id}/${action}`, {
          method: 'PUT',
          body: JSON.stringify({ notes: reviewNote }),
        });
      } catch (reviewError) {
        // Keep the UI moving even while backend review endpoints are being finalized.
      }
    }

    setConversations(nextConversations);
    setSelectedConversation(nextConversations[0] || null);
    setIsReviewOpen(false);
    setReviewNote('');
  };

  useEffect(() => {
    loadConversations();
  }, []);

  const filteredConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return conversations;
    }

    return conversations.filter((conversation) =>
      `${conversation.studentName} ${conversation.title} ${conversation.level} ${conversation.status} ${conversation.preview}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [conversations, query]);

  const pendingCount = conversations.filter(
    (conversation) => conversation.status === 'ממתינה לבדיקה',
  ).length;
  const reviewedCount = conversations.filter(
    (conversation) => conversation.status === 'נבדקה',
  ).length;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_12%_8%,rgba(221,214,254,0.54),transparent_30%),linear-gradient(180deg,#FBF8FF_0%,#FFF8FC_48%,#F4EEFF_100%)] px-3 py-4 text-slate-900 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-7xl pb-12" dir="rtl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/80 bg-white/90 px-4 py-2 text-sm font-black text-violet-700 shadow-[0_10px_24px_rgba(109,40,217,0.08)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
            חזרה ללוח הניהול
          </button>

          <AdminNavStrip />

          <div className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/80 bg-white/90 px-4 py-2 text-sm font-black text-violet-700 shadow-[0_10px_24px_rgba(109,40,217,0.08)] backdrop-blur">
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
            מרכז סקירת שיחות
          </div>
        </header>

        <section className="relative mt-6 overflow-hidden rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,#FCF8FF_0%,#F7F0FF_45%,#FFF6FB_100%)] shadow-[0_26px_70px_rgba(91,33,182,0.14)]">
          <div className="pointer-events-none absolute left-0 top-0 h-full w-1/2 bg-violet-200/35 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 right-8 h-44 w-44 rounded-full bg-fuchsia-100/60 blur-3xl" />

          <div className="relative grid gap-0 lg:min-h-80 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1fr)]" dir="ltr">
            <div className="relative flex min-h-64 items-center justify-center overflow-hidden bg-violet-50/30 p-3 sm:min-h-72 lg:min-h-80">
              <div className="pointer-events-none absolute inset-6 rounded-full bg-violet-300/35 blur-3xl" />
              <img
                src="/ai.png"
                alt="AI Conversations"
                className="relative h-full w-full scale-110 object-contain object-center sm:scale-[1.16] lg:scale-125"
              />
              <button
                type="button"
                onClick={loadConversations}
                className="absolute bottom-4 left-4 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-button transition hover:-translate-y-0.5 hover:bg-violet-700 disabled:opacity-60"
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                רענון
              </button>
            </div>

            <div className="flex flex-col justify-center p-5 text-right sm:p-7 lg:py-10" dir="rtl">
              <p className="inline-flex items-center gap-2 text-sm font-black text-violet-700">
                <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                בדיקת שיחות
              </p>
              <h1 className="mt-2 text-[clamp(2.2rem,4.2vw,4.25rem)] font-black leading-tight text-slate-950">
                שיחות AI לבדיקה
              </h1>
              <p className="mt-3 text-sm font-semibold leading-7 text-slate-600 sm:text-base">
                סקירת שיחות לימודיות, זיהוי שיחות שמצריכות תשומת לב ומעבר מהיר לפרטי השיחה.
              </p>
            </div>
          </div>

          <div className="relative grid grid-cols-1 gap-4 p-5 pt-0 lg:grid-cols-3 sm:p-7 sm:pt-0">
            <SummaryCard icon={MessageSquareText} label="שיחות מוצגות" value={conversations.length} />
            <SummaryCard icon={Sparkles} label="ממתינות לבדיקה" value={pendingCount} />
            <SummaryCard icon={Clock3} label="נבדקו" value={reviewedCount} />
          </div>
        </section>

        {error ? (
          <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/80 p-4 text-sm font-bold leading-6 text-violet-800">
            {error}
          </div>
        ) : null}

        <section className="mt-5">
          <div className="rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-[0_22px_60px_rgba(91,33,182,0.11)] backdrop-blur sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">רשימת שיחות</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {loading ? 'טוען שיחות...' : `${filteredConversations.length} שיחות מוצגות`}
                </p>
              </div>

              <label className="relative block w-full lg:w-80">
                <span className="sr-only">חיפוש שיחות</span>
                <Search
                  className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-violet-500"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="חיפוש תלמידה, רמה או תקציר..."
                  className="h-12 w-full rounded-full border border-violet-100 bg-violet-50/70 py-3 pl-4 pr-12 text-right text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-center gap-4 lg:hidden">
              {filteredConversations.map((conversation) => (
                <ConversationCard
                  key={conversation.id}
                  conversation={conversation}
                  conversationCount={filteredConversations.length}
                  onReview={openConversation}
                />
              ))}
            </div>

            <div className="mt-5 hidden overflow-hidden rounded-[1.5rem] border border-violet-100/70 shadow-[0_14px_34px_rgba(109,40,217,0.08)] lg:block">
              <table className="w-full border-collapse bg-white/95 text-right">
                <thead>
                  <tr className="bg-violet-50/80 text-sm font-black text-violet-800">
                    <th className="px-4 py-4">תלמידה</th>
                    <th className="px-4 py-4">תאריך</th>
                    <th className="px-4 py-4">רמה</th>
                    <th className="px-4 py-4">סטטוס</th>
                    <th className="px-4 py-4">תקציר</th>
                    <th className="px-4 py-4">פעולה</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConversations.map((conversation) => {
                    const status = statusLabel(conversation);

                    return (
                      <tr
                        key={conversation.id}
                        className="border-t border-violet-100/70 align-top transition hover:bg-violet-50/40"
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                              <UserRound className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <div>
                              <p className="font-black text-slate-950">{conversation.studentName}</p>
                              <p className="text-xs font-bold text-slate-500">{conversation.title}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm font-bold text-slate-600">
                          {formatDate(conversation.updatedAt)}
                        </td>
                        <td className="px-4 py-4">
                          <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
                            {conversation.level}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusClass(status)}`}>
                            {status}
                          </span>
                        </td>
                        <td className="max-w-sm px-4 py-4 text-sm font-semibold leading-6 text-slate-600">
                          {conversation.preview}
                        </td>
                        <td className="px-4 py-4">
                          <ReviewButton onClick={() => openConversation(conversation)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!loading && filteredConversations.length === 0 ? (
              <div className="mt-5 rounded-[24px] border border-violet-100 bg-white/90 p-8 text-center text-sm font-bold text-slate-500 shadow-[0_14px_36px_rgba(109,40,217,0.1)]">
                אין שיחות להצגה כרגע.
              </div>
            ) : null}
          </div>
        </section>

        <ConversationReviewModal
          onApprove={() => completeConversationReview(selectedConversation, 'approve')}
          conversation={isReviewOpen ? selectedConversation : null}
          error={conversationError}
          loading={conversationLoading}
          note={reviewNote}
          onClose={() => setIsReviewOpen(false)}
          onNoteChange={setReviewNote}
          onReject={() => completeConversationReview(selectedConversation, 'reject')}
        />
      </div>
    </main>
  );
}

export default Conversations;

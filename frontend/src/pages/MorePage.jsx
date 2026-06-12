import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Heart,
  Headphones,
  MessageCircle,
  PenLine,
  Search,
  Settings,
  Share2,
  Star,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import BottomNav from '../components/BottomNav.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { getStoredToken } from '../services/auth.js';

const API_BASE_URL = 'http://localhost:3000/api';

const labels = {
  he: {
    title: 'היסטוריה',
    subtitle: 'היסטוריית שיחות, מילים שמורות וקיצורים שימושיים',
    chatHistory: 'היסטוריית שיחות',
    search: 'חיפוש שיחות',
    continueChat: 'המשך שיחה',
    favorite: 'מועדף',
    delete: 'מחיקה',
    share: 'שיתוף',
    copied: 'הועתק',
    savedTitle: 'מילים שמורות',
    friendsChat: 'שיחה עם חברות',
    friendsChatText: 'בחירת חברות לתרגול משותף',
    teacherChat: 'שיחה עם המורה',
    teacherChatText: 'פתיחת שיחה עם המורה',
    teacherChatStarted: 'פותח שיחה עם המורה...',
    settings: 'קיצור להגדרות',
    settingsText: 'שפה, תצוגה, גודל טקסט והעדפות אישיות.',
    noChats: 'אין שיחות עדיין',
    heroKicker: 'ריכוז משאבים',
    continueReading: 'המשיכי מאיפה שהפסקת',
    continueReadingMeta: 'לפני יומיים · סיפור 5',
    continueReadingAction: 'המשיכי קריאה',
    recentActivity: 'הפעילות האחרונה שלי',
    recentActivityHint: 'חזרי למה שעשית לאחרונה',
    viewFullHistory: 'היסטוריה',
    review: 'חזרה',
    inProgress: 'בתהליך',
    completed: 'הושלם',
    savedMore: 'היסטוריה',
    socialPractice: 'תרגול עם חברות',
    socialPracticeText: 'תרגלי שיחות יומיומיות בעברית עם חברות ולומדות נוספות.',
    startChat: 'פתחי צ׳אט',
    pronunciation: 'תרגול האזנה',
    shortQuiz: 'בוחן קצר',
  },

  ar: {
    title: 'السجل',
    subtitle: 'سجل المحادثات، كلمات محفوظة واختصارات مفيدة',
    chatHistory: 'سجل المحادثات',
    search: 'بحث في المحادثات',
    continueChat: 'متابعة المحادثة',
    favorite: 'مفضلة',
    delete: 'حذف',
    share: 'مشاركة',
    copied: 'تم النسخ',
    savedTitle: 'كلمات محفوظة',
    friendsChat: 'محادثة مع الصديقات',
    friendsChatText: 'اختيار صديقات للتدريب المشترك',
    teacherChat: 'محادثة مع المعلمة',
    teacherChatText: 'فتح محادثة مع المعلمة',
    teacherChatStarted: 'جارٍ فتح المحادثة مع المعلمة...',
    settings: 'اختصار للإعدادات',
    settingsText: 'اللغة، العرض، حجم النص والتفضيلات.',
    noChats: 'لا توجد محادثات بعد',
    heroKicker: 'مركز الموارد',
    continueReading: 'تابعي من حيث توقفتِ',
    continueReadingMeta: 'قبل يومين · قصة 5',
    continueReadingAction: 'تابعي القراءة',
    recentActivity: 'نشاطي الأخير',
    recentActivityHint: 'عودي إلى ما تدربتِ عليه مؤخراً',
    viewFullHistory: 'السجل',
    review: 'مراجعة',
    inProgress: 'قيد التقدم',
    completed: 'مكتمل',
    savedMore: 'السجل',
    socialPractice: 'تدريب مع الصديقات',
    socialPracticeText: 'تدرّبي على محادثات يومية بالعبرية مع صديقات ومتعلمات أخريات.',
    startChat: 'افتحي المحادثة',
    pronunciation: 'تدريب الاستماع',
    shortQuiz: 'اختبار قصير',
  },
};

const savedWords = [
  'שלום',
  'תודה',
  'סליחה',
  'כמה זה עולה?',
  'אני צריכה עזרה',
  'בית ספר',
  'חברה',
  'מים',
  'בוקר טוב',
  'להתראות',
];

function MorePage() {
  const { i18n } = useTranslation();

  const text = labels[i18n.language === 'he' ? 'he' : 'ar'];

  const [query, setQuery] = useState('');
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shareStatus, setShareStatus] = useState('');
  const [showRecentActivities, setShowRecentActivities] = useState(true);
  const [showChatHistory, setShowChatHistory] = useState(true);

  useEffect(() => {
    const loadChats = async () => {
      try {
        const token = getStoredToken();

        if (!token) {
          setLoading(false);
          return;
        }

        const response = await fetch(`${API_BASE_URL}/chats/my`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load chats');
        }

        const formattedChats = (data.chats || []).map((chat) => ({
          id: chat.id,
          title: chat.title || 'New Chat',
          preview: chat.messages?.[0]?.text || 'No messages yet',
          time: new Date(
            chat.updatedAt?._seconds
              ? chat.updatedAt._seconds * 1000
              : Date.now(),
          ).toLocaleString(),
          favorite: false,
        }));

        setConversations(formattedChats);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadChats();
  }, []);

  const filteredConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return conversations;
    }

    return conversations.filter((conversation) =>
      `${conversation.title} ${conversation.preview}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [conversations, query]);

  const toggleFavorite = (id) => {
    setConversations((currentConversations) =>
      currentConversations.map((conversation) =>
        conversation.id === id
          ? {
              ...conversation,
              favorite: !conversation.favorite,
            }
          : conversation,
      ),
    );
  };

  const deleteConversation = async (id) => {
    try {
      const token = getStoredToken();

      const response = await fetch(`${API_BASE_URL}/chats/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete chat');
      }

      setConversations((currentConversations) =>
        currentConversations.filter((conversation) => conversation.id !== id),
      );
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  };

  const shareConversation = async (conversation) => {
    const shareText = `Lisan - ${conversation.title}: ${conversation.preview}`;

    if (navigator.share) {
      try {
        await navigator.share({
          text: shareText,
          title: 'Lisan',
        });

        setShareStatus(text.share);
        return;
      } catch {
        setShareStatus('');
      }
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setShareStatus(text.copied);
    } catch {
      setShareStatus(shareText);
    }
  };

  const recentActivities = [
    { icon: MessageCircle, title: text.friendsChat, meta: `Yesterday · ${text.completed}`, action: text.continueChat },
    { icon: BookOpen, title: 'סיפור 5', meta: `3 days ago · ${text.inProgress}`, action: text.continueChat },
    { icon: Headphones, title: text.pronunciation, meta: `Last week · ${text.completed}`, action: text.review },
    { icon: PenLine, title: text.shortQuiz, meta: text.completed, action: text.review },
  ];

  const fallbackHistory = recentActivities.map((activity, index) => ({
    id: `fallback-${index}`,
    title: activity.title,
    preview: activity.meta,
    time: index === 0 ? 'Yesterday' : index === 1 ? '3 days ago' : 'Last week',
    favorite: index === 0,
    fallback: true,
  }));

  const visibleHistory = (filteredConversations.length > 0 ? filteredConversations : fallbackHistory).slice(0, 5);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_12%_8%,rgba(221,214,254,0.54),transparent_30%),linear-gradient(180deg,#FBF8FF_0%,#FFF8FC_48%,#F4EEFF_100%)] text-slate-900">
      <div
        className="app-page-container relative"
        dir="rtl"
      >
        <PageHeader showBack />

        <section className="relative mt-6 overflow-hidden rounded-[28px] border border-white/80 bg-[linear-gradient(135deg,#FFFFFF_0%,#FBF8FF_50%,#F3ECFF_100%)] p-6 shadow-card sm:p-7 lg:min-h-[210px] lg:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_42%,rgba(196,181,253,0.24)_0%,transparent_34%)]" />
          <div className="pointer-events-none absolute -left-16 top-0 h-48 w-48 rounded-full bg-violet-100/60 blur-3xl" />
          <div className="relative grid min-h-[170px] items-center gap-7 md:grid-cols-[minmax(0,1fr)_360px]" dir="ltr">
            <div className="order-2 text-right md:order-1" dir="rtl">
              <span className="inline-flex rounded-full bg-violet-50 px-4 py-2 text-sm font-black text-violet-700">
                {text.heroKicker}
              </span>
              <h1 className="mt-4 text-4xl font-black leading-tight text-violet-700 lg:text-5xl">
                {text.title}
              </h1>
              <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-slate-600">
                {text.subtitle}
              </p>
            </div>

            <div className="order-1 flex min-h-[150px] items-center justify-center md:order-2" aria-hidden="true">
              <img
                src="/images/profile-hebrew-learning.png"
                alt=""
                className="h-[180px] w-full max-w-[360px] object-contain opacity-95 mix-blend-multiply [mask-image:radial-gradient(ellipse_at_center,#000_0%,#000_70%,rgba(0,0,0,0.68)_86%,transparent_100%)]"
              />
            </div>
          </div>
        </section>

        <section className="mt-5 flex min-h-[96px] flex-wrap items-center justify-between gap-5 rounded-[24px] bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-5">
            <span className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-violet-50 text-violet-700">
              <BookOpen className="h-7 w-7" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-2xl font-black text-slate-950">{text.continueReading}</h2>
              <p className="mt-1 text-base font-bold text-slate-500">{text.continueReadingMeta}</p>
            </div>
          </div>

          <Link
            to="/scenario/at-restaurant"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-violet-600 px-6 text-base font-black text-white shadow-button transition hover:-translate-y-0.5 hover:bg-violet-700"
          >
            {text.continueReadingAction}
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
        </section>

        <section className="mt-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3 text-right">
              <button
                type="button"
                onClick={() => setShowRecentActivities((current) => !current)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-violet-700 shadow-card transition hover:-translate-y-0.5 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
                aria-expanded={showRecentActivities}
                aria-label={text.recentActivity}
              >
                <ChevronDown
                  className={`h-5 w-5 transition duration-300 ${
                    showRecentActivities ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>
              <div>
                <h2 className="text-3xl font-black text-slate-950">{text.recentActivity}</h2>
                <p className="mt-1 text-base font-semibold text-slate-500">{text.recentActivityHint}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowRecentActivities((current) => !current)}
              className="text-base font-black text-violet-700"
            >
              {text.viewFullHistory}
            </button>
          </div>

          {showRecentActivities ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {recentActivities.map((item) => {
                const Icon = item.icon;
                return (
                  <article
                    key={item.title}
                    className="flex min-h-[106px] items-center justify-between gap-5 rounded-[24px] bg-white p-5 shadow-card transition hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(124,58,237,0.12)]"
                  >
                    <div className="flex min-w-0 items-center gap-5">
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-violet-50 text-violet-700">
                        <Icon className="h-7 w-7" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 text-right">
                        <h3 className="truncate text-xl font-black text-slate-900">{item.title}</h3>
                        <p className="mt-2 text-base font-bold text-slate-500">{item.meta}</p>
                      </div>
                    </div>
                    <Link
                      to="/chatbot"
                      className="shrink-0 rounded-full border border-violet-200 px-6 py-3 text-base font-black text-violet-700 transition hover:bg-violet-600 hover:text-white"
                    >
                      {item.action}
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>

        <section className="mt-6 min-h-[118px] rounded-[26px] bg-white p-6 shadow-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-3xl font-black text-slate-950">{text.savedTitle}</h2>
            <span className="text-base font-black text-violet-700">{text.savedMore}</span>
          </div>

          <div className="flex flex-wrap gap-3">
            {savedWords.map((word) => (
              <span
                key={word}
                className="rounded-full bg-violet-50 px-5 py-2.5 text-base font-black text-violet-700"
              >
                {word}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          <Link
            to="/shared-chat"
            className="group flex min-h-[150px] items-center justify-between gap-6 overflow-hidden rounded-[26px] bg-white p-6 shadow-card transition hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(124,58,237,0.12)]"
          >
            <div className="text-right">
              <h2 className="text-2xl font-black text-slate-950">{text.socialPractice}</h2>
              <p className="mt-2 max-w-md text-base font-semibold leading-7 text-slate-600">
                {text.socialPracticeText}
              </p>
              <span className="mt-4 inline-flex rounded-full bg-violet-600 px-5 py-2.5 text-base font-black text-white shadow-button">
                {text.startChat}
              </span>
            </div>
            <img
              src="/images/friends-chat-image.png"
              alt=""
              className="hidden h-28 w-36 object-contain opacity-90 mix-blend-multiply transition group-hover:scale-105 sm:block"
            />
          </Link>

          <Link
            to="/profile"
            className="flex min-h-[150px] items-center gap-5 rounded-[26px] bg-white p-6 shadow-card transition hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(124,58,237,0.12)]"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <Settings className="h-7 w-7" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-2xl font-black text-slate-950">{text.settings}</h2>
              <p className="mt-2 text-base font-semibold leading-7 text-slate-600">
                {text.settingsText}
              </p>
            </div>
          </Link>
        </section>

        <section className="mt-6 min-h-[320px] rounded-[28px] bg-white p-6 shadow-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-pink-400 to-amber-300 text-white">
                <Search className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="text-3xl font-black text-slate-950">{text.chatHistory}</h2>
            </div>

            <button
              type="button"
              onClick={() => setShowChatHistory((current) => !current)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700 transition hover:-translate-y-0.5 hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              aria-expanded={showChatHistory}
              aria-label={text.chatHistory}
            >
              <ChevronDown
                className={`h-5 w-5 transition duration-300 ${
                  showChatHistory ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>
          </div>

          {showChatHistory ? (
            <>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                <Search className="h-5 w-5 text-slate-400" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={text.search}
                  className="min-w-0 flex-1 bg-transparent text-base outline-none"
                />
              </label>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {loading ? (
                  <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500 lg:col-span-2">
                    Loading chats...
                  </div>
                ) : (
                  visibleHistory.map((conversation) => (
                    <article
                      key={conversation.id}
                      className="min-h-[128px] rounded-[22px] border border-violet-100 bg-violet-50/40 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-black text-slate-900">{conversation.title}</h3>
                          <p className="mt-2 text-base font-semibold leading-7 text-slate-600">{conversation.preview}</p>
                          <p className="mt-2 text-sm font-bold text-slate-500">{conversation.time}</p>
                        </div>
                        <Star
                          className={`h-5 w-5 ${
                            conversation.favorite ? 'fill-amber-300 text-amber-400' : 'text-slate-300'
                          }`}
                          aria-hidden="true"
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          to={`/chatbot?chatId=${conversation.id}`}
                          className="rounded-full bg-violet-600 px-4 py-2 text-sm font-black text-white"
                        >
                          {text.continueChat}
                        </Link>
                        {!conversation.fallback ? (
                          <>
                            <button
                              type="button"
                              onClick={() => shareConversation(conversation)}
                              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-black text-violet-700"
                            >
                              <Share2 className="h-4 w-4" aria-hidden="true" />
                              {text.share}
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleFavorite(conversation.id)}
                              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-black text-violet-700"
                            >
                              <Heart className="h-4 w-4" aria-hidden="true" />
                              {text.favorite}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteConversation(conversation.id)}
                              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-black text-slate-600"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              {text.delete}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </>
          ) : null}
        </section>

        {shareStatus ? (
          <p className="mt-3 text-center text-xs font-semibold text-slate-500">
            {shareStatus}
          </p>
        ) : null}

        <BottomNav />
      </div>
    </main>
  );
}

export default MorePage;

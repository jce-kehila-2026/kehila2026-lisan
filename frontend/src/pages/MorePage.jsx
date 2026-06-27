import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Heart,
  Headphones,
  LogOut,
  MessageCircle,
  PenLine,
  Search,
  Settings,
  Share2,
  Star,
  Trash2,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import BottomNav from '../components/BottomNav.jsx';
import LisanHeader from '../components/LisanHeader.jsx';
import StudentHeroVisual from '../components/student/StudentHeroVisual.jsx';
import { getStoredToken, getStoredUser } from '../services/auth.js';

const API_BASE_URL = '/api';

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

const defaultSavedWords = [
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

const glassBlockClass =
  'border border-white/85 bg-[linear-gradient(135deg,rgba(255,255,255,0.62)_0%,rgba(246,241,255,0.74)_48%,rgba(236,226,255,0.66)_100%)] shadow-[0_24px_70px_rgba(124,58,237,0.14)] backdrop-blur-xl';
const glassCardClass =
  'border border-white/72 bg-white/50 shadow-[0_16px_38px_rgba(124,58,237,0.1)] backdrop-blur-lg';

function MoreTopHeader() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const user = getStoredUser();
  const homeTarget = user?.role === 'teacher' ? '/teacher/dashboard' : '/home';
  const text = labels[isArabic ? 'ar' : 'he'];

  const sections = [
    { id: 'history-continue-reading', label: text.continueReading, icon: BookOpen },
    { id: 'history-recent-activity',  label: text.recentActivity,  icon: Star },
    { id: 'history-saved-words',      label: text.savedTitle,      icon: Heart },
    { id: 'history-social-practice',  label: text.socialPractice,  icon: MessageCircle },
    { id: 'history-chat-history',     label: text.chatHistory,     icon: Search },
  ];

  const handleSectionClick = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <LisanHeader
      sections={sections}
      onSectionClick={handleSectionClick}
      logoTarget={homeTarget}
      navLabel={isArabic ? 'أقسام السجل' : 'אזורי היסטוריה'}
      forceMenu
    />
  );
}

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

  const visibleHistory = (filteredConversations.length > 0 ? filteredConversations : fallbackHistory).slice(0, 2);
  const [storedSavedWords, setStoredSavedWords] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('lisan-saved-words') || '[]');
    } catch {
      return [];
    }
  });
  const visibleSavedWords = useMemo(
    () => [...new Set([...defaultSavedWords, ...storedSavedWords])],
    [storedSavedWords],
  );

  useEffect(() => {
    const syncSavedWords = () => {
      try {
        setStoredSavedWords(JSON.parse(localStorage.getItem('lisan-saved-words') || '[]'));
      } catch {
        setStoredSavedWords([]);
      }
    };

    window.addEventListener('storage', syncSavedWords);
    window.addEventListener('lisan-saved-words-changed', syncSavedWords);

    return () => {
      window.removeEventListener('storage', syncSavedWords);
      window.removeEventListener('lisan-saved-words-changed', syncSavedWords);
    };
  }, []);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_12%_8%,rgba(221,214,254,0.54),transparent_30%),linear-gradient(180deg,#FBF8FF_0%,#FFF8FC_48%,#F4EEFF_100%)] text-slate-900">
      <div
        className="app-page-container relative pb-32"
        dir="rtl"
      >
        <MoreTopHeader />

        <section className="history-hero-card relative mt-4 overflow-hidden rounded-[24px] border border-white/80 bg-[linear-gradient(135deg,#FFFFFF_0%,#F7F0FF_48%,#FFF5FB_100%)] shadow-card sm:mt-6 sm:rounded-[28px]">
          <div className="grid min-h-[160px] lg:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)]" dir="ltr">
            <div className="min-h-[150px] lg:min-h-[170px]">
              <StudentHeroVisual type="resources" />
            </div>

            <div className="flex items-center justify-between gap-4 px-5 py-5 text-right sm:px-6 lg:px-8" dir="rtl">
              <div>
                <h1 className="text-3xl font-black leading-tight text-violet-700 sm:text-4xl">
                  {text.title}
                </h1>
                <p className="mt-1 text-sm font-bold leading-6 text-slate-700 sm:text-base">
                  {text.subtitle}
                </p>
              </div>

              <div className="hidden shrink-0 rounded-full bg-violet-50/90 px-4 py-2 text-sm font-black text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.10)] sm:inline-flex">
                {text.heroKicker}
              </div>
            </div>
          </div>
        </section>

        <section id="history-continue-reading" className={`scroll-mt-8 mt-5 flex min-h-[96px] flex-wrap items-center justify-between gap-5 rounded-[24px] p-5 sm:p-6 ${glassBlockClass}`}>
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

        <section id="history-recent-activity" className={`scroll-mt-8 mt-6 rounded-[26px] p-5 ${glassBlockClass}`}>
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
          </div>

          {showRecentActivities ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {recentActivities.map((item) => {
                const Icon = item.icon;
                return (
                  <article
                    key={item.title}
                    className={`flex min-h-[106px] items-center justify-between gap-3 sm:gap-5 rounded-[24px] p-5 transition hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(124,58,237,0.14)] ${glassCardClass}`}
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
                      className="shrink-0 rounded-full border border-violet-200 px-4 py-2 text-sm sm:px-6 sm:py-3 sm:text-base font-black text-violet-700 transition hover:bg-violet-600 hover:text-white"
                    >
                      {item.action}
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>

        <section id="history-saved-words" className={`scroll-mt-8 mt-6 min-h-[118px] rounded-[26px] p-6 ${glassBlockClass}`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-3xl font-black text-slate-950">{text.savedTitle}</h2>
            <span className="text-base font-black text-violet-700">{text.savedMore}</span>
          </div>

          <div className="flex flex-wrap gap-3">
            {visibleSavedWords.map((word) => (
              <span
                key={word}
                className="rounded-full bg-violet-50 px-5 py-2.5 text-base font-black text-violet-700"
              >
                {word}
              </span>
            ))}
          </div>
        </section>

        <section id="history-social-practice" className="scroll-mt-8 mt-6 grid gap-5 lg:grid-cols-2">
          <Link
            to="/shared-chat"
            className={`group flex min-h-[150px] items-center justify-between gap-6 overflow-hidden rounded-[26px] p-6 transition hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(124,58,237,0.14)] ${glassBlockClass}`}
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
            className={`flex min-h-[150px] items-center gap-5 rounded-[26px] p-6 transition hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(124,58,237,0.14)] ${glassBlockClass}`}
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

        <section
          id="history-chat-history"
          className={`scroll-mt-8 mt-6 rounded-[28px] p-6 transition-all duration-300 ${
            showChatHistory ? 'min-h-[320px]' : 'min-h-[112px]'
          } ${glassBlockClass}`}
        >
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
              <label className="flex items-center gap-3 rounded-2xl border border-white/72 bg-white/46 px-5 py-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)] backdrop-blur-lg">
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
                  <div className={`rounded-2xl p-6 text-center text-sm text-slate-500 lg:col-span-2 ${glassCardClass}`}>
                    Loading chats...
                  </div>
                ) : (
                  visibleHistory.map((conversation, index) => {
                    const isLastSingle =
                      visibleHistory.length % 2 === 1 && index === visibleHistory.length - 1;

                    return (
                    <article
                      key={conversation.id}
                      className={`min-h-[128px] rounded-[22px] p-4 ${glassCardClass} ${
                        isLastSingle ? 'lg:col-span-2 lg:mx-auto lg:w-[calc(50%_-_0.5rem)]' : ''
                      }`}
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
                    );
                  })
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

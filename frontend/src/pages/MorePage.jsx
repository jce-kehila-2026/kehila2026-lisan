import React, { useMemo, useState } from 'react';
import { Heart, MessageCircle, Search, Settings, Share2, Star, Trash2, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BottomNav from '../components/BottomNav.jsx';
import PageHeader from '../components/PageHeader.jsx';

const labels = {
  he: {
    title: 'עוד',
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
    teacherChatStarted: 'פתיחת שיחה עם המורה',
    settings: 'קיצור להגדרות',
    settingsText: 'שפה, תצוגה, גודל טקסט והעדפות אישיות.',
  },
  ar: {
    title: 'المزيد',
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
    teacherChatStarted: 'فتح محادثة مع المعلمة',
    settings: 'اختصار للإعدادات',
    settingsText: 'اللغة، العرض، حجم النص والتفضيلات.',
  },
};

const mockConversations = [
  {
    id: 'doctor',
    title: 'שיחה אצל הרופא',
    preview: 'שלום, מה כואב לך היום?',
    time: '21.05.2026 · 09:30',
    favorite: true,
  },
  {
    id: 'market',
    title: 'קניות בשוק',
    preview: 'כמה עולה הלחם?',
    time: '20.05.2026 · 18:15',
    favorite: false,
  },
  {
    id: 'bus',
    title: 'נסיעה באוטובוס',
    preview: 'איפה התחנה הקרובה?',
    time: '19.05.2026 · 12:05',
    favorite: false,
  },
];

const savedWords = ['שלום', 'תודה', 'סליחה', 'כמה זה עולה?', 'אני צריכה עזרה'];

function MorePage() {
  const { i18n } = useTranslation();
  const text = labels[i18n.language === 'he' ? 'he' : 'ar'];
  const [query, setQuery] = useState('');
  const [conversations, setConversations] = useState(mockConversations);
  const [shareStatus, setShareStatus] = useState('');
  const [teacherChatStarted, setTeacherChatStarted] = useState(false);

  const filteredConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return conversations;

    return conversations.filter((conversation) =>
      `${conversation.title} ${conversation.preview}`.toLowerCase().includes(normalizedQuery),
    );
  }, [conversations, query]);

  const toggleFavorite = (id) => {
    setConversations((currentConversations) =>
      currentConversations.map((conversation) =>
        conversation.id === id ? { ...conversation, favorite: !conversation.favorite } : conversation,
      ),
    );
  };

  const deleteConversation = (id) => {
    setConversations((currentConversations) =>
      currentConversations.filter((conversation) => conversation.id !== id),
    );
  };

  const shareConversation = async (conversation) => {
    const shareText = `ליסאן - ${conversation.title}: ${conversation.preview}`;

    if (navigator.share) {
      try {
        await navigator.share({ text: shareText, title: 'Lisan' });
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

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="relative mx-auto min-h-[calc(100vh-2.5rem)] max-w-xl pb-28 sm:min-h-[780px]" dir="rtl">
        <PageHeader showBack />

        <section className="mt-6 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <p className="text-sm font-semibold text-violet-700">{text.title}</p>
          <h1 className="mt-2 text-2xl font-bold leading-tight text-slate-950 sm:text-3xl">
            {text.subtitle}
          </h1>
        </section>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-pink-400 to-amber-300 text-white">
              <MessageCircle className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="text-xl font-bold text-slate-900">{text.chatHistory}</h2>
          </div>

          <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Search className="h-5 w-5 text-slate-400" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={text.search}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>

          <div className="mt-4 grid gap-3">
            {filteredConversations.map((conversation) => (
              <article key={conversation.id} className="rounded-2xl border border-slate-100 bg-violet-50/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">{conversation.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{conversation.preview}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-500">{conversation.time}</p>
                  </div>
                  <Star
                    className={`h-5 w-5 ${conversation.favorite ? 'fill-amber-300 text-amber-400' : 'text-slate-300'}`}
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to="/chatbot" className="rounded-full bg-violet-600 px-4 py-2 text-xs font-bold text-white">
                    {text.continueChat}
                  </Link>
                  <button
                    type="button"
                    onClick={() => shareConversation(conversation)}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-bold text-violet-700"
                  >
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                    {text.share}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(conversation.id)}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-bold text-violet-700"
                  >
                    <Heart className="h-4 w-4" aria-hidden="true" />
                    {text.favorite}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteConversation(conversation.id)}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    {text.delete}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <h2 className="text-xl font-bold text-slate-900">{text.savedTitle}</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {savedWords.map((word) => (
              <span key={word} className="rounded-full bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700">
                {word}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-5 grid gap-3">
          <Link to="/shared-chat" className="flex items-center gap-3 rounded-3xl bg-white p-5 shadow-card">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <UsersRound className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-bold text-slate-900">{text.friendsChat}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">{text.friendsChatText}</p>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setTeacherChatStarted(true)}
            className="flex w-full items-center gap-3 rounded-3xl bg-white p-5 text-right shadow-card"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <MessageCircle className="h-6 w-6" aria-hidden="true" />
            </span>
            <span>
              <span className="block font-bold text-slate-900">{text.teacherChat}</span>
              <span className="mt-1 block text-sm leading-6 text-slate-600">{text.teacherChatText}</span>
            </span>
          </button>

          {teacherChatStarted ? (
            <div className="rounded-2xl bg-violet-50 p-4 text-sm font-semibold leading-6 text-violet-700">
              {text.teacherChatStarted}
            </div>
          ) : null}

          <Link to="/profile" className="flex items-center gap-3 rounded-3xl bg-white p-5 shadow-card">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <Settings className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-bold text-slate-900">{text.settings}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">{text.settingsText}</p>
            </div>
          </Link>
        </section>

        {shareStatus ? <p className="mt-3 text-center text-xs font-semibold text-slate-500">{shareStatus}</p> : null}

        <BottomNav />
      </div>
    </main>
  );
}

export default MorePage;

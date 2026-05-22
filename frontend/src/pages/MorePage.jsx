import React, { useMemo, useState } from 'react';
import {
  Bell,
  Copy,
  Heart,
  HelpCircle,
  MessageCircle,
  Search,
  Send,
  Settings,
  Share2,
  Star,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BottomNav from '../components/BottomNav.jsx';
import PageHeader from '../components/PageHeader.jsx';

const labels = {
  he: {
    title: 'עוד',
    subtitle: 'כלים קטנים לשיחה, חזרה ושמירה',
    chatHistory: 'היסטוריית שיחות',
    search: 'חיפוש שיחות',
    continueChat: 'המשך שיחה',
    favorite: 'מועדף',
    delete: 'מחיקה',
    savedTitle: 'הודעות שמורות ומילים מועדפות',
    shareTitle: 'שיתוף שיחה',
    copy: 'העתקת טקסט',
    nativeShare: 'שיתוף',
    whatsapp: 'WhatsApp',
    shareFallback: 'אם השיתוף לא נתמך, אפשר להעתיק את הטקסט ולשלוח ידנית.',
    copied: 'הועתק',
    notifications: 'התראות',
    notificationsText: 'תזכורות עדינות לתרגול עברית.',
    help: 'עזרה / אודות',
    helpText: 'ליסאן עוזרת לתרגל עברית בצורה רגועה וברורה.',
    settings: 'קיצור להגדרות',
  },
  ar: {
    title: 'المزيد',
    subtitle: 'أدوات صغيرة للمحادثة والمراجعة والحفظ',
    chatHistory: 'سجل المحادثات',
    search: 'بحث في المحادثات',
    continueChat: 'متابعة المحادثة',
    favorite: 'مفضلة',
    delete: 'حذف',
    savedTitle: 'رسائل محفوظة وكلمات مفضلة',
    shareTitle: 'مشاركة محادثة',
    copy: 'نسخ النص',
    nativeShare: 'مشاركة',
    whatsapp: 'WhatsApp',
    shareFallback: 'إذا لم تكن المشاركة مدعومة، انسخي النص وأرسليه يدويًا.',
    copied: 'تم النسخ',
    notifications: 'الإشعارات',
    notificationsText: 'تذكيرات لطيفة للتدرب على العبرية.',
    help: 'مساعدة / حول',
    helpText: 'لسان يساعدك على التدرّب على العبرية بهدوء ووضوح.',
    settings: 'اختصار الإعدادات',
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
const mockShareText = 'ליסאן - תרגול שיחה: שלום, מה כואב לך היום? אני רוצה לתרגל עברית.';

function MorePage() {
  const { i18n } = useTranslation();
  const text = labels[i18n.language === 'he' ? 'he' : 'ar'];
  const [query, setQuery] = useState('');
  const [conversations, setConversations] = useState(mockConversations);
  const [shareStatus, setShareStatus] = useState(text.shareFallback);

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
        conversation.id === id
          ? { ...conversation, favorite: !conversation.favorite }
          : conversation,
      ),
    );
  };

  const deleteConversation = (id) => {
    setConversations((currentConversations) =>
      currentConversations.filter((conversation) => conversation.id !== id),
    );
  };

  const copyConversation = async () => {
    try {
      await navigator.clipboard.writeText(mockShareText);
      setShareStatus(text.copied);
    } catch {
      setShareStatus(text.shareFallback);
    }
  };

  const shareConversation = async () => {
    if (!navigator.share) {
      setShareStatus(text.shareFallback);
      return;
    }

    try {
      await navigator.share({ text: mockShareText, title: 'Lisan' });
      setShareStatus(text.nativeShare);
    } catch {
      setShareStatus(text.shareFallback);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="relative mx-auto min-h-[calc(100vh-2.5rem)] max-w-xl pb-28 sm:min-h-[780px]" dir="rtl">
        <PageHeader showLogout />

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
                  <Link
                    to="/chatbot"
                    className="rounded-full bg-violet-600 px-4 py-2 text-xs font-bold text-white"
                  >
                    {text.continueChat}
                  </Link>
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

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <Share2 className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="text-xl font-bold text-slate-900">{text.shareTitle}</h2>
          </div>
          <p className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{mockShareText}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={copyConversation} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white">
              <Copy className="h-4 w-4" aria-hidden="true" />
              {text.copy}
            </button>
            <button type="button" onClick={shareConversation} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700">
              <Send className="h-4 w-4" aria-hidden="true" />
              {text.nativeShare}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(mockShareText)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-2xl bg-green-50 px-4 py-3 text-sm font-bold text-green-700"
            >
              {text.whatsapp}
            </a>
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-500">{shareStatus}</p>
        </section>

        <section className="mt-5 grid gap-3">
          {[
            { title: text.notifications, body: text.notificationsText, icon: Bell },
            { title: text.help, body: text.helpText, icon: HelpCircle },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="rounded-3xl bg-white p-5 shadow-card">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-700">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-bold text-slate-900">{item.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
                  </div>
                </div>
              </article>
            );
          })}
          <Link to="/profile" className="flex items-center gap-3 rounded-3xl bg-white p-5 shadow-card">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <Settings className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="font-bold text-slate-900">{text.settings}</span>
          </Link>
        </section>

        <BottomNav />
      </div>
    </main>
  );
}

export default MorePage;

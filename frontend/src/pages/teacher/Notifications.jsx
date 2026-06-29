import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  Check,
  MessageSquareText,
  RefreshCw,
  BookOpen,
  GraduationCap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx';
import { getStoredToken } from '../../services/auth.js';

const API_BASE_URL = '/api';

// Teacher sees 3 tabs: chat reviews, new words, new students assigned to them
const TABS = [
  {
    key: 'chat',
    labelHe: 'דרדשות',
    labelAr: 'دردشات',
    types: ['chat_review_submitted'],
    Icon: MessageSquareText,
    color: 'violet',
  },
  {
    key: 'words',
    labelHe: 'מילים',
    labelAr: 'كلمات',
    types: ['new_word_pending'],
    Icon: BookOpen,
    color: 'blue',
  },
  {
    key: 'students',
    labelHe: 'תלמידות',
    labelAr: 'طالبات',
    types: ['new_student_registered'],
    Icon: GraduationCap,
    color: 'green',
  },
];

const TAB_COLORS = {
  violet: {
    active: 'bg-violet-600 text-white shadow-sm',
    inactive: 'text-slate-600 hover:bg-violet-50',
    badge: 'bg-violet-100 text-violet-700',
    icon: 'text-violet-600',
    iconBg: 'bg-violet-50',
    border: 'border-violet-200 bg-violet-50',
  },
  blue: {
    active: 'bg-blue-600 text-white shadow-sm',
    inactive: 'text-slate-600 hover:bg-blue-50',
    badge: 'bg-blue-100 text-blue-700',
    icon: 'text-blue-600',
    iconBg: 'bg-blue-50',
    border: 'border-blue-200 bg-blue-50',
  },
  green: {
    active: 'bg-green-600 text-white shadow-sm',
    inactive: 'text-slate-600 hover:bg-green-50',
    badge: 'bg-green-100 text-green-700',
    icon: 'text-green-600',
    iconBg: 'bg-green-50',
    border: 'border-green-200 bg-green-50',
  },
};

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function EmptyTabState({ tab, isAr }) {
  const colors = TAB_COLORS[tab.color];
  const Icon = tab.Icon;
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-[1.75rem] border border-slate-100 bg-white/80 px-8 py-16 text-center shadow-sm">
      <span className={`flex h-16 w-16 items-center justify-center rounded-2xl ${colors.iconBg}`}>
        <Icon className={`h-8 w-8 ${colors.icon}`} aria-hidden="true" />
      </span>
      <div>
        <p className="text-base font-black text-slate-700">
          {isAr ? 'لا توجد إشعارات' : 'אין התראות'}
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-400">
          {isAr
            ? `لا توجد إشعارات في قسم "${tab.labelAr}" حتى الآن`
            : `אין התראות בקטגוריית "${tab.labelHe}" כרגע`}
        </p>
      </div>
    </div>
  );
}

function NotificationCard({ notification, onMarkRead, onOpen, markingId, tabColor }) {
  const colors = TAB_COLORS[tabColor];
  const isUnread = !notification.isRead;

  return (
    <article
      className={`rounded-[1.75rem] border p-5 shadow-card transition ${
        isUnread ? colors.border : 'border-slate-100 bg-white/95'
      }`}
    >
      <div className="flex items-start gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ${colors.icon}`}>
          <MessageSquareText className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-black text-slate-950">
              {notification.title || 'התראה חדשה'}
            </h2>
            <span className="text-xs font-bold text-slate-400">
              {formatTime(notification.createdAt)}
            </span>
          </div>

          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            {notification.message || ''}
          </p>

          {notification.preview ? (
            <p className="mt-2 rounded-2xl bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700">
              {notification.preview}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {notification.relatedChatId ? (
              <button
                type="button"
                onClick={() => onOpen(notification)}
                className={`rounded-2xl px-4 py-2 text-sm font-black text-white transition ${
                  tabColor === 'violet'
                    ? 'bg-violet-600 hover:bg-violet-700'
                    : tabColor === 'blue'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                פתיחת השיחה
              </button>
            ) : null}

            {isUnread ? (
              <button
                type="button"
                onClick={() => onMarkRead(notification.id)}
                disabled={markingId === notification.id}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {markingId === notification.id ? 'מעדכן...' : 'סימון כנקראה'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function TeacherNotifications() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const isAr = i18n.language === 'ar';

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('chat');

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications],
  );

  const tabUnreadCounts = useMemo(() => {
    const counts = {};
    TABS.forEach((tab) => {
      counts[tab.key] = notifications.filter(
        (n) => !n.isRead && tab.types.includes(n.type),
      ).length;
    });
    return counts;
  }, [notifications]);

  const activeTabData = TABS.find((t) => t.key === activeTab);
  const tabNotifications = useMemo(
    () => notifications.filter((n) => activeTabData?.types.includes(n.type)),
    [notifications, activeTabData],
  );

  const loadNotifications = async () => {
    try {
      setLoading(true);
      setError('');
      const token = getStoredToken();
      const response = await fetch(`${API_BASE_URL}/notifications/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load');
      setNotifications(data.notifications || []);
    } catch (err) {
      console.error('Failed to load notifications:', err);
      setError(isAr ? 'خطأ في تحميل الإشعارات.' : 'שגיאה בטעינת ההתראות. נסי לרענן.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadNotifications(); }, []);

  const markAsRead = async (notificationId) => {
    try {
      setMarkingId(notificationId);
      const token = getStoredToken();
      const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed');
      setNotifications((curr) =>
        curr.map((n) =>
          n.id === notificationId
            ? { ...n, isRead: true, readAt: new Date().toISOString() }
            : n,
        ),
      );
    } catch (err) {
      console.error('Failed to mark as read:', err);
      setError(isAr ? 'خطأ في تحديث الإشعار.' : 'אירעה שגיאה בעדכון ההתראה.');
    } finally {
      setMarkingId(null);
    }
  };

  const openNotification = async (notification) => {
    if (!notification.isRead) await markAsRead(notification.id);
    if (notification.relatedChatId) navigate(`/admin/conversations?chatId=${notification.relatedChatId}`);
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#FCF8FF_0%,#F7F0FF_45%,#FFF6FB_100%)] px-3 py-3 text-slate-900 md:px-6 md:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-6xl" dir="rtl">
        <AdminPageHeader />

        {/* Header card */}
        <section className="mt-8 overflow-hidden rounded-[24px] border border-[#EEE5FF] bg-white/75 p-4 shadow-card backdrop-blur-[8px] md:mt-10 md:rounded-[2rem] md:p-7">
          <p className="inline-flex items-center gap-2 text-sm font-black text-violet-700">
            <Bell className="h-4 w-4" aria-hidden="true" />
            {isAr ? 'إشعاراتي' : 'ההתראות שלי'}
          </p>
          <h1 className="mt-2 text-[clamp(1.65rem,7vw,2.1rem)] font-black leading-tight text-slate-950 md:text-[clamp(2.2rem,4.2vw,4.25rem)]">
            {isAr ? 'مركز الإشعارات' : 'מרכז ההתראות'}
          </h1>
          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-600 md:mt-3 md:text-base md:leading-7">
            {isAr
              ? 'هنا تظهر إشعارات المحادثات والكلمات الجديدة والطالبات.'
              : 'כאן מופיעות התראות על שיחות, מילים חדשות ותלמידות.'}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-violet-50 px-4 py-2 text-sm font-black text-violet-700">
              {unreadCount}{isAr ? ' غير مقروءة' : ' לא נקראו'}
            </span>
            <button
              type="button"
              onClick={loadNotifications}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              {isAr ? 'تحديث' : 'רענון'}
            </button>
          </div>
        </section>

        {error ? (
          <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </p>
        ) : null}

        {/* Tabs */}
        <div className="mt-5 flex flex-wrap gap-2 rounded-2xl bg-white/60 p-2 shadow-sm backdrop-blur-sm">
          {TABS.map((tab) => {
            const colors = TAB_COLORS[tab.color];
            const isActive = activeTab === tab.key;
            const TabIcon = tab.Icon;
            const unread = tabUnreadCounts[tab.key];
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition min-w-[100px] ${
                  isActive ? colors.active : colors.inactive
                }`}
              >
                <TabIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{isAr ? tab.labelAr : tab.labelHe}</span>
                {unread > 0 ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-black ${
                      isActive ? 'bg-white/30 text-white' : colors.badge
                    }`}
                  >
                    {unread}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <section className="mt-4 flex flex-col gap-3">
          {loading ? (
            <div className="flex items-center justify-center rounded-[1.75rem] border border-white/70 bg-white/95 p-12 shadow-card">
              <div className="flex items-center gap-3 text-sm font-black text-slate-500">
                <RefreshCw className="h-5 w-5 animate-spin text-violet-400" aria-hidden="true" />
                {isAr ? 'جارٍ تحميل الإشعارات...' : 'טוען התראות...'}
              </div>
            </div>
          ) : tabNotifications.length === 0 ? (
            <EmptyTabState tab={activeTabData} isAr={isAr} />
          ) : (
            tabNotifications.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onMarkRead={markAsRead}
                onOpen={openNotification}
                markingId={markingId}
                tabColor={activeTabData.color}
              />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

export default TeacherNotifications;
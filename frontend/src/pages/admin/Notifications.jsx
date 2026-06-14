import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bell,
  Check,
  MessageSquareText,
  RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import Button from '../../components/ui/Button.jsx';
import { adminDemoNotifications } from '../../data/adminMockData.js';
import { getStoredToken, logout } from '../../services/auth.js';

const API_BASE_URL = '/api';

function formatTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function notificationCardClass(count) {
  if (count === 3) {
    return 'w-full flex-none lg:basis-[calc((100%_-_1.5rem)/3)]';
  }

  if (count === 4) {
    return 'w-full flex-none md:basis-[calc(50%_-_0.375rem)] xl:basis-[calc((100%_-_2.25rem)/4)]';
  }

  return 'w-full flex-none md:basis-[calc(50%_-_0.375rem)] lg:basis-[calc((100%_-_1.5rem)/3)]';
}

function Notifications() {
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState(null);
  const [error, setError] = useState('');

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications],
  );

  const loadNotifications = async () => {
    try {
      setError('');

      const token = getStoredToken();

      const response = await fetch(`${API_BASE_URL}/notifications/my`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load notifications');
      }

      setNotifications(
        (data.notifications || []).length > 0
          ? data.notifications
          : adminDemoNotifications,
      );
    } catch (requestError) {
      console.error('Failed to load notifications:', requestError);
      setNotifications(adminDemoNotifications);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const markAsRead = async (notificationId) => {
    try {
      setMarkingId(notificationId);

      if (adminDemoNotifications.some((notification) => notification.id === notificationId)) {
        setNotifications((current) =>
          current.map((notification) =>
            notification.id === notificationId
              ? { ...notification, isRead: true, readAt: new Date().toISOString() }
              : notification,
          ),
        );
        return;
      }

      const token = getStoredToken();

      const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to mark notification as read');
      }

      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, isRead: true, readAt: new Date().toISOString() }
            : notification,
        ),
      );
    } catch (requestError) {
      console.error('Failed to mark notification as read:', requestError);
      setError('אירעה שגיאה בעדכון ההתראה.');
    } finally {
      setMarkingId(null);
    }
  };

  const openNotification = async (notification) => {
    if (!notification.isRead) {
      await markAsRead(notification.id);
    }

    if (notification.relatedChatId) {
      navigate(`/shared-chat/${notification.relatedChatId}`);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#FCF8FF_0%,#F7F0FF_45%,#FFF6FB_100%)] px-3 py-4 text-slate-900 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-6xl" dir="rtl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-black text-violet-700 shadow-sm transition hover:bg-violet-50"
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            חזרה ללוח הבקרה
          </button>

          <Button type="button" variant="secondary" onClick={handleLogout}>
            יציאה
          </Button>
        </header>

        <section className="mt-6 overflow-hidden rounded-[2rem] border border-[#EEE5FF] bg-white/75 p-5 shadow-card backdrop-blur-[8px] sm:p-7">
          <p className="inline-flex items-center gap-2 text-sm font-black text-violet-700">
            <Bell className="h-4 w-4" aria-hidden="true" />
            התראות מערכת
          </p>

          <h1 className="mt-2 text-[clamp(2.2rem,4.2vw,4.25rem)] font-black leading-tight text-slate-950">
            ההתראות שלי
          </h1>

          <p className="mt-3 max-w-4xl text-sm font-semibold leading-7 text-slate-600 sm:text-base">
            כאן מופיעות התראות חדשות על הודעות ושיחות במערכת.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-violet-50 px-4 py-2 text-sm font-black text-violet-700">
              {unreadCount} לא נקראו
            </span>

            <button
              type="button"
              onClick={loadNotifications}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              רענון
            </button>
          </div>
        </section>

        {error ? (
          <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </p>
        ) : null}

        <section className="mt-5 flex flex-wrap justify-center gap-3">
          {loading ? (
            <div className="rounded-[1.75rem] border border-white/70 bg-white/95 p-8 text-center text-sm font-black text-slate-500 shadow-card">
              טוען התראות...
            </div>
          ) : notifications.length === 0 ? (
            <div className="rounded-[1.75rem] border border-white/70 bg-white/95 p-8 text-center text-sm font-black text-slate-500 shadow-card">
              אין התראות כרגע.
            </div>
          ) : (
            notifications.map((notification) => (
              <article
                key={notification.id}
                className={`rounded-[1.75rem] border p-5 shadow-card transition ${notificationCardClass(notifications.length)} ${
                  notification.isRead
                    ? 'border-slate-100 bg-white/95'
                    : 'border-violet-200 bg-violet-50'
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-sm">
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
                      {notification.message || notification.preview || ''}
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
                          onClick={() => openNotification(notification)}
                          className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-black text-white transition hover:bg-violet-700"
                        >
                          פתיחת השיחה
                        </button>
                      ) : null}

                      {!notification.isRead ? (
                        <button
                          type="button"
                          onClick={() => markAsRead(notification.id)}
                          disabled={markingId === notification.id}
                          className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Check className="h-4 w-4" aria-hidden="true" />
                          {markingId === notification.id ? 'מעדכן...' : 'סימון כנקראה'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}

export default Notifications;

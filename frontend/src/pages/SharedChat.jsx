import React, { useEffect, useMemo, useState } from 'react';
import { Clock, MessageCircle, Search, Send, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import BottomNav from '../components/BottomNav.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { getStoredToken, getStoredUser } from '../services/auth.js';

const API_BASE_URL = 'http://localhost:3000/api';

const roleLabels = {
  student: 'תלמידה',
  teacher: 'מורה',
  expert: 'מורה',
  admin: 'מנהל',
};

function getCurrentUserId() {
  const user = getStoredUser();
  return user?.id || user?.uid || null;
}

function formatChatTitle(chat, currentUserId) {
  if (chat?.participantNames) {
    const names = Object.entries(chat.participantNames)
      .filter(([id]) => id !== currentUserId)
      .map(([, name]) => name)
      .filter(Boolean);

    if (names.length > 0) {
      return names.join(', ');
    }
  }

  return chat?.title || 'שיחה משותפת';
}

function formatChatRoles(chat, currentUserId) {
  if (!chat?.participantRoles) {
    return 'שיחה בין משתמשים';
  }

  const roles = Object.entries(chat.participantRoles)
    .filter(([id]) => id !== currentUserId)
    .map(([, role]) => roleLabels[role] || role)
    .filter(Boolean);

  return roles.length > 0 ? [...new Set(roles)].join(', ') : 'שיחה בין משתמשים';
}

function formatLastActivity(value) {
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

function chatTimestamp(chat) {
  return new Date(chat.updatedAt || chat.createdAt || 0).getTime();
}

function SharedChat() {
  const navigate = useNavigate();
  const currentUserId = getCurrentUserId();

  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [status, setStatus] = useState('');
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [creatingChat, setCreatingChat] = useState(false);
  const [myChats, setMyChats] = useState([]);
  const [loadingChats, setLoadingChats] = useState(true);

  const loadMyChats = async () => {
    try {
      const token = getStoredToken();

      const response = await fetch(`${API_BASE_URL}/shared-chats/my`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load shared chats');
      }

      setMyChats(data.chats || []);
    } catch (error) {
      console.error('Failed to load shared chats:', error);
    } finally {
      setLoadingChats(false);
    }
  };

  useEffect(() => {
    const loadAvailableUsers = async () => {
      try {
        const token = getStoredToken();

        const response = await fetch(`${API_BASE_URL}/shared-chats/available-users`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load users');
        }

        setUsers(data.users || []);
      } catch (error) {
        console.error('Failed to load available users:', error);
        setStatus('אירעה שגיאה בטעינת המשתמשים.');
      } finally {
        setLoadingUsers(false);
      }
    };

    loadAvailableUsers();
    loadMyChats();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadMyChats();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return users;
    }

    return users.filter((user) =>
      `${user.name || ''} ${user.level || ''} ${user.email || ''} ${user.role || ''}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, users]);

  const sortedChats = useMemo(() => {
    return [...myChats].sort((first, second) => {
      const firstUnread = Array.isArray(first.unreadBy) && first.unreadBy.includes(currentUserId);
      const secondUnread = Array.isArray(second.unreadBy) && second.unreadBy.includes(currentUserId);

      if (firstUnread !== secondUnread) {
        return secondUnread - firstUnread;
      }

      return chatTimestamp(second) - chatTimestamp(first);
    });
  }, [myChats, currentUserId]);

  const toggleUser = (id) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((userId) => userId !== id)
        : [...current, id],
    );

    setStatus('');
  };

  const startConversation = async () => {
    if (selectedIds.length === 0) {
      setStatus('בחרי לפחות משתמש אחד להתחלת שיחה.');
      return;
    }

    try {
      setCreatingChat(true);
      setStatus('');

      const token = getStoredToken();

      const response = await fetch(`${API_BASE_URL}/shared-chats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          participantIds: selectedIds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create shared chat');
      }

      navigate(`/shared-chat/${data.chatId}`);
    } catch (error) {
      console.error('Failed to start shared chat:', error);
      setStatus('אירעה שגיאה בפתיחת השיחה.');
    } finally {
      setCreatingChat(false);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-3 py-4 text-slate-900 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8">
      <div
        className="relative mx-auto min-h-[calc(100vh-2rem)] w-full max-w-6xl pb-32 sm:min-h-[780px]"
        dir="rtl"
      >
        <PageHeader showBack />

        <section className="mt-6 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
              <MessageCircle className="h-7 w-7" aria-hidden="true" />
            </span>

            <div>
              <p className="text-sm font-semibold text-violet-700">
                שיחה משותפת
              </p>

              <h1 className="mt-1 text-2xl font-bold leading-tight text-slate-950">
                בחרי משתתפים לתרגול משותף
              </h1>
            </div>
          </div>

          <label className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Search className="h-5 w-5 text-slate-400" aria-hidden="true" />

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חיפוש משתמשים"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            {loadingUsers ? (
              <p className="text-sm font-semibold text-slate-500">
                טוען משתמשים...
              </p>
            ) : filteredUsers.length === 0 ? (
              <p className="text-sm font-semibold text-slate-500">
                לא נמצאו משתמשים זמינים
              </p>
            ) : (
              filteredUsers.map((user) => {
                const selected = selectedIds.includes(user.id);

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggleUser(user.id)}
                    className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                      selected
                        ? 'bg-violet-600 text-white'
                        : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                    }`}
                  >
                    {user.name || 'משתמש'} · {roleLabels[user.role] || user.role || 'user'}
                  </button>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={startConversation}
            disabled={selectedIds.length === 0 || creatingChat}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-button transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {creatingChat ? 'פותח שיחה...' : 'התחלת שיחה'}
          </button>

          {status ? (
            <p className="mt-3 text-sm font-bold text-violet-700">{status}</p>
          ) : null}
        </section>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">
              השיחות שלי
            </h2>

            <button
              type="button"
              onClick={loadMyChats}
              className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700 transition hover:bg-violet-100"
            >
              רענון
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {loadingChats ? (
              <p className="text-sm font-semibold text-slate-500">
                טוען שיחות...
              </p>
            ) : sortedChats.length === 0 ? (
              <p className="text-sm font-semibold text-slate-500">
                אין שיחות עדיין.
              </p>
            ) : (
              sortedChats.map((chat) => {
                const title = formatChatTitle(chat, currentUserId);
                const roles = formatChatRoles(chat, currentUserId);
                const lastActivity = formatLastActivity(chat.updatedAt || chat.createdAt);
                const isUnread = Array.isArray(chat.unreadBy) && chat.unreadBy.includes(currentUserId);

                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => navigate(`/shared-chat/${chat.id}`)}
                    className={`rounded-3xl border px-4 py-4 text-right transition hover:-translate-y-0.5 hover:shadow-md ${
                      isUnread
                        ? 'border-red-200 bg-red-50'
                        : 'border-violet-100 bg-violet-50 hover:bg-violet-100'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-sm">
                        <UserRound className="h-5 w-5" aria-hidden="true" />
                        {isUnread ? (
                          <span className="absolute -left-1 -top-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" />
                        ) : null}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-slate-900">
                          {title}
                        </span>

                        <span className="mt-1 block text-xs font-bold text-violet-700">
                          {roles}
                        </span>

                        <span className={`mt-2 block truncate text-xs ${
                          isUnread
                            ? 'font-black text-slate-900'
                            : 'font-semibold text-slate-500'
                        }`}>
                          {chat.lastMessage || 'אין הודעות עדיין'}
                        </span>
                      </span>

                      {lastActivity ? (
                        <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-slate-400">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          {lastActivity}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <BottomNav />
      </div>
    </main>
  );
}

export default SharedChat;

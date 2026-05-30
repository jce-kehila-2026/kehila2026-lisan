import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  MessageCircle,
  Search,
  Send,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';

import BottomNav from '../../components/BottomNav.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { getStoredToken, getStoredUser } from '../../services/auth.js';

const API_BASE_URL = 'http://localhost:3000/api';

const detailItems = [
  { key: 'level', label: 'רמה' },
  { key: 'progress', label: 'התקדמות', suffix: '%' },
  { key: 'learnedWords', label: 'מילים שנלמדו' },
  { key: 'conversations', label: 'מספר שיחות' },
  { key: 'lastActivity', label: 'פעילות אחרונה' },
];

const mapStudentFromApi = (student) => ({
  id: student.id,
  name: student.name || 'תלמידה',
  email: student.email || '',
  level: student.level || 'A1',
  language: student.language || 'ar',
  progress: 0,
  learnedWords: 0,
  conversations: 0,
  lastActivity: student.lastLoginAt ? 'פעילה לאחרונה' : 'אין פעילות',
  notes: 'אין הערות מורה עדיין.',
});

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

function formatLastActivity(value) {
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

function chatTimestamp(chat) {
  return new Date(chat.updatedAt || chat.createdAt || 0).getTime();
}

function TeacherMore() {
  const navigate = useNavigate();
  const currentUserId = getCurrentUserId();

  const [studentQuery, setStudentQuery] = useState('');
  const [groupQuery, setGroupQuery] = useState('');
  const [teacherStudents, setTeacherStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [groupStarted, setGroupStarted] = useState(false);
  const [managerChatStarted, setManagerChatStarted] = useState(false);
  const [studentChatStarted, setStudentChatStarted] = useState(false);
  const [loadingStudentDetails, setLoadingStudentDetails] = useState(false);
  const [creatingStudentChat, setCreatingStudentChat] = useState(false);
  const [teacherChats, setTeacherChats] = useState([]);
  const [loadingTeacherChats, setLoadingTeacherChats] = useState(true);

  const loadTeacherChats = async () => {
    try {
      const token = getStoredToken();

      const response = await fetch(`${API_BASE_URL}/shared-chats/my`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load teacher chats');
      }

      setTeacherChats(data.chats || []);
    } catch (error) {
      console.error('Failed to load teacher chats:', error);
    } finally {
      setLoadingTeacherChats(false);
    }
  };

  useEffect(() => {
    const loadStudents = async () => {
      try {
        const token = getStoredToken();

        const response = await fetch(`${API_BASE_URL}/teacher/students`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load students');
        }

        setTeacherStudents((data.students || []).map(mapStudentFromApi));
      } catch (error) {
        console.error('Failed to load teacher students:', error);
      } finally {
        setLoadingStudents(false);
      }
    };

    loadStudents();
    loadTeacherChats();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadTeacherChats();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const sortedTeacherChats = useMemo(() => {
    return [...teacherChats].sort((first, second) => {
      const firstUnread =
        Array.isArray(first.unreadBy) && first.unreadBy.includes(currentUserId);

      const secondUnread =
        Array.isArray(second.unreadBy) && second.unreadBy.includes(currentUserId);

      if (firstUnread !== secondUnread) {
        return secondUnread - firstUnread;
      }

      return chatTimestamp(second) - chatTimestamp(first);
    });
  }, [teacherChats, currentUserId]);

  const loadStudentDetails = async (student) => {
    try {
      setLoadingStudentDetails(true);

      const token = getStoredToken();

      const [progressRes, attemptsRes, chatsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/teacher/students/${student.id}/progress`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/teacher/students/${student.id}/attempts`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/teacher/students/${student.id}/chats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const progressData = await progressRes.json();
      const attemptsData = await attemptsRes.json();
      const chatsData = await chatsRes.json();

      if (!progressRes.ok) {
        throw new Error(progressData.error || 'Failed to load progress');
      }

      if (!attemptsRes.ok) {
        throw new Error(attemptsData.error || 'Failed to load attempts');
      }

      if (!chatsRes.ok) {
        throw new Error(chatsData.error || 'Failed to load chats');
      }

      setSelectedStudent({
        ...student,
        progress: progressData.progress?.accuracy || progressData.progress?.progress || 0,
        learnedWords: progressData.progress?.learnedWords || 0,
        conversations: chatsData.chats?.length || 0,
        attempts: attemptsData.attempts || [],
        chats: chatsData.chats || [],
      });

      setStudentChatStarted(false);
    } catch (error) {
      console.error('Failed to load student details:', error);
      setSelectedStudent(student);
      setStudentChatStarted(false);
    } finally {
      setLoadingStudentDetails(false);
    }
  };

  const startStudentConversation = async () => {
    if (!selectedStudent) {
      return;
    }

    try {
      setCreatingStudentChat(true);

      const token = getStoredToken();

      const response = await fetch(`${API_BASE_URL}/shared-chats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          participantIds: [selectedStudent.id],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create shared chat');
      }

      setStudentChatStarted(true);
      navigate(`/shared-chat/${data.chatId}`);
    } catch (error) {
      console.error('Failed to create student chat:', error);
    } finally {
      setCreatingStudentChat(false);
    }
  };

  const filteredStudents = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();

    if (!query) {
      return teacherStudents;
    }

    return teacherStudents.filter((student) =>
      `${student.name} ${student.email}`.toLowerCase().includes(query),
    );
  }, [studentQuery, teacherStudents]);

  const filteredGroupStudents = useMemo(() => {
    const query = groupQuery.trim().toLowerCase();

    if (!query) {
      return teacherStudents;
    }

    return teacherStudents.filter((student) =>
      `${student.name} ${student.email}`.toLowerCase().includes(query),
    );
  }, [groupQuery, teacherStudents]);

  const selectedGroupStudents = teacherStudents.filter((student) =>
    selectedGroupIds.includes(student.id),
  );

  const toggleGroupStudent = (id) => {
    setSelectedGroupIds((current) =>
      current.includes(id)
        ? current.filter((studentId) => studentId !== id)
        : [...current, id],
    );

    setGroupStarted(false);
  };

  const startGroupConversation = async () => {
    if (selectedGroupIds.length === 0) {
      return;
    }

    try {
      const token = getStoredToken();

      const response = await fetch(`${API_BASE_URL}/shared-chats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          participantIds: selectedGroupIds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create group chat');
      }

      setGroupStarted(true);
      navigate(`/shared-chat/${data.chatId}`);
    } catch (error) {
      console.error('Failed to create group chat:', error);
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-violet-700">עוד</p>
              <h1 className="mt-2 text-2xl font-bold text-slate-950">
                כלי מורה מהירים
              </h1>
            </div>

            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
              <UsersRound className="h-6 w-6" aria-hidden="true" />
            </span>
          </div>
        </section>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">
              שיחות עם תלמידות
            </h2>

            <button
              type="button"
              onClick={loadTeacherChats}
              className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700 transition hover:bg-violet-100"
            >
              רענון
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {loadingTeacherChats ? (
              <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-semibold text-slate-500">
                טוען שיחות...
              </p>
            ) : sortedTeacherChats.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-semibold text-slate-500">
                אין שיחות עדיין.
              </p>
            ) : (
              sortedTeacherChats.map((chat) => {
                const isUnread =
                  Array.isArray(chat.unreadBy) && chat.unreadBy.includes(currentUserId);

                const title = formatChatTitle(chat, currentUserId);
                const time = formatLastActivity(chat.updatedAt || chat.createdAt);

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

                        <span
                          className={`mt-2 block truncate text-xs ${
                            isUnread
                              ? 'font-black text-slate-900'
                              : 'font-semibold text-slate-500'
                          }`}
                        >
                          {chat.lastMessage || 'אין הודעות עדיין'}
                        </span>
                      </span>

                      {time ? (
                        <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-slate-400">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          {time}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <button
          type="button"
          onClick={() => setManagerChatStarted(true)}
          className="mt-5 flex w-full items-center justify-between gap-3 rounded-3xl bg-white p-5 text-right shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <span>
            <span className="block font-bold text-slate-900">
              שיחה עם המנהלת
            </span>
            <span className="mt-1 block text-sm text-slate-600">
              פתיחת שיחה מהירה עם מנהלת המערכת
            </span>
          </span>

          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </span>
        </button>

        {managerChatStarted ? (
          <div className="mt-3 rounded-2xl bg-violet-50 p-4 text-sm font-semibold leading-6 text-violet-700">
            פתיחת שיחה עם המנהלת
          </div>
        ) : null}

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <h2 className="text-xl font-bold text-slate-900">התלמידות שלי</h2>

          <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Search className="h-5 w-5 text-slate-400" aria-hidden="true" />

            <input
              value={studentQuery}
              onChange={(event) => setStudentQuery(event.target.value)}
              placeholder="חיפוש תלמידה"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>

          <div className="mt-4 max-h-64 overflow-y-auto rounded-2xl border border-slate-100">
            {loadingStudents ? (
              <p className="px-4 py-5 text-center text-sm font-semibold text-slate-500">
                טוען תלמידות...
              </p>
            ) : filteredStudents.length === 0 ? (
              <p className="px-4 py-5 text-center text-sm font-semibold text-slate-500">
                לא נמצאו תלמידות
              </p>
            ) : (
              filteredStudents.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => loadStudentDetails(student)}
                  className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-right text-sm font-bold text-slate-800 transition last:border-b-0 hover:bg-violet-50 focus:bg-violet-50 focus:outline-none"
                >
                  <span>{student.name}</span>
                  <span className="text-xs font-semibold text-violet-700">
                    פרטים
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <h2 className="text-xl font-bold text-slate-900">שיחה קבוצתית</h2>

          <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Search className="h-5 w-5 text-slate-400" aria-hidden="true" />

            <input
              value={groupQuery}
              onChange={(event) => setGroupQuery(event.target.value)}
              placeholder="חיפוש לבחירת תלמידות"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>

          <div className="mt-4 flex max-h-44 flex-wrap gap-2 overflow-y-auto rounded-2xl border border-slate-100 p-3">
            {loadingStudents ? (
              <p className="px-4 py-3 text-sm font-semibold text-slate-500">
                טוען תלמידות...
              </p>
            ) : filteredGroupStudents.length === 0 ? (
              <p className="px-4 py-3 text-sm font-semibold text-slate-500">
                לא נמצאו תלמידות
              </p>
            ) : (
              filteredGroupStudents.map((student) => {
                const selected = selectedGroupIds.includes(student.id);

                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => toggleGroupStudent(student.id)}
                    className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                      selected
                        ? 'bg-violet-600 text-white'
                        : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                    }`}
                  >
                    {student.name}
                  </button>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={startGroupConversation}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-button transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={selectedGroupIds.length === 0}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            התחלת שיחה קבוצתית
          </button>

          {groupStarted ? (
            <div className="mt-4 rounded-2xl bg-violet-50 p-4 text-sm font-semibold leading-6 text-violet-700">
              פתיחת שיחה עם{' '}
              {selectedGroupStudents.map((student) => student.name).join(', ')}
            </div>
          ) : null}
        </section>

        {selectedStudent ? (
          <div className="fixed inset-0 z-30 flex items-end bg-slate-950/35 px-3 py-5 sm:absolute sm:items-center sm:rounded-[32px] sm:px-4">
            <section className="mx-auto w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-violet-700">
                    פרטי תלמידה
                  </p>

                  <h2 className="mt-1 text-2xl font-bold text-slate-950">
                    {selectedStudent.name}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedStudent(null)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                  aria-label="סגירה"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              {loadingStudentDetails ? (
                <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-center text-sm font-semibold text-slate-500">
                  טוען פרטי תלמידה...
                </p>
              ) : (
                <>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    {detailItems.map((item) => (
                      <div key={item.key} className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-semibold text-slate-500">
                          {item.label}
                        </p>

                        <p className="mt-1 text-lg font-bold text-slate-900">
                          {selectedStudent[item.key]}
                          {item.suffix || ''}
                        </p>
                      </div>
                    ))}
                  </div>

                  <label className="mt-4 block">
                    <span className="text-sm font-bold text-slate-800">
                      הערות מורה
                    </span>

                    <textarea
                      defaultValue={selectedStudent.notes}
                      className="mt-2 min-h-28 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 outline-none focus:border-violet-400 focus:bg-white"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={startStudentConversation}
                    disabled={creatingStudentChat}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-button transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    {creatingStudentChat ? 'פותח שיחה...' : 'שיחה עם התלמידה'}
                  </button>

                  {studentChatStarted ? (
                    <div className="mt-3 rounded-2xl bg-violet-50 p-4 text-sm font-semibold leading-6 text-violet-700">
                      פותח את השיחה...
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </div>
        ) : null}

        <BottomNav />
      </div>
    </main>
  );
}

export default TeacherMore;

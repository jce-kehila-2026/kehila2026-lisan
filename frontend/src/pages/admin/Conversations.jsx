import React, { useEffect, useState } from 'react';
import { ArrowRight, MessageSquareText, RefreshCw, UserRound } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000/api';

function Conversations() {
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [error, setError] = useState('');

  const getToken = () => localStorage.getItem('lisan-token');

  const request = async (path) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  };

  const loadStudents = async () => {
    try {
      setLoading(true);
      setError('');

      const data = await request('/admin/users');
      const onlyStudents = (data.users || []).filter((user) => user.role === 'student');

      setStudents(onlyStudents);
    } catch (err) {
      setError(err.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const loadStudentConversations = async (student) => {
    try {
      setSelectedStudent(student);
      setSelectedConversation(null);
      setConversationsLoading(true);
      setError('');

      const data = await request(`/admin/conversations?studentId=${student.id}`);
      setConversations(data.conversations || []);
    } catch (err) {
      setError(err.message || 'Failed to load conversations');
    } finally {
      setConversationsLoading(false);
    }
  };

  const openConversation = async (conversationId) => {
    try {
      setConversationLoading(true);
      setError('');

      const data = await request(`/admin/conversations/${conversationId}`);
      setSelectedConversation(data.conversation);
    } catch (err) {
      setError(err.message || 'Failed to load conversation');
    } finally {
      setConversationLoading(false);
    }
  };

  const backToStudents = () => {
    setSelectedStudent(null);
    setSelectedConversation(null);
    setConversations([]);
  };

  useEffect(() => {
    loadStudents();
  }, []);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6" dir="rtl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-primary">
            <MessageSquareText size={18} />
            <span>בדיקת שיחות</span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900">בדיקת שיחות AI</h1>

          <p className="mt-1 text-sm text-slate-600">
            בחרי תלמידה כדי לראות את כל שיחות ה־AI שלה.
          </p>
        </div>

        <button
          onClick={selectedStudent ? () => loadStudentConversations(selectedStudent) : loadStudents}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-button opacity-90 transition hover:opacity-100"
        >
          <RefreshCw size={16} />
          רענון
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700 shadow-card">
          {error}
        </div>
      )}

      {!selectedStudent && (
        <>
          {loading ? (
            <div className="rounded-2xl bg-white p-6 text-center shadow-card">
              טוען תלמידות...
            </div>
          ) : students.length === 0 ? (
            <div className="rounded-2xl bg-white p-6 text-center text-slate-600 shadow-card">
              אין תלמידות להצגה.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {students.map((student) => (
                <button
                  key={student.id}
                  onClick={() => loadStudentConversations(student)}
                  className="rounded-2xl bg-white p-5 text-right shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <UserRound size={22} />
                    </div>

                    <div>
                      <h2 className="font-bold text-slate-900">
                        {student.name || 'ללא שם'}
                      </h2>
                      <p className="text-sm text-slate-500">{student.email}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 text-xs">
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">
                      רמה: {student.level || 'A1'}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                      שפה: {student.language || 'ar'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {selectedStudent && (
        <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
          <div className="rounded-2xl bg-white p-5 shadow-card">
            <button
              onClick={backToStudents}
              className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-primary"
            >
              <ArrowRight size={16} />
              חזרה לרשימת תלמידות
            </button>

            <h2 className="text-lg font-bold text-slate-900">
              {selectedStudent.name || 'ללא שם'}
            </h2>
            <p className="text-sm text-slate-500">{selectedStudent.email}</p>

            <div className="mt-4 border-t pt-4">
              <h3 className="mb-3 font-bold text-slate-800">שיחות AI</h3>

              {conversationsLoading ? (
                <p className="text-sm text-slate-500">טוען שיחות...</p>
              ) : conversations.length === 0 ? (
                <p className="text-sm text-slate-500">אין שיחות לתלמידה הזו.</p>
              ) : (
                <div className="space-y-2">
                  {conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      onClick={() => openConversation(conversation.id)}
                      className={`w-full rounded-xl border p-3 text-right transition hover:bg-primary/10 ${
                        selectedConversation?.id === conversation.id
                          ? 'border-primary bg-primary/10'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="font-semibold text-slate-900">
                        {conversation.title || 'שיחה'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {conversation.messagesCount || 0} הודעות · רמה {conversation.level || 'A1'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-card">
            {!selectedConversation && !conversationLoading && (
              <div className="flex min-h-[300px] items-center justify-center text-center text-slate-500">
                בחרי שיחה מהרשימה כדי לראות את ההודעות.
              </div>
            )}

            {conversationLoading && (
              <div className="flex min-h-[300px] items-center justify-center text-slate-500">
                טוען הודעות...
              </div>
            )}

            {selectedConversation && !conversationLoading && (
              <>
                <div className="mb-4 border-b pb-4">
                  <h2 className="text-xl font-bold text-slate-900">
                    {selectedConversation.title || 'שיחה'}
                  </h2>
                  <p className="text-sm text-slate-500">
                    רמה: {selectedConversation.level || 'A1'}
                  </p>
                </div>

                <div className="space-y-3">
                  {(selectedConversation.messages || []).length === 0 ? (
                    <p className="text-center text-sm text-slate-500">
                      אין הודעות בשיחה הזו.
                    </p>
                  ) : (
                    selectedConversation.messages.map((message, index) => (
                      <div
                        key={index}
                        className={`rounded-2xl p-4 ${
                          message.sender === 'user'
                            ? 'bg-primary/10 text-slate-900'
                            : 'bg-slate-100 text-slate-900'
                        }`}
                      >
                        <div className="mb-1 text-xs font-bold text-slate-500">
                          {message.sender === 'user' ? 'תלמידה' : 'AI'}
                        </div>
                        <div className="whitespace-pre-wrap text-sm leading-6">
                          {message.text || message.transcribedText || 'הודעה קולית / ללא טקסט'}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Conversations;

import React, { useMemo, useState } from 'react';
import { MessageCircle, Search, Send } from 'lucide-react';
import BottomNav from '../components/BottomNav.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { demoStudentFriends } from '../data/studentMockData.js';

const demoMessages = [
  { id: 'bot-1', role: 'bot', text: 'שלום! על מה תרצו לתרגל היום?' },
  { id: 'user-1', role: 'user', text: 'אנחנו רוצות לתרגל שיחה בקופת חולים.' },
  { id: 'bot-2', role: 'bot', text: 'מעולה. נתחיל בשאלה קצרה: איך קובעים תור?' },
];

function SharedChat() {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState('');

  const filteredStudents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return demoStudentFriends;

    return demoStudentFriends.filter((student) =>
      `${student.name} ${student.level}`.toLowerCase().includes(normalizedQuery),
    );
  }, [query]);

  const selectedStudents = demoStudentFriends.filter((student) => selectedIds.includes(student.id));

  const toggleStudent = (id) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((studentId) => studentId !== id) : [...current, id],
    );
    setStarted(false);
    setStatus('');
  };

  const startConversation = () => {
    if (selectedIds.length === 0) {
      setStatus('בחרי לפחות חברה אחת להתחלת שיחה.');
      setStarted(false);
      return;
    }

    setStatus('');
    setStarted(true);
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="relative mx-auto min-h-[calc(100vh-2.5rem)] max-w-xl pb-28 sm:min-h-[780px]" dir="rtl">
        <PageHeader showBack />

        <section className="mt-6 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
              <MessageCircle className="h-7 w-7" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-violet-700">שיחה עם חברות</p>
              <h1 className="mt-1 text-2xl font-bold leading-tight text-slate-950">
                בחרי חברות לתרגול משותף
              </h1>
            </div>
          </div>

          <label className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Search className="h-5 w-5 text-slate-400" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חיפוש תלמידות"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            {filteredStudents.map((student) => {
              const selected = selectedIds.includes(student.id);
              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => toggleStudent(student.id)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                    selected ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                  }`}
                >
                  {student.name} · {student.level}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={startConversation}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-button transition hover:bg-violet-700"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            התחלת שיחה
          </button>
          {status ? <p className="mt-3 text-sm font-bold text-violet-700">{status}</p> : null}
        </section>

        {started ? (
          <section className="mt-5 rounded-3xl bg-white p-5 shadow-card sm:p-6">
            <p className="text-sm font-bold text-violet-700">
              שיחה עם {selectedStudents.map((student) => student.name).join(', ')}
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {demoMessages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'self-end bg-violet-600 text-white'
                      : 'self-start bg-slate-100 text-slate-800'
                  }`}
                >
                  {message.text}
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700">
              פתיחת שיחה
            </div>
          </section>
        ) : null}

        <BottomNav />
      </div>
    </main>
  );
}

export default SharedChat;

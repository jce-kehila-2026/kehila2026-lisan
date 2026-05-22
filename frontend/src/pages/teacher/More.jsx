import React, { useMemo, useState } from 'react';
import { MessageCircle, Search, Send, UsersRound, X } from 'lucide-react';
import BottomNav from '../../components/BottomNav.jsx';
import PageHeader from '../../components/PageHeader.jsx';

const teacherStudents = [
  {
    id: 'student-1',
    name: 'ליאן',
    level: 'א1',
    progress: 42,
    learnedWords: 86,
    conversations: 14,
    lastActivity: 'היום',
    notes: 'מתקדמת יפה בשיחות קצרות, כדאי לחזק שאלות בזמן עבר.',
  },
  {
    id: 'student-2',
    name: 'סמאח',
    level: 'א2',
    progress: 58,
    learnedWords: 124,
    conversations: 21,
    lastActivity: 'אתמול',
    notes: 'חזקה באוצר מילים יומיומי, צריכה עוד תרגול בהגייה.',
  },
  {
    id: 'student-3',
    name: 'רנין',
    level: 'ב1',
    progress: 71,
    learnedWords: 203,
    conversations: 34,
    lastActivity: 'לפני יומיים',
    notes: 'אפשר לתת לה משימות שיחה ארוכות יותר.',
  },
  {
    id: 'student-4',
    name: 'היבא',
    level: 'ב2',
    progress: 66,
    learnedWords: 188,
    conversations: 29,
    lastActivity: 'השבוע',
    notes: 'כדאי לתרגל מעבר בין עברית לערבית בהסברים.',
  },
  {
    id: 'student-5',
    name: 'אמאל',
    level: 'ג',
    progress: 83,
    learnedWords: 270,
    conversations: 43,
    lastActivity: 'היום',
    notes: 'מוכנה לתרגול שיחות מורכבות עם משוב מדויק.',
  },
  {
    id: 'student-6',
    name: 'נור',
    level: 'א1',
    progress: 35,
    learnedWords: 62,
    conversations: 9,
    lastActivity: 'לפני שלושה ימים',
    notes: 'כדאי להתחיל מחיזוק משפטי פתיחה פשוטים.',
  },
  {
    id: 'student-7',
    name: 'מייס',
    level: 'א2',
    progress: 49,
    learnedWords: 101,
    conversations: 17,
    lastActivity: 'אתמול',
    notes: 'מגיבה טוב לתרגול בקבוצות קטנות.',
  },
];

const detailItems = [
  { key: 'level', label: 'רמה' },
  { key: 'progress', label: 'התקדמות', suffix: '%' },
  { key: 'learnedWords', label: 'מילים שנלמדו' },
  { key: 'conversations', label: 'מספר שיחות' },
  { key: 'lastActivity', label: 'פעילות אחרונה' },
];

function TeacherMore() {
  const [studentQuery, setStudentQuery] = useState('');
  const [groupQuery, setGroupQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [groupStarted, setGroupStarted] = useState(false);
  const [managerChatStarted, setManagerChatStarted] = useState(false);
  const [studentChatStarted, setStudentChatStarted] = useState(false);

  const filteredStudents = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    if (!query) return teacherStudents;
    return teacherStudents.filter((student) => student.name.toLowerCase().includes(query));
  }, [studentQuery]);

  const filteredGroupStudents = useMemo(() => {
    const query = groupQuery.trim().toLowerCase();
    if (!query) return teacherStudents;
    return teacherStudents.filter((student) => student.name.toLowerCase().includes(query));
  }, [groupQuery]);

  const selectedGroupStudents = teacherStudents.filter((student) => selectedGroupIds.includes(student.id));

  const toggleGroupStudent = (id) => {
    setSelectedGroupIds((current) =>
      current.includes(id) ? current.filter((studentId) => studentId !== id) : [...current, id],
    );
    setGroupStarted(false);
  };

  const startGroupConversation = () => {
    if (selectedGroupIds.length > 0) {
      setGroupStarted(true);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="relative mx-auto min-h-[calc(100vh-2.5rem)] max-w-xl pb-28 sm:min-h-[780px]" dir="rtl">
        <PageHeader showBack />

        <section className="mt-6 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-violet-700">עוד</p>
              <h1 className="mt-2 text-2xl font-bold text-slate-950">כלי מורה מהירים</h1>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
              <UsersRound className="h-6 w-6" aria-hidden="true" />
            </span>
          </div>
        </section>

        <button
          type="button"
          onClick={() => setManagerChatStarted(true)}
          className="mt-5 flex w-full items-center justify-between gap-3 rounded-3xl bg-white p-5 text-right shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <span>
            <span className="block font-bold text-slate-900">שיחה עם המנהלת</span>
            <span className="mt-1 block text-sm text-slate-600">פתיחת שיחה מהירה עם מנהלת המערכת</span>
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
            {filteredStudents.map((student) => (
              <button
                key={student.id}
                type="button"
                onClick={() => {
                  setSelectedStudent(student);
                  setStudentChatStarted(false);
                }}
                className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-right text-sm font-bold text-slate-800 transition last:border-b-0 hover:bg-violet-50 focus:bg-violet-50 focus:outline-none"
              >
                <span>{student.name}</span>
                <span className="text-xs font-semibold text-violet-700">פרטים</span>
              </button>
            ))}
            {filteredStudents.length === 0 ? (
              <p className="px-4 py-5 text-center text-sm font-semibold text-slate-500">לא נמצאו תלמידות</p>
            ) : null}
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
            {filteredGroupStudents.map((student) => {
              const selected = selectedGroupIds.includes(student.id);
              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => toggleGroupStudent(student.id)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                    selected ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                  }`}
                >
                  {student.name}
                </button>
              );
            })}
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
              פתיחת שיחה עם {selectedGroupStudents.map((student) => student.name).join(', ')}
            </div>
          ) : null}
        </section>

        {selectedStudent ? (
          <div className="fixed inset-0 z-30 flex items-end bg-slate-950/35 px-4 py-5 sm:absolute sm:items-center sm:rounded-[32px]">
            <section className="mx-auto w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-violet-700">פרטי תלמידה</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-950">{selectedStudent.name}</h2>
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

              <div className="mt-5 grid grid-cols-2 gap-3">
                {detailItems.map((item) => (
                  <div key={item.key} className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-500">{item.label}</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {selectedStudent[item.key]}
                      {item.suffix || ''}
                    </p>
                  </div>
                ))}
              </div>

              <label className="mt-4 block">
                <span className="text-sm font-bold text-slate-800">הערות מורה</span>
                <textarea
                  defaultValue={selectedStudent.notes}
                  className="mt-2 min-h-28 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 outline-none focus:border-violet-400 focus:bg-white"
                />
              </label>

              <button
                type="button"
                onClick={() => setStudentChatStarted(true)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-button transition hover:bg-violet-700"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                שיחה עם התלמידה
              </button>
              {studentChatStarted ? (
                <div className="mt-3 rounded-2xl bg-violet-50 p-4 text-sm font-semibold leading-6 text-violet-700">
                  פתיחת שיחה עם {selectedStudent.name}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        <BottomNav />
      </div>
    </main>
  );
}

export default TeacherMore;

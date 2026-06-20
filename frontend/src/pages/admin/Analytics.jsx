import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Activity,
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  Filter,
  Gamepad2,
  GraduationCap,
  Inbox,
  KeyRound,
  Mic,
  MessageSquareText,
  MessagesSquare,
  RefreshCw,
  Search,
  ServerCrash,
  Share2,
  TrendingDown,
  TrendingUp,
  Users,
  UserRound,
  UsersRound,
  XCircle,
} from 'lucide-react';

import { getFullAnalytics } from '../../services/adminApi.js';
import { getStoredUser, logout } from '../../services/auth.js';

const EMPTY_TEXT = 'אין נתונים';
const LEVELS = ['A1', 'A2', 'B1', 'B2'];

const TABS = [
  { id: 'overview', label: 'סקירה כללית' },
  { id: 'students', label: 'תלמידות' },
  { id: 'teachers', label: 'מורות' },
  { id: 'progress', label: 'התקדמות' },
  { id: 'aiChats', label: 'שיחות AI' },
  { id: 'sharedChats', label: 'צ׳אטים משותפים' },
  { id: 'vocabulary', label: 'אוצר מילים' },
  { id: 'audio', label: 'הקלטות' },
  { id: 'system', label: 'מערכת' },
];

// ── helpers ─────────────────────────────────────────────────────────────

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;

  if (typeof value === 'object') {
    if (typeof value._seconds === 'number') {
      return new Date(value._seconds * 1000).toISOString();
    }

    if (typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000).toISOString();
    }
  }

  return null;
}

function formatDate(value) {
  const normalized = normalizeDate(value);

  if (!normalized) {
    return EMPTY_TEXT;
  }

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return EMPTY_TEXT;
  }

  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatNumber(value) {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return '0';
  }

  return new Intl.NumberFormat('he-IL').format(num);
}

function average(numbers) {
  const valid = numbers.filter((value) => typeof value === 'number' && Number.isFinite(value));

  if (valid.length === 0) {
    return 0;
  }

  const sum = valid.reduce((total, value) => total + value, 0);

  return Math.round((sum / valid.length) * 10) / 10;
}

// ── small presentational building blocks ───────────────────────────────

function AnalyticsHeroIllustration() {
  return (
    <svg
      viewBox="0 0 280 220"
      className="h-auto w-[220px] xl:w-[260px]"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="ahBarGrad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#E879F9" />
        </linearGradient>
        <linearGradient id="ahRingGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="55%" stopColor="#D946EF" />
          <stop offset="100%" stopColor="#F9A8D4" />
        </linearGradient>
        <radialGradient id="ahGlow" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#C4B5FD" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#C4B5FD" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="140" cy="105" r="110" fill="url(#ahGlow)" />

      <g transform="rotate(-7 95 120)">
        <rect x="28" y="55" width="140" height="120" rx="22" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.5" />
        <rect x="50" y="138" width="16" height="22" rx="6" fill="url(#ahBarGrad)" opacity="0.55" />
        <rect x="74" y="118" width="16" height="42" rx="6" fill="url(#ahBarGrad)" opacity="0.75" />
        <rect x="98" y="96" width="16" height="64" rx="6" fill="url(#ahBarGrad)" opacity="0.9" />
        <rect x="122" y="76" width="16" height="84" rx="6" fill="url(#ahBarGrad)" />
      </g>

      <g transform="rotate(5 190 130)">
        <rect x="128" y="92" width="124" height="112" rx="22" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.5" />
        <circle cx="190" cy="148" r="34" fill="none" stroke="#F1E9FF" strokeWidth="11" />
        <circle
          cx="190"
          cy="148"
          r="34"
          fill="none"
          stroke="url(#ahRingGrad)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray="160 214"
          transform="rotate(-90 190 148)"
        />
        <text x="190" y="143" textAnchor="middle" fontSize="17" fontWeight="900" fill="#160A52">
          75%
        </text>
        <text x="190" y="159" textAnchor="middle" fontSize="8" fontWeight="700" fill="#94A3B8">
          התקדמות
        </text>
        <path
          d="M150 188 L168 178 L182 184 L206 168"
          fill="none"
          stroke="#34D399"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="206" cy="168" r="4" fill="#34D399" />
      </g>

      <g>
        <rect x="16" y="20" width="76" height="30" rx="15" fill="#7C3AED" />
        <path
          d="M30 36 L36 29 L42 34 L50 25"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text x="58" y="39" textAnchor="middle" fontSize="13" fontWeight="900" fill="#FFFFFF">
          נתונים
        </text>
      </g>

      <circle cx="248" cy="58" r="5" fill="#F9A8D4" opacity="0.9" />
      <circle cx="262" cy="80" r="3.5" fill="#8B5CF6" opacity="0.8" />
      <circle cx="22" cy="190" r="4" fill="#D946EF" opacity="0.6" />
    </svg>
  );
}

function StatCard({ icon: Icon, label, value, gradient }) {
  return (
    <article className="rounded-[1.6rem] border border-violet-100/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.95)_0%,rgba(245,240,255,0.9)_48%,rgba(255,241,248,0.88)_100%)] p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-button`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>

        <span className="text-2xl font-black leading-none text-slate-950">
          {typeof value === 'string' ? value : formatNumber(value)}
        </span>
      </div>

      <h3 className="mt-3 text-sm font-black leading-5 text-slate-900">{label}</h3>
    </article>
  );
}

function Panel({ title, subtitle, icon: Icon, children, className = '' }) {
  return (
    <section
      className={`rounded-[1.75rem] border border-[#EEE5FF] bg-white/85 p-5 shadow-card backdrop-blur-[6px] sm:p-6 ${className}`}
    >
      {title ? (
        <div className="mb-4 flex items-center gap-3">
          {Icon ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          ) : null}

          <div className="min-w-0">
            <h2 className="text-base font-black leading-5 text-[#160A52]">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 text-xs font-bold leading-4 text-slate-500">{subtitle}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {children}
    </section>
  );
}

function EmptyNote({ children = EMPTY_TEXT }) {
  return (
    <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-400">
      {children}
    </p>
  );
}

function BarList({ data, color = 'bg-violet-500', valueFormatter = formatNumber }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  const hasValues = data.some((item) => item.value > 0);

  if (!hasValues) {
    return <EmptyNote />;
  }

  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between text-xs font-black text-slate-600">
            <span>{item.label}</span>
            <span>{valueFormatter(item.value)}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-violet-50">
            <div
              className={`h-full rounded-full ${color} transition-[width] duration-500`}
              style={{ width: `${Math.min(100, (item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function PercentRow({ segments }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total === 0) {
    return <EmptyNote />;
  }

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {segments.map((segment) =>
          segment.value > 0 ? (
            <span
              key={segment.label}
              className={segment.color}
              style={{ width: `${(segment.value / total) * 100}%` }}
              title={`${segment.label}: ${segment.value}`}
            />
          ) : null
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-slate-600">
        {segments.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${segment.color}`} aria-hidden="true" />
            {segment.label}: {formatNumber(segment.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

function RankedList({ items, valueLabel = '', accentColor = 'text-violet-700', bgColor = 'bg-violet-50/60' }) {
  if (!items || items.length === 0) {
    return <EmptyNote />;
  }

  return (
    <ol className="grid gap-2 sm:grid-cols-2">
      {items.map((item, index) => (
        <li
          key={item.id}
          className={`flex items-center justify-between gap-3 rounded-xl ${bgColor} px-3 py-2 text-sm font-bold text-slate-700`}
        >
          <span className="truncate">
            {index + 1}. {item.name || EMPTY_TEXT}
          </span>
          <span className={`shrink-0 ${accentColor}`}>
            {formatNumber(item.value)}
            {valueLabel}
          </span>
        </li>
      ))}
    </ol>
  );
}

// ── tabs ─────────────────────────────────────────────────────────────────

function OverviewTab({ data }) {
  const studentsByLevel = LEVELS.map((level) => ({
    label: level,
    value: data.charts.studentsByLevel[level] || 0,
  }));
  const messagesByLevel = LEVELS.map((level) => ({
    label: level,
    value: data.charts.messagesByLevel[level] || 0,
  }));
  const progressByLevel = LEVELS.map((level) => ({
    label: level,
    value: data.charts.progressByLevel[level] || 0,
  }));
  const wordsByLevel = LEVELS.map((level) => ({
    label: level,
    value: data.charts.wordsByLevel[level] || 0,
  }));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel title="תלמידות לפי רמה" icon={UsersRound}>
        <BarList data={studentsByLevel} color="bg-violet-500" />
      </Panel>

      <Panel title="הודעות AI לפי רמה" icon={MessageSquareText}>
        <BarList data={messagesByLevel} color="bg-fuchsia-500" />
      </Panel>

      <Panel
        title="התקדמות ממוצעת לפי רמה"
        subtitle="אחוז תשובות נכונות בתרגול"
        icon={TrendingUp}
      >
        <BarList data={progressByLevel} color="bg-emerald-500" valueFormatter={(v) => `${v}%`} />
      </Panel>

      <Panel title="מילים לפי רמה" icon={BookOpenCheck}>
        <BarList data={wordsByLevel} color="bg-amber-500" />
      </Panel>
    </div>
  );
}

function StudentsTab({ students }) {
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [teacherFilter, setTeacherFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const teacherOptions = useMemo(() => {
    const names = new Set();
    students.forEach((student) => student.teacherNames.forEach((name) => names.add(name)));
    return Array.from(names);
  }, [students]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return students.filter((student) => {
      if (
        normalizedQuery &&
        !`${student.name} ${student.email}`.toLowerCase().includes(normalizedQuery)
      ) {
        return false;
      }

      if (levelFilter !== 'all' && student.level !== levelFilter) {
        return false;
      }

      if (teacherFilter !== 'all' && !student.teacherNames.includes(teacherFilter)) {
        return false;
      }

      if (statusFilter !== 'all' && student.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [students, query, levelFilter, teacherFilter, statusFilter]);

  return (
    <Panel
      title="טבלת תלמידות"
      subtitle={`מציגה ${filtered.length} מתוך ${students.length}`}
      icon={UsersRound}
    >
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="flex min-h-11 flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="חיפוש לפי שם או אימייל"
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
          />
        </label>

        <select
          value={levelFilter}
          onChange={(event) => setLevelFilter(event.target.value)}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
        >
          <option value="all">כל הרמות</option>
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>

        <select
          value={teacherFilter}
          onChange={(event) => setTeacherFilter(event.target.value)}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
        >
          <option value="all">כל המורות</option>
          {teacherOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
        >
          <option value="all">כל הסטטוסים</option>
          <option value="active">פעילה</option>
          <option value="inactive">לא פעילה</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[920px]">
          <div className="grid grid-cols-[1.2fr_1.4fr_0.55fr_1.1fr_0.9fr_0.7fr_0.7fr_0.7fr_0.8fr_0.7fr] gap-3 rounded-xl bg-violet-50 px-3 py-2.5 text-[11px] font-black text-violet-700">
            <span>שם</span>
            <span>אימייל</span>
            <span>רמה</span>
            <span>מורה/ות</span>
            <span>כניסה אחרונה</span>
            <span>שיחות AI</span>
            <span>הודעות</span>
            <span>הקלטות</span>
            <span>התקדמות</span>
            <span>סטטוס</span>
          </div>

          {filtered.length === 0 ? (
            <EmptyNote />
          ) : (
            filtered.map((student) => (
              <div
                key={student.id}
                className="grid grid-cols-[1.2fr_1.4fr_0.55fr_1.1fr_0.9fr_0.7fr_0.7fr_0.7fr_0.8fr_0.7fr] items-center gap-3 border-t border-[#EEE5FF] px-3 py-3 text-sm transition hover:bg-violet-50/30"
              >
                <span className="truncate font-black text-slate-900">
                  {student.name || EMPTY_TEXT}
                </span>
                <span className="truncate font-semibold text-slate-600">
                  {student.email || EMPTY_TEXT}
                </span>
                <span className="font-bold text-slate-700">{student.level || EMPTY_TEXT}</span>
                <span className="truncate font-semibold text-slate-600">
                  {student.teacherNames.length > 0
                    ? student.teacherNames.join(', ')
                    : EMPTY_TEXT}
                </span>
                <span className="font-semibold text-slate-500">
                  {formatDate(student.lastLoginAt)}
                </span>
                <span className="font-bold text-slate-700">{student.aiChatsCount}</span>
                <span className="font-bold text-slate-700">{student.aiMessagesCount}</span>
                <span className="font-bold text-slate-700">
                  {student.voiceRecordingsCount}
                </span>
                <span className="font-bold text-violet-700">{student.averageProgress}%</span>
                <span
                  className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-black ${
                    student.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-rose-50 text-rose-600'
                  }`}
                >
                  {student.status === 'active' ? 'פעילה' : 'לא פעילה'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </Panel>
  );
}

function TeachersTab({ teachers }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return teachers;
    }

    return teachers.filter((teacher) =>
      `${teacher.name} ${teacher.email}`.toLowerCase().includes(normalizedQuery)
    );
  }, [teachers, query]);

  return (
    <Panel
      title="טבלת מורות"
      subtitle={`מציגה ${filtered.length} מתוך ${teachers.length}`}
      icon={GraduationCap}
    >
      <label className="mb-4 flex min-h-11 max-w-md items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3">
        <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="חיפוש לפי שם או אימייל"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
        />
      </label>

      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          <div className="grid grid-cols-[1.3fr_1.6fr_0.8fr_1.1fr_0.8fr_1fr_1fr] gap-3 rounded-xl bg-violet-50 px-3 py-2.5 text-[11px] font-black text-violet-700">
            <span>שם</span>
            <span>אימייל</span>
            <span>תלמידות</span>
            <span>הודעות עם תלמידות</span>
            <span>ביקורות</span>
            <span>התקדמות ממוצעת</span>
            <span>פעילות אחרונה</span>
          </div>

          {filtered.length === 0 ? (
            <EmptyNote />
          ) : (
            filtered.map((teacher) => (
              <div
                key={teacher.id}
                className="grid grid-cols-[1.3fr_1.6fr_0.8fr_1.1fr_0.8fr_1fr_1fr] items-center gap-3 border-t border-[#EEE5FF] px-3 py-3 text-sm transition hover:bg-violet-50/30"
              >
                <span className="truncate font-black text-slate-900">
                  {teacher.name || EMPTY_TEXT}
                </span>
                <span className="truncate font-semibold text-slate-600">
                  {teacher.email || EMPTY_TEXT}
                </span>
                <span className="font-bold text-slate-700">{teacher.studentsCount}</span>
                <span className="font-bold text-slate-700">
                  {teacher.messagesWithStudentsCount}
                </span>
                <span className="font-bold text-slate-700">{teacher.reviewsCount}</span>
                <span className="font-bold text-violet-700">
                  {teacher.averageStudentsProgress}%
                </span>
                <span className="font-semibold text-slate-500">
                  {formatDate(teacher.lastActivityAt)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </Panel>
  );
}

function ProgressTab({ progress }) {
  const byLevel = LEVELS.map((level) => ({
    label: level,
    value: progress.byLevel[level] || 0,
  }));

  const topStudents = progress.topStudents.map((student) => ({
    id: student.id,
    name: student.name,
    value: student.averageProgress,
  }));
  const bottomStudents = progress.bottomStudents.map((student) => ({
    id: student.id,
    name: student.name,
    value: student.averageProgress,
  }));
  const topGameStudents = (progress.vocabularyGame?.topStudents || []).map((student) => ({
    id: student.id,
    name: student.name,
    value: student.gameLevelsCompleted,
  }));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel
        title="התקדמות ממוצעת בתרגולי דיבור"
        subtitle="מבוסס על הערכות AI לתרגולי שיחה מוקלטים"
        icon={TrendingUp}
      >
        <p className="text-4xl font-black text-violet-700">{progress.overallAverage}%</p>
        <p className="mt-1 text-xs font-bold text-slate-500">
          ממוצע אחוז תשובות נכונות בתרגולי הדיבור המוערכים
        </p>
      </Panel>

      <Panel title="התקדמות לפי רמה" icon={BarChart3}>
        <BarList data={byLevel} color="bg-violet-500" valueFormatter={(v) => `${v}%`} />
      </Panel>

      <Panel
        title="התקדמות במשחק אוצר המילים"
        subtitle="שלבים שהושלמו במשחק אוצר המילים בפועל"
        icon={Gamepad2}
        className="lg:col-span-2"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-violet-50/60 px-4 py-3">
            <p className="text-2xl font-black text-violet-700">
              {formatNumber(progress.vocabularyGame?.studentsWithActivity)}
            </p>
            <p className="mt-1 text-xs font-bold text-slate-500">תלמידות עם פעילות במשחק</p>
          </div>
          <div className="rounded-2xl bg-violet-50/60 px-4 py-3">
            <p className="text-2xl font-black text-violet-700">
              {formatNumber(progress.vocabularyGame?.totalLevelsCompleted)}
            </p>
            <p className="mt-1 text-xs font-bold text-slate-500">סך כל השלבים שהושלמו</p>
          </div>
          <div className="rounded-2xl bg-violet-50/60 px-4 py-3">
            <p className="text-2xl font-black text-violet-700">
              {formatNumber(progress.vocabularyGame?.averageLevelsPerStudent)}
            </p>
            <p className="mt-1 text-xs font-bold text-slate-500">ממוצע שלבים לתלמידה</p>
          </div>
        </div>

        <div className="mt-4">
          <RankedList items={topGameStudents} valueLabel=" שלבים" bgColor="bg-violet-50/60" />
        </div>
      </Panel>

      <Panel title="הכי הרבה התקדמות בדיבור" icon={TrendingUp}>
        <RankedList
          items={topStudents}
          valueLabel="%"
          accentColor="text-emerald-700"
          bgColor="bg-emerald-50/60"
        />
      </Panel>

      <Panel title="הכי פחות התקדמות בדיבור" icon={TrendingDown}>
        <RankedList
          items={bottomStudents}
          valueLabel="%"
          accentColor="text-rose-600"
          bgColor="bg-rose-50/60"
        />
      </Panel>

      <Panel title="טבלה מפורטת לכל תלמידה" icon={ClipboardList} className="lg:col-span-2">
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-[1.4fr_0.6fr_0.8fr_0.8fr_0.8fr] gap-3 rounded-xl bg-violet-50 px-3 py-2.5 text-[11px] font-black text-violet-700">
              <span>שם</span>
              <span>רמה</span>
              <span>שיחות AI</span>
              <span>הקלטות</span>
              <span>התקדמות</span>
            </div>

            {progress.details.length === 0 ? (
              <EmptyNote />
            ) : (
              progress.details.map((student) => (
                <div
                  key={student.id}
                  className="grid grid-cols-[1.4fr_0.6fr_0.8fr_0.8fr_0.8fr] items-center gap-3 border-t border-[#EEE5FF] px-3 py-2.5 text-sm"
                >
                  <span className="truncate font-black text-slate-900">
                    {student.name || EMPTY_TEXT}
                  </span>
                  <span className="font-bold text-slate-700">{student.level || EMPTY_TEXT}</span>
                  <span className="font-bold text-slate-700">{student.aiChatsCount}</span>
                  <span className="font-bold text-slate-700">
                    {student.voiceRecordingsCount}
                  </span>
                  <span className="font-bold text-violet-700">{student.averageProgress}%</span>
                </div>
              ))
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function AiChatsTab({ ai }) {
  const byLevel = LEVELS.map((level) => ({
    label: level,
    value: ai.messagesByLevel[level] || 0,
  }));
  const topUsers = ai.topStudentsByUsage.map((student) => ({
    id: student.id,
    name: student.name,
    value: student.aiMessagesCount,
  }));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel title="הודעות AI לפי רמה" icon={MessageSquareText}>
        <BarList data={byLevel} color="bg-fuchsia-500" />
      </Panel>

      <Panel title="התלמידות הכי פעילות ב-AI" icon={TrendingUp}>
        <RankedList items={topUsers} valueLabel=" הודעות" />
      </Panel>

      <Panel title="שגיאות Gemini / API" icon={AlertTriangle}>
        {ai.errors.length === 0 ? (
          <EmptyNote />
        ) : (
          <ul className="space-y-2 text-sm font-semibold text-rose-700">
            {ai.errors.map((item, index) => (
              <li key={index} className="rounded-xl bg-rose-50 px-3 py-2">
                {JSON.stringify(item)}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="שגיאות מכסה (Quota)" icon={ServerCrash}>
        {ai.quotaErrors.length === 0 ? (
          <EmptyNote />
        ) : (
          <ul className="space-y-2 text-sm font-semibold text-rose-700">
            {ai.quotaErrors.map((item, index) => (
              <li key={index} className="rounded-xl bg-rose-50 px-3 py-2">
                {JSON.stringify(item)}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="זמן תגובה ממוצע" icon={Activity} className="lg:col-span-2">
        <p className="text-3xl font-black text-violet-700">
          {formatNumber(ai.averageResponseTimeMs)}
          <span className="mr-1 text-base font-bold text-slate-500">מילישניות</span>
        </p>
      </Panel>
    </div>
  );
}

function SharedChatsTab({ sharedChats }) {
  const segments = [
    {
      label: 'תלמידה-מורה',
      value: sharedChats.studentTeacherChats,
      color: 'bg-violet-500',
    },
    {
      label: 'תלמידה-תלמידה',
      value: sharedChats.studentStudentChats,
      color: 'bg-fuchsia-400',
    },
  ];
  const topUsers = sharedChats.topUsers.map((item) => ({
    id: item.id,
    name: item.name,
    value: item.chatsCount,
  }));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel title="התפלגות סוגי הצ׳אטים" icon={Share2}>
        <PercentRow segments={segments} />
      </Panel>

      <Panel title="הודעות שלא נקראו" icon={Inbox}>
        <p className="text-3xl font-black text-violet-700">
          {formatNumber(sharedChats.unreadMessages)}
        </p>
      </Panel>

      <Panel title="סך כל ההודעות" icon={MessagesSquare}>
        <p className="text-3xl font-black text-violet-700">
          {formatNumber(sharedChats.totalMessages)}
        </p>
      </Panel>

      <Panel title="המשתמשות הכי פעילות" icon={TrendingUp}>
        <RankedList items={topUsers} valueLabel=" צ׳אטים" />
      </Panel>
    </div>
  );
}

function VocabularyTab({ vocabulary }) {
  const byLevel = LEVELS.map((level) => ({
    label: level,
    value: vocabulary.byLevel[level] || 0,
  }));
  const segments = [
    { label: 'ממתינות', value: vocabulary.pendingWords, color: 'bg-amber-400' },
    { label: 'אושרו', value: vocabulary.approvedWords, color: 'bg-emerald-500' },
    { label: 'נדחו', value: vocabulary.rejectedWords, color: 'bg-rose-400' },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel title="התפלגות סטטוס מילים" icon={BookOpenCheck}>
        <PercentRow segments={segments} />
      </Panel>

      <Panel title="מילים לפי רמה" icon={BarChart3}>
        <BarList data={byLevel} color="bg-amber-500" />
      </Panel>
    </div>
  );
}

function AudioTab({ audio }) {
  const byLevel = LEVELS.map((level) => ({
    label: level,
    value: audio.byLevel[level] || 0,
  }));
  const byStudent = audio.byStudent.map((item) => ({
    id: item.id,
    name: item.name,
    value: item.recordings,
  }));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel title="הקלטות לפי רמה" icon={Mic}>
        <BarList data={byLevel} color="bg-sky-500" />
      </Panel>

      <Panel title="ציון הגייה ממוצע" icon={Activity}>
        <p className="text-3xl font-black text-violet-700">
          {audio.averagePronunciationScore || 0}
        </p>
      </Panel>

      <Panel title="הקלטות לפי תלמידה" icon={UsersRound}>
        <RankedList items={byStudent} bgColor="bg-sky-50/60" accentColor="text-sky-700" />
      </Panel>

      <Panel title="הערכות שנכשלו" icon={XCircle}>
        <p className="text-3xl font-black text-rose-600">
          {formatNumber(audio.failedEvaluations)}
        </p>
      </Panel>
    </div>
  );
}

function SystemTab({ system }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel title="ניסיונות התחברות כושלים" icon={KeyRound}>
        <p className="text-3xl font-black text-violet-700">
          {formatNumber(system.failedLoginAttempts)}
        </p>
      </Panel>

      <Panel title="שגיאות API" icon={AlertTriangle}>
        {system.apiErrors.length === 0 ? (
          <EmptyNote />
        ) : (
          <ul className="space-y-2 text-sm font-semibold text-rose-700">
            {system.apiErrors.map((item, index) => (
              <li key={index} className="rounded-xl bg-rose-50 px-3 py-2">
                {JSON.stringify(item)}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="שגיאות Firebase" icon={ServerCrash}>
        {system.firebaseErrors.length === 0 ? (
          <EmptyNote />
        ) : (
          <ul className="space-y-2 text-sm font-semibold text-rose-700">
            {system.firebaseErrors.map((item, index) => (
              <li key={index} className="rounded-xl bg-rose-50 px-3 py-2">
                {JSON.stringify(item)}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="שגיאות מכסה" icon={AlertTriangle}>
        {system.quotaErrors.length === 0 ? (
          <EmptyNote />
        ) : (
          <ul className="space-y-2 text-sm font-semibold text-rose-700">
            {system.quotaErrors.map((item, index) => (
              <li key={index} className="rounded-xl bg-rose-50 px-3 py-2">
                {JSON.stringify(item)}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="שגיאות אחרונות" icon={ClipboardList} className="lg:col-span-2">
        {system.recentErrors.length === 0 ? (
          <EmptyNote />
        ) : (
          <ul className="space-y-2 text-sm font-semibold text-rose-700">
            {system.recentErrors.map((item, index) => (
              <li key={index} className="rounded-xl bg-rose-50 px-3 py-2">
                {JSON.stringify(item)}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────

function AdminAnalytics() {
  const navigate = useNavigate();
  const user = getStoredUser();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('overview');

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');

  const loadData = async (filters) => {
    setLoading(true);
    setError('');

    try {
      const result = await getFullAnalytics(filters || {});
      setData(result);
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError(err.message || 'שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyFilter = () => {
    loadData({ from: fromDate, to: toDate });
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  const searchedStudents = useMemo(() => {
    if (!data) return [];

    const normalizedQuery = globalSearch.trim().toLowerCase();

    if (!normalizedQuery) {
      return data.students;
    }

    return data.students.filter((student) =>
      `${student.name} ${student.email}`.toLowerCase().includes(normalizedQuery)
    );
  }, [data, globalSearch]);

  const searchedTeachers = useMemo(() => {
    if (!data) return [];

    const normalizedQuery = globalSearch.trim().toLowerCase();

    if (!normalizedQuery) {
      return data.teachers;
    }

    return data.teachers.filter((teacher) =>
      `${teacher.name} ${teacher.email}`.toLowerCase().includes(normalizedQuery)
    );
  }, [data, globalSearch]);

  const isSearchActive = globalSearch.trim().length > 0;

  // When a search is active, the scope is the matched people plus whoever
  // they're directly connected to (a matched student's own teacher, or a
  // matched teacher's own students) — so searching one student really does
  // show that student's numbers, not an unrelated text match.
  const searchScope = useMemo(() => {
    if (!data || !isSearchActive) return null;

    const teacherByName = new Map(data.teachers.map((teacher) => [teacher.name, teacher]));
    const studentIds = new Set();
    const teacherIds = new Set();

    searchedStudents.forEach((student) => {
      studentIds.add(student.id);
      student.teacherNames.forEach((name) => {
        const teacher = teacherByName.get(name);
        if (teacher) teacherIds.add(teacher.id);
      });
    });

    searchedTeachers.forEach((teacher) => teacherIds.add(teacher.id));

    if (searchedTeachers.length > 0) {
      const matchedTeacherNames = new Set(searchedTeachers.map((teacher) => teacher.name));
      data.students.forEach((student) => {
        if (student.teacherNames.some((name) => matchedTeacherNames.has(name))) {
          studentIds.add(student.id);
        }
      });
    }

    if (studentIds.size === 0 && teacherIds.size === 0) {
      return { students: [], teachers: [] };
    }

    const studentMap = new Map(data.students.map((student) => [student.id, student]));
    const teacherMap = new Map(data.teachers.map((teacher) => [teacher.id, teacher]));

    return {
      students: Array.from(studentIds).map((id) => studentMap.get(id)).filter(Boolean),
      teachers: Array.from(teacherIds).map((id) => teacherMap.get(id)).filter(Boolean),
    };
  }, [data, isSearchActive, searchedStudents, searchedTeachers]);

  const displayOverview = useMemo(() => {
    if (!data) return null;
    if (!isSearchActive || !searchScope) return { ...data.overview, scoped: false };

    const { students: scopedStudents, teachers: scopedTeachers } = searchScope;

    return {
      totalStudents: scopedStudents.length,
      totalTeachers: scopedTeachers.length,
      totalUsers: scopedStudents.length + scopedTeachers.length,
      activeUsers:
        scopedStudents.filter((student) => student.status === 'active').length +
        scopedTeachers.filter((teacher) => teacher.status === 'active').length,
      totalAiChats: scopedStudents.reduce((sum, student) => sum + student.aiChatsCount, 0),
      totalAiMessages: scopedStudents.reduce((sum, student) => sum + student.aiMessagesCount, 0),
      totalSharedChats: scopedStudents.reduce(
        (sum, student) => sum + (student.sharedChatsCount || 0),
        0
      ),
      totalAudioRecordings: scopedStudents.reduce(
        (sum, student) => sum + student.voiceRecordingsCount,
        0
      ),
      pendingWordsCount: data.overview.pendingWordsCount,
      averageProgress: average(scopedStudents.map((student) => student.averageProgress)),
      scoped: true,
    };
  }, [data, isSearchActive, searchScope]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_12%_8%,rgba(221,214,254,0.55),transparent_30%),linear-gradient(180deg,#FBF8FF_0%,#FFF8FC_48%,#F4EEFF_100%)] px-3 py-4 text-slate-900 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-7xl" dir="rtl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-black text-violet-700 shadow-sm transition hover:bg-violet-50"
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            חזרה ללוח הבקרה
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-violet-100/80 bg-white/90 px-5 py-2 text-sm font-black text-slate-700 shadow-[0_10px_28px_rgba(109,40,217,0.08)] transition hover:bg-violet-50"
          >
            <UserRound className="h-4 w-4 text-violet-700" aria-hidden="true" />
            יציאה
          </button>
        </header>

        <section className="mt-6 overflow-hidden rounded-[2rem] border border-[#EEE5FF] bg-white/75 p-5 shadow-card backdrop-blur-[8px] sm:p-7">
          <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-sm font-black text-violet-700">
                <BarChart3 className="h-4 w-4" aria-hidden="true" />
                לוח ניהול · {user?.name || 'מנהלת'}
              </p>

              <h1 className="mt-2 text-[clamp(1.9rem,3.6vw,3rem)] font-black leading-tight text-slate-950">
                ניתוח נתונים
              </h1>

              <p className="mt-2 text-sm font-semibold leading-7 text-slate-600 sm:text-base">
                תמונת מצב מלאה של פעילות המערכת
              </p>

              <div className="mt-5 flex flex-wrap items-end gap-3">
                <label className="grid gap-1 text-xs font-black text-slate-600">
                  מתאריך
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
                  />
                </label>

                <label className="grid gap-1 text-xs font-black text-slate-600">
                  עד תאריך
                  <input
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleApplyFilter}
                  disabled={loading}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 text-sm font-black text-white shadow-button transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Filter className="h-4 w-4" aria-hidden="true" />
                  סינון
                </button>

                <button
                  type="button"
                  onClick={() => loadData({ from: fromDate, to: toDate })}
                  disabled={loading}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-violet-50 px-4 text-sm font-black text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                  רענון
                </button>

                <label className="flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 sm:max-w-xs">
                  <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <input
                    value={globalSearch}
                    onChange={(event) => setGlobalSearch(event.target.value)}
                    placeholder="חיפוש כללי (תלמידות / מורות)"
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
                  />
                </label>
              </div>
            </div>

            <div className="hidden shrink-0 self-center lg:block">
              <AnalyticsHeroIllustration />
            </div>
          </div>
        </section>

        {error ? (
          <p className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-black text-rose-600">
            {error}
          </p>
        ) : null}

        {loading || !data ? (
          <div className="mt-8 flex flex-col items-center justify-center rounded-[2rem] border border-[#EEE5FF] bg-white/70 p-12 text-sm font-black text-slate-500">
            <RefreshCw className="mb-3 h-6 w-6 animate-spin text-violet-500" aria-hidden="true" />
            טוענת נתונים...
          </div>
        ) : (
          <>
            {displayOverview.scoped ? (
              <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-violet-100/80 px-4 py-2 text-sm font-black text-violet-700">
                <Search className="h-4 w-4" aria-hidden="true" />
                מציגה נתונים עבור החיפוש: "{globalSearch.trim()}" ({formatNumber(searchScope.students.length)} תלמידות,{' '}
                {formatNumber(searchScope.teachers.length)} מורות)
              </p>
            ) : null}

            <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard
                icon={UsersRound}
                label="תלמידות"
                value={displayOverview.totalStudents}
                gradient="from-violet-500 via-fuchsia-400 to-pink-300"
              />
              <StatCard
                icon={GraduationCap}
                label="מורים"
                value={displayOverview.totalTeachers}
                gradient="from-sky-500 via-blue-400 to-violet-300"
              />
              <StatCard
                icon={Users}
                label="משתמשים סה״כ"
                value={displayOverview.totalUsers}
                gradient="from-indigo-500 via-violet-400 to-fuchsia-300"
              />
              <StatCard
                icon={Activity}
                label="משתמשים פעילים"
                value={displayOverview.activeUsers}
                gradient="from-emerald-500 via-teal-400 to-sky-300"
              />
              <StatCard
                icon={MessageSquareText}
                label="שיחות AI"
                value={displayOverview.totalAiChats}
                gradient="from-fuchsia-500 via-pink-400 to-rose-300"
              />
              <StatCard
                icon={MessagesSquare}
                label="הודעות AI"
                value={displayOverview.totalAiMessages}
                gradient="from-violet-500 via-purple-400 to-fuchsia-300"
              />
              <StatCard
                icon={Share2}
                label="צ׳אטים משותפים"
                value={displayOverview.totalSharedChats}
                gradient="from-amber-500 via-orange-400 to-rose-300"
              />
              <StatCard
                icon={Mic}
                label="הקלטות קוליות"
                value={displayOverview.totalAudioRecordings}
                gradient="from-sky-500 via-cyan-400 to-teal-300"
              />
              <StatCard
                icon={BookOpenCheck}
                label={displayOverview.scoped ? 'מילים ממתינות (כלל המערכת)' : 'מילים ממתינות'}
                value={displayOverview.pendingWordsCount}
                gradient="from-amber-400 via-yellow-400 to-orange-300"
              />
              <StatCard
                icon={TrendingUp}
                label="התקדמות ממוצעת"
                value={`${displayOverview.averageProgress}%`}
                gradient="from-emerald-500 via-green-400 to-lime-300"
              />
            </section>

            <nav className="mt-6 flex flex-wrap gap-2 rounded-[1.5rem] border border-[#EEE5FF] bg-white/70 p-2 shadow-card">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSection(tab.id)}
                  className={`rounded-2xl px-4 py-2.5 text-sm font-black transition ${
                    activeSection === tab.id
                      ? 'bg-violet-600 text-white shadow-button'
                      : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="mt-5">
              {activeSection === 'overview' ? <OverviewTab data={data} /> : null}
              {activeSection === 'students' ? <StudentsTab students={searchedStudents} /> : null}
              {activeSection === 'teachers' ? <TeachersTab teachers={searchedTeachers} /> : null}
              {activeSection === 'progress' ? <ProgressTab progress={data.progress} /> : null}
              {activeSection === 'aiChats' ? <AiChatsTab ai={data.ai} /> : null}
              {activeSection === 'sharedChats' ? (
                <SharedChatsTab sharedChats={data.sharedChats} />
              ) : null}
              {activeSection === 'vocabulary' ? (
                <VocabularyTab vocabulary={data.vocabulary} />
              ) : null}
              {activeSection === 'audio' ? <AudioTab audio={data.audio} /> : null}
              {activeSection === 'system' ? <SystemTab system={data.system} /> : null}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default AdminAnalytics;
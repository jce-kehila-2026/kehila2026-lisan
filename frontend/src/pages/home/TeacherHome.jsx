import React from 'react';
import {
  ArrowLeft,
  Link as LinkIcon,
  Plus,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import StudentHome from '../Home.jsx';

const ADMIN_SETTINGS_IMAGE = '/images/admin-settings-card.png';

function TeacherActions({ compact = false, to }) {
  const actions = [
    { label: 'הוספה', icon: Plus },
  ];

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? 'justify-end' : 'mt-4'}`}>
      {actions.map((action) => {
        const Icon = action.icon;
        const classes =
          'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-violet-200 bg-violet-100/80 px-3 text-xs font-bold text-violet-800 shadow-[0_8px_18px_rgba(124,58,237,0.12)] transition hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-600 hover:text-white hover:shadow-[0_12px_24px_rgba(124,58,237,0.22)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2';

        if (to) {
          return (
            <Link key={action.label} to={to} className={classes}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              {action.label}
            </Link>
          );
        }

        return (
          <button key={action.label} type="button" className={classes}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}

function ManagementAction() {
  return (
    <Link
      to="/admin/dashboard"
      className="lisan-enter group flex flex-col sm:flex-row min-h-[190px] items-center justify-between gap-5 overflow-hidden rounded-[28px] border border-white/80 bg-white p-6 shadow-card transition hover:-translate-y-1.5 hover:shadow-[0_24px_56px_rgba(124,58,237,0.18)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 md:col-span-2 md:justify-self-center"
      aria-label="ניהול מערכת"
      dir="ltr"
      style={{ '--lisan-enter-delay': '750ms' }}
    >
      <img
        src={ADMIN_SETTINGS_IMAGE}
        alt=""
        className="h-auto max-h-[125px] w-[150px] shrink-0 object-contain object-left opacity-95 mix-blend-multiply transition group-hover:scale-105 sm:max-h-[160px] sm:w-[230px] [mask-image:radial-gradient(ellipse_at_center,#000_0%,#000_68%,rgba(0,0,0,0.62)_84%,transparent_100%)]"
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1 text-center sm:text-right" dir="rtl">
        <h2 className="text-2xl font-black text-slate-900">
          ניהול מערכת
        </h2>

        <p className="mt-2 text-base leading-7 text-slate-600">
          מעבר ללוח הניהול להוספה ומחיקה של תכנים.
        </p>

        <div className="mt-4 inline-flex h-12 items-center gap-2 rounded-full bg-violet-600 px-6 text-base font-black text-white shadow-button transition hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-[0_12px_24px_rgba(124,58,237,0.25)] group-hover:bg-violet-700">
          <span>כניסה לניהול</span>
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>

      <span className="hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">
        <LinkIcon className="h-7 w-7" aria-hidden="true" />
      </span>
    </Link>
  );
}

function TeacherHome() {
  return (
    <StudentHome
      logoTarget="/admin/dashboard"
      teacherManagementAction={<ManagementAction />}
      teacherQuickAction={<TeacherActions compact to="/teacher/stories/upload" />}
    />
  );
}

export default TeacherHome;

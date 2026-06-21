import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import StudentHome from '../Home.jsx';

function TeacherModeButton() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate('/admin/dashboard')}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-100/85 px-2.5 text-xs font-black text-violet-800 shadow-[0_10px_22px_rgba(124,58,237,0.14)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-violet-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:h-12 sm:px-4 sm:text-sm"
      aria-label="מעבר למצב מורה"
      title="מעבר למצב מורה"
    >
      <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
      <span className="hidden sm:inline">מצב מורה</span>
    </button>
  );
}

function TeacherHome() {
  return <StudentHome logoTarget="/admin/dashboard" headerAction={<TeacherModeButton />} />;
}

export default TeacherHome;

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdminNavStrip from './AdminNavStrip.jsx';
import AdminMobileMenu from './AdminMobileMenu.jsx';

function AdminPageHeader({ icon: Icon, label }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminPath =
    location.pathname.startsWith('/admin/') ||
    location.pathname === '/teacher/stories/upload';

  const header = (
    <header
      className={`flex flex-wrap items-center justify-between gap-2 md:flex-nowrap md:gap-2 lg:gap-3 ${
        isAdminPath
          ? 'fixed left-3 right-3 top-3 z-50 mx-auto max-w-7xl md:left-6 md:right-6 md:top-4 lg:left-8 lg:right-8'
          : ''
      }`}
    >
      <div className="flex shrink-0 items-center gap-2">
        {isAdminPath ? <AdminMobileMenu /> : null}

      <button
        type="button"
        onClick={() => navigate('/admin/dashboard')}
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-xs font-black text-violet-700 shadow-[0_10px_24px_rgba(109,40,217,0.08)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 lg:px-4 lg:text-sm"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
        חזרה ללוח הניהול
      </button>
      </div>

      <div className={isAdminPath ? 'hidden md:contents' : 'contents'}>
        <AdminNavStrip />
      </div>

      <div className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-xs font-black text-violet-700 shadow-[0_10px_24px_rgba(109,40,217,0.08)] backdrop-blur lg:px-4 lg:text-sm">
        {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
        {label}
      </div>
    </header>
  );

  if (!isAdminPath) {
    return header;
  }

  return (
    <>
      {header}
      <div className="h-14 md:h-16" aria-hidden="true" />
    </>
  );
}

export default AdminPageHeader;

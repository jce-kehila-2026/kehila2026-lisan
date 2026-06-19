import React from 'react';
import {
  BookOpenCheck,
  Eye,
  FilePlus2,
  GraduationCap,
  MessageSquareText,
  Users,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

export const adminNavItems = [
  {
    id: 'students',
    label: 'תלמידות',
    icon: Users,
    to: '/admin/students',
  },
  {
    id: 'teachers',
    label: 'מורות',
    icon: GraduationCap,
    to: '/admin/progress',
  },
  {
    id: 'conversations',
    label: 'שיחות',
    icon: MessageSquareText,
    to: '/admin/conversations',
  },
  {
    id: 'words',
    label: 'מילים',
    icon: BookOpenCheck,
    to: '/admin/words',
  },
  {
    id: 'materials',
    label: 'חומרים',
    icon: FilePlus2,
    to: '/teacher/stories/upload',
  },
];

function AdminNavStrip({
  activeSectionId = '',
  dashboardMode = false,
  onSectionClick,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavClick = (item) => {
    if (dashboardMode && onSectionClick) {
      onSectionClick(item.id);
      return;
    }

    navigate(item.to);
  };

  return (
    <div className="flex min-w-[16rem] flex-1 items-center justify-between gap-2 overflow-hidden rounded-[22px] border border-white/55 bg-[linear-gradient(135deg,rgba(250,232,255,0.78)_0%,rgba(237,233,254,0.78)_45%,rgba(255,228,240,0.72)_100%)] px-2.5 py-2 shadow-[0_16px_42px_rgba(109,40,217,0.13)] backdrop-blur-xl sm:min-w-[22rem] sm:px-3 lg:max-w-3xl">
      <nav
        className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-0.5 text-right [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="ניווט מהיר באזור הניהול"
      >
        {adminNavItems.map((item) => {
          const Icon = item.icon;
          const isDashboardActive = dashboardMode && activeSectionId === item.id;
          const isPageActive = !dashboardMode && location.pathname === item.to;
          const isActive = isDashboardActive || isPageActive;
          const activeClass = dashboardMode
            ? 'border-violet-500/80 bg-white/35 text-violet-900 shadow-[inset_0_0_0_1px_rgba(124,58,237,0.18)]'
            : 'border-white/80 bg-violet-600 text-white shadow-[0_10px_24px_rgba(109,40,217,0.22)]';

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:px-3.5 sm:text-sm ${
                isActive
                  ? activeClass
                  : 'border-white/50 bg-white/42 text-violet-900/75 hover:bg-white/70 hover:text-violet-800'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => navigate('/teacher/dashboard')}
        className="inline-flex shrink-0 items-center gap-2 rounded-[18px] bg-violet-600 px-3 py-2 text-xs font-black text-white shadow-[0_12px_26px_rgba(109,40,217,0.22)] transition hover:-translate-y-0.5 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:px-4 sm:py-2.5 sm:text-sm"
        aria-label="תצוגת תלמיד"
      >
        <Eye className="h-4 w-4" aria-hidden="true" />
        <span className="whitespace-nowrap">תצוגת תלמיד</span>
      </button>
    </div>
  );
}

export default AdminNavStrip;

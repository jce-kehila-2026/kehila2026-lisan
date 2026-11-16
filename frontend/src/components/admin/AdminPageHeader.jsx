import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpenCheck,
  Eye,
  FilePlus2,
  GraduationCap,
  MessageSquareText,
  ServerCog,
  ShieldCheck,
  Users,
} from 'lucide-react';

import LisanHeader from '../LisanHeader.jsx';
import { getStoredUser, logout } from '../../services/auth.js';
import { useOpsAccess } from '../../services/opsApi.js';

const adminSections = [
  { id: 'students',      label: 'תלמידות', icon: Users,            to: '/admin/students' },
  { id: 'teachers',      label: 'מורות',   icon: GraduationCap,    to: '/admin/progress' },
  { id: 'conversations', label: 'שיחות',   icon: MessageSquareText, to: '/admin/conversations' },
  { id: 'words',         label: 'מילים',   icon: BookOpenCheck,    to: '/admin/words' },
  { id: 'materials',     label: 'חומרים',  icon: FilePlus2,         to: '/teacher/stories/upload' },
];

// Shown only to admins on the server-side OPS_ADMIN_EMAILS allowlist.
const opsSection = { id: 'ops', label: 'תפעול', icon: ServerCog, to: '/ops' };

function AdminPageHeader({ extraLeft = null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const canSeeOps = useOpsAccess();

  // Reviewer-feedback queue: admins and teachers review the volunteers' flags.
  const canReviewFeedback = ['admin', 'teacher'].includes(getStoredUser()?.role);
  const baseSections = canReviewFeedback
    ? [...adminSections, { id: 'ai-feedback', label: 'משוב AI', icon: ShieldCheck, to: '/admin/ai-feedback' }]
    : adminSections;
  const sections = canSeeOps ? [...baseSections, opsSection] : baseSections;

  const activeSection = sections.find((s) => s.to === location.pathname)?.id ?? '';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <LisanHeader
      sections={sections}
      activeSection={activeSection}
      onSectionClick={(id) => {
        const target = sections.find((s) => s.id === id)?.to;
        if (target) navigate(target);
      }}
      logoTarget="/admin/dashboard"
      onLogout={handleLogout}
      navLabel="ניווט ניהול"
      extraLeft={extraLeft}
    />
  );
}

export default AdminPageHeader;

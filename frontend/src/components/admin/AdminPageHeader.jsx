import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpenCheck,
  Eye,
  FilePlus2,
  GraduationCap,
  MessageSquareText,
  Users,
} from 'lucide-react';

import LisanHeader from '../LisanHeader.jsx';
import { getStoredUser, logout } from '../../services/auth.js';

const adminSections = [
  { id: 'students',      label: 'תלמידות', icon: Users,            to: '/admin/students' },
  { id: 'teachers',      label: 'מורות',   icon: GraduationCap,    to: '/admin/progress' },
  { id: 'conversations', label: 'שיחות',   icon: MessageSquareText, to: '/admin/conversations' },
  { id: 'words',         label: 'מילים',   icon: BookOpenCheck,    to: '/admin/words' },
  { id: 'materials',     label: 'חומרים',  icon: FilePlus2,         to: '/teacher/stories/upload' },
];

function AdminPageHeader({ extraLeft = null }) {
  const location = useLocation();
  const navigate = useNavigate();

  const activeSection = adminSections.find((s) => s.to === location.pathname)?.id ?? '';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <LisanHeader
      sections={adminSections}
      activeSection={activeSection}
      onSectionClick={() => {}}
      logoTarget="/admin/dashboard"
      onLogout={handleLogout}
      navLabel="ניווט ניהול"
      extraLeft={extraLeft}
    />
  );
}

export default AdminPageHeader;

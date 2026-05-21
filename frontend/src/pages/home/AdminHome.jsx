import React from 'react';
import { GraduationCap, PencilLine, UserMinus, UserPlus, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../../components/src/components/PageHeader.jsx';
import { getStoredUser, storeSession } from '../../services/auth.js';
import HomeHeader from './components/HomeHeader.jsx';
import ManagementCard from './components/ManagementCard.jsx';

function AdminHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getStoredUser();

  const enterTeacherArea = () => {
    storeSession({
      token: localStorage.getItem('lisan-token') || 'mock-teacher-token',
      user: { id: 'teacher_from_admin', name: user?.name || t('teacherNameFallback'), role: 'teacher' },
    });
    navigate('/home');
  };

  const cards = [
    {
      icon: UserPlus,
      title: t('adminRegisterStudent'),
      description: t('adminRegisterStudentDesc'),
      actionLabel: t('openAction'),
      to: '/admin/register-student',
    },
    {
      icon: UserMinus,
      title: t('adminRemoveStudent'),
      description: t('adminRemoveStudentDesc'),
      actionLabel: t('openAction'),
      to: '/admin/remove-student',
    },
    {
      icon: PencilLine,
      title: t('adminEditStudent'),
      description: t('adminEditStudentDesc'),
      actionLabel: t('openAction'),
      to: '/admin/edit-student',
    },
    {
      icon: GraduationCap,
      title: t('adminTeacherAccess'),
      description: t('adminTeacherAccessDesc'),
      actionLabel: t('adminEnterTeacher'),
      onAction: enterTeacherArea,
    },
  ];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="relative mx-auto min-h-[calc(100vh-2.5rem)] max-w-5xl pb-10">
        <PageHeader showLogout />
        <HomeHeader
          t={t}
          welcomeKey="adminHomeWelcome"
          welcomeName={user?.name || t('adminNameFallback')}
          titleKey="adminHomeTitle"
          introKey="adminHomeIntro"
        >
          <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-violet-700">
                <UsersRound className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-800">{t('adminManagementArea')}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{t('adminManagementAreaDesc')}</p>
              </div>
            </div>
          </div>
        </HomeHeader>

        <section className="mt-5 grid gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <ManagementCard key={card.title} {...card} />
          ))}
        </section>
      </div>
    </main>
  );
}

export default AdminHome;

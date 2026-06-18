import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  BookOpenCheck,
  ChevronLeft,
  ClipboardCheck,
  Eye,
  FilePlus2,
  GraduationCap,
  MessageSquareText,
  ShieldCheck,
  UserRound,
  Users,
  UsersRound,
  X,
} from 'lucide-react';

import { useNavigate } from 'react-router-dom';

import {
  adminDemoUsers,
  adminReviewNotifications,
} from '../../data/adminMockData.js';

import {
  getStoredToken,
  getStoredUser,
  logout,
} from '../../services/auth.js';

const API_BASE_URL = '/api';

const dashboardNotifications = [
  'שיחה חדשה ממתינה לבדיקה',
  'מילה חדשה נוספה למערכת',
  'תלמידה חדשה נרשמה',
  'חומר לימוד חדש הועלה',
];

const dashboardSections = [
  {
    title: 'ניהול תלמידות',
    subtitle: 'טבלת תלמידות עם רמות, כיתות, שיוכים ופעולות ניהול מלאות.',
    detail: 'כניסה לניהול תלמידות',
    id: 'students',
    navLabel: 'תלמידות',
    icon: Users,
    to: '/admin/students',
  },
  {
    title: 'ניהול מורות',
    subtitle: 'מורות, כיתות, רמות לימוד ושיוך תלמידות.',
    detail: 'כניסה מאובטחת לניהול מורות',
    id: 'teachers',
    navLabel: 'מורות',
    icon: GraduationCap,
    to: '/admin/progress',
    requiresCode: true,
  },
  {
    title: 'בדיקת שיחות',
    subtitle: 'סקירת שיחות חדשות שממתינות לבדיקה.',
    detail: 'רשימת שיחות חדשות לבדיקה',
    id: 'conversations',
    navLabel: 'שיחות',
    icon: MessageSquareText,
    to: '/admin/conversations',
  },
  {
    title: 'בדיקת מילים',
    subtitle: 'סקירת מילים חדשות וסיווג לפי רמות לימוד.',
    detail: 'ניהול מילים שממתינות לבדיקה',
    id: 'words',
    navLabel: 'מילים',
    icon: BookOpenCheck,
    to: '/admin/words',
  },
  {
    title: 'הוספת חומרים',
    subtitle: 'העלאת חומרי לימוד וקבצי פעילות למערכת.',
    detail: 'מעבר לעמוד העלאת החומרים',
    id: 'materials',
    navLabel: 'חומרים',
    icon: FilePlus2,
    to: '/teacher/stories/upload',
  },
];

function OverviewCard({ stat }) {
  const Icon = stat.icon;

  return (
    <article className="rounded-[1.6rem] border border-violet-100/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.92)_0%,rgba(245,240,255,0.9)_48%,rgba(255,241,248,0.88)_100%)] p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-400 to-pink-300 text-white shadow-button">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>

        <span className="text-3xl font-black tracking-normal text-slate-950">
          {stat.value}
        </span>
      </div>

      <h2 className="mt-4 text-sm font-black text-slate-900">
        {stat.title}
      </h2>

      <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
        {stat.detail}
      </p>
    </article>
  );
}

function DashboardSection({
  layoutClass = '',
  onOpenTeacherCode,
  navigate,
  section,
  sectionRef,
}) {
  const Icon = section.icon;

  const handleClick = () => {
    if (section.requiresCode) {
      onOpenTeacherCode();
      return;
    }

    navigate(section.to);
  };

  return (
    <button
      ref={sectionRef}
      data-section-id={section.id}
      type="button"
      onClick={handleClick}
      className={`group flex min-h-[190px] flex-col justify-between rounded-[30px] border border-violet-100/80 bg-white/95 p-5 text-right shadow-[0_18px_46px_rgba(109,40,217,0.11)] transition duration-300 hover:-translate-y-1.5 hover:border-violet-200 hover:bg-white hover:shadow-[0_26px_64px_rgba(109,40,217,0.17)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:p-6 ${layoutClass}`}
    >
      <div className="flex items-start justify-between gap-5">
        <span className="flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-violet-50 to-fuchsia-50 text-violet-700 shadow-[inset_0_0_0_1px_rgba(124,58,237,0.06)] transition duration-300 group-hover:bg-gradient-to-br group-hover:from-violet-600 group-hover:to-fuchsia-500 group-hover:text-white group-hover:shadow-[0_18px_34px_rgba(124,58,237,0.24)]">
          <Icon className="h-9 w-9" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black leading-7 text-[#160A52]">
            {section.title}
          </h2>

          <p className="mt-2 max-w-[24rem] text-sm font-semibold leading-6 text-slate-600">
            {section.subtitle}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 rounded-[20px] bg-violet-50/45 px-4 py-3 transition duration-300 group-hover:bg-violet-50">
        <p className="text-sm font-bold leading-6 text-slate-600">
          {section.detail}
        </p>

        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-violet-700 shadow-[0_8px_18px_rgba(109,40,217,0.10)] transition duration-300 group-hover:bg-violet-600 group-hover:text-white group-hover:shadow-[0_12px_24px_rgba(109,40,217,0.22)]">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </button>
  );
}

function AdminDashboard() {
  const navigate = useNavigate();

  const user = getStoredUser();

  const [users, setUsers] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [teacherCodeOpen, setTeacherCodeOpen] = useState(false);
  const [teacherCode, setTeacherCode] = useState('');
  const [teacherCodeError, setTeacherCodeError] = useState('');
  const [activeSectionId, setActiveSectionId] = useState(dashboardSections[0].id);
  const sectionRefs = useRef({});
  const sectionVisibility = useRef({});

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const token = getStoredToken();

        const response = await fetch(
          `${API_BASE_URL}/admin/users`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || 'Failed to load users',
          );
        }

        setUsers((data.users || []).length > 0 ? data.users : adminDemoUsers);
      } catch (error) {
        console.error(
          'Failed to load dashboard users:',
          error,
        );
        setUsers(adminDemoUsers);
      }
    };

    loadUsers();
  }, []);

  useEffect(() => {
    const visibleRatios = sectionVisibility.current;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const sectionId = entry.target.dataset.sectionId;
          if (!sectionId) return;

          visibleRatios[sectionId] = entry.isIntersecting
            ? entry.intersectionRatio
            : 0;
        });

        const nextActiveSection = dashboardSections.reduce(
          (activeSection, section) => {
            const activeRatio = visibleRatios[activeSection.id] || 0;
            const sectionRatio = visibleRatios[section.id] || 0;

            return sectionRatio > activeRatio ? section : activeSection;
          },
          dashboardSections[0],
        );

        if ((visibleRatios[nextActiveSection.id] || 0) > 0) {
          setActiveSectionId(nextActiveSection.id);
        }
      },
      {
        root: null,
        rootMargin: '-18% 0px -45% 0px',
        threshold: [0, 0.2, 0.4, 0.6, 0.8, 1],
      },
    );

    dashboardSections.forEach((section) => {
      const node = sectionRefs.current[section.id];
      if (node) {
        observer.observe(node);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  const students = users.filter((item) => item.role === 'student');
  const teachers = users.filter((item) => item.role === 'teacher');
  const admins = users.filter(
    (item) => item.role === 'admin' || item.role === 'expert',
  );

  const stats = [
    {
      title: 'תלמידות',
      value: students.length,
      detail: 'תלמידות פעילות במערכת',
      icon: UsersRound,
    },
    {
      title: 'מורות',
      value: teachers.length,
      detail: 'מורות פעילות במערכת',
      icon: GraduationCap,
    },
    {
      title: 'מנהלות',
      value: admins.length,
      detail: 'מנהלות ואחראיות תוכן',
      icon: ShieldCheck,
    },
    {
      title: 'ממתינות לבדיקה',
      value: adminReviewNotifications.length,
      detail: 'התראות סקירת תוכן',
      icon: ClipboardCheck,
    },
  ];

  const closeTeacherCodeModal = () => {
    setTeacherCodeOpen(false);
    setTeacherCode('');
    setTeacherCodeError('');
  };

  const handleTeacherCodeSubmit = (event) => {
    event.preventDefault();

    if (teacherCode === '0000') {
      closeTeacherCodeModal();
      navigate('/admin/progress');
      return;
    }

    setTeacherCodeError('קוד שגוי');
  };

  const handleLogout = () => {
    logout();

    navigate('/admin/login', {
      replace: true,
    });
  };

  const handleSectionShortcutClick = (sectionId) => {
    const node = sectionRefs.current[sectionId];

    if (!node) return;

    setActiveSectionId(sectionId);
    node.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_12%_8%,rgba(221,214,254,0.55),transparent_30%),linear-gradient(180deg,#FBF8FF_0%,#FFF8FC_48%,#F4EEFF_100%)] px-3 py-4 text-slate-900 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8">
      <style>
        {`
          @keyframes lisanDropdownIn {
            from {
              opacity: 0;
              transform: translateY(-8px) scale(0.98);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}
      </style>

      <div className="mx-auto w-full max-w-7xl" dir="rtl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="inline-flex min-h-14 items-center gap-3 rounded-[20px] border border-violet-100/80 bg-white/90 px-3 py-2 text-right shadow-[0_10px_28px_rgba(109,40,217,0.08)] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_14px_34px_rgba(109,40,217,0.12)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            aria-label="חזרה ללוח הניהול"
          >
            <img
              src="/logo.png"
              alt=""
              className="h-11 w-11 rounded-[14px] object-contain shadow-[0_12px_28px_rgba(109,40,217,0.12)]"
            />

            <span className="flex flex-col leading-none">
              <span className="text-2xl font-black tracking-normal text-slate-950">
                ליסאן
              </span>
              <span className="mt-1 text-sm font-semibold leading-5 text-slate-500">
                ללמוד עברית בצעדים רגועים וברורים
              </span>
            </span>
          </button>

          <div className="flex min-w-[17rem] flex-1 items-center justify-between gap-3 overflow-hidden rounded-[22px] border border-white/55 bg-[linear-gradient(135deg,rgba(250,232,255,0.78)_0%,rgba(237,233,254,0.78)_45%,rgba(255,228,240,0.72)_100%)] px-3 py-2 shadow-[0_16px_42px_rgba(109,40,217,0.13)] backdrop-blur-xl sm:min-w-[24rem] lg:max-w-3xl">
            <nav
              className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-0.5 text-right [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="ניווט מהיר בלוח הניהול"
            >
              {dashboardSections.map((section) => {
                const isActive = activeSectionId === section.id;
                const Icon = section.icon;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => handleSectionShortcutClick(section.id)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                      isActive
                        ? 'border-white/80 bg-white text-violet-800 shadow-[0_10px_24px_rgba(109,40,217,0.18)]'
                        : 'border-white/50 bg-white/42 text-violet-900/75 hover:bg-white/70 hover:text-violet-800'
                    }`}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{section.navLabel}</span>
                  </button>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={() => navigate('/teacher/dashboard')}
              className="inline-flex shrink-0 items-center gap-2 rounded-[18px] bg-violet-600 px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_26px_rgba(109,40,217,0.22)] transition hover:-translate-y-0.5 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              aria-label="תצוגת תלמיד"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              <span>תצוגת תלמיד</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen((isOpen) => !isOpen)}
                className="relative flex h-12 w-12 items-center justify-center rounded-[18px] border border-violet-100/80 bg-white/90 text-violet-700 shadow-[0_10px_28px_rgba(109,40,217,0.08)] transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
                aria-label="התראות"
                aria-expanded={notificationsOpen}
              >
                <Bell className="h-5 w-5" aria-hidden="true" />
                <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-black text-white">
                  {dashboardNotifications.length}
                </span>
              </button>

              {notificationsOpen ? (
                <div className="absolute left-0 top-14 z-30 w-[min(20rem,calc(100vw-2rem))] origin-top-left rounded-[24px] border border-violet-100/80 bg-white/95 p-3 text-right shadow-[0_22px_55px_rgba(109,40,217,0.16)] backdrop-blur [animation:lisanDropdownIn_160ms_ease-out]">
                  <div className="mb-2 flex items-center justify-between gap-3 px-2">
                    <h2 className="text-sm font-black text-[#160A52]">
                      התראות
                    </h2>
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-700">
                      {dashboardNotifications.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {dashboardNotifications.map((notification) => (
                      <div
                        key={notification}
                        className="rounded-2xl bg-violet-50/70 px-3 py-3 text-sm font-semibold leading-6 text-slate-700"
                      >
                        {notification}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex min-h-12 items-center gap-3 rounded-[18px] border border-violet-100/80 bg-white/90 px-5 py-2 text-sm font-black text-slate-700 shadow-[0_10px_28px_rgba(109,40,217,0.08)] transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            >
              <UserRound className="h-5 w-5 text-violet-700" aria-hidden="true" />
              יציאה
            </button>
          </div>
        </header>

        <section className="relative mt-8 overflow-hidden rounded-[30px] border border-violet-100/70 bg-white/75 shadow-[0_22px_70px_rgba(109,40,217,0.11)]">
          <div
            className="grid min-h-[260px] items-stretch lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]"
            dir="ltr"
          >
            <div className="relative min-h-[210px] overflow-hidden">
              <img
                src="/images/teacher-dashboard-hero.png"
                alt=""
                className="h-full min-h-[210px] w-full object-cover object-left"
              />
            </div>

            <div
              className="flex flex-col justify-center px-6 py-8 text-right sm:px-10 lg:px-12"
              dir="rtl"
            >
              <p className="text-sm font-black text-violet-700">
                שלום {user?.name || 'מנהלת'}
              </p>

              <h1 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-4xl lg:text-5xl">
                לוח בקרה לניהול מערכת ליסאן
              </h1>

              <p className="mt-4 max-w-2xl text-base font-semibold leading-8 text-slate-600">
                ניהול תלמידות, מורות, שיחות וחומרי למידה במערכת.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <OverviewCard key={stat.title} stat={stat} />
          ))}
        </section>

        <section className="mt-6 flex flex-wrap justify-center gap-5">
          {dashboardSections.map((section) => (
            <DashboardSection
              key={section.id}
              layoutClass="w-full flex-none md:basis-[calc(50%_-_0.625rem)] lg:basis-[calc((100%_-_2.5rem)/3)]"
              navigate={navigate}
              onOpenTeacherCode={() => {
                setTeacherCodeOpen(true);
                setTeacherCodeError('');
              }}
              section={section}
              sectionRef={(node) => {
                if (node) {
                  sectionRefs.current[section.id] = node;
                }
              }}
            />
          ))}
        </section>
      </div>

      {teacherCodeOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="teacher-code-title"
        >
          <form
            onSubmit={handleTeacherCodeSubmit}
            className="w-full max-w-md rounded-[28px] border border-violet-100 bg-white p-6 text-right shadow-[0_26px_80px_rgba(49,20,96,0.22)]"
            dir="rtl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="teacher-code-title"
                  className="text-2xl font-black text-[#160A52]"
                >
                  קוד גישה
                </h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  יש להזין קוד גישה לניהול מורות
                </p>
              </div>

              <button
                type="button"
                onClick={closeTeacherCodeModal}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700 transition hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                aria-label="סגירה"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <label className="mt-6 block text-sm font-black text-slate-700">
              סיסמה
              <input
                type="password"
                value={teacherCode}
                onChange={(event) => {
                  setTeacherCode(event.target.value);
                  setTeacherCodeError('');
                }}
                autoFocus
                className="mt-2 h-12 w-full rounded-2xl border border-violet-100 bg-violet-50/40 px-4 text-right text-base font-semibold text-slate-900 outline-none transition focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
              />
            </label>

            {teacherCodeError ? (
              <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-black text-rose-600">
                {teacherCodeError}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-start">
              <button
                type="button"
                onClick={closeTeacherCodeModal}
                className="min-h-11 rounded-2xl border border-violet-100 bg-white px-5 py-2 text-sm font-black text-slate-700 transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              >
                ביטול
              </button>

              <button
                type="submit"
                className="min-h-11 rounded-2xl bg-violet-700 px-5 py-2 text-sm font-black text-white shadow-[0_14px_28px_rgba(109,40,217,0.22)] transition hover:bg-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              >
                אישור
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

export default AdminDashboard;

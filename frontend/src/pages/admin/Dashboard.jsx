import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  BookOpenCheck,
  BarChart3,
  ChevronLeft,
  ClipboardCheck,
  Eye,
  FilePlus2,
  GraduationCap,
  Menu,
  MessageSquareText,
  Mic,
  PieChart,
  Share2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
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
import { getFullAnalytics } from '../../services/adminApi.js';
import AdminNavStrip from '../../components/admin/AdminNavStrip.jsx';
import LisanHeader from '../../components/LisanHeader.jsx';
import AdminHeroVisual from '../../components/admin/AdminHeroVisual.jsx';
import i18n from '../../i18n/index.js';

import {
  getStoredToken,
  getStoredUser,
  logout,
} from '../../services/auth.js';

const API_BASE_URL = '/api';

const getDashboardNotifications = () => [
  i18n.t('admin.dashboard.notifications.newConversation'),
  i18n.t('admin.dashboard.notifications.newWord'),
  i18n.t('admin.dashboard.notifications.newStudent'),
  i18n.t('admin.dashboard.notifications.newMaterial'),
];

const getDashboardSections = () => [
  {
    title: i18n.t('admin.dashboard.sections.students.title'),
    subtitle: i18n.t('admin.dashboard.sections.students.subtitle'),
    detail: i18n.t('admin.dashboard.sections.students.detail'),
    id: 'students',
    navLabel: i18n.t('admin.dashboard.sections.students.navLabel'),
    icon: Users,
    to: '/admin/students',
  },
  {
    title: i18n.t('admin.dashboard.sections.teachers.title'),
    subtitle: i18n.t('admin.dashboard.sections.teachers.subtitle'),
    detail: i18n.t('admin.dashboard.sections.teachers.detail'),
    id: 'teachers',
    navLabel: i18n.t('admin.dashboard.sections.teachers.navLabel'),
    icon: GraduationCap,
    to: '/admin/progress',
    requiresCode: true,
  },
  {
    title: i18n.t('admin.dashboard.sections.conversations.title'),
    subtitle: i18n.t('admin.dashboard.sections.conversations.subtitle'),
    detail: i18n.t('admin.dashboard.sections.conversations.detail'),
    id: 'conversations',
    navLabel: i18n.t('admin.dashboard.sections.conversations.navLabel'),
    icon: MessageSquareText,
    to: '/admin/conversations',
  },
  {
    title: i18n.t('admin.dashboard.sections.words.title'),
    subtitle: i18n.t('admin.dashboard.sections.words.subtitle'),
    detail: i18n.t('admin.dashboard.sections.words.detail'),
    id: 'words',
    navLabel: i18n.t('admin.dashboard.sections.words.navLabel'),
    icon: BookOpenCheck,
    to: '/admin/words',
  },
  {
    title: i18n.t('admin.dashboard.sections.materials.title'),
    subtitle: i18n.t('admin.dashboard.sections.materials.subtitle'),
    detail: i18n.t('admin.dashboard.sections.materials.detail'),
    id: 'materials',
    navLabel: i18n.t('admin.dashboard.sections.materials.navLabel'),
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
  isSelected = false,
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
      className={`group flex min-h-[190px] flex-col justify-between rounded-[30px] border p-5 text-right transition duration-300 hover:-translate-y-1.5 hover:border-violet-200 hover:bg-white hover:shadow-[0_26px_64px_rgba(109,40,217,0.17)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:p-6 ${
        isSelected
          ? 'border-violet-400 bg-[linear-gradient(145deg,rgba(237,233,254,0.96)_0%,rgba(250,232,255,0.92)_52%,rgba(255,228,240,0.88)_100%)] shadow-[0_26px_70px_rgba(124,58,237,0.28),0_0_0_4px_rgba(196,181,253,0.36),inset_0_0_0_1px_rgba(167,139,250,0.55)]'
          : 'border-violet-100/80 bg-white/95 shadow-[0_18px_46px_rgba(109,40,217,0.11)]'
      } ${layoutClass}`}
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

function MiniDistribution({ data, metric }) {
  const maxValue = Math.max(1, ...data.map((item) => item[metric] || 0));

  return (
    <div className="grid gap-2">
      {data.map((item) => (
        <div key={`${metric}-${item.level}`} className="grid grid-cols-[2.5rem_1fr_2.25rem] items-center gap-2">
          <span className="text-xs font-black text-violet-800">{item.level}</span>
          <span className="h-2 overflow-hidden rounded-full bg-white/70 shadow-[inset_0_0_0_1px_rgba(221,214,254,0.7)]">
            <span
              className="block h-full rounded-full bg-gradient-to-l from-violet-600 to-fuchsia-400"
              style={{ width: `${Math.max(10, (item[metric] / maxValue) * 100)}%` }}
            />
          </span>
          <span className="text-left text-xs font-black text-slate-600">{item[metric]}</span>
        </div>
      ))}
    </div>
  );
}

const ANALYTICS_LEVELS = ['A1', 'A2', 'B1', 'B2'];

function formatCount(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString('he-IL') : '0';
}

function topAnalyticsLevel(metricMap) {
  let topLevel = ANALYTICS_LEVELS[0];
  let topValue = -1;

  ANALYTICS_LEVELS.forEach((level) => {
    const value = Number(metricMap?.[level]) || 0;

    if (value > topValue) {
      topValue = value;
      topLevel = level;
    }
  });

  return { level: topLevel, value: Math.max(0, topValue) };
}

function AnalyticsOverview({ navigate }) {
  const { t } = useTranslation();
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadAnalytics = async () => {
      try {
        const result = await getFullAnalytics({});

        if (isMounted) {
          setAnalytics(result);
        }
      } catch (error) {
        console.error('Failed to load dashboard analytics overview:', error);
      }
    };

    loadAnalytics();

    return () => {
      isMounted = false;
    };
  }, []);

  const studentsByLevel = ANALYTICS_LEVELS.map((level) => ({
    level,
    students: analytics?.charts?.studentsByLevel?.[level] || 0,
  }));
  const wordsByLevel = ANALYTICS_LEVELS.map((level) => ({
    level,
    words: analytics?.charts?.wordsByLevel?.[level] || 0,
  }));
  const maxWords = Math.max(1, ...wordsByLevel.map((item) => item.words));

  const topChatLevel = topAnalyticsLevel(analytics?.charts?.messagesByLevel);
  const topProgressLevel = topAnalyticsLevel(analytics?.charts?.progressByLevel);
  const topAudioLevel = topAnalyticsLevel(analytics?.audio?.byLevel);

  const overview = analytics?.overview || {};
  const overviewStats = [
    { name: t('admin.dashboard.stats.aiChats'), value: overview.totalAiChats || 0, color: 'bg-violet-500' },
    { name: t('admin.dashboard.stats.aiMessages'), value: overview.totalAiMessages || 0, color: 'bg-fuchsia-400' },
    { name: t('admin.dashboard.stats.voiceRecordings'), value: overview.totalAudioRecordings || 0, color: 'bg-indigo-400' },
    { name: t('admin.dashboard.stats.sharedChats'), value: overview.totalSharedChats || 0, color: 'bg-rose-300' },
  ];
  const maxOverviewStat = Math.max(1, ...overviewStats.map((item) => item.value));

  return (
    <section className="mt-3 rounded-[28px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.84)_0%,rgba(245,240,255,0.82)_46%,rgba(255,241,248,0.78)_100%)] p-4 shadow-[0_22px_60px_rgba(109,40,217,0.12)] backdrop-blur-xl sm:mt-6 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-violet-100/80 px-3 py-1 text-xs font-black text-violet-700">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {t('admin.dashboard.overview.badge')}
          </p>
          <h2 className="mt-2 text-xl font-black text-[#160A52] sm:text-2xl">
            {t('admin.dashboard.overview.title')}
          </h2>
        </div>

        <button
          type="button"
          onClick={() => navigate('/admin/analytics')}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-violet-600 px-5 py-2 text-sm font-black text-white shadow-button transition hover:-translate-y-0.5 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
        >
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          {t('admin.dashboard.overview.viewFullAnalytics')}
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr_1.1fr]">
        <article className="rounded-[22px] border border-violet-100/70 bg-white/72 p-4 shadow-[0_10px_28px_rgba(109,40,217,0.08)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-black text-slate-800">{t('admin.dashboard.overview.studentsDistribution')}</h3>
            <PieChart className="h-5 w-5 text-violet-600" aria-hidden="true" />
          </div>
          <MiniDistribution data={studentsByLevel} metric="students" />
        </article>

        <article className="rounded-[22px] border border-violet-100/70 bg-white/72 p-4 shadow-[0_10px_28px_rgba(109,40,217,0.08)]">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              {
                label: t('admin.dashboard.overview.mostActiveAiLevel'),
                value: `${t('admin.dashboard.overview.levelPrefix')}${topChatLevel.level}`,
                detail: `${formatCount(topChatLevel.value)}${t('admin.dashboard.overview.messagesSuffix')}`,
                icon: MessageSquareText,
              },
              {
                label: t('admin.dashboard.overview.highestProgress'),
                value: `${t('admin.dashboard.overview.levelPrefix')}${topProgressLevel.level}`,
                detail: `${topProgressLevel.value}${t('admin.dashboard.overview.progressSuffix')}`,
                icon: TrendingUp,
              },
              {
                label: t('admin.dashboard.overview.mostAudioRecordings'),
                value: `${t('admin.dashboard.overview.levelPrefix')}${topAudioLevel.level}`,
                detail: `${formatCount(topAudioLevel.value)}${t('admin.dashboard.overview.recordingsSuffix')}`,
                icon: Mic,
              },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <div key={item.label} className="rounded-2xl bg-violet-50/80 px-2 py-3">
                  <Icon className="mx-auto h-4 w-4 text-violet-700" aria-hidden="true" />
                  <p className="mt-2 text-base font-black text-[#160A52]">{item.value}</p>
                  <p className="mt-1 text-[11px] font-black leading-4 text-slate-600">{item.label}</p>
                  <p className="mt-1 text-[10px] font-bold text-violet-700">{item.detail}</p>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-[22px] border border-violet-100/70 bg-white/72 p-4 shadow-[0_10px_28px_rgba(109,40,217,0.08)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-black text-slate-800">{t('admin.dashboard.overview.wordsByLevel')}</h3>
            <BookOpenCheck className="h-5 w-5 text-violet-600" aria-hidden="true" />
          </div>
          <div className="flex h-24 items-end justify-between gap-2 rounded-2xl bg-violet-50/60 px-3 py-2">
            {wordsByLevel.map((item) => (
              <div key={item.level} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[11px] font-black text-violet-800">{item.words}</span>
                <span
                  className="w-full rounded-t-full bg-gradient-to-t from-violet-600 to-fuchsia-300"
                  style={{ height: `${Math.max(8, (item.words / maxWords) * 100)}%` }}
                />
                <span className="text-[11px] font-black text-violet-800">{item.level}</span>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        {overviewStats.map((stat) => (
          <div key={stat.name} className="rounded-2xl bg-white/65 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(221,214,254,0.65)]">
            <div className="flex items-center justify-between gap-2 text-xs font-black text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                {stat.name === t('admin.dashboard.stats.sharedChats') ? (
                  <Share2 className="h-3.5 w-3.5 text-violet-500" aria-hidden="true" />
                ) : null}
                {stat.name}
              </span>
              <span>{formatCount(stat.value)}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-50">
              <span
                className={`block h-full rounded-full ${stat.color}`}
                style={{ width: `${Math.max(4, (stat.value / maxOverviewStat) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AdminDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const user = getStoredUser();

  const [users, setUsers] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [teacherCodeOpen, setTeacherCodeOpen] = useState(false);
  const [teacherCode, setTeacherCode] = useState('');
  const [teacherCodeError, setTeacherCodeError] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const sectionHighlightReadyRef = useRef(true);
  const sectionHighlightTimerRef = useRef(null);
  const sectionRefs = useRef({});

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

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
    return () => {
      if (sectionHighlightTimerRef.current) {
        window.clearTimeout(sectionHighlightTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!notificationsOpen && !mobileNavOpen) return undefined;

    const closeOpenMenus = () => {
      setNotificationsOpen(false);
      setMobileNavOpen(false);
    };

    window.addEventListener('scroll', closeOpenMenus, { passive: true });

    return () => {
      window.removeEventListener('scroll', closeOpenMenus);
    };
  }, [mobileNavOpen, notificationsOpen]);

  useEffect(() => {
    if (!selectedSectionId) return undefined;

    const node = sectionRefs.current[selectedSectionId];
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!sectionHighlightReadyRef.current) return;

        if (!entry.isIntersecting) {
          setSelectedSectionId('');
        }
      },
      {
        root: null,
        rootMargin: '-20% 0px -35% 0px',
        threshold: 0.12,
      },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [selectedSectionId]);

  const students = users.filter((item) => item.role === 'student');
  const teachers = users.filter((item) => item.role === 'teacher');
  const admins = users.filter(
    (item) => item.role === 'admin' || item.role === 'expert',
  );
  const activeSectionId = selectedSectionId;

  const stats = [
    {
      title: t('admin.dashboard.metrics.students.title'),
      value: students.length,
      detail: t('admin.dashboard.metrics.students.detail'),
      icon: UsersRound,
    },
    {
      title: t('admin.dashboard.metrics.teachers.title'),
      value: teachers.length,
      detail: t('admin.dashboard.metrics.teachers.detail'),
      icon: GraduationCap,
    },
    {
      title: t('admin.dashboard.metrics.admins.title'),
      value: admins.length,
      detail: t('admin.dashboard.metrics.admins.detail'),
      icon: ShieldCheck,
    },
    {
      title: t('admin.dashboard.metrics.pending.title'),
      value: adminReviewNotifications.length,
      detail: t('admin.dashboard.metrics.pending.detail'),
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

    setTeacherCodeError(t('admin.dashboard.modal.wrongCode'));
  };

  const handleLogout = () => {
    logout();
    navigate('/teacher/login', { replace: true });
  };

  const handleSectionShortcutClick = (sectionId) => {
    const node = sectionRefs.current[sectionId];

    if (!node) return;

    if (sectionHighlightTimerRef.current) {
      window.clearTimeout(sectionHighlightTimerRef.current);
    }

    sectionHighlightReadyRef.current = false;
    setSelectedSectionId(sectionId);
    node.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });

    sectionHighlightTimerRef.current = window.setTimeout(() => {
      sectionHighlightReadyRef.current = true;
    }, 700);
  };

  const handleMobileSectionShortcutClick = (sectionId) => {
    setMobileNavOpen(false);
    handleSectionShortcutClick(sectionId);
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_12%_8%,rgba(221,214,254,0.55),transparent_30%),linear-gradient(180deg,#FBF8FF_0%,#FFF8FC_48%,#F4EEFF_100%)] px-3 py-3 text-slate-900 md:px-6 md:py-8 lg:px-8">
      <style>
        {`
          @keyframes lisanDropdownIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @media (max-width: 767px) {
            .admin-dashboard-header {
              align-items: center;
              justify-content: space-between;
              gap: 0.5rem;
            }

            .admin-dashboard-brand {
              max-width: calc(100vw - 8rem);
              min-width: 0;
            }

            .admin-dashboard-logo {
              min-width: 0;
              max-width: 100%;
            }

            .admin-dashboard-logo span {
              min-width: 0;
            }

            .admin-dashboard-actions {
              flex-shrink: 0;
            }

            .admin-dashboard-mobile-menu,
            .admin-dashboard-notifications-menu {
              max-width: calc(100vw - 1.5rem);
            }
          }
        `}
      </style>

      <div className="mx-auto w-full max-w-7xl" dir="rtl">

        <LisanHeader
          sections={getDashboardSections().map((s) => ({ id: s.id, label: s.navLabel, icon: s.icon }))}
          activeSection={selectedSectionId}
          onSectionClick={handleSectionShortcutClick}
          logoTarget="/admin/dashboard"
          onLogout={handleLogout}
          navLabel={t('admin.dashboard.header.quickNav')}
          extraLeft={
            <div className="flex items-center gap-1.5">
              {/* Student-view button */}
              <button
                type="button"
                onClick={() => navigate('/teacher/dashboard')}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-violet-200/80 bg-white/80 px-2.5 text-xs font-black text-violet-700 shadow-sm transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:h-10 sm:px-3 sm:text-sm"
                aria-label={t('admin.dashboard.header.studentView')}
                title={t('admin.dashboard.header.studentView')}
              >
                <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t('admin.dashboard.header.studentView')}</span>
              </button>

              {/* Notifications */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotificationsOpen((isOpen) => !isOpen);
                    setMobileNavOpen(false);
                  }}
                  className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/80 text-violet-700 shadow-sm transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:h-10 sm:w-10"
                  aria-label={t('admin.dashboard.header.notificationsAria')}
                  aria-expanded={notificationsOpen}
                >
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  {getDashboardNotifications().length > 0 ? (
                    <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
                      {getDashboardNotifications().length}
                    </span>
                  ) : null}
                </button>

                {notificationsOpen ? (
                  <div className="admin-dashboard-notifications-menu fixed left-1/2 top-20 z-50 w-[min(20rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-[20px] border border-violet-100/80 bg-white/96 p-3 text-right shadow-[0_16px_48px_rgba(109,40,217,0.16)] backdrop-blur [animation:lisanDropdownIn_160ms_ease-out] md:absolute md:left-0 md:top-12 md:translate-x-0" dir="rtl">
                    <div className="mb-2 flex items-center justify-between gap-3 px-2">
                      <h2 className="text-sm font-black text-[#160A52]">{t('admin.dashboard.header.notificationsTitle')}</h2>
                      <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-700">
                        {getDashboardNotifications().length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {getDashboardNotifications().map((notification) => (
                        <div key={notification} className="rounded-2xl bg-violet-50/70 px-3 py-3 text-sm font-semibold leading-6 text-slate-700">
                          {notification}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          }
        />

        <section
          className="relative mt-8 overflow-hidden rounded-[24px] border border-violet-100/70 bg-white/75 shadow-[0_16px_42px_rgba(109,40,217,0.1)] md:mt-10 md:rounded-[28px]"
          style={{ maxHeight: '140px' }}
        >
          {/* Full layout: image left, gradient, text right */}
          <div className="flex h-full min-h-[140px] items-stretch" dir="ltr">

            {/* Visual — far left edge */}
            <div className="relative w-[34%] shrink-0 overflow-hidden" aria-hidden="true">
              <AdminHeroVisual type="dashboard" />
            </div>

            {/* Text — right side with gap from visual */}
            <div className="flex flex-1 flex-col justify-center text-right" style={{ paddingLeft: '4px', paddingRight: '20px' }} dir="rtl">
              <p className="text-xs font-black text-violet-700 mb-1">
                {t('admin.dashboard.hero.greeting')}{user?.name || t('admin.dashboard.hero.defaultAdminName')}
              </p>
              <h1 className="text-3xl font-black leading-tight text-slate-950 md:text-4xl">
                {t('admin.dashboard.hero.title')}
              </h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                {t('admin.dashboard.hero.subtitle')}
              </p>
            </div>

          </div>
        </section>

        <AnalyticsOverview navigate={navigate} />

        <section className="mt-3 grid grid-cols-1 gap-3 sm:mt-6 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <OverviewCard key={stat.title} stat={stat} />
          ))}
        </section>

        <section className="mt-3 flex flex-wrap justify-center gap-3 sm:mt-6 sm:gap-5">
          {getDashboardSections().map((section) => (
            <DashboardSection
              key={section.id}
              layoutClass="w-full flex-none md:basis-[calc(50%_-_0.625rem)] lg:basis-[calc((100%_-_2.5rem)/3)]"
              navigate={navigate}
              isSelected={selectedSectionId === section.id}
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
                  {t('admin.dashboard.modal.accessCode')}
                </h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  {t('admin.dashboard.modal.subtitle')}
                </p>
              </div>

              <button
                type="button"
                onClick={closeTeacherCodeModal}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700 transition hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                aria-label={t('admin.dashboard.modal.close')}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <label className="mt-6 block text-sm font-black text-slate-700">
              {t('admin.dashboard.modal.password')}
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
                {t('admin.dashboard.modal.cancel')}
              </button>

              <button
                type="submit"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-violet-600 px-6 py-3 text-base font-black text-white shadow-[0_8px_20px_rgba(109,40,217,0.22)] transition hover:-translate-y-0.5 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              >
                {t('admin.dashboard.modal.submit')}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

export default AdminDashboard;

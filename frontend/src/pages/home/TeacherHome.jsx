import React, { useState } from 'react';
import {
  BookOpen,
  Gamepad2,
  Headphones,
  Link as LinkIcon,
  MessageCircle,
  PenLine,
  Pencil,
  Plus,
  Quote,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BottomNav from '../../../components/src/components/BottomNav.jsx';
import FeatureCard from '../../../components/src/components/FeatureCard.jsx';
import PageHeader from '../../../components/src/components/PageHeader.jsx';
import StoryCarousel from '../../../components/src/components/StoryCarousel.jsx';
import { getStoredUser } from '../../services/auth.js';

const stories = [
  { id: 'daily-word', titleKey: 'storyDailyWord', icon: Quote },
  { id: 'letters', titleKey: 'storyLetters', icon: BookOpen },
  { id: 'listening', titleKey: 'storyListening', icon: Headphones },
  { id: 'speaking', titleKey: 'storySpeaking', icon: MessageCircle },
  { id: 'quiz', titleKey: 'storyQuiz', icon: PenLine },
];

const featureSections = [
  {
    to: '/games',
    manageTo: '/teacher/games/upload',
    icon: Gamepad2,
    titleKey: 'gamesTitle',
    descriptionKey: 'gamesDescription',
    actionKey: 'openGames',
  },
  {
    to: '/links',
    manageTo: '/teacher/links/upload',
    icon: LinkIcon,
    titleKey: 'linksTitle',
    descriptionKey: 'linksDescription',
    actionKey: 'openLinks',
  },
];

function TeacherActions({ compact = false, to }) {
  const actions = [
    { label: 'הוספה', icon: Plus },
    { label: 'עריכה', icon: Pencil },
    { label: 'מחיקה', icon: Trash2 },
  ];

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? 'justify-end' : 'mt-4'}`}>
      {actions.map((action) => {
        const Icon = action.icon;
        const classes =
          'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-violet-100 bg-violet-50 px-3 text-xs font-bold text-violet-700 transition hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2';

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

function TeacherFeatureCard({ section, showTeacherActions }) {
  const { t } = useTranslation();
  const Icon = section.icon;

  return (
    <article className="rounded-3xl border border-slate-100 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg sm:p-6">
      <Link
        to={section.to}
        className="group block focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
        aria-label={t(section.actionKey)}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">
            <Icon className="h-8 w-8" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-slate-900">{t(section.titleKey)}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t(section.descriptionKey)}</p>
          </div>
        </div>
      </Link>
      {showTeacherActions ? <TeacherActions to={section.manageTo} /> : null}
    </article>
  );
}

function TeacherHome() {
  const { t } = useTranslation();
  const user = getStoredUser();
  const [mode, setMode] = useState('teacher');
  const isTeacherMode = mode === 'teacher';

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="relative mx-auto min-h-[calc(100vh-2.5rem)] max-w-xl pb-28 sm:min-h-[780px]" dir="rtl">
        <PageHeader showLogout />

        <section className="mt-6 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              {isTeacherMode ? (
                <p className="inline-flex rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                  מצב מורה
                </p>
              ) : null}
              <p className="mt-3 text-sm font-semibold text-violet-700">
                {t('welcome', { name: user?.name || 'מורה' })}
              </p>
              <h1 className="mt-2 text-2xl font-bold leading-tight text-slate-950 sm:text-3xl">
                {t('homeGreeting')}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">{t('homeIntro')}</p>
            </div>
            <div className="rounded-2xl bg-violet-50 px-4 py-3 text-center">
              <p className="text-xs font-semibold text-slate-500">{t('level')}</p>
              <p className="mt-1 whitespace-nowrap text-sm font-bold text-violet-700">
                {t('studentLevelBeginner')}
              </p>
            </div>
          </div>

          <div className="mt-5 inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setMode('teacher')}
              className={`min-h-10 rounded-full px-4 py-2 text-sm font-bold transition ${
                isTeacherMode ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
              }`}
            >
              מצב מורה
            </button>
            <button
              type="button"
              onClick={() => setMode('student')}
              className={`min-h-10 rounded-full px-4 py-2 text-sm font-bold transition ${
                !isTeacherMode ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
              }`}
            >
              מצב תלמידה
            </button>
          </div>
        </section>

        <div className="mt-5">
          <StoryCarousel
            stories={stories}
            actionsSlot={isTeacherMode ? <TeacherActions compact to="/teacher/stories/upload" /> : null}
          />
        </div>

        <section className="mt-5 grid gap-4">
          {featureSections.map((section) =>
            isTeacherMode ? (
              <TeacherFeatureCard key={section.to} section={section} showTeacherActions />
            ) : (
              <FeatureCard
                key={section.to}
                to={section.to}
                icon={section.icon}
                titleKey={section.titleKey}
                descriptionKey={section.descriptionKey}
                actionKey={section.actionKey}
              />
            ),
          )}
        </section>

        <BottomNav />
      </div>
    </main>
  );
}

export default TeacherHome;

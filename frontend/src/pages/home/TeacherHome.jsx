import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  Link as LinkIcon,
  MessageCircle,
  Search,
  Star,
  Volume2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import BottomNav from '../../components/BottomNav.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import {
  getStudentStorySubtitle,
  getStudentStoryTitle,
  studentStories,
} from '../../data/studentStories.jsx';
import { getStoredUser } from '../../services/auth.js';

const dictionaryWords = [
  { hebrew: 'שלום', arabic: 'مرحباً' },
  { hebrew: 'תודה', arabic: 'شكراً' },
  { hebrew: 'מים', arabic: 'ماء' },
  { hebrew: 'בית', arabic: 'بيت' },
  { hebrew: 'ספר', arabic: 'كتاب' },
  { hebrew: 'ילד', arabic: 'ولد' },
  { hebrew: 'ילדה', arabic: 'بنت' },
  { hebrew: 'מורה', arabic: 'معلم' },
  { hebrew: 'כיתה', arabic: 'صف' },
  { hebrew: 'חבר', arabic: 'صديق' },
  { hebrew: 'חברה', arabic: 'صديقة' },
  { hebrew: 'אוכל', arabic: 'طعام' },
  { hebrew: 'שמש', arabic: 'شمس' },
  { hebrew: 'ירח', arabic: 'قمر' },
  { hebrew: 'יום', arabic: 'يوم' },
  { hebrew: 'לילה', arabic: 'ليل' },
  { hebrew: 'יפה', arabic: 'جميل' },
  { hebrew: 'קטן', arabic: 'صغير' },
  { hebrew: 'גדול', arabic: 'كبير' },
  { hebrew: 'אהבה', arabic: 'حب' },
  { hebrew: 'משפחה', arabic: 'عائلة' },
  { hebrew: 'שפה', arabic: 'لغة' },
  { hebrew: 'עיר', arabic: 'مدينة' },
  { hebrew: 'דרך', arabic: 'طريق' },
];

function normalizeProgress(value) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(number)));
}

function ModeSwitch({ mode, onChange }) {
  const options = [
    { value: 'teacher', label: 'מצב מורה' },
    { value: 'student', label: 'מצב תלמידה' },
  ];

  return (
    <div
      className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm"
      aria-label="בחירת מצב תצוגה"
    >
      {options.map((option) => {
        const isActive = mode === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`min-h-10 rounded-full px-4 py-2 text-sm font-semibold transition ${
              isActive ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
            aria-pressed={isActive}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ActivityShortcut({ activity }) {
  const { t, i18n } = useTranslation();
  const Icon = activity.icon;
  const title = getStudentStoryTitle(activity, i18n.language);
  const subtitle = getStudentStorySubtitle(activity, i18n.language);

  return (
    <Link
      to={`/scenario/${activity.id}`}
      className="group flex min-h-[112px] w-[85%] shrink-0 snap-start items-center gap-3 rounded-[22px] border border-violet-100/80 bg-white/75 p-4 text-right shadow-[0_10px_24px_rgba(109,40,217,0.08)] transition hover:-translate-y-1 hover:scale-[1.03] hover:bg-white hover:shadow-[0_16px_30px_rgba(109,40,217,0.16)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:w-[320px] lg:w-[320px]"
      aria-label={`${t('openStory')}: ${title}`}
      dir="rtl"
    >
      <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700 shadow-[inset_0_0_0_1px_rgba(221,214,254,0.9)] transition group-hover:bg-violet-600 group-hover:text-white lg:h-14 lg:w-14">
        <Icon className="h-6 w-6 lg:h-7 lg:w-7" aria-hidden="true" />
      </span>

      <span className="min-w-0">
        <span className="block truncate text-xl font-black leading-6 text-slate-900">
          {title}
        </span>
        <span className="mt-1 line-clamp-2 block text-base font-bold leading-6 text-slate-500">
          {subtitle}
        </span>
      </span>
    </Link>
  );
}

function TeacherHome() {
  const { t, i18n } = useTranslation();
  const storedUser = getStoredUser();
  const isArabic = i18n.language === 'ar';
  const [mode, setMode] = useState('teacher');
  const classLabel = isArabic ? 'طالبات' : 'תלמידות';
  const materialsLabel = isArabic ? 'مواد تعليمية' : 'חומרי לימוד';
  const dictionaryTitle = isArabic ? 'إدارة قاموس عبري ↔ عربي' : 'ניהול מילון עברית ↔ ערבית';
  const dictionaryDescription = isArabic
    ? 'راجعي الكلمات والترجمات التي تظهر للطالبات'
    : 'בדקי מילים ותרגומים שמוצגים לתלמידות';
  const dictionaryPlaceholder = isArabic ? 'بحث عن كلمة بالعبرية...' : 'חיפוש מילה בעברית...';
  const showMoreLabel = isArabic ? 'عرض المزيد من الكلمات' : 'הצג עוד מילים';
  const showLessLabel = isArabic ? 'عرض أقل' : 'הצג פחות';
  const linksModalText = isArabic
    ? {
      title: 'فتح الروابط الخارجية',
      description:
        'سيتم فتح مجلد Google Drive يحتوي على مواد تعليمية وروابط مفيدة. هل تريدين المتابعة؟',
      confirm: 'نعم، افتح الرابط',
      cancel: 'إلغاء',
    }
    : {
      title: 'פתיחת קישורים חיצוניים',
      description:
        'תיקיית Google Drive המכילה חומרי לימוד וקישורים שימושיים תיפתח. האם ברצונך להמשיך?',
      confirm: 'כן, פתח את הקישור',
      cancel: 'ביטול',
    };

  const teacher = {
    name: storedUser?.name || storedUser?.email || t('teacherNameFallback'),
    level: mode === 'teacher' ? 'כיתה A1' : 'A1',
    progress: mode === 'teacher' ? 72 : 64,
    studentsCount: 24,
    materialsCount: 18,
  };

  const [dictionaryQuery, setDictionaryQuery] = useState('');
  const [dictionaryExpanded, setDictionaryExpanded] = useState(false);
  const [favoriteWords, setFavoriteWords] = useState([]);
  const [isLinksModalOpen, setIsLinksModalOpen] = useState(false);

  const progressWidth = useMemo(() => {
    return `${normalizeProgress(teacher.progress)}%`;
  }, [teacher.progress]);

  const filteredDictionaryWords = useMemo(() => {
    const query = dictionaryQuery.trim().toLowerCase();

    if (!query) {
      return dictionaryWords;
    }

    return dictionaryWords.filter((word) => {
      return (
        word.hebrew.toLowerCase().includes(query) ||
        word.arabic.toLowerCase().includes(query)
      );
    });
  }, [dictionaryQuery]);

  const visibleDictionaryWords = dictionaryExpanded
    ? filteredDictionaryWords
    : filteredDictionaryWords.slice(0, 5);

  const toggleFavoriteWord = (hebrewWord) => {
    setFavoriteWords((currentWords) => {
      if (currentWords.includes(hebrewWord)) {
        return currentWords.filter((word) => word !== hebrewWord);
      }

      return [...currentWords, hebrewWord];
    });
  };

  const pronounceHebrewWord = (hebrewWord) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(hebrewWord);
    utterance.lang = 'he-IL';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_12%_8%,rgba(221,214,254,0.54),transparent_30%),linear-gradient(180deg,#FBF8FF_0%,#FFF8FC_48%,#F4EEFF_100%)] text-slate-900">
      <div className="app-page-container relative" dir="rtl">
        <div className="lisan-enter" style={{ '--lisan-enter-delay': '0ms' }}>
          <PageHeader
            controlsSlot={<ModeSwitch mode={mode} onChange={setMode} />}
            showLogout
          />
        </div>

        <section
          className="lisan-enter relative mt-8 overflow-hidden rounded-[28px] border border-white/80 bg-[linear-gradient(135deg,#F3ECFF_0%,#FFFFFF_58%,#F8F2FF_100%)] shadow-[0_26px_70px_rgba(91,33,182,0.14)] transition hover:-translate-y-1 hover:shadow-[0_32px_80px_rgba(124,58,237,0.2)]"
          style={{ '--lisan-enter-delay': '150ms' }}
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-violet-200/45 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-1/2 h-36 w-36 rounded-full bg-fuchsia-100/70 blur-3xl" />

          <div className="relative grid min-h-[420px] items-stretch md:grid-cols-[0.6fr_0.4fr] lg:min-h-[460px]" dir="ltr">
            <div className="relative min-h-[300px] overflow-hidden md:min-h-full">
              <img
                src="/images/hero-study-image.png"
                alt=""
                className="lisan-hero-art h-full w-full object-cover object-left"
                aria-hidden="true"
              />
              <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-28 bg-gradient-to-r from-transparent to-white/80 md:block" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-white/40 md:hidden" />
            </div>

            <div className="relative z-10 flex min-w-0 items-center p-7 text-right sm:p-8 lg:p-10" dir="rtl">
              <div className="w-full">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-base font-black text-violet-700 lg:text-lg">
                  {t('teacherHomeWelcome', { name: teacher.name })}
                </p>

                <div className="rounded-full bg-violet-100 px-5 py-2.5 text-sm font-black text-violet-700 lg:text-base">
                  {t('level')} {teacher.level}
                </div>
              </div>

              <h1 className="mt-4 text-[clamp(2rem,3vw,3.75rem)] font-black leading-tight text-slate-950">
                {mode === 'teacher' ? t('teacherHomeTitle') : t('homeGreeting')}
              </h1>

              <p className="mt-4 max-w-2xl text-[clamp(1rem,1.1vw,1.25rem)] font-medium leading-8 text-slate-600">
                {mode === 'teacher' ? t('teacherHomeIntro') : t('homeIntro')}
              </p>

              <div className="mt-7 grid grid-cols-2 gap-4">
                <div className="rounded-[24px] border border-violet-100 bg-violet-50/70 p-5 text-center">
                  <p className="text-base font-bold text-slate-500">
                    {classLabel}
                  </p>

                  <p className="mt-2 text-4xl font-black text-slate-950">
                    {teacher.studentsCount}
                  </p>
                </div>

                <div className="rounded-[24px] border border-violet-100 bg-violet-50/70 p-5 text-center">
                  <p className="text-base font-bold text-slate-500">
                    {materialsLabel}
                  </p>

                  <p className="mt-2 text-4xl font-black text-slate-950">
                    {teacher.materialsCount}
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-[24px] border border-violet-100 bg-violet-50/70 p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-base font-black text-slate-800">
                    {mode === 'teacher' ? 'התקדמות כיתה' : t('dailyProgress')}
                  </span>

                  <span className="text-base font-black text-violet-700">
                    {teacher.progress}%
                  </span>
                </div>

                <div className="mt-4 h-4 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-violet-700 to-fuchsia-500"
                    style={{ width: progressWidth }}
                  />
                </div>
              </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className="lisan-enter mt-8 rounded-[28px] border border-white/80 bg-[linear-gradient(135deg,#FFFFFF_0%,#F7F1FF_100%)] p-6 shadow-card lg:p-8"
          style={{ '--lisan-enter-delay': '300ms' }}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-3xl font-black text-slate-900">
              {mode === 'teacher' ? t('teacherStoriesTitle') : t('storiesTitle')}
            </h2>
          </div>

          <div className="mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-2 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
            {studentStories.map((activity) => (
              <ActivityShortcut key={activity.id} activity={activity} />
            ))}
          </div>
        </section>

        <section
          className="lisan-enter relative mt-8 overflow-hidden rounded-[28px] border border-white/80 bg-[linear-gradient(135deg,#FFFFFF_0%,#FBF8FF_48%,#F4ECFF_100%)] p-6 shadow-card transition hover:-translate-y-1.5 hover:shadow-[0_24px_56px_rgba(124,58,237,0.16)] lg:p-8"
          style={{
            '--lisan-enter-delay': '450ms',
            '--lisan-enter-duration': '400ms',
          }}
        >
          <div className="pointer-events-none absolute -left-12 top-4 h-44 w-44 rounded-full bg-violet-200/35 blur-3xl" />
          <div className="pointer-events-none absolute bottom-10 right-12 h-28 w-28 rounded-full bg-fuchsia-100/70 blur-3xl" />

          <div className="relative grid gap-8 md:grid-cols-[0.4fr_0.6fr]" dir="ltr">
            <div className="pointer-events-none flex min-h-[220px] items-center justify-start md:min-h-[260px]" aria-hidden="true">
              <img
                src="/images/dictionary-image.png"
                alt=""
                className="lisan-dictionary-art h-[240px] w-full max-w-[420px] object-contain object-left opacity-100 md:h-[300px] md:max-w-[500px]"
              />
            </div>

            <div className="relative z-10 flex min-w-0 flex-col justify-center text-right" dir="rtl">
              <h2 className="text-[clamp(1.75rem,2.1vw,2.75rem)] font-black text-slate-950">
                {dictionaryTitle}
              </h2>
              <p className="mt-3 text-[clamp(1rem,1.1vw,1.2rem)] font-medium leading-7 text-slate-600">
                {dictionaryDescription}
              </p>

              <label className="relative mt-5 block">
                <span className="sr-only">{dictionaryPlaceholder}</span>
                <Search
                  className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-violet-500"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={dictionaryQuery}
                  onChange={(event) => {
                    setDictionaryQuery(event.target.value);
                  }}
                  placeholder={dictionaryPlaceholder}
                  className="h-14 w-full rounded-full border border-violet-100 bg-violet-50/75 py-4 pl-4 pr-12 text-right text-base font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(124,58,237,0.12)]"
                  dir="rtl"
                />
              </label>
            </div>
          </div>

          <div className="relative z-10 mt-6 overflow-x-auto rounded-[22px] bg-white/72 shadow-[inset_0_0_0_1px_rgba(221,214,254,0.72)] backdrop-blur-sm [scrollbar-width:thin]">
            <table className="w-full min-w-[620px] border-collapse text-right">
              <thead>
                <tr className="bg-violet-50/70 text-base font-black text-violet-800">
                  <th className="px-4 py-3">עברית</th>
                  <th className="px-3 py-3 text-center">↔</th>
                  <th className="px-4 py-3">العربية</th>
                  <th className="px-3 py-3 text-center">⭐</th>
                  <th className="px-3 py-3 text-center">🔊</th>
                </tr>
              </thead>
              <tbody>
                {visibleDictionaryWords.map((word, index) => {
                  const isFavorite = favoriteWords.includes(word.hebrew);

                  return (
                    <tr
                      key={`${word.hebrew}-${word.arabic}`}
                    className="lisan-dictionary-row border-t border-violet-100/80 text-lg font-bold text-slate-800 transition hover:bg-violet-50/80"
                      style={{ '--lisan-row-delay': `${index * 45}ms` }}
                    >
                      <td className="px-4 py-3">{word.hebrew}</td>
                      <td className="px-3 py-3 text-center text-violet-500">↔</td>
                      <td className="px-4 py-3 text-right" dir="rtl">
                        {word.arabic}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleFavoriteWord(word.hebrew)}
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:-translate-y-0.5 ${
                            isFavorite
                              ? 'bg-amber-100 text-amber-500'
                              : 'bg-violet-50 text-violet-400 hover:bg-violet-100 hover:text-violet-700'
                          }`}
                          aria-label={`סמן את ${word.hebrew} כמועדף`}
                          aria-pressed={isFavorite}
                        >
                          <Star
                            className="h-4 w-4"
                            fill={isFavorite ? 'currentColor' : 'none'}
                            aria-hidden="true"
                          />
                        </button>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => pronounceHebrewWord(word.hebrew)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-violet-50 text-violet-600 transition hover:-translate-y-0.5 hover:bg-violet-600 hover:text-white"
                          aria-label={`השמע את ${word.hebrew}`}
                        >
                          <Volume2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={() => {
              setDictionaryExpanded((currentValue) => !currentValue);
            }}
            className="relative z-10 mx-auto mt-4 flex flex-col items-center justify-center gap-1 rounded-2xl px-5 py-2 text-base font-black text-violet-700 transition duration-300 hover:-translate-y-1 hover:bg-violet-50 hover:shadow-[0_14px_28px_rgba(124,58,237,0.14)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            aria-expanded={dictionaryExpanded}
          >
            <ChevronDown
              className={`h-7 w-7 transition duration-300 ${
                dictionaryExpanded ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
            <span>
              {dictionaryExpanded ? showLessLabel : showMoreLabel}
            </span>
          </button>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <button
            type="button"
            onClick={() => setIsLinksModalOpen(true)}
            className="lisan-enter group flex min-h-[190px] items-center justify-between gap-5 overflow-hidden rounded-[28px] border border-white/80 bg-white p-6 shadow-card transition hover:-translate-y-1.5 hover:shadow-[0_24px_56px_rgba(124,58,237,0.18)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            aria-label={t('teacherLinksTitle')}
            dir="ltr"
            style={{ '--lisan-enter-delay': '700ms' }}
          >
            <img
              src="/images/useful-links-image.png"
              alt=""
              className="h-auto max-h-[120px] w-[140px] shrink-0 object-contain object-left opacity-95 mix-blend-multiply transition group-hover:scale-105 sm:max-h-[150px] sm:w-[210px] [mask-image:radial-gradient(ellipse_at_center,#000_0%,#000_68%,rgba(0,0,0,0.62)_84%,transparent_100%)]"
              aria-hidden="true"
            />

            <div className="min-w-0 flex-1 text-right" dir="rtl">
              <h2 className="text-2xl font-black text-slate-900">
                {t('teacherLinksTitle')}
              </h2>

              <p className="mt-2 text-base leading-7 text-slate-600">
                {t('teacherLinksDesc')}
              </p>

              <div className="mt-4 inline-flex h-12 items-center gap-2 rounded-full bg-violet-600 px-6 text-base font-black text-white shadow-button transition hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-[0_12px_24px_rgba(124,58,237,0.25)] group-hover:bg-violet-700">
                <span>{t('teacherAddLinks')}</span>
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </div>
            </div>

            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">
              <LinkIcon className="h-7 w-7" aria-hidden="true" />
            </span>
          </button>

          <Link
            to="/shared-chat"
            className="lisan-enter group flex min-h-[190px] items-center justify-between gap-5 overflow-hidden rounded-[28px] border border-white/80 bg-white p-6 shadow-card transition hover:-translate-y-1.5 hover:shadow-[0_24px_56px_rgba(124,58,237,0.18)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            aria-label={t('teacherDialogTitle')}
            dir="ltr"
            style={{ '--lisan-enter-delay': '600ms' }}
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">
              <MessageCircle className="h-7 w-7" aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1 text-right" dir="rtl">
              <h2 className="text-2xl font-black text-slate-900">
                {t('teacherDialogTitle')}
              </h2>

              <p className="mt-2 text-base leading-7 text-slate-600">
                {t('teacherDialogDesc')}
              </p>

              <div className="mt-4 inline-flex h-12 items-center gap-2 rounded-full bg-violet-600 px-6 text-base font-black text-white shadow-button transition hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-[0_12px_24px_rgba(124,58,237,0.25)] group-hover:bg-violet-700">
                <span>{t('teacherTryDialog')}</span>
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </div>
            </div>

            <img
              src="/images/friends-chat-image.png"
              alt=""
              className="h-auto max-h-[125px] w-[150px] shrink-0 object-contain object-right opacity-95 mix-blend-multiply transition group-hover:scale-105 sm:max-h-[160px] sm:w-[230px] [mask-image:radial-gradient(ellipse_at_center,#000_0%,#000_68%,rgba(0,0,0,0.62)_84%,transparent_100%)]"
              aria-hidden="true"
            />
          </Link>
        </section>

        {isLinksModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm"
            role="presentation"
            onClick={() => setIsLinksModalOpen(false)}
          >
            <div
              className="lisan-enter w-full max-w-md rounded-[24px] border border-white/80 bg-[linear-gradient(135deg,#FFFFFF_0%,#F7F1FF_100%)] p-6 text-right shadow-[0_28px_80px_rgba(35,22,58,0.28)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="useful-links-modal-title"
              dir="rtl"
              style={{
                '--lisan-enter-delay': '0ms',
                '--lisan-enter-duration': '260ms',
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                <LinkIcon className="h-7 w-7" aria-hidden="true" />
              </div>

              <h2
                id="useful-links-modal-title"
                className="mt-4 text-xl font-black text-slate-950"
              >
                {linksModalText.title}
              </h2>

              <p className="mt-3 text-sm font-medium leading-7 text-slate-600">
                {linksModalText.description}
              </p>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsLinksModalOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-violet-100 bg-white px-5 text-sm font-black text-violet-700 transition hover:-translate-y-0.5 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
                >
                  {linksModalText.cancel}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsLinksModalOpen(false);
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-violet-600 px-5 text-sm font-black text-white shadow-button transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(124,58,237,0.25)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
                >
                  {linksModalText.confirm}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <BottomNav />
      </div>
    </main>
  );
}

export default TeacherHome;

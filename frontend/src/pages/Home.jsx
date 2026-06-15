import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Home as HomeIcon,
  Link as LinkIcon,
  MessageCircle,
  Zap,
  Flame,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';

import { useCountUp } from '../hooks/useCountUp.js';
import BottomNav from '../components/BottomNav.jsx';
import PageHeader from '../components/PageHeader.jsx';
import {
  getStudentStorySubtitle,
  getStudentStoryTitle,
  studentStories,
} from '../data/studentStories.jsx';
import {
  ALPHABET_CATEGORY_KEY,
  gameCatalog,
  getCompletedWordCount,
  getTotalLevelCount,
  getUniqueGameWordCount,
} from '../data/vocabGameCatalog.js';
import { getCategoryMeta, COLOR_MAP } from '../data/vocabGameMeta.js';
import { getStoredToken, getStoredUser } from '../services/auth.js';

const API_BASE_URL = 'http://localhost:3000/api';
const USEFUL_LINKS_DRIVE_URL =
  'https://drive.google.com/drive/folders/1AOGvvic8O2K_MzjUJIXMQwGg80unCad8';

function normalizeProgress(value) {
  const number = Number(value);
  if (Number.isNaN(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function shouldReduceMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// ── Reusable motion primitives ──────────────────────────────────────────
const MotionLink = motion.create(Link);

// Calm, natural spring shared by tactile elements (cards, icons).
const springTransition = { type: 'spring', stiffness: 320, damping: 24 };

// Subtle card lift + tap compression. Lift via transform only (cheap).
const cardVariants = {
  rest: { y: 0, scale: 1 },
  hover: { y: -4, scale: 1.03 },
  tap: { scale: 0.98 },
};

// Tiny contextual icon motion, keyed by activity category. Children inherit
// the parent card's `rest`/`hover` state through Framer Motion variants.
const iconMotionVariants = {
  travel: { rest: { x: 0, y: 0 }, hover: { x: 3, y: -3 } }, // diagonal take-off
  pulseRotate: { rest: { rotate: 0, scale: 1 }, hover: { rotate: 16, scale: 1.08 } }, // sun
  pulse: { rest: { scale: 1 }, hover: { scale: 1.12 } }, // people / music
  lift: { rest: { y: 0, scale: 1 }, hover: { y: -2, scale: 1.06 } }, // default
};

function getIconMotionKind(category) {
  if (category === 'travel') return 'travel';
  if (category === 'daily_life') return 'pulseRotate';
  if (category === 'family' || category === 'culture_music') return 'pulse';
  return 'lift';
}

function ActivityShortcut({ activity }) {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const Icon = activity.icon;
  const title = getStudentStoryTitle(activity, i18n.language);
  const subtitle = getStudentStorySubtitle(activity, i18n.language);
  const iconKind = getIconMotionKind(activity.category);

  return (
    <MotionLink
      to={`/scenario/${activity.id}`}
      className="group flex min-h-[104px] w-[82%] shrink-0 snap-start items-center gap-3 rounded-[22px] border border-violet-100/80 bg-white/75 p-4 text-right shadow-[0_10px_24px_rgba(109,40,217,0.08)] transition-[background-color,box-shadow] duration-300 hover:bg-white hover:shadow-[0_16px_30px_rgba(109,40,217,0.16)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:w-[300px] lg:w-[300px]"
      aria-label={`${t('openStory')}: ${title}`}
      dir="rtl"
      variants={cardVariants}
      initial="rest"
      animate="rest"
      whileHover={reduceMotion ? undefined : 'hover'}
      whileTap={reduceMotion ? undefined : 'tap'}
      transition={springTransition}
    >
      <motion.span
        className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700 shadow-[inset_0_0_0_1px_rgba(221,214,254,0.9)] transition-colors group-hover:bg-violet-600 group-hover:text-white lg:h-12 lg:w-12"
        variants={reduceMotion ? undefined : iconMotionVariants[iconKind]}
        transition={springTransition}
      >
        <Icon className="h-5 w-5 lg:h-6 lg:w-6" aria-hidden="true" />
      </motion.span>
      <span className="min-w-0">
        <span className="block truncate text-lg font-black leading-6 text-slate-900">
          {title}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-sm font-bold leading-5 text-slate-500">
          {subtitle}
        </span>
      </span>
    </MotionLink>
  );
}

function SectionTabBar({ sections, activeSection, onSectionClick, label }) {
  const reduceMotion = useReducedMotion();

  return (
    <nav className="sticky top-0 z-30 mt-5 py-3 backdrop-blur-sm" aria-label={label}>
      <div>
        <div
          className="flex snap-x snap-mandatory items-center justify-start gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          dir="rtl"
        >
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                aria-controls={section.id}
                aria-current={isActive ? 'true' : undefined}
                aria-pressed={isActive}
                onClick={() => onSectionClick(section.id)}
                className={`relative snap-start flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
                  isActive ? 'text-white' : 'bg-violet-50/80 text-violet-700 hover:bg-violet-100'
                }`}
              >
                {isActive && (
                  // Shared element glides from the previous active tab to this one.
                  <motion.span
                    layoutId="lisan-section-pill"
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 rounded-full bg-violet-600 shadow-[0_8px_20px_rgba(124,58,237,0.26)]"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 380, damping: 32 }
                    }
                  />
                )}
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{section.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function Home() {
  const { t, i18n } = useTranslation();
  const storedUser = getStoredUser();
  const isArabic = i18n.language === 'ar';

  const chatsLabel = isArabic ? 'المحادثة' : 'שיחה';
  const learnedWordsLabel = isArabic ? 'الكلمات المكتملة' : 'מילים שהושלמו';
  const friendsChatTitle = isArabic ? 'دردشة مع صديقات' : 'שיחה עם חברות';
  const friendsChatDescription = isArabic
    ? 'اختاري صديقات للتدريب المشترك والسريع'
    : 'בחרי חברות לתרגול משותף ומהיר';
  const startLearningLabel = isArabic ? 'ابدئي اللعب' : 'התחילי לשחק';
  const streakLabel = isArabic ? 'جلسات' : 'שיחות';
  const loadingLabel = isArabic ? 'جارٍ التحميل...' : 'טוען...';
  const studentNameFallback = isArabic ? 'طالبة' : 'תלמידה';
  const sectionNavigationLabel = isArabic ? 'أقسام الصفحة' : 'ניווט בעמוד';

  const linksModalText = isArabic
    ? {
        title: 'فتح الروابط الخارجية',
        description:
          'سيتم فتح مجلد Google Drive يحتوي على المواد التعليمية والروابط المفيدة. هل تريد المتابعة؟',
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

  const [student, setStudent] = useState({
    name: '',
    level: '',
    progress: 0,
    learnedWords: 0,
    chatsCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isLinksModalOpen, setIsLinksModalOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('section-hero');
  const [gameProgress, setGameProgress] = useState({});

  const heroRef = useRef(null);
  const activitiesRef = useRef(null);
  const gamesRef = useRef(null);
  const resourcesRef = useRef(null);

  const sections = useMemo(
    () => [
      {
        id: 'section-hero',
        label: isArabic ? 'الرئيسية' : 'בית',
        icon: HomeIcon,
      },
      {
        id: 'section-activities',
        label: isArabic ? 'نشاطات' : 'פעילויות',
        icon: Zap,
      },
      {
        id: 'section-games',
        label: isArabic ? 'ألعاب' : 'משחקים',
        icon: BookOpen,
      },
      {
        id: 'section-resources',
        label: isArabic ? 'تواصل' : 'קשרים',
        icon: MessageCircle,
      },
    ],
    [isArabic],
  );

  useEffect(() => {
    let frameId = 0;

    const updateActiveSection = () => {
      frameId = 0;
      const sectionRefs = [
        { id: 'section-hero', ref: heroRef },
        { id: 'section-activities', ref: activitiesRef },
        { id: 'section-games', ref: gamesRef },
        { id: 'section-resources', ref: resourcesRef },
      ];
      const marker = window.scrollY + 112;
      let currentSection = 'section-hero';

      for (const section of sectionRefs) {
        const el = section.ref.current;
        if (!el) continue;

        const sectionTop = el.getBoundingClientRect().top + window.scrollY;
        if (sectionTop <= marker) {
          currentSection = section.id;
        }
      }

      setActiveSection((current) => (
        current === currentSection ? current : currentSection
      ));
    };

    const requestUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
    };
  }, []);

  useEffect(() => {
    const heroEl = heroRef.current;
    if (!heroEl) return undefined;

    const setStillFrame = () => {
      heroEl.style.setProperty('--hero-image-x', '0px');
      heroEl.style.setProperty('--hero-image-y', '0px');
      heroEl.style.setProperty('--hero-image-scale', '1.03');
      heroEl.style.setProperty('--hero-light-x', '-42%');
      heroEl.style.setProperty('--hero-light-opacity', '0.2');
      heroEl.style.setProperty('--hero-haze-opacity', '0.28');
      heroEl.style.setProperty('--hero-glyph-drift', '0px');
    };

    if (shouldReduceMotion()) {
      setStillFrame();
      return undefined;
    }

    let frameId = 0;

    const updateHeroMotion = () => {
      frameId = 0;

      const rect = heroEl.getBoundingClientRect();
      const viewportHeight =
        window.innerHeight || document.documentElement.clientHeight || 1;
      const travel = viewportHeight + rect.height;
      const rawProgress = (viewportHeight - rect.top) / travel;
      const progress = Math.max(0, Math.min(1, rawProgress));
      const focus = Math.sin(progress * Math.PI);

      heroEl.style.setProperty(
        '--hero-image-x',
        `${(-14 + progress * 28).toFixed(2)}px`,
      );
      heroEl.style.setProperty(
        '--hero-image-y',
        `${(-4 - focus * 12).toFixed(2)}px`,
      );
      heroEl.style.setProperty(
        '--hero-image-scale',
        (1.03 + progress * 0.055).toFixed(4),
      );
      heroEl.style.setProperty(
        '--hero-light-x',
        `${(-44 + progress * 92).toFixed(2)}%`,
      );
      heroEl.style.setProperty(
        '--hero-light-opacity',
        (0.18 + focus * 0.3).toFixed(4),
      );
      heroEl.style.setProperty(
        '--hero-haze-opacity',
        (0.24 + focus * 0.24).toFixed(4),
      );
      heroEl.style.setProperty(
        '--hero-glyph-drift',
        `${(-8 + progress * 22).toFixed(2)}px`,
      );
    };

    const requestUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateHeroMotion);
    };

    updateHeroMotion();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
    };
  }, []);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (!el) return;

    setActiveSection(id);
    const top = el.getBoundingClientRect().top + window.scrollY;

    window.scrollTo({
      top,
      behavior: shouldReduceMotion() ? 'auto' : 'smooth',
    });
  };

  useEffect(() => {
    if (!isLinksModalOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsLinksModalOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLinksModalOpen]);

  useEffect(() => {
    const loadStudentData = async () => {
      try {
        const token = getStoredToken();
        if (!token) { setLoading(false); return; }

        const headers = { Authorization: `Bearer ${token}` };

        const [
          profileResult,
          progressResult,
          chatsResult,
          sharedChatsResult,
          gameProgressResult,
        ] = await Promise.allSettled([
          fetch(`${API_BASE_URL}/users/me`, { headers }),
          fetch(`${API_BASE_URL}/progress/me`, { headers }),
          fetch(`${API_BASE_URL}/chats/my`, { headers }),
          fetch(`${API_BASE_URL}/shared-chats/my`, { headers }),
          fetch(`${API_BASE_URL}/progress/game`, { headers }),
        ]);

        let nextStudent = {
          name: storedUser?.name || storedUser?.email || studentNameFallback,
          level: storedUser?.level || '',
          progress: 0,
          learnedWords: 0,
          chatsCount: 0,
        };

        if (profileResult.status === 'fulfilled') {
          const profileData = await readJson(profileResult.value);
          if (profileResult.value.ok) {
            const user = profileData.user || profileData;
            nextStudent = {
              ...nextStudent,
              name: user.name || user.email || nextStudent.name,
              level: user.level || nextStudent.level,
            };
          }
        }

        if (progressResult.status === 'fulfilled') {
          const progressData = await readJson(progressResult.value);
          if (progressResult.value.ok) {
            const progress = progressData.progress || progressData;
            nextStudent = {
              ...nextStudent,
              progress: normalizeProgress(
                progress.accuracy || progress.progress || progress.percentage || progress.percent || 0,
              ),
              learnedWords: Number(progress.learnedWords || progress.words || 0),
            };
          }
        }

        let realChatsCount = 0;

        if (chatsResult.status === 'fulfilled') {
          const chatsData = await readJson(chatsResult.value);
          if (chatsResult.value.ok && Array.isArray(chatsData.chats)) {
            realChatsCount += chatsData.chats.filter(
              (chat) => Array.isArray(chat.messages) && chat.messages.length > 0,
            ).length;
          }
        }

        if (sharedChatsResult.status === 'fulfilled') {
          const sharedChatsData = await readJson(sharedChatsResult.value);
          if (sharedChatsResult.value.ok && Array.isArray(sharedChatsData.chats)) {
            realChatsCount += sharedChatsData.chats.filter(
              (chat) => chat.lastMessage && String(chat.lastMessage).trim() !== '',
            ).length;
          }
        }

        let gameCompletedLevels = 0;
        let hasGameProgress = false;
        if (gameProgressResult.status === 'fulfilled') {
          try {
            const gameData = await readJson(gameProgressResult.value);
            if (gameProgressResult.value.ok && gameData?.categories) {
              hasGameProgress = true;
              setGameProgress(gameData.categories);
              for (const [categoryKey, completedLevels] of Object.entries(gameData.categories)) {
                if (!Array.isArray(completedLevels)) continue;
                if (!gameCatalog[categoryKey]) continue;
                gameCompletedLevels += completedLevels.length;
              }

              nextStudent = {
                ...nextStudent,
                learnedWords: getCompletedWordCount(gameData.categories, gameCatalog),
              };
            }
          } catch {
            // ignore
          }
        }

        const gameProgressPct = normalizeProgress(
          Math.round((gameCompletedLevels / getTotalLevelCount(gameCatalog)) * 100),
        );

        setStudent({
          ...nextStudent,
          chatsCount: realChatsCount,
          progress: hasGameProgress ? gameProgressPct : nextStudent.progress,
        });
      } catch (error) {
        console.error('Failed to load home data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStudentData();
  }, [storedUser?.email, storedUser?.level, storedUser?.name, studentNameFallback]);

  const reduceMotion = useReducedMotion();
  const normalizedProgress = normalizeProgress(student.progress);
  const progressWidth = useMemo(() => `${normalizedProgress}%`, [normalizedProgress]);

  // Count stats up from 0 once the real values have loaded.
  const chatsDisplay = useCountUp(student.chatsCount, { enabled: !loading });
  const wordsDisplay = useCountUp(student.learnedWords, { enabled: !loading });

  // Word-game categories — same ordering as the Games page. Each card deep-links
  // into /games so the game itself lives in a single place.
  const gameCategories = useMemo(() => {
    return Object.entries(gameCatalog)
      .map(([key, value]) => ({
        key,
        totalWords: value.total_words || value.levels?.flat().length || 0,
        numLevels: value.num_levels || value.levels?.length || 0,
        meta: getCategoryMeta(key),
      }))
      .sort((a, b) => {
        if (a.key === ALPHABET_CATEGORY_KEY) return -1;
        if (b.key === ALPHABET_CATEGORY_KEY) return 1;
        return b.totalWords - a.totalWords;
      });
  }, []);

  const gamesText = isArabic
    ? {
        title: 'لعبة الكلمات',
        subtitle: 'اختاري تصنيفاً لتبدئي اللعب على صفحة الألعاب.',
        badge: 'لعبة واحدة',
        all: 'كل الألعاب',
        words: (count) => `${count} كلمة`,
        levels: (count) => `${count} مرحلة`,
        completed: (done, total) => `${done} من ${total} مكتملة`,
      }
    : {
        title: 'משחק המילים',
        subtitle: 'בחרי קטגוריה כדי להתחיל לשחק בעמוד המשחקים.',
        badge: 'משחק אחד',
        all: 'כל המשחקים',
        words: (count) => `${count} מילים`,
        levels: (count) => `${count} שלבים`,
        completed: (done, total) => `${done} מתוך ${total} הושלמו`,
      };

  return (
    <main className="min-h-screen overflow-x-clip bg-[radial-gradient(circle_at_12%_8%,rgba(221,214,254,0.54),transparent_30%),linear-gradient(180deg,#FBF8FF_0%,#FFF8FC_48%,#F4EEFF_100%)] text-slate-900">
      <div className="app-page-container relative pb-32" dir="rtl">

        {/* Page Header */}
        <div className="lisan-enter" style={{ '--lisan-enter-delay': '0ms' }}>
          <PageHeader showLogout />
        </div>

        {/* Section Tab Bar */}
        <SectionTabBar
          sections={sections}
          activeSection={activeSection}
          onSectionClick={scrollToSection}
          label={sectionNavigationLabel}
        />

        {/* ── Hero ──────────────────────────────────────────────── */}
        <section
          ref={heroRef}
          id="section-hero"
          className="lisan-enter relative mt-6 overflow-hidden rounded-[24px] border border-white/80 bg-[linear-gradient(135deg,#F3ECFF_0%,#FFFFFF_58%,#F8F2FF_100%)] shadow-[0_20px_56px_rgba(91,33,182,0.12)] transition hover:-translate-y-0.5 hover:shadow-[0_28px_64px_rgba(124,58,237,0.18)]"
          style={{
            '--lisan-enter-delay': '150ms',
            '--hero-image-x': '0px',
            '--hero-image-y': '0px',
            '--hero-image-scale': '1.03',
            '--hero-light-x': '-42%',
            '--hero-light-opacity': '0.2',
            '--hero-haze-opacity': '0.28',
            '--hero-glyph-drift': '0px',
          }}
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-violet-200/45 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-1/2 h-32 w-32 rounded-full bg-fuchsia-100/70 blur-3xl" />

          <div
            className="relative grid items-stretch md:min-h-[360px] md:grid-cols-[0.55fr_0.45fr] lg:min-h-[400px]"
            dir="ltr"
          >
            {/* Image */}
            <div className="lisan-hero-reel relative h-[128px] overflow-hidden sm:h-[208px] md:h-auto md:min-h-full">
              <div className="lisan-hero-video-plane">
                <img
                  src="/images/hero-study-image.png"
                  alt=""
                  className="lisan-hero-art h-full w-full object-cover object-left"
                  aria-hidden="true"
                />
              </div>
              <div className="lisan-hero-depth-haze" aria-hidden="true" />
              <div className="lisan-hero-light-sweep" aria-hidden="true" />
              <span className="lisan-hero-glyph lisan-hero-glyph--aleph" aria-hidden="true">
                &#1488;
              </span>
              <span className="lisan-hero-glyph lisan-hero-glyph--bet" aria-hidden="true">
                &#1489;
              </span>
              <span className="lisan-hero-glyph lisan-hero-glyph--ghain" aria-hidden="true">
                &#1594;
              </span>
              <span className="lisan-hero-glyph lisan-hero-glyph--noon" aria-hidden="true">
                &#1606;
              </span>
              <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-24 bg-gradient-to-r from-transparent to-white/80 md:block" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-white/40 md:hidden" />
            </div>

            {/* Content */}
            <div
              className="relative z-10 flex min-w-0 items-center p-4 text-right sm:p-6 lg:p-8"
              dir="rtl"
            >
              <div className="w-full">
                {/* Name + Level + Streak */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black text-violet-700 lg:text-base">
                    {loading ? loadingLabel : t('welcome', { name: student.name || studentNameFallback })}
                  </p>

                  <div className="flex items-center gap-2">
                    {/* Streak badge */}
                    {!loading && student.chatsCount > 0 && (
                      <div className="flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-black text-amber-600">
                        <Flame className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                        <span>{student.chatsCount} {streakLabel}</span>
                      </div>
                    )}

                    {/* Level badge */}
                    <div className="rounded-full bg-violet-100 px-4 py-1.5 text-xs font-black text-violet-700 lg:text-sm">
                      {t('level')} {loading ? '...' : student.level || 'A1'}
                    </div>
                  </div>
                </div>

                {/* Greeting */}
                <h1 className="mt-2.5 text-[clamp(1.5rem,2.8vw,3.2rem)] font-black leading-tight text-slate-950 sm:mt-3">
                  {t('homeGreeting')}
                </h1>

                <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600 sm:mt-2.5 sm:text-[clamp(0.875rem,1vw,1.1rem)] sm:leading-7">
                  {t('homeIntro')}
                </p>

                {/* Stats — clickable */}
                <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3">
                  <Link
                    to="/shared-chat"
                    className="group rounded-[18px] border border-violet-100 bg-violet-50/70 p-3 text-center transition hover:-translate-y-0.5 hover:bg-violet-100/80 hover:shadow-[0_6px_18px_rgba(124,58,237,0.12)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:rounded-[20px] sm:p-4"
                  >
                    <p className="text-sm font-bold text-slate-500">{chatsLabel}</p>
                    <p className="mt-1 text-2xl font-black text-slate-950 sm:mt-1.5 sm:text-3xl">
                      {loading ? '–' : chatsDisplay}
                    </p>
                  </Link>

                  <Link
                  to="/games?view=completed"
                    className="group rounded-[18px] border border-violet-100 bg-violet-50/70 p-3 text-center transition hover:-translate-y-0.5 hover:bg-violet-100/80 hover:shadow-[0_6px_18px_rgba(124,58,237,0.12)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:rounded-[20px] sm:p-4"
                  >
                    <p className="text-sm font-bold text-slate-500">{learnedWordsLabel}</p>
                    <p className="mt-1 text-2xl font-black text-slate-950 sm:mt-1.5 sm:text-3xl">
                      {loading ? '–' : wordsDisplay}
                    </p>
                  </Link>
                </div>

                {/* Progress */}
                <div className="mt-3 rounded-[18px] border border-violet-100 bg-violet-50/70 p-3 sm:mt-4 sm:rounded-[20px] sm:p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-black text-slate-800">{t('dailyProgress')}</span>
                    <span className="text-sm font-black text-violet-700">{normalizedProgress}%</span>
                  </div>
                  <div className="mt-2 h-3 overflow-hidden rounded-full bg-white sm:mt-3">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-l from-violet-700 to-fuchsia-500"
                      initial={{ width: '0%' }}
                      animate={{ width: progressWidth }}
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }
                      }
                    />
                  </div>
                </div>

                {/* Start CTA — soft emphasis glow (stronger when not yet started) */}
                <div className="relative mt-3 sm:mt-4">
                  {!reduceMotion && (
                    <motion.span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-full bg-violet-500/40 blur-md"
                      animate={{
                        opacity:
                          normalizedProgress === 0 && !loading
                            ? [0.3, 0.6, 0.3]
                            : [0.18, 0.38, 0.18],
                        scale: [0.97, 1.03, 0.97],
                      }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}
                  <Link
                    to="/games"
                    className="relative flex h-10 w-full items-center justify-center gap-2 rounded-full bg-violet-600 text-sm font-black text-white shadow-[0_6px_18px_rgba(124,58,237,0.3)] transition hover:-translate-y-0.5 hover:bg-violet-700 hover:shadow-[0_10px_24px_rgba(124,58,237,0.38)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 active:scale-[0.98] sm:h-11"
                  >
                    <Zap className="h-4 w-4" aria-hidden="true" />
                    <span>{startLearningLabel}</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Quick Activities ───────────────────────────────────── */}
        <section
          ref={activitiesRef}
          id="section-activities"
          className="lisan-enter mt-6 rounded-[24px] border border-white/80 bg-[linear-gradient(135deg,#FFFFFF_0%,#F7F1FF_100%)] p-5 shadow-card lg:p-6"
          style={{ '--lisan-enter-delay': '300ms' }}
        >
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="text-2xl font-black text-slate-900">{t('storiesTitle')}</h2>
          </div>

          <div className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-2 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
            {studentStories.map((activity) => (
              <ActivityShortcut key={activity.id} activity={activity} />
            ))}
          </div>
        </section>

        {/* ── Word Games — category picker (deep-links to /games) ──── */}
        <section
          ref={gamesRef}
          id="section-games"
          className="lisan-enter mt-6 rounded-[24px] border border-white/80 bg-[linear-gradient(135deg,#FFFFFF_0%,#FBF8FF_48%,#F4ECFF_100%)] p-5 shadow-card sm:p-6 lg:p-8"
          style={{ '--lisan-enter-delay': '450ms' }}
          dir="rtl"
        >
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-sm font-black text-violet-700">
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  {gamesText.badge}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-500">
                  {gamesText.words(getUniqueGameWordCount())}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-500">
                  {gamesText.levels(getTotalLevelCount())}
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-black text-slate-950 lg:text-3xl">
                {gamesText.title}
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm font-medium leading-6 text-slate-600">
                {gamesText.subtitle}
              </p>
            </div>

            <Link
              to="/games"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-black text-violet-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            >
              <span>{gamesText.all}</span>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gameCategories.map((category) => {
              const Icon = category.meta.icon;
              const colors = COLOR_MAP[category.meta.color] || COLOR_MAP.violet;
              const completedCount = Array.isArray(gameProgress[category.key])
                ? gameProgress[category.key].length
                : 0;
              const progress = category.numLevels
                ? Math.round((completedCount / category.numLevels) * 100)
                : 0;

              return (
                <Link
                  key={category.key}
                  to={`/games?category=${category.key}`}
                  className={`group flex min-h-[178px] flex-col gap-3 rounded-2xl border bg-white/78 p-4 text-right shadow-[inset_0_0_0_1px_rgba(221,214,254,0.45)] backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(124,58,237,0.15)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${colors.border}`}
                >
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${colors.bg} ${colors.text} transition ${colors.hoverBg} group-hover:text-white`}
                  >
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-black text-slate-900">
                      {category.meta[isArabic ? 'ar' : 'he']}
                    </span>
                    <span className="mt-1 block text-xs font-bold text-slate-500">
                      {gamesText.completed(completedCount, category.numLevels)}
                    </span>
                  </span>
                  <span className="mt-auto flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-500">
                    <span>{gamesText.words(category.totalWords)}</span>
                    <span className="opacity-40">·</span>
                    <span>{gamesText.levels(category.numLevels)}</span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-violet-100">
                    <span
                      className={`block h-full rounded-full transition-all ${colors.bar}`}
                      style={{ width: `${progress}%` }}
                    />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── Chat + Links ───────────────────────────────────────── */}
        <section
          ref={resourcesRef}
          id="section-resources"
          className="mt-6 grid gap-5 lg:grid-cols-2"
        >
          {/* Chat with Friends — more important, listed first */}
          <Link
            to="/shared-chat"
            className="lisan-enter group flex flex-col sm:flex-row min-h-[170px] items-center justify-between gap-4 overflow-hidden rounded-[24px] border border-white/80 bg-white p-5 shadow-card transition hover:-translate-y-1.5 hover:shadow-[0_24px_56px_rgba(124,58,237,0.18)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            aria-label={friendsChatTitle}
            dir="ltr"
            style={{ '--lisan-enter-delay': '500ms' }}
          >
            <span className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">
              <MessageCircle className="h-6 w-6" aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1 text-center sm:text-right" dir="rtl">
              <h2 className="text-xl font-black text-slate-900">{friendsChatTitle}</h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">{friendsChatDescription}</p>
              <div className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-violet-600 px-5 text-sm font-black text-white shadow-button transition hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-[0_12px_24px_rgba(124,58,237,0.25)] group-hover:bg-violet-700">
                <span>{isArabic ? 'ابدئي' : 'פתחי'}</span>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>

            <img
              src="/images/friends-chat-image.png"
              alt=""
              className="h-auto w-[150px] max-h-[110px] sm:w-[200px] sm:max-h-[140px] shrink-0 object-contain object-right opacity-95 mix-blend-multiply transition group-hover:scale-105 [mask-image:radial-gradient(ellipse_at_center,#000_0%,#000_68%,rgba(0,0,0,0.62)_84%,transparent_100%)]"
              aria-hidden="true"
            />
          </Link>

          {/* Useful Links */}
          <button
            type="button"
            onClick={() => setIsLinksModalOpen(true)}
            className="lisan-enter group flex flex-col sm:flex-row min-h-[170px] items-center justify-between gap-4 overflow-hidden rounded-[24px] border border-white/80 bg-white p-5 shadow-card transition hover:-translate-y-1.5 hover:shadow-[0_24px_56px_rgba(124,58,237,0.18)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            aria-label={t('openLinks')}
            dir="ltr"
            style={{ '--lisan-enter-delay': '600ms' }}
          >
            <img
              src="/images/useful-links-image.png"
              alt=""
              className="h-auto w-[140px] max-h-[105px] sm:w-[185px] sm:max-h-[135px] shrink-0 object-contain object-left opacity-95 mix-blend-multiply transition group-hover:scale-105 [mask-image:radial-gradient(ellipse_at_center,#000_0%,#000_68%,rgba(0,0,0,0.62)_84%,transparent_100%)]"
              aria-hidden="true"
            />

            <div className="min-w-0 flex-1 text-center sm:text-right" dir="rtl">
              <h2 className="text-xl font-black text-slate-900">{t('linksTitle')}</h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">{t('linksDescription')}</p>
              <div className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-violet-600 px-5 text-sm font-black text-white shadow-button transition hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-[0_12px_24px_rgba(124,58,237,0.25)] group-hover:bg-violet-700">
                <span>{t('openLinks')}</span>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>

            <span className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">
              <LinkIcon className="h-6 w-6" aria-hidden="true" />
            </span>
          </button>
        </section>

        {/* Links Modal */}
        {isLinksModalOpen ? (
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm"
            role="presentation"
            onClick={() => setIsLinksModalOpen(false)}
          >
            <div
              className="lisan-enter w-full max-w-md rounded-[24px] border border-white/80 bg-[linear-gradient(135deg,#FFFFFF_0%,#F7F1FF_100%)] p-6 text-right shadow-[0_28px_80px_rgba(35,22,58,0.28)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="useful-links-modal-title"
              aria-describedby="useful-links-modal-description"
              dir="rtl"
              style={{ '--lisan-enter-delay': '0ms', '--lisan-enter-duration': '260ms' }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                <LinkIcon className="h-7 w-7" aria-hidden="true" />
              </div>

              <h2 id="useful-links-modal-title" className="mt-4 text-xl font-black text-slate-950">
                {linksModalText.title}
              </h2>

              <p id="useful-links-modal-description" className="mt-3 text-sm font-medium leading-7 text-slate-600">
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
                    window.open(USEFUL_LINKS_DRIVE_URL, '_blank', 'noopener,noreferrer');
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

export default Home;

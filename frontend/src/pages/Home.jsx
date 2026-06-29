import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  BotMessageSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  Home as HomeIcon,
  Link as LinkIcon,
  MessageCircle,
  Search,
  Star,
  Volume2,
  Zap,
  Flame,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';

import LisanHeader from '../components/LisanHeader.jsx';
import BottomNav from '../components/BottomNav.jsx';

import { useCountUp } from '../hooks/useCountUp.js';
import {
  getStudentStorySubtitle,
  getStudentStoryTitle,
  studentStories,
} from '../data/studentStories.jsx';
import {
  gameCatalog,
  getCompletedWordCount,
  getTotalLevelCount,
  getUniqueGameWordCount,
} from '../data/vocabGameCatalog.js';
import { getCategoryMeta, COLOR_MAP } from '../data/vocabGameMeta.js';
import { getStoredToken, getStoredUser } from '../services/auth.js';
import { speakHebrew } from '../services/tts.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const USEFUL_LINKS_DRIVE_URL =
  'https://drive.google.com/drive/folders/1AOGvvic8O2K_MzjUJIXMQwGg80unCad8';

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
    <nav className="mt-5 py-3 backdrop-blur-sm lg:sticky lg:top-0 lg:z-30" aria-label={label}>
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

function Home({
  logoTarget = '/home',
  teacherManagementAction = null,
  teacherQuickAction = null,
  headerAction = null,
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const storedUser = getStoredUser();
  const isArabic = i18n.language === 'ar';

  const chatsLabel = isArabic ? 'المحادثة' : 'שיחה';
  const dictionaryTitle = isArabic ? 'إدارة قاموس عبري ↔ عربي' : 'ניהול מילון עברית ↔ ערבית';
  const dictionaryDescription = isArabic
    ? 'راجعي الكلمات والترجمات التي تظهر للطالبات'
    : 'בדקי מילים ותרגומים שמוצגים לתלמידות';
  const dictionaryPlaceholder = isArabic ? 'بحث عن كلمة بالعبرية...' : 'חיפוש מילה בעברית...';
  const showMoreLabel = isArabic ? 'عرض المزيد من الكلمات' : 'הצג עוד מילים';
  const showLessLabel = isArabic ? 'عرض أقل' : 'הצג פחות';
  const friendsChatTitle = isArabic ? 'دردشة مع صديقات' : 'שיחה עם חברות';
  const friendsChatDescription = isArabic
    ? 'اختاري صديقات للتدريب المشترك والسريع'
    : 'בחרי חברות לתרגול משותף ומהיר';
  const heroGamesLabel = isArabic ? 'للألعاب' : 'למשחקים';
  const heroDictionaryLabel = isArabic ? 'للقاموس' : 'למילון';
  const heroAiChatLabel = isArabic ? 'محادثة AI' : 'שיחה עם AI';
  const heroLearningStreakLabel = isArabic ? 'رغبة للتعلم' : 'רצף למידה';
  const heroDaysSuffix = isArabic ? 'أيام متتالية' : 'ימים ברצף';
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
  const [dictionaryQuery, setDictionaryQuery] = useState('');
  const [dictionaryExpanded, setDictionaryExpanded] = useState(false);
  const [favoriteWords, setFavoriteWords] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('lisan-saved-words') || '[]');
    } catch {
      return [];
    }
  });

  const heroRef = useRef(null);
  const activitiesRef = useRef(null);
  const gamesRef = useRef(null);
  const resourcesRef = useRef(null);
  const gamesScrollerRef = useRef(null);
  const activitiesScrollerRef = useRef(null);

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
        id: 'section-dictionary',
        label: isArabic ? 'القاموس' : 'מילון',
        icon: BookOpen,
      },
      {
        id: 'section-games',
        label: isArabic ? 'ألعاب' : 'משחקים',
        icon: Gamepad2,
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
        { id: 'section-dictionary', ref: { current: document.getElementById('section-dictionary') } },
        { id: 'section-resources', ref: resourcesRef },
      ];
      const marker = window.scrollY + 180;
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
    setActiveSection(id);

    if (id === 'section-hero') {
      window.scrollTo({ top: 0, behavior: shouldReduceMotion() ? 'auto' : 'smooth' });
      return;
    }

    const el = document.getElementById(id);
    if (!el) return;

    if (id === 'section-dictionary') {
      el.scrollIntoView({ behavior: shouldReduceMotion() ? 'auto' : 'smooth', block: 'center' });
      return;
    }

    // Center other sections vertically, accounting for the sticky header (~64px)
    const rect = el.getBoundingClientRect();
    const headerOffset = 64;
    const centeredTop =
      window.scrollY + rect.top - (window.innerHeight - rect.height) / 2 + headerOffset;

    window.scrollTo({
      top: Math.max(0, centeredTop),
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
        return b.totalWords - a.totalWords;
      });
  }, []);

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
    : filteredDictionaryWords.slice(0, 2);

  const canToggleDictionary = filteredDictionaryWords.length > 2;

  const toggleFavoriteWord = (hebrewWord) => {
    setFavoriteWords((currentWords) => {
      if (currentWords.includes(hebrewWord)) {
        const nextWords = currentWords.filter((word) => word !== hebrewWord);
        localStorage.setItem('lisan-saved-words', JSON.stringify(nextWords));
        window.dispatchEvent(new Event('lisan-saved-words-changed'));
        return nextWords;
      }

      const nextWords = [...currentWords, hebrewWord];
      localStorage.setItem('lisan-saved-words', JSON.stringify(nextWords));
      window.dispatchEvent(new Event('lisan-saved-words-changed'));
      return nextWords;
    });
  };

  const scrollGames = (direction) => {
    const scroller = gamesScrollerRef.current;
    if (!scroller) return;

    const distance = Math.min(scroller.clientWidth * 0.8, 620);
    scroller.scrollBy({
      left: direction * distance,
      behavior: shouldReduceMotion() ? 'auto' : 'smooth',
    });
  };

  const openGameCategory = (categoryKey) => {
    navigate(`/games?category=${encodeURIComponent(categoryKey)}`);
  };

  const handleGamesWheel = (event) => {
    const scroller = gamesScrollerRef.current;
    if (!scroller) return;

    const horizontalDelta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (horizontalDelta === 0) return;

    event.preventDefault();
    scroller.scrollLeft += horizontalDelta;
  };

  const scrollActivities = (direction) => {
    const scroller = activitiesScrollerRef.current;
    if (!scroller) return;
    const distance = Math.min(scroller.clientWidth * 0.8, 620);
    scroller.scrollBy({ left: direction * distance, behavior: shouldReduceMotion() ? 'auto' : 'smooth' });
  };

  const handleActivitiesWheel = (event) => {
    const scroller = activitiesScrollerRef.current;
    if (!scroller) return;
    const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (horizontalDelta === 0) return;
    event.preventDefault();
    scroller.scrollLeft += horizontalDelta;
  };

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
    <main className="relative min-h-screen rounded-[28px] bg-[radial-gradient(circle_at_12%_8%,rgba(221,214,254,0.54),transparent_30%),linear-gradient(180deg,#FBF8FF_0%,#FFF8FC_48%,#F4EEFF_100%)] text-slate-900">

      <div className="app-page-container relative pb-32" dir="rtl">

        <LisanHeader
          logoTarget={logoTarget}
          extraLeft={headerAction}
          sections={sections}
          activeSection={activeSection}
          onSectionClick={scrollToSection}
          navLabel={sectionNavigationLabel}
          onLogout={() => navigate('/login')}
        />

        {/* ── Hero ──────────────────────────────────────────────── */}
        <section
          ref={heroRef}
          id="section-hero"
          className="lisan-enter relative mt-4 overflow-hidden rounded-[34px] border border-white/85 bg-cover bg-center shadow-[0_24px_70px_rgba(91,33,182,0.14)] sm:mt-6"
          style={{ '--lisan-enter-delay': '150ms', backgroundImage: 'url("/images/HADD.png")' }}
        >
          <div className="pointer-events-none absolute inset-0 bg-white/10" />


          <div
            className="relative min-h-[340px]"
            dir="rtl"
          >
            {/* Content */}
            <div
              className="relative z-10 flex min-h-[340px] w-full min-w-0 items-center justify-start p-4 text-right sm:p-5 lg:min-h-[380px] lg:p-6"
              dir="rtl"
            >
              <div
                className="w-full max-w-[480px] sm:p-6 lg:p-7"
                style={{
                  background: 'linear-gradient(160deg, rgba(255,255,255,0.82) 0%, rgba(248,244,255,0.74) 50%, rgba(236,254,255,0.70) 100%)',
                  borderRadius: '28px',
                  border: '1px solid rgba(221,214,254,0.6)',
                  boxShadow: '0 26px 66px rgba(91,33,182,0.17), 0 8px 22px rgba(14,165,233,0.08), inset 0 1px 0 rgba(255,255,255,0.92)',
                  padding: '16px 20px 20px',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
              >
                {/* Name */}
                <div className="flex items-center justify-center">
                  <p className="text-sm font-bold text-slate-500 lg:text-base">
                    {loading ? loadingLabel : t('welcome', { name: student.name || studentNameFallback })}
                  </p>
                </div>

                {/* Greeting */}
                <h1 className="mt-1 flex items-center justify-center gap-3 text-[clamp(1.7rem,2.6vw,2.8rem)] font-black leading-tight text-slate-950 text-center">
                  {t('homeGreeting')}
                  <span className="text-violet-600">☼</span>
                </h1>

                <p className="mt-2 mx-auto max-w-xl text-center text-base font-medium leading-6 text-slate-600 sm:text-[clamp(1rem,1.1vw,1.15rem)]">
                  {t('homeIntro')}
                </p>

                {/* ── Action buttons ── */}
                <div className="mt-5 grid grid-cols-2 gap-2.5 sm:flex sm:items-center sm:justify-center">

                  {/* AI Chat — primary hero CTA */}
                  <Link
                    to="/chatbot"
                    className="relative inline-flex h-full min-h-[112px] w-full flex-[1.45] items-center justify-center gap-2.5 overflow-hidden whitespace-nowrap rounded-[22px] px-5 text-[15px] font-black text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 active:scale-[0.97] sm:h-[52px] sm:min-h-0 sm:w-auto"
                    style={{
                      background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%)',
                      boxShadow: '0 8px 24px rgba(109,40,217,0.35), 0 2px 6px rgba(109,40,217,0.18), inset 0 1px 0 rgba(255,255,255,0.15)',
                      transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-3px)';
                      e.currentTarget.style.boxShadow = '0 16px 36px rgba(109,40,217,0.42), 0 4px 10px rgba(109,40,217,0.22), inset 0 1px 0 rgba(255,255,255,0.18)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = '';
                      e.currentTarget.style.boxShadow = '0 8px 24px rgba(109,40,217,0.35), 0 2px 6px rgba(109,40,217,0.18), inset 0 1px 0 rgba(255,255,255,0.15)';
                    }}
                  >
                    <span
                      className="pointer-events-none absolute inset-0 rounded-[22px] bg-violet-400"
                      style={{ animation: 'lisan-chatbot-pulse 2.6s cubic-bezier(0.4,0,0.6,1) infinite' }}
                      aria-hidden="true"
                    />
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-[40%] rounded-t-[22px] bg-gradient-to-b from-white/20 to-transparent" aria-hidden="true" />
                    <BotMessageSquare className="relative h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="relative">{heroAiChatLabel}</span>
                  </Link>

                  <div className="flex flex-col gap-2.5 sm:contents">
                    {/* Games — secondary pill */}
                    <Link
                      to="/games"
                      className="group inline-flex flex-1 items-center justify-center gap-2 rounded-[22px] border border-violet-200/60 bg-white/80 px-3 text-[15px] font-black text-violet-700 shadow-[0_4px_14px_rgba(124,58,237,0.08)] backdrop-blur transition hover:-translate-y-0.5 hover:border-violet-300/80 hover:bg-violet-50 hover:shadow-[0_8px_20px_rgba(124,58,237,0.14)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 active:scale-[0.97] sm:h-[52px] sm:flex-1"
                    >
                      <Gamepad2 className="h-4 w-4 shrink-0 text-violet-500" aria-hidden="true" />
                      <span>{heroGamesLabel}</span>
                    </Link>

                    {/* Dictionary — secondary pill */}
                    <button
                      type="button"
                      onClick={() => {
                        document
                          .getElementById('section-dictionary')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-[22px] border border-violet-200/60 bg-white/80 px-3 text-[15px] font-black text-violet-700 shadow-[0_4px_14px_rgba(124,58,237,0.08)] backdrop-blur transition hover:-translate-y-0.5 hover:border-violet-300/80 hover:bg-violet-50 hover:shadow-[0_8px_20px_rgba(124,58,237,0.14)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 active:scale-[0.97] sm:h-[52px] sm:flex-1"
                    >
                      <BookOpen className="h-4 w-4 shrink-0 text-violet-500" aria-hidden="true" />
                      <span>{heroDictionaryLabel}</span>
                    </button>
                  </div>
                </div>

                {/* Stats — clickable */}
                <div className="mt-4 mx-auto grid w-full max-w-2xl grid-cols-2 gap-3">
                  <div
                    className="flex min-h-[86px] items-center justify-between rounded-[20px] border border-violet-100 bg-violet-50/70 px-5 p-3 text-right transition"
                  >
                    <span className="flex flex-col items-end">
                      <span className="block whitespace-nowrap text-xs font-bold text-slate-500 sm:text-sm">{chatsLabel}</span>
                      <span className="mt-1 block text-3xl font-black text-violet-700">
                        {loading ? '–' : chatsDisplay}
                      </span>
                    </span>
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                      <MessageCircle className="h-6 w-6" aria-hidden="true" />
                    </span>
                  </div>

                  <div
                    className="flex min-h-[86px] items-center justify-between rounded-[20px] border border-amber-100 bg-amber-50/75 px-5 p-3 text-right transition"
                  >
                    <span className="flex flex-col items-end">
                      <span className="block whitespace-nowrap text-xs font-bold text-slate-500 sm:text-sm">{heroLearningStreakLabel}</span>
                      <span className="mt-1 block text-3xl font-black text-amber-600">
                        {loading ? '–' : chatsDisplay}
                      </span>
                      <span className="mt-0.5 block text-base font-bold text-slate-500">{heroDaysSuffix}</span>
                    </span>
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                      <Flame className="h-6 w-6" aria-hidden="true" />
                    </span>
                  </div>
                </div>

                {/* Progress */}
                <div className="mt-3 rounded-[18px] border border-violet-100 bg-violet-50/70 p-3">
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
            {teacherQuickAction}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => scrollActivities(1)}
              className="absolute right-0 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-violet-700 shadow-[0_14px_32px_rgba(124,58,237,0.18)] backdrop-blur transition hover:-translate-y-[55%] hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              aria-label={isArabic ? 'تمرير الأنشطة يميناً' : 'גלילה ימינה בפעילויות'}
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>

            <div
              ref={activitiesScrollerRef}
              className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-2 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
              dir="ltr"
              onWheel={handleActivitiesWheel}
            >
              {studentStories.map((activity) => (
                <ActivityShortcut key={activity.id} activity={activity} />
              ))}
            </div>

            <button
              type="button"
              onClick={() => scrollActivities(-1)}
              className="absolute left-0 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-violet-700 shadow-[0_14px_32px_rgba(124,58,237,0.18)] backdrop-blur transition hover:-translate-y-[55%] hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              aria-label={isArabic ? 'تمرير الأنشطة يساراً' : 'גלילה שמאלה בפעילויות'}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </section>

        {/* ── Dictionary ────────────────────────────────────────── */}
        <section
          id="section-dictionary"
          className="lisan-enter relative mt-6 overflow-hidden rounded-[24px] border border-white/80 bg-[linear-gradient(135deg,#FFFFFF_0%,#FBF8FF_48%,#F4ECFF_100%)] p-5 shadow-card sm:p-6 lg:p-8"
          style={{
            '--lisan-enter-delay': '390ms',
            '--lisan-enter-duration': '400ms',
          }}
        >
          <div className="pointer-events-none absolute -left-12 top-4 h-44 w-44 rounded-full bg-violet-200/35 blur-3xl" />
          <div className="pointer-events-none absolute bottom-10 right-12 h-28 w-28 rounded-full bg-fuchsia-100/70 blur-3xl" />

          <div className="relative grid gap-6 md:grid-cols-[0.38fr_0.62fr]" dir="ltr">
            <div className="pointer-events-none flex min-h-[150px] items-center justify-start md:min-h-[190px]" aria-hidden="true">
              <img
                src="/images/dictionary-image.png"
                alt=""
                className="lisan-dictionary-art h-[170px] w-full max-w-[360px] object-contain object-left opacity-100 md:h-[220px] md:max-w-[430px]"
              />
            </div>

            <div className="relative z-10 flex min-w-0 flex-col justify-center text-right" dir="rtl">
              <h2 className="text-[clamp(1.55rem,2vw,2.5rem)] font-black text-slate-950">
                {dictionaryTitle}
              </h2>
              <p className="mt-2 text-[clamp(1.25rem,1vw,1.5rem)] font-medium leading-7 text-slate-600">
                {dictionaryDescription}
              </p>

              <label className="relative mt-4 block">
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
                    setDictionaryExpanded(false);
                  }}
                  placeholder={dictionaryPlaceholder}
                  className="h-12 w-full rounded-full border border-violet-100 bg-violet-50/75 py-3 pl-4 pr-12 text-right text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(124,58,237,0.12)] sm:h-14 sm:text-base"
                  dir="rtl"
                />
              </label>
            </div>
          </div>

          <div className="relative z-10 mt-5 overflow-x-auto rounded-[22px] bg-white/72 shadow-[inset_0_0_0_1px_rgba(221,214,254,0.72)] backdrop-blur-sm [scrollbar-width:thin]">
            <motion.div
              layout
              initial={false}
              animate={{ height: 'auto' }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }
              }
            >
              <table className="w-full min-w-[620px] border-collapse text-right">
                <thead>
                  <tr className="bg-violet-50/70 text-sm font-black text-violet-800">
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
                        className="lisan-dictionary-row border-t border-violet-100/80 text-base font-bold text-slate-800 transition hover:bg-violet-50/80"
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
                            onClick={() => speakHebrew(word.hebrew)}
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
            </motion.div>
          </div>

          {canToggleDictionary ? (
            <button
              type="button"
              onClick={() => {
                setDictionaryExpanded((currentValue) => !currentValue);
              }}
              className="relative z-10 mx-auto mt-4 flex flex-col items-center justify-center gap-1 rounded-2xl px-5 py-2 text-sm font-black text-violet-700 transition duration-300 hover:-translate-y-1 hover:bg-violet-50 hover:shadow-[0_14px_28px_rgba(124,58,237,0.14)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              aria-expanded={dictionaryExpanded}
            >
              <ChevronDown
                className={`h-6 w-6 transition duration-300 ${
                  dictionaryExpanded ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
              <span>
                {dictionaryExpanded ? showLessLabel : showMoreLabel}
              </span>
            </button>
          ) : null}
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
              <p className="mt-1.5 max-w-2xl text-lg font-medium leading-6 text-slate-600">
                {gamesText.subtitle}
              </p>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => scrollGames(1)}
              className="absolute right-0 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-violet-700 shadow-[0_14px_32px_rgba(124,58,237,0.18)] backdrop-blur transition hover:-translate-y-[55%] hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              aria-label={isArabic ? 'تمرير الألعاب يميناً' : 'גלילה ימינה במשחקים'}
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>

            <div
              ref={gamesScrollerRef}
              className="lisan-games-carousel flex snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain px-1 pb-3 pt-1 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
              dir="ltr"
              onWheel={handleGamesWheel}
            >
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
                  <button
                    key={category.key}
                    type="button"
                    onClick={() => openGameCategory(category.key)}
                    className={`group flex min-h-[184px] w-[76%] shrink-0 snap-start flex-col items-center justify-between gap-3 rounded-2xl border bg-white/78 p-4 text-center shadow-[inset_0_0_0_1px_rgba(221,214,254,0.45),0_16px_34px_rgba(124,58,237,0.1)] backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-[0_20px_42px_rgba(124,58,237,0.17)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:w-[260px] lg:w-[280px] ${colors.border}`}
                    dir="rtl"
                  >
                    <span
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl ${colors.bg} ${colors.text} transition ${colors.hoverBg} group-hover:text-white`}
                    >
                      <Icon className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-black text-slate-900">
                        {category.meta[isArabic ? 'ar' : 'he']}
                      </span>
                      <span className="mt-1 block text-base font-bold text-slate-500">
                        {gamesText.completed(completedCount, category.numLevels)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center justify-center gap-1.5 text-base font-bold text-slate-500">
                      <span>{gamesText.words(category.totalWords)}</span>
                      <span className="opacity-40">·</span>
                      <span>{gamesText.levels(category.numLevels)}</span>
                    </span>
                    <span className="h-1.5 w-full overflow-hidden rounded-full bg-violet-100">
                      <span
                        className={`block h-full rounded-full transition-all ${colors.bar}`}
                        style={{ width: `${progress}%` }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => scrollGames(-1)}
              className="absolute left-0 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-violet-700 shadow-[0_14px_32px_rgba(124,58,237,0.18)] backdrop-blur transition hover:-translate-y-[55%] hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              aria-label={isArabic ? 'تمرير الألعاب يساراً' : 'גלילה שמאלה במשחקים'}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 flex justify-center">
            <Link
              to="/games"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-black text-violet-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            >
              <span>{gamesText.all}</span>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
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

          {teacherManagementAction}
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

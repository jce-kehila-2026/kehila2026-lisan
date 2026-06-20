import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Flame,
  Gamepad2,
  RotateCw,
  Sparkles,
  Star,
  Trophy,
  Volume2,
  X,
} from 'lucide-react';

import { getStoredToken } from '../services/auth.js';
import {
  gameCatalog,
  getCompletedWordEntries,
  getTotalLevelCount,
  getUniqueGameWordCount,
  getUniqueGameWords,
} from '../data/vocabGameCatalog.js';
import { COLOR_MAP, getCategoryMeta } from '../data/vocabGameMeta.js';

const API_BASE_URL = 'http://localhost:3000/api';
const PASS_THRESHOLD = 6;

const LABELS = {
  ar: {
    title: 'لعبة الكلمات',
    badge: 'لعبة واحدة',
    intro: 'اختاري تصنيفاً، افتحي الكروت، ثم اجتازي الاختبار حتى تُحسب الكلمات كمكتملة.',
    categoriesTab: 'التصنيفات',
    completedTab: 'الكلمات المكتملة',
    words: (count) => `${count} كلمة`,
    levels: (count) => `${count} مرحلة`,
    completedLevels: (done, total) => `${done} من ${total} مكتملة`,
    chooseCategory: 'اختاري تصنيفاً للبدء',
    backToCategories: 'رجوع للتصنيفات',
    chooseLevel: 'اختاري مرحلة. كل مرحلة تعرض كروت كلمات وتنتهي باختبار قصير.',
    level: (number) => `مرحلة ${number}`,
    cardCount: (count) => `${count} كروت`,
    completed: 'مكتملة',
    backToLevels: 'رجوع للمراحل',
    tapToFlip: 'اضغطي لرؤية الترجمة',
    listen: 'استماع',
    previous: 'السابق',
    next: 'التالي',
    finishToQuiz: 'أنهيت الكروت - إلى الاختبار',
    quiz: 'اختبار',
    backToCards: 'رجوع للكروت',
    questionPrompt: 'ما ترجمة',
    nextQuestion: 'السؤال التالي',
    finish: 'إنهاء',
    score: (score, total) => `علامتك: ${score} / ${total}`,
    streak: 'سلسلة',
    bestStreak: (n) => `أطول سلسلة: ${n} متتالية`,
    correctMsgs: ['أحسنت!', 'صحيح!', 'ممتاز!', 'رائع!', 'عظيم!'],
    streakMsgs: { 3: 'سلسلة جميلة!', 4: 'أنتِ مشتعلة!', 5: 'لا يمكن إيقافك!' },
    wrongMsg: 'تقريباً! لنجرب التالي',
    resultPerfect: 'ممتاز جداً!',
    resultGreat: 'أحسنتِ!',
    resultGood: 'جيد جداً!',
    resultPass: 'نجحتِ!',
    resultRetry: 'جرّبي المرحلة مرة أخرى',
    passedHint: 'تمت إضافة كلمات هذه المرحلة إلى الكلمات المكتملة.',
    retryHint: 'راجعي الكروت ثم أعيدي الاختبار حتى تُحسب الكلمات.',
    tryAgain: 'إعادة الاختبار',
    completedEmptyTitle: 'لا توجد كلمات مكتملة بعد',
    completedEmptyText: 'اجتازي اختبار مرحلة واحدة على الأقل حتى تظهر الكلمات هنا.',
    completedDescription: 'هذه الكلمات محسوبة من المراحل التي نجحتِ في اختبارها فقط.',
    fromCategory: 'التصنيف',
    fromLevel: 'المرحلة',
  },
  he: {
    title: 'משחק המילים',
    badge: 'משחק אחד',
    intro: 'בחרי קטגוריה, פתחי את הכרטיסים ואז עברי את הבוחן כדי שהמילים ייחשבו כמושלמות.',
    categoriesTab: 'קטגוריות',
    completedTab: 'מילים שהושלמו',
    words: (count) => `${count} מילים`,
    levels: (count) => `${count} שלבים`,
    completedLevels: (done, total) => `${done} מתוך ${total} הושלמו`,
    chooseCategory: 'בחרי קטגוריה להתחלה',
    backToCategories: 'חזרה לקטגוריות',
    chooseLevel: 'בחרי שלב. בכל שלב יש כרטיסי מילים ובסוף בוחן קצר.',
    level: (number) => `שלב ${number}`,
    cardCount: (count) => `${count} כרטיסים`,
    completed: 'הושלם',
    backToLevels: 'חזרה לשלבים',
    tapToFlip: 'לחצי כדי לראות תרגום',
    listen: 'השמעה',
    previous: 'הקודם',
    next: 'הבא',
    finishToQuiz: 'סיימתי כרטיסים - לבוחן',
    quiz: 'בוחן',
    backToCards: 'חזרה לכרטיסים',
    questionPrompt: 'מה התרגום של',
    nextQuestion: 'השאלה הבאה',
    finish: 'סיום',
    score: (score, total) => `הציון שלך: ${score} / ${total}`,
    streak: 'רצף',
    bestStreak: (n) => `רצף שיא: ${n} ברצף`,
    correctMsgs: ['יפה!', 'נכון!', 'מצוין!', 'מעולה!', 'כל הכבוד!'],
    streakMsgs: { 3: 'רצף יפה!', 4: 'את בוערת!', 5: 'בלתי ניתנת לעצירה!' },
    wrongMsg: 'כמעט! ננסה את הבא',
    resultPerfect: 'מושלם!',
    resultGreat: 'כל הכבוד!',
    resultGood: 'יפה מאוד!',
    resultPass: 'עברת!',
    resultRetry: 'נסי שוב את השלב',
    passedHint: 'המילים בשלב הזה נוספו למילים שהושלמו.',
    retryHint: 'חזרי לכרטיסים ונסי שוב כדי שהמילים ייספרו.',
    tryAgain: 'נסי שוב',
    completedEmptyTitle: 'אין עדיין מילים שהושלמו',
    completedEmptyText: 'עברו בוחן של שלב אחד לפחות כדי לראות כאן מילים.',
    completedDescription: 'המילים כאן מחושבות רק משלבים שעברת בבוחן.',
    fromCategory: 'קטגוריה',
    fromLevel: 'שלב',
  },
};

function pronounce(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'he-IL';
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function shuffle(arr) {
  const copy = [...arr];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function addCompletedLevel(progress, categoryKey, levelIndex) {
  const existing = Array.isArray(progress[categoryKey]) ? progress[categoryKey] : [];
  const next = new Set(existing);
  next.add(levelIndex);
  return {
    ...progress,
    [categoryKey]: Array.from(next).sort((a, b) => a - b),
  };
}

// Star tier from score ratio: 3 stars >=90% (9-10/10), 2 stars >=70% (7-8/10),
// 1 star for any pass. Generalizes the 9-10 / 7-8 / 6 tiers to any quiz length.
function starsForScore(score, total) {
  if (!total) return 0;
  const ratio = score / total;
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.7) return 2;
  return 1;
}

function VocabGame() {
  const { i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const language = i18n.language === 'he' ? 'he' : 'ar';
  const text = LABELS[language];

  const initialCategoryParam = searchParams.get('category');
  const initialCategory =
    initialCategoryParam && gameCatalog[initialCategoryParam] ? initialCategoryParam : null;

  const [gameProgress, setGameProgress] = useState({});
  const [view, setView] = useState(() => {
    if (searchParams.get('view') === 'completed') return 'completed';
    if (initialCategory) return 'levels';
    return 'categories';
  });
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [activeLevel, setActiveLevel] = useState(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [savedThisQuiz, setSavedThisQuiz] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [cheer, setCheer] = useState(null);

  const allWords = useMemo(() => getUniqueGameWords(gameCatalog), []);
  const totalWordCount = useMemo(() => getUniqueGameWordCount(), []);
  const totalLevelCount = useMemo(() => getTotalLevelCount(), []);
  const completedWords = useMemo(
    () => getCompletedWordEntries(gameProgress, gameCatalog),
    [gameProgress],
  );

  const categories = useMemo(() => {
    return Object.entries(gameCatalog)
      .map(([key, value]) => {
        const meta = getCategoryMeta(key);
        return {
          key,
          totalWords: value.total_words || value.levels?.flat().length || 0,
          numLevels: value.num_levels || value.levels?.length || 0,
          meta,
        };
      })
      .sort((a, b) => {
        return b.totalWords - a.totalWords;
      });
  }, []);

  const activeCategoryData = activeCategory ? gameCatalog[activeCategory] : null;
  const activeMeta = activeCategory ? getCategoryMeta(activeCategory) : null;
  const activeLevels = activeCategoryData?.levels || [];
  const levelWords =
    activeCategory != null && activeLevel != null
      ? activeCategoryData?.levels?.[activeLevel] || []
      : [];
  const currentCard = levelWords[cardIndex];
  const currentQuestion = questions[qIndex];
  const quizDone = view === 'quiz' && qIndex >= questions.length && questions.length > 0;
  const passThreshold = Math.min(PASS_THRESHOLD, questions.length || PASS_THRESHOLD);
  const passedQuiz = quizDone && score >= passThreshold;
  const starCount = quizDone ? starsForScore(score, questions.length) : 0;

  useEffect(() => {
    if (searchParams.get('view') === 'completed') {
      setView('completed');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!searchParams.has('category')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('category');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;

    fetch(`${API_BASE_URL}/progress/game`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.categories) setGameProgress(data.categories);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (
      !quizDone ||
      savedThisQuiz ||
      !passedQuiz ||
      activeCategory == null ||
      activeLevel == null
    ) {
      return;
    }

    setSavedThisQuiz(true);
    setGameProgress((current) => addCompletedLevel(current, activeCategory, activeLevel));

    const token = getStoredToken();
    if (!token) return;

    fetch(`${API_BASE_URL}/progress/game/complete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ category: activeCategory, levelIndex: activeLevel }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.categories) setGameProgress(data.categories);
      })
      .catch(() => {});
  }, [activeCategory, activeLevel, passedQuiz, quizDone, savedThisQuiz]);

  useEffect(() => {
    if (!cheer) return undefined;
    const timer = setTimeout(() => setCheer(null), 1100);
    return () => clearTimeout(timer);
  }, [cheer]);

  const setGameView = (nextView) => {
    setView(nextView);
    setActiveCategory(null);
    setActiveLevel(null);

    if (nextView === 'completed') {
      setSearchParams({ view: 'completed' }, { replace: true });
    } else if (searchParams.has('view')) {
      setSearchParams({}, { replace: true });
    }
  };

  const getLevelLabel = (index) => {
    const levelLabel = activeCategoryData?.levelLabels?.[index]?.[language];
    return levelLabel || text.level(index + 1);
  };

  const openCategory = (key) => {
    setActiveCategory(key);
    setActiveLevel(null);
    setView('levels');
  };

  const backToCategories = () => {
    setGameView('categories');
  };

  const openLevel = (index) => {
    setActiveLevel(index);
    setCardIndex(0);
    setFlipped(false);
    setQuestions([]);
    setView('cards');
  };

  const backToLevels = () => {
    setView('levels');
    setActiveLevel(null);
  };

  const nextCard = () => {
    if (cardIndex < levelWords.length - 1) {
      setCardIndex((index) => index + 1);
      setFlipped(false);
    }
  };

  const prevCard = () => {
    if (cardIndex > 0) {
      setCardIndex((index) => index - 1);
      setFlipped(false);
    }
  };

  const startQuiz = () => {
    if (!activeCategory || !levelWords.length) return;

    const categoryWords = activeCategoryData.levels.flat();
    const built = levelWords.map((word) => {
      const options = new Set([word.arabic]);
      const pool = shuffle([...categoryWords, ...allWords]).filter(
        (candidate) => candidate.arabic && candidate.arabic !== word.arabic,
      );

      for (const candidate of pool) {
        options.add(candidate.arabic);
        if (options.size >= 4) break;
      }

      return {
        hebrew: word.hebrew,
        correct: word.arabic,
        options: shuffle(Array.from(options)),
      };
    });

    setQuestions(built);
    setQIndex(0);
    setSelected(null);
    setScore(0);
    setSavedThisQuiz(false);
    setStreak(0);
    setBestStreak(0);
    setCheer(null);
    setView('quiz');
  };

  const answer = (option) => {
    if (selected !== null) return;
    setSelected(option);
    if (option === currentQuestion.correct) {
      setScore((current) => current + 1);
      setStreak((current) => {
        const next = current + 1;
        setBestStreak((best) => Math.max(best, next));
        const milestone = text.streakMsgs[next];
        const praise = text.correctMsgs[Math.min(next, text.correctMsgs.length) - 1];
        setCheer({ tone: 'good', msg: milestone || praise || text.correctMsgs[0] });
        return next;
      });
    } else {
      setStreak(0);
      setCheer({ tone: 'bad', msg: text.wrongMsg });
    }
  };

  const nextQuestion = () => {
    if (qIndex < questions.length - 1) {
      setQIndex((index) => index + 1);
      setSelected(null);
    } else {
      setQIndex(questions.length);
    }
  };

  const resultTitle = () => {
    if (!passedQuiz) return text.resultRetry;
    if (starCount >= 3) return score === questions.length ? text.resultPerfect : text.resultGreat;
    if (starCount === 2) return text.resultGood;
    return text.resultPass;
  };

  return (
    <section
      className="lisan-enter mt-8 rounded-[28px] border border-white/80 bg-[linear-gradient(135deg,#FFFFFF_0%,#FBF8FF_48%,#F4ECFF_100%)] p-5 shadow-card sm:p-6 lg:p-8"
      style={{ '--lisan-enter-delay': '450ms' }}
      dir="rtl"
    >
      <style>{`
        @keyframes lisan-pop { 0%{transform:scale(1)} 50%{transform:scale(1.4)} 100%{transform:scale(1)} }
        @keyframes lisan-shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 50%{transform:translateX(8px)} 75%{transform:translateX(-5px)} }
        @keyframes lisan-cheer { 0%{opacity:0;transform:translateY(8px) scale(.9)} 100%{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes lisan-star { 0%{opacity:0;transform:scale(0) rotate(-40deg)} 60%{opacity:1;transform:scale(1.4) rotate(10deg)} 100%{opacity:1;transform:scale(1) rotate(0)} }
        @keyframes lisan-trophy { 0%{transform:scale(0) rotate(-30deg)} 60%{transform:scale(1.15) rotate(8deg)} 100%{transform:scale(1) rotate(0)} }
        @keyframes lisan-optin { 0%{opacity:0;transform:translateX(14px)} 100%{opacity:1;transform:translateX(0)} }
        .lisan-flip-card { perspective:1200px; }
        .lisan-flip-inner { position:relative; transition:transform .6s cubic-bezier(.34,1.56,.4,1); transform-style:preserve-3d; }
        .lisan-flip-inner.is-flipped { transform:rotateY(180deg); }
        .lisan-flip-face { position:absolute; inset:0; backface-visibility:hidden; -webkit-backface-visibility:hidden; }
        .lisan-flip-back { transform:rotateY(180deg); }
        .lisan-pop { animation:lisan-pop .32s ease; }
        .lisan-shake { animation:lisan-shake .38s ease; }
        .lisan-cheer { animation:lisan-cheer .26s ease; }
        .lisan-star { display:inline-block; animation:lisan-star .5s cubic-bezier(.34,1.56,.4,1) backwards; }
        .lisan-trophy { animation:lisan-trophy .6s cubic-bezier(.34,1.56,.4,1); }
        .lisan-optin { animation:lisan-optin .26s ease backwards; }
      `}</style>

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-sm font-black text-violet-700">
              <Gamepad2 className="h-4 w-4" aria-hidden="true" />
              {text.badge}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-500">
              {text.words(totalWordCount)}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-500">
              {text.levels(totalLevelCount)}
            </span>
          </div>
          <h2 className="mt-3 text-[clamp(1.7rem,2.1vw,2.7rem)] font-black text-slate-950">
            {text.title}
          </h2>
          <p className="mt-2 max-w-3xl text-[clamp(0.95rem,1vw,1.15rem)] font-medium leading-7 text-slate-600">
            {text.intro}
          </p>
        </div>

        <div className="inline-flex w-full rounded-full border border-violet-100 bg-white/80 p-1 shadow-sm sm:w-auto">
          <button
            type="button"
            onClick={() => setGameView('categories')}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-black transition sm:flex-none ${
              view === 'completed'
                ? 'text-violet-700 hover:bg-violet-50'
                : 'bg-violet-600 text-white shadow-sm'
            }`}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {text.categoriesTab}
          </button>
          <button
            type="button"
            onClick={() => setGameView('completed')}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-black transition sm:flex-none ${
              view === 'completed'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-violet-700 hover:bg-violet-50'
            }`}
          >
            <BadgeCheck className="h-4 w-4" aria-hidden="true" />
            {text.completedTab}
          </button>
        </div>
      </div>

      {view === 'categories' && (
        <>
          <h3 className="text-lg font-black text-slate-900">{text.chooseCategory}</h3>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((category) => {
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
                  onClick={() => openCategory(category.key)}
                  className={`group flex min-h-[178px] flex-col gap-3 rounded-2xl border bg-white/78 p-4 text-right shadow-[inset_0_0_0_1px_rgba(221,214,254,0.45)] backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(124,58,237,0.15)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${colors.border}`}
                >
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${colors.bg} ${colors.text} transition ${colors.hoverBg} group-hover:text-white`}
                  >
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-black text-slate-900">
                      {category.meta[language]}
                    </span>
                    <span className="mt-1 block text-xs font-bold text-slate-500">
                      {text.completedLevels(completedCount, category.numLevels)}
                    </span>
                  </span>
                  <span className="mt-auto flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-500">
                    <span>{text.words(category.totalWords)}</span>
                    <span className="opacity-40">·</span>
                    <span>{text.levels(category.numLevels)}</span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-violet-100">
                    <span
                      className={`block h-full rounded-full transition-all ${colors.bar}`}
                      style={{ width: `${progress}%` }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {view === 'completed' && (
        <div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-xl font-black text-slate-950">{text.completedTab}</h3>
              <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                {text.completedDescription}
              </p>
            </div>
            <span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-black text-violet-700">
              {text.words(completedWords.length)}
            </span>
          </div>

          {completedWords.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {completedWords.map((word) => {
                const meta = getCategoryMeta(word.categoryKey);
                const levelName =
                  word.levelLabel?.[language] || text.level(Number(word.levelIndex) + 1);

                return (
                  <article
                    key={`${word.categoryKey}-${word.levelIndex}-${word.id || word.hebrew}`}
                    className="rounded-2xl border border-violet-100/80 bg-white/82 p-4 shadow-[0_12px_28px_rgba(124,58,237,0.08)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-2xl font-black text-slate-950">{word.hebrew}</h4>
                        <p className="mt-1 text-base font-bold text-violet-700">{word.arabic}</p>
                        {word.transliteration ? (
                          <p className="mt-1 text-sm font-bold text-slate-400">
                            {word.transliteration}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => pronounce(word.hebrew)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700 transition hover:bg-violet-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        aria-label={text.listen}
                      >
                        <Volume2 className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-black text-slate-500">
                      <span className="rounded-full bg-slate-50 px-3 py-1">
                        {text.fromCategory}: {meta[language]}
                      </span>
                      <span className="rounded-full bg-slate-50 px-3 py-1">
                        {text.fromLevel}: {levelName}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-violet-200 bg-white/72 p-6 text-center">
              <Trophy className="mx-auto h-10 w-10 text-violet-300" aria-hidden="true" />
              <h3 className="mt-3 text-lg font-black text-slate-900">
                {text.completedEmptyTitle}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm font-bold leading-6 text-slate-500">
                {text.completedEmptyText}
              </p>
            </div>
          )}
        </div>
      )}

      {view === 'levels' && activeCategory && (
        <>
          <div className="mb-1 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              {activeMeta ? (
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                    COLOR_MAP[activeMeta.color]?.bg || COLOR_MAP.violet.bg
                  } ${COLOR_MAP[activeMeta.color]?.text || COLOR_MAP.violet.text}`}
                >
                  <activeMeta.icon className="h-6 w-6" aria-hidden="true" />
                </span>
              ) : null}
              <div>
                <h3 className="text-[clamp(1.5rem,1.8vw,2.25rem)] font-black text-slate-950">
                  {activeMeta?.[language]}
                </h3>
                <p className="text-sm font-bold text-slate-500">
                  {text.words(activeCategoryData.total_words)} · {text.levels(activeLevels.length)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={backToCategories}
              className="inline-flex items-center justify-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-violet-700 shadow-sm transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
              {text.backToCategories}
            </button>
          </div>
          <p className="mt-2 text-base font-medium leading-7 text-slate-600">
            {text.chooseLevel}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {activeLevels.map((words, index) => {
              const isCompleted = gameProgress[activeCategory]?.includes(index);

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => openLevel(index)}
                  className="group flex min-h-[142px] flex-col items-center justify-center gap-1 rounded-2xl border border-violet-100/80 bg-white/74 p-4 text-center shadow-[inset_0_0_0_1px_rgba(221,214,254,0.45)] backdrop-blur-sm transition hover:-translate-y-1 hover:border-violet-300 hover:shadow-[0_18px_36px_rgba(124,58,237,0.16)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
                >
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-full text-xl font-black transition ${
                      isCompleted
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-violet-50 text-violet-700 group-hover:bg-violet-600 group-hover:text-white'
                    }`}
                  >
                    {isCompleted ? <Check className="h-6 w-6" aria-hidden="true" /> : index + 1}
                  </span>
                  <span className="mt-2 text-sm font-black text-slate-900">
                    {getLevelLabel(index)}
                  </span>
                  <span className="text-xs font-bold text-slate-400">
                    {text.cardCount(words.length)}
                  </span>
                  {isCompleted ? (
                    <span className="mt-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                      {text.completed}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      )}

      {view === 'cards' && currentCard && (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-black text-slate-950">
                {activeMeta?.[language]} · {getLevelLabel(activeLevel)}
              </h3>
            </div>
            <button
              type="button"
              onClick={backToLevels}
              className="inline-flex items-center justify-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-violet-700 shadow-sm transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
              {text.backToLevels}
            </button>
          </div>
          <div className="mb-4 flex items-center gap-3">
            <span dir="ltr" className="text-sm font-bold text-slate-500">
              {cardIndex + 1} / {levelWords.length}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-violet-100">
              <div
                className="h-full rounded-full bg-violet-500 transition-all"
                style={{ width: `${((cardIndex + 1) / levelWords.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="lisan-flip-card mx-auto w-full max-w-md" style={{ height: '260px' }}>
            <button
              type="button"
              onClick={() => setFlipped((current) => !current)}
              className="block h-full w-full focus:outline-none"
              aria-label={text.tapToFlip}
            >
              <div className={`lisan-flip-inner h-full w-full ${flipped ? 'is-flipped' : ''}`}>
                <div className="lisan-flip-face flex flex-col items-center justify-center gap-3 rounded-[24px] border-2 border-violet-200 bg-white p-8 text-center shadow-[0_18px_40px_rgba(124,58,237,0.12)]">
                  <span className="text-4xl font-black text-slate-900">{currentCard.hebrew}</span>
                  <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-600">
                    <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                    {text.tapToFlip}
                  </span>
                </div>
                <div className="lisan-flip-face lisan-flip-back flex flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-violet-400 bg-[linear-gradient(135deg,#F1EAFD,#E4D6FB)] p-8 text-center shadow-[0_18px_40px_rgba(124,58,237,0.2)]">
                  <span className="text-4xl font-black text-violet-800">{currentCard.arabic}</span>
                  {currentCard.transliteration ? (
                    <span className="text-base font-bold text-violet-500">
                      {currentCard.transliteration}
                    </span>
                  ) : null}
                  <span className="mt-1 text-sm font-bold text-violet-700">
                    {currentCard.hebrew}
                  </span>
                </div>
              </div>
            </button>
          </div>

          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => pronounce(currentCard.hebrew)}
              className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <Volume2 className="h-4 w-4" aria-hidden="true" />
              {text.listen}
            </button>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={prevCard}
              disabled={cardIndex === 0}
              className="inline-flex items-center gap-1 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
              {text.previous}
            </button>
            {cardIndex < levelWords.length - 1 ? (
              <button
                type="button"
                onClick={nextCard}
                className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {text.next}
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startQuiz}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {text.finishToQuiz}
              </button>
            )}
          </div>
        </>
      )}

      {view === 'quiz' && !quizDone && currentQuestion && (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-xl font-black text-slate-950">
              {text.quiz} · {activeMeta?.[language]}
            </h3>
            <button
              type="button"
              onClick={() => setView('cards')}
              className="inline-flex items-center justify-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-violet-700 shadow-sm transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
              {text.backToCards}
            </button>
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-slate-500">
              {text.score(score, questions.length)}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-black transition-all ${
                streak > 0 ? 'text-amber-700' : 'text-slate-300'
              } ${streak >= 3 ? 'bg-amber-200' : 'bg-amber-50'}`}
            >
              <Flame
                className="h-4 w-4 transition-transform"
                style={{ transform: `scale(${1 + Math.min(streak, 5) * 0.12})` }}
                aria-hidden="true"
              />
              {text.streak} {streak}
            </span>
          </div>
          <div className="mb-2 flex items-center gap-3">
            <span dir="ltr" className="text-sm font-bold text-slate-500">
              {qIndex + 1} / {questions.length}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-violet-100">
              <div
                className="h-full rounded-full bg-violet-500 transition-all"
                style={{ width: `${((qIndex + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex h-6 items-center justify-center">
            {cheer ? (
              <span
                className={`lisan-cheer text-sm font-black ${
                  cheer.tone === 'good' ? 'text-emerald-600' : 'text-red-500'
                }`}
              >
                {cheer.msg}
              </span>
            ) : null}
          </div>

          <div className="mx-auto max-w-md text-center">
            <p className="text-sm font-bold text-slate-500">{text.questionPrompt}</p>
            <p key={qIndex} className="lisan-cheer mt-1 text-4xl font-black text-slate-900">
              {currentQuestion.hebrew}
            </p>
          </div>
          <div className="mx-auto mt-6 grid max-w-md gap-3">
            {currentQuestion.options.map((option, optIdx) => {
              const isCorrect = option === currentQuestion.correct;
              const isPicked = option === selected;
              let style = 'border-violet-100 bg-white text-slate-800 hover:border-violet-300 hover:bg-violet-50';
              let anim = '';

              if (selected !== null) {
                if (isCorrect) {
                  style = 'border-emerald-400 bg-emerald-50 text-emerald-800';
                  if (isPicked) anim = 'lisan-pop';
                } else if (isPicked) {
                  style = 'border-red-300 bg-red-50 text-red-700';
                  anim = 'lisan-shake';
                } else {
                  style = 'border-slate-100 bg-white text-slate-400';
                }
              }

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => answer(option)}
                  disabled={selected !== null}
                  style={selected === null ? { animationDelay: `${optIdx * 60}ms` } : undefined}
                  className={`${selected === null ? 'lisan-optin' : ''} ${anim} flex items-center justify-between gap-2 rounded-2xl border-2 px-5 py-4 text-right text-lg font-bold transition focus:outline-none focus:ring-2 focus:ring-violet-500 ${style}`}
                >
                  <span>{option}</span>
                  {selected !== null && isCorrect ? (
                    <Check className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                  ) : null}
                  {selected !== null && isPicked && !isCorrect ? (
                    <X className="h-5 w-5 shrink-0 text-red-500" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
          {selected !== null ? (
            <div className="mx-auto mt-6 flex max-w-md justify-center">
              <button
                type="button"
                onClick={nextQuestion}
                className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {qIndex < questions.length - 1 ? text.nextQuestion : text.finish}
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </>
      )}

      {quizDone && (
        <div className="mx-auto max-w-md py-6 text-center">
          <div
            className={`lisan-trophy mx-auto flex h-20 w-20 items-center justify-center rounded-full ${
              passedQuiz ? 'bg-amber-100 text-amber-500' : 'bg-violet-100 text-violet-500'
            }`}
          >
            <Trophy className="h-10 w-10" aria-hidden="true" />
          </div>

          {passedQuiz ? (
            <div className="mt-4 flex items-center justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <Star
                  key={i}
                  className={`lisan-star h-9 w-9 ${
                    i < starCount ? 'fill-amber-400 text-amber-400' : 'fill-slate-100 text-slate-200'
                  }`}
                  style={{ animationDelay: `${i * 220}ms` }}
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : null}

          <h3 className="mt-4 text-2xl font-black text-slate-900">{resultTitle()}</h3>
          <p className="mt-2 text-lg font-bold text-slate-600">
            {text.score(score, questions.length)}
          </p>
          {passedQuiz && bestStreak >= 2 ? (
            <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-4 py-1.5 text-sm font-black text-amber-700">
              <Flame className="h-4 w-4" aria-hidden="true" />
              {text.bestStreak(bestStreak)}
            </p>
          ) : null}
          <p className="mt-3 text-sm font-bold leading-6 text-slate-500">
            {passedQuiz ? text.passedHint : text.retryHint}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={startQuiz}
              className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {text.tryAgain}
            </button>
            <button
              type="button"
              onClick={backToLevels}
              className="inline-flex items-center gap-1 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-violet-700 shadow-sm transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {text.backToLevels}
            </button>
            {passedQuiz ? (
              <button
                type="button"
                onClick={() => setGameView('completed')}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {text.completedTab}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

export default VocabGame;

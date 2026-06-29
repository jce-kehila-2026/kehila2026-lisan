import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BadgeCheck,
  Bell,
  BookOpen,
  Gem,
  Hand,
  Languages,
  LogOut,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trophy,
  Type,
  Volume2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import LisanHeader from '../components/LisanHeader.jsx';
import BottomNav from '../components/BottomNav.jsx';
import StudentHeroVisual from '../components/student/StudentHeroVisual.jsx';
import { getCurrentUser, getStoredToken, getStoredUser } from '../services/auth.js';
import {
  gameCatalog,
  getCompletedWordCount,
  getTotalLevelCount,
} from '../data/vocabGameCatalog.js';

const preferenceStorageKey = 'lisan-student-preferences';

const labels = {
  he: {
    title: 'פרופיל',
    subtitle: 'סיכום התרגול והעדפות הלמידה שלך',
    level: 'רמה',
    dailyProgress: 'התקדמות היום',
    totalChats: 'סה״כ שיחות',
    learnedWords: 'תשובות נכונות',
    streakDays: 'סה״כ ניסיונות',
    practiceMinutes: 'בדיקות הגייה',
    settings: 'הגדרות',
    language: 'שפה',
    theme: 'מצב תצוגה',
    light: 'בהיר',
    dark: 'כהה',
    textSize: 'גודל טקסט',
    regular: 'רגיל',
    large: 'גדול',
    voiceSpeed: 'מהירות קול',
    slow: 'איטי',
    normal: 'רגיל',
    notifications: 'התראות',
    myProfile: 'הפרופיל שלי',
    stepByStep: 'לומדת עברית צעד אחר צעד',
    learningJourney: 'מסע הלמידה שלי',
    nextTarget: 'היעד הבא',
    complete: 'הושלם',
    wordsGoal: 'ללמוד 100 מילים',
    wordsLeft: 'נשארו {{count}} מילים',
    totalProgress: 'התקדמות במשחק',
    grammarLevel: 'מילים שנלמדו במשחק',
    xpPoints: 'נקודות ניסיון',
    achievements: 'ההישגים שלי',
    firstLesson: 'השלמת שלב ראשון',
    firstWords: '50 מילים ראשונות',
    accuracyBadge: 'דיוק {{value}}%',
    lessonHint: 'השלימו שלב אחד במשחק',
    accuracyHint: 'התחילו לתרגל בצ׳אט',
    openCamera: 'פתיחת מצלמה',
    takePhoto: 'צילום',
    uploadImage: 'העלאת תמונה',
    cancel: 'ביטול',
    cameraFallback: 'לא ניתן לפתוח מצלמה. אפשר להעלות תמונה מהמכשיר.',
  },
  ar: {
    title: 'الملف الشخصي',
    subtitle: 'ملخص التدريب وتفضيلات التعلم',
    level: 'المستوى',
    dailyProgress: 'تقدم اليوم',
    totalChats: 'إجمالي المحادثات',
    learnedWords: 'إجابات صحيحة',
    streakDays: 'إجمالي المحاولات',
    practiceMinutes: 'فحوصات النطق',
    settings: 'الإعدادات',
    language: 'اللغة',
    theme: 'وضع العرض',
    light: 'فاتح',
    dark: 'داكن',
    textSize: 'حجم النص',
    regular: 'عادي',
    large: 'كبير',
    voiceSpeed: 'سرعة الصوت',
    slow: 'بطيئة',
    normal: 'عادية',
    notifications: 'الإشعارات',
    myProfile: 'ملفي الشخصي',
    stepByStep: 'أتعلم العبرية خطوة بعد خطوة',
    learningJourney: 'رحلة التعلم الخاصة بي',
    nextTarget: 'الهدف التالي',
    complete: 'مكتمل',
    wordsGoal: 'تعلم 100 كلمة',
    wordsLeft: 'بقيت {{count}} كلمة',
    totalProgress: 'تقدم في اللعبة',
    grammarLevel: 'كلمات تعلمتها في اللعبة',
    xpPoints: 'نقاط خبرة',
    achievements: 'إنجازاتي',
    firstLesson: 'أكملت المرحلة الأولى',
    firstWords: 'أول 50 كلمة',
    accuracyBadge: 'دقة {{value}}%',
    lessonHint: 'أكمل مرحلة واحدة في اللعبة',
    accuracyHint: 'ابدأ التدرب في المحادثة',
    openCamera: 'فتح الكاميرا',
    takePhoto: 'التقاط صورة',
    uploadImage: 'رفع صورة',
    cancel: 'إلغاء',
    cameraFallback: 'تعذر فتح الكاميرا. يمكنك رفع صورة من الجهاز.',
  },
};

const getStoredPreferences = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceStorageKey) || '{}');
    return {
      theme: saved.theme === 'dark' ? 'dark' : 'light',
      textSize: saved.textSize === 'large' ? 'large' : 'regular',
      voiceSpeed: saved.voiceSpeed === 'slow' ? 'slow' : 'normal',
      notifications: saved.notifications === false ? false : true,
    };
  } catch {
    return {
      theme: 'light',
      textSize: 'regular',
      voiceSpeed: 'normal',
      notifications: true,
    };
  }
};

function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`min-h-10 rounded-full px-4 py-2 text-sm font-bold transition ${
            value === option.value ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ProfileTopHeader() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const storedUser = getStoredUser();
  const homeTarget = storedUser?.role === 'teacher' ? '/teacher/dashboard' : '/home';
  const text = labels[isArabic ? 'ar' : 'he'];

  const sections = [
    { id: 'profile-learning-journey', label: text.learningJourney, icon: Target },
    { id: 'profile-achievements',     label: text.achievements,    icon: Trophy },
    { id: 'profile-settings',         label: text.settings,        icon: SlidersHorizontal },
  ];

  const handleSectionClick = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <LisanHeader
      sections={sections}
      onSectionClick={handleSectionClick}
      logoTarget={homeTarget}
      navLabel={isArabic ? 'تنقل الملف الشخصي' : 'ניווט פרופיל'}
    />
  );
}

function ProfilePage() {
  const { i18n, t } = useTranslation();
  const text = labels[i18n.language === 'he' ? 'he' : 'ar'];
  const storedUser = getStoredUser();
  const [user, setUser] = useState(storedUser);
  const [progress, setProgress] = useState(null);
  const [gameLearnedWords, setGameLearnedWords] = useState(0);
  const [gameCompletedLevels, setGameCompletedLevels] = useState(0);
  const [loading, setLoading] = useState(true);

  const storedPreferences = useMemo(getStoredPreferences, []);
  const theme = 'light';
  const [textSize, setTextSize] = useState(storedPreferences.textSize);
  const [voiceSpeed, setVoiceSpeed] = useState(storedPreferences.voiceSpeed);
  const [notifications, setNotifications] = useState(storedPreferences.notifications);

  const isDark = false;
  const isLargeText = textSize === 'large';

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = getStoredToken();

        if (!token) {
          setLoading(false);
          return;
        }

        const currentUser = await getCurrentUser();

        const response = await fetch('/api/progress/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const progressData = await response.json();

        if (!response.ok) {
          throw new Error(progressData.error || 'Failed to load progress');
        }

        setUser(currentUser);
        setProgress(progressData.progress);

        try {
          const gameRes = await fetch('http://localhost:3000/api/progress/game', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (gameRes.ok) {
            const gameData = await gameRes.json();
            let levels = 0;
            if (gameData?.categories) {
              for (const [categoryKey, completedLevels] of Object.entries(gameData.categories)) {
                if (!Array.isArray(completedLevels) || !gameCatalog[categoryKey]) continue;
                levels += completedLevels.length;
              }
            }
            setGameLearnedWords(getCompletedWordCount(gameData.categories, gameCatalog));
            setGameCompletedLevels(levels);
          }
        } catch {
          // ignore — gameLearnedWords stays 0
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  useEffect(() => {
    localStorage.setItem(
      preferenceStorageKey,
      JSON.stringify({
        theme,
        textSize,
        voiceSpeed,
        notifications,
      }),
    );
    window.dispatchEvent(new Event('lisan-student-preferences-changed'));
  }, [notifications, textSize, theme, voiceSpeed]);

  useEffect(() => {
    if (!window.location.hash) return undefined;

    const sectionId = window.location.hash.slice(1);
    const timeoutId = window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, []);



  const accuracy = Math.max(0, Math.min(100, Number(progress?.accuracy ?? 0)));
  const learnedWords = gameLearnedWords;
  const wordsGoal = 100;
  const wordsLeft = Math.max(0, wordsGoal - learnedWords);
  const xpPoints = Math.max(
    0,
    Number(progress?.totalAttempts ?? 0) * 10 + learnedWords * 5,
  );
  const gameProgressPct = Math.round((gameCompletedLevels / getTotalLevelCount(gameCatalog)) * 100);

  const achievementCards = [
    {
      key: 'firstLesson',
      icon: BadgeCheck,
      color: 'text-rose-500',
      bg: 'bg-rose-50',
      border: 'border-rose-100',
      done: learnedWords > 0,
    },
    {
      key: 'firstWords',
      icon: Gem,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
      border: 'border-amber-100',
      done: learnedWords >= 50,
    },
    {
      key: 'accuracyBadge',
      icon: ShieldCheck,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      border: 'border-violet-100',
      done: accuracy >= 85,
      labelValue: accuracy,
    },
  ];

  const pageClass = isDark
    ? 'min-h-screen bg-slate-950 text-slate-100'
    : 'min-h-screen bg-[radial-gradient(circle_at_12%_8%,rgba(221,214,254,0.54),transparent_30%),linear-gradient(180deg,#FBF8FF_0%,#FFF8FC_48%,#F4EEFF_100%)] text-slate-900';

  const surfaceClass = isDark ? 'bg-slate-900 text-slate-100 shadow-card' : 'bg-white text-slate-900 shadow-card';
  const panelClass = isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-slate-50';
  const glassSectionClass = isDark
    ? 'border-slate-700/80 bg-slate-900/78 shadow-card backdrop-blur-xl'
    : 'border-white/85 bg-[linear-gradient(135deg,rgba(255,255,255,0.72)_0%,rgba(246,241,255,0.76)_48%,rgba(236,226,255,0.7)_100%)] shadow-[0_24px_70px_rgba(124,58,237,0.14)] backdrop-blur-xl';
  const glassPanelClass = isDark
    ? panelClass
    : 'border-white/70 bg-white/46 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5),0_14px_34px_rgba(124,58,237,0.09)] backdrop-blur-lg';
  const mutedTextClass = isDark ? 'text-slate-300' : 'text-slate-600';
  const headingTextClass = isDark ? 'text-white' : 'text-slate-950';

  const textScaleClass = isLargeText
    ? '[&_button]:!text-base [&_input]:!text-base [&_p]:!text-base [&_span]:!text-base [&_textarea]:!text-base'
    : '';

  return (
    <main className={pageClass}>
      <div className={`app-page-container relative pb-32 ${textScaleClass}`} dir="rtl">
        <ProfileTopHeader />

        <section
          id="profile-learning-journey"
          className="relative mt-14 min-h-[520px] overflow-hidden rounded-[28px] border border-white/90 bg-cover bg-center shadow-[0_28px_80px_rgba(124,58,237,0.14)] sm:mt-16 lg:aspect-[22/5.8] lg:min-h-0"
          style={{
            backgroundImage: 'url("/images/profile-hero-clean-16x9.png")',
          }}
        >
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.4)_54%,rgba(255,255,255,0.1)_100%)]" />
          <div className="relative flex min-h-[520px] flex-col px-5 py-8 sm:px-7 lg:h-full lg:min-h-0 lg:px-10 lg:py-8" dir="rtl">
            <div className="relative flex items-start justify-center pt-6 text-center lg:pt-8">
              <div>
                <h1 className="text-4xl font-black leading-none text-indigo-950 sm:text-5xl lg:text-6xl">
                  שלום, {user?.name || 'Student1'}
                </h1>
                <p className="mt-6 flex items-center justify-center gap-4 text-2xl font-black text-slate-500 lg:text-3xl">
                  ברוך שובך! בוא נמשיך ללמוד ולהצליח
                  <Sparkles className="h-8 w-8 text-violet-500 lg:h-9 lg:w-9" aria-hidden="true" />
                </p>
              </div>
              <span className="absolute right-[9%] top-6 hidden h-24 w-24 place-items-center rounded-full border border-white/80 bg-white/50 text-violet-500 shadow-[0_18px_42px_rgba(124,58,237,0.14)] backdrop-blur-md lg:grid">
                <Hand className="h-14 w-14" aria-hidden="true" />
              </span>
            </div>

            <div className="mx-auto mt-8 grid w-[94%] grid-cols-1 overflow-hidden rounded-[24px] border-2 border-white/90 bg-white/58 text-center shadow-[0_18px_44px_rgba(91,33,182,0.11)] backdrop-blur-md sm:grid-cols-4 lg:mt-8 lg:h-[145px]">
              <div className="flex items-center justify-center p-4 sm:border-r sm:border-violet-100/80 lg:p-3">
                <div
                  className="grid h-24 w-24 shrink-0 place-items-center rounded-full lg:h-28 lg:w-28"
                  style={{ background: `conic-gradient(#7c3aed ${gameProgressPct * 3.6}deg, rgba(221,214,254,0.82) 0deg)` }}
                >
                  <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-white text-center shadow-[inset_0_8px_24px_rgba(124,58,237,0.06),0_12px_28px_rgba(124,58,237,0.11)] lg:h-20 lg:w-20">
                    <div>
                      <p className="text-3xl font-black text-violet-700 lg:text-4xl">{gameProgressPct}%</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center border-y border-violet-100/80 p-4 sm:border-y-0 sm:border-r lg:p-3" dir="rtl">
                <div className="flex items-center justify-center gap-4">
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-white bg-white/70 text-violet-700 shadow-[0_12px_28px_rgba(124,58,237,0.12)] lg:h-20 lg:w-20">
                    <Target className="h-9 w-9 lg:h-10 lg:w-10" aria-hidden="true" />
                  </span>
                  <div className="text-right">
                    <h3 className="text-xl font-black text-violet-700 lg:text-2xl">{text.nextTarget}</h3>
                    <p className="mt-2 text-lg font-black text-slate-500 lg:text-xl">
                      {text.wordsLeft.replace('{{count}}', wordsLeft)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center border-b border-violet-100/80 p-4 sm:border-b-0 sm:border-r lg:p-3" dir="rtl">
                <div className="flex items-center justify-center gap-4">
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-white bg-white/70 text-violet-700 shadow-[0_12px_28px_rgba(124,58,237,0.12)] lg:h-20 lg:w-20">
                    <BookOpen className="h-9 w-9 lg:h-10 lg:w-10" aria-hidden="true" />
                  </span>
                  <div className="text-right">
                    <p className="text-lg font-black text-violet-700 lg:text-xl">{text.grammarLevel}</p>
                    <p className="mt-1 text-3xl font-black text-slate-700 lg:text-4xl">
                      {xpPoints} / 1000
                    </p>
                    <p className="mt-0.5 text-base font-black text-slate-500 lg:text-lg">{text.xpPoints}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center p-4 lg:p-3" dir="rtl">
                <div className="flex w-full items-center justify-center gap-5">
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-violet-100/80 text-4xl font-black leading-none text-violet-700 shadow-[0_12px_28px_rgba(124,58,237,0.12)] lg:h-20 lg:w-20 lg:text-5xl">
                    {user?.level || 'A1'}
                  </span>
                  <div className="min-w-0 flex-1 text-right">
                    <h2 className="text-xl font-black text-slate-950 lg:text-2xl">
                      {text.learningJourney}
                    </h2>
                    <div className="mt-4 h-4 overflow-hidden rounded-full border border-white/80 bg-slate-200/55 shadow-inner">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#7c3aed,#6d28d9)] shadow-[0_8px_18px_rgba(124,58,237,0.3)]"
                        style={{ width: `${Math.max(8, gameProgressPct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="profile-achievements" className={`scroll-mt-8 mt-5 rounded-[28px] border p-6 sm:p-7 lg:min-h-[190px] ${glassSectionClass}`}>
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <Trophy className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className={`text-3xl font-black ${headingTextClass}`}>{text.achievements}</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {achievementCards.map((achievement) => {
              const Icon = achievement.icon;
              const label = achievement.key === 'accuracyBadge'
                ? text.accuracyBadge.replace('{{value}}', achievement.labelValue)
                : text[achievement.key];

              return (
                <article
                  key={achievement.key}
                  className={`w-full rounded-[22px] border p-6 text-center shadow-[0_16px_38px_rgba(124,58,237,0.1)] backdrop-blur-lg ${achievement.bg} ${achievement.border}`}
                >
                  <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/80 ${achievement.color}`}>
                    <Icon className="h-9 w-9" aria-hidden="true" />
                  </span>
                  <h3 className={`mt-4 text-2xl font-black ${headingTextClass}`}>{label}</h3>
                  <p className={`mt-2 text-lg font-bold ${mutedTextClass}`}>
                    {achievement.done
                      ? text.complete
                      : achievement.key === 'firstWords'
                        ? text.wordsLeft.replace('{{count}}', Math.max(0, 50 - learnedWords))
                        : achievement.key === 'firstLesson'
                          ? text.lessonHint
                          : text.accuracyHint}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="profile-settings" className={`scroll-mt-8 mt-5 rounded-[28px] border p-6 sm:p-7 ${glassSectionClass}`}>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <SlidersHorizontal className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className={`text-3xl font-black ${headingTextClass}`}>{text.settings}</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className={`flex min-h-[104px] flex-wrap items-center justify-between gap-4 rounded-[22px] border p-4 ${glassPanelClass}`}>
              <div className={`flex items-center gap-3 text-2xl font-black ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                <Languages className="h-6 w-6 text-violet-700" aria-hidden="true" />
                <div>
                  <p>{text.language}</p>
                  <p className={`mt-1 text-lg font-bold ${mutedTextClass}`}>{text.stepByStep}</p>
                </div>
              </div>
              <SegmentedControl
                value={i18n.language === 'he' ? 'he' : 'ar'}
                onChange={(value) => i18n.changeLanguage(value)}
                options={[
                  { value: 'ar', label: t('languageArabic') },
                  { value: 'he', label: t('languageHebrew') },
                ]}
              />
            </div>

            <div className={`flex min-h-[104px] flex-wrap items-center justify-between gap-4 rounded-[22px] border p-4 ${glassPanelClass}`}>
              <div className={`flex items-center gap-3 text-2xl font-black ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                <Bell className="h-6 w-6 text-violet-700" aria-hidden="true" />
                <span>{text.notifications}</span>
              </div>
              <button
                type="button"
                onClick={() => setNotifications((current) => !current)}
                className={`relative h-8 w-14 rounded-full transition ${
                  notifications ? 'bg-violet-600' : 'bg-slate-300'
                }`}
                aria-label={text.notifications}
              >
                <span
                  className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition ${
                    notifications ? 'right-7' : 'right-1'
                  }`}
                />
              </button>
            </div>

            <div className={`flex min-h-[104px] flex-wrap items-center justify-between gap-4 rounded-[22px] border p-4 ${glassPanelClass}`}>
              <div className={`flex items-center gap-3 text-2xl font-black ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                <Type className="h-6 w-6 text-violet-700" aria-hidden="true" />
                <span>{text.textSize}</span>
              </div>
              <SegmentedControl
                value={textSize}
                onChange={setTextSize}
                options={[
                  { value: 'regular', label: text.regular },
                  { value: 'large', label: text.large },
                ]}
              />
            </div>

            <div className={`flex min-h-[104px] flex-wrap items-center justify-between gap-4 rounded-[22px] border p-4 ${glassPanelClass}`}>
              <div className={`flex items-center gap-3 text-2xl font-black ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                <Volume2 className="h-6 w-6 text-violet-700" aria-hidden="true" />
                <span>{text.voiceSpeed}</span>
              </div>
              <SegmentedControl
                value={voiceSpeed}
                onChange={setVoiceSpeed}
                options={[
                  { value: 'slow', label: text.slow },
                  { value: 'normal', label: text.normal },
                ]}
              />
            </div>
          </div>
        </section>

        <BottomNav />
      </div>
    </main>
  );
}

export default ProfilePage;

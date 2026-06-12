import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  BadgeCheck,
  Bell,
  Camera,
  Gem,
  Languages,
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
import BottomNav from '../components/BottomNav.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { getCurrentUser, getStoredToken, getStoredUser } from '../services/auth.js';

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
    totalProgress: 'התקדמות כוללת',
    grammarLevel: 'רמת הנוכחית',
    xpPoints: 'נקודות ניסיון',
    achievements: 'ההישגים שלי',
    firstLesson: 'שיעור ראשון',
    firstStory: 'סיפור ראשון',
    firstWords: '50 מילים ראשונות',
    reachedLevel: 'הגעת לרמה A1',
    accuracyBadge: 'דיוק {{value}}%',
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
    totalProgress: 'التقدم الكلي',
    grammarLevel: 'المستوى الحالي',
    xpPoints: 'نقاط خبرة',
    achievements: 'إنجازاتي',
    firstLesson: 'الدرس الأول',
    firstStory: 'القصة الأولى',
    firstWords: 'أول 50 كلمة',
    reachedLevel: 'وصلت إلى مستوى A1',
    accuracyBadge: 'دقة {{value}}%',
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

function ProfilePage() {
  const { i18n, t } = useTranslation();
  const text = labels[i18n.language === 'he' ? 'he' : 'ar'];
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const storedUser = getStoredUser();
  const [user, setUser] = useState(storedUser);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileImage, setProfileImage] = useState(() => localStorage.getItem('lisan-profile-image') || '');

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

        const response = await fetch('http://localhost:3000/api/progress/me', {
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

  const openCamera = () => {
    setCameraMenuOpen(true);
  };

  const closeCameraMenu = () => {
    setCameraMenuOpen(false);
  };

  const openFilePicker = () => {
    closeCameraMenu();
    fileInputRef.current?.click();
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraStream]);

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream]);

  const startCamera = async () => {
    closeCameraMenu();

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(text.cameraFallback);
      openFilePicker();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });

      setCameraError('');
      setCameraStream(stream);
      setCameraActive(true);
    } catch (error) {
      console.error('Camera start failed:', error);
      setCameraError(text.cameraFallback);
      openFilePicker();
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) {
      return;
    }

    const videoElement = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || 640;
    canvas.height = videoElement.videoHeight || 480;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return;
    }

    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL('image/png');
    saveProfileImage(imageData);
    stopCamera();
  };

  const saveProfileImage = (imageData) => {
    setProfileImage(imageData);
    localStorage.setItem('lisan-profile-image', imageData);
  };

  const uploadProfileImage = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        saveProfileImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const accuracy = Math.max(0, Math.min(100, Number(progress?.accuracy ?? 35)));
  const learnedWords = Number(progress?.correctMeaningCount ?? 35);
  const wordsGoal = 100;
  const wordsLeft = Math.max(0, wordsGoal - learnedWords);
  const xpPoints = Math.max(
    0,
    Number(progress?.totalAttempts ?? 0) * 10 + learnedWords * 5,
  );

  const achievementCards = [
    {
      key: 'firstLesson',
      icon: BadgeCheck,
      color: 'text-rose-500',
      bg: 'bg-rose-50',
      border: 'border-rose-100',
      done: true,
    },
    {
      key: 'firstStory',
      icon: Rocket,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      border: 'border-violet-100',
      done: true,
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
      key: 'reachedLevel',
      icon: Award,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
      done: true,
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
  const mutedTextClass = isDark ? 'text-slate-300' : 'text-slate-600';
  const headingTextClass = isDark ? 'text-white' : 'text-slate-950';

  const textScaleClass = isLargeText
    ? '[&_button]:!text-base [&_input]:!text-base [&_p]:!text-base [&_span]:!text-base [&_textarea]:!text-base'
    : '';

  return (
    <main className={pageClass}>
      <div className={`app-page-container relative ${textScaleClass}`} dir="rtl">
        <div className="lisan-enter profile-page-header" style={{ '--lisan-enter-delay': '0ms' }}>
          <PageHeader showLogout />
        </div>

        <section className={`relative mt-6 overflow-hidden rounded-[28px] border border-white/80 lg:min-h-[240px] ${surfaceClass}`}>
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.96)_0%,rgba(248,245,255,0.92)_42%,rgba(237,233,254,0.82)_100%)]" />
          <div className="pointer-events-none absolute bottom-0 right-0 hidden h-full w-[34%] lg:block" aria-hidden="true">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_58%_54%,rgba(196,181,253,0.34)_0%,rgba(245,243,255,0.18)_46%,transparent_76%)]" />
            <img
              src="/images/profile-hebrew-learning.png"
              alt="Hebrew learning study illustration with Hebrew letters, notebook and educational books"
              className="absolute bottom-[-18px] right-[-18px] h-[122%] w-[112%] object-contain object-right opacity-95 mix-blend-multiply drop-shadow-[0_22px_36px_rgba(124,58,237,0.16)] [mask-image:radial-gradient(ellipse_at_center,#000_0%,#000_64%,rgba(0,0,0,0.76)_82%,transparent_100%)]"
            />
            <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-l from-transparent to-white/90" />
          </div>
          <div className="relative grid min-h-[260px] gap-6 p-6 sm:p-8 lg:grid-cols-[280px_minmax(320px,1fr)_34%]" dir="ltr">
            <div className="order-3 flex flex-col items-center justify-center lg:order-1">
              <div className="relative flex h-44 w-44 items-center justify-center overflow-hidden rounded-full bg-[radial-gradient(circle,#f8f5ff_0%,#ede9fe_68%,#ffffff_100%)] shadow-[inset_0_0_0_6px_rgba(255,255,255,0.88),0_20px_48px_rgba(124,58,237,0.12)] sm:h-52 sm:w-52 lg:h-56 lg:w-56">
                {profileImage ? (
                  <img src={profileImage} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-9xl font-black text-violet-500 sm:text-[7rem]">א</span>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={uploadProfileImage}
              />
              <div className="mt-4 flex justify-center" dir="rtl">
                <button
                  type="button"
                  onClick={openCamera}
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-violet-600 px-5 text-sm font-black text-white shadow-button transition hover:-translate-y-0.5 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
                  aria-label={text.openCamera}
                >
                  <Camera className="h-5 w-5" aria-hidden="true" />
                  {text.openCamera}
                </button>
              </div>

              {cameraMenuOpen ? (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6"
                  role="dialog"
                  aria-modal="true"
                  onClick={closeCameraMenu}
                >
                  <div
                    className="w-full max-w-sm rounded-[28px] border border-white/80 bg-white p-5 shadow-card"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <p className="text-right text-base font-black text-slate-900">
                      {text.openCamera}
                    </p>
                    <div className="mt-4 grid gap-3">
                      <button
                        type="button"
                        onClick={startCamera}
                        className="inline-flex h-12 items-center justify-center rounded-full bg-violet-600 px-4 text-sm font-black text-white shadow-button transition hover:-translate-y-0.5 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
                      >
                        {text.takePhoto}
                      </button>
                      <button
                        type="button"
                        onClick={openFilePicker}
                        className="inline-flex h-12 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
                      >
                        {text.uploadImage}
                      </button>
                      <button
                        type="button"
                        onClick={closeCameraMenu}
                        className="inline-flex h-12 items-center justify-center rounded-full bg-slate-100 px-4 text-sm font-black text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
                      >
                        {text.cancel}
                      </button>
                    </div>
                    {cameraError ? (
                      <p className="mt-4 text-sm text-red-600">{cameraError}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {cameraActive && cameraStream ? (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6"
                  role="dialog"
                  aria-modal="true"
                  onClick={stopCamera}
                >
                  <div
                    className="w-full max-w-2xl overflow-hidden rounded-[28px] bg-slate-950 p-4 shadow-card"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <video
                      ref={videoRef}
                      className="h-[320px] w-full rounded-3xl bg-black object-cover"
                      autoPlay
                      muted
                      playsInline
                    />
                    <div className="mt-4 flex flex-wrap justify-end gap-3">
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="inline-flex h-12 items-center justify-center rounded-full bg-violet-600 px-5 text-sm font-black text-white shadow-button transition hover:-translate-y-0.5 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
                      >
                        {text.takePhoto}
                      </button>
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="inline-flex h-12 items-center justify-center rounded-full bg-slate-100 px-5 text-sm font-black text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
                      >
                        {text.cancel}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="order-2 flex min-w-0 flex-col justify-center text-right lg:order-2" dir="rtl">
              <h2 className={`text-3xl font-black leading-tight sm:text-4xl ${headingTextClass}`}>
                {user?.name || 'Lisan Student'}
              </h2>
              <p className={`mt-3 flex items-center gap-2 text-base font-bold ${mutedTextClass}`}>
                {loading ? 'Loading...' : text.subtitle}
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </span>
              </p>
              <div className="mt-5 inline-flex w-fit items-center gap-3 rounded-full border border-violet-100 bg-white/80 px-5 py-2 text-sm font-black text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.08)]">
                <span>{text.level}</span>
                <span className="text-lg">{user?.level || 'A1'}</span>
              </div>
            </div>

            <div className="order-1 flex min-h-[190px] items-center justify-center lg:order-3 lg:opacity-0" aria-hidden="true">
              <div className="relative h-full min-h-[190px] w-full overflow-hidden lg:hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_58%_52%,rgba(196,181,253,0.28)_0%,rgba(245,243,255,0.2)_48%,transparent_78%)]" />
                <img
                  src="/images/profile-hebrew-learning.png"
                  alt="Hebrew learning study illustration with Hebrew letters, notebook and educational books"
                  className="relative z-10 h-full max-h-[280px] w-full object-contain object-center opacity-95 mix-blend-multiply [mask-image:radial-gradient(ellipse_at_center,#000_0%,#000_64%,rgba(0,0,0,0.72)_82%,transparent_100%)]"
                />
              </div>
            </div>
          </div>
        </section>


        <section className={`mt-5 rounded-[28px] border border-white/80 p-6 shadow-card sm:p-7 lg:min-h-[170px] ${surfaceClass}`}>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-[240px_minmax(0,1fr)_240px]">
            <div className="flex items-center justify-center border-violet-100 md:col-span-2 xl:col-span-1 xl:border-l">
              <div
                className="grid h-36 w-36 place-items-center rounded-full sm:h-44 sm:w-44"
                style={{
                  background: `conic-gradient(#6d28d9 ${accuracy * 3.6}deg, #f1eafd 0deg)`,
                }}
              >
                <div className="grid h-28 w-28 place-items-center rounded-full bg-white text-center shadow-inner sm:h-32 sm:w-32">
                  <div>
                    <p className="text-3xl font-black text-slate-950">{accuracy}%</p>
                    <p className="mt-1 text-xs font-black text-slate-600">{text.totalProgress}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-center text-right">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-4xl font-black text-violet-700">{user?.level || 'A1'}</p>
                <div>
                  <h2 className={`text-2xl font-black ${headingTextClass}`}>{text.learningJourney}</h2>
                  <p className={`mt-1 text-base font-bold ${mutedTextClass}`}>{text.grammarLevel}</p>
                </div>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-violet-50">
                <div className="h-full rounded-full bg-violet-600" style={{ width: `${accuracy}%` }} />
              </div>
              <p className={`mt-3 text-base font-bold ${mutedTextClass}`}>
                {xpPoints} / 1000 {text.xpPoints}
              </p>
            </div>

            <div className="flex flex-col justify-center border-violet-100 text-right md:col-span-2 xl:col-span-1 xl:border-r xl:pr-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-50 text-violet-700">
                  <Target className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <h2 className={`text-2xl font-black ${headingTextClass}`}>{text.nextTarget}</h2>
                  <p className={`mt-1 text-base font-bold ${mutedTextClass}`}>{text.wordsGoal}</p>
                </div>
              </div>
              <p className={`mt-5 text-xl font-black ${headingTextClass}`}>
                {text.wordsLeft.replace('{{count}}', wordsLeft)}
              </p>
            </div>
          </div>
        </section>

        <section className={`mt-5 rounded-[28px] border border-white/80 p-6 shadow-card sm:p-7 lg:min-h-[190px] ${surfaceClass}`}>
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <Trophy className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className={`text-3xl font-black ${headingTextClass}`}>{text.achievements}</h2>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            {achievementCards.map((achievement) => {
              const Icon = achievement.icon;
              const label = achievement.key === 'accuracyBadge'
                ? text.accuracyBadge.replace('{{value}}', achievement.labelValue)
                : text[achievement.key];

              return (
                <article
                  key={achievement.key}
                  className={`w-full max-w-[320px] flex-1 rounded-[22px] border p-5 text-center shadow-[0_12px_28px_rgba(124,58,237,0.06)] ${achievement.bg} ${achievement.border} sm:basis-[calc(50%-1rem)] lg:basis-[calc(33.333%-1rem)] xl:basis-[calc(20%-1rem)]`}
                >
                  <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/80 ${achievement.color}`}>
                    <Icon className="h-9 w-9" aria-hidden="true" />
                  </span>
                  <h3 className={`mt-3 text-base font-black ${headingTextClass}`}>{label}</h3>
                  <p className={`mt-1 text-sm font-bold ${mutedTextClass}`}>
                    {achievement.done ? text.complete : text.wordsLeft.replace('{{count}}', wordsLeft)}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <section className={`mt-5 rounded-[28px] border border-white/80 p-6 shadow-card sm:p-7 ${surfaceClass}`}>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <SlidersHorizontal className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className={`text-3xl font-black ${headingTextClass}`}>{text.settings}</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className={`flex min-h-[104px] flex-wrap items-center justify-between gap-4 rounded-[22px] border p-4 ${panelClass}`}>
              <div className={`flex items-center gap-3 text-base font-black ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                <Languages className="h-6 w-6 text-violet-700" aria-hidden="true" />
                <div>
                  <p>{text.language}</p>
                  <p className={`mt-1 text-sm font-bold ${mutedTextClass}`}>{text.stepByStep}</p>
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

            <div className={`flex min-h-[104px] flex-wrap items-center justify-between gap-4 rounded-[22px] border p-4 ${panelClass}`}>
              <div className={`flex items-center gap-3 text-base font-black ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
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

            <div className={`flex min-h-[104px] flex-wrap items-center justify-between gap-4 rounded-[22px] border p-4 ${panelClass}`}>
              <div className={`flex items-center gap-3 text-base font-black ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
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

            <div className={`flex min-h-[104px] flex-wrap items-center justify-between gap-4 rounded-[22px] border p-4 ${panelClass}`}>
              <div className={`flex items-center gap-3 text-base font-black ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
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

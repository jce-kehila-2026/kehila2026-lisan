import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Clock,
  Flame,
  Languages,
  MessageCircle,
  Moon,
  SlidersHorizontal,
  Sun,
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

  const storedUser = getStoredUser();
  const [user, setUser] = useState(storedUser);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);

  const storedPreferences = useMemo(getStoredPreferences, []);
  const [theme, setTheme] = useState(storedPreferences.theme);
  const [textSize, setTextSize] = useState(storedPreferences.textSize);
  const [voiceSpeed, setVoiceSpeed] = useState(storedPreferences.voiceSpeed);
  const [notifications, setNotifications] = useState(storedPreferences.notifications);

  const isDark = theme === 'dark';
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

  const stats = [
    {
      key: 'totalChats',
      value: progress?.totalChats ?? 0,
      icon: MessageCircle,
    },
    {
      key: 'learnedWords',
      value: progress?.correctMeaningCount ?? 0,
      icon: Languages,
    },
    {
      key: 'streakDays',
      value: progress?.totalAttempts ?? 0,
      icon: Flame,
    },
    {
      key: 'practiceMinutes',
      value: progress?.pronunciationUsage?.usedThisMonth ?? 0,
      icon: Clock,
    },
  ];

  const pageClass = isDark
    ? 'min-h-screen bg-slate-950 px-4 py-5 text-slate-100 sm:px-6 sm:py-8'
    : 'min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8';

  const surfaceClass = isDark ? 'bg-slate-900 text-slate-100 shadow-card' : 'bg-white text-slate-900 shadow-card';
  const panelClass = isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-slate-50';
  const mutedTextClass = isDark ? 'text-slate-300' : 'text-slate-600';
  const headingTextClass = isDark ? 'text-white' : 'text-slate-950';

  const textScaleClass = isLargeText
    ? '[&_button]:!text-base [&_input]:!text-base [&_p]:!text-base [&_span]:!text-base [&_textarea]:!text-base'
    : '';

  return (
    <main className={pageClass}>
      <div className={`relative mx-auto min-h-[calc(100vh-2.5rem)] max-w-xl pb-28 sm:min-h-[780px] ${textScaleClass}`} dir="rtl">
        <PageHeader showBack />

        <section className={`mt-6 rounded-3xl p-5 sm:p-6 ${surfaceClass}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-violet-700">{text.title}</p>
              <h1 className={`mt-2 text-2xl font-bold leading-tight sm:text-3xl ${headingTextClass}`}>
                {user?.name || 'Lisan Student'}
              </h1>
              <p className={`mt-3 text-sm leading-6 ${mutedTextClass}`}>
                {loading ? 'Loading...' : text.subtitle}
              </p>
            </div>

            <div className="rounded-2xl bg-violet-50 px-4 py-3 text-center">
              <p className="text-xs font-semibold text-slate-500">{text.level}</p>
              <p className="mt-1 whitespace-nowrap text-sm font-bold text-violet-700">
                {user?.level || 'A1'}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-800">{text.dailyProgress}</span>
              <span className="text-sm font-bold text-violet-700">
                {progress?.accuracy ?? 0}%
              </span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-violet-600"
                style={{ width: `${progress?.accuracy ?? 0}%` }}
              />
            </div>
          </div>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-3">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <article key={stat.key} className={`rounded-3xl p-4 ${surfaceClass}`}>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-pink-400 to-amber-300 text-white">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className={`mt-4 text-2xl font-bold ${headingTextClass}`}>{stat.value}</p>
                <p className={`mt-1 text-xs font-semibold leading-5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {text[stat.key]}
                </p>
              </article>
            );
          })}
        </section>

        <section className={`mt-5 rounded-3xl p-5 sm:p-6 ${surfaceClass}`}>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <SlidersHorizontal className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{text.settings}</h2>
          </div>

          <div className="mt-5 grid gap-5">
            <div className={`rounded-2xl border p-4 ${panelClass}`}>
              <div className={`mb-3 flex items-center gap-2 text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                <Languages className="h-5 w-5 text-violet-700" aria-hidden="true" />
                {text.language}
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

            <div className={`rounded-2xl border p-4 ${panelClass}`}>
              <div className={`mb-3 flex items-center gap-2 text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                {isDark ? <Moon className="h-5 w-5 text-violet-700" /> : <Sun className="h-5 w-5 text-violet-700" />}
                {text.theme}
              </div>
              <SegmentedControl
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'light', label: text.light },
                  { value: 'dark', label: text.dark },
                ]}
              />
            </div>

            <div className={`rounded-2xl border p-4 ${panelClass}`}>
              <div className={`mb-3 flex items-center gap-2 text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                <Type className="h-5 w-5 text-violet-700" aria-hidden="true" />
                {text.textSize}
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

            <div className={`rounded-2xl border p-4 ${panelClass}`}>
              <div className={`mb-3 flex items-center gap-2 text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                <Volume2 className="h-5 w-5 text-violet-700" aria-hidden="true" />
                {text.voiceSpeed}
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

            <div className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${panelClass}`}>
              <div className={`flex items-center gap-2 text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                <Bell className="h-5 w-5 text-violet-700" aria-hidden="true" />
                {text.notifications}
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
          </div>
        </section>

        <BottomNav />
      </div>
    </main>
  );
}

export default ProfilePage;

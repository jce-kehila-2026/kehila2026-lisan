import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Gamepad2,
  Headphones,
  Link as LinkIcon,
  MessageCircle,
  PenLine,
  Quote,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import BottomNav from '../components/BottomNav.jsx';
import FeatureCard from '../components/FeatureCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StoryCarousel from '../components/StoryCarousel.jsx';
import { getStoredToken, getStoredUser } from '../services/auth.js';

const API_BASE_URL = 'http://localhost:3000/api';

const stories = [
  { id: 'daily-word', titleKey: 'storyDailyWord', icon: Quote },
  { id: 'letters', titleKey: 'storyLetters', icon: BookOpen },
  { id: 'listening', titleKey: 'storyListening', icon: Headphones },
  { id: 'speaking', titleKey: 'storySpeaking', icon: MessageCircle },
  { id: 'quiz', titleKey: 'storyQuiz', icon: PenLine },
  { id: 'culture', titleKey: 'storyCulture', icon: Sparkles },
];

function normalizeProgress(value) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(number)));
}

function Home() {
  const { t } = useTranslation();
  const storedUser = getStoredUser();

  const [student, setStudent] = useState({
    name: '',
    level: '',
    progress: 0,
    learnedWords: 0,
    chatsCount: 0,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStudentData = async () => {
      try {
        const token = getStoredToken();

        if (!token) {
          setLoading(false);
          return;
        }

        const headers = {
          Authorization: `Bearer ${token}`,
        };

        const [
          profileResult,
          progressResult,
          chatsResult,
          sharedChatsResult,
        ] = await Promise.allSettled([
          fetch(`${API_BASE_URL}/users/me`, { headers }),
          fetch(`${API_BASE_URL}/progress/me`, { headers }),
          fetch(`${API_BASE_URL}/chats/my`, { headers }),
          fetch(`${API_BASE_URL}/shared-chats/my`, { headers }),
        ]);

        let nextStudent = {
          name: storedUser?.name || storedUser?.email || 'תלמידה',
          level: storedUser?.level || '',
          progress: 0,
          learnedWords: 0,
          chatsCount: 0,
        };

        if (profileResult.status === 'fulfilled') {
          const profileData = await profileResult.value.json();

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
          const progressData = await progressResult.value.json();

          if (progressResult.value.ok) {
            const progress = progressData.progress || progressData;

            nextStudent = {
              ...nextStudent,
              progress: normalizeProgress(
                progress.accuracy ||
                progress.progress ||
                progress.percentage ||
                progress.percent ||
                0,
              ),
              learnedWords: Number(
                progress.learnedWords ||
                progress.words ||
                0,
              ),
            };
          }
        }

        let realChatsCount = 0;

        if (chatsResult.status === 'fulfilled') {
          const chatsData = await chatsResult.value.json();

          if (
            chatsResult.value.ok &&
            Array.isArray(chatsData.chats)
          ) {
            realChatsCount += chatsData.chats.filter((chat) => {
              return (
                Array.isArray(chat.messages) &&
                chat.messages.length > 0
              );
            }).length;
          }
        }

        if (sharedChatsResult.status === 'fulfilled') {
          const sharedChatsData =
            await sharedChatsResult.value.json();

          if (
            sharedChatsResult.value.ok &&
            Array.isArray(sharedChatsData.chats)
          ) {
            realChatsCount += sharedChatsData.chats.filter((chat) => {
              return (
                chat.lastMessage &&
                String(chat.lastMessage).trim() !== ''
              );
            }).length;
          }
        }

        nextStudent = {
          ...nextStudent,
          chatsCount: realChatsCount,
        };

        setStudent(nextStudent);
      } catch (error) {
        console.error('Failed to load home data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStudentData();
  }, [storedUser?.email, storedUser?.level, storedUser?.name]);;

  const progressWidth = useMemo(() => {
    return `${normalizeProgress(student.progress)}%`;
  }, [student.progress]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-3 py-4 text-slate-900 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8">
      <div
        className="relative mx-auto min-h-[calc(100vh-2rem)] w-full max-w-6xl pb-32 sm:min-h-[780px]"
        dir="rtl"
      >
        <PageHeader showLogout />

        <section className="mt-6 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-violet-700">
                {loading
                  ? 'טוען נתונים...'
                  : t('welcome', {
                    name: student.name || 'תלמידה',
                  })}
              </p>

              <h1 className="mt-2 text-2xl font-bold leading-tight text-slate-950 sm:text-3xl">
                {t('homeGreeting')}
              </h1>

              <p className="mt-3 text-sm leading-6 text-slate-600">
                {t('homeIntro')}
              </p>
            </div>

            <div className="rounded-2xl bg-violet-50 px-4 py-3 text-center">
              <p className="text-xs font-semibold text-slate-500">
                {t('level')}
              </p>

              <p className="mt-1 whitespace-nowrap text-sm font-bold text-violet-700">
                {loading ? '...' : student.level || ''}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:max-w-4xl">
            <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
              <p className="text-xs font-semibold text-slate-500">
                מילים שנלמדו
              </p>

              <p className="mt-1 text-2xl font-black text-slate-950">
                {student.learnedWords}
              </p>
            </div>

            <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
              <p className="text-xs font-semibold text-slate-500">
                שיחות
              </p>

              <p className="mt-1 text-2xl font-black text-slate-950">
                {student.chatsCount}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-800">
                {t('dailyProgress')}
              </span>

              <span className="text-sm font-bold text-violet-700">
                {student.progress}%
              </span>
            </div>

            <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-violet-600"
                style={{ width: progressWidth }}
              />
            </div>
          </div>
        </section>

        <div className="mt-5">
          <StoryCarousel stories={stories} />
        </div>

        <section className="mt-5 grid gap-4 lg:grid-cols-3">
          <FeatureCard
            to="/games"
            icon={Gamepad2}
            titleKey="gamesTitle"
            descriptionKey="gamesDescription"
            actionKey="openGames"
          />

          <Link
            to="/shared-chat"
            className="group block rounded-3xl border border-slate-100 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:p-6"
            aria-label="שיחה עם חברות"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">
                <MessageCircle className="h-8 w-8" aria-hidden="true" />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-slate-900">
                  שיחה עם חברות
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  בחרי חברות לתרגול משותף ומהיר
                </p>
              </div>

              <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-50 text-violet-700 sm:flex">
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </div>
            </div>
          </Link>

          <FeatureCard
            to="/links"
            icon={LinkIcon}
            titleKey="linksTitle"
            descriptionKey="linksDescription"
            actionKey="openLinks"
          />
        </section>

        <BottomNav />
      </div>
    </main>
  );
}

export default Home;

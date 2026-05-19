import {
  BookOpen,
  Gamepad2,
  Headphones,
  Link as LinkIcon,
  MessageCircle,
  PenLine,
  Quote,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BottomNav from '../components/BottomNav.jsx';
import FeatureCard from '../components/FeatureCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StoryCarousel from '../components/StoryCarousel.jsx';

const student = {
  name: 'ليان',
  level: 'Beginner',
  progress: 45,
};

const stories = [
  { id: 'daily-word', titleKey: 'storyDailyWord', icon: Quote },
  { id: 'letters', titleKey: 'storyLetters', icon: BookOpen },
  { id: 'listening', titleKey: 'storyListening', icon: Headphones },
  { id: 'speaking', titleKey: 'storySpeaking', icon: MessageCircle },
  { id: 'quiz', titleKey: 'storyQuiz', icon: PenLine },
  { id: 'culture', titleKey: 'storyCulture', icon: Sparkles },
];

function Home() {
  const { t } = useTranslation();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="relative mx-auto min-h-[calc(100vh-2.5rem)] max-w-xl pb-28 sm:min-h-[780px]">
        <PageHeader showLogout />

        <section className="mt-6 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-violet-700">{t('welcome', { name: student.name })}</p>
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

          <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-800">{t('dailyProgress')}</span>
              <span className="text-sm font-bold text-violet-700">{student.progress}%</span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-violet-600" style={{ width: `${student.progress}%` }} />
            </div>
          </div>
        </section>

        <div className="mt-5">
          <StoryCarousel stories={stories} />
        </div>

        <section className="mt-5 grid gap-4">
          <FeatureCard
            to="/games"
            icon={Gamepad2}
            titleKey="gamesTitle"
            descriptionKey="gamesDescription"
            actionKey="openGames"
          />
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

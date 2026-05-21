import React from 'react';
import { Gamepad2, Link as LinkIcon, MessageCircle, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PageHeader from '../../../components/src/components/PageHeader.jsx';
import { getStoredUser } from '../../services/auth.js';
import ActionCard from './components/ActionCard.jsx';
import HomeHeader from './components/HomeHeader.jsx';

function TeacherHome() {
  const { t } = useTranslation();
  const user = getStoredUser();

  const cards = [
    {
      icon: MessageCircle,
      title: t('teacherDialogTitle'),
      description: t('teacherDialogDesc'),
      primaryAction: t('teacherAddFiles'),
      secondaryAction: t('teacherTryDialog'),
      primaryTo: '/teacher/dialog/upload',
      secondaryTo: '/chatbot',
    },
    {
      icon: Sparkles,
      title: t('teacherStoriesTitle'),
      description: t('teacherStoriesDesc'),
      primaryAction: t('teacherAddFiles'),
      secondaryAction: t('teacherViewAsStudent'),
      primaryTo: '/teacher/stories/upload',
      secondaryTo: '/story/daily-word',
    },
    {
      icon: Gamepad2,
      title: t('teacherGamesTitle'),
      description: t('teacherGamesDesc'),
      primaryAction: t('teacherAddFiles'),
      secondaryAction: t('teacherTryGames'),
      primaryTo: '/teacher/games/upload',
      secondaryTo: '/games',
    },
    {
      icon: LinkIcon,
      title: t('teacherLinksTitle'),
      description: t('teacherLinksDesc'),
      primaryAction: t('teacherAddLinks'),
      secondaryAction: t('teacherViewAsStudent'),
      primaryTo: '/teacher/links/upload',
      secondaryTo: '/links',
    },
  ];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="relative mx-auto min-h-[calc(100vh-2.5rem)] max-w-5xl pb-10">
        <PageHeader showLogout />
        <HomeHeader
          t={t}
          welcomeKey="teacherHomeWelcome"
          welcomeName={user?.name || t('teacherNameFallback')}
          titleKey="teacherHomeTitle"
          introKey="teacherHomeIntro"
        />

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <ActionCard key={card.title} {...card} />
          ))}
        </section>
      </div>
    </main>
  );
}

export default TeacherHome;

import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BottomNav from '../components/BottomNav.jsx';
import Button from '../components/Button.jsx';
import PageHeader from '../components/PageHeader.jsx';

const storyTitles = {
  'daily-word': 'storyDailyWord',
  letters: 'storyLetters',
  listening: 'storyListening',
  speaking: 'storySpeaking',
  quiz: 'storyQuiz',
  culture: 'storyCulture',
};

function PlaceholderPage({ titleKey = 'comingSoon', type }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const { t } = useTranslation();

  const resolvedTitleKey = useMemo(() => {
    if (type === 'story') {
      return storyTitles[id] || 'story';
    }
    return titleKey;
  }, [id, titleKey, type]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="relative mx-auto min-h-[calc(100vh-2.5rem)] max-w-xl pb-28 sm:min-h-[720px]">
        <PageHeader />
        <section className="mt-8 rounded-3xl bg-white p-7 text-center shadow-card sm:p-10">
          <p className="text-sm font-bold text-violet-700">{t(resolvedTitleKey)}</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-950">{t('comingSoon')}</h1>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-slate-600">{t('comingSoonText')}</p>
          <Button onClick={() => navigate('/home')} className="mt-8 w-full sm:w-auto">
            {t('backHome')}
          </Button>
        </section>
        <BottomNav />
      </div>
    </main>
  );
}

export default PlaceholderPage;

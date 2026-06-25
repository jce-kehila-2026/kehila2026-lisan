import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BottomNav from '../components/BottomNav.jsx';
import Button from '../components/Button.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StudentHeroVisual from '../components/student/StudentHeroVisual.jsx';
import { getStudentStoryById, getStudentStoryTitle } from '../data/studentStories.jsx';

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
  const { t, i18n } = useTranslation();

  const visualType = type === 'story' ? 'story' : titleKey === 'links' ? 'links' : 'resources';

  const resolvedTitle = useMemo(() => {
    if (type === 'story') {
      const story = getStudentStoryById(id);

      if (story) {
        return getStudentStoryTitle(story, i18n.language);
      }

      return t(storyTitles[id] || 'story');
    }

    return t(titleKey);
  }, [i18n.language, id, titleKey, t, type]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_100%)] px-3 py-4 text-slate-900 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8">
      <div className="relative mx-auto min-h-[calc(100vh-2rem)] w-full max-w-[1480px] pb-32 sm:min-h-[720px]">
        <PageHeader />
        <section className="mt-8 overflow-hidden rounded-3xl border border-white/80 bg-[linear-gradient(135deg,#FFFFFF_0%,#F7F0FF_48%,#FFF5FB_100%)] text-center shadow-card">
          <div className="grid min-h-[170px] lg:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)]" dir="ltr">
            <div className="min-h-[150px] lg:min-h-[170px]">
              <StudentHeroVisual type={visualType} />
            </div>

            <div className="flex flex-col items-center justify-center px-7 py-7 text-center sm:px-10 sm:py-10" dir="rtl">
              <p className="text-sm font-bold text-violet-700">{resolvedTitle}</p>
              <h1 className="mt-3 text-3xl font-bold text-slate-950">{t('comingSoon')}</h1>
              <p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-slate-600">{t('comingSoonText')}</p>
              <Button onClick={() => navigate('/home')} className="mt-8 w-full sm:w-auto">
                {t('backHome')}
              </Button>
            </div>
          </div>
        </section>
        <BottomNav />
      </div>
    </main>
  );
}

export default PlaceholderPage;

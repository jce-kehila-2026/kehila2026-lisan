import { useTranslation } from 'react-i18next';
import { Gamepad2 } from 'lucide-react';

import BottomNav from '../components/BottomNav.jsx';
import PageHeader from '../components/PageHeader.jsx';
import VocabGame from '../components/VocabGame.jsx';
import StudentHeroVisual from '../components/student/StudentHeroVisual.jsx';

const pageText = {
  ar: {
    title: 'الألعاب',
    description:
      'لعبة كلمات واحدة بتصنيفات مختلفة. افتحي التصنيف، راجعي الكروت، ثم اجتازي الاختبار لحفظ الكلمات المكتملة.',
  },
  he: {
    title: 'משחקים',
    description:
      'משחק מילים אחד עם קטגוריות שונות. פתחי קטגוריה, עברי על הכרטיסים ואז השלימי בוחן כדי לשמור מילים שהושלמו.',
  },
};

function GamesPage() {
  const { i18n } = useTranslation();
  const text = pageText[i18n.language === 'he' ? 'he' : 'ar'];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="relative mx-auto min-h-[calc(100vh-2.5rem)] w-full max-w-[1480px] pb-32 sm:min-h-[780px]">
        <PageHeader />

        <section className="mt-12 overflow-hidden rounded-[28px] border border-white/80 bg-[linear-gradient(135deg,#FFFFFF_0%,#F7F0FF_48%,#FFF5FB_100%)] shadow-card sm:mt-14 lg:mt-16">
          <div className="grid min-h-[170px] lg:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)]" dir="ltr">
            <div className="min-h-[150px] lg:min-h-[170px]">
              <StudentHeroVisual type="games" />
            </div>

            <div className="flex items-center px-5 py-5 text-right sm:px-6 lg:px-8" dir="rtl">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 shadow-[0_10px_26px_rgba(124,58,237,0.12)]">
                  <Gamepad2 className="h-7 w-7" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">{text.title}</h1>
                  <p className="mt-1 text-sm font-bold leading-6 text-slate-600 sm:text-base sm:leading-7">
                    {text.description}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <VocabGame />

        <BottomNav />
      </div>
    </main>
  );
}

export default GamesPage;

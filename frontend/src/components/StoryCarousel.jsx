import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import StoryCircle from './StoryCircle.jsx';

function StoryCarousel({ stories }) {
  const { t } = useTranslation();
  const scrollerRef = useRef(null);

  const scrollByStories = (direction) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: direction * -260, behavior: 'smooth' });
  };

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-card sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">{t('storiesTitle')}</h2>
        <div className="hidden items-center gap-2 sm:flex">
          <button
            type="button"
            onClick={() => scrollByStories(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-violet-50 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label={t('previousStories')}
            title={t('previousStories')}
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => scrollByStories(1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-violet-50 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label={t('nextStories')}
            title={t('nextStories')}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        dir="rtl"
      >
        {stories.map((story) => (
          <div key={story.id} className="snap-start">
            <StoryCircle story={story} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default StoryCarousel;

import React from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import StoryCircle from './StoryCircle.jsx';

function StoryCarousel({ actionsSlot, stories }) {
  const { t } = useTranslation();
  const scrollerRef = useRef(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;

    const intervalId = window.setInterval(() => {
      const nextLeft = scroller.scrollLeft - 104;
      const isAtEnd = Math.abs(scroller.scrollLeft) + scroller.clientWidth >= scroller.scrollWidth - 8;

      scroller.scrollTo({
        left: isAtEnd ? 0 : nextLeft,
        behavior: 'smooth',
      });
    }, 3600);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-card sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">{t('storiesTitle')}</h2>
        {actionsSlot}
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

import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function ScenarioCircle({ scenario }) {
  const { t } = useTranslation();
  const Icon = scenario.icon;

  return (
    <Link
      to={`/chatbot?scenario=${scenario.id}`}
      className="group flex w-[88px] shrink-0 flex-col items-center gap-2 text-center focus:outline-none"
      aria-label={t(scenario.titleKey)}
    >
      <span className="rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-400 to-amber-300 p-[3px] shadow-sm transition group-hover:scale-105 group-focus:ring-2 group-focus:ring-violet-500 group-focus:ring-offset-2">
        <span className="flex h-[64px] w-[64px] items-center justify-center rounded-full border-[3px] border-white bg-violet-50 text-violet-700 transition group-hover:bg-violet-100">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
      </span>
      <span className="line-clamp-2 min-h-9 text-[11px] font-semibold leading-[18px] text-slate-700">
        {t(scenario.titleKey)}
      </span>
    </Link>
  );
}

function ConversationScenarioBar({ scenarios }) {
  const { t } = useTranslation();
  const scrollerRef = useRef(null);

  const scrollBy = (direction) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: direction * -240, behavior: 'smooth' });
  };

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-card sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">{t('conversationScenariosTitle')}</h2>
        <div className="hidden items-center gap-2 sm:flex">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-violet-50 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label={t('previousScenarios')}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-violet-50 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label={t('nextScenarios')}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        dir="rtl"
      >
        {scenarios.map((scenario) => (
          <div key={scenario.id} className="snap-start">
            <ScenarioCircle scenario={scenario} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default ConversationScenarioBar;

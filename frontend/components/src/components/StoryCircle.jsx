import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function StoryCircle({ story }) {
  const { t } = useTranslation();
  const Icon = story.icon;

  return (
    <Link
      to={`/scenario/${story.id}`}
      className="group flex w-24 shrink-0 flex-col items-center gap-2 text-center focus:outline-none"
      aria-label={`${t('openStory')}: ${t(story.titleKey)}`}
    >
      <span className="rounded-full bg-gradient-to-br from-violet-500 via-pink-400 to-amber-300 p-[3px] shadow-sm transition group-hover:scale-105 group-focus:ring-2 group-focus:ring-violet-500 group-focus:ring-offset-2">
        <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full border-4 border-white bg-violet-50 text-violet-700">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </span>
      </span>
      <span className="line-clamp-2 min-h-10 text-xs font-semibold leading-5 text-slate-700">
        {t(story.titleKey)}
      </span>
    </Link>
  );
}

export default StoryCircle;

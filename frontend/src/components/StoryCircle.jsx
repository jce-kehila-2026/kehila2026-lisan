import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getStudentStorySubtitle, getStudentStoryTitle } from '../data/studentStories.jsx';

function StoryCircle({ story }) {
  const { t, i18n } = useTranslation();
  const Icon = story.icon;
  const title = getStudentStoryTitle(story, i18n.language) || t(story.titleKey);
  const subtitle = getStudentStorySubtitle(story, i18n.language);

  return (
    <Link
      to={`/scenario/${story.id}`}
      className="group flex w-[238px] shrink-0 items-center gap-3 rounded-[22px] border border-violet-100/80 bg-white/75 p-3 text-right shadow-[0_10px_24px_rgba(109,40,217,0.08)] transition hover:-translate-y-1 hover:bg-white hover:shadow-[0_16px_30px_rgba(109,40,217,0.16)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
      aria-label={`${t('openStory')}: ${title}`}
      dir="rtl"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700 shadow-[inset_0_0_0_1px_rgba(221,214,254,0.9)] transition group-hover:bg-violet-600 group-hover:text-white">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>

      <span className="min-w-0">
        <span className="block truncate text-sm font-black leading-5 text-slate-900">
          {title}
        </span>
        {subtitle ? (
          <span className="mt-1 line-clamp-2 block text-xs font-bold leading-5 text-slate-500">
            {subtitle}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export default StoryCircle;

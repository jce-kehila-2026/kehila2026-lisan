import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  BookOpenCheck,
  LineChart,
  MessageSquareText,
  PieChart,
  Sparkles,
} from 'lucide-react';

import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx';
import {
  featureUsage,
  getTopLevel,
  levelAnalytics,
  weeklyActivity,
} from '../../data/adminAnalyticsMock.js';

function metricMax(metric) {
  return Math.max(...levelAnalytics.map((item) => item[metric]));
}

function LevelBarChart({ metric, title, icon: Icon }) {
  const maxValue = metricMax(metric);

  return (
    <article className="rounded-[28px] border border-white/80 bg-white/82 p-5 shadow-[0_20px_54px_rgba(109,40,217,0.12)] backdrop-blur">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-[#160A52]">{title}</h2>
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>

      <div className="grid gap-4">
        {levelAnalytics.map((item) => (
          <div key={`${metric}-${item.level}`}>
            <div className="mb-1.5 flex items-center justify-between text-sm font-black text-slate-700">
              <span>{item.level}</span>
              <span>{item[metric]}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-violet-50 shadow-[inset_0_0_0_1px_rgba(221,214,254,0.75)]">
              <span
                className="block h-full rounded-full bg-gradient-to-l from-violet-600 via-fuchsia-400 to-pink-300"
                style={{ width: `${Math.max(8, (item[metric] / maxValue) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function WeeklyActivityChart() {
  const { t } = useTranslation();
  const maxValue = Math.max(...weeklyActivity.map((item) => item.value));

  return (
    <article className="rounded-[28px] border border-white/80 bg-white/82 p-5 shadow-[0_20px_54px_rgba(109,40,217,0.12)] backdrop-blur lg:col-span-2">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-[#160A52]">{t('admin.statistics.weeklyActivity')}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {t('admin.statistics.weeklyActivityDesc')}
          </p>
        </div>
        <LineChart className="h-6 w-6 text-violet-700" aria-hidden="true" />
      </div>

      <div className="flex h-56 items-end justify-between gap-3 rounded-[24px] bg-violet-50/65 px-4 py-4">
        {weeklyActivity.map((day) => (
          <div key={day.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className="text-xs font-black text-violet-800">{day.value}</span>
            <span
              className="w-full rounded-t-[1rem] bg-gradient-to-t from-violet-700 via-violet-500 to-fuchsia-300 shadow-[0_10px_22px_rgba(124,58,237,0.18)]"
              style={{ height: `${Math.max(14, (day.value / maxValue) * 100)}%` }}
            />
            <span className="text-sm font-black text-slate-600">{day.day}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function FeatureUsageChart() {
  const { t } = useTranslation();
  const maxValue = Math.max(...featureUsage.map((item) => item.value));
  const total = featureUsage.reduce((sum, item) => sum + item.value, 0);

  return (
    <article className="rounded-[28px] border border-white/80 bg-white/82 p-5 shadow-[0_20px_54px_rgba(109,40,217,0.12)] backdrop-blur">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-[#160A52]">{t('admin.statistics.featureUsage')}</h2>
        <Sparkles className="h-6 w-6 text-violet-700" aria-hidden="true" />
      </div>

      <div className="grid gap-4">
        {featureUsage.map((feature) => (
          <div key={feature.name}>
            <div className="mb-1.5 flex items-center justify-between text-sm font-black text-slate-700">
              <span>{feature.name}</span>
              <span>{Math.round((feature.value / total) * 100)}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-violet-50">
              <span
                className={`block h-full rounded-full ${feature.color}`}
                style={{ width: `${Math.max(8, (feature.value / maxValue) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function InsightCard({ label, value, description, icon: Icon }) {
  return (
    <article className="rounded-[24px] border border-violet-100/80 bg-white/78 p-4 shadow-[0_14px_36px_rgba(109,40,217,0.1)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-violet-700">{label}</p>
          <h2 className="mt-2 text-3xl font-black text-[#160A52]">{value}</h2>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{description}</p>
    </article>
  );
}

function Statistics() {
  const { t } = useTranslation();
  const activeLevel = getTopLevel('entries');
  const storiesLevel = getTopLevel('stories');
  const chatLevel = getTopLevel('chat');

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_12%_8%,rgba(221,214,254,0.54),transparent_30%),linear-gradient(180deg,#FBF8FF_0%,#FFF8FC_48%,#F4EEFF_100%)] px-3 py-3 text-slate-900 md:px-6 md:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-7xl pb-12" dir="rtl">
        <AdminPageHeader icon={BarChart3} label={t('admin.statistics.header')} />

        <section className="mt-3 overflow-hidden rounded-[24px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.86)_0%,rgba(245,240,255,0.84)_48%,rgba(255,241,248,0.82)_100%)] p-4 shadow-[0_26px_70px_rgba(91,33,182,0.14)] backdrop-blur md:mt-6 md:rounded-[30px] md:p-7">
          <p className="inline-flex items-center gap-2 rounded-full bg-violet-100/80 px-3 py-1 text-xs font-black text-violet-700">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            {t('admin.statistics.badge')}
          </p>
          <h1 className="mt-2 text-[clamp(1.65rem,7vw,2.1rem)] font-black leading-tight text-slate-950 md:mt-3 md:text-[clamp(2.3rem,4.6vw,4.6rem)]">
            {t('admin.statistics.title')}
          </h1>
          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-600 md:mt-3 md:text-base md:leading-7">
            {t('admin.statistics.subtitle')}
          </p>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-3">
          <InsightCard
            icon={PieChart}
            label={t('admin.statistics.mostActiveLevel')}
            value={activeLevel.level}
            description={`${activeLevel.entries}${t('admin.statistics.entriesThisWeekSuffix')}`}
          />
          <InsightCard
            icon={BookOpenCheck}
            label={t('admin.statistics.topStoriesUsage')}
            value={storiesLevel.level}
            description={`${storiesLevel.stories}${t('admin.statistics.storiesActionsSuffix')}`}
          />
          <InsightCard
            icon={MessageSquareText}
            label={t('admin.statistics.topChatUsage')}
            value={chatLevel.level}
            description={`${chatLevel.chat}${t('admin.statistics.chatActionsSuffix')}`}
          />
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-2">
          <LevelBarChart metric="students" title={t('admin.statistics.studentsByLevel')} icon={PieChart} />
          <LevelBarChart metric="teachers" title={t('admin.statistics.teachersByLevel')} icon={PieChart} />
          <LevelBarChart metric="entries" title={t('admin.statistics.entriesByLevel')} icon={BarChart3} />
          <LevelBarChart metric="stories" title={t('admin.statistics.storiesByLevel')} icon={BookOpenCheck} />
          <LevelBarChart metric="chat" title={t('admin.statistics.chatByLevel')} icon={MessageSquareText} />
          <FeatureUsageChart />
          <WeeklyActivityChart />
        </section>
      </div>
    </main>
  );
}

export default Statistics;

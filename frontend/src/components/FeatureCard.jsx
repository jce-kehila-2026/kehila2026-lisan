import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function FeatureCard({ to, icon: Icon, titleKey, descriptionKey, actionKey }) {
  const { t } = useTranslation();

  return (
    <Link
      to={to}
      className="group block rounded-3xl border border-slate-100 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:p-6"
      aria-label={t(actionKey)}
    >
      <div className="flex items-start gap-3 sm:items-center sm:gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white min-[360px]:h-16 min-[360px]:w-16">
          <Icon className="h-7 w-7 min-[360px]:h-8 min-[360px]:w-8" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-slate-900">{t(titleKey)}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t(descriptionKey)}</p>
        </div>
        <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-50 text-violet-700 sm:flex">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </Link>
  );
}

export default FeatureCard;

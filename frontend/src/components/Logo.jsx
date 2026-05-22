import React from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function Logo() {
  const { t } = useTranslation();

  return (
    <div className="inline-flex items-center gap-3">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-button">
        <Sparkles className="h-6 w-6" aria-hidden="true" />
      </div>
      <div>
        <p className="text-2xl font-bold leading-none text-slate-900">{t('appName')}</p>
        <p className="mt-1 text-sm text-slate-500">{t('tagline')}</p>
      </div>
    </div>
  );
}

export default Logo;

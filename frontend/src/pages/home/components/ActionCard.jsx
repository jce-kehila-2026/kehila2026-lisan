import React from 'react';
import CardButton from './CardButton.jsx';

function ActionCard({ description, icon: Icon, primaryAction, primaryTo, secondaryAction, secondaryTo, title }) {
  return (
    <article className="rounded-3xl border border-slate-100 bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <CardButton to={primaryTo}>{primaryAction}</CardButton>
        <CardButton to={secondaryTo} variant="secondary">
          {secondaryAction}
        </CardButton>
      </div>
    </article>
  );
}

export default ActionCard;

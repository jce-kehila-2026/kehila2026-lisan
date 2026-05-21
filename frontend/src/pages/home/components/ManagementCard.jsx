import React from 'react';
import { ArrowLeft } from 'lucide-react';
import CardButton from './CardButton.jsx';

function ManagementCard({ actionLabel, description, icon: Icon, onAction, title, to }) {
  return (
    <article className="group rounded-3xl border border-slate-100 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg sm:p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        {actionLabel ? (
          <CardButton to={to} onClick={onAction} variant="secondary">
            <span>{actionLabel}</span>
            <ArrowLeft className="ms-2 h-4 w-4" aria-hidden="true" />
          </CardButton>
        ) : null}
      </div>
    </article>
  );
}

export default ManagementCard;

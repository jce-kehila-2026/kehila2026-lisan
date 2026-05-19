import React from 'react';

function HomeHeader({ children, introKey, titleKey, t, welcomeKey, welcomeName }) {
  return (
    <section className="mt-6 rounded-3xl bg-white p-5 shadow-card sm:p-6">
      <div>
        <p className="text-sm font-semibold text-violet-700">{t(welcomeKey, { name: welcomeName })}</p>
        <h1 className="mt-2 text-2xl font-bold leading-tight text-slate-950 sm:text-3xl">{t(titleKey)}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{t(introKey)}</p>
      </div>
      {children}
    </section>
  );
}

export default HomeHeader;

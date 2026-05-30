import React from 'react';
import { useTranslation } from 'react-i18next';
import LisanLogo from './LisanLogo.jsx';

function LoginShell({ children, title }) {
  const { t } = useTranslation();

  return (
    <main className="login-screen">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-panel__inner">
          <LisanLogo />
          <h1 id="login-title" className="sr-only">
            {title}
          </h1>
          {children}
        </div>
      </section>
    </main>
  );
}

export default LoginShell;

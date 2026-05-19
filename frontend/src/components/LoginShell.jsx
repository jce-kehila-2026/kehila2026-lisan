import React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LisanLogo from './LisanLogo.jsx';

function LoginShell({ children, title }) {
  const { t } = useTranslation();
  const [showFallbackArt, setShowFallbackArt] = useState(false);
  const artworkSrc = '/login-welcome-he.png';

  return (
    <main className="login-screen">
      <section className="login-art" aria-label={t('loginWelcome')}>
        {!showFallbackArt ? (
          <img
            className="login-art__image"
            src={artworkSrc}
            alt={t('loginWelcome')}
            onError={(event) => {
              setShowFallbackArt(true);
            }}
          />
        ) : null}
        <div className={`login-art__frame ${!showFallbackArt ? 'login-art__frame--hidden' : ''}`}>
          <div className="login-art__moon" />
          <p className="login-art__script">Welcome</p>
          <p className="login-art__arabic">{t('loginHeroLine')}</p>
          <h1>LISAN</h1>
          <p className="login-art__subtitle">{t('loginHeroSubtitle')}</p>
        </div>
      </section>

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

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import LanguageSwitcher from '../../components/LanguageSwitcher.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import { getStoredUser, logout } from '../../services/auth.js';

const features = [
  { icon: 'P', title: 'practiceSpeaking', text: 'practiceSpeakingText' },
  { icon: 'C', title: 'learnViaChat', text: 'learnViaChatText' },
  { icon: '%', title: 'myProgress', text: 'myProgressText' },
];

function StudentHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <main className="app-page">
      <header className="page-header">
        <LanguageSwitcher />
        <Button type="button" variant="secondary" onClick={handleLogout}>
          {t('logout')}
        </Button>
      </header>

      <section className="page-title">
        <p>{t('studentWelcome', { name: user?.name || 'ليان' })}</p>
        <h1>{t('studentHomeTitle')}</h1>
        <span>{t('studentHomeIntro')}</span>
      </section>

      <section className="feature-grid">
        {features.map((feature) => {
          return (
            <Card key={feature.title} className="feature-card">
              <span className="feature-card__icon">
                {feature.icon}
              </span>
              <h2>{t(feature.title)}</h2>
              <p>{t(feature.text)}</p>
            </Card>
          );
        })}
      </section>
    </main>
  );
}

export default StudentHome;

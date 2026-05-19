import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import LanguageSwitcher from '../../components/LanguageSwitcher.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import { getStoredUser, logout } from '../../services/auth.js';

const stats = [
  { icon: '#', label: 'totalStudents' },
  { icon: 'L', label: 'activeLessons' },
  { icon: 'R', label: 'pendingReports' },
];

function AdminDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => {
    logout();
    navigate('/admin/login', { replace: true });
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
        <p>{t('adminWelcome', { name: user?.name || 'ليان' })}</p>
        <h1>{t('adminDashboardTitle')}</h1>
        <span>{t('adminDashboardIntro')}</span>
      </section>

      <section className="feature-grid">
        {stats.map((stat) => {
          return (
            <Card key={stat.label} className="stat-card">
              <span className="feature-card__icon">
                {stat.icon}
              </span>
              <h2>{t(stat.label)}</h2>
              <p>{t('emptyStat')}</p>
            </Card>
          );
        })}
      </section>
    </main>
  );
}

export default AdminDashboard;

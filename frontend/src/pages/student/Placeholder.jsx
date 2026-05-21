import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';

function StudentPlaceholder({ titleKey }) {
  const { t } = useTranslation();

  return (
    <main className="app-page">
      <Card className="placeholder-page">
        <p>{t(titleKey)}</p>
        <h1>{t('emptyStat')}</h1>
        <Link to="/home">
          <Button type="button">{t('backHome')}</Button>
        </Link>
      </Card>
    </main>
  );
}

export default StudentPlaceholder;

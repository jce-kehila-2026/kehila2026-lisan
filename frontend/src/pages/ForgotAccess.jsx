import React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';
import LoginShell from '../components/LoginShell.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import { storeSession } from '../services/auth.js';

function ForgotAccess() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const sendCode = (event) => {
    event.preventDefault();

    if (!email.trim()) {
      setError(t('recoveryEmailRequired'));
      return;
    }

    setSent(true);
    setError('');
  };

  const enterHome = (event) => {
    event.preventDefault();

    if (!sent) {
      setError(t('sendCodeFirst'));
      return;
    }

    if (!code.trim()) {
      setError(t('recoveryCodeRequired'));
      return;
    }

    storeSession({
      token: 'mock-recovery-token',
      user: { id: 'student_recovery', name: email, role: 'student' },
    });
    navigate('/home', { replace: true });
  };

  return (
    <LoginShell title={t('forgotAccessTitle')}>
      <form className="login-form" onSubmit={sent ? enterHome : sendCode} noValidate>
        <div className="recovery-copy">
          <h2>{t('forgotAccessTitle')}</h2>
          <p>{t('forgotAccessIntro')}</p>
        </div>

        <Input
          id="recovery-email"
          label={t('email')}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        {sent ? (
          <Input
            id="recovery-code"
            label={t('verificationCode')}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        ) : null}

        {sent ? <p className="success-message">{t('codeSentMessage', { email })}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        {!sent ? (
          <Button type="submit" size="lg">
            {t('sendCode')}
          </Button>
        ) : (
          <Button type="submit" size="lg">
            {t('enterHome')}
          </Button>
        )}

        <Link className="forgot-link forgot-link--center" to="/login">
          {t('backToLogin')}
        </Link>
      </form>

      <LanguageSwitcher compact />
    </LoginShell>
  );
}

export default ForgotAccess;

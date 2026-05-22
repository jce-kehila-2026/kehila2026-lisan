import React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import LanguageSwitcher from '../../components/LanguageSwitcher.jsx';
import LoginShell from '../../components/LoginShell.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import useLoginForm from '../../hooks/useLoginForm.js';
import { getLandingPathForRole, login, storeSession } from '../../services/auth.js';

function StudentLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const form = useLoginForm();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    form.setTouched({ email: true, password: true });

    if (!form.isValid) {
      return;
    }

    setLoading(true);
    setServerError('');

    try {
      const session = await login(form.values);
      storeSession(session);
      navigate(getLandingPathForRole(session.user?.role), { replace: true });
    } catch (error) {
      setServerError(t(error.message || 'genericLoginError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginShell title={t('loginTitle')}>
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <Input
          id="student-email"
          label={t('username')}
          type="text"
          autoComplete="username"
          value={form.values.email}
          onChange={form.setValue('email')}
          onBlur={form.markTouched('email')}
          error={form.touched.email ? form.errors.email : ''}
        />
        <Input
          id="student-password"
          label={t('password')}
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          value={form.values.password}
          onChange={form.setValue('password')}
          onBlur={form.markTouched('password')}
          error={form.touched.password ? form.errors.password : ''}
          rightSlot={
            <button
              type="button"
              className="icon-button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          }
        />

        <p className="login-helper">{t('contactTeacher')}</p>
        <Link className="forgot-link" to="/forgot-access">
          {t('forgotAccess')}
        </Link>
        {serverError ? <p className="form-error">{serverError}</p> : null}

        <Button type="submit" size="lg" loading={loading} disabled={!form.isValid || loading}>
          {loading ? t('loading') : t('loginButton')}
        </Button>
      </form>

      <LanguageSwitcher compact />
    </LoginShell>
  );
}

export default StudentLogin;

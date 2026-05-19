import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';
import Logo from '../components/Logo.jsx';

function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      navigate('/home');
    }, 500);
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_100%)] px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-xl flex-col justify-center">
        <div className="mb-6 flex justify-end">
          <LanguageToggle />
        </div>

        <section className="rounded-3xl bg-white p-6 shadow-card sm:p-8">
          <Logo />
          <div className="mt-9">
            <p className="text-sm font-bold text-violet-700">{t('loginWelcome')}</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight text-slate-950">{t('startLearning')}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">{t('loginIntro')}</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <Input
              id="email"
              label={t('email')}
              type="text"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('email')}
            />
            <Input
              id="password"
              label={t('password')}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('password')}
            />
            <Button type="submit" loading={loading} className="w-full">
              {loading ? t('loading') : t('loginButton')}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}

export default Login;

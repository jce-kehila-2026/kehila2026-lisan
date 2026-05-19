import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageToggle from './LanguageToggle.jsx';
import Logo from './Logo.jsx';

function PageHeader({ showLogout = false }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <header className="flex items-center justify-between gap-4">
      <Logo />
      <div className="flex items-center gap-3">
        <LanguageToggle />
        {showLogout ? (
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            aria-label={t('logout')}
            title={t('logout')}
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </header>
  );
}

export default PageHeader;

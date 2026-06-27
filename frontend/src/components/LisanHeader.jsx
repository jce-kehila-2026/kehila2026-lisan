/**
 * LisanHeader — Unified floating header for all app pages.
 *
 * Props:
 *   sections       — Array of center nav buttons: [{ id, label, icon }]
 *   activeSection  — Currently active section id
 *   onSectionClick — Called when a section button is pressed
 *   extraLeft      — Extra elements left of language/logout (e.g. notifications, mode button)
 *   logoTarget     — Path the logo navigates to (default: '/home')
 *   onLogout       — Custom logout handler (default: navigate('/login'))
 *   navLabel       — aria-label for center nav
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import LanguageToggle from './LanguageToggle.jsx';

const RADIUS = 'rounded-[28px]';
const RADIUS_DROPDOWN = 'rounded-[22px]';

// Returns true when the header should be visible
function useScrollVisible() {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);

  useEffect(() => {
    const getScrollY = () =>
      window.scrollY ??
      document.documentElement.scrollTop ??
      document.body.scrollTop ??
      0;

    lastY.current = getScrollY();

    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const y = getScrollY();
        const delta = y - lastY.current;

        if (y <= 20) {
          setVisible(true);
        } else if (delta > 4) {
          setVisible(false);
        } else if (delta < -4) {
          setVisible(true);
        }

        lastY.current = y;
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('scroll', onScroll);
    };
  }, []);

  return visible;
}

function SectionButton({ section, isActive, onClick }) {
  const navigate = useNavigate();
  const Icon = section.icon;

  const handleClick = () => {
    if (section.to) {
      navigate(section.to);
    } else {
      onClick(section.id);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isActive}
      aria-current={isActive ? 'true' : undefined}
      className={[
        'inline-flex shrink-0 items-center gap-1.5',
        'rounded-full px-2.5 py-1.5 text-xs font-black',
        'transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2',
        'min-[800px]:gap-2 min-[800px]:px-3 min-[800px]:py-2 min-[800px]:text-sm',
        isActive
          ? 'bg-white/90 text-violet-800 shadow-[inset_0_0_0_1px_rgba(221,214,254,0.9),0_4px_16px_rgba(109,40,217,0.12)]'
          : 'text-violet-700/80 hover:bg-white/50 hover:text-violet-800',
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
      <span>{section.label}</span>
    </button>
  );
}

function LisanHeader({
  sections = [],
  activeSection = '',
  onSectionClick = () => {},
  extraLeft = null,
  logoTarget = '/home',
  onLogout = null,
  navLabel = 'ניווט',
  forceMenu = false,
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const headerVisible = useScrollVisible();

  const handleLogout = onLogout ?? (() => navigate('/login'));
  const handleSectionClick = (id) => { onSectionClick(id); setMenuOpen(false); };

  return (
    <>
      {/* Portal ensures the fixed header is always relative to the viewport,
          not to any ancestor with backdrop-filter/transform/will-change */}
      {createPortal(
        <div
          className={`fixed left-3 right-3 top-3 z-[9999] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] sm:left-4 sm:right-4 sm:top-4 ${
            headerVisible ? 'translate-y-0' : '-translate-y-[calc(100%+20px)]'
          }`}
          dir="rtl"
        >
        {/* Shell */}
        <div
          className={[
            'rounded-[26px]',
            'flex items-center justify-between gap-3',
            'overflow-hidden',
            'border border-white/55',
            'bg-[linear-gradient(135deg,rgba(250,232,255,0.78)_0%,rgba(237,233,254,0.78)_45%,rgba(255,228,240,0.72)_100%)]',
            'px-3 py-1.5 sm:px-4 sm:py-2',
            'shadow-[0_12px_30px_rgba(109,40,217,0.12),0_4px_12px_rgba(109,40,217,0.06)]',
            'backdrop-blur-xl',
          ].join(' ')}
        >
          {/* Right: logo */}
          <div className="flex shrink-0 items-center gap-2">
            {sections.length > 0 ? (
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/80 text-slate-600 shadow-[0_2px_8px_rgba(109,40,217,0.08)] transition hover:bg-violet-50 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:h-10 sm:w-10${forceMenu ? '' : ' min-[800px]:hidden'}`}
                aria-label={navLabel}
                aria-expanded={menuOpen}
              >
                {menuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => navigate(logoTarget)}
              className="shrink-0 rounded-2xl transition hover:scale-[1.04] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              aria-label="דף הבית"
            >
              <img src="/images/loggo.png" alt="Lisan" className="h-12 w-auto object-contain sm:h-14" />
            </button>
          </div>

          {/* Center: nav (desktop only) */}
          {sections.length > 0 ? (
            <nav
              className={`hidden flex-1 items-center justify-center gap-0.5${forceMenu ? '' : ' min-[800px]:flex'} min-[800px]:gap-0.5`}
              aria-label={navLabel}
            >
              {sections.map((section) => (
                <SectionButton
                  key={section.id}
                  section={section}
                  isActive={activeSection === section.id}
                  onClick={handleSectionClick}
                />
              ))}
            </nav>
          ) : (
            <div className="flex-1" aria-hidden="true" />
          )}

          {/* Left: actions */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {extraLeft}

            <LanguageToggle />

            <button
              type="button"
              onClick={handleLogout}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/80 text-slate-600 shadow-[0_2px_8px_rgba(109,40,217,0.08)] transition hover:bg-violet-50 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 sm:h-10 sm:w-10"
              aria-label={t('logout') || 'יציאה'}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>


          </div>
        </div>

        {/* Mobile dropdown — anchored inside the fixed wrapper so it stays below the bar */}
        {menuOpen && sections.length > 0 ? (
          <>
            <button
              type="button"
              aria-label="סגירת תפריט"
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 -z-10 min-[800px]:hidden"
            />
            <div
              className={[
                RADIUS_DROPDOWN,
                'absolute inset-x-0 top-[calc(100%+6px)]',
                'border border-white/70',
                'bg-white/95 backdrop-blur-xl',
                'p-2',
                'shadow-[0_12px_40px_rgba(109,40,217,0.14)]',
                ...(forceMenu ? [] : ['min-[800px]:hidden']),
              ].join(' ')}
            >
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => handleSectionClick(section.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={[
                      'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black transition',
                      isActive ? 'bg-violet-50 text-violet-800' : 'text-slate-700 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{section.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </div>,
      document.body,
      )}

      {/* Spacer — transparent, reserves space so content starts below the fixed header */}
      <div className="lisan-enter lisan-header-spacer h-10" aria-hidden="true" />
    </>
  );
}

export default LisanHeader;
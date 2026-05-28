import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Gamepad2,
  Puzzle,
  Repeat,
  Sparkles,
  Zap,
} from 'lucide-react';
import BottomNav from '../components/BottomNav.jsx';
import PageHeader from '../components/PageHeader.jsx';

const games = [
  { id: 'word-match', titleKey: 'gameWordMatch', descKey: 'gameWordMatchDesc', icon: Puzzle, color: 'violet' },
  { id: 'flashcards', titleKey: 'gameFlashcards', descKey: 'gameFlashcardsDesc', icon: Repeat, color: 'fuchsia' },
  { id: 'letter-drop', titleKey: 'gameLetterDrop', descKey: 'gameLetterDropDesc', icon: Zap, color: 'amber' },
  { id: 'fill-blank', titleKey: 'gameFillBlank', descKey: 'gameFillBlankDesc', icon: BookOpen, color: 'emerald' },
];

const colorMap = {
  violet: { bg: 'bg-violet-50', text: 'text-violet-700', hoverBg: 'group-hover:bg-violet-600' },
  fuchsia: { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', hoverBg: 'group-hover:bg-fuchsia-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', hoverBg: 'group-hover:bg-amber-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', hoverBg: 'group-hover:bg-emerald-600' },
};

function GamesPage() {
  const { t } = useTranslation();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="relative mx-auto min-h-[calc(100vh-2.5rem)] max-w-xl pb-28 sm:min-h-[780px]">
        <PageHeader />

        <section className="mt-6 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
              <Gamepad2 className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-950">{t('gamesTitle')}</h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">{t('gamesDescription')}</p>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4">
          {games.map((game) => {
            const Icon = game.icon;
            const colors = colorMap[game.color];

            return (
              <Link
                key={game.id}
                to={`/story/${game.id}`}
                className="group block rounded-3xl border border-slate-100 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              >
                <div className="flex items-center gap-4">
                  <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${colors.bg} ${colors.text} transition ${colors.hoverBg} group-hover:text-white`}>
                    <Icon className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-slate-900">{t(game.titleKey)}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{t(game.descKey)}</p>
                  </div>
                  <Sparkles className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-violet-500" aria-hidden="true" />
                </div>
              </Link>
            );
          })}
        </section>

        <BottomNav />
      </div>
    </main>
  );
}

export default GamesPage;

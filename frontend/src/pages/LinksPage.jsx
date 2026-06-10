import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  ExternalLink,
  Globe,
  Headphones,
  Link as LinkIcon,
  Video,
} from 'lucide-react';
import BottomNav from '../components/BottomNav.jsx';
import PageHeader from '../components/PageHeader.jsx';

const links = [
  {
    id: 'morfix',
    titleKey: 'linkMorfix',
    descKey: 'linkMorfixDesc',
    icon: BookOpen,
    url: 'https://www.morfix.co.il',
  },
  {
    id: 'pealim',
    titleKey: 'linkPealim',
    descKey: 'linkPealimDesc',
    icon: Globe,
    url: 'https://www.pealim.com',
  },
  {
    id: 'hebrewpod',
    titleKey: 'linkHebrewPod',
    descKey: 'linkHebrewPodDesc',
    icon: Headphones,
    url: 'https://www.hebrewpod101.com',
  },
  {
    id: 'youtube',
    titleKey: 'linkYoutube',
    descKey: 'linkYoutubeDesc',
    icon: Video,
    url: 'https://www.youtube.com/results?search_query=learn+hebrew+for+arabic+speakers',
  },
];

function LinksPage() {
  const { t } = useTranslation();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8F5FF_0%,#FFF7FB_52%,#F8F5FF_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="relative mx-auto min-h-[calc(100vh-2.5rem)] w-full max-w-[1480px] pb-32 sm:min-h-[780px]">
        <PageHeader />

        <section className="mt-6 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
              <LinkIcon className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-950">{t('linksTitle')}</h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">{t('linksDescription')}</p>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4">
          {links.map((link) => {
            const Icon = link.icon;

            return (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-3xl border border-slate-100 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">
                    <Icon className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-slate-900">{t(link.titleKey)}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{t(link.descKey)}</p>
                  </div>
                  <ExternalLink className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-violet-500" aria-hidden="true" />
                </div>
              </a>
            );
          })}
        </section>

        <BottomNav />
      </div>
    </main>
  );
}

export default LinksPage;

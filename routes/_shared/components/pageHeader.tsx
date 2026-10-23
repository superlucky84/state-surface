import { LogoMark } from './icons.js';

export type HeaderProps = {
  /** Page title: the title band's `<h1>` (see `showTitle`) and the document title. */
  title: string;
  nav: 'home' | 'guide' | 'examples';
  lang: string;
  /** Navigation in the page language (`/ko/guide/surface`). */
  links: { home: string; guide: string; examples: string };
  /** The same page in each language; the links remember the choice (DC-24 ⑤). */
  languages: Array<{ lang: string; label: string; href: string }>;
  backHref?: string;
  backLabel?: string;
  /** `false`: the page renders its own `<h1>` (home hero, examples list, guide article). */
  showTitle?: boolean;
};

const LABELS: Record<string, { home: string; guide: string; examples: string; nav: string }> = {
  en: { home: 'Home', guide: 'Guide', examples: 'Examples', nav: 'Main' },
  ko: { home: '홈', guide: '가이드', examples: '예제', nav: '주 메뉴' },
};

const navLinkClass = (active: boolean) =>
  active
    ? 'rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700'
    : 'rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900';

const langLinkClass = (active: boolean) =>
  active
    ? 'rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white'
    : 'rounded-full px-2.5 py-1 text-xs font-semibold text-slate-500 transition hover:text-slate-900';

/**
 * Sticky site bar (static slot `page:header`): mark, main navigation, language switch and
 * GitHub. On narrow screens the navigation wraps to its own row.
 */
const Header = ({ nav, lang, links, languages }: HeaderProps) => {
  const t = LABELS[lang] ?? LABELS.en;
  const current = (key: HeaderProps['nav']) => (nav === key ? { 'aria-current': 'page' } : {});
  return (
    <header class="sticky top-0 z-40 border-b border-slate-200/70 bg-white/75 backdrop-blur-lg backdrop-saturate-150">
      <div class="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5 md:px-8">
        <a
          href={links.home}
          class="flex items-center gap-2 rounded-md text-[0.9375rem] font-semibold tracking-tight text-slate-900"
        >
          <LogoMark />
          StateSurface
        </a>
        <nav
          aria-label={t.nav}
          class="order-last -mx-1 flex w-full items-center gap-1 sm:order-none sm:mx-0 sm:w-auto"
        >
          <a class={navLinkClass(nav === 'home')} href={links.home} {...current('home')}>
            {t.home}
          </a>
          <a class={navLinkClass(nav === 'guide')} href={links.guide} {...current('guide')}>
            {t.guide}
          </a>
          <a
            class={navLinkClass(nav === 'examples')}
            href={links.examples}
            {...current('examples')}
          >
            {t.examples}
          </a>
        </nav>
        <div class="ml-auto flex items-center gap-2">
          <div class="flex items-center rounded-full border border-slate-200 bg-white/80 p-0.5 shadow-xs">
            {languages.map(language => (
              // A switch is a deliberate choice: no prefetch (it would only answer 204).
              <a
                href={language.href}
                hreflang={language.lang}
                lang={language.lang}
                data-prefetch="false"
                {...(language.lang === lang ? { 'aria-current': 'true' } : {})}
                class={langLinkClass(language.lang === lang)}
              >
                {language.label}
              </a>
            ))}
          </div>
          <a
            href="https://github.com/superlucky84/state-surface"
            target="_blank"
            rel="noopener"
            class="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="GitHub"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
};

export default Header;

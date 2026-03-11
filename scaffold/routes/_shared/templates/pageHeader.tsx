import { defineTemplate, prefixPath } from 'state-surface';

type HeaderProps = {
  title: string;
  nav: string;
  lang?: string;
  backHref?: string;
  backLabel?: string;
};

const NAV_PAGES: Record<string, string> = {
  home: 'home',
  guide: 'guide',
  examples: 'examples',
};

function navLinkClass(active: boolean): string {
  if (active) {
    return 'rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white';
  }
  return 'rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900';
}

function langBtnClass(active: boolean): string {
  if (active) {
    return 'rounded px-2 py-1 text-xs font-semibold bg-slate-900 text-white';
  }
  return 'rounded px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900';
}

const Header = ({ title, nav, lang, backHref, backLabel }: HeaderProps) => {
  const currentLang = lang ?? 'en';
  const page = NAV_PAGES[nav] ?? 'home';
  const targetLang = currentLang === 'ko' ? 'en' : 'ko';

  return (
    <header class="rounded-2xl border border-slate-200 bg-white/90 px-5 py-5 shadow-sm backdrop-blur md:px-6">
      <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div class="flex items-center gap-3">
          {backHref && (
            <a
              href={backHref}
              class="text-sm text-slate-400 transition hover:text-slate-600"
              aria-label={backLabel}
            >
              &larr;
            </a>
          )}
          <h1 class="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <div class="flex items-center gap-1 rounded-md border border-slate-200 p-0.5">
            <button
              type="button"
              data-action="switch-lang"
              data-params={JSON.stringify({ lang: 'en', page })}
              class={langBtnClass(currentLang === 'en')}
            >
              EN
            </button>
            <button
              type="button"
              data-action="switch-lang"
              data-params={JSON.stringify({ lang: 'ko', page })}
              class={langBtnClass(currentLang === 'ko')}
            >
              KO
            </button>
          </div>
        </div>
        <nav class="flex flex-wrap items-center gap-2">
          <a class={navLinkClass(nav === 'home')} href={prefixPath('/')}>
            Home
          </a>
          <a class={navLinkClass(nav === 'guide')} href={prefixPath('/guide/surface')}>
            Guide
          </a>
          <a class={navLinkClass(nav === 'examples')} href={prefixPath('/examples')}>
            Examples
          </a>
          <a
            href="https://github.com/superlucky84/state-surface"
            target="_blank"
            rel="noopener"
            class="rounded-md px-2.5 py-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="GitHub"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </nav>
      </div>
    </header>
  );
};

export default defineTemplate('page:header', Header);

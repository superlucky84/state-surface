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
        </nav>
      </div>
    </header>
  );
};

export default defineTemplate('page:header', Header);

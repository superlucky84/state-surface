import { defineTemplate } from '../../../shared/templateRegistry.js';

type HeaderProps = {
  title: string;
  nav: string;
};

function navLinkClass(active: boolean): string {
  if (active) {
    return 'rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white';
  }
  return 'rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900';
}

const Header = ({ title, nav }: HeaderProps) => (
  <header class="rounded-2xl border border-slate-200 bg-white/90 px-5 py-5 shadow-sm backdrop-blur md:px-6">
    <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <h1 class="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <nav class="flex flex-wrap items-center gap-2">
        <a class={navLinkClass(nav === 'home')} href="/">
          Home
        </a>
        <a class={navLinkClass(nav === 'guide')} href="/guide/surface">
          Guide
        </a>
        <a class={navLinkClass(nav === 'streaming')} href="/features/streaming">
          Streaming
        </a>
        <a class={navLinkClass(nav === 'actions')} href="/features/actions">
          Actions
        </a>
        <a class={navLinkClass(nav === 'search')} href="/search">
          Search
        </a>
      </nav>
    </div>
  </header>
);

export default defineTemplate('page:header', Header);

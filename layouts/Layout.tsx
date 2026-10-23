import { ClientRouter, Slot } from 'state-surface';
import PageHeader, { type HeaderProps } from '../routes/_shared/components/pageHeader.js';
import SystemError from '../routes/_shared/components/systemError.js';
import { Icon, LogoMark } from '../routes/_shared/components/icons.js';

export interface LayoutProps {
  /** `page:header` props (a static slot: language links are page URLs, DC-24 ⑤). */
  header: HeaderProps;
  /** Document title; defaults to `<page title> · StateSurface`. */
  title?: string;
  /** `chat` is a full-viewport shell whose main element fills the remaining height. */
  variant?: 'page' | 'chat';
  /** Column of the title band: `narrow` for single-column pages (search, chat). */
  width?: 'wide' | 'narrow';
  children?: unknown;
}

const FOOTER: Record<string, { tagline: string; nav: string }> = {
  en: { tagline: 'Server-owned state, streamed into slots.', nav: 'Footer' },
  ko: { tagline: '서버가 소유한 상태를 슬롯으로 스트리밍합니다.', nav: '바닥글' },
};

/** Back link and `<h1>` of pages that do not render their own heading. */
const TitleBand = ({ title, backHref, backLabel, narrow }: HeaderProps & { narrow: boolean }) => (
  <div class={`mx-auto w-full px-4 pt-8 md:px-8 md:pt-12 ${narrow ? 'max-w-3xl' : 'max-w-6xl'}`}>
    {backHref && (
      <a
        href={backHref}
        class="group inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-500 transition hover:text-indigo-600"
      >
        <Icon name="arrowLeft" class="h-4 w-4 transition group-hover:-translate-x-0.5" />
        {backLabel}
      </a>
    )}
    <h1 class="mt-3 text-3xl font-bold tracking-tight break-keep text-slate-950 sm:text-4xl">
      {title}
    </h1>
  </div>
);

const Footer = ({ lang, links }: HeaderProps) => {
  const t = FOOTER[lang] ?? FOOTER.en;
  const link = 'rounded-md transition hover:text-slate-900';
  return (
    <footer class="mt-auto border-t border-slate-200/80 bg-slate-50/70">
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between md:px-8">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <LogoMark class="h-5 w-5" />
          <span class="font-semibold text-slate-700">StateSurface</span>
          <span>{t.tagline}</span>
        </p>
        <nav aria-label={t.nav} class="flex items-center gap-5">
          <a class={link} href={links.guide}>
            {lang === 'ko' ? '가이드' : 'Guide'}
          </a>
          <a class={link} href={links.examples}>
            {lang === 'ko' ? '예제' : 'Examples'}
          </a>
          <a
            class={link}
            href="https://github.com/superlucky84/state-surface"
            target="_blank"
            rel="noopener"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
};

/**
 * Shared document shell. Every page renders `page:header` and the `system:error` slot,
 * which stays empty until an error frame fills it (shown as a toast). `<ClientRouter />`
 * makes links between these pages client navigations.
 */
export default function Layout(
  { header, title, variant = 'page', width = 'wide' }: LayoutProps,
  children: unknown
) {
  const chat = variant === 'chat';
  const documentTitle =
    title ?? (header.title === 'StateSurface' ? header.title : `${header.title} · StateSurface`);
  return (
    <html lang={header.lang}>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{documentTitle}</title>
        {/* Client navigation between pages of this layout (DC-18); prefetch on hover. */}
        <ClientRouter />
      </head>
      <body
        class={
          chat
            ? 'h-dvh overflow-hidden bg-white text-slate-900 antialiased'
            : 'min-h-screen bg-white text-slate-900 antialiased'
        }
      >
        <div
          class={
            chat
              ? 'relative isolate flex h-full flex-col'
              : 'relative isolate flex min-h-screen flex-col'
          }
        >
          <div
            aria-hidden="true"
            class="site-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem]"
          />
          <Slot name="page:header" class="contents">
            <PageHeader {...header} />
          </Slot>
          {header.showTitle !== false && <TitleBand {...header} narrow={width === 'narrow'} />}
          {children}
          {!chat && <Footer {...header} />}
          <Slot
            name="system:error"
            mode="server"
            component={SystemError}
            class="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:left-auto sm:right-6 sm:bottom-6"
          />
        </div>
      </body>
    </html>
  );
}

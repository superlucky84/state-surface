import { Slot } from 'state-surface';
import PageHeader, { type HeaderProps } from '../routes/_shared/components/pageHeader.js';
import SystemError from '../routes/_shared/components/systemError.js';

export interface LayoutProps {
  /** `page:header` slot state; the switch-lang transition replaces it. */
  header: HeaderProps;
  title?: string;
  lang?: string;
  /** `chat` is a full-viewport shell whose main element fills the remaining height. */
  variant?: 'page' | 'chat';
  children?: unknown;
}

/**
 * Shared document shell. Every page renders `page:header` and the `system:error` slot,
 * which stays empty until an error frame fills it.
 */
export default function Layout(
  { header, title = 'StateSurface', lang = 'en', variant = 'page' }: LayoutProps,
  children: unknown
) {
  const chat = variant === 'chat';
  return (
    <html lang={lang}>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
      </head>
      <body
        class={
          chat
            ? 'h-screen overflow-hidden bg-slate-100 text-slate-900 antialiased'
            : 'min-h-screen bg-slate-100 text-slate-900 antialiased'
        }
      >
        <div
          class={
            chat
              ? 'mx-auto flex h-full w-full max-w-6xl flex-col px-4 pt-6 md:px-8'
              : 'mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-12 pt-6 md:px-8'
          }
        >
          <Slot name="page:header" client:load>
            <PageHeader {...header} />
          </Slot>
          {children}
          <Slot name="system:error" client:load component={SystemError} />
        </div>
      </body>
    </html>
  );
}

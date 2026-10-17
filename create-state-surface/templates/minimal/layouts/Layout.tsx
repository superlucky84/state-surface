import { ClientRouter, Slot } from 'state-surface';
import ErrorMessage from './ErrorMessage';

/**
 * The document shell. `system:error` stays empty until a transition fails; `<ClientRouter />`
 * turns links between pages into client navigations.
 */
export default function Layout(
  { title }: { title: string; children?: unknown },
  children: unknown
) {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <ClientRouter />
      </head>
      <body class="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
        <Slot name="system:error" mode="server" component={ErrorMessage} />
      </body>
    </html>
  );
}

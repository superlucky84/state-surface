# **PROJECT_NAME**

A [StateSurface](https://github.com/superlucky84/state-surface) app: the server owns the state,
the browser owns the DOM.

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm check      # build analysis + type check, no bundle
pnpm test       # Vitest
pnpm build && pnpm start
```

## Layout

| Path                              | What                                                       |
| --------------------------------- | ---------------------------------------------------------- |
| `routes/index.tsx`                | The page: static markup, a server slot and a client island |
| `routes/_components/Greeting.tsx` | Server slot template (with a CSS Module)                   |
| `routes/_components/Counter.tsx`  | Client island (`client:visible`)                           |
| `transitions/greet.ts`            | Transition behind `data-action="greet"`                    |
| `layouts/Layout.tsx`              | Document shell with the `system:error` slot and the router |
| `client/styles.css`               | Tailwind entry, linked on every page                       |
| `server.ts`                       | Server entry                                               |

The server runs on the `__ADAPTER__` adapter (`server.ts`, `vite.config.ts`). Pages are
`routes/**/*.tsx` (files and folders starting with `_` are not pages); transitions are
`transitions/**/*.ts`, named by their path. Middleware and other request handler options go in an optional
`surface.server.ts` (`export default { middleware: [...] } satisfies HandlerConfig`); `pnpm dev` and the
production server both use it.

## Error tracking, RUM and tag managers

Install Sentry, Datadog RUM, GTM and similar tools the way the vendor documents: npm SDKs in an
optional `client/entry.ts` (it runs on every page before the engine), script snippets in the
`<head>` of `layouts/Layout.tsx` (pass `nonce={ctx.nonce}` when middleware sets a nonce CSP). Engine
errors reach them through `reportError`, transitions and router page fetches carry their trace
headers, client navigations count as views, and server errors go to `onError` in
`surface.server.ts`.

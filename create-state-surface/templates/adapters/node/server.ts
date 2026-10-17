import manifest from 'virtual:state-surface/manifest';
import handler from 'virtual:state-surface/handler';
import { serve } from 'state-surface/adapters/node';

// Production server: static assets from dist/client, pages and transitions from the build.
// Middleware and other handler options live in surface.server.ts, shared with `pnpm dev`.
await serve({ ...handler, manifest });

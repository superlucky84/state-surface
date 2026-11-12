import express from 'express';
import manifest from 'virtual:state-surface/manifest';
import handler from 'virtual:state-surface/handler';
import { surface } from 'state-surface/adapters/express';

// Mount surface() before body parsers: it reads transition and form bodies itself.
// Middleware and other handler options live in surface.server.ts, shared with `pnpm dev`.
const app = express();
// Behind a TLS-terminating proxy (nginx, a load balancer) set ORIGIN to the public origin.
app.use(surface({ ...handler, manifest, origin: process.env.ORIGIN || undefined }));
app.listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`StateSurface running at http://localhost:${process.env.PORT ?? 3000}`);
});

import express from 'express';
import manifest from 'virtual:state-surface/manifest';
import handler from 'virtual:state-surface/handler';
import { surface } from 'state-surface/adapters/express';

// Mount surface() before body parsers: it reads transition and form bodies itself.
// Middleware and other handler options live in surface.server.ts, shared with `pnpm dev`.
const app = express();
app.use(surface({ ...handler, manifest }));
app.listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`StateSurface running at http://localhost:${process.env.PORT ?? 3000}`);
});

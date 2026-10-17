import express from 'express';
import manifest from 'virtual:state-surface/manifest';
import { surface } from 'state-surface/adapters/express';

// Mount surface() before body parsers: it reads transition and form bodies itself.
const app = express();
app.use(surface({ manifest }));
app.listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`StateSurface running at http://localhost:${process.env.PORT ?? 3000}`);
});

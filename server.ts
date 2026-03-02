import { createApp } from './engine/server/index.js';
import { transitionHooks } from './routes/_shared/hooks.js';

const { app, port } = await createApp({ hooks: transitionHooks });

const server = app.listen(port, () => {
  console.log(`StateSurface running at http://localhost:${port}`);
});

// Graceful shutdown
function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

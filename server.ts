import { createApp, installGracefulShutdown } from 'state-surface/server';
import { transitionHooks } from './routes/_shared/hooks.js';

const { app, port } = await createApp({ hooks: transitionHooks });
const routes = app.locals.registeredRoutePatterns as string[] | undefined;

const server = app.listen(port, () => {
  console.log(`StateSurface running at http://localhost:${port}`);
  if (routes?.length) {
    console.log(`  Routes: ${routes.join(', ')}`);
    console.log(`  Debug overlay: http://localhost:${port}/?debug=1`);
  }
});
installGracefulShutdown(server);

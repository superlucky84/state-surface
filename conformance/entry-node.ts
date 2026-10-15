import { fixture } from './fixture.js';
import { serve } from '../engine/adapters/node.js';
await serve({
  ...fixture(),
  port: Number(process.env.PORT ?? 3400),
  staticDir: 'conformance/public',
});

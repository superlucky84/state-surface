import { fixture } from './fixture.js';
import { serve } from '../engine/adapters/bun.js';
serve({
  ...fixture(),
  port: Number(process.env.PORT ?? 3400),
  env: process.env,
  staticDir: 'conformance/public',
});

import { fixture } from './fixture.js';
import { serve } from '../engine/adapters/deno.js';
declare const Deno: { env: { get(name: string): string | undefined } };
serve({
  ...fixture(),
  env: { RUNTIME: Deno.env.get('RUNTIME') },
  port: Number(Deno.env.get('PORT') ?? 3400),
  staticDir: 'conformance/public',
});

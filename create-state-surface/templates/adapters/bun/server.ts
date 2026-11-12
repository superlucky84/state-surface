import manifest from 'virtual:state-surface/manifest';
import handler from 'virtual:state-surface/handler';
import { serve } from 'state-surface/adapters/bun';

// Bun.serve with static assets from dist/client; handler options from surface.server.ts.
// Behind a TLS-terminating proxy (nginx, a load balancer) set ORIGIN to the public origin.
serve({ ...handler, manifest, env: process.env, origin: process.env.ORIGIN || undefined });

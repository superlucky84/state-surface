import manifest from 'virtual:state-surface/manifest';
import handler from 'virtual:state-surface/handler';
import { serve } from 'state-surface/adapters/deno';

// Deno.serve with static assets from dist/client; handler options from surface.server.ts.
// Behind a TLS-terminating proxy (nginx, a load balancer) set ORIGIN to the public origin.
serve({ ...handler, manifest, origin: process.env.ORIGIN || undefined });

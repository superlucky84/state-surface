import manifest from 'virtual:state-surface/manifest';
import handler from 'virtual:state-surface/handler';
import { serve } from 'state-surface/adapters/deno';

// Deno.serve with static assets from dist/client; handler options from surface.server.ts.
serve({ ...handler, manifest });

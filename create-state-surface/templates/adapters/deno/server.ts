import manifest from 'virtual:state-surface/manifest';
import { serve } from 'state-surface/adapters/deno';

// Deno.serve with static assets from dist/client.
serve({ manifest });

import manifest from 'virtual:state-surface/manifest';
import { serve } from 'state-surface/adapters/bun';

// Bun.serve with static assets from dist/client.
serve({ manifest, env: process.env });

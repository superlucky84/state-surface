import manifest from 'virtual:state-surface/manifest';
import { serve } from 'state-surface/adapters/node';

// Production server: static assets from dist/client, pages and transitions from the build.
await serve({ manifest });

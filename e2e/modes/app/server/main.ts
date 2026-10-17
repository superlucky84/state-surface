import manifest from 'virtual:state-surface/manifest';
import handler from 'virtual:state-surface/handler';
import { serve } from 'state-surface/adapters/node';

// Middleware (CSP, guard) comes from surface.server.ts, shared with the dev server.
serve({ ...handler, manifest });

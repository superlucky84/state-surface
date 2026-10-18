import manifest from 'virtual:state-surface/manifest';
import handler from 'virtual:state-surface/handler';
import { serve } from 'state-surface/adapters/node';

// Middleware (CSP, the local intake) and onError come from surface.server.ts.
serve({ ...handler, manifest });

import manifest from 'virtual:state-surface/manifest';
import handler from 'virtual:state-surface/handler';
import { serve } from 'state-surface/adapters/node';

// Handler options (middleware, onError, limits) come from surface.server.ts, shared with dev.
await serve({ ...handler, manifest });

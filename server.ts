import manifest from 'virtual:state-surface/manifest';
import { serve } from 'state-surface/adapters/node';
await serve({ manifest });

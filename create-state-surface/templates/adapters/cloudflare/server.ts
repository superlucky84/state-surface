import manifest from 'virtual:state-surface/manifest';
import handler from 'virtual:state-surface/handler';
import { worker } from 'state-surface/adapters/cloudflare';

// Cloudflare Workers: assets come from the ASSETS binding (wrangler.jsonc); handler options
// from surface.server.ts.
export default worker({ ...handler, manifest });

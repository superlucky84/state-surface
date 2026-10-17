import manifest from 'virtual:state-surface/manifest';
import { worker } from 'state-surface/adapters/cloudflare';

// Cloudflare Workers: assets come from the ASSETS binding (wrangler.jsonc).
export default worker({ manifest });

import { fixture } from './fixture.js';
import { worker } from '../engine/adapters/cloudflare.js';
export default worker(fixture());

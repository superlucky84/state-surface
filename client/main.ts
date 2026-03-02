import { createStateSurface } from '../engine/client.js';
import { prismPlugin } from './plugins/prism.js';

createStateSurface({
  plugins: [prismPlugin()],
  debug: new URLSearchParams(window.location.search).get('debug') === '1',
});

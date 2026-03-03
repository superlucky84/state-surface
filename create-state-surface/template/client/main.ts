import { createStateSurface } from 'state-surface/client';
import { prismPlugin } from './plugins/prism.js';

createStateSurface({
  plugins: [prismPlugin()],
  debug: new URLSearchParams(window.location.search).get('debug') === '1',
});

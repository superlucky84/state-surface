import { createStateSurface } from 'state-surface/client';
import { guideTocPlugin } from './plugins/guideToc.js';
import { prismPlugin } from './plugins/prism.js';

createStateSurface({
  plugins: [prismPlugin(), guideTocPlugin()],
  debug: new URLSearchParams(window.location.search).get('debug') === '1',
});

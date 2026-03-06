import { createStateSurface } from 'state-surface/client';
import { chatScrollPlugin } from './plugins/chatScroll.js';
import { guideTocPlugin } from './plugins/guideToc.js';
import { prismPlugin } from './plugins/prism.js';

createStateSurface({
  plugins: [prismPlugin(), guideTocPlugin(), chatScrollPlugin()],
  debug: new URLSearchParams(window.location.search).get('debug') === '1',
});

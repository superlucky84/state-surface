// Engine entry chunk: kept separate from start.ts so tests can import the loader without
// auto-starting it.
import { startLoader } from './start.js';

startLoader();

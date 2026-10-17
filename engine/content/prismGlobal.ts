// Prism's language components read a global `Prism`; Node sets one, workers do not.
import Prism from 'prismjs';

(globalThis as { Prism?: typeof Prism }).Prism = Prism;
export default Prism;

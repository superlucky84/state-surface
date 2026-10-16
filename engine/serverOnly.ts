/**
 * `import 'state-surface/server-only'` marks a module as server-only (DC-02). On the server
 * this module is empty; the browser build resolves the throwing variant and the Vite plugin
 * fails the client build with the import chain that pulled the module in.
 */
export {};

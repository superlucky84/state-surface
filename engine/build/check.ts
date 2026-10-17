import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { SurfaceBuildError } from './diagnostics.js';

/** Same name as `CHECKING` in the plugin (engine/vite.ts), without importing it. */
const CHECKING = 'STATE_SURFACE_CHECK';

/**
 * `state-surface check` (DESIGN 3.1 ③): plugin analysis and `tsc --noEmit`, no bundle. The
 * project's Vite config is loaded in middleware mode so aliases, conditions and the
 * `surface()` options are the ones the build uses.
 */
export interface CheckOptions {
  root?: string;
  /** Run `tsc --noEmit` (default true). */
  types?: boolean;
  /** Output (default stdout/stderr). */
  log?: (line: string) => void;
}

interface CheckApi {
  check(
    resolve: (source: string, importer: string) => Promise<string | undefined>
  ): Promise<unknown[]>;
}

export async function check(options: CheckOptions = {}): Promise<number> {
  const root = path.resolve(options.root ?? process.cwd());
  const log = options.log ?? (line => console.log(line));
  const { createServer } = await import('vite');
  const previous = process.env[CHECKING];
  process.env[CHECKING] = '1';
  const server = await createServer({
    root,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  let problems: unknown[];
  try {
    const plugin = server.config.plugins.find(item => item.name === 'state-surface');
    const api = plugin?.api as CheckApi | undefined;
    if (!api?.check) {
      log('[state-surface] No surface() plugin in the Vite config of ' + root);
      return 1;
    }
    // Page graphs are server modules: resolve like the SSR environment.
    const container = server.environments.ssr.pluginContainer;
    problems = await api.check(async (source, importer) => {
      const resolved = await container.resolveId(source, importer);
      if (!resolved || resolved.external || resolved.id.startsWith('\0')) return undefined;
      return resolved.id.split('?')[0];
    });
  } finally {
    await server.close();
    if (previous === undefined) delete process.env[CHECKING];
    else process.env[CHECKING] = previous;
  }
  // The page analysis and the module transform can report the same rule.
  problems = [...new Map(problems.map(problem => [format(problem), problem])).values()];
  for (const problem of problems) log(format(problem));
  log(
    problems.length
      ? `[state-surface] check: ${problems.length} problem${problems.length === 1 ? '' : 's'}`
      : '[state-surface] check: analysis passed'
  );
  let failed = problems.length > 0;
  if (options.types !== false) failed = (await typecheck(root, log)) || failed;
  return failed ? 1 : 0;
}

function format(problem: unknown) {
  // The plugin may come from another copy of the engine (the Vite config bundle).
  if (problem instanceof SurfaceBuildError || (problem as Error)?.name === 'SurfaceBuildError') {
    const error = problem as SurfaceBuildError;
    const message = error.message.startsWith('[state-surface]')
      ? error.message
      : `[state-surface] ${error.message}`;
    return error.frame ? `${message}\n${error.frame}\n` : `${message}\n`;
  }
  return `${problem instanceof Error ? (problem.stack ?? problem.message) : String(problem)}\n`;
}

/** `tsc --noEmit` with the project's TypeScript and tsconfig. */
async function typecheck(root: string, log: (line: string) => void): Promise<boolean> {
  let tsc: string;
  try {
    tsc = createRequire(path.join(root, 'package.json')).resolve('typescript/bin/tsc');
  } catch {
    log('[state-surface] check: install typescript to check types, or pass --no-types.');
    return true;
  }
  const code = await new Promise<number>(resolve => {
    const child = spawn(process.execPath, [tsc, '--noEmit', '-p', root], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => (output += chunk));
    child.stderr.on('data', chunk => (output += chunk));
    child.on('close', status => {
      if (output.trim()) log(output.trimEnd());
      resolve(status ?? 1);
    });
  });
  log(code === 0 ? '[state-surface] check: types passed' : '[state-surface] check: type errors');
  return code !== 0;
}

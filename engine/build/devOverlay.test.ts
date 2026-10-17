import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { surface } from '../vite.js';

/**
 * DESIGN 3.1 ②: in dev, plugin diagnostics reach the browser as Vite's error overlay with
 * the source location and code frame (builds fail with the same error).
 */
let root: string;
let server: ViteDevServer;
let origin: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'surface-overlay-'));
  await mkdir(path.join(root, 'routes'), { recursive: true });
  await writeFile(path.join(root, 'Title.tsx'), 'export default () => <h1>Title</h1>;\n');
  await writeFile(
    path.join(root, 'routes/index.tsx'),
    [
      "import { Slot } from 'state-surface';",
      "import Title from '../Title';",
      '',
      'export default function Page() {',
      '  return <html><body><Slot name="Main Title"><Title /></Slot></body></html>;',
      '}',
    ].join('\n')
  );
  server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [surface()],
    server: { port: 0, host: '127.0.0.1', hmr: false, watch: null },
  });
  await server.listen();
  const address = server.httpServer!.address() as { port: number };
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await server?.close();
  await rm(root, { recursive: true, force: true });
});

describe('dev error overlay', () => {
  it('shows the diagnostic with its location, frame and hint', async () => {
    const response = await fetch(origin + '/');
    expect(response.status).toBe(500);
    const html = await response.text();
    expect(html).toContain('ErrorOverlay');
    const payload = JSON.parse(
      html.match(/const error = (\{.*\})\n/)![1].replace(/\\u003c/g, '<')
    ) as { message: string; plugin?: string; id?: string; frame?: string; loc?: unknown };
    // The overlay titles it [plugin:state-surface]; the message keeps the location.
    expect(payload.message).toMatch(
      /^\S+\/routes\/index\.tsx:5:22: Slot name "Main Title" must match/
    );
    expect(payload.message).toContain('hint: Use lowercase letters');
    expect(payload).toMatchObject({
      plugin: 'state-surface',
      id: path.join(root, 'routes/index.tsx'),
      loc: { line: 5, column: 21 },
    });
    expect(payload.frame).toContain('>    5 |   return <html><body><Slot name="Main Title">');
  });
});

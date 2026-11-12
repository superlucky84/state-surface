import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error plain JavaScript module without declarations
import { ADAPTERS, adapterChoices, createProject } from './create.js';

/**
 * create-state-surface (DC-16): the generated files per template and adapter. Installing,
 * building and testing the generated apps runs in CI (`pnpm test:scaffold`).
 */
const source = path.resolve('.');
let dir: string;
beforeAll(() => (dir = mkdtempSync(path.join(os.tmpdir(), 'create-surface-'))));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const create = (name: string, options: Record<string, unknown> = {}) =>
  createProject({ targetDir: path.join(dir, name), source, git: false, ...options });
const read = (app: string, file: string) => readFileSync(path.join(dir, app, file), 'utf8');
const json = (app: string, file: string) => JSON.parse(read(app, file));

describe('create-state-surface', () => {
  it('writes the minimal starter: one page, a server slot, an island and a transition', () => {
    create('starter', { version: '^9.9.9' });
    for (const file of [
      '.gitignore',
      '.npmrc',
      '.prettierrc',
      '.prettierignore',
      '.env',
      '.env.example',
      'env.d.ts',
      'tsconfig.json',
      'vite.config.ts',
      'vitest.config.ts',
      'server.ts',
      'routes/index.tsx',
      'routes/_components/Greeting.tsx',
      'routes/_components/Greeting.module.css',
      'routes/_components/Counter.tsx',
      'transitions/greet.ts',
      'layouts/Layout.tsx',
      'client/styles.css',
      'tests/home.test.ts',
    ])
      expect(existsSync(path.join(dir, 'starter', file)), file).toBe(true);
    expect(existsSync(path.join(dir, 'starter', 'package.json.template'))).toBe(false);
    expect(existsSync(path.join(dir, 'starter', 'adapter.json'))).toBe(false);
    const pkg = json('starter', 'package.json');
    expect(pkg).toMatchObject({
      name: 'starter',
      dependencies: { 'state-surface': '^9.9.9', lithent: expect.any(String) },
      scripts: { check: 'state-surface check', test: 'vitest run' },
    });
    // Server-side highlighting lives in the engine now.
    expect(pkg.dependencies).not.toHaveProperty('prismjs');
    expect(read('starter', 'routes/index.tsx')).toContain(
      '<Slot name="home:greeting" mode="server">'
    );
    expect(read('starter', 'routes/index.tsx')).toContain('client:visible');
    expect(read('starter', 'routes/_components/Greeting.module.css')).toContain('@reference');
    expect(read('starter', 'README.md')).toContain('`node` adapter');
  });

  it.each(ADAPTERS.filter((name: string) => name !== 'node'))(
    'switches the server entry, vite.config.ts and package for %s',
    adapter => {
      const name = `app-${adapter}`;
      create(name, { adapter });
      expect(read(name, 'server.ts')).toContain(`state-surface/adapters/${adapter}`);
      const config = read(name, 'vite.config.ts');
      expect(config).toContain(`import { ${adapter} } from 'state-surface/adapters/${adapter}';`);
      expect(config).toContain(`surface({ adapter: ${adapter}() })`);
      const pkg = json(name, 'package.json');
      if (adapter === 'express') expect(pkg.dependencies.express).toBeDefined();
      if (adapter === 'bun') expect(pkg.scripts.start).toContain('bun dist/server.js');
      if (adapter === 'deno') expect(pkg.scripts.start).toContain('deno run');
      if (adapter === 'cloudflare') {
        expect(pkg.scripts.deploy).toContain('wrangler deploy');
        expect(read(name, 'wrangler.jsonc')).toContain(`"name": "${name}"`);
        expect(read(name, 'wrangler.jsonc')).toContain('"run_worker_first": true');
      }
    }
  );

  it('builds the demo from the repository showcase without its repository tests', () => {
    create('showcase', { template: 'demo', adapter: 'node' });
    for (const file of [
      'routes/[lang]/index.tsx',
      'content/config.ts',
      'shared/pages.ts',
      'transitions/search.ts',
      'tests/demo.test.ts',
    ])
      expect(existsSync(path.join(dir, 'showcase', file)), file).toBe(true);
    expect(existsSync(path.join(dir, 'showcase', 'client/plugins/guideToc.test.ts'))).toBe(false);
    expect(existsSync(path.join(dir, 'showcase', 'testing'))).toBe(false);
    expect(read('showcase', 'client/styles.css')).not.toContain('../engine/');
    expect(read('showcase', 'vite.config.ts')).toContain('i18n: { locales: [...LOCALES]');
    expect(read('showcase', '.prettierignore')).toContain('content/**/*.md');
  });

  it('lists the adapter prompt with Node first and rejects bad input', () => {
    expect(adapterChoices(source).map((choice: { name: string }) => choice.name)).toEqual(ADAPTERS);
    expect(() => create('x', { template: 'blog' })).toThrow('Unknown template "blog"');
    expect(() => create('y', { adapter: 'lambda' })).toThrow('Unknown adapter "lambda"');
    expect(() => create('bad name')).toThrow('Project name');
    expect(() => create('starter')).toThrow('already exists');
  });
});

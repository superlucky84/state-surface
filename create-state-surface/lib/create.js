import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Project generation for `create-state-surface` (DC-16 scaffold). Templates live in the
 * repository under `create-state-surface/templates/`:
 * - `base/`: files every project gets (tsconfig, prettier, env, gitignore, virtual types),
 * - `minimal/` (default) and `demo/` (the showcase site; its app files are the repository's
 *   own `routes/`, `content/`, … listed in `demo/template.json`),
 * - `adapters/<name>/`: the server entry and package changes of each runtime.
 */

export const TEMPLATES = ['minimal', 'demo'];
export const ADAPTERS = ['node', 'express', 'bun', 'deno', 'cloudflare'];

// npm drops dotfiles from published tarballs: templates store them without the dot.
const DOTFILES = {
  gitignore: '.gitignore',
  npmrc: '.npmrc',
  'env.example': '.env.example',
  prettierrc: '.prettierrc',
  prettierignore: '.prettierignore',
};
const TEMPLATE_ONLY = new Set(['template.json', 'package.json.template', 'adapter.json']);

export class CreateError extends Error {}

export function isValidProjectName(value) {
  return /^[a-z0-9][a-z0-9-_]*$/i.test(value);
}

/** Labels of the adapter prompt, in order (`node` first: the default). */
export function adapterChoices(source) {
  return ADAPTERS.map(name => ({
    name,
    label: readJson(path.join(templatesDir(source), 'adapters', name, 'adapter.json')).label,
  }));
}

/**
 * Write a new project into `targetDir`.
 * @param {{ targetDir: string, name?: string, template?: string, adapter?: string,
 *   source: string, version?: string, git?: boolean }} options
 */
export function createProject(options) {
  const template = options.template ?? 'minimal';
  const adapter = options.adapter ?? 'node';
  const targetDir = path.resolve(options.targetDir);
  const name = options.name ?? path.basename(targetDir);
  if (!TEMPLATES.includes(template))
    throw new CreateError(`Unknown template "${template}" (${TEMPLATES.join(', ')}).`);
  if (!ADAPTERS.includes(adapter))
    throw new CreateError(`Unknown adapter "${adapter}" (${ADAPTERS.join(', ')}).`);
  if (!isValidProjectName(name))
    throw new CreateError(
      'Project name must start with a letter or number and may include letters, numbers, "-" or "_".'
    );
  if (fs.existsSync(targetDir))
    throw new CreateError(`Target directory already exists: ${targetDir}`);

  const templates = templatesDir(options.source);
  const templateDir = path.join(templates, template);
  const adapterDir = path.join(templates, 'adapters', adapter);
  fs.mkdirSync(targetDir, { recursive: true });
  try {
    copyDir(path.join(templates, 'base'), targetDir);
    copyDir(templateDir, targetDir);
    const definition = fs.existsSync(path.join(templateDir, 'template.json'))
      ? readJson(path.join(templateDir, 'template.json'))
      : {};
    // The showcase uses the repository's own application files (its tests stay in the repo).
    const excluded = (definition.exclude ?? []).map(
      pattern =>
        new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
    );
    for (const entry of definition.include ?? [])
      fs.cpSync(path.join(options.source, entry), path.join(targetDir, entry), {
        recursive: true,
        filter: file => !excluded.some(pattern => pattern.test(path.basename(file))),
      });
    for (const [file, marker] of Object.entries(definition.strip ?? {})) {
      const target = path.join(targetDir, file);
      const kept = fs
        .readFileSync(target, 'utf8')
        .split('\n')
        .filter(line => !line.includes(marker));
      fs.writeFileSync(target, kept.join('\n'));
    }
    copyDir(adapterDir, targetDir);

    const adapterPackage = readJson(path.join(adapterDir, 'adapter.json')).package ?? {};
    const packageJson = mergePackage(
      JSON.parse(
        substitute(fs.readFileSync(path.join(templateDir, 'package.json.template'), 'utf8'), {
          name,
          adapter,
          version: options.version ?? '^0.2.0',
        })
      ),
      adapterPackage
    );
    fs.writeFileSync(
      path.join(targetDir, 'package.json'),
      JSON.stringify(packageJson, null, 2) + '\n'
    );

    // vite.config.ts names the adapter; templates are written for Node.
    const viteConfig = path.join(targetDir, 'vite.config.ts');
    fs.writeFileSync(
      viteConfig,
      fs
        .readFileSync(viteConfig, 'utf8')
        .replace(
          "import { node } from 'state-surface/adapters/node';",
          `import { ${adapter} } from 'state-surface/adapters/${adapter}';`
        )
        .replace('adapter: node()', `adapter: ${adapter}()`)
    );
    for (const file of ['README.md', 'wrangler.jsonc']) {
      const target = path.join(targetDir, file);
      if (fs.existsSync(target))
        fs.writeFileSync(
          target,
          substitute(fs.readFileSync(target, 'utf8'), { name, adapter, version: '' })
        );
    }
    const envExample = path.join(targetDir, '.env.example');
    if (fs.existsSync(envExample)) fs.copyFileSync(envExample, path.join(targetDir, '.env'));
  } catch (error) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    throw error;
  }
  const gitInitialized =
    options.git !== false &&
    spawnSync('git', ['init', '--quiet'], { cwd: targetDir, stdio: 'ignore' }).status === 0;
  return { targetDir, name, template, adapter, gitInitialized };
}

function templatesDir(source) {
  const dir = path.join(source, 'create-state-surface', 'templates');
  if (!fs.existsSync(dir)) throw new CreateError(`No templates in ${source}.`);
  return dir;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function substitute(text, { name, adapter, version }) {
  return text
    .replaceAll('__PROJECT_NAME__', name)
    .replaceAll('__PROJECT_DESCRIPTION__', `${name} built with StateSurface`)
    .replaceAll('__STATE_SURFACE_VERSION__', version)
    .replaceAll('__ADAPTER__', adapter);
}

/** Copy a template folder: dotfile names restored, template metadata left out. */
function copyDir(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (TEMPLATE_ONLY.has(entry.name)) continue;
    const target = path.join(to, DOTFILES[entry.name] ?? entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      copyDir(path.join(from, entry.name), target);
    } else fs.copyFileSync(path.join(from, entry.name), target);
  }
}

const sorted = record =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

function mergePackage(base, patch) {
  const result = { ...base };
  for (const key of ['scripts', 'dependencies', 'devDependencies']) {
    if (!patch[key]) continue;
    const merged = { ...(base[key] ?? {}), ...patch[key] };
    result[key] = key === 'scripts' ? merged : sorted(merged);
  }
  return result;
}

#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import {
  ADAPTERS,
  TEMPLATES,
  CreateError,
  adapterChoices,
  createProject,
  isValidProjectName,
} from '../lib/create.js';

const REPO = 'superlucky84/state-surface';
const BRANCH = 'main';
const TARBALL_URL = `https://github.com/${REPO}/tarball/${BRANCH}`;

function printHelp() {
  console.log(`create-state-surface

Usage:
  create-state-surface <project-name> [--template minimal|demo] [--adapter <name>]

Options:
  --template, -t   minimal (default): one page with static markup, a server slot,
                   a client island and a transition. demo: the showcase site.
  --adapter, -a    ${ADAPTERS.join(' | ')} (asked when omitted; default node)
  --source <dir>   Use templates from a local state-surface checkout instead of GitHub
  --no-git         Skip git init

Environment:
  STATE_SURFACE_VERSION   state-surface dependency (default ^0.1.0; a file: path works)

Example:
  npx create-state-surface my-app --template demo --adapter node

Existing projects are updated with: pnpm up state-surface
`);
}

function fail(message) {
  console.error(`[create-state-surface] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { git: true };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (!next || next.startsWith('-')) fail(`${arg} needs a value.`);
      return next;
    };
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--template' || arg === '-t') options.template = value();
    else if (arg.startsWith('--template=')) options.template = arg.slice(11);
    else if (arg === '--adapter' || arg === '-a') options.adapter = value();
    else if (arg.startsWith('--adapter=')) options.adapter = arg.slice(10);
    else if (arg === '--source') options.source = value();
    else if (arg === '--no-git') options.git = false;
    else if (arg.startsWith('-')) fail(`Unknown option ${arg}.`);
    else positional.push(arg);
  }
  options.project = positional[0];
  return options;
}

async function promptAdapter(source) {
  const choices = adapterChoices(source);
  console.log('Server runtime:');
  choices.forEach((choice, i) => console.log(`  ${i + 1}) ${choice.label}`));
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await readline.question(`Choose 1-${choices.length} [1]: `)).trim();
    if (!answer) return choices[0].name;
    const picked = choices[Number(answer) - 1] ?? choices.find(choice => choice.name === answer);
    if (!picked) fail(`Unknown adapter "${answer}".`);
    return picked.name;
  } finally {
    readline.close();
  }
}

/** The templates: a local checkout, or the repository tarball from GitHub. */
async function templateSource(local, cleanup) {
  if (local) return path.resolve(local);
  console.log('Downloading templates from GitHub...');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-state-surface-'));
  cleanup.push(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const response = await fetch(TARBALL_URL, { redirect: 'follow' });
  if (!response.ok) fail(`Failed to download templates: ${response.status} ${response.statusText}`);
  const tarball = path.join(tmpDir, 'repo.tar.gz');
  fs.writeFileSync(tarball, Buffer.from(await response.arrayBuffer()));
  const extractDir = path.join(tmpDir, 'extracted');
  fs.mkdirSync(extractDir);
  execFileSync('tar', ['xzf', tarball, '-C', extractDir], { stdio: 'pipe' });
  // GitHub tarballs have one root folder (e.g. "superlucky84-state-surface-abc1234").
  const entries = fs.readdirSync(extractDir);
  if (entries.length !== 1) fail('Unexpected tarball structure: expected one root directory.');
  return path.join(extractDir, entries[0]);
}

const options = parseArgs(process.argv.slice(2));
if (options.help || !options.project) {
  printHelp();
  process.exit(options.help ? 0 : 1);
}
const name = path.basename(options.project);
if (!isValidProjectName(name))
  fail(
    'Project name must start with a letter or number and may include letters, numbers, "-" or "_".'
  );
const template = options.template ?? 'minimal';
if (!TEMPLATES.includes(template))
  fail(`Unknown template "${template}" (${TEMPLATES.join(', ')}).`);
if (options.adapter && !ADAPTERS.includes(options.adapter))
  fail(`Unknown adapter "${options.adapter}" (${ADAPTERS.join(', ')}).`);
const targetDir = path.resolve(process.cwd(), options.project);
if (fs.existsSync(targetDir)) fail(`Target directory already exists: ${targetDir}`);

const cleanup = [];
try {
  const source = await templateSource(
    options.source ?? process.env.CREATE_STATE_SURFACE_SOURCE,
    cleanup
  );
  const adapter =
    options.adapter ??
    (process.stdin.isTTY && process.stdout.isTTY ? await promptAdapter(source) : 'node');
  const result = createProject({
    targetDir,
    name,
    template,
    adapter,
    source,
    version: process.env.STATE_SURFACE_VERSION ?? '^0.1.0',
    git: options.git,
  });
  console.log(`Project created (${template} template, ${adapter} adapter).`);
  console.log();
  console.log(`  Location: ${result.targetDir}`);
  console.log();
  console.log('Next steps:');
  console.log(`  cd ${options.project}`);
  console.log('  pnpm install');
  console.log('  pnpm dev');
  console.log();
  console.log('Update existing apps with: pnpm up state-surface');
  if (options.git && !result.gitInitialized) console.log('Git init was skipped (git unavailable).');
} catch (error) {
  if (error instanceof CreateError) fail(error.message);
  fail(`Failed to create the project: ${error.message}`);
} finally {
  for (const run of cleanup) run();
}

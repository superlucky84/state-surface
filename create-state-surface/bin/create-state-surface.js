#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

const REPO = 'superlucky84/state-surface';
const BRANCH = 'main';
const TARBALL_URL = `https://github.com/${REPO}/tarball/${BRANCH}`;

function printHelp() {
  console.log(`create-state-surface

Usage:
  create-state-surface <project-name>

Example:
  npx create-state-surface my-app

Note:
  Use this CLI for new projects only.
  Existing projects should be updated with:
    pnpm up state-surface
`);
}

function fail(message) {
  console.error(`[create-state-surface] ${message}`);
  process.exit(1);
}

function isValidProjectName(value) {
  return /^[a-z0-9][a-z0-9-_]*$/i.test(value);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(args.length === 0 ? 1 : 0);
}

const projectArg = args[0];
if (projectArg.startsWith('-')) {
  fail(`Invalid project name "${projectArg}".`);
}

const projectName = path.basename(projectArg);
if (!isValidProjectName(projectName)) {
  fail(
    'Project name must start with a letter or number and may include letters, numbers, "-" or "_".'
  );
}

const cwd = process.cwd();
const targetDir = path.resolve(cwd, projectArg);
if (fs.existsSync(targetDir)) {
  fail(`Target directory already exists: ${targetDir}`);
}

// Download and extract scaffold/ from GitHub tarball
console.log('Downloading template from GitHub...');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-state-surface-'));
const tarball = path.join(tmpDir, 'repo.tar.gz');

try {
  // Download tarball
  const res = await fetch(TARBALL_URL, { redirect: 'follow' });
  if (!res.ok) {
    fail(`Failed to download template: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(tarball, buffer);

  // Extract scaffold/ directory only, stripping the repo prefix + "scaffold/"
  fs.mkdirSync(targetDir, { recursive: true });
  execSync(`tar xzf "${tarball}" -C "${targetDir}" --strip-components=2 '*/scaffold/'`, {
    stdio: 'pipe',
  });
} catch (err) {
  // Clean up on failure
  fs.rmSync(targetDir, { recursive: true, force: true });
  if (err.message?.includes('create-state-surface')) throw err;
  fail(`Failed to extract template: ${err.message}`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Apply package.json template substitution
const packageTemplatePath = path.join(targetDir, 'package.json.template');
if (!fs.existsSync(packageTemplatePath)) {
  fail('package.json.template is missing in scaffold.');
}

const rawPackageTemplate = fs.readFileSync(packageTemplatePath, 'utf8');
const runtimeVersion = process.env.STATE_SURFACE_VERSION ?? '^0.1.0';
const packageJson = rawPackageTemplate
  .replaceAll('__PROJECT_NAME__', projectName)
  .replaceAll('__PROJECT_DESCRIPTION__', `${projectName} built with StateSurface`)
  .replaceAll('__STATE_SURFACE_VERSION__', runtimeVersion);

fs.writeFileSync(path.join(targetDir, 'package.json'), packageJson);
fs.rmSync(packageTemplatePath);

// Rename dotfiles (npm strips leading-dot files from tarballs)
for (const [from, to] of [
  ['gitignore', '.gitignore'],
  ['npmrc', '.npmrc'],
  ['env.example', '.env.example'],
]) {
  const fromPath = path.join(targetDir, from);
  if (fs.existsSync(fromPath)) {
    fs.renameSync(fromPath, path.join(targetDir, to));
  }
}

// Copy .env.example to .env so the app runs out of the box
const envExample = path.join(targetDir, '.env.example');
const envFile = path.join(targetDir, '.env');
if (fs.existsSync(envExample) && !fs.existsSync(envFile)) {
  fs.copyFileSync(envExample, envFile);
}

const gitResult = spawnSync('git', ['init'], {
  cwd: targetDir,
  stdio: 'ignore',
});
const gitInitialized = gitResult.status === 0;

console.log('Project created successfully.');
console.log();
console.log(`  Location: ${targetDir}`);
console.log();
console.log('Next steps:');
console.log(`  cd ${projectArg}`);
console.log('  pnpm install');
console.log('  pnpm dev');
console.log();
console.log('Update existing apps with: pnpm up state-surface');
if (!gitInitialized) {
  console.log('Git init was skipped (git command unavailable).');
}

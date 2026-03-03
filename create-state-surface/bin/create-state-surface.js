#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(scriptDir, '..');
const templateDir = path.join(cliRoot, 'template');
if (!fs.existsSync(templateDir)) {
  fail(`Template directory not found: ${templateDir}`);
}

fs.mkdirSync(path.dirname(targetDir), { recursive: true });
fs.cpSync(templateDir, targetDir, {
  recursive: true,
  errorOnExist: true,
});

const packageTemplatePath = path.join(targetDir, 'package.json.template');
if (!fs.existsSync(packageTemplatePath)) {
  fail('package.json.template is missing in template.');
}

const rawPackageTemplate = fs.readFileSync(packageTemplatePath, 'utf8');
const runtimeVersion = process.env.STATE_SURFACE_VERSION ?? '^0.1.0';
const packageJson = rawPackageTemplate
  .replaceAll('__PROJECT_NAME__', projectName)
  .replaceAll('__PROJECT_DESCRIPTION__', `${projectName} built with StateSurface`)
  .replaceAll('__STATE_SURFACE_VERSION__', runtimeVersion);

fs.writeFileSync(path.join(targetDir, 'package.json'), packageJson);
fs.rmSync(packageTemplatePath);

for (const [from, to] of [
  ['gitignore', '.gitignore'],
  ['npmrc', '.npmrc'],
]) {
  const fromPath = path.join(targetDir, from);
  if (fs.existsSync(fromPath)) {
    fs.renameSync(fromPath, path.join(targetDir, to));
  }
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

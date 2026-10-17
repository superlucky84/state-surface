#!/usr/bin/env node
import { check } from './build/check.js';

/** `state-surface <command>`: `check` runs the plugin analysis and `tsc --noEmit`. */
const [command, ...args] = process.argv.slice(2);

if (command === 'check') {
  const rootArg = args.find(arg => !arg.startsWith('-'));
  process.exitCode = await check({ root: rootArg, types: !args.includes('--no-types') });
} else {
  console.log(
    [
      'Usage: state-surface check [root] [--no-types]',
      '',
      '  check   Build analysis (pages, slots, islands, transitions, content, server-only',
      '          imports) and tsc --noEmit, without bundling.',
    ].join('\n')
  );
  process.exitCode = command && command !== '--help' && command !== '-h' ? 1 : 0;
}

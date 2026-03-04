import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const templateRoot = resolve(here, 'template');

const VISUAL_PARITY_FILES = [
  'client/main.ts',
  'client/plugins/guideToc.ts',
  'client/plugins/prism.ts',
  'routes/guide/[slug].ts',
  'routes/guide/templates/guideContent.tsx',
  'routes/guide/templates/guideToc.tsx',
  'routes/_shared/templates/pageHeader.tsx',
  'shared/content.ts',
] as const;

describe('create-state-surface visual parity files', () => {
  for (const relativePath of VISUAL_PARITY_FILES) {
    it(`${relativePath} is synced with reference site`, () => {
      const templateSource = readFileSync(resolve(templateRoot, relativePath), 'utf8');
      const referenceSource = readFileSync(resolve(projectRoot, relativePath), 'utf8');
      expect(templateSource).toBe(referenceSource);
    });
  }
});

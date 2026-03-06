import path from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const TEMPLATE_FILES = [
  'routes/examples/chat/templates/chatMessages.tsx',
  'routes/examples/chat/templates/chatCurrent.tsx',
  'routes/examples/chat/templates/chatTyping.tsx',
  'create-state-surface/template/routes/examples/chat/templates/chatMessages.tsx',
  'create-state-surface/template/routes/examples/chat/templates/chatCurrent.tsx',
  'create-state-surface/template/routes/examples/chat/templates/chatTyping.tsx',
];

const FORBIDDEN_PATTERNS: RegExp[] = [
  /from\s+['"]lithent\/helper['"]/,
  /\bmount\s*\(/,
  /\bstate\s*\(/,
];

describe('chat template purity', () => {
  for (const relativeFile of TEMPLATE_FILES) {
    it(`${relativeFile} does not use mount/state helper patterns`, () => {
      const filePath = path.join(process.cwd(), relativeFile);
      const source = readFileSync(filePath, 'utf8');

      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});

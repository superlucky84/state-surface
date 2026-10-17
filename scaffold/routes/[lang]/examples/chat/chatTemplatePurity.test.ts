import path from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const TEMPLATE_FILES = [
  'routes/[lang]/examples/chat/_components/chatMessages.tsx',
  'routes/[lang]/examples/chat/_components/chatCurrent.tsx',
  'routes/[lang]/examples/chat/_components/chatTyping.tsx',
  'scaffold/routes/[lang]/examples/chat/_components/chatMessages.tsx',
  'scaffold/routes/[lang]/examples/chat/_components/chatCurrent.tsx',
  'scaffold/routes/[lang]/examples/chat/_components/chatTyping.tsx',
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

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadContent, parseMarkdown } from './content.js';
import { compileMdx } from './mdx.js';
import { integer, object, optional, text } from '../../shared/schema.js';
import type { CollectionConfig } from '../content/types.js';

const md = (source: string) => parseMarkdown({ file: 'content/guides/en/a.md', source });
/** The build error of a source (message includes `file:line:column`). */
const error = (source: string) => {
  try {
    md(source);
  } catch (failure) {
    return (failure as Error).message;
  }
  throw new Error('expected a build error');
};

describe('Markdown blocks (DC-25 ③)', () => {
  it('parse sections and the 10 block types', () => {
    const { front, body } = md(`---
title: A
---

## Setup {#setup}

Read **this** and [the demo](/examples/search).

- one
- two \`code\`

\`\`\`ts label="a.ts" collapsible
const a = 1;
\`\`\`

:::checklist
- done
:::

:::warning
Careful.
:::

:::sequence
1. first
2. second
:::

:::diagram{label="Flow"}
\`\`\`
a → b
\`\`\`
:::

:::callout{kind="tip"}
Tip text.
:::

:::analogy
Like a mailbox.
:::

:::debug{symptom="Nothing changes" cause="First frame was partial"}
Yield a full frame first.
:::

:::debug{symptom="Twice" cause="Two actions"}
Use targets.
:::

## Auto id

Text.
`);
    expect(front).toEqual({ text: 'title: A', line: 2 });
    expect(body.sections.map(section => [section.id, section.text, section.line])).toEqual([
      ['setup', 'Setup', 5],
      ['auto-id', 'Auto id', 51],
    ]);
    const [setup] = body.sections;
    expect(setup.blocks.map(block => block.type)).toEqual([
      'paragraph',
      'bullets',
      'code',
      'checklist',
      'warning',
      'sequence',
      'diagram',
      'callout',
      'analogy',
      'debug',
    ]);
    expect(setup.blocks[2]).toEqual({
      type: 'code',
      lang: 'ts',
      label: 'a.ts',
      collapsible: true,
      text: 'const a = 1;',
    });
    expect(setup.blocks[6]).toEqual({ type: 'diagram', label: 'Flow', text: 'a → b' });
    // Consecutive :::debug directives are one block.
    const debug = setup.blocks[9] as { items: Array<{ symptom: string }> };
    expect(debug.items.map(item => item.symptom)).toEqual(['Nothing changes', 'Twice']);
    expect(setup.blocks[0]).toMatchObject({
      children: expect.arrayContaining([
        expect.objectContaining({ tagName: 'strong' }),
        expect.objectContaining({ tagName: 'a', properties: { href: '/examples/search' } }),
      ]),
    });
  });

  it.each([
    ['## A\n\n:::tabs\nx\n:::', 'a.md:3:1: Unknown directive :::tabs'],
    ['## A\n\n:::callout{kind="tip" size="2"}\nx\n:::', ':3:1: :::callout has no attribute "size"'],
    ['## A\n\n:::callout{kind="danger"}\nx\n:::', 'kind="danger" must be one of tip, info, note'],
    ['## A\n\n:::debug{symptom="x"}\nfix\n:::', ':::debug needs cause="…"'],
    ['## A\n\n<div>raw</div>', 'a.md:3:1: Raw HTML is not allowed'],
    ['## A\n\nText <b>bold</b>', 'a.md:3:6: Raw HTML is not allowed in content'],
    ['## A\n\nUse page:header here.', 'a.md:3:9: ":header" is read as a directive'],
    ['## A\n\n![x](/a.png)', 'a.md:3:1: Images in Markdown are not supported'],
    ['## A\n\n### Deeper', 'a.md:3:1: Only "##" section headings are allowed'],
    ['Intro first.\n\n## A', 'a.md:1:1: Content must start with a "## Heading {#id}" section'],
    ['## A\n\n1. one', 'a.md:3:1: Ordered lists belong in :::sequence'],
    ['## A\n\n```ts run\nx\n```', 'Code fence meta "run" is unknown'],
    ['## 설치', 'Section ID "" must be kebab-case: "## 설치 {#my-section}"'],
    ['## A {#a}\n\n## B {#a}', 'a.md:3:1: Section ID "a" is used twice'],
    [
      '## A\n\n:::sequence\n- not ordered\n:::',
      ':::sequence must contain exactly one ordered (1.) list',
    ],
    ['## A\n\n:::diagram\ntext\n:::', ':::diagram must contain exactly one fenced code block'],
  ])('report %j at its line', (source, message) => {
    expect(error(source)).toContain(message);
  });
});

describe('loadContent (DC-25 ①④⑤)', () => {
  let root: string;
  afterEach(() => rm(root, { recursive: true, force: true }));

  async function project(files: Record<string, string>) {
    root = await mkdtemp(path.join(os.tmpdir(), 'surface-content-'));
    for (const [file, source] of Object.entries(files)) {
      const target = path.join(root, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, source);
    }
    return root;
  }
  const guides: CollectionConfig = {
    schema: object({ title: text({ min: 1 }), order: integer({ min: 1 }), demo: optional(text()) }),
    i18n: { locales: ['en', 'ko'], parity: true },
  };
  const load = (
    collections: Record<string, CollectionConfig>,
    parity: 'error' | 'warn' = 'error'
  ) =>
    loadContent({
      root,
      collections,
      parity,
      mdxHeadings: async (file, source) => (await compileMdx(source, file)).headings,
    });
  const guide = (title: string, body = '## A {#a}\n\nText.\n') =>
    `---\ntitle: ${title}\norder: 1\n---\n\n${body}`;

  it('read every format with ids, locales and validated data', async () => {
    await project({
      'content/guides/en/intro.md': guide('Intro'),
      'content/guides/ko/intro.md': guide('소개'),
      'content/guides/en/deep/nested.md': guide('Nested'),
      'content/guides/ko/deep/nested.md': guide('중첩'),
      'content/guides/en/_draft.md': 'ignored',
      'content/pages/home.yaml': 'hero:\n  title: Hello\nitems: [1, 2]\n',
      'content/pages/about.json': '{"title": "About"}',
      'content/docs/live.mdx': '---\ntitle: Live\n---\n\n# Live\n\n## 설치\n\nText.\n',
    });
    const result = await load({ guides, pages: {}, docs: {} });
    expect(
      result.collections.guides.map(entry => [entry.id, entry.lang, entry.data, entry.kind])
    ).toEqual([
      ['deep/nested', 'en', { title: 'Nested', order: 1 }, 'md'],
      ['intro', 'en', { title: 'Intro', order: 1 }, 'md'],
      ['deep/nested', 'ko', { title: '중첩', order: 1 }, 'md'],
      ['intro', 'ko', { title: '소개', order: 1 }, 'md'],
    ]);
    expect(result.collections.pages.map(entry => [entry.id, entry.data])).toEqual([
      ['about', { title: 'About' }],
      ['home', { hero: { title: 'Hello' }, items: [1, 2] }],
    ]);
    expect(result.collections.docs[0]).toMatchObject({
      kind: 'mdx',
      data: { title: 'Live' },
      headings: [
        { depth: 1, text: 'Live', id: 'live' },
        { depth: 2, text: '설치', id: '설치' },
      ],
    });
    expect(result.warnings).toEqual([]);
  });

  it('report schema errors at the frontmatter field', async () => {
    await project({
      'content/guides/en/intro.md': '---\ntitle: Intro\norder: zero\n---\n\n## A\n',
    });
    await expect(load({ guides: { ...guides, i18n: undefined } })).rejects.toThrow(
      'content/guides/en/intro.md:3:1: order: Expected a whole number'
    );
  });

  it.each([
    [{ 'content/pages/a.yaml': 'a: [1, 2' }, 'content/pages/a.yaml:1:'],
    [
      { 'content/pages/b.yaml': 'title: x\ntext: one: two\n' },
      'content/pages/b.yaml:2:7: Invalid YAML: Nested mappings are not allowed',
    ],
    [{ 'content/pages/a.json': '{\n  "a": 1,\n}' }, 'content/pages/a.json:3:1: Invalid JSON'],
    [{ 'content/pages/a.txt': 'x' }, 'content/pages/a.txt: Unsupported content file'],
  ])('report invalid data files with their location', async (files, message) => {
    await project(files);
    await expect(load({ pages: {} })).rejects.toThrow(message);
  });

  it('require locale folders for i18n collections', async () => {
    await project({ 'content/guides/intro.md': guide('Intro') });
    await expect(load({ guides })).rejects.toThrow(
      'content/guides/intro.md: Files of "guides" live in content/guides/<locale>/ (locales: en, ko)'
    );
  });

  it('fail the build on parity gaps and warn in dev', async () => {
    await project({
      'content/guides/en/intro.md': guide('Intro', '## A {#a}\n\nText.\n\n## B {#b}\n\n- x\n'),
      'content/guides/ko/intro.md': guide('소개', '## A {#a}\n\nText.\n\n## B {#b}\n\nText.\n'),
      'content/guides/en/only.md': guide('Only'),
    });
    await expect(load({ guides })).rejects.toThrow(
      'content/guides/ko/intro.md:10:1: Section "b" blocks differ from en: [bullets] vs [paragraph]. (+1 more)'
    );
    const dev = await load({ guides }, 'warn');
    expect(dev.warnings).toEqual([
      'content/guides/ko/intro.md:10: Section "b" blocks differ from en: [bullets] vs [paragraph].',
      'content/guides/en/only.md: "only" has no ko version (content/guides/ko/only.md).',
    ]);
  });

  it('compare section ids, mdx headings and data shapes across locales', async () => {
    await project({
      'content/guides/en/a.md': guide('A', '## One {#one}\n\nx\n'),
      'content/guides/ko/a.md': guide('A', '## 하나 {#uno}\n\nx\n'),
      'content/docs/en/b.mdx': '# B\n\n## C\n',
      'content/docs/ko/b.mdx': '# B\n\n### C\n',
      'content/pages/en/home.yaml':
        'hero:\n  title: Hi\ntags: [a, b]\nitems: [{ a: 1 }, { a: 2 }]\n',
      'content/pages/ko/home.yaml': 'hero:\n  title: 안녕\ntags: [가]\nitems: [{ a: 1 }]\n',
    });
    const i18n = { locales: ['en', 'ko'], parity: true };
    const { warnings } = await load({ guides, docs: { i18n }, pages: { i18n } }, 'warn');
    expect(warnings).toEqual([
      'content/guides/ko/a.md: Sections differ from en: [one] vs [uno].',
      'content/docs/ko/b.mdx: Heading structure differs from en: [1,2] vs [1,3].',
      'content/pages/ko/home.yaml: Data shape differs from en: items has 2 vs 1 items.',
    ]);
  });

  it('take loader entries and validate them', async () => {
    await project({});
    const result = await load({
      remote: {
        schema: object({ title: text({ min: 1 }) }),
        loader: () => [{ id: 'x', data: { title: 'X' } }],
      },
    });
    expect(result.collections.remote[0]).toMatchObject({
      id: 'x',
      kind: 'data',
      data: { title: 'X' },
    });
    await expect(
      load({
        remote: {
          schema: object({ title: text({ min: 1 }) }),
          loader: () => [{ id: 'y', data: {} }],
        },
      })
    ).rejects.toThrow('remote loader: title: Expected text');
  });
});

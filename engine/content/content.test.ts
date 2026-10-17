import { afterEach, describe, expect, it } from 'vitest';
import { h } from 'lithent';
import { renderToString } from 'lithent/ssr';
import { parseMarkdown } from '../build/content.js';
import { setBasePath } from '../shared/basePath.js';
import { highlight, highlightLines } from './highlight.js';
import { createCollections } from './runtime.js';
import { renderMd } from './render.js';
import type { RawEntry } from './types.js';

const html = (node: unknown) => renderToString(node as never);
const body = (source: string) =>
  parseMarkdown({ file: 'content/a/x.md', source: `## Section {#s}\n\n${source}` }).body;
const render = (source: string, components = {}) => html(renderMd(body(source), components));

describe('Markdown rendering (DC-25 ③, rich allowlist)', () => {
  afterEach(() => setBasePath(''));

  it('render sections and blocks as semantic HTML with highlighted code', () => {
    const out = render(
      [
        'Read **this**.',
        '```ts label="a.ts"\nconst a = 1;\n```',
        ':::callout{kind="info"}\nNote.\n:::',
        ':::debug{symptom="S" cause="C"}\nFix.\n:::',
      ].join('\n\n')
    );
    expect(out).toContain('<section id="s"><h2>Section</h2><p>Read <strong>this</strong>.</p>');
    expect(out).toContain(
      '<figure class="code"><figcaption>a.ts</figcaption><pre><code class="language-ts">' +
        '<span class="token keyword">const</span> a <span class="token operator">=</span> ' +
        '<span class="token number">1</span><span class="token punctuation">;</span></code></pre></figure>'
    );
    expect(out).toContain('<aside class="callout callout-info" role="note"><p>Note.</p></aside>');
    expect(out).toContain('<dl class="debug"><dt>S</dt><dd><p>C</p><p>Fix.</p></dd></dl>');
  });

  it('give root-relative links BASE_PATH and external links rel', () => {
    setBasePath('/demo');
    const out = render('[guide](/guide/intro) [site](https://example.com/x) [top](#s)');
    expect(out).toContain('<a href="/demo/guide/intro">guide</a>');
    expect(out).toContain('<a href="https://example.com/x" rel="noopener noreferrer">site</a>');
    expect(out).toContain('<a href="#s">top</a>');
  });

  it('block script URLs and escape markup in text and code', () => {
    const out = render(
      [
        '[x](javascript:alert(1)) [y](data:text/html,1) [z](vbscript:1)',
        '`<script>alert(1)</script>`',
        '```html\n<script>alert(1)</script>\n```',
        '&lt;img src=x onerror=alert(1)&gt;',
      ].join('\n\n')
    );
    expect(out).not.toMatch(/javascript:|data:text|vbscript:/);
    expect(out).not.toMatch(/<script|<img/);
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('let pages replace block renderers', () => {
    const out = render(':::warning\nCareful.\n:::\n\n- a\n- b', {
      warning: ({ children }: { children: unknown[] }) =>
        h('div', { class: 'warn' }, ...(children as never[])),
      bullets: ({ items }: { items: unknown[][] }) => h('p', {}, `${items.length} items`),
    });
    expect(out).toContain('<div class="warn"><p>Careful.</p></div><p>2 items</p>');
  });
});

describe('server highlighting', () => {
  it('split tokens per line and reopen tokens that span lines', () => {
    const lines = highlightLines('/* a\nb */\nconst x = 1;', 'js');
    expect(lines.map(line => html(h('code', {}, ...(line as never[]))))).toEqual([
      '<code><span class="token comment">/* a</span></code>',
      '<code><span class="token comment">b */</span></code>',
      '<code><span class="token keyword">const</span> x <span class="token operator">=</span> <span class="token number">1</span><span class="token punctuation">;</span></code>',
    ]);
  });

  it('keep unknown languages as plain text and resolve aliases', () => {
    expect(highlight('a < b', 'brainfuck')).toEqual(['a < b']);
    expect(html(h('code', {}, ...(highlight('x: 1', 'yml') as never[])))).toContain(
      'token key atrule'
    );
  });
});

describe('collections API (DC-25 ①)', () => {
  const entry = (id: string, lang?: string, data: unknown = { title: id }): RawEntry => ({
    kind: 'md',
    collection: 'guides',
    id,
    ...(lang ? { lang } : {}),
    file: `content/guides/${lang ? `${lang}/` : ''}${id}.md`,
    data,
    body: body('Text.'),
    headings: [{ depth: 2, text: 'Section', id: 's' }],
  });
  const store = () =>
    createCollections({
      guides: {
        locales: ['en', 'ko'],
        entries: [entry('a', 'en'), entry('b', 'en'), entry('a', 'ko')],
      },
      pages: {
        entries: [{ ...entry('home'), kind: 'data', body: undefined, headings: [] }],
      },
    });

  it('query by locale and filter, and find one entry', async () => {
    const { getCollection, getEntry } = store();
    expect((await getCollection('guides')).map(e => `${e.lang}/${e.id}`)).toEqual([
      'en/a',
      'en/b',
      'ko/a',
    ]);
    expect(
      (await getCollection('guides', { lang: 'en', filter: e => e.id !== 'a' })).map(e => e.id)
    ).toEqual(['b']);
    const found = await getEntry('guides', 'a', { lang: 'ko' });
    expect(found).toMatchObject({ id: 'a', lang: 'ko', file: 'content/guides/ko/a.md' });
    expect(html(found!.Content())).toBe('<section id="s"><h2>Section</h2><p>Text.</p></section>');
    expect(await getEntry('guides', 'zz', { lang: 'en' })).toBeUndefined();
    expect((await getEntry('pages', 'home'))?.data).toEqual({ title: 'home' });
  });

  it('report unknown collections and locales, and need a locale per i18n entry', async () => {
    const { getCollection, getEntry } = store();
    await expect(getCollection('blog')).rejects.toThrow(
      'Unknown content collection "blog" (content/config.ts defines "guides", "pages").'
    );
    await expect(getCollection('guides', { lang: 'fr' })).rejects.toThrow('no locale "fr"');
    await expect(getEntry('guides', 'a')).rejects.toThrow('getEntry("guides", id, { lang })');
    await expect(getCollection('pages', { lang: 'en' })).rejects.toThrow('has no i18n locales');
    const home = await getEntry('pages', 'home');
    expect(() => home!.Content()).toThrow('is a data entry and has no Content');
  });

  it('share frozen data between requests', async () => {
    const { getEntry } = store();
    const found = await getEntry('guides', 'a', { lang: 'en' });
    expect(Object.isFrozen(found!.data)).toBe(true);
    expect(() => {
      (found!.data as { title: string }).title = 'changed';
    }).toThrow(TypeError);
  });
});

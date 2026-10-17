// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { h, mount } from 'lithent';
import type { TagFunction } from 'lithent';
import { renderPage, renderSlotHtml } from '../server/ssrRenderer.js';
import { createContext } from '../server/core/context.js';
import { safeStateJSON } from '../server/ssr.js';
import { Island, Slot } from '../shared/surfaceTree.js';
import { safeUrl, unsafeAttribute } from '../shared/capability.js';
import { uiPatchProblem } from '../shared/protocol.js';
import { mountComponent } from '../client/lithentBridge.js';
import { Markdown } from '../rich.js';

/**
 * Stage 9 malicious input set, rendering half (V-10, DESIGN 8.1): payloads an attacker
 * controls in frame props and Markdown, and what reaches the document on the server and in
 * the browser. Tokens, flash and redirects: tokens.test.ts. Defects found here keep a
 * `regression:` test name.
 */
const ORIGIN = 'https://surface.test';
const el = (tag: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) =>
  h(tag as never, props as never, ...(children as never[]));
const ctx = () =>
  createContext(new Request(`${ORIGIN}/`), {
    basePath: '',
    signal: new AbortController().signal,
  }).ctx;
const render = (
  component: unknown,
  props: Record<string, unknown>,
  capability?: 'strict' | 'rich' | 'unsafe'
) => renderSlotHtml({ slot: 's', component, props, ctx: ctx(), capability });
// happy-dom leaves `&lt;`/`&gt;` encoded in attribute values (browsers decode them).
const decoded = (value: string | null) => value?.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const parse = (html: string) => {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
};
/** Attribute names that run script or load a document, in any letter case. */
const dangerous = (root: Element) =>
  [root, ...root.querySelectorAll('*')].flatMap(node =>
    Array.from(node.attributes)
      .filter(({ name, value }) =>
        unsafeAttribute(node.localName, name, value, node.getAttribute('attributeName'))
      )
      .map(({ name }) => `${node.localName}[${name}]`)
  );

// Templates that pass attacker data through: one attribute bag, a link, an SVG animation.
const Spread = (props: { tag?: string; attrs: Record<string, unknown>; text?: string }) =>
  el(props.tag ?? 'div', props.attrs, props.text ?? '');
const Link = (props: { href: string }) => el('a', { href: props.href }, 'link');
const Animated = (props: { attribute: string; to?: string; values?: string }) =>
  el(
    'svg',
    {},
    el(
      'a',
      {},
      el('set', { attributeName: props.attribute, ...(props.to ? { to: props.to } : {}) }),
      el('animate', {
        attributeName: props.attribute,
        ...(props.values ? { values: props.values } : {}),
      }),
      el('text', {}, 'x')
    )
  );
const Doc = (props: { source: string }) =>
  el('article', {}, el(Markdown, { source: props.source }));

const URL_PAYLOADS = [
  'javascript:alert(1)',
  'JAVASCRIPT:alert(1)',
  ' javascript:alert(1)',
  '\tjava\nscript:alert(1)',
  '\u0000javascript:alert(1)',
  'javascript\u0000:alert(1)',
  'vbscript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
  'DATA:image/svg+xml;base64,PHN2Zz4=',
  'blob:https://surface.test/uuid',
  'filesystem:https://surface.test/temporary/x',
];

describe('URL attributes (strict)', () => {
  it.each(URL_PAYLOADS)('drops %j from every URL attribute', async payload => {
    for (const [tag, attribute] of [
      ['a', 'href'],
      ['img', 'src'],
      ['iframe', 'src'],
      ['form', 'action'],
      ['button', 'formaction'],
      ['video', 'poster'],
      ['blockquote', 'cite'],
      ['object', 'data'],
      ['object', 'codebase'],
      ['use', 'xlink:href'],
      ['td', 'background'],
    ]) {
      const { html } = await render(Spread, { tag, attrs: { [attribute]: payload } });
      expect(html, `${tag}[${attribute}]`).not.toContain(`${attribute}=`);
    }
  });

  it('keeps encoded schemes as text: the browser resolves them as relative paths', async () => {
    for (const payload of ['&#106;avascript:alert(1)', '&colon;', '\u00a0javascript:alert(1)']) {
      const { html } = await render(Link, { href: payload });
      const link = parse(html).querySelector('a')!;
      expect(safeUrl(link.getAttribute('href') ?? '')).toBe(true);
    }
  });

  it('keeps a plain `data` attribute outside <object>', async () => {
    const { html } = await render(Spread, { tag: 'my-widget', attrs: { data: 'javascript:x' } });
    expect(html).toBe('<my-widget data="javascript:x"></my-widget>');
  });
});

describe('attributes and event handlers (strict)', () => {
  it('regression: drops upper- and mixed-case event handler attributes (Lithent skips only on…)', async () => {
    const { html } = await render(Spread, {
      attrs: { ONCLICK: 'alert(1)', OnMouseOver: 'alert(2)', oNfocus: 'alert(3)', title: 'ok' },
    });
    expect(html).toBe('<div title="ok"></div>');
  });

  it('drops attribute names that would break out of the tag', async () => {
    const { html } = await render(Spread, {
      attrs: { 'x" onload="alert(1)': 1, 'a b': 1, 'c>': 1, "d'": 1, 'e/': 1, 'f=': 1 },
    });
    expect(html).toBe('<div></div>');
  });

  it('keeps breakout payloads inside attribute values and text', async () => {
    const payload = `"><img src=x onerror=alert(1)>'&<`;
    const { html } = await render(Spread, {
      attrs: { title: payload, 'data-params': JSON.stringify({ q: payload }) },
      text: `</div><script>alert(1)</script>${payload}`,
    });
    const root = parse(html);
    expect(root.querySelectorAll('img, script')).toHaveLength(0);
    const div = root.querySelector('div')!;
    expect(decoded(div.getAttribute('title'))).toBe(payload);
    expect(JSON.parse(decoded(div.getAttribute('data-params'))!)).toEqual({ q: payload });
    expect(div.textContent).toBe(`</div><script>alert(1)</script>${payload}`);
  });

  it('regression: srcdoc is raw HTML (needs capability="unsafe", scripts made inert there)', async () => {
    const attrs = { srcdoc: '<script>parent.alert(1)</script>' };
    await expect(render(Spread, { tag: 'iframe', attrs })).rejects.toThrow(
      'raw HTML (srcdoc) needs capability="unsafe"'
    );
    await expect(render(Spread, { tag: 'iframe', attrs }, 'rich')).rejects.toThrow('srcdoc');
    const { html } = await render(Spread, { tag: 'iframe', attrs }, 'unsafe');
    expect(html).toContain('srcdoc="&lt;template data-surface-script&gt;');
    expect(html).not.toContain('&lt;script');
  });

  it('regression: SVG animations cannot write a javascript: URL into href', async () => {
    for (const attribute of ['href', 'xlink:href', ' HREF ']) {
      const { html } = await render(Animated, {
        attribute,
        to: 'javascript:alert(1)',
        values: 'https://ok.test;javascript:alert(2)',
      });
      expect(html).not.toContain('javascript:');
      expect(dangerous(parse(html))).toEqual([]);
    }
    const { html } = await render(Animated, { attribute: 'fill', to: 'red', values: 'red;blue' });
    expect(html).toContain('to="red"');
    expect(html).toContain('values="red;blue"');
  });
});

describe('rich (Markdown) bypass attempts', () => {
  it.each([
    ['[x](javascript:alert(1))', '<a>x</a>'],
    ['[x](JaVaScRiPt:alert(1))', '<a>x</a>'],
    ['[x](&#106;avascript:alert(1))', '<a>x</a>'],
    // An encoded tab stays percent-encoded: `java%09script:` is a relative path.
    ['[x](java&#x09;script:alert(1))', 'href="java%09script:alert(1)"'],
    ['<javascript:alert(1)>', '<a>javascript:alert(1)</a>'],
    ['[x][r]\n\n[r]: javascript:alert(1)', '<a>x</a>'],
    ['![x](javascript:alert(1))', '<img alt="x" />'],
    ['[x](data:text/html,<script>alert(1)</script>)', '<a>x</a>'],
    [
      '[x](https://ok.test "a\\" onmouseover=\\"alert(1)")',
      'title="a&quot; onmouseover=&quot;alert(1)"',
    ],
  ])('%j', async (source, expected) => {
    const { html } = await render(Doc, { source }, 'rich');
    expect(html).toContain(expected);
    expect(dangerous(parse(html))).toEqual([]);
  });

  it('drops raw HTML, event attributes and unknown elements', async () => {
    const { html } = await render(
      Doc,
      {
        source: [
          '<img src=x onerror=alert(1)>',
          '',
          '<a href="javascript:alert(1)">raw</a> <svg onload=alert(1)></svg>',
          '',
          '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
          '',
          '<!-- <script>alert(1)</script> -->',
        ].join('\n'),
      },
      'rich'
    );
    const root = parse(html);
    expect(root.querySelectorAll('img, svg, iframe, script')).toHaveLength(0);
    expect(dangerous(root)).toEqual([]);
  });

  it('keeps code fence languages to one class token', async () => {
    const { html } = await render(
      Doc,
      { source: '```js"><img src=x onerror=alert(1)>\nx\n```' },
      'rich'
    );
    const root = parse(html);
    expect(root.querySelectorAll('img')).toHaveLength(0);
    expect(root.querySelector('code')!.getAttribute('class') ?? '').toMatch(
      /^(language-[\w+-]+)?$/
    );
  });
});

describe('client components (browser DOM guard)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  const host = () => document.body.appendChild(document.createElement('h-state'));
  const tick = () => new Promise(resolve => setTimeout(resolve, 20));
  const Evil = ((props: { href: string; attrs?: Record<string, unknown>; html?: string }) =>
    h(
      'div',
      {},
      h('a', { href: props.href }, 'link'),
      h('span', (props.attrs ?? {}) as never),
      h('iframe', { srcdoc: '<script>parent.alert(1)</script>' }),
      ...(props.html ? [h('section', { innerHTML: props.html })] : [])
    )) as unknown as TagFunction;

  it('regression: removes what the server drops from props rendered in the browser', async () => {
    const el = host();
    const mounted = mountComponent(
      Evil,
      { href: 'javascript:alert(1)', attrs: { ONCLICK: 'alert(1)' } },
      el,
      { hydrate: false, guard: true }
    );
    expect(dangerous(el)).toEqual([]);
    expect(el.querySelector('a')!.hasAttribute('href')).toBe(false);
    mounted.update({
      href: ' JAVASCRIPT:alert(2)',
      attrs: { OnMouseOver: 'alert(2)' },
      html: '<img src="x:y" onerror="alert(3)"><form action="javascript:alert(4)"></form>',
    });
    await tick();
    expect(dangerous(el)).toEqual([]);
    expect(el.querySelector('img')).not.toBeNull();
    mounted.update({ href: 'https://ok.test/' });
    await tick();
    expect(el.querySelector('a')!.getAttribute('href')).toBe('https://ok.test/');
    mounted.cleanup();
  });

  it('cleans local re-renders of the component (MutationObserver)', async () => {
    let renew!: () => boolean;
    let href = '/ok';
    const Local = mount(r => {
      renew = r;
      return () => h('a', { href }, 'local');
    }) as unknown as TagFunction;
    const el = host();
    const mounted = mountComponent(Local, {}, el, { hydrate: false, guard: true });
    href = 'javascript:alert(1)';
    renew();
    await tick();
    expect(el.querySelector('a')!.hasAttribute('href')).toBe(false);
    mounted.cleanup();
  });

  it('leaves page islands and capability="unsafe" components alone', async () => {
    const el = host();
    mountComponent(Evil, { href: 'javascript:void(0)' }, el, { hydrate: false });
    expect(el.querySelector('a')!.getAttribute('href')).toBe('javascript:void(0)');
  });

  it('tells the browser which components skip the guard', async () => {
    const Box = (props: { text?: string }) => el('p', {}, props.text ?? '');
    const island = (props: Record<string, unknown>) =>
      el(Island, { __ssComponent: Box, __ssId: 'Box.tsx#default', ...props });
    // A server slot template that renders a client island (built as an Island descriptor).
    const Holder = () => island({ 'client:load': true });
    const html = await renderPage(
      {
        default: () =>
          el(
            'html',
            {},
            el('head', {}),
            el(
              'body',
              {},
              island({ 'client:load': true, text: 'page' }),
              el(Slot, {
                name: 'raw',
                capability: 'unsafe',
                'client:load': true,
                component: Box,
                __ssComponentId: 'Box.tsx#default',
              }),
              el(Slot, { name: 'safe', 'client:load': true }, island({ text: 'slot' })),
              el(
                Slot,
                { name: 'html', mode: 'server', capability: 'unsafe' },
                el(Island, { __ssComponent: Holder, __ssId: 'Holder.tsx#default' })
              ),
              el(
                Slot,
                { name: 'cards', mode: 'server' },
                el(Island, { __ssComponent: Holder, __ssId: 'Holder.tsx#default' })
              )
            )
          ),
      },
      ctx()
    );
    const bootstrap = JSON.parse(html.match(/id="__SURFACE__"[^>]*>(.*?)<\/script>/s)![1]);
    const meta = Object.fromEntries(
      bootstrap.slots
        .filter((slot: { mode: string }) => slot.mode === 'client')
        .map((slot: { id: string; capability?: string }) => [slot.id, slot.capability ?? 'guarded'])
    );
    expect(meta).toEqual({
      $0: 'guarded',
      raw: 'unsafe',
      safe: 'guarded',
      html$0: 'unsafe',
      cards$0: 'guarded',
    });
  });
});

describe('__SURFACE__ bootstrap JSON', () => {
  it.each([
    '</script><script>alert(1)</script>',
    '</SCRIPT >',
    '<!--<script>',
    '\u2028\u2029',
    '<\u0000/script>',
    ']]>&amp;',
  ])('cannot close or break the element: %j', payload => {
    const text = safeStateJSON({ props: { text: payload, [payload]: 1 } });
    expect(text).not.toMatch(/[<>&\u2028\u2029]/);
    const root = parse(`<script type="application/json">${text}</script>`);
    expect(root.querySelectorAll('script')).toHaveLength(1);
    expect(JSON.parse(root.querySelector('script')!.textContent!)).toEqual({
      props: { text: payload, [payload]: 1 },
    });
  });
});

describe('UI patch injection (cssVars, classes)', () => {
  it.each([
    [{ cssVars: { '--c': 'red;background:url(https://evil.test)' } }],
    [{ cssVars: { '--c': 'red}body{color:red' } }],
    [{ cssVars: { '--c': 'URL (https://evil.test/x.png)' } }],
    [{ cssVars: { '--c': 'u\\72l(https://evil.test)' } }],
    [{ cssVars: { '--c': 'expression(alert(1))' } }],
    [{ cssVars: { '--c': 'image-set("https://evil.test/track.png" 1x)' } }],
    [{ cssVars: { '--c': '-webkit-image-set("https://evil.test/a.png" 1x)' } }],
    [{ cssVars: { '--c': 'src("https://evil.test/a.png")' } }],
    [{ cssVars: { color: 'red' } }],
    [{ cssVars: { '--c;x': 'red' } }],
    [{ cssVars: { '--c': 1 } }],
    [{ classAdd: ['ok', 'a"b'] }],
    [{ classAdd: ['<script>'] }],
    [{ classAdd: 'ok' }],
    [{ style: 'color:red' }],
    [{ attributes: { onclick: 'x' } }],
  ])('rejects %j', patch => expect(uiPatchProblem(patch)).toBeDefined());

  it('accepts ordinary tokens and values', () => {
    expect(
      uiPatchProblem({
        classAdd: ['md:grid-cols-[1fr_2fr]', 'bg-red-500/50'],
        cssVars: { '--hue': '210', '--shadow': '0 0 4px rgb(0 0 0 / 50%)' },
      })
    ).toBeUndefined();
  });
});

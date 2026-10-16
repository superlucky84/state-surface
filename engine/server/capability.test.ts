// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { h } from 'lithent';
import { renderPage, renderSlotHtml } from './ssrRenderer.js';
import { createContext } from './core/context.js';
import { createHandler } from './core/handler.js';
import { defineManifest } from './core/manifest.js';
import { defineServerComponent } from './serverComponent.js';
import { assertSecret, seal, unseal } from './secrets.js';
import { Island, Slot } from '../shared/surfaceTree.js';
import { safeUrl, neutralizeScripts } from '../shared/capability.js';
import { Markdown } from '../rich.js';

const el = (tag: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) =>
  h(tag as never, props as never, ...(children as never[]));
const ctx = () =>
  createContext(new Request('https://surface.test/'), {
    basePath: '',
    signal: new AbortController().signal,
  }).ctx;
const render = (
  component: unknown,
  props: Record<string, unknown>,
  capability?: 'strict' | 'rich' | 'unsafe',
  sandbox?: 'iframe'
) => renderSlotHtml({ slot: 's', component, props, ctx: ctx(), capability, sandbox });
const documentOf = (...body: unknown[]) => el('html', {}, el('head', {}), el('body', {}, ...body));

const Link = (props: { href: string; label?: string }) =>
  el('a', { href: props.href }, props.label ?? 'link');
const Form = (props: { action: string }) =>
  el('form', { action: props.action }, el('button', { formaction: props.action }, 'go'));
const Image = (props: { src: string }) => el('img', { src: props.src, alt: '' });
const Raw = (props: { html: string }) => el('div', { innerHTML: props.html });
const Doc = (props: { source: string }) =>
  el('article', {}, el(Markdown, { source: props.source }));

describe('safeUrl', () => {
  it.each([
    ['https://example.com', true],
    ['http://example.com', true],
    ['mailto:a@b.c', true],
    ['/relative?x=1', true],
    ['./a', true],
    ['#frag', true],
    ['//cdn.example.com/x.png', true],
    ['javascript:alert(1)', false],
    [' JaVaScRiPt:alert(1)', false],
    ['java\tscript:alert(1)', false],
    ['\u0000javascript:alert(1)', false],
    ['vbscript:x', false],
    ['data:text/html,<script>alert(1)</script>', false],
  ])('%j → %s', (value, ok) => expect(safeUrl(value)).toBe(ok));
});

describe('strict capability (malicious input set, DC-13)', () => {
  it('drops javascript: and data: URLs from href, src, action and formaction', async () => {
    expect((await render(Link, { href: 'javascript:alert(1)' })).html).toBe('<a>link</a>');
    expect((await render(Image, { src: 'data:image/svg+xml,<svg onload=alert(1)>' })).html).toBe(
      '<img alt="" />'
    );
    expect((await render(Form, { action: ' javascript:alert(1)' })).html).toBe(
      '<form><button>go</button></form>'
    );
    expect((await render(Link, { href: 'https://ok.test/?q=1' })).html).toBe(
      '<a href="https://ok.test/?q=1">link</a>'
    );
  });

  it('keeps attribute breakout payloads inside the attribute', async () => {
    const { html } = await render(Link, {
      href: '/x" onmouseover="alert(1)',
      label: '<img src=x onerror=alert(1)>',
    });
    expect(html).toBe(
      '<a href="/x&quot; onmouseover=&quot;alert(1)">&lt;img src=x onerror=alert(1)&gt;</a>'
    );
    const root = document.createElement('div');
    root.innerHTML = html;
    expect(root.querySelector('[onmouseover]')).toBeNull();
    expect(root.querySelector('img')).toBeNull();
  });

  it('rejects raw HTML outside capability="unsafe"', async () => {
    await expect(render(Raw, { html: '<b>x</b>' })).rejects.toThrow(
      'raw HTML (innerHTML) needs capability="unsafe"'
    );
    await expect(render(Raw, { html: '<b>x</b>' }, 'rich')).rejects.toThrow('capability="unsafe"');
  });

  it('applies to page SSR of slot content but not to trusted page markup', async () => {
    const html = await renderPage(
      {
        default: () =>
          documentOf(
            el('a', { href: 'javascript:void(0)' }, 'trusted page link'),
            el(
              Slot,
              { name: 'cards', mode: 'server' },
              el(Island, { __ssComponent: Link, __ssId: 'Link.tsx#default', href: 'javascript:x' })
            )
          ),
      },
      ctx()
    );
    expect(html).toContain('<a href="javascript:void(0)">trusted page link</a>');
    expect(html).toContain('<h-state name="cards"><a>link</a></h-state>');
  });
});

describe('rich capability', () => {
  it('renders Markdown through the allowlist and drops raw HTML and unsafe links', async () => {
    const { html } = await render(
      Doc,
      {
        source: [
          '# Title',
          '',
          'Hello **bold** [ok](https://ok.test) [bad](javascript:alert(1)) <script>alert(1)</script>',
          '',
          '<img src=x onerror=alert(1)>',
          '',
          '```js',
          'const a = 1;',
          '```',
        ].join('\n'),
      },
      'rich'
    );
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<a href="https://ok.test" rel="nofollow noopener noreferrer">ok</a>');
    expect(html).toContain('<a>bad</a>');
    expect(html).toContain('<pre><code class="language-js">const a = 1;\n</code></pre>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
  });

  it('is an error in a strict slot', async () => {
    await expect(render(Doc, { source: '*x*' })).rejects.toThrow('needs capability="rich"');
  });
});

describe('unsafe capability', () => {
  it('allows raw HTML but never runs scripts', async () => {
    const { html } = await render(
      Raw,
      { html: '<p>ok</p><script>alert(1)</script><SCRIPT src="x"></SCRIPT>' },
      'unsafe'
    );
    expect(html).toBe(
      '<div><p>ok</p><template data-surface-script>alert(1)</template><template data-surface-script src="x"></template></div>'
    );
    expect(neutralizeScripts('<scriptx>')).toBe('<scriptx>');
  });

  it('isolates content in a sandboxed iframe', async () => {
    const { html } = await render(Raw, { html: '<p>"quoted"</p>' }, 'unsafe', 'iframe');
    expect(html).toBe(
      '<iframe sandbox="" srcdoc="&lt;div&gt;&lt;p&gt;&quot;quoted&quot;&lt;/p&gt;&lt;/div&gt;" data-surface-sandbox="" style="border:0;width:100%"></iframe>'
    );
  });

  it('only accepts sandbox with capability="unsafe"', () => {
    expect(() =>
      el(
        Slot,
        { name: 'x', mode: 'server', sandbox: 'iframe' },
        el(Island, { __ssComponent: Raw, __ssId: 'Raw#default' })
      )
    ).toThrow('sandbox="iframe" needs capability="unsafe"');
  });
});

describe('deferred slot tokens (DC-21, IC-09)', () => {
  const secret = 'x'.repeat(32);

  it('round-trips with the current or previous secret and rejects tampering', async () => {
    const token = await seal({ current: secret }, { p: { id: 1 } });
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await unseal({ current: secret }, token)).toEqual({ p: { id: 1 } });
    expect(await unseal({ current: 'y'.repeat(32), previous: secret }, token)).toEqual({
      p: { id: 1 },
    });
    await expect(unseal({ current: 'y'.repeat(32) }, token)).rejects.toThrow('Invalid token');
    const tampered = token.slice(0, -2) + (token.at(-2) === 'A' ? 'B' : 'A') + token.at(-1);
    await expect(unseal({ current: secret }, tampered)).rejects.toThrow('Invalid token');
    await expect(unseal({ current: secret }, 'not base64!')).rejects.toThrow();
  });

  it('rejects secrets shorter than 32 bytes', () => {
    expect(() => assertSecret('short')).toThrow('at least 32 bytes');
    expect(() =>
      createHandler({ manifest: defineManifest({ routes: [], transitions: {} }), secret: 'short' })
    ).toThrow('at least 32 bytes');
  });

  const Cart = defineServerComponent({
    load: async (props: { user: string }, context) => ({
      user: props.user,
      // Request data of the island request itself (cookies, auth) is re-checked here.
      cookie: context.request.headers.get('x-user') ?? 'none',
    }),
    render: (data: { user: string; cookie: string }) => el('p', {}, `${data.user}:${data.cookie}`),
  });
  const handler = (buildId = 'b1', options: { secret?: string } = { secret }) =>
    createHandler({
      ...options,
      manifest: defineManifest({
        buildId,
        components: { 'cart.tsx#default': Cart },
        routes: [
          {
            pattern: '/',
            page: { id: 'index', slots: {} },
            module: {
              default: () =>
                documentOf(
                  el(
                    Slot,
                    {
                      name: 'cart',
                      mode: 'server',
                      'server:defer': true,
                      fallback: el('p', {}, 'Loading cart'),
                    },
                    el(Island, { __ssComponent: Cart, __ssId: 'cart.tsx#default', user: 'ada' })
                  )
                ),
            },
          },
        ],
        transitions: {},
      }),
    });

  it('renders the fallback with a sealed token and serves the content from the island endpoint', async () => {
    const page = await handler().fetch(new Request('https://surface.test/'));
    const html = await page.text();
    expect(html).toContain('<h-state name="cart"><p>Loading cart</p></h-state>');
    expect(html).not.toContain('ada');
    const bootstrap = JSON.parse(html.match(/id="__SURFACE__"[^>]*>(.*?)<\/script>/)![1]);
    const [meta] = bootstrap.slots;
    expect(meta).toMatchObject({ id: 'cart', mode: 'server', component: 'cart.tsx#default' });
    const url = `https://surface.test/_surface/island/${encodeURIComponent(meta.component)}?p=${meta.defer}`;
    const response = await handler().fetch(
      new Request(url, { headers: { 'x-user': 's1', 'x-surface-build': 'b1' } })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ html: '<p>ada:s1</p>' });

    // POST carries long tokens; another build is a 409, another component or key a 400.
    const post = await handler().fetch(
      new Request(`https://surface.test/_surface/island/${encodeURIComponent(meta.component)}`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: meta.defer,
      })
    );
    expect(await post.json()).toEqual({ html: '<p>ada:none</p>' });
    expect((await handler('b2').fetch(new Request(url))).status).toBe(409);
    expect((await handler().fetch(new Request(url.replace('cart.tsx', 'other.tsx')))).status).toBe(
      400
    );
    expect((await handler('b1', { secret: 'z'.repeat(32) }).fetch(new Request(url))).status).toBe(
      400
    );
  });
});

import { describe, it, expect } from 'vitest';
import { safeStateJSON, fillHState, buildStateScript, ssrHash } from './ssr.js';

describe('safeStateJSON', () => {
  it('escapes < > & for safe HTML embedding', () => {
    const result = safeStateJSON({ html: '<script>alert("xss")</script>' });
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).toContain('\\u003c');
    expect(result).toContain('\\u003e');
  });

  it('produces valid JSON after escaping', () => {
    const original = { a: 1, b: '<tag>&amp;</tag>' };
    const escaped = safeStateJSON(original);
    // The escaped string should parse back correctly
    // (JSON.parse handles unicode escapes)
    expect(JSON.parse(escaped)).toEqual(original);
  });
});

describe('fillHState', () => {
  const renderTemplate = (name: string, data: any) => {
    if (name === 'page:article') return `<h1>${data.title}</h1>`;
    if (name === 'panel:comments') return `<ul>${data.count} comments</ul>`;
    return '';
  };

  it('fills matching anchors with rendered content', () => {
    const html = '<main><h-state name="page:article"></h-state></main>';
    const states = { 'page:article': { title: 'Hello' } };

    const result = fillHState(html, states, renderTemplate);
    expect(result).toContain('<h1>Hello</h1>');
    expect(result).toContain('data-ssr-hash=');
  });

  it('leaves anchors empty when no state provided', () => {
    const html = '<h-state name="panel:sidebar"></h-state>';
    const states = {};

    const result = fillHState(html, states, renderTemplate);
    expect(result).toBe('<h-state name="panel:sidebar"></h-state>');
    expect(result).not.toContain('data-ssr-hash');
  });

  it('fills multiple anchors', () => {
    const html =
      '<h-state name="page:article"></h-state><h-state name="panel:comments"></h-state>';
    const states = {
      'page:article': { title: 'Test' },
      'panel:comments': { count: 5 },
    };

    const result = fillHState(html, states, renderTemplate);
    expect(result).toContain('<h1>Test</h1>');
    expect(result).toContain('5 comments');
  });

  it('preserves existing attributes on h-state', () => {
    const html = '<h-state name="page:article" mode="visibility"></h-state>';
    const states = { 'page:article': { title: 'Hi' } };

    const result = fillHState(html, states, renderTemplate);
    expect(result).toContain('mode="visibility"');
    expect(result).toContain('<h1>Hi</h1>');
  });
});

describe('buildStateScript', () => {
  it('produces a script tag with safe JSON', () => {
    const states = { 'page:article': { title: '<Test>' } };
    const result = buildStateScript(states);

    expect(result).toMatch(/^<script id="__STATE__" type="application\/json">/);
    expect(result).toMatch(/<\/script>$/);
    expect(result).not.toContain('<Test>');
    expect(result).toContain('\\u003cTest\\u003e');
  });
});

describe('ssrHash', () => {
  it('produces a hex hash string', () => {
    const hash = ssrHash('<div>hello</div>');
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('same content produces same hash', () => {
    expect(ssrHash('<p>test</p>')).toBe(ssrHash('<p>test</p>'));
  });

  it('normalizes whitespace differences', () => {
    const a = ssrHash('<p>  hello   world  </p>');
    const b = ssrHash('<p> hello world </p>');
    expect(a).toBe(b);
  });

  it('ignores HTML comments', () => {
    const a = ssrHash('<div><!-- comment -->text</div>');
    const b = ssrHash('<div>text</div>');
    expect(a).toBe(b);
  });

  it('sorts attributes for stable hashing', () => {
    const a = ssrHash('<div class="a" id="b">x</div>');
    const b = ssrHash('<div id="b" class="a">x</div>');
    expect(a).toBe(b);
  });

  it('excludes dynamic attributes', () => {
    const a = ssrHash('<div nonce="abc123">x</div>');
    const b = ssrHash('<div>x</div>');
    expect(a).toBe(b);
  });
});

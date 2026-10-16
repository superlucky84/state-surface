import { describe, it, expect } from 'vitest';
import { safeStateJSON, buildStateScript, buildBootScript } from './ssr.js';

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

describe('buildBootScript', () => {
  it('serializes <Boot> entries as an ordered array', () => {
    const script = buildBootScript([
      { transition: 'first', params: { q: '</script>' } },
      { transition: 'second', params: {} },
    ]);
    expect(script).toMatch(/^<script id="__BOOT__" type="application\/json">/);
    expect(script.split('</script>')).toHaveLength(2);
    const json = script.slice(script.indexOf('>') + 1, script.lastIndexOf('</script>'));
    expect(JSON.parse(json)).toEqual([
      { transition: 'first', params: { q: '</script>' } },
      { transition: 'second', params: {} },
    ]);
  });
});

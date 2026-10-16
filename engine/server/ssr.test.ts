import { describe, it, expect } from 'vitest';
import { safeStateJSON, buildSurfaceScript } from './ssr.js';

describe('safeStateJSON', () => {
  it('escapes < > & U+2028 U+2029 for safe HTML embedding', () => {
    const result = safeStateJSON({ html: '<script>alert("xss")</script>&\u2028\u2029' });
    expect(result).not.toMatch(/[<>&\u2028\u2029]/);
    expect(result).toContain('\\u003c');
    expect(result).toContain('\\u003e');
    expect(result).toContain('\\u0026');
    expect(result).toContain('\\u2028');
  });

  it('produces valid JSON after escaping', () => {
    const original = { a: 1, b: '<tag>&amp;</tag>\u2028' };
    expect(JSON.parse(safeStateJSON(original))).toEqual(original);
  });
});

describe('buildSurfaceScript', () => {
  it('writes the single bootstrap JSON that cannot close its script element', () => {
    const script = buildSurfaceScript({
      buildId: 'b1',
      pageId: 'guide/[slug]',
      basePath: '/demo',
      slots: [{ id: 'a', mode: 'client', component: 'a#default', props: { t: '</script>' } }],
      boot: [{ transition: 'first', params: { q: '</script>' } }],
    });
    expect(script).toMatch(/^<script id="__SURFACE__" type="application\/json">/);
    expect(script.split('</script>')).toHaveLength(2);
    const json = script.slice(script.indexOf('>') + 1, script.lastIndexOf('</script>'));
    expect(JSON.parse(json)).toEqual({
      buildId: 'b1',
      pageId: 'guide/[slug]',
      basePath: '/demo',
      slots: [{ id: 'a', mode: 'client', component: 'a#default', props: { t: '</script>' } }],
      boot: [{ transition: 'first', params: { q: '</script>' } }],
    });
  });
});

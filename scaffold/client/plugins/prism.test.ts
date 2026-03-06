/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { prismPlugin } from './prism.js';

const SAMPLE_CODE = `const value = 1;
console.log(value);`;

function mountFixture(source: string) {
  document.body.innerHTML = `
    <div id="root">
      <pre><code class="language-typescript">${source}</code></pre>
    </div>
  `;

  const root = document.getElementById('root') as HTMLElement;
  const code = root.querySelector('code') as HTMLElement;
  return { root, code };
}

describe('prismPlugin', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as typeof requestAnimationFrame;
  });

  it('applies syntax highlight and line numbers on mount', () => {
    const plugin = prismPlugin();
    const { root, code } = mountFixture(SAMPLE_CODE);

    plugin.onMount?.('guide:content', root, {});

    expect(code.querySelectorAll('.code-ln')).toHaveLength(2);
    expect(code.innerHTML).toContain('token');
    expect(code.getAttribute('data-prism-raw')).toBe(SAMPLE_CODE);
  });

  it('re-highlights updated code even when data-prism-raw is stale', () => {
    const plugin = prismPlugin();
    const { root, code } = mountFixture(SAMPLE_CODE);

    plugin.onMount?.('guide:content', root, {});
    const updatedCode = `const next = 2;
console.log(next);
console.log(next + 1);`;

    // Simulate DOM diff reusing the same <code> node but replacing text content.
    code.textContent = updatedCode;
    plugin.onUpdate?.('guide:content', root, {});

    expect(code.querySelectorAll('.code-ln')).toHaveLength(3);
    expect(code.getAttribute('data-prism-raw')).toBe(updatedCode);
    expect(code.innerHTML).toContain('token');
  });
});

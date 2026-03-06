/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { guideTocPlugin } from './guideToc.js';

function installAnimationFrameStub() {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  }) as typeof requestAnimationFrame;
}

function installMatchMediaStub(mobile: boolean, reducedMotion = false) {
  window.matchMedia = ((query: string): MediaQueryList => {
    const matches = query.includes('max-width')
      ? mobile
      : query.includes('prefers-reduced-motion')
        ? reducedMotion
        : false;

    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  }) as typeof window.matchMedia;
}

function createGuideTocDom() {
  document.body.innerHTML = `
    <div id="slot">
      <div data-guide-nav-scroll>
        <a href="/guide/quickstart">Quickstart</a>
        <a data-guide-active="true" href="/guide/template">Template</a>
        <a href="/guide/action">Action</a>
      </div>
    </div>
  `;

  const slot = document.getElementById('slot') as HTMLElement;
  const scrollRow = slot.querySelector('[data-guide-nav-scroll]') as HTMLElement;
  const activeLink = slot.querySelector('[data-guide-active="true"]') as HTMLElement;

  Object.defineProperty(scrollRow, 'scrollWidth', { configurable: true, value: 640 });
  Object.defineProperty(scrollRow, 'clientWidth', { configurable: true, value: 240 });

  return { slot, activeLink };
}

describe('guideTocPlugin', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    installAnimationFrameStub();
  });

  it('scrolls active category into view on mobile mount', () => {
    installMatchMediaStub(true, false);
    const { slot, activeLink } = createGuideTocDom();
    const scrollSpy = vi.fn();
    activeLink.scrollIntoView = scrollSpy;

    guideTocPlugin().onMount?.('guide:toc', slot, {});

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'center',
      behavior: 'smooth',
    });
  });

  it('does not scroll on desktop viewport', () => {
    installMatchMediaStub(false, false);
    const { slot, activeLink } = createGuideTocDom();
    const scrollSpy = vi.fn();
    activeLink.scrollIntoView = scrollSpy;

    guideTocPlugin().onUpdate?.('guide:toc', slot, {});

    expect(scrollSpy).not.toHaveBeenCalled();
  });
});

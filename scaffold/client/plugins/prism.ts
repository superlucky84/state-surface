import Prism from 'prismjs';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-tsx';
import type { StateSurfacePlugin } from 'state-surface/client';

function readRawSource(el: HTMLElement): string {
  const stored = el.getAttribute('data-prism-raw');
  const hasInjectedLineNumbers = el.querySelector('.code-ln') !== null;

  // If this node already has injected line-number spans, trust the stored raw source.
  if (hasInjectedLineNumbers && stored !== null) return stored;
  return el.textContent ?? stored ?? '';
}

function injectLineNumbers(html: string): string {
  const lines = html.split('\n');
  if (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();

  const pad = String(lines.length).length;
  return lines
    .map((line, i) => {
      const num = String(i + 1).padStart(pad);
      return `<span class="code-ln">${num}</span>${line}`;
    })
    .join('\n');
}

function highlight(root: Element) {
  root.querySelectorAll('pre code[class*="language-"]').forEach(node => {
    const el = node as HTMLElement;
    const raw = readRawSource(el);

    // Reset to raw source before Prism runs so repeated updates stay deterministic.
    el.textContent = raw;
    Prism.highlightElement(el);
    el.innerHTML = injectLineNumbers(el.innerHTML);
    el.setAttribute('data-prism-raw', raw);
    el.classList.add('prism-done');
  });
}

function highlightAfterRender(root: Element) {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => highlight(root));
    return;
  }
  setTimeout(() => highlight(root), 0);
}

export function prismPlugin(): StateSurfacePlugin {
  return {
    name: 'prism',
    onMount(_slotName, el) {
      highlight(el);
      // Some DOM updates can finalize after hook timing; re-apply once on next frame.
      highlightAfterRender(el);
    },
    onUpdate(_slotName, el) {
      highlight(el);
      highlightAfterRender(el);
    },
  };
}

import Prism from 'prismjs';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-tsx';
import type { StateSurfacePlugin } from 'state-surface/client';

function highlight(root: Element) {
  root.querySelectorAll('pre code[class*="language-"]:not(.prism-done)').forEach(el => {
    Prism.highlightElement(el as HTMLElement);

    const html = el.innerHTML;
    const lines = html.split('\n');
    if (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();

    const pad = String(lines.length).length;
    el.innerHTML = lines
      .map((line, i) => {
        const num = String(i + 1).padStart(pad);
        return `<span class="code-ln">${num}</span>${line}`;
      })
      .join('\n');
    el.classList.add('prism-done');
  });
}

export function prismPlugin(): StateSurfacePlugin {
  return {
    name: 'prism',
    onMount(_slotName, el) {
      highlight(el);
    },
    onUpdate(_slotName, el) {
      highlight(el);
    },
  };
}

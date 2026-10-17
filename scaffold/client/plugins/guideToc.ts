import { definePlugin } from 'state-surface/client';

function isMobileViewport(): boolean {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(max-width: 767px)').matches;
}

function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function scrollActiveGuideCategory(slotEl: Element) {
  if (!isMobileViewport()) return;

  const scrollRow = slotEl.querySelector<HTMLElement>('[data-guide-nav-scroll]');
  const activeLink = scrollRow?.querySelector<HTMLElement>('[data-guide-active="true"]');

  if (!scrollRow || !activeLink) return;
  if (scrollRow.scrollWidth <= scrollRow.clientWidth + 1) return;

  activeLink.scrollIntoView({
    block: 'nearest',
    inline: 'center',
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  });
}

function scheduleScroll(slotEl: Element) {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => scrollActiveGuideCategory(slotEl));
    return;
  }
  setTimeout(() => scrollActiveGuideCategory(slotEl), 0);
}

/** The code of a guide code block without its line numbers. */
export function codeText(button: Element): string {
  const code = button.closest('.rounded-lg')?.querySelector('pre code');
  if (!code) return '';
  const copy = code.cloneNode(true) as Element;
  copy.querySelectorAll('.code-ln').forEach(number => number.remove());
  return copy.textContent ?? '';
}

function copyCode(event: Event) {
  const button = (event.target as Element | null)?.closest?.('button[data-copy-code]');
  if (!button) return;
  void navigator.clipboard?.writeText(codeText(button));
  button.textContent = 'Copied!';
  setTimeout(() => (button.textContent = 'Copy'), 1500);
}

/**
 * Keeps the active guide category visible in the mobile category row, and copies guide code
 * blocks (they are prerendered HTML, so the button is handled here).
 */
export const guideToc = definePlugin({
  name: 'guide-toc',
  slots: ['guide:toc'],
  onPage({ signal }) {
    document.addEventListener('click', copyCode, { signal });
  },
  attach(el) {
    scheduleScroll(el);
  },
  update(el) {
    scheduleScroll(el);
  },
});

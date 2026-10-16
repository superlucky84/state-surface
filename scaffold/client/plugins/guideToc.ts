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

/** Keeps the active guide category visible in the mobile category row. */
export const guideToc = definePlugin({
  name: 'guide-toc',
  slots: ['guide:toc'],
  attach(el) {
    scheduleScroll(el);
  },
  update(el) {
    scheduleScroll(el);
  },
});

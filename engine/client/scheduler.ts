export type Timing = 'load' | 'idle' | 'visible' | 'media';

/**
 * Start `run` at the activation timing (DC-04 ①): `load` right away, `idle` on
 * requestIdleCallback (2s timeout; without it 200ms after the load event), `visible` when the
 * element comes within 200px of the viewport, `media` once the query matches. Missing
 * observers fall back to `idle`. Returns a cancel function.
 *
 * Activation on first interaction and load retries complete this in stage 5.
 */
export function schedule(
  timing: Timing,
  run: () => void,
  options: { element?: Element; media?: string } = {}
): () => void {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    cleanup();
    run();
  };
  let cleanup = () => {};

  if (timing === 'visible' && options.element && typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) once();
      },
      { rootMargin: '200px' }
    );
    // Island hosts use display:contents and have no box of their own; observe their
    // children as well so visibility is reported.
    for (const target of [options.element, ...Array.from(options.element.children)])
      observer.observe(target);
    cleanup = () => observer.disconnect();
  } else if (timing === 'media' && options.media && typeof matchMedia === 'function') {
    const query = matchMedia(options.media);
    if (query.matches) queueMicrotask(once);
    else {
      const onChange = () => query.matches && once();
      query.addEventListener('change', onChange);
      cleanup = () => query.removeEventListener('change', onChange);
    }
  } else if (timing === 'load') {
    queueMicrotask(once);
  } else if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(once, { timeout: 2000 });
    cleanup = () => {
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(handle);
    };
  } else {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const afterLoad = () => (timer = setTimeout(once, 200));
    if (document.readyState === 'complete') afterLoad();
    else addEventListener('load', afterLoad, { once: true });
    cleanup = () => {
      removeEventListener('load', afterLoad);
      if (timer) clearTimeout(timer);
    };
  }
  return () => {
    done = true;
    cleanup();
  };
}

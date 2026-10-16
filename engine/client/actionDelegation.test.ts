/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bindDeclarativeActions } from './actionDelegation.js';
import type { StateSurface, TraceEvent } from './stateSurface.js';

function createMockSurface() {
  const transition = vi.fn();
  const trace = vi.fn<(event: TraceEvent) => void>();

  return {
    surface: { transition, trace } as unknown as StateSurface,
    transition,
    trace,
  };
}

describe('action delegation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('click on [data-action] triggers surface.transition with parsed params', () => {
    document.body.innerHTML = `
      <button
        id="load"
        data-action="article-load"
        data-params='{"articleId":2}'
        data-pending-targets="page:content,panel:comments"
      >
        Load
      </button>
    `;

    const { surface, transition } = createMockSurface();
    const detach = bindDeclarativeActions(surface);

    document
      .getElementById('load')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(transition).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledWith(
      'article-load',
      { articleId: 2 },
      { pendingTargets: ['page:content', 'panel:comments'] }
    );

    detach();
  });

  it('invalid data-params JSON falls back to empty params and traces error', () => {
    document.body.innerHTML = `
      <button id="load" data-action="article-load" data-params="{invalid-json}">
        Load
      </button>
    `;

    const { surface, transition, trace } = createMockSurface();
    const detach = bindDeclarativeActions(surface);

    document
      .getElementById('load')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(transition).toHaveBeenCalledWith('article-load', {}, {});
    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
      })
    );

    detach();
  });

  it('form submit serializes fields and merges with data-params', () => {
    document.body.innerHTML = `
      <form
        id="search-form"
        data-action="search"
        data-params='{"source":"manual"}'
        data-pending-targets="search:results"
      >
        <input name="query" value="lithent" />
        <input name="tag" value="state" />
        <input name="tag" value="stream" />
      </form>
    `;

    const { surface, transition } = createMockSurface();
    const detach = bindDeclarativeActions(surface);

    document
      .getElementById('search-form')!
      .dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));

    expect(transition).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledWith(
      'search',
      { source: 'manual', query: 'lithent', tag: ['state', 'stream'] },
      { pendingTargets: ['search:results'] }
    );

    detach();
  });

  it('skips events a component already handled and runs one action per event', () => {
    document.body.innerHTML = '<button id="b" data-action="like">Like</button>';
    const { surface, transition } = createMockSurface();
    const detachFirst = bindDeclarativeActions(surface);
    const detachSecond = bindDeclarativeActions(surface);
    const button = document.getElementById('b')!;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(transition).toHaveBeenCalledTimes(1);
    const handled = (event: Event) => event.preventDefault();
    button.addEventListener('click', handled);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(transition).toHaveBeenCalledTimes(1);
    button.removeEventListener('click', handled);
    detachFirst();
    detachSecond();
  });

  it('runs forms posting to actionUrl() as transitions, with the submitter value (V-13)', () => {
    document.body.innerHTML = `
      <form id="f" method="post" action="/_surface/action/comment/add">
        <input name="body" value="hello" />
        <button id="publish" name="intent" value="publish">Publish</button>
        <button id="other" formaction="/_surface/action/comment/draft" name="intent" value="draft">Draft</button>
      </form>
      <form id="get" method="get" action="/_surface/action/comment/add"><input name="q" value="x" /></form>
      <form id="away" method="post" action="https://elsewhere.test/_surface/action/comment/add"></form>
    `;
    const { surface, transition } = createMockSurface();
    const detach = bindDeclarativeActions(surface);
    const form = document.getElementById('f') as HTMLFormElement;
    const submit = (target: HTMLFormElement, submitter?: HTMLElement) =>
      target.dispatchEvent(
        new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter })
      );
    submit(form, document.getElementById('publish')!);
    submit(form, document.getElementById('other')!);
    submit(document.getElementById('get') as HTMLFormElement);
    submit(document.getElementById('away') as HTMLFormElement);
    expect(transition.mock.calls).toEqual([
      ['comment/add', { body: 'hello', intent: 'publish' }, {}],
      ['comment/draft', { body: 'hello', intent: 'draft' }, {}],
    ]);
    detach();
  });

  it('sends a form with a chosen file as multipart', () => {
    document.body.innerHTML = `
      <form id="upload" data-action="upload" data-params='{"album":3}'>
        <input name="title" value="cat" />
        <input id="file" type="file" name="photo" />
      </form>
    `;
    const input = document.getElementById('file') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'cat.png', { type: 'image/png' })],
    });
    const { surface, transition } = createMockSurface();
    const detach = bindDeclarativeActions(surface);
    const original = FormData;
    // happy-dom's FormData(form) does not read file inputs; emulate the browser.
    vi.stubGlobal(
      'FormData',
      class extends original {
        constructor(form?: HTMLFormElement) {
          super(form);
          if (form) this.set('photo', input.files![0]);
        }
      }
    );
    document
      .getElementById('upload')!
      .dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    vi.unstubAllGlobals();
    const [name, params, options] = transition.mock.calls[0];
    expect(name).toBe('upload');
    expect(params).toEqual({ album: 3 });
    expect((options.form as FormData).get('title')).toBe('cat');
    expect(((options.form as FormData).get('photo') as File).name).toBe('cat.png');
    // data-params travel as form fields (non-strings as JSON).
    expect((options.form as FormData).get('album')).toBe('3');
    detach();
  });
});

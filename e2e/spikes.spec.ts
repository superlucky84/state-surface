import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parseSync } from 'oxc-parser';
import { transformWithEsbuild } from 'vite';
import { h } from 'lithent';
import { renderToString } from 'lithent/ssr';

const require = createRequire(import.meta.url);

test('SSR attributes round-trip JSON and markup payloads in Chromium', async ({ page }) => {
  const params = { mode: 'full', query: 'a"b<c>d&e' };
  const title = '\" onmouseover="alert(1)"><script>alert(1)</script>';
  const html = renderToString(h('button', { title, 'data-params': JSON.stringify(params) }));
  await page.setContent(html);
  const button = page.locator('button');
  await expect(button).toHaveCount(1);
  await expect(button).toHaveAttribute('title', title);
  expect(await button.evaluate(node => node.getAttributeNames().sort())).toEqual([
    'data-params',
    'title',
  ]);
  expect(JSON.parse((await button.getAttribute('data-params'))!)).toEqual(params);
  await expect(page.locator('script')).toHaveCount(0);
});

test('namespaced JSX survives oxc, esbuild and Lithent component props', async () => {
  const source = 'export default <Widget client:visible server:defer />;';
  const parsed = parseSync('probe.tsx', source);
  expect(parsed.errors).toEqual([]);
  const attribute = (parsed.program.body[0] as any).declaration.openingElement.attributes[0];
  expect(attribute.name.type).toBe('JSXNamespacedName');
  const result = await transformWithEsbuild(source, 'probe.tsx', {
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  });
  expect(result.code).toContain('"client:visible"');
  // Execute the transformed call, not just a string search.
  let received: Record<string, unknown> = {};
  const Widget = (props: Record<string, unknown>) => {
    received = props;
    return h('span', {}, 'probe');
  };
  const tree = new Function('h', 'Widget', result.code.replace('export default', 'return'))(
    h,
    Widget
  );
  expect(renderToString(tree)).toContain('probe');
  expect(received['client:visible']).toBe(true);
  expect(received['server:defer']).toBe(true);
});

async function modules(page: import('@playwright/test').Page) {
  const esmPath = (name: string) => require.resolve(name).replace(/(?:\.umd\.js|\.cjs)$/, '.mjs');
  const lithent = await readFile(esmPath('lithent'), 'utf8');
  const ssr = (await readFile(esmPath('lithent/ssr'), 'utf8')).replace(
    'from "lithent"',
    'from "/probe/lithent.js"'
  );
  const idiomorph = await readFile(
    require.resolve('idiomorph').replace('idiomorph.cjs.js', 'idiomorph.esm.js'),
    'utf8'
  );
  const sources: Record<string, string> = {
    '/probe/lithent.js': lithent,
    '/probe/ssr.js': ssr,
    '/probe/idiomorph.js': idiomorph,
  };
  await page.route('**/probe/*.js', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: sources[new URL(route.request().url()).pathname],
    })
  );
  await page.goto('./');
}

test('characterize installed Lithent hydration resetting edited value and selection', async ({
  page,
}, info) => {
  await modules(page);
  const result = await page.evaluate(async () => {
    // Runtime-only browser module imports are deliberately outside TypeScript resolution.
    const { h } = await import(/* @vite-ignore */ '/probe/lithent.js');
    const { hydration, renderToString } = await import(/* @vite-ignore */ '/probe/ssr.js');
    const root = document.createElement('div');
    document.body.append(root);
    root.innerHTML = renderToString(h('input', { value: 'snapshot' }));
    const input = root.querySelector('input')!;
    input.value = 'user edited';
    input.focus();
    input.setSelectionRange(2, 5);
    const cleanup = hydration(h('input', { value: 'snapshot' }), root);
    const observation = {
      value: input.value,
      selection: [input.selectionStart, input.selectionEnd],
      sameNode: root.querySelector('input') === input,
      focused: document.activeElement === input,
    };
    cleanup();
    root.remove();
    return observation;
  });
  await info.attach('hydration-observation', {
    body: JSON.stringify(result),
    contentType: 'application/json',
  });
  // Baseline observation, not V-04 compliance: stage 5 must preserve the user's edit.
  expect(result).toEqual({ value: 'snapshot', selection: [8, 8], sameNode: true, focused: true });
});

test('characterize Chromium moveBefore preserving iframe and focus but resetting selection', async ({
  page,
}, info) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const from = document.createElement('div');
    const to = document.createElement('div');
    document.body.append(from, to);
    const input = document.createElement('input');
    from.append(input);
    input.value = 'edited';
    input.focus();
    input.setSelectionRange(1, 3);
    const frame = document.createElement('iframe');
    const loaded = new Promise(resolve => (frame.onload = resolve));
    frame.srcdoc = '<p>persistent frame</p>';
    from.append(frame);
    await loaded;
    input.focus();
    input.setSelectionRange(1, 3);
    const original = frame.contentDocument;
    const supported = typeof (to as any).moveBefore === 'function';
    if (supported) {
      (to as any).moveBefore(input, null);
      (to as any).moveBefore(frame, null);
    }
    const observation = {
      supported,
      sameDocument: frame.contentDocument === original,
      focused: document.activeElement === input,
      selection: [input.selectionStart, input.selectionEnd],
    };
    from.remove();
    to.remove();
    return observation;
  });
  await info.attach('moveBefore-observation', {
    body: JSON.stringify(result),
    contentType: 'application/json',
  });
  // Stage 6 must snapshot/restore selection around connected moves.
  expect(result).toEqual({ supported: true, sameDocument: true, focused: true, selection: [0, 0] });
});

test('idiomorph callback excludes island descendants while sibling content updates', async ({
  page,
}) => {
  await modules(page);
  const result = await page.evaluate(async () => {
    const { Idiomorph } = await import(/* @vite-ignore */ '/probe/idiomorph.js');
    const root = document.createElement('div');
    root.innerHTML =
      '<section id="island" data-island><input value="snapshot"></section><p id="sibling">before</p>';
    document.body.append(root);
    const input = root.querySelector('input')!;
    input.value = 'edited';
    Idiomorph.morph(
      root,
      '<section id="island" data-island><input value="changed"></section><p id="sibling">after</p>',
      {
        morphStyle: 'innerHTML',
        callbacks: {
          beforeNodeMorphed: (old: Element) =>
            !(old instanceof Element && old.hasAttribute('data-island')),
        },
      }
    );
    const observation = {
      sameNode: root.querySelector('input') === input,
      value: input.value,
      sibling: root.querySelector('#sibling')!.textContent,
    };
    root.remove();
    return observation;
  });
  expect(result).toEqual({ sameNode: true, value: 'edited', sibling: 'after' });
});

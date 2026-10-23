import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeDocument } from './normalize.mjs';
import { startServer } from '../perf/server.mjs';

/**
 * Semantic SSR parity with the stage 1 demo snapshot (`conformance/stage1-demo.json`,
 * captured from the production build at c82b92c before the page/slot pipeline).
 *
 * Allowed differences (IMPLEMENT stage 2 Exit): doctype spelling, comment markers,
 * position of engine-managed tags (stylesheets, bootstrap JSON, entry script), the
 * entry asset hash and nonce, the `data-component` slot attribute, `__BOOT__` as an array of
 * entries, (stage 3) modulepreload links and the per-page `__PLUGINS__` list, and (stage 4) the
 * single `__SURFACE__` bootstrap without server slot props plus transition streams projected
 * to per-slot ops, and (stage 5) the new actions demo sections (`actions:likes` with its
 * `useAction` island and the JS-less `actions:comments` form). Element structure, attributes,
 * text, base path, boot entries and rendered slots must match; each transition must touch the
 * same slots frame by frame.
 *
 * Stage 7 (DC-24, DC-25): languages are URL paths, so `/x` with the `lang=ko` cookie is now
 * `/ko/x` and `/x` is `/en/x`. The header is a static slot with language links (compared
 * without it, and transitions no longer send it), hrefs and redirect targets carry the
 * language, actions send `lang` (a param or a hidden field), `<html lang>` follows the page
 * and hreflang links join the head. The home page and guides are rewritten content (DC-25 ⑥:
 * guides on the 2.0 API, home concepts corrected) and their boot transitions are gone, so they
 * are not compared; neither are `switch-lang` and `guide-load`, which were removed.
 *
 * Stage 10: the documentation audit corrected explanatory texts that described the engine
 * wrongly (`CORRECTED_TEXT`, old → new, applied to the snapshot). The site redesign changed
 * the presentation, so the documents are compared by behavior: in `<main>`, the sequence of
 * texts, links, forms, fields, buttons, images, slots and islands with their attributes.
 * Presentation is ignored: element nesting and other tags, `class`/`style`, decorative SVG
 * and `aria-hidden` nodes, and symbol-only text (arrows). Head, header and footer are layout
 * chrome; the bootstrap (slots, boot entries, base path) and the entry script still compare.
 */

/** Stage 10 documentation audit: explanatory texts corrected since the stage 1 snapshot. */
const CORRECTED_TEXT = new Map([
  [
    'Click a card to see the element morph smoothly into a detail view via view-transition-name. Press back for reverse morphing.',
    'Click a card to see the element morph smoothly into a detail view via view-transition-name. Press "Back to Gallery" for the reverse morph.',
  ],
  [
    '카드를 클릭하면 view-transition-name으로 연결된 요소가 상세 뷰로 부드럽게 모핑됩니다. 뒤로가기를 누르면 역방향 모핑이 일어납니다.',
    "카드를 클릭하면 view-transition-name으로 연결된 요소가 상세 뷰로 부드럽게 모핑됩니다. '갤러리로 돌아가기'를 누르면 역방향 모핑이 일어납니다.",
  ],
  [
    'Change the appearance of h-state elements using classAdd, classRemove, and cssVars without re-rendering templates.',
    'Change the appearance of h-state elements with classAdd, classRemove and cssVars. A UI patch itself does not re-render the template.',
  ],
  [
    'Sends only a UI patch without state changes. The template is not re-rendered.',
    'Starts with a full frame (every stream does: it renders the card again and clears its patch), then sends a UI-only partial frame that changes just the h-state element, without rendering.',
  ],
  [
    'classAdd/classRemove/cssVars를 사용하여 h-state 엘리먼트의 외형을 변경할 수 있습니다.',
    'classAdd/classRemove/cssVars로 h-state 엘리먼트의 외형을 바꿉니다 — UI 패치 자체는 템플릿을 다시 렌더링하지 않습니다.',
  ],
  [
    '상태 변경 없이 오직 UI 패치만을 전송합니다. 템플릿은 재렌더되지 않습니다.',
    '먼저 full 프레임(모든 스트림의 첫 프레임: 카드를 다시 렌더하고 패치를 지움)을 보낸 뒤, 렌더링 없이 h-state 엘리먼트만 바꾸는 UI 전용 partial 프레임을 보냅니다.',
  ],
]);

/** Stage 5 additions to the actions page, removed from the current tree before comparing. */
const STAGE5_SLOTS = new Set(['actions:likes', 'actions:comments']);
const slotName = node => node[0] === 'h-state' && node[1]?.find(([key]) => key === 'name')?.[1];
const addedInStage5 = node =>
  Array.isArray(node) &&
  (STAGE5_SLOTS.has(slotName(node)) ||
    (node[0] === 'section' && (node[2] ?? []).some(child => STAGE5_SLOTS.has(slotName(child)))));
const withoutStage5 = node =>
  Array.isArray(node) && Array.isArray(node[2])
    ? [node[0], node[1], node[2].filter(child => !addedInStage5(child)).map(withoutStage5)]
    : node;

/** Stage 1 state frame → [kind, slots]; stage 4 patch → [kind, slots] (UI resets ignored). */
const stage1Shape = frame =>
  frame.type !== 'state'
    ? [frame.type, []]
    : [
        frame.full === false ? 'partial' : 'full',
        [
          ...new Set([...(frame.changed ?? Object.keys(frame.states)), ...(frame.removed ?? [])]),
        ].sort(),
      ];
const stage4Shape = frame =>
  frame.type !== 'patch'
    ? [frame.type, []]
    : [
        frame.reset ? 'full' : 'partial',
        [
          ...new Set(frame.ops.filter(op => !('ui' in op && op.ui === null)).map(op => op.slot)),
        ].sort(),
      ];
const pageOf = { search: '[lang]/examples/search' };
/** Stage 7: rewritten or removed (see above). */
const NOT_COMPARED = new Set(['/', '/guide/quickstart', '/guide/surface']);
const REMOVED_TRANSITIONS = new Set(['switch-lang', 'guide-load']);
/** Static since stage 7: not in the bootstrap slot list. */
const STATIC_SLOTS = new Set(['page:header', 'examples:list']);

/** Stage 7 normalization, applied to both trees (see the allowed differences above). */
const stage7 = (node, base) => {
  if (typeof node === 'string') return CORRECTED_TEXT.get(node) ?? node;
  if (!Array.isArray(node)) return node;
  const [tag, attributes, children] = node;
  if (slotName(node) === 'page:header') return undefined;
  if (tag === 'link' && attributes.some(([key, value]) => key === 'rel' && value === 'alternate'))
    return undefined;
  if (
    tag === 'input' &&
    attributes.some(([key, value]) => key === 'name' && value === 'lang') &&
    attributes.some(([key, value]) => key === 'type' && value === 'hidden')
  )
    return undefined;
  const unprefix = value =>
    value.startsWith(base + '/')
      ? base + value.slice(base.length).replace(/^\/(?:en|ko)(?=\/|$)/, '') || base + '/'
      : value;
  const fixed = attributes
    .filter(([key]) => !(tag === 'html' && key === 'lang'))
    .map(([key, value]) => {
      if (key === 'href') return [key, unprefix(value)];
      if (key === 'value' && attributes.some(([k, v]) => k === 'name' && v === '_redirect'))
        return [key, unprefix(value)];
      if (key === 'data-params') {
        const params = JSON.parse(value);
        delete params.lang;
        return [key, JSON.stringify(params)];
      }
      return [key, value];
    });
  return [
    tag,
    fixed,
    (children ?? []).map(child => stage7(child, base)).filter(child => child !== undefined),
  ];
};
/** Elements that carry behavior; every other element only groups or styles its children. */
const BEHAVIOR = new Set([
  'a',
  'button',
  'form',
  'input',
  'textarea',
  'select',
  'option',
  'img',
  'iframe',
  'details',
  'summary',
  'h-state',
  'h-island',
]);
const PRESENTATION = new Set(['class', 'style']);
/** Stage 10 redesign: the behavior of a document part, in document order (see above). */
const behavior = (node, out = []) => {
  if (typeof node === 'string') {
    if (/[\p{L}\p{N}]/u.test(node)) out.push(node);
    return out;
  }
  if (!Array.isArray(node)) return out;
  const [tag, attributes, children] = node;
  if (tag === 'svg' || attributes.some(([key, value]) => key === 'aria-hidden' && value === 'true'))
    return out;
  if (BEHAVIOR.has(tag)) out.push([tag, attributes.filter(([key]) => !PRESENTATION.has(key))]);
  for (const child of children ?? []) behavior(child, out);
  return out;
};
const mainOf = node =>
  Array.isArray(node)
    ? node[0] === 'main'
      ? node
      : (node[2] ?? []).map(mainOf).find(Boolean)
    : undefined;

const snapshot = JSON.parse(await readFile(new URL('./stage1-demo.json', import.meta.url), 'utf8'));
const server = await startServer(3301);
let pages = 0;
try {
  for (const [variant, lang] of [
    ['pages', 'en'],
    ['ko', 'ko'],
  ]) {
    for (const [path, expected] of Object.entries(snapshot[variant])) {
      if (NOT_COMPARED.has(path)) continue;
      const response = await fetch(server.origin + `/${lang}${path}`);
      assert.equal(response.status, expected.status, `${variant} ${path} status`);
      const html = await response.text();
      if (expected.status !== 200) continue;
      const actual = normalizeDocument(html);
      const baseline = normalizeDocument(expected.html);
      assert.equal(actual.json.basePath, baseline.json.basePath, `${variant} ${path}: base path`);
      assert.deepEqual(actual.json.boot, baseline.json.boot, `${variant} ${path}: boot`);
      // Stage 1 listed slots that had state; stage 4 lists every rendered slot (empty ones too).
      for (const slot of baseline.json.slots ?? [])
        if (!STATIC_SLOTS.has(slot))
          assert.ok(actual.json.slots?.includes(slot), `${variant} ${path}: slot ${slot}`);
      const main = mainOf(stage7(withoutStage5(actual.tree), actual.json.basePath));
      assert.ok(main, `${variant} ${path}: <main>`);
      assert.deepEqual(
        behavior(main),
        behavior(mainOf(stage7(baseline.tree, baseline.json.basePath))),
        `${variant} ${path}: <main> behavior`
      );
      assert.equal(actual.styles.length, baseline.styles.length, `${variant} ${path}: styles`);
      assert.equal(actual.entry, baseline.entry, `${variant} ${path}: entry script`);
      pages++;
    }
  }
  const home = await (await fetch(server.origin + '/en')).text();
  const buildId = JSON.parse(home.match(/id="__SURFACE__"[^>]*>(.*?)<\/script>/)[1]).buildId;
  let streams = 0;
  for (const [name, expected] of Object.entries(snapshot.transitions)) {
    if (REMOVED_TRANSITIONS.has(name)) continue;
    streams++;
    const response = await fetch(`${server.origin}/transition/${name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: server.origin,
        'x-surface-build': buildId,
        'x-surface-page': pageOf[name],
      },
      body: JSON.stringify({ ...expected.body, lang: 'en' }),
    });
    assert.equal(response.status, expected.status, name);
    assert.deepEqual(
      (await response.text()).trim().split('\n').map(JSON.parse).map(stage4Shape),
      expected.frames
        .map(stage1Shape)
        .map(([kind, slots]) => [kind, slots.filter(slot => slot !== 'page:header')]),
      name
    );
  }
  console.log(
    `Stage 1 parity: ${pages} SSR documents (en + ko) and ` +
      `${streams} transition stream${streams === 1 ? '' : 's'} match semantically`
  );
} finally {
  await server.stop();
}

import type { Lang } from './i18n.js';
import { prefixPath } from './basePath.js';

// ── Bilingual text helper ──

type I18nText = { ko: string; en: string };
type I18nObj<T> = { ko: T; en: T };

function t(text: I18nText, lang: Lang): string {
  return text[lang];
}

function tObj<T>(obj: I18nObj<T>, lang: Lang): T {
  return obj[lang];
}

// ── Home page ──

export function homeContent(lang: Lang) {
  return {
    'page:header': { title: 'StateSurface', nav: 'home', lang },
    'page:hero': {
      badge: t({ ko: '상태-레이아웃 매핑 런타임', en: 'State-Layout Mapping Runtime' }, lang),
      title: 'StateSurface',
      description: t(
        {
          ko: '서버가 상태를 소유하고, 클라이언트가 DOM 프로젝션을 담당합니다. 페이지는 MPA, 페이지 내 업데이트는 NDJSON 상태 스트림으로 전달됩니다. Surface, Template, Transition, Action을 정의하면 엔진이 나머지를 처리합니다.',
          en: 'Server owns state. Client owns DOM projection. Pages are MPA, in-page updates come from NDJSON state streams. Define surfaces, templates, transitions, and actions — the engine handles the rest.',
        },
        lang
      ),
      primaryLabel: t({ ko: '10분 퀵스타트', en: '10-Min Quickstart' }, lang),
      primaryHref: prefixPath('/guide/quickstart'),
      secondaryLabel: t({ ko: '스트리밍 데모', en: 'Try Streaming Demo' }, lang),
      secondaryHref: prefixPath('/features/streaming'),
    },
    'page:concepts': {
      concepts: [
        {
          key: 'surface',
          title: 'Surface',
          description: t(
            {
              ko: '페이지 셸을 <h-state> 앵커와 함께 순수 HTML 문자열로 선언합니다. Surface는 구조를 정의하며, 비즈니스 콘텐츠는 포함하지 않습니다.',
              en: 'Page shell with <h-state> anchors declared as plain HTML strings. Surfaces define structure — slots and layout, no business content.',
            },
            lang
          ),
          href: prefixPath('/guide/surface'),
        },
        {
          key: 'template',
          title: 'Template',
          description: t(
            {
              ko: '각 <h-state> 앵커 안에서 렌더링되는 TSX 프로젝션 컴포넌트입니다. 기본적으로 무상태이며, 서버 상태가 모든 콘텐츠를 결정합니다.',
              en: 'TSX projection components that render inside each <h-state> anchor. Templates are stateless by default — server state drives all content.',
            },
            lang
          ),
          href: prefixPath('/guide/template'),
        },
        {
          key: 'transition',
          title: 'Transition',
          description: t(
            {
              ko: '서버 측 async generator가 상태 프레임을 yield합니다. Full 프레임은 전체 UI 상태를 선언하고, Partial 프레임은 변경사항을 점진적으로 병합합니다.',
              en: 'Server-side async generators that yield state frames. Full frames declare complete UI state; partial frames merge changes progressively.',
            },
            lang
          ),
          href: prefixPath('/guide/transition'),
        },
        {
          key: 'action',
          title: 'Action',
          description: t(
            {
              ko: 'data-action 속성을 통한 선언적 트리거. 사용자 코드에 JS 이벤트 바인딩이 필요 없으며, 엔진이 위임, pending 상태, abort를 처리합니다.',
              en: 'Declarative triggers via data-action attributes. No JS event wiring in user code — the engine handles delegation, pending states, and abort.',
            },
            lang
          ),
          href: prefixPath('/guide/action'),
        },
      ],
    },
    'page:features': {
      features: [
        {
          title: t({ ko: '스트리밍 데모', en: 'Streaming Demo' }, lang),
          description: t(
            {
              ko: 'Full/Partial 프레임, removed 키, error 프레임을 실시간으로 확인하세요.',
              en: 'Watch full/partial frames, removed keys, and error frames in real time.',
            },
            lang
          ),
          href: prefixPath('/features/streaming'),
        },
        {
          title: t({ ko: '액션 플레이그라운드', en: 'Actions Playground' }, lang),
          description: t(
            {
              ko: '버튼 액션, 폼 제출, 스코프드 pending, 다중 액션을 체험하세요.',
              en: 'Try button actions, form submissions, scoped pending, and multiple actions.',
            },
            lang
          ),
          href: prefixPath('/features/actions'),
        },
        {
          title: t({ ko: '검색', en: 'Search' }, lang),
          description: t(
            {
              ko: '폼 기반 액션으로 StateSurface 기능과 개념을 검색하세요.',
              en: 'Search StateSurface features and concepts with form-based actions.',
            },
            lang
          ),
          href: prefixPath('/search'),
        },
      ],
    },
  };
}

// ── Guide page ──

export type ParagraphBlock = { type: 'paragraph'; text: string };
export type BulletsBlock = { type: 'bullets'; items: string[] };
export type CodeBlock = { type: 'code'; lang?: string; label?: string; text: string };
export type ChecklistBlock = { type: 'checklist'; items: string[] };
export type WarningBlock = { type: 'warning'; text: string };
export type SequenceBlock = { type: 'sequence'; steps: string[] };
export type DiagramBlock = { type: 'diagram'; text: string; label?: string };
export type CalloutBlock = { type: 'callout'; kind: 'tip' | 'info' | 'note'; text: string };
export type AnalogyBlock = { type: 'analogy'; text: string };
export type DebugItem = { symptom: string; cause: string; fix: string };
export type DebugBlock = { type: 'debug'; items: DebugItem[] };
export type Block =
  | ParagraphBlock
  | BulletsBlock
  | CodeBlock
  | ChecklistBlock
  | WarningBlock
  | SequenceBlock
  | DiagramBlock
  | CalloutBlock
  | AnalogyBlock
  | DebugBlock;

type GuideSection = { id: string; heading: string; blocks: Block[] };
type GuideEntry = { title: string; demoHref: string; demoLabel: string; sections: GuideSection[] };

const GUIDE_DATA: I18nObj<Record<string, GuideEntry>> = {
  en: {
    surface: {
      title: 'Surface',
      demoHref: '/features/streaming',
      demoLabel: 'Streaming Demo',
      sections: [
        {
          id: 'tldr',
          heading: 'TL;DR',
          blocks: [
            {
              type: 'paragraph',
              text: 'A surface is the fixed page shell — 7 lines of HTML strings to declare 3 independent panels. Traditional approach needs 27+ lines with component imports, state hooks, and hidden re-render bugs. Surfaces define where dynamic content appears, not what it contains.',
            },
          ],
        },
        {
          id: 'analogy',
          heading: 'Mental model',
          blocks: [
            {
              type: 'analogy',
              text: 'Think of a Surface as the building skeleton before interior work — it defines the room layout and where the power outlets are drilled. The <h-state> tags are the outlets. Templates are the appliances you plug in. The wall positions never change; what you plug in can change any time.',
            },
            {
              type: 'paragraph',
              text: 'Why "Surface"? The name refers to the visible surface of a page — structure without content. Unlike an SPA where a JS bundle paints the whole page, StateSurface pre-renders a real HTML surface with named holes. Templates fill the holes; the surface itself stays constant.',
            },
            {
              type: 'callout',
              kind: 'note',
              text: 'Why a plain HTML string instead of JSX? The surface never changes during a page visit — no Virtual DOM diffing needed. String concatenation is the fastest and simplest way to SSR static structure.',
            },
          ],
        },
        {
          id: 'when',
          heading: 'When to use',
          blocks: [
            {
              type: 'bullets',
              items: [
                'Use for every route: layout, navigation, footer, and <h-state> anchor placement.',
                'Use for content that does NOT change while the user stays on the page.',
                "Don't use for conditionally-updating content — that belongs in a Template.",
              ],
            },
          ],
        },
        {
          id: 'steps',
          heading: 'Step-by-step',
          blocks: [
            {
              type: 'sequence',
              steps: [
                'Create routes/my-page.ts and export a RouteModule.',
                'Import baseSurface, stateSlots, joinSurface from layouts/surface.js.',
                "Define layout: stateScript => string — call stateSlots('slot-name') for each dynamic anchor.",
                'Wrap the assembled body with baseSurface(body, stateScript).',
                'Add a matching Template file for each slot name you declared.',
              ],
            },
          ],
        },
        {
          id: 'example',
          heading: 'Minimal example',
          blocks: [
            {
              type: 'code',
              lang: 'typescript',
              label: '✓ StateSurface — 7 lines',
              text: `// routes/dashboard.ts — Stock dashboard with 3 independent panels
import type { RouteModule } from '../shared/routeModule.js';
import { baseSurface, joinSurface, stateSlots } from '../layouts/surface.js';

export default {
  layout: stateScript => baseSurface(joinSurface(
    '<main class="grid grid-cols-3 gap-4 max-w-6xl mx-auto p-6">',
    stateSlots('stock:price', 'stock:news', 'stock:chart'),
    '</main>',
  ), stateScript),
  transition: 'dashboard-load',
} satisfies RouteModule;`,
            },
            {
              type: 'callout',
              kind: 'info',
              text: 'Invisible Power — what these 7 lines do automatically:\n✓ Each panel updates independently — other panels never re-render\n✓ Adding a new panel = 1 line in stateSlots + 1 template file\n✓ The surface itself never changes during a page visit\n✓ SSR delivers complete HTML — no client-side layout assembly\n✓ Hydration is per-anchor, not full-page',
            },
            {
              type: 'code',
              lang: 'tsx',
              label: '✗ Traditional approach — 27 lines, 2 hidden issues',
              text: `// React-style dashboard — each panel manages its own data
import { useState, useEffect } from 'react';
import { StockPrice } from './StockPrice';
import { StockNews } from './StockNews';
import { StockChart } from './StockChart';

function Dashboard() {
  const [priceData, setPriceData] = useState(null);
  const [newsData, setNewsData] = useState(null);
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    fetchPrice().then(setPriceData);
  }, []);
  useEffect(() => {
    fetchNews().then(setNewsData);
  }, []);
  useEffect(() => {
    fetchChart().then(setChartData);
    // ⚠️ BUG: No cleanup — stale setState calls after unmount
  }, []);

  // ⚠️ BUG: Parent re-renders when ANY child state changes
  // All 3 panels re-render even when only price updated
  return (
    <div className="grid grid-cols-3 gap-4">
      <StockPrice data={priceData} loading={!priceData} />
      <StockNews data={newsData} loading={!newsData} />
      <StockChart data={chartData} loading={!chartData} />
    </div>
  );
}
// + 3 child component files, each with their own fetch logic`,
            },
          ],
        },
        {
          id: 'sequence',
          heading: 'Execution sequence',
          blocks: [
            {
              type: 'sequence',
              steps: [
                'GET /my-page — server resolves initial state.',
                'layout(stateScript) renders the full HTML shell string.',
                'SSR fills each <h-state> anchor with initial template output.',
                'Browser renders the complete HTML page (MPA).',
                'Client hydrates each <h-state> anchor independently.',
              ],
            },
          ],
        },
        {
          id: 'mistakes',
          heading: 'Common mistakes',
          blocks: [
            {
              type: 'warning',
              text: 'Hardcoding dynamic content in the surface string is the most common mistake. If the content might change while the user stays on the page, it needs an <h-state> anchor and a Template.',
            },
            {
              type: 'checklist',
              items: [
                '<h-state name="..."> attribute matches the template registry key exactly.',
                'stateScript parameter is passed into baseSurface(body, stateScript).',
                'stateSlots() called for every anchor you plan to use.',
                'All conditionally-changing data is in templates, not the surface string.',
              ],
            },
          ],
        },
        {
          id: 'debug',
          heading: 'Troubleshooting',
          blocks: [
            {
              type: 'debug',
              items: [
                {
                  symptom: 'The page loads but the anchor area is completely empty.',
                  cause: 'The slot name in stateSlots() does not match the name in defineTemplate().',
                  fix: 'Compare <h-state name="..."> value with the first argument of defineTemplate("..."). They must be character-for-character identical including the colon.',
                },
                {
                  symptom: 'Tailwind styles are applied in dev but break in production.',
                  cause: 'Tailwind purges classes it cannot detect in surface string templates at build time.',
                  fix: "Add the surface file pattern to tailwind.config content array (e.g. './routes/**/*.ts') or use safelist for dynamic class strings.",
                },
                {
                  symptom: 'Anchor content flashes on first load.',
                  cause: 'SSR hash mismatch — the server-rendered HTML differs from the client hydration output.',
                  fix: 'Ensure the template renders identically server-side and client-side. Avoid window/document references at render time; move them inside mount().',
                },
              ],
            },
          ],
        },
        {
          id: 'next',
          heading: 'Next: try it live',
          blocks: [
            {
              type: 'paragraph',
              text: 'Open the Streaming Demo to watch multiple <h-state> anchors update independently in real time — full frames replace all anchors, partial frames patch only changed ones.',
            },
          ],
        },
      ],
    },
    template: {
      title: 'Template',
      demoHref: '/features/actions',
      demoLabel: 'Actions Playground',
      sections: [
        {
          id: 'tldr',
          heading: 'TL;DR',
          blocks: [
            {
              type: 'paragraph',
              text: 'A template is a stateless TSX function — 12 lines. No useState, no useEffect, no fetch. Traditional approach: 38 lines with 3 hidden bugs (race conditions, stale state, abort handling). The server sends data; you render it.',
            },
          ],
        },
        {
          id: 'analogy',
          heading: 'Mental model',
          blocks: [
            {
              type: 'analogy',
              text: 'Think of a Template like a React component — except the server decides the props, not the component itself. There is no useState for server data, no useEffect to fetch, no context provider. The server sends what to render; the template just renders it.',
            },
            {
              type: 'paragraph',
              text: 'Why "Template"? The name refers to a rendering template — a mold that shapes data into HTML. StateSurface templates are pure projections: given specific props, they always produce the same output. SSR and CSR use the exact same function; the only difference is output format (string vs DOM patch).',
            },
            {
              type: 'callout',
              kind: 'tip',
              text: 'The loading prop pattern: have the transition yield { loading: true } in the first frame to show a skeleton, then yield actual data in the second frame to show content. The server controls loading UX timing completely.',
            },
          ],
        },
        {
          id: 'when',
          heading: 'When to use',
          blocks: [
            {
              type: 'bullets',
              items: [
                'Use for every <h-state> anchor that needs visual content.',
                'Use for anything driven by server data: loading states, content, errors.',
                "Don't use for content that never changes per-user — put it in the surface.",
                "Don't store server-driven data in local state — use props only.",
              ],
            },
          ],
        },
        {
          id: 'steps',
          heading: 'Step-by-step',
          blocks: [
            {
              type: 'sequence',
              steps: [
                'Create routes/my-page/templates/myContent.tsx.',
                'Import defineTemplate from shared/templateRegistry.js.',
                'Define props type matching the data your transition sends in states.',
                'Write a pure stateless function component.',
                "Export: export default defineTemplate('slot-name', Component) — name must match <h-state name>.",
              ],
            },
          ],
        },
        {
          id: 'example',
          heading: 'Minimal example',
          blocks: [
            {
              type: 'code',
              lang: 'tsx',
              label: '✓ StateSurface — 12 lines',
              text: `// routes/dashboard/templates/stockPrice.tsx
import { defineTemplate } from '../../../shared/templateRegistry.js';

type Props = { symbol: string; price: number; change: number; loading?: boolean };

const StockPrice = ({ symbol, price, change, loading }: Props) => {
  if (loading) return <div class="animate-pulse h-20 bg-slate-100 rounded-xl" />;
  return (
    <div class="rounded-xl border p-4">
      <span class="text-sm text-slate-500">{symbol}</span>
      <p class="text-2xl font-bold">\${price.toFixed(2)}</p>
      <span class={change > 0 ? 'text-green-600' : 'text-red-600'}>
        {change > 0 ? '+' : ''}{change.toFixed(2)}%
      </span>
    </div>
  );
};

export default defineTemplate('stock:price', StockPrice);`,
            },
            {
              type: 'callout',
              kind: 'info',
              text: 'Invisible Power — what this stateless function gets for free:\n✓ No useState — the server sends data via state frames\n✓ No useEffect — no client-side fetch needed\n✓ No AbortController — the engine auto-aborts previous requests\n✓ SSR and CSR use the same function — the engine decides output format\n✓ Re-renders only when this specific anchor receives new data',
            },
            {
              type: 'code',
              lang: 'tsx',
              label: '✗ Traditional approach — 38 lines, 3 hidden bugs',
              text: `// React-style stock price component
import { useState, useEffect, useRef } from 'react';

function StockPrice({ symbol }: { symbol: string }) {
  const [data, setData] = useState<{ price: number; change: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    fetch(\`/api/stock/\${symbol}\`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => {
        if (e.name === 'AbortError') return;
        // ⚠️ BUG: setState after unmount if component removed during fetch
        setError(e.message);
        setLoading(false);
      });

    return () => controller.abort();
    // ⚠️ BUG: AbortError shown briefly as error on fast symbol switches
  }, [symbol]);

  if (loading) return <div className="animate-pulse h-20 bg-slate-100 rounded-xl" />;
  if (error) return <div className="text-red-600">{error}</div>;
  // ⚠️ BUG: Race condition — fast symbol changes can show stale data
  return (
    <div className="rounded-xl border p-4">
      <span className="text-sm text-slate-500">{symbol}</span>
      <p className="text-2xl font-bold">\${data!.price.toFixed(2)}</p>
      <span className={data!.change > 0 ? 'text-green-600' : 'text-red-600'}>
        {data!.change > 0 ? '+' : ''}{data!.change.toFixed(2)}%
      </span>
    </div>
  );
}`,
            },
          ],
        },
        {
          id: 'sequence',
          heading: 'Execution sequence',
          blocks: [
            {
              type: 'sequence',
              steps: [
                "Server yields frame: states: { 'page:content': { title, items } }.",
                "Client looks up 'page:content' in the template registry.",
                'Template function is called with props from the frame data.',
                'Lithent diffs the result against current DOM inside the anchor.',
                'Only changed nodes are patched inside <h-state name="page:content">.',
              ],
            },
          ],
        },
        {
          id: 'mistakes',
          heading: 'Common mistakes',
          blocks: [
            {
              type: 'warning',
              text: 'The name in defineTemplate(\'name\', ...) must exactly match the <h-state name="..."> attribute. A mismatch silently skips the render — no error is thrown.',
            },
            {
              type: 'checklist',
              items: [
                'File is under routes/**/templates/*.tsx (auto-discovery path).',
                "defineTemplate('name', ...) name matches <h-state name=\"...\"> exactly.",
                'Props type matches what the transition sends in states.',
                'Lists use key prop to prevent incorrect diffing.',
                'No server-driven data stored in local state.',
              ],
            },
          ],
        },
        {
          id: 'debug',
          heading: 'Troubleshooting',
          blocks: [
            {
              type: 'debug',
              items: [
                {
                  symptom: 'Clicking a button does nothing — the anchor never re-renders.',
                  cause: "The name in defineTemplate('name', ...) does not match the <h-state name=\"...\"> attribute.",
                  fix: 'Copy the exact string from <h-state name="..."> and paste it as the first argument to defineTemplate. Check for typos, missing colons, or case mismatches.',
                },
                {
                  symptom: 'Content renders on the first load but breaks after a transition.',
                  cause: 'Props type mismatch — the transition sends different shape data than the template expects.',
                  fix: 'Align the TypeScript type in the template with exactly what the transition yields in states. Add console.log(props) inside the template to inspect received data.',
                },
                {
                  symptom: 'Hydration error in the browser console.',
                  cause: 'The SSR output and CSR output differ — usually caused by using Date.now(), Math.random(), or window inside the render function.',
                  fix: 'Move any client-only logic (window, document, random values) inside mount() so it runs only after hydration, not during render.',
                },
              ],
            },
          ],
        },
        {
          id: 'next',
          heading: 'Next: try it live',
          blocks: [
            {
              type: 'paragraph',
              text: 'Go to the Actions Playground to see templates re-rendered by user interactions — button clicks and form submissions drive template updates through the full action → transition → frame → DOM pipeline.',
            },
          ],
        },
      ],
    },
    transition: {
      title: 'Transition',
      demoHref: '/features/streaming',
      demoLabel: 'Streaming Demo',
      sections: [
        {
          id: 'tldr',
          heading: 'TL;DR',
          blocks: [
            {
              type: 'paragraph',
              text: "A transition is a server-side async function* — 18 lines for a 3-stage UX (skeleton → cached → live). Race conditions are structurally impossible. Traditional approach: 35 lines with race condition bugs built in. yield order = UX timeline.",
            },
          ],
        },
        {
          id: 'analogy',
          heading: 'Mental model',
          blocks: [
            {
              type: 'analogy',
              text: 'Think of a Transition like a live subtitle feed for a video. The video (HTML page) stays the same; only the subtitles (UI state) stream in line by line. Each yield sends one JSON line over HTTP — the client applies it to the matching <h-state> anchor immediately.',
            },
            {
              type: 'paragraph',
              text: 'Why "Transition"? It describes the server-side transition from one UI state to another — a sequence of frames that move the page from "loading" to "loaded" to "done". Be aware: this has nothing to do with CSS transitions. If you find the name confusing, think of it as a "StateStream" or "SceneScript".',
            },
            {
              type: 'callout',
              kind: 'info',
              text: 'Why POST instead of GET? State transitions are side effects — they compute and stream data that may depend on session, body params, or external APIs. GET requests are cached and bookmarkable; in-page state updates are neither. POST signals intent: "run this server logic now".',
            },
          ],
        },
        {
          id: 'when',
          heading: 'When to use',
          blocks: [
            {
              type: 'bullets',
              items: [
                'Use for every user action that updates in-page state: data loading, form submission, button click.',
                'Use for progressive rendering: show loading states first, then content.',
                "Don't use for navigation to a different page — use MPA <a href> instead.",
              ],
            },
          ],
        },
        {
          id: 'steps',
          heading: 'Step-by-step',
          blocks: [
            {
              type: 'sequence',
              steps: [
                'Create routes/my-page/transitions/myTransition.ts.',
                'Import defineTransition from server/transition.js and StateFrame from shared/protocol.js.',
                'Write async function*(params): AsyncGenerator<StateFrame>.',
                'First yield must be a full frame (omit full or set full: true) — declares complete UI state.',
                'Use full: false + changed/removed arrays for subsequent partial updates.',
                'End with yield { type: "done" } to close the stream.',
                "Export: export default defineTransition('name', fn).",
              ],
            },
          ],
        },
        {
          id: 'example',
          heading: 'Minimal example',
          blocks: [
            {
              type: 'code',
              lang: 'typescript',
              label: '✓ StateSurface — 18 lines, 3-stage UX',
              text: `// routes/search/transitions/search.ts — skeleton → cached → live
import { defineTransition } from '../../../server/transition.js';
import type { StateFrame } from '../../../shared/protocol.js';

async function* search({ query }: Record<string, unknown>): AsyncGenerator<StateFrame> {
  // Stage 1: loading skeleton
  yield {
    type: 'state',
    states: { 'search:results': { loading: true, items: [], badge: '' } },
  };

  // Stage 2: cached results arrive first
  const cached = await searchCache(String(query));
  yield {
    type: 'state', full: false, changed: ['search:results'],
    states: { 'search:results': { loading: false, items: cached, badge: 'cached' } },
  };

  // Stage 3: live results replace cached
  const live = await searchLive(String(query));
  yield {
    type: 'state', full: false, changed: ['search:results'],
    states: { 'search:results': { loading: false, items: live, badge: 'live' } },
  };

  yield { type: 'done' };
}

export default defineTransition('search', search);`,
            },
            {
              type: 'callout',
              kind: 'info',
              text: 'Invisible Power — what yield order guarantees:\n✓ yield order = UX timeline — skeleton → cached → live, structurally guaranteed\n✓ Race conditions impossible — single stream, server controls order\n✓ Previous request auto-aborted — engine handles concurrency\n✓ Loading indicator — data-pending auto-attached and removed\n✓ No client-side promise coordination needed',
            },
            {
              type: 'code',
              lang: 'tsx',
              label: '✗ Traditional approach — 35 lines, 3 race condition bugs',
              text: `// React-style search with 3-stage UX
import { useState, useEffect, useRef } from 'react';

function SearchResults({ query }: { query: string }) {
  const [items, setItems] = useState([]);
  const [badge, setBadge] = useState('');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!query) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    // ⚠️ BUG: If live resolves before cached, stale cached overwrites live
    searchCache(query).then(cached => {
      if (controller.signal.aborted) return;
      setItems(cached);
      setBadge('cached');
      setLoading(false);
    });

    searchLive(query, controller.signal).then(live => {
      if (controller.signal.aborted) return;
      setItems(live);
      setBadge('live');
    }).catch(e => {
      if (e.name === 'AbortError') return;
      // ⚠️ BUG: Error silently swallowed — user sees stale results
      console.error(e);
    });

    return () => controller.abort();
    // ⚠️ BUG: No guaranteed order — cached and live race each other
  }, [query]);

  if (loading) return <Skeleton />;
  return <ResultList items={items} badge={badge} />;
}`,
            },
          ],
        },
        {
          id: 'sequence',
          heading: 'Execution sequence',
          blocks: [
            {
              type: 'sequence',
              steps: [
                'Client POSTs to /transition/my-transition with JSON params body.',
                'Server starts the async generator, begins streaming NDJSON.',
                'Full frame → client replaces all activeStates, re-renders all templates.',
                'Partial frame → client merges only changed keys, skips unchanged anchors.',
                'done frame → stream closes, data-pending removed from all anchors.',
              ],
            },
          ],
        },
        {
          id: 'mistakes',
          heading: 'Common mistakes',
          blocks: [
            {
              type: 'warning',
              text: 'Every stream must start with a full frame. Yielding a partial frame first (full: false) is a protocol violation — the client will reject the entire stream.',
            },
            {
              type: 'checklist',
              items: [
                'First yielded frame is full (no full: false).',
                'Partial frames include full: false AND at least one of changed/removed.',
                'Keys in changed exist in states; keys in removed do NOT.',
                'No key appears in both changed and removed.',
                'Generator ends with yield { type: "done" }.',
              ],
            },
          ],
        },
        {
          id: 'debug',
          heading: 'Troubleshooting',
          blocks: [
            {
              type: 'debug',
              items: [
                {
                  symptom: 'The client receives the stream but the UI never updates.',
                  cause: 'The first yielded frame has full: false — the client rejects partial-first streams.',
                  fix: "Remove full: false from the first yield, or omit the full field entirely. Full is the default. Only set full: false on frames after the first.",
                },
                {
                  symptom: 'A partial frame fires but the target anchor does not re-render.',
                  cause: 'The changed array is missing or the slot name is misspelled.',
                  fix: "Add changed: ['slot-name'] to the partial frame. The name must exactly match the <h-state name> attribute and the defineTemplate key.",
                },
                {
                  symptom: 'The loading spinner spins forever — the stream never closes.',
                  cause: 'yield { type: "done" } is missing at the end of the generator.',
                  fix: 'Add yield { type: "done" } as the last statement in the async generator function.',
                },
                {
                  symptom: 'An error thrown inside the generator silently swallows without user feedback.',
                  cause: 'Unhandled errors in async generators close the stream without sending an error frame.',
                  fix: "Wrap async operations in try/catch and yield { type: 'error', template: 'system:error', data: { message } } to surface errors to the UI.",
                },
              ],
            },
          ],
        },
        {
          id: 'next',
          heading: 'Next: try it live',
          blocks: [
            {
              type: 'paragraph',
              text: 'Open the Streaming Demo to visualize the frame sequence in real time — watch full frames replace all anchors, partial frames patch specific keys, and error frames appear as inline errors.',
            },
          ],
        },
      ],
    },
    action: {
      title: 'Action',
      demoHref: '/features/actions',
      demoLabel: 'Actions Playground',
      sections: [
        {
          id: 'tldr',
          heading: 'TL;DR',
          blocks: [
            {
              type: 'paragraph',
              text: 'Add data-action="name" to any element — 10 lines of HTML, zero JS event handlers. Traditional approach: 42 lines of useState + useEffect + fetch with 3 hidden bugs. The engine handles delegation, abort, and pending automatically.',
            },
          ],
        },
        {
          id: 'analogy',
          heading: 'Mental model',
          blocks: [
            {
              type: 'analogy',
              text: 'Action = hotel room TV remote. The remote (HTML attribute) sends a signal; the TV (engine) does the actual work of switching channels (transitions). You never wire up the signal yourself — you just label buttons.',
            },
            {
              type: 'paragraph',
              text: 'Compare: in a React app, a button calls a JS handler → fetch → setState. In StateSurface, a button has data-action="name" → engine POSTs → server yields frames → DOM updates. The wiring is built-in; you only name the transition.',
            },
            {
              type: 'callout',
              kind: 'tip',
              text: 'If you are coming from React: think of data-action as a pre-wired onClick that sends the form to the server and streams the response back automatically. No useCallback, no fetch, no useState.',
            },
          ],
        },
        {
          id: 'when',
          heading: 'When to use',
          blocks: [
            {
              type: 'bullets',
              items: [
                'Use for any user interaction that triggers a server transition: button clicks, form submits.',
                'Use data-pending-targets to scope the loading indicator to specific anchors.',
                "Don't use for page navigation — use <a href> for MPA transitions.",
                "Don't use imperative fetch/POST calls when data-action covers the use case.",
              ],
            },
          ],
        },
        {
          id: 'steps',
          heading: 'Step-by-step',
          blocks: [
            {
              type: 'sequence',
              steps: [
                "Add data-action=\"transition-name\" to a <button> or <form>.",
                "Add data-params='{\"key\":\"value\"}' for static JSON params (optional).",
                'For forms, <input name="..."> field values auto-merge with data-params.',
                'Add data-pending-targets="slot1,slot2" to scope the pending indicator (optional; defaults to all anchors).',
                'No JS required — the engine listens via delegated click/submit on document.',
              ],
            },
          ],
        },
        {
          id: 'example',
          heading: 'Minimal example',
          blocks: [
            {
              type: 'code',
              lang: 'html',
              label: '✓ StateSurface — 10 lines of HTML, zero JS',
              text: `<!-- Shipping options form — updates cart summary in real time -->
<form data-action="update-cart" data-pending-targets="cart:summary">
  <select name="shipping">
    <option value="standard">Standard — $5.00</option>
    <option value="express">Express — $15.00</option>
    <option value="overnight">Overnight — $30.00</option>
  </select>
  <select name="gift">
    <option value="none">No gift wrap</option>
    <option value="basic">Basic — $3.00</option>
    <option value="premium">Premium — $8.00</option>
  </select>
  <button type="submit">Place Order</button>
</form>`,
            },
            {
              type: 'callout',
              kind: 'info',
              text: 'Invisible Power — what data-action handles automatically:\n✓ Zero onChange handlers — engine reads form values on submit\n✓ Zero onSubmit handlers — engine intercepts and POSTs\n✓ Zero useState — no client state management\n✓ Zero fetch/POST code — engine manages HTTP\n✓ Previous request auto-aborted — rapid changes handled safely\n✓ Pending indicator scoped to cart:summary only',
            },
            {
              type: 'code',
              lang: 'tsx',
              label: '✗ Traditional approach — 42 lines, 3 hidden bugs',
              text: `// React-style shipping form — manual state + fetch
import { useState, useEffect, useCallback } from 'react';

function ShippingForm() {
  const [shipping, setShipping] = useState('standard');
  const [gift, setGift] = useState('none');
  const [loading, setLoading] = useState(false);

  // ⚠️ BUG: Rapid option changes fire concurrent fetches
  // Last response may not match current selection
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/cart/price', {
      method: 'POST',
      body: JSON.stringify({ shipping, gift }),
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    })
      .then(r => r.json())
      .then(data => { setLoading(false); /* update summary */ })
      .catch(e => {
        if (e.name !== 'AbortError') setLoading(false);
        // ⚠️ BUG: Error state not cleared on next successful request
      });
    return () => controller.abort();
  }, [shipping, gift]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/cart/order', {
      method: 'POST',
      body: JSON.stringify({ shipping, gift }),
      headers: { 'Content-Type': 'application/json' },
    });
    // ⚠️ BUG: No error handling on order submission
    setLoading(false);
  }, [shipping, gift]);

  return (
    <form onSubmit={handleSubmit}>
      <select value={shipping} onChange={e => setShipping(e.target.value)}>
        <option value="standard">Standard — $5.00</option>
        <option value="express">Express — $15.00</option>
        <option value="overnight">Overnight — $30.00</option>
      </select>
      <select value={gift} onChange={e => setGift(e.target.value)}>
        <option value="none">No gift wrap</option>
        <option value="basic">Basic — $3.00</option>
        <option value="premium">Premium — $8.00</option>
      </select>
      <button type="submit" disabled={loading}>Place Order</button>
    </form>
  );
}`,
            },
          ],
        },
        {
          id: 'sequence',
          heading: 'Execution sequence',
          blocks: [
            {
              type: 'sequence',
              steps: [
                'User clicks data-action element (or submits data-action form).',
                'Engine reads data-action, data-params, field values, data-pending-targets.',
                'Previous in-flight transition aborted (abort-previous policy).',
                'data-pending added to target <h-state> anchors.',
                'POST /transition/:name with merged params as JSON body.',
                'Frames arrive → DOM updates progressively.',
                'done frame → data-pending cleared from all target anchors.',
              ],
            },
          ],
        },
        {
          id: 'mistakes',
          heading: 'Common mistakes',
          blocks: [
            {
              type: 'warning',
              text: "data-params must be valid JSON with double-quoted keys. data-params=\"{query: 'foo'}\" silently fails — use data-params='{\"query\":\"foo\"}'.",
            },
            {
              type: 'checklist',
              items: [
                'Transition named in data-action is registered (file exists in transitions/).',
                'data-params is valid JSON (double-quoted keys and string values).',
                'Form <input name="..."> attributes match what the transition expects in params.',
                'data-pending-targets uses comma-separated slot names with no spaces.',
                'For abort-sensitive operations, the transition handles early completion gracefully.',
              ],
            },
          ],
        },
        {
          id: 'debug',
          heading: 'Debugging checklist',
          blocks: [
            {
              type: 'debug',
              items: [
                {
                  symptom: 'Click does nothing — no network request appears in DevTools.',
                  cause: 'data-action typo or missing attribute; element may be inside a shadow DOM that blocks delegation.',
                  fix: 'Check the attribute name (data-action, not data-transition or action). Inspect the element in DevTools to confirm the attribute is present.',
                },
                {
                  symptom: 'POST fires but server responds 404.',
                  cause: 'Transition file is missing or named differently from the data-action value.',
                  fix: 'Confirm that routes/<page>/transitions/<name>.ts exists and that <name> matches the data-action string exactly.',
                },
                {
                  symptom: 'Form submit sends empty params — input values are not included.',
                  cause: 'Form inputs are missing name attributes, or data-action is on the button instead of the <form>.',
                  fix: 'Add name="..." to every <input>. Place data-action on the <form> element, not the submit button.',
                },
                {
                  symptom: 'Pending spinner stays forever after action completes.',
                  cause: 'Server generator exited without yielding a done frame, or an uncaught error killed the stream.',
                  fix: 'Ensure the transition generator has a finally block that yields { type: "done" }. Wrap async operations in try/catch.',
                },
              ],
            },
          ],
        },
        {
          id: 'next',
          heading: 'Next: try it live',
          blocks: [
            {
              type: 'paragraph',
              text: 'Try the Actions Playground to experiment with button actions, form submissions, scoped pending indicators, and observe the abort-previous policy when multiple actions fire rapidly.',
            },
          ],
        },
      ],
    },
    accumulate: {
      title: 'Accumulate Frame',
      demoHref: '/chat',
      demoLabel: 'Chat Demo',
      sections: [
        {
          id: 'tldr',
          heading: 'TL;DR',
          blocks: [
            {
              type: 'paragraph',
              text: 'An accumulate frame lets the server send delta-only data without resetting the slot. Arrays concat, strings concat. Templates stay pure functions — the runtime owns accumulated state in activeStates.',
            },
          ],
        },
        {
          id: 'analogy',
          heading: 'Mental model',
          blocks: [
            {
              type: 'analogy',
              text: 'Think of a group chat. When a new message arrives, the app appends it to the list — it does not reload the entire conversation history. Accumulate works the same way: each frame says "add this to what you already have" instead of "replace everything with this".',
            },
            {
              type: 'paragraph',
              text: 'Why "accumulate"? The name describes what the runtime does with incoming data — it accumulates (stacks) delta onto existing state. Compare: full frames replace all activeStates; partial frames replace specific slot states; accumulate frames add to specific slot states.',
            },
            {
              type: 'callout',
              kind: 'info',
              text: 'The chat demo at /chat uses accumulate frames for streaming. Each token the server yields appends to the bot\'s response string — the template receives the fully concatenated text every time, with no local state.',
            },
          ],
        },
        {
          id: 'when',
          heading: 'When to use',
          blocks: [
            {
              type: 'bullets',
              items: [
                'Use for append-only UIs: chat messages, activity logs, streaming output.',
                'Use for progressive text streaming: LLM token-by-token responses.',
                'Use for paginated result appending: "load more" patterns.',
                "Don't use when you need to reset slot state — yield a full frame for reset.",
                "Don't mix accumulate and partial frames for the same slot in one flush — use separate frames.",
              ],
            },
          ],
        },
        {
          id: 'steps',
          heading: 'Step-by-step',
          blocks: [
            {
              type: 'sequence',
              steps: [
                'Yield a full frame first to initialise the slot (e.g., messages: [], text: \'\').',
                'For each delta, yield { type: \'state\', accumulate: true, states: { \'slot\': delta } }.',
                'Arrays are concatenated: [...existingArray, ...incomingArray].',
                'Strings are concatenated: existingString + incomingString.',
                'Scalars replace: incomingValue replaces existingValue.',
                'To reset the slot, yield a new full frame — accumulate never resets.',
              ],
            },
          ],
        },
        {
          id: 'example',
          heading: 'Minimal example',
          blocks: [
            {
              type: 'code',
              lang: 'typescript',
              label: 'routes/chat/transitions/chat.ts',
              text: `import { defineTransition } from '../../../server/transition.js';
import type { StateFrame } from '../../../shared/protocol.js';

async function* chat({ message }: Record<string, unknown>): AsyncGenerator<StateFrame> {
  const userMsg = { id: crypto.randomUUID(), role: 'user', text: String(message) };

  // Frame 1 (full) — reset slots, declare complete UI state
  yield {
    type: 'state',
    states: {
      'chat:messages': { messages: [] },
      'chat:current': { text: '' },
    },
  };

  // Frame 2 (accumulate) — append user message to array
  yield {
    type: 'state',
    accumulate: true,
    states: { 'chat:messages': { messages: [userMsg] } },
  };

  // Frames 3…N (accumulate) — stream bot response token by token
  for (const token of ['Hello', ' from', ' the', ' server!']) {
    yield {
      type: 'state',
      accumulate: true,
      states: { 'chat:current': { text: token } }, // strings concat
    };
  }

  // Final accumulate — append completed bot message
  const botMsg = { id: crypto.randomUUID(), role: 'bot', text: 'Hello from the server!' };
  yield {
    type: 'state',
    accumulate: true,
    states: { 'chat:messages': { messages: [botMsg] } },
  };

  yield { type: 'done' };
}

export default defineTransition('chat', chat);`,
            },
            {
              type: 'callout',
              kind: 'tip',
              text: 'Notice there is no local state in the templates. The runtime accumulates messages in activeStates — the template just receives the complete array as props each render.',
            },
          ],
        },
        {
          id: 'sequence',
          heading: 'Execution sequence',
          blocks: [
            {
              type: 'sequence',
              steps: [
                "Full frame: { 'chat:messages': { messages: [] } } — initialises slot.",
                "Accumulate frame: { messages: [userMsg] } — runtime appends → messages: [userMsg].",
                "Accumulate frame: { 'chat:current': { text: 'Hello' } } — runtime concat → text: 'Hello'.",
                "Accumulate frame: { text: ' world!' } — runtime concat → text: 'Hello world!'.",
                'Full frame resets: new session start, all accumulated state replaced.',
              ],
            },
          ],
        },
        {
          id: 'mistakes',
          heading: 'Common mistakes',
          blocks: [
            {
              type: 'warning',
              text: 'The first frame in every stream must be a full frame. Yielding an accumulate frame before any full frame is a protocol violation — the runtime has no existing state to accumulate onto.',
            },
            {
              type: 'checklist',
              items: [
                'First yielded frame has no accumulate: true (must be a full frame).',
                'removed is forbidden on accumulate frames — clear slots via a full frame.',
                'Slot name in accumulate frame matches <h-state name> exactly.',
                'Reset via full frame, not empty accumulate (messages: [] accumulate just concats an empty array, it does not reset).',
              ],
            },
          ],
        },
        {
          id: 'debug',
          heading: 'Troubleshooting',
          blocks: [
            {
              type: 'debug',
              items: [
                {
                  symptom: 'Accumulated array keeps growing after starting a new session.',
                  cause: 'A full frame was not yielded at the start of the new session — old state was still in activeStates.',
                  fix: "Always begin a new session with a full frame that resets the slot (e.g., messages: []). The chat transition's first yield is always a full frame for this reason.",
                },
                {
                  symptom: 'Bot response text shows duplicated content after rapid user messages.',
                  cause: 'Previous streaming session was aborted but chat:current was not reset — next session accumulates onto leftover text.',
                  fix: "Include chat:current: { text: '' } in the full frame at the start of each transition to clear it. Alternatively, use removed: ['chat:current'] in a partial frame after the stream ends.",
                },
                {
                  symptom: "Protocol validation error: 'removed not allowed on accumulate frame'.",
                  cause: 'A frame has both accumulate: true and a removed array.',
                  fix: 'Remove the removed field. Use a separate partial frame (full: false) to remove slots, then continue with accumulate frames.',
                },
              ],
            },
          ],
        },
        {
          id: 'next',
          heading: 'Next: try it live',
          blocks: [
            {
              type: 'paragraph',
              text: 'Open the Chat demo to see accumulate in action — each token the server yields appends to the bot\'s response string, with no local state in the template.',
            },
          ],
        },
      ],
    },
    quickstart: {
      title: '10-Minute Quickstart',
      demoHref: '/features/streaming',
      demoLabel: 'Streaming Demo',
      sections: [
        {
          id: 'preview',
          heading: 'What you will build',
          blocks: [
            {
              type: 'paragraph',
              text: 'Create 4 files and you have a real-time book search page — type a query, the server streams results progressively, the UI updates without page reload, client fetch, or state management.',
            },
            {
              type: 'diagram',
              label: 'End result',
              text: `/books
  <h-state name="books:search">
    -- Search input + button

  <h-state name="books:results">
    -- Before search: empty
    -- Searching: skeleton
    -- Done: book list`,
            },
            {
              type: 'callout',
              kind: 'info',
              text: 'These 4 files are all of StateSurface. The Surface is plain HTML with <h-state> slots, Templates are JSX components, and the Transition is a server generator. No complex setup — just repeat this pattern for every new page.',
            },
          ],
        },
        {
          id: 'prereqs',
          heading: 'Before you start',
          blocks: [
            {
              type: 'bullets',
              items: [
                'Node.js 20+, pnpm installed (node --version, pnpm --version).',
                'StateSurface repo cloned and pnpm install completed.',
                'Basic TypeScript and JSX syntax helps but is not required.',
                'If you have used React or Vue before, Templates will feel immediately familiar.',
              ],
            },
            {
              type: 'callout',
              kind: 'tip',
              text: 'Keep pnpm dev running — the server auto-restarts on every file save. Open one terminal and leave it there.',
            },
          ],
        },
        {
          id: 'step1',
          heading: 'File 1 — Create the Surface',
          blocks: [
            {
              type: 'analogy',
              text: 'Surface = building skeleton before interior work. The <h-state> tags are power outlets drilled into the walls. The outlet positions are fixed; Templates are the appliances you plug in.',
            },
            {
              type: 'code',
              lang: 'typescript',
              label: 'routes/books.ts  ← create this file',
              text: `import type { RouteModule } from '../shared/routeModule.js';

export default {
  layout: stateScript => \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Book Search</title>
  <link rel="stylesheet" href="/client/styles.css">
</head>
<body class="min-h-screen bg-slate-100 text-slate-900">
  <main class="mx-auto max-w-xl p-8 space-y-6">
    <h-state name="books:search"></h-state>
    <h-state name="books:results"></h-state>
  </main>
  \${stateScript}
  <script type="module" src="/client/main.ts"></script>
</body>
</html>\`,
  transition: 'book-search',
} satisfies RouteModule;`,
            },
            {
              type: 'callout',
              kind: 'info',
              text: 'layout is just a function that returns an HTML string. The two <h-state> tags are the only StateSurface-specific parts — everything else is plain HTML you control completely. (In a real project, helper functions like baseSurface() can eliminate the boilerplate.)',
            },
            {
              type: 'callout',
              kind: 'tip',
              text: 'After saving, visit http://localhost:5173/books — a blank page is expected. The two <h-state> anchors are in the DOM but nothing fills them yet.',
            },
          ],
        },
        {
          id: 'step2',
          heading: 'Files 2 & 3 — Create 2 Templates',
          blocks: [
            {
              type: 'analogy',
              text: 'Template = React component, but the server decides the props. You do not fetch data with useState — the server sends props via NDJSON and you just render them.',
            },
            {
              type: 'code',
              lang: 'tsx',
              label: 'routes/books/templates/booksSearch.tsx  ← search form (8 lines)',
              text: `import { defineTemplate } from '../../../shared/templateRegistry.js';

type Props = { query?: string };

const BooksSearch = ({ query = '' }: Props) => (
  <form data-action="book-search" data-pending-targets="books:results" class="flex gap-2">
    <input name="query" value={query} placeholder="Search books..."
      class="flex-1 rounded-lg border px-4 py-2 text-sm" />
    <button type="submit"
      class="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700">
      Search
    </button>
  </form>
);

export default defineTemplate('books:search', BooksSearch);`,
            },
            {
              type: 'code',
              lang: 'tsx',
              label: 'routes/books/templates/booksResults.tsx  ← results (9 lines)',
              text: `import { defineTemplate } from '../../../shared/templateRegistry.js';

type Book = { title: string; author: string };
type Props = { loading?: boolean; books?: Book[] };

const BooksResults = ({ loading, books }: Props) => {
  if (!books && !loading) return <p class="text-sm text-slate-400">Type a query to search.</p>;
  if (loading) return (
    <div class="space-y-2">
      {[1, 2, 3].map(i => <div key={i} class="h-6 animate-pulse rounded bg-slate-200" />)}
    </div>
  );
  if (!books?.length) return <p class="text-sm text-slate-500">No books found.</p>;
  return (
    <ul class="space-y-2">
      {books.map(b => (
        <li key={b.title} class="text-sm">
          <span class="font-medium">{b.title}</span>
          <span class="text-slate-400"> — {b.author}</span>
        </li>
      ))}
    </ul>
  );
};

export default defineTemplate('books:results', BooksResults);`,
            },
            {
              type: 'callout',
              kind: 'info',
              text: 'Any file under routes/**/templates/*.tsx is auto-registered at startup. No import statement needed. Notice: zero useState, zero useEffect, zero fetch calls.',
            },
          ],
        },
        {
          id: 'step3',
          heading: 'File 4 — Create the Transition',
          blocks: [
            {
              type: 'analogy',
              text: 'Transition = server-side subtitle stream. The HTML page (the "video") stays the same; only the subtitles (state) are updated line by line. Each yield is one NDJSON line = one UI update.',
            },
            {
              type: 'code',
              lang: 'typescript',
              label: 'routes/books/transitions/bookSearch.ts  ← server logic (12 lines)',
              text: `import { defineTransition } from '../../../server/transition.js';
import type { StateFrame } from '../../../shared/protocol.js';

async function* bookSearch({ query }: Record<string, unknown>): AsyncGenerator<StateFrame> {
  // Frame 1 (full) — loading state
  yield {
    type: 'state',
    states: {
      'books:search': { query: String(query) },
      'books:results': { loading: true },
    },
  };

  // Simulate DB search (real app: database query, external API, etc.)
  await new Promise(r => setTimeout(r, 600));
  const books = [
    { title: 'Design Patterns', author: 'Gang of Four' },
    { title: 'Clean Code', author: 'Robert C. Martin' },
    { title: 'Refactoring', author: 'Martin Fowler' },
  ].filter(b => b.title.toLowerCase().includes(String(query).toLowerCase()));

  // Frame 2 (partial) — results ready
  yield {
    type: 'state', full: false, changed: ['books:results'],
    states: { 'books:results': { loading: false, books } },
  };

  yield { type: 'done' };
}

export default defineTransition('book-search', bookSearch);`,
            },
            {
              type: 'callout',
              kind: 'tip',
              text: 'The first yield must always be a full frame (omit full or set full: true). From the second yield onward, use full: false + changed array for partial updates. The search form auto-aborts previous requests when the user types again.',
            },
          ],
        },
        {
          id: 'flow',
          heading: 'Full pipeline at a glance',
          blocks: [
            {
              type: 'diagram',
              label: 'Form submit → DOM update pipeline',
              text: `[ Form submit ]
    │  reads data-action="book-search" + input values
    ▼
[ Action engine ]
    │  abort previous request → add data-pending to books:results
    │  POST /transition/book-search { query: "design" }
    ▼
[ Server: bookSearch() runs ]
    │  yield { frame 1: loading state }  ──→  sends 1 NDJSON line
    │  (600ms DB search)
    │  yield { frame 2: results }        ──→  sends 1 NDJSON line
    │  yield { type: 'done' }            ──→  stream closes
    ▼
[ Client: applies frames ]
    │  frame 1: BooksSearch keeps query, BooksResults shows skeleton
    │  frame 2: BooksResults shows book list
    ▼
[ <h-state name="books:results"> DOM patched, data-pending removed ]`,
            },
            {
              type: 'paragraph',
              text: 'This pipeline is the entirety of StateSurface. Surface fixes the slots, Template renders each slot, Transition streams state from the server, Action connects user events to Transitions. No useState, no useEffect, no fetch — the engine handles everything.',
            },
          ],
        },
        {
          id: 'verify',
          heading: 'Verify it works',
          blocks: [
            {
              type: 'sequence',
              steps: [
                'Make sure pnpm dev is running.',
                'Visit http://localhost:5173/books.',
                'Type "design" in the search box and click Search.',
                'A loading skeleton appears briefly, then matching books render — success.',
                'Try searching again — the previous request auto-aborts (no stale results).',
              ],
            },
            {
              type: 'callout',
              kind: 'note',
              text: 'Open DevTools → Network tab, click the /transition/book-search request — you can watch the NDJSON stream arrive in real time. Notice data-pending appears on books:results during loading.',
            },
          ],
        },
        {
          id: 'next',
          heading: 'Next steps',
          blocks: [
            {
              type: 'paragraph',
              text: 'Quickstart complete. Read the concept guides in order to understand each piece deeply.',
            },
            {
              type: 'bullets',
              items: [
                'Surface guide — slot design, shared layout, baseSurface/stateSlots helpers.',
                'Template guide — prop types, stateless principle, hydration, auto-discovery.',
                'Transition guide — full/partial/removed frame rules, NDJSON protocol.',
                'Action guide — data-params, form serialization, data-pending-targets, abort-previous.',
                'Streaming Demo (/features/streaming) — visualize the frame sequence live.',
                'Actions Playground (/features/actions) — experiment with every action pattern.',
              ],
            },
          ],
        },
      ],
    },
  },
  ko: {
    surface: {
      title: 'Surface',
      demoHref: '/features/streaming',
      demoLabel: '스트리밍 데모',
      sections: [
        {
          id: 'tldr',
          heading: 'TL;DR',
          blocks: [
            {
              type: 'paragraph',
              text: 'Surface는 고정된 페이지 셸 — HTML 문자열 7줄로 독립 업데이트되는 3개 패널을 선언합니다. 기존 방식은 27줄 이상 + 컴포넌트 import, state hook, 숨겨진 re-render 버그가 필요합니다. Surface는 동적 콘텐츠의 위치만 정의합니다.',
            },
          ],
        },
        {
          id: 'analogy',
          heading: '비유로 이해하기',
          blocks: [
            {
              type: 'analogy',
              text: 'Surface = 건물 뼈대 공사. <h-state> 태그는 벽에 미리 뚫어 놓은 콘센트 구멍입니다. 구멍 위치는 고정이고 — Template은 나중에 꽂는 가전제품입니다.',
            },
            {
              type: 'paragraph',
              text: 'React의 app.tsx나 Vue의 App.vue처럼 최상위 레이아웃 파일이라고 생각하세요. 차이점은 StateSurface의 Surface는 순수 HTML 문자열로 서버에서 한 번만 렌더링되며, 이후 내용 갱신은 <h-state> 앵커를 통해서만 이루어집니다.',
            },
            {
              type: 'callout',
              kind: 'note',
              text: '왜 HTML 문자열인가? Surface는 페이지 수명 내내 변하지 않기 때문에 Virtual DOM이 필요 없습니다. 문자열 조합으로 가장 빠르고 단순하게 SSR됩니다.',
            },
          ],
        },
        {
          id: 'when',
          heading: '언제 사용하나',
          blocks: [
            {
              type: 'bullets',
              items: [
                '모든 라우트에 사용: 레이아웃, 내비게이션, 푸터, <h-state> 앵커 배치.',
                '사용자가 페이지에 머무는 동안 변하지 않는 콘텐츠에 사용.',
                '조건부로 갱신되는 콘텐츠에는 사용하지 마세요 — Template을 사용하세요.',
              ],
            },
          ],
        },
        {
          id: 'steps',
          heading: '단계별 구현',
          blocks: [
            {
              type: 'sequence',
              steps: [
                'routes/my-page.ts를 만들고 RouteModule을 export합니다.',
                'layouts/surface.js에서 baseSurface, stateSlots, joinSurface를 import합니다.',
                "layout: stateScript => string을 정의합니다 — 동적 앵커마다 stateSlots('slot-name')을 호출합니다.",
                'baseSurface(body, stateScript)로 조립된 body를 감쌉니다.',
                '선언한 슬롯 이름마다 대응하는 Template 파일을 추가합니다.',
              ],
            },
          ],
        },
        {
          id: 'example',
          heading: '최소 예시',
          blocks: [
            {
              type: 'code',
              lang: 'typescript',
              label: '✓ StateSurface — 7줄',
              text: `// routes/dashboard.ts — 독립 업데이트되는 3패널 주식 대시보드
import type { RouteModule } from '../shared/routeModule.js';
import { baseSurface, joinSurface, stateSlots } from '../layouts/surface.js';

export default {
  layout: stateScript => baseSurface(joinSurface(
    '<main class="grid grid-cols-3 gap-4 max-w-6xl mx-auto p-6">',
    stateSlots('stock:price', 'stock:news', 'stock:chart'),
    '</main>',
  ), stateScript),
  transition: 'dashboard-load',
} satisfies RouteModule;`,
            },
            {
              type: 'callout',
              kind: 'info',
              text: 'Invisible Power — 이 7줄이 자동으로 처리하는 것들:\n✓ 각 패널 독립 업데이트 — 다른 패널은 절대 re-render 없음\n✓ 새 패널 추가 = stateSlots에 1줄 + template 파일 1개\n✓ Surface 자체는 페이지 수명 내내 불변\n✓ SSR이 완성된 HTML을 전달 — 클라이언트에서 레이아웃 조립 불필요\n✓ Hydration은 앵커 단위, 전체 페이지가 아님',
            },
            {
              type: 'code',
              lang: 'tsx',
              label: '✗ 기존 방식 — 27줄, 숨겨진 문제 2개',
              text: `// React 방식 대시보드 — 각 패널이 자체 데이터를 관리
import { useState, useEffect } from 'react';
import { StockPrice } from './StockPrice';
import { StockNews } from './StockNews';
import { StockChart } from './StockChart';

function Dashboard() {
  const [priceData, setPriceData] = useState(null);
  const [newsData, setNewsData] = useState(null);
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    fetchPrice().then(setPriceData);
  }, []);
  useEffect(() => {
    fetchNews().then(setNewsData);
  }, []);
  useEffect(() => {
    fetchChart().then(setChartData);
    // ⚠️ BUG: cleanup 없음 — unmount 후 stale setState 호출
  }, []);

  // ⚠️ BUG: 자식 state 변경 시 부모가 re-render
  // price만 갱신돼도 3개 패널 전부 re-render
  return (
    <div className="grid grid-cols-3 gap-4">
      <StockPrice data={priceData} loading={!priceData} />
      <StockNews data={newsData} loading={!newsData} />
      <StockChart data={chartData} loading={!chartData} />
    </div>
  );
}
// + 자체 fetch 로직이 있는 자식 컴포넌트 파일 3개`,
            },
          ],
        },
        {
          id: 'sequence',
          heading: '실행 시퀀스',
          blocks: [
            {
              type: 'sequence',
              steps: [
                'GET /my-page — 서버가 initial 상태를 결정합니다.',
                'layout(stateScript)가 전체 HTML 셸 문자열을 렌더링합니다.',
                'SSR이 각 <h-state> 앵커를 초기 템플릿 출력으로 채웁니다.',
                '브라우저가 완성된 HTML 페이지를 렌더링합니다 (MPA).',
                '클라이언트가 각 <h-state> 앵커를 독립적으로 hydrate합니다.',
              ],
            },
          ],
        },
        {
          id: 'mistakes',
          heading: '흔한 실수',
          blocks: [
            {
              type: 'warning',
              text: 'Surface 문자열에 동적 콘텐츠를 하드코딩하는 것이 가장 흔한 실수입니다. 사용자가 페이지에 머무는 동안 변할 수 있는 콘텐츠라면 <h-state> 앵커와 Template이 필요합니다.',
            },
            {
              type: 'checklist',
              items: [
                '<h-state name="..."> 속성이 template 레지스트리 키와 정확히 일치합니다.',
                'stateScript 파라미터가 baseSurface(body, stateScript)에 전달됩니다.',
                '사용할 모든 앵커에 stateSlots()가 호출됩니다.',
                '조건부로 변하는 모든 데이터는 surface 문자열이 아닌 template에 있습니다.',
              ],
            },
          ],
        },
        {
          id: 'debug',
          heading: '디버깅 체크리스트',
          blocks: [
            {
              type: 'debug',
              items: [
                {
                  symptom: '페이지가 빈 화면으로 렌더링됩니다 — <h-state> 안에 아무것도 보이지 않습니다.',
                  cause: 'stateSlots()가 surface 문자열에서 누락되었거나 transition이 해당 슬롯 이름에 상태를 보내지 않습니다.',
                  fix: 'layout에서 각 앵커에 stateSlots("slot-name")이 있는지 확인하세요. SSR HTML 소스에서 <h-state name="slot-name">을 검색해 확인하세요.',
                },
                {
                  symptom: 'Hydration 오류 — 콘솔에 mismatch 경고가 표시됩니다.',
                  cause: 'SSR에서 렌더링된 내용이 클라이언트 재렌더링 결과와 다릅니다. 가장 흔한 원인은 surface에 동적 값이 직접 포함된 경우입니다.',
                  fix: '동적 콘텐츠는 surface 문자열에서 제거하고 <h-state> + Template을 통해 주입하세요.',
                },
                {
                  symptom: '특정 앵커만 갱신되지 않습니다.',
                  cause: '<h-state name> 속성이 defineTemplate 등록 이름 또는 transition states 키와 다릅니다.',
                  fix: '세 위치의 이름이 완전히 일치하는지 확인하세요: stateSlots("name"), defineTemplate("name", ...), states["name"].',
                },
              ],
            },
          ],
        },
        {
          id: 'next',
          heading: '다음: 직접 실습',
          blocks: [
            {
              type: 'paragraph',
              text: '스트리밍 데모에서 여러 <h-state> 앵커가 독립적으로 갱신되는 모습을 실시간으로 확인하세요 — full 프레임은 모든 앵커를 교체하고, partial 프레임은 변경된 앵커만 패치합니다.',
            },
          ],
        },
      ],
    },
    template: {
      title: 'Template',
      demoHref: '/features/actions',
      demoLabel: '액션 플레이그라운드',
      sections: [
        {
          id: 'tldr',
          heading: 'TL;DR',
          blocks: [
            {
              type: 'paragraph',
              text: 'Template은 무상태 TSX 함수 — 12줄. useState, useEffect, fetch 전부 없음. 기존 방식: 38줄에 숨겨진 버그 3개 (레이스 컨디션, stale state, abort 처리). 서버가 데이터를 보내면 그냥 렌더링합니다.',
            },
          ],
        },
        {
          id: 'analogy',
          heading: '비유로 이해하기',
          blocks: [
            {
              type: 'analogy',
              text: 'Template = TV 화면 렌더러. 리모컨(Action)이 채널을 누르면, 서버(Transition)가 영상 신호를 보내고, TV 화면(Template)이 그 신호를 화면에 뿌립니다. 화면은 신호가 오기 전까지 아무것도 모릅니다.',
            },
            {
              type: 'paragraph',
              text: 'React 컴포넌트와 비슷하지만 중요한 차이가 있습니다: 로컬 state가 없습니다. useState, useEffect, fetch — 이 모두가 없습니다. 데이터는 항상 서버에서 props로 도착합니다. Template은 오직 "이 데이터를 어떻게 보여줄까"만 담당합니다.',
            },
            {
              type: 'callout',
              kind: 'tip',
              text: 'loading prop 패턴: transition이 첫 프레임에 { loading: true }를 보내면 skeleton을 표시하고, 두 번째 프레임에 실제 데이터를 보내면 콘텐츠를 표시하세요. 서버가 로딩 UX 타이밍을 완전히 제어합니다.',
            },
          ],
        },
        {
          id: 'when',
          heading: '언제 사용하나',
          blocks: [
            {
              type: 'bullets',
              items: [
                '시각적 콘텐츠가 필요한 모든 <h-state> 앵커에 사용합니다.',
                '로딩 상태, 콘텐츠, 에러 등 서버 데이터로 구동되는 모든 것에 사용합니다.',
                '사용자마다 변하지 않는 콘텐츠에는 사용하지 마세요 — surface에 넣으세요.',
                '서버 구동 데이터를 로컬 상태에 저장하지 마세요 (props만 사용하세요).',
              ],
            },
          ],
        },
        {
          id: 'steps',
          heading: '단계별 구현',
          blocks: [
            {
              type: 'sequence',
              steps: [
                'routes/my-page/templates/myContent.tsx를 만듭니다.',
                'shared/templateRegistry.js에서 defineTemplate을 import합니다.',
                'transition이 states에 보낼 데이터와 일치하는 props 타입을 정의합니다.',
                '순수 무상태 함수형 컴포넌트를 작성합니다.',
                "export default defineTemplate('slot-name', Component)으로 export합니다 — 이름이 <h-state name>과 일치해야 합니다.",
              ],
            },
          ],
        },
        {
          id: 'example',
          heading: '최소 예시',
          blocks: [
            {
              type: 'code',
              lang: 'tsx',
              label: '✓ StateSurface — 12줄',
              text: `// routes/dashboard/templates/stockPrice.tsx
import { defineTemplate } from '../../../shared/templateRegistry.js';

type Props = { symbol: string; price: number; change: number; loading?: boolean };

const StockPrice = ({ symbol, price, change, loading }: Props) => {
  if (loading) return <div class="animate-pulse h-20 bg-slate-100 rounded-xl" />;
  return (
    <div class="rounded-xl border p-4">
      <span class="text-sm text-slate-500">{symbol}</span>
      <p class="text-2xl font-bold">\${price.toFixed(2)}</p>
      <span class={change > 0 ? 'text-green-600' : 'text-red-600'}>
        {change > 0 ? '+' : ''}{change.toFixed(2)}%
      </span>
    </div>
  );
};

export default defineTemplate('stock:price', StockPrice);`,
            },
            {
              type: 'callout',
              kind: 'info',
              text: 'Invisible Power — 이 무상태 함수가 공짜로 얻는 것들:\n✓ useState 없음 — 서버가 상태 프레임으로 데이터를 전송\n✓ useEffect 없음 — 클라이언트 fetch 불필요\n✓ AbortController 없음 — 엔진이 이전 요청 자동 abort\n✓ SSR/CSR 동일 함수 — 엔진이 출력 형식 결정\n✓ 이 앵커에 새 데이터가 올 때만 re-render',
            },
            {
              type: 'code',
              lang: 'tsx',
              label: '✗ 기존 방식 — 38줄, 숨겨진 버그 3개',
              text: `// React 방식 주가 컴포넌트
import { useState, useEffect, useRef } from 'react';

function StockPrice({ symbol }: { symbol: string }) {
  const [data, setData] = useState<{ price: number; change: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    fetch(\`/api/stock/\${symbol}\`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => {
        if (e.name === 'AbortError') return;
        // ⚠️ BUG: fetch 중 컴포넌트 제거 시 unmount 후 setState 호출
        setError(e.message);
        setLoading(false);
      });

    return () => controller.abort();
    // ⚠️ BUG: 빠른 symbol 전환 시 AbortError가 잠깐 에러로 표시됨
  }, [symbol]);

  if (loading) return <div className="animate-pulse h-20 bg-slate-100 rounded-xl" />;
  if (error) return <div className="text-red-600">{error}</div>;
  // ⚠️ BUG: 레이스 컨디션 — 빠른 symbol 전환 시 이전 데이터 표시 가능
  return (
    <div className="rounded-xl border p-4">
      <span className="text-sm text-slate-500">{symbol}</span>
      <p className="text-2xl font-bold">\${data!.price.toFixed(2)}</p>
      <span className={data!.change > 0 ? 'text-green-600' : 'text-red-600'}>
        {data!.change > 0 ? '+' : ''}{data!.change.toFixed(2)}%
      </span>
    </div>
  );
}`,
            },
          ],
        },
        {
          id: 'sequence',
          heading: '실행 시퀀스',
          blocks: [
            {
              type: 'sequence',
              steps: [
                "서버가 프레임을 yield합니다: states: { 'page:content': { title, items } }.",
                "클라이언트가 template 레지스트리에서 'page:content'를 조회합니다.",
                '프레임 데이터로부터 props를 받아 template 함수가 호출됩니다.',
                'Lithent가 결과를 앵커 내부의 현재 DOM과 비교합니다.',
                '<h-state name="page:content"> 내부에서 변경된 노드만 패치됩니다.',
              ],
            },
          ],
        },
        {
          id: 'mistakes',
          heading: '흔한 실수',
          blocks: [
            {
              type: 'warning',
              text: "defineTemplate('name', ...)의 이름은 <h-state name=\"...\"> 속성과 정확히 일치해야 합니다. 불일치 시 렌더링이 자동으로 건너뛰어집니다 — 에러가 발생하지 않습니다.",
            },
            {
              type: 'checklist',
              items: [
                '파일이 routes/**/templates/*.tsx 하위에 있습니다 (자동 발견 경로).',
                "defineTemplate('name', ...)의 이름이 <h-state name=\"...\">와 정확히 일치합니다.",
                'props 타입이 transition의 states에서 보내는 것과 정확히 일치합니다.',
                '리스트는 key prop을 사용하여 올바른 diff를 보장합니다.',
                '서버 구동 데이터가 로컬 상태에 저장되지 않습니다.',
              ],
            },
          ],
        },
        {
          id: 'debug',
          heading: '디버깅 체크리스트',
          blocks: [
            {
              type: 'debug',
              items: [
                {
                  symptom: 'Template이 전혀 렌더링되지 않습니다 — 앵커가 빈 상태입니다.',
                  cause: "defineTemplate('name', ...)의 이름이 <h-state name=\"...\"> 속성과 다르거나 템플릿 파일이 routes/**/templates/ 경로에 없습니다.",
                  fix: "두 이름이 완전히 동일한지 확인하세요. 파일 경로가 routes/my-page/templates/myContent.tsx 형식인지 확인하세요.",
                },
                {
                  symptom: 'TypeScript 오류: props 타입이 맞지 않습니다.',
                  cause: 'transition에서 yield하는 states 객체의 필드명/타입이 Template의 props 타입 정의와 다릅니다.',
                  fix: 'transition 파일의 states 객체 구조와 Template의 Props 타입을 나란히 놓고 필드 이름과 타입을 맞추세요.',
                },
                {
                  symptom: '리스트 아이템이 갱신 시 깜빡이거나 순서가 틀립니다.',
                  cause: '리스트 아이템에 key prop이 없어 Lithent diff가 인덱스 기반으로 동작합니다.',
                  fix: "items.map(item => <li key={item.id}>{item.name}</li>) 처럼 안정적인 고유 key를 사용하세요.",
                },
              ],
            },
          ],
        },
        {
          id: 'next',
          heading: '다음: 직접 실습',
          blocks: [
            {
              type: 'paragraph',
              text: '액션 플레이그라운드에서 사용자 상호작용으로 template이 다시 렌더링되는 모습을 확인하세요 — 버튼 클릭과 폼 제출이 action → transition → frame → DOM 전체 파이프라인을 통해 template 갱신을 구동합니다.',
            },
          ],
        },
      ],
    },
    transition: {
      title: 'Transition',
      demoHref: '/features/streaming',
      demoLabel: '스트리밍 데모',
      sections: [
        {
          id: 'tldr',
          heading: 'TL;DR',
          blocks: [
            {
              type: 'paragraph',
              text: 'Transition은 서버 측 async function* — 18줄로 3단계 UX (스켈레톤 → 캐시 → 실시간). 레이스 컨디션이 구조적으로 불가능합니다. 기존 방식: 35줄에 레이스 컨디션 버그 내장. yield 순서 = UX 타임라인.',
            },
          ],
        },
        {
          id: 'analogy',
          heading: '비유로 이해하기',
          blocks: [
            {
              type: 'analogy',
              text: 'Transition = 주방 셰프. 주문이 들어오면(Action) 셰프가 요리 과정을 순서대로 진행합니다: 재료 준비(로딩 상태 yield) → 요리 완성(데이터 yield) → 서빙 완료(done yield). 손님(Template)은 각 단계마다 업데이트된 화면을 받습니다.',
            },
            {
              type: 'paragraph',
              text: 'React의 useEffect + fetch 패턴과 비교: React에서는 클라이언트가 요청하고 기다렸다가 setState. StateSurface에서는 서버가 async generator로 단계별 프레임을 push. 제어권이 클라이언트에서 서버로 이동합니다.',
            },
            {
              type: 'callout',
              kind: 'info',
              text: 'CSS transition(애니메이션)과 다른 개념입니다. StateSurface의 Transition은 서버 측 상태 변환 함수입니다. 네이밍이 혼란스러울 수 있지만 — 서버 state를 "전환(transition)"한다는 의미입니다.',
            },
          ],
        },
        {
          id: 'when',
          heading: '언제 사용하나',
          blocks: [
            {
              type: 'bullets',
              items: [
                '페이지 내 상태를 변경하는 모든 사용자 액션에 사용합니다: 데이터 로딩, 폼 제출, 버튼 클릭.',
                '점진적 렌더링에 사용합니다: 로딩 상태를 먼저 표시한 후 콘텐츠를 표시합니다.',
                '다른 페이지로 이동할 때는 사용하지 마세요 — MPA <a href>를 사용하세요.',
              ],
            },
          ],
        },
        {
          id: 'steps',
          heading: '단계별 구현',
          blocks: [
            {
              type: 'sequence',
              steps: [
                'routes/my-page/transitions/myTransition.ts를 만듭니다.',
                'server/transition.js에서 defineTransition을, shared/protocol.js에서 StateFrame을 import합니다.',
                'async function*(params): AsyncGenerator<StateFrame>을 작성합니다.',
                '첫 yield는 반드시 full 프레임이어야 합니다 (full 생략 또는 true) — 전체 UI 상태를 선언합니다.',
                '이후 부분 업데이트에는 full: false + changed/removed 배열을 사용합니다.',
                'yield { type: "done" }으로 스트림을 종료합니다.',
                "export default defineTransition('name', fn)으로 export합니다.",
              ],
            },
          ],
        },
        {
          id: 'example',
          heading: '최소 예시',
          blocks: [
            {
              type: 'code',
              lang: 'typescript',
              label: '✓ StateSurface — 18줄, 3단계 UX',
              text: `// routes/search/transitions/search.ts — 스켈레톤 → 캐시 → 실시간
import { defineTransition } from '../../../server/transition.js';
import type { StateFrame } from '../../../shared/protocol.js';

async function* search({ query }: Record<string, unknown>): AsyncGenerator<StateFrame> {
  // 1단계: 로딩 스켈레톤
  yield {
    type: 'state',
    states: { 'search:results': { loading: true, items: [], badge: '' } },
  };

  // 2단계: 캐시 결과 먼저 도착
  const cached = await searchCache(String(query));
  yield {
    type: 'state', full: false, changed: ['search:results'],
    states: { 'search:results': { loading: false, items: cached, badge: 'cached' } },
  };

  // 3단계: 실시간 결과가 캐시를 대체
  const live = await searchLive(String(query));
  yield {
    type: 'state', full: false, changed: ['search:results'],
    states: { 'search:results': { loading: false, items: live, badge: 'live' } },
  };

  yield { type: 'done' };
}

export default defineTransition('search', search);`,
            },
            {
              type: 'callout',
              kind: 'info',
              text: 'Invisible Power — yield 순서가 보장하는 것들:\n✓ yield 순서 = UX 타임라인 — 스켈레톤 → 캐시 → 실시간, 구조적 보장\n✓ 레이스 컨디션 불가능 — 단일 스트림, 서버가 순서 제어\n✓ 이전 요청 자동 abort — 엔진이 동시성 처리\n✓ 로딩 인디케이터 — data-pending 자동 부착/제거\n✓ 클라이언트 측 Promise 조율 불필요',
            },
            {
              type: 'code',
              lang: 'tsx',
              label: '✗ 기존 방식 — 35줄, 레이스 컨디션 버그 3개',
              text: `// React 방식 3단계 UX 검색
import { useState, useEffect, useRef } from 'react';

function SearchResults({ query }: { query: string }) {
  const [items, setItems] = useState([]);
  const [badge, setBadge] = useState('');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!query) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    // ⚠️ BUG: live가 cached보다 먼저 resolve되면 오래된 cached가 live를 덮어씀
    searchCache(query).then(cached => {
      if (controller.signal.aborted) return;
      setItems(cached);
      setBadge('cached');
      setLoading(false);
    });

    searchLive(query, controller.signal).then(live => {
      if (controller.signal.aborted) return;
      setItems(live);
      setBadge('live');
    }).catch(e => {
      if (e.name === 'AbortError') return;
      // ⚠️ BUG: 에러가 사용자에게 표시되지 않음 — 조용히 삼켜짐
      console.error(e);
    });

    return () => controller.abort();
    // ⚠️ BUG: 순서 보장 없음 — cached와 live가 서로 경쟁
  }, [query]);

  if (loading) return <Skeleton />;
  return <ResultList items={items} badge={badge} />;
}`,
            },
          ],
        },
        {
          id: 'sequence',
          heading: '실행 시퀀스',
          blocks: [
            {
              type: 'sequence',
              steps: [
                '클라이언트가 JSON params를 body로 /transition/my-transition에 POST합니다.',
                '서버가 async generator를 시작하고 NDJSON 스트리밍을 시작합니다.',
                'Full 프레임 → 클라이언트가 모든 activeStates를 교체하고 모든 template을 다시 렌더링합니다.',
                'Partial 프레임 → 클라이언트가 changed 키만 병합하고 변경되지 않은 앵커는 건너뜁니다.',
                'done 프레임 → 스트림이 닫히고 모든 앵커에서 data-pending이 제거됩니다.',
              ],
            },
          ],
        },
        {
          id: 'mistakes',
          heading: '흔한 실수',
          blocks: [
            {
              type: 'warning',
              text: '모든 스트림은 full 프레임으로 시작해야 합니다. partial 프레임(full: false)을 먼저 yield하는 것은 프로토콜 위반입니다 — 클라이언트가 전체 스트림을 거부합니다.',
            },
            {
              type: 'checklist',
              items: [
                '첫 번째 yield된 프레임이 full입니다 (full: false 없음).',
                'Partial 프레임에 full: false가 있고 changed/removed 중 최소 하나 이상이 있습니다.',
                'changed의 키는 states에 존재하고, removed의 키는 states에 존재하지 않습니다.',
                'changed와 removed에 동일한 키가 없습니다.',
                'generator가 yield { type: "done" }으로 종료됩니다.',
              ],
            },
          ],
        },
        {
          id: 'debug',
          heading: '디버깅 체크리스트',
          blocks: [
            {
              type: 'debug',
              items: [
                {
                  symptom: '첫 프레임 직후 클라이언트가 스트림 전체를 무시합니다.',
                  cause: '첫 프레임이 full: false (partial)로 yield되었습니다. 프로토콜 위반입니다.',
                  fix: '첫 yield 프레임에서 full: false를 제거하거나 full: true를 명시하세요. 모든 스트림은 full 프레임으로 시작해야 합니다.',
                },
                {
                  symptom: 'Partial 프레임이 적용되지 않습니다 — 특정 앵커가 갱신되지 않습니다.',
                  cause: 'changed 배열에 해당 키가 없거나, states 객체에 해당 키가 없습니다.',
                  fix: "changed: ['slot-name']과 states: { 'slot-name': data } 양쪽을 모두 확인하세요. 키가 정확히 일치해야 합니다.",
                },
                {
                  symptom: 'async 작업 중 오류가 나면 스트림이 아무 응답 없이 끊깁니다.',
                  cause: 'async generator 내부에서 예외가 발생했지만 catch되지 않았습니다.',
                  fix: "async 작업을 try/catch로 감싸고 catch 블록에서 yield { type: 'error', ... }를 yield한 뒤 finally에서 yield { type: 'done' }을 보내세요.",
                },
              ],
            },
          ],
        },
        {
          id: 'next',
          heading: '다음: 직접 실습',
          blocks: [
            {
              type: 'paragraph',
              text: '스트리밍 데모에서 프레임 시퀀스를 실시간으로 시각화하세요 — full 프레임이 모든 앵커를 교체하고, partial 프레임이 특정 키만 패치하고, error 프레임이 인라인 에러로 나타나는 것을 확인할 수 있습니다.',
            },
          ],
        },
      ],
    },
    action: {
      title: 'Action',
      demoHref: '/features/actions',
      demoLabel: '액션 플레이그라운드',
      sections: [
        {
          id: 'tldr',
          heading: 'TL;DR',
          blocks: [
            {
              type: 'paragraph',
              text: '아무 요소에나 data-action="name" 추가 — HTML 10줄, JS 이벤트 핸들러 0개. 기존 방식: useState + useEffect + fetch 42줄에 숨겨진 버그 3개. 엔진이 위임, abort, pending을 자동 처리합니다.',
            },
          ],
        },
        {
          id: 'analogy',
          heading: '비유로 이해하기',
          blocks: [
            {
              type: 'analogy',
              text: 'Action = 호텔 객실 TV 리모컨. 리모컨(HTML 속성)이 신호를 보내면, TV(엔진)가 실제로 채널(transition)을 바꿉니다. 신호 배선을 직접 하지 않아도 됩니다 — 버튼에 이름만 붙이면 됩니다.',
            },
            {
              type: 'paragraph',
              text: 'React 방식 비교: 버튼에 onClick → fetch → setState. StateSurface 방식: 버튼에 data-action="name" → 엔진이 POST → 서버가 프레임 yield → DOM 갱신. 배선이 내장되어 있습니다. transition 이름만 정하면 됩니다.',
            },
            {
              type: 'callout',
              kind: 'tip',
              text: 'React에서 오셨다면: data-action은 사전 배선된 onClick입니다. 폼을 서버에 제출하고 응답을 자동으로 스트리밍합니다. useCallback, fetch, useState 모두 필요 없습니다.',
            },
          ],
        },
        {
          id: 'when',
          heading: '언제 사용하나',
          blocks: [
            {
              type: 'bullets',
              items: [
                '서버 transition을 트리거하는 모든 사용자 상호작용에 사용합니다: 버튼 클릭, 폼 제출.',
                'data-pending-targets를 사용하여 로딩 표시를 특정 앵커로 제한합니다.',
                '페이지 이동에는 사용하지 마세요 — MPA 전환에는 <a href>를 사용하세요.',
                'data-action이 용례를 커버할 때 명령형 fetch/POST를 사용하지 마세요.',
              ],
            },
          ],
        },
        {
          id: 'steps',
          heading: '단계별 구현',
          blocks: [
            {
              type: 'sequence',
              steps: [
                '<button> 또는 <form>에 data-action="transition-name"을 추가합니다.',
                "정적 JSON 파라미터가 있다면 data-params='{\"key\":\"value\"}'를 추가합니다 (선택사항).",
                '폼의 경우 <input name="..."> 필드 값이 data-params와 자동으로 병합됩니다.',
                '필요하다면 data-pending-targets="slot1,slot2"로 pending 표시를 제한합니다 (기본값: 모든 앵커).',
                'JS가 필요 없습니다 — 엔진이 document에서 위임 방식으로 click/submit을 수신합니다.',
              ],
            },
          ],
        },
        {
          id: 'example',
          heading: '최소 예시',
          blocks: [
            {
              type: 'code',
              lang: 'html',
              label: '✓ StateSurface — HTML 10줄, JS 0줄',
              text: `<!-- 배송 옵션 폼 — 장바구니 요약을 실시간 갱신 -->
<form data-action="update-cart" data-pending-targets="cart:summary">
  <select name="shipping">
    <option value="standard">일반 — ₩5,000</option>
    <option value="express">빠른배송 — ₩15,000</option>
    <option value="overnight">당일배송 — ₩30,000</option>
  </select>
  <select name="gift">
    <option value="none">선물포장 없음</option>
    <option value="basic">기본 — ₩3,000</option>
    <option value="premium">프리미엄 — ₩8,000</option>
  </select>
  <button type="submit">주문하기</button>
</form>`,
            },
            {
              type: 'callout',
              kind: 'info',
              text: 'Invisible Power — data-action이 자동으로 처리하는 것들:\n✓ onChange 핸들러 0개 — 엔진이 submit 시 폼 값을 읽음\n✓ onSubmit 핸들러 0개 — 엔진이 가로채서 POST\n✓ useState 0개 — 클라이언트 상태 관리 불필요\n✓ fetch/POST 코드 0줄 — 엔진이 HTTP 관리\n✓ 이전 요청 자동 abort — 빠른 변경도 안전\n✓ pending 표시가 cart:summary에만 적용',
            },
            {
              type: 'code',
              lang: 'tsx',
              label: '✗ 기존 방식 — 42줄, 숨겨진 버그 3개',
              text: `// React 방식 배송 폼 — 수동 state + fetch
import { useState, useEffect, useCallback } from 'react';

function ShippingForm() {
  const [shipping, setShipping] = useState('standard');
  const [gift, setGift] = useState('none');
  const [loading, setLoading] = useState(false);

  // ⚠️ BUG: 빠른 옵션 변경 시 동시 fetch 발생
  // 마지막 응답이 현재 선택과 불일치할 수 있음
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/cart/price', {
      method: 'POST',
      body: JSON.stringify({ shipping, gift }),
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    })
      .then(r => r.json())
      .then(data => { setLoading(false); /* 요약 갱신 */ })
      .catch(e => {
        if (e.name !== 'AbortError') setLoading(false);
        // ⚠️ BUG: 에러 상태가 다음 성공 요청에서 초기화되지 않음
      });
    return () => controller.abort();
  }, [shipping, gift]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/cart/order', {
      method: 'POST',
      body: JSON.stringify({ shipping, gift }),
      headers: { 'Content-Type': 'application/json' },
    });
    // ⚠️ BUG: 주문 제출 에러 핸들링 없음
    setLoading(false);
  }, [shipping, gift]);

  return (
    <form onSubmit={handleSubmit}>
      <select value={shipping} onChange={e => setShipping(e.target.value)}>
        <option value="standard">일반 — ₩5,000</option>
        <option value="express">빠른배송 — ₩15,000</option>
        <option value="overnight">당일배송 — ₩30,000</option>
      </select>
      <select value={gift} onChange={e => setGift(e.target.value)}>
        <option value="none">선물포장 없음</option>
        <option value="basic">기본 — ₩3,000</option>
        <option value="premium">프리미엄 — ₩8,000</option>
      </select>
      <button type="submit" disabled={loading}>주문하기</button>
    </form>
  );
}`,
            },
          ],
        },
        {
          id: 'sequence',
          heading: '실행 시퀀스',
          blocks: [
            {
              type: 'sequence',
              steps: [
                '사용자가 data-action 요소를 클릭하거나 data-action form을 제출합니다.',
                '엔진이 data-action, data-params, 필드 값, data-pending-targets를 읽습니다.',
                '진행 중인 이전 transition이 abort됩니다 (abort-previous 정책).',
                '대상 <h-state> 앵커에 data-pending이 추가됩니다.',
                'JSON body와 함께 POST /transition/:name이 전송됩니다.',
                '프레임이 도착하면 DOM이 점진적으로 갱신됩니다.',
                'done 프레임 → 모든 대상 앵커에서 data-pending이 제거됩니다.',
              ],
            },
          ],
        },
        {
          id: 'mistakes',
          heading: '흔한 실수',
          blocks: [
            {
              type: 'warning',
              text: "data-params는 반드시 이중 따옴표로 된 키를 사용한 유효한 JSON이어야 합니다. data-params=\"{query: 'foo'}\"는 자동으로 실패합니다 — data-params='{\"query\":\"foo\"}'를 사용하세요.",
            },
            {
              type: 'checklist',
              items: [
                'data-action에 명시된 transition이 등록되어 있습니다 (transitions/ 내 파일 존재).',
                'data-params가 유효한 JSON입니다 (키와 문자열 값 모두 이중 따옴표).',
                '폼 <input name="..."> 속성이 transition이 params에서 기대하는 것과 일치합니다.',
                'data-pending-targets는 쉼표로 구분된 슬롯 이름을 사용하며 공백이 없습니다.',
                'abort에 민감한 작업의 경우 transition이 조기 종료를 정상적으로 처리합니다.',
              ],
            },
          ],
        },
        {
          id: 'debug',
          heading: '디버깅 체크리스트',
          blocks: [
            {
              type: 'debug',
              items: [
                {
                  symptom: '클릭해도 아무 반응이 없습니다 — DevTools에 네트워크 요청이 나타나지 않습니다.',
                  cause: 'data-action 속성 오타 또는 누락. 또는 shadow DOM 내부 요소일 수 있습니다.',
                  fix: 'DevTools에서 요소를 클릭하여 data-action 속성이 실제로 있는지 확인하세요. data-transition이나 action 등 다른 이름을 사용하지 않았는지 확인하세요.',
                },
                {
                  symptom: 'POST 요청은 가지만 서버가 404로 응답합니다.',
                  cause: 'Transition 파일이 없거나 data-action 값과 파일명이 다릅니다.',
                  fix: 'routes/<page>/transitions/<name>.ts 파일이 있는지 확인하고, <name>이 data-action 값과 정확히 일치하는지 확인하세요.',
                },
                {
                  symptom: '폼 제출 시 input 값이 서버에 전달되지 않습니다.',
                  cause: 'input에 name 속성이 없거나, data-action이 form 대신 submit 버튼에 있습니다.',
                  fix: '모든 <input>에 name="..." 속성을 추가하고, data-action을 submit 버튼이 아닌 <form> 요소에 놓으세요.',
                },
                {
                  symptom: '액션 완료 후에도 pending 스피너가 계속 표시됩니다.',
                  cause: '서버 generator가 done 프레임 없이 종료되거나 uncaught 예외로 스트림이 끊겼습니다.',
                  fix: "transition에 finally 블록을 추가하여 항상 yield { type: 'done' }이 전송되도록 하세요. async 작업은 try/catch로 감싸세요.",
                },
              ],
            },
          ],
        },
        {
          id: 'next',
          heading: '다음: 직접 실습',
          blocks: [
            {
              type: 'paragraph',
              text: '액션 플레이그라운드에서 버튼 액션, 폼 제출, 스코프드 pending 표시를 실험해보고, 빠르게 여러 액션이 실행될 때 abort-previous 정책이 동작하는 모습을 직접 확인하세요.',
            },
          ],
        },
      ],
    },
    accumulate: {
      title: 'Accumulate 프레임',
      demoHref: '/chat',
      demoLabel: '채팅 데모',
      sections: [
        {
          id: 'tldr',
          heading: 'TL;DR',
          blocks: [
            {
              type: 'paragraph',
              text: 'accumulate 프레임은 슬롯을 초기화하지 않고 서버가 delta 데이터만 전송할 수 있게 합니다. 배열은 concat, 문자열은 concat. 템플릿은 순수 함수로 유지되고 — 런타임이 activeStates에 누적 상태를 관리합니다.',
            },
          ],
        },
        {
          id: 'analogy',
          heading: '비유로 이해하기',
          blocks: [
            {
              type: 'analogy',
              text: '단체 채팅방을 생각해보세요. 새 메시지가 오면 앱은 전체 대화를 다시 불러오지 않고 새 메시지만 추가합니다. accumulate도 같은 방식입니다: 각 프레임이 "가진 것에 이걸 추가해"를 말하지, "전부 이걸로 교체해"가 아닙니다.',
            },
            {
              type: 'paragraph',
              text: '왜 "accumulate"인가? 이름 그대로 런타임이 incoming 데이터를 기존 상태에 쌓아(accumulate) 올리기 때문입니다. full 프레임은 activeStates 전체를 교체하고, partial 프레임은 특정 슬롯 상태를 교체하며, accumulate 프레임은 특정 슬롯 상태에 추가합니다.',
            },
            {
              type: 'callout',
              kind: 'info',
              text: '/chat 채팅 데모는 스트리밍에 accumulate 프레임을 사용합니다. 서버가 토큰을 yield할 때마다 봇 응답 문자열에 추가되고 — 템플릿은 매 렌더마다 완성된 연결 텍스트를 props로 받으며, 로컬 state가 없습니다.',
            },
          ],
        },
        {
          id: 'when',
          heading: '언제 사용하나',
          blocks: [
            {
              type: 'bullets',
              items: [
                'append-only UI에 사용: 채팅 메시지, 활동 로그, 스트리밍 출력.',
                '점진적 텍스트 스트리밍에 사용: LLM 토큰 단위 응답.',
                '페이지네이션 결과 추가에 사용: "더 보기" 패턴.',
                '슬롯 상태를 초기화해야 할 때는 사용하지 마세요 — 초기화는 full 프레임으로.',
                '같은 flush 안에서 같은 슬롯에 accumulate와 partial을 혼용하지 마세요 — 별도 프레임으로 분리.',
              ],
            },
          ],
        },
        {
          id: 'steps',
          heading: '단계별 구현',
          blocks: [
            {
              type: 'sequence',
              steps: [
                '먼저 full 프레임을 yield하여 슬롯을 초기화합니다 (예: messages: [], text: \'\').',
                "각 delta마다 { type: 'state', accumulate: true, states: { 'slot': delta } }를 yield합니다.",
                '배열 필드: [...기존배열, ...새배열]로 연결됩니다.',
                '문자열 필드: 기존문자열 + 새문자열로 연결됩니다.',
                '스칼라 필드: 새값이 기존값을 교체합니다.',
                '슬롯을 초기화하려면 새 full 프레임을 yield합니다 — accumulate는 절대 초기화하지 않습니다.',
              ],
            },
          ],
        },
        {
          id: 'example',
          heading: '최소 예시',
          blocks: [
            {
              type: 'code',
              lang: 'typescript',
              label: 'routes/chat/transitions/chat.ts',
              text: `import { defineTransition } from '../../../server/transition.js';
import type { StateFrame } from '../../../shared/protocol.js';

async function* chat({ message }: Record<string, unknown>): AsyncGenerator<StateFrame> {
  const userMsg = { id: crypto.randomUUID(), role: 'user', text: String(message) };

  // Frame 1 (full) — 슬롯 초기화, 완전한 UI 상태 선언
  yield {
    type: 'state',
    states: {
      'chat:messages': { messages: [] },
      'chat:current': { text: '' },
    },
  };

  // Frame 2 (accumulate) — 유저 메시지를 배열에 append
  yield {
    type: 'state',
    accumulate: true,
    states: { 'chat:messages': { messages: [userMsg] } },
  };

  // Frame 3…N (accumulate) — 봇 응답을 토큰 단위로 스트리밍
  for (const token of ['안녕', '하세요', ', 서버', '입니다!']) {
    yield {
      type: 'state',
      accumulate: true,
      states: { 'chat:current': { text: token } }, // 문자열 concat
    };
  }

  // 최종 accumulate — 완성된 봇 메시지를 배열에 append
  const botMsg = { id: crypto.randomUUID(), role: 'bot', text: '안녕하세요, 서버입니다!' };
  yield {
    type: 'state',
    accumulate: true,
    states: { 'chat:messages': { messages: [botMsg] } },
  };

  yield { type: 'done' };
}

export default defineTransition('chat', chat);`,
            },
            {
              type: 'callout',
              kind: 'tip',
              text: '템플릿에 로컬 state가 없는 것을 주목하세요. 런타임이 activeStates에 messages를 누적하고 — 템플릿은 매 렌더마다 완성된 배열을 props로 받을 뿐입니다.',
            },
          ],
        },
        {
          id: 'sequence',
          heading: '실행 시퀀스',
          blocks: [
            {
              type: 'sequence',
              steps: [
                "Full 프레임: { 'chat:messages': { messages: [] } } — 슬롯 초기화.",
                'Accumulate 프레임: { messages: [userMsg] } — 런타임 append → messages: [userMsg].',
                "Accumulate 프레임: { 'chat:current': { text: '안녕' } } — 런타임 concat → text: '안녕'.",
                "Accumulate 프레임: { text: '하세요' } — 런타임 concat → text: '안녕하세요'.",
                'Full 프레임 초기화: 새 세션 시작, 누적 상태 전부 교체.',
              ],
            },
          ],
        },
        {
          id: 'mistakes',
          heading: '자주 하는 실수',
          blocks: [
            {
              type: 'warning',
              text: '모든 스트림의 첫 번째 프레임은 full 프레임이어야 합니다. full 프레임 이전에 accumulate 프레임을 yield하는 것은 프로토콜 위반입니다 — 런타임에 누적할 기존 상태가 없기 때문입니다.',
            },
            {
              type: 'checklist',
              items: [
                '첫 번째 yield 프레임에 accumulate: true가 없음 (full 프레임으로 시작).',
                'removed는 accumulate 프레임에 금지 — 슬롯 제거는 full 프레임으로.',
                'accumulate 프레임의 슬롯 이름이 <h-state name> 속성과 정확히 일치.',
                '초기화는 빈 accumulate가 아닌 full 프레임으로 (messages: [] accumulate는 빈 배열을 concat할 뿐, 초기화가 아님).',
              ],
            },
          ],
        },
        {
          id: 'debug',
          heading: '트러블슈팅',
          blocks: [
            {
              type: 'debug',
              items: [
                {
                  symptom: '새 세션 시작 후에도 누적 배열이 계속 커진다.',
                  cause: '새 세션 시작 시 full 프레임을 yield하지 않아 이전 activeStates가 남아있음.',
                  fix: '모든 transition은 슬롯을 초기화하는 full 프레임(예: messages: [])으로 시작해야 합니다. 채팅 transition의 첫 번째 yield가 항상 full 프레임인 이유입니다.',
                },
                {
                  symptom: '빠른 메시지 전송 후 봇 응답 텍스트가 중복 표시된다.',
                  cause: '이전 스트리밍 세션이 abort됐지만 chat:current가 초기화되지 않아 다음 세션이 남은 텍스트에 누적.',
                  fix: "각 transition 시작의 full 프레임에 'chat:current': { text: '' }를 포함하여 초기화하세요. 또는 스트림 종료 후 partial 프레임의 removed: ['chat:current']를 사용하세요.",
                },
                {
                  symptom: "프로토콜 검증 에러: 'removed not allowed on accumulate frame'.",
                  cause: '하나의 프레임에 accumulate: true와 removed 배열이 동시에 있음.',
                  fix: 'removed 필드를 제거하세요. 슬롯 제거는 별도의 partial 프레임(full: false)으로 처리한 후 accumulate 프레임을 계속 사용하세요.',
                },
              ],
            },
          ],
        },
        {
          id: 'next',
          heading: '다음: 직접 실습',
          blocks: [
            {
              type: 'paragraph',
              text: '/chat 채팅 데모를 열어 accumulate를 직접 확인해보세요 — 서버가 yield하는 각 토큰이 봇 응답 문자열에 추가되며, 템플릿에 로컬 state가 없습니다.',
            },
          ],
        },
      ],
    },
    quickstart: {
      title: '10분 퀵스타트',
      demoHref: '/features/streaming',
      demoLabel: '스트리밍 데모 보기',
      sections: [
        {
          id: 'preview',
          heading: '무엇을 만드는가',
          blocks: [
            {
              type: 'paragraph',
              text: '파일 4개를 만들면 실시간 도서 검색 페이지가 완성됩니다 — 검색어를 입력하면 서버가 결과를 스트리밍하고, 페이지 새로고침 없이, 클라이언트 fetch 없이, 상태 관리 라이브러리 없이 UI가 갱신됩니다.',
            },
            {
              type: 'diagram',
              label: '완성 후 동작',
              text: `/books
  <h-state name="books:search">
    -- 검색 입력 + 버튼

  <h-state name="books:results">
    -- 검색 전: 빈 화면
    -- 검색 중: 스켈레톤
    -- 완료: 도서 목록`,
            },
            {
              type: 'callout',
              kind: 'info',
              text: '이 4개 파일이 StateSurface의 전부입니다. Surface는 <h-state> 슬롯이 포함된 순수 HTML, Template은 JSX 컴포넌트, Transition은 서버 제너레이터입니다. 복잡한 설정 없이 이 패턴만 반복합니다.',
            },
          ],
        },
        {
          id: 'prereqs',
          heading: '시작 전 확인',
          blocks: [
            {
              type: 'bullets',
              items: [
                'Node.js 20 이상, pnpm 설치 확인 (node --version, pnpm --version).',
                'StateSurface 프로젝트 클론 후 pnpm install 완료.',
                'TypeScript와 JSX(TSX) 기초 문법을 알면 좋지만 필수는 아닙니다.',
                'React/Vue를 써본 적 있다면 Template이 즉시 익숙할 것입니다.',
              ],
            },
            {
              type: 'callout',
              kind: 'tip',
              text: 'pnpm dev를 실행하면 파일을 저장할 때마다 서버가 자동 재시작됩니다. 터미널을 하나 열어두고 진행하세요.',
            },
          ],
        },
        {
          id: 'step1',
          heading: '파일 1 — Surface 만들기',
          blocks: [
            {
              type: 'analogy',
              text: 'Surface = 인테리어 전 건물 뼈대. <h-state> 태그는 벽에 뚫린 콘센트 구멍입니다. 구멍(슬롯) 위치는 고정되어 있고, 거기에 Template이라는 가전제품을 꽂습니다.',
            },
            {
              type: 'code',
              lang: 'typescript',
              label: 'routes/books.ts  ← 이 파일을 만드세요',
              text: `import type { RouteModule } from '../shared/routeModule.js';

export default {
  layout: stateScript => \`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>도서 검색</title>
  <link rel="stylesheet" href="/client/styles.css">
</head>
<body class="min-h-screen bg-slate-100 text-slate-900">
  <main class="mx-auto max-w-xl p-8 space-y-6">
    <h-state name="books:search"></h-state>
    <h-state name="books:results"></h-state>
  </main>
  \${stateScript}
  <script type="module" src="/client/main.ts"></script>
</body>
</html>\`,
  transition: 'book-search',
} satisfies RouteModule;`,
            },
            {
              type: 'callout',
              kind: 'info',
              text: 'layout은 HTML 문자열을 반환하는 함수일 뿐입니다. <h-state> 태그 2개만이 StateSurface 고유 부분이고 나머지는 직접 제어하는 순수 HTML입니다. (실제 프로젝트에서는 baseSurface() 같은 헬퍼로 보일러플레이트를 줄일 수 있습니다.)',
            },
            {
              type: 'callout',
              kind: 'tip',
              text: '저장 후 http://localhost:5173/books 접속 — 빈 페이지가 보이면 정상입니다. <h-state> 앵커 2개가 이미 DOM에 있지만 아직 아무것도 채워지지 않은 상태입니다.',
            },
          ],
        },
        {
          id: 'step2',
          heading: '파일 2, 3 — Template 2개 만들기',
          blocks: [
            {
              type: 'analogy',
              text: 'Template = React 컴포넌트인데 props를 서버가 결정합니다. useState로 데이터를 fetch하지 않습니다 — 서버가 NDJSON으로 props를 보내주면 그냥 렌더링합니다.',
            },
            {
              type: 'code',
              lang: 'tsx',
              label: 'routes/books/templates/booksSearch.tsx  ← 검색 폼 (8줄)',
              text: `import { defineTemplate } from '../../../shared/templateRegistry.js';

type Props = { query?: string };

const BooksSearch = ({ query = '' }: Props) => (
  <form data-action="book-search" data-pending-targets="books:results" class="flex gap-2">
    <input name="query" value={query} placeholder="도서 검색..."
      class="flex-1 rounded-lg border px-4 py-2 text-sm" />
    <button type="submit"
      class="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700">
      검색
    </button>
  </form>
);

export default defineTemplate('books:search', BooksSearch);`,
            },
            {
              type: 'code',
              lang: 'tsx',
              label: 'routes/books/templates/booksResults.tsx  ← 결과 (9줄)',
              text: `import { defineTemplate } from '../../../shared/templateRegistry.js';

type Book = { title: string; author: string };
type Props = { loading?: boolean; books?: Book[] };

const BooksResults = ({ loading, books }: Props) => {
  if (!books && !loading) return <p class="text-sm text-slate-400">검색어를 입력하세요.</p>;
  if (loading) return (
    <div class="space-y-2">
      {[1, 2, 3].map(i => <div key={i} class="h-6 animate-pulse rounded bg-slate-200" />)}
    </div>
  );
  if (!books?.length) return <p class="text-sm text-slate-500">검색 결과가 없습니다.</p>;
  return (
    <ul class="space-y-2">
      {books.map(b => (
        <li key={b.title} class="text-sm">
          <span class="font-medium">{b.title}</span>
          <span class="text-slate-400"> — {b.author}</span>
        </li>
      ))}
    </ul>
  );
};

export default defineTemplate('books:results', BooksResults);`,
            },
            {
              type: 'callout',
              kind: 'info',
              text: 'Template 파일은 routes/**/templates/*.tsx 경로에만 있으면 자동으로 등록됩니다. import 문을 따로 추가할 필요가 없습니다. useState 0개, useEffect 0개, fetch 호출 0개입니다.',
            },
          ],
        },
        {
          id: 'step3',
          heading: '파일 4 — Transition 만들기',
          blocks: [
            {
              type: 'analogy',
              text: 'Transition = 서버가 보내는 자막 스트림. 영상(HTML 페이지)은 그대로고 자막(상태)만 줄줄이 전송됩니다. yield 하나가 NDJSON 한 줄 = 화면 업데이트 한 번입니다.',
            },
            {
              type: 'code',
              lang: 'typescript',
              label: 'routes/books/transitions/bookSearch.ts  ← 서버 로직 (12줄)',
              text: `import { defineTransition } from '../../../server/transition.js';
import type { StateFrame } from '../../../shared/protocol.js';

async function* bookSearch({ query }: Record<string, unknown>): AsyncGenerator<StateFrame> {
  // 프레임 1 (full) — 로딩 상태
  yield {
    type: 'state',
    states: {
      'books:search': { query: String(query) },
      'books:results': { loading: true },
    },
  };

  // DB 검색 시뮬레이션 (실제로는 DB 조회, 외부 API 등)
  await new Promise(r => setTimeout(r, 600));
  const books = [
    { title: 'Design Patterns', author: 'Gang of Four' },
    { title: 'Clean Code', author: 'Robert C. Martin' },
    { title: 'Refactoring', author: 'Martin Fowler' },
  ].filter(b => b.title.toLowerCase().includes(String(query).toLowerCase()));

  // 프레임 2 (partial) — 결과 준비 완료
  yield {
    type: 'state', full: false, changed: ['books:results'],
    states: { 'books:results': { loading: false, books } },
  };

  yield { type: 'done' };
}

export default defineTransition('book-search', bookSearch);`,
            },
            {
              type: 'callout',
              kind: 'tip',
              text: '첫 번째 yield는 반드시 full 프레임(full 생략 또는 true)이어야 합니다. 두 번째부터 full: false + changed 배열로 부분 업데이트할 수 있습니다. 사용자가 다시 검색하면 이전 요청이 자동으로 abort됩니다.',
            },
          ],
        },
        {
          id: 'flow',
          heading: '전체 흐름 한눈에 보기',
          blocks: [
            {
              type: 'diagram',
              label: '폼 제출 → DOM 업데이트 전체 파이프라인',
              text: `[ 폼 제출 ]
    │  data-action="book-search" + input 값 읽기
    ▼
[ Action 엔진 ]
    │  이전 요청 abort → books:results에 data-pending 추가
    │  POST /transition/book-search { query: "design" }
    ▼
[ 서버: bookSearch() 실행 ]
    │  yield { 프레임 1: 로딩 상태 }     ──→  NDJSON 한 줄 전송
    │  (600ms DB 검색)
    │  yield { 프레임 2: 검색 결과 }     ──→  NDJSON 한 줄 전송
    │  yield { type: 'done' }            ──→  스트림 종료
    ▼
[ 클라이언트: 프레임 적용 ]
    │  프레임 1: BooksSearch 쿼리 유지, BooksResults 스켈레톤 표시
    │  프레임 2: BooksResults에 도서 목록 표시
    ▼
[ <h-state name="books:results"> DOM 업데이트, data-pending 제거 ]`,
            },
            {
              type: 'paragraph',
              text: '이 파이프라인이 StateSurface의 전부입니다. Surface가 슬롯을 고정하고, Template이 슬롯 내용을 그리고, Transition이 서버에서 상태를 스트리밍하고, Action이 사용자 이벤트와 Transition을 연결합니다. useState 0개, useEffect 0개, fetch 0개 — 엔진이 전부 처리합니다.',
            },
          ],
        },
        {
          id: 'verify',
          heading: '동작 확인',
          blocks: [
            {
              type: 'sequence',
              steps: [
                'pnpm dev가 실행 중인지 확인합니다.',
                'http://localhost:5173/books 에 접속합니다.',
                '검색창에 "design"을 입력하고 검색 버튼을 클릭합니다.',
                '로딩 스켈레톤이 잠깐 표시된 후 도서 목록이 나타나면 성공입니다.',
                '다시 검색해보세요 — 이전 요청이 자동으로 abort됩니다 (stale 결과 없음).',
              ],
            },
            {
              type: 'callout',
              kind: 'note',
              text: '브라우저 DevTools → Network 탭에서 /transition/book-search 요청을 클릭하면 NDJSON 스트림이 실시간으로 흘러오는 것을 확인할 수 있습니다. 로딩 중 books:results에 data-pending이 나타나는 것도 확인하세요.',
            },
          ],
        },
        {
          id: 'next',
          heading: '다음 단계',
          blocks: [
            {
              type: 'paragraph',
              text: '퀵스타트를 완료했습니다. 각 개념을 깊이 이해하려면 아래 가이드를 순서대로 읽으세요.',
            },
            {
              type: 'bullets',
              items: [
                'Surface 가이드 — 슬롯 설계, 공유 레이아웃, baseSurface/stateSlots 헬퍼 심화.',
                'Template 가이드 — props 타입, 무상태 원칙, hydration, 자동 등록 메커니즘.',
                'Transition 가이드 — full/partial/removed 프레임 규칙, NDJSON 프로토콜 심화.',
                'Action 가이드 — data-params, 폼 직렬화, data-pending-targets, abort-previous.',
                '스트리밍 데모 (/features/streaming) — 프레임 시퀀스를 브라우저에서 직접 시각화.',
                '액션 플레이그라운드 (/features/actions) — 다양한 action 패턴 직접 실험.',
              ],
            },
          ],
        },
      ],
    },
  },
};

export function guideContent(slug: string, lang: Lang) {
  const data = GUIDE_DATA[lang][slug];
  if (!data) return null;
  return data;
}

export function guideLoadingState(slug: string, lang: Lang) {
  const guide = guideContent(slug, lang);
  const items = ['quickstart', 'surface', 'template', 'transition', 'action', 'accumulate'];
  const sections = guide?.sections.map(s => ({ id: s.id, heading: s.heading })) ?? [];
  return {
    'page:header': {
      title: guide ? `${lang === 'ko' ? '가이드' : 'Guide'}: ${guide.title}` : 'Guide',
      nav: 'guide',
      lang,
    },
    'guide:toc': { slug, items, sections },
    'guide:content': { slug, loading: true, title: guide?.title ?? slug },
  };
}

export function guideLoadedState(slug: string, lang: Lang) {
  const guide = guideContent(slug, lang);
  if (!guide) return null;
  return {
    slug,
    loading: false,
    title: guide.title,
    sections: guide.sections,
    demoHref: prefixPath(guide.demoHref),
    demoLabel: guide.demoLabel,
  };
}

// ── Streaming demo page ──

export function streamingContent(lang: Lang) {
  return {
    'page:header': {
      title: lang === 'ko' ? '스트리밍 데모' : 'Streaming Demo',
      nav: 'streaming',
      lang,
    },
    'demo:controls': {
      description: lang === 'ko'
        ? '버튼을 클릭하여 다양한 프레임 유형을 시연하는 transition을 실행하세요. 타임라인과 출력이 실시간으로 업데이트됩니다.'
        : 'Click a button to fire a transition that demonstrates different frame types. Watch the timeline and output update in real time.',
      runLabel: lang === 'ko' ? '전체 시퀀스 실행' : 'Run Full Sequence',
      errorLabel: lang === 'ko' ? '에러 프레임 발생' : 'Trigger Error Frame',
    },
    'demo:timeline': { frames: [] },
    'demo:output': { activeKeys: [] },
  };
}

// ── Actions playground page ──

export function actionsContent(lang: Lang) {
  return {
    'page:header': {
      title: lang === 'ko' ? '액션 플레이그라운드' : 'Actions Playground',
      nav: 'actions',
      lang,
    },
    'actions:playground': {
      lastAction: null,
      lastParams: null,
      lang,
    },
    'actions:log': {
      entries: [],
      lang,
    },
  };
}

// ── Search page ──

type SearchableItem = {
  title: string;
  description: string;
  href: string;
  tags: string[];
};

const SEARCH_FEATURES: I18nObj<SearchableItem[]> = {
  en: [
    { title: 'Surface', description: 'Page shell with <h-state> anchors declared as plain HTML strings.', href: '/guide/surface', tags: ['surface', 'layout', 'html', 'anchor', 'h-state', 'shell'] },
    { title: 'Template', description: 'TSX projection components that render inside each <h-state> anchor.', href: '/guide/template', tags: ['template', 'tsx', 'projection', 'component', 'render'] },
    { title: 'Transition', description: 'Server-side async generators that yield state frames progressively.', href: '/guide/transition', tags: ['transition', 'stream', 'frame', 'ndjson', 'generator', 'server'] },
    { title: 'Action', description: 'Declarative triggers via data-action attributes for transition invocation.', href: '/guide/action', tags: ['action', 'data-action', 'click', 'submit', 'form', 'pending'] },
    { title: 'Streaming Demo', description: 'Full/partial frames, removed keys, and error frames in real time.', href: '/features/streaming', tags: ['streaming', 'full', 'partial', 'removed', 'error', 'frame', 'demo'] },
    { title: 'Actions Playground', description: 'Button actions, form submissions, scoped pending, and multiple actions.', href: '/features/actions', tags: ['action', 'button', 'form', 'pending', 'scoped', 'playground', 'demo'] },
    { title: 'Full Frame', description: 'Declares complete UI state. Replaces all activeStates. First frame must be full.', href: '/features/streaming', tags: ['full', 'frame', 'replace', 'state'] },
    { title: 'Partial Frame', description: 'Merges changes via "changed" and "removed" arrays into existing state.', href: '/features/streaming', tags: ['partial', 'frame', 'changed', 'removed', 'merge'] },
    { title: 'Hydration', description: 'Per <h-state> root hydration with SSR hash mismatch fallback.', href: '/guide/template', tags: ['hydration', 'ssr', 'hash', 'boundary'] },
    { title: 'Abort Previous', description: 'Starting a new transition cancels the previous in-flight stream.', href: '/features/streaming', tags: ['abort', 'cancel', 'concurrency', 'previous'] },
    { title: 'Pending State', description: 'data-pending attribute on anchors during transition, removed on first frame.', href: '/features/actions', tags: ['pending', 'data-pending', 'loading', 'spinner'] },
    { title: 'Boot Auto-Run', description: 'SSR renders initial state, then client auto-runs transition after hydration.', href: '/guide/transition', tags: ['boot', 'auto', 'ssr', 'hydration', 'initial'] },
  ],
  ko: [
    { title: 'Surface', description: '순수 HTML 문자열로 <h-state> 앵커를 선언하는 페이지 셸.', href: '/guide/surface', tags: ['surface', 'layout', 'html', 'anchor', 'h-state', 'shell', '서피스', '레이아웃'] },
    { title: 'Template', description: '각 <h-state> 앵커 안에서 렌더링되는 TSX 프로젝션 컴포넌트.', href: '/guide/template', tags: ['template', 'tsx', 'projection', 'component', 'render', '템플릿', '컴포넌트'] },
    { title: 'Transition', description: '상태 프레임을 점진적으로 yield하는 서버 측 async generator.', href: '/guide/transition', tags: ['transition', 'stream', 'frame', 'ndjson', 'generator', 'server', '트랜지션', '스트림'] },
    { title: 'Action', description: 'transition 호출을 위한 data-action 속성 기반 선언적 트리거.', href: '/guide/action', tags: ['action', 'data-action', 'click', 'submit', 'form', 'pending', '액션'] },
    { title: '스트리밍 데모', description: 'Full/Partial 프레임, removed 키, error 프레임을 실시간으로 확인.', href: '/features/streaming', tags: ['streaming', 'full', 'partial', 'removed', 'error', 'frame', 'demo', '스트리밍'] },
    { title: '액션 플레이그라운드', description: '버튼 액션, 폼 제출, 스코프드 pending, 다중 액션 체험.', href: '/features/actions', tags: ['action', 'button', 'form', 'pending', 'scoped', 'playground', 'demo', '액션', '폼'] },
    { title: 'Full 프레임', description: '전체 UI 상태를 선언. 모든 activeStates를 교체. 첫 프레임은 반드시 full.', href: '/features/streaming', tags: ['full', 'frame', 'replace', 'state', '프레임'] },
    { title: 'Partial 프레임', description: '"changed"와 "removed" 배열을 통해 기존 상태에 변경사항을 병합.', href: '/features/streaming', tags: ['partial', 'frame', 'changed', 'removed', 'merge', '프레임'] },
    { title: 'Hydration', description: '<h-state> 루트별 하이드레이션과 SSR 해시 불일치 폴백.', href: '/guide/template', tags: ['hydration', 'ssr', 'hash', 'boundary', '하이드레이션'] },
    { title: 'Abort Previous', description: '새 transition을 시작하면 진행 중인 이전 스트림을 취소.', href: '/features/streaming', tags: ['abort', 'cancel', 'concurrency', 'previous', '취소'] },
    { title: 'Pending 상태', description: 'transition 중 앵커에 data-pending 속성 부여, 첫 프레임에 제거.', href: '/features/actions', tags: ['pending', 'data-pending', 'loading', 'spinner', '로딩'] },
    { title: 'Boot Auto-Run', description: 'SSR이 초기 상태를 렌더링한 후 클라이언트가 hydration 후 자동으로 transition 실행.', href: '/guide/transition', tags: ['boot', 'auto', 'ssr', 'hydration', 'initial', '부트'] },
  ],
};

export function searchFeatures(lang: Lang): SearchableItem[] {
  return SEARCH_FEATURES[lang];
}

export function searchContent(lang: Lang, query?: string) {
  return {
    'page:header': {
      title: lang === 'ko' ? '검색' : 'Search',
      nav: 'search',
      lang,
    },
    'search:input': {
      query: query ?? '',
      placeholder: lang === 'ko' ? '예: 스트리밍, 액션, 하이드레이션...' : 'e.g. streaming, action, hydration...',
      label: lang === 'ko' ? 'StateSurface 기능과 개념 검색' : 'Search StateSurface features and concepts',
      buttonLabel: lang === 'ko' ? '검색' : 'Search',
      hint: lang === 'ko'
        ? 'Form data-action이 검색 transition을 트리거합니다. 결과는 NDJSON 프레임으로 스트리밍됩니다.'
        : 'Form data-action triggers a search transition. Results stream as NDJSON frames.',
    },
  };
}

function matchScore(item: SearchableItem, query: string): number {
  const q = query.toLowerCase();
  if (item.title.toLowerCase().includes(q)) return 3;
  if (item.tags.some(t => t.includes(q))) return 2;
  if (item.description.toLowerCase().includes(q)) return 1;
  return 0;
}

export function searchResults(lang: Lang, query: string) {
  const features = searchFeatures(lang);
  const items = query
    ? features
        .map(f => ({ ...f, score: matchScore(f, query) }))
        .filter(f => f.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ score: _s, tags: _t, ...rest }) => ({ ...rest, href: prefixPath(rest.href) }))
    : features.map(({ tags: _t, ...rest }) => ({ ...rest, href: prefixPath(rest.href) }));
  return items;
}

// ── Chatbot demo page ──

export function chatContent(lang: Lang) {
  return {
    'page:header': {
      title: lang === 'ko' ? '챗봇 데모' : 'Chatbot Demo',
      nav: 'chat',
      lang,
    },
    'chat:messages': {
      messages: [],
      welcomeText: t(
        {
          ko: '메시지를 보내 대화를 시작하세요. Surface, Template, Transition, Action, Streaming, Hydration, Abort에 대해 물어보세요!',
          en: 'Send a message to start the conversation. Ask about Surface, Template, Transition, Action, Streaming, Hydration, or Abort!',
        },
        lang
      ),
    },
    'chat:input': {
      placeholder: t({ ko: '메시지를 입력하세요...', en: 'Type a message...' }, lang),
      submitLabel: t({ ko: '전송', en: 'Send' }, lang),
      hint: t(
        {
          ko: '새 메시지를 보내면 진행 중인 응답이 취소됩니다 (abort previous 정책).',
          en: 'Sending a new message cancels any in-progress response (abort previous policy).',
        },
        lang
      ),
      lang,
    },
  };
}

// ── Switch-lang: page content lookup by route key ──

export type PageKey = 'home' | 'guide' | 'streaming' | 'actions' | 'search' | 'chat';

export function pageContent(
  page: PageKey,
  lang: Lang,
  params?: Record<string, unknown>
): Record<string, any> {
  switch (page) {
    case 'home':
      return homeContent(lang);
    case 'guide': {
      const slug = (params?.slug as string) ?? 'quickstart';
      const guide = guideContent(slug, lang);
      const items = ['quickstart', 'surface', 'template', 'transition', 'action', 'accumulate'];
      return {
        'page:header': {
          title: guide ? `${lang === 'ko' ? '가이드' : 'Guide'}: ${guide.title}` : 'Guide',
          nav: 'guide',
          lang,
        },
        'guide:toc': { slug, items },
        'guide:content': guide
          ? {
              slug,
              loading: false,
              title: guide.title,
              sections: guide.sections,
              demoHref: prefixPath(guide.demoHref),
              demoLabel: guide.demoLabel,
            }
          : { slug, loading: false, title: slug },
      };
    }
    case 'streaming':
      return streamingContent(lang);
    case 'actions':
      return actionsContent(lang);
    case 'search':
      return { ...searchContent(lang), 'search:results': undefined };
    case 'chat':
      return chatContent(lang);
    default:
      return homeContent(lang);
  }
}

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
      primaryLabel: t({ ko: '가이드 읽기', en: 'Read the Guide' }, lang),
      primaryHref: prefixPath('/guide/surface'),
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

type GuideSection = { id: string; heading: string; body: string };
type GuideEntry = { title: string; sections: GuideSection[] };

const GUIDE_DATA: I18nObj<Record<string, GuideEntry>> = {
  en: {
    surface: {
      title: 'Surface',
      sections: [
        {
          id: 'what',
          heading: 'What is a Surface?',
          body: 'A surface is the page shell — plain HTML strings that declare <h-state> anchors and static structure. Surfaces define where dynamic content can appear, not what it contains.',
        },
        {
          id: 'authoring',
          heading: 'Authoring Surfaces',
          body: 'Surfaces are written as TypeScript string builders using helpers like stateSlots(), joinSurface(), and baseSurface(). They compose the full HTML document including shared layout (header, error) and page-specific slots.',
        },
        {
          id: 'decision',
          heading: 'Surface vs Template Decision',
          body: 'Ask: "Will this content change while the user stays on this page?" If no, it belongs in the surface. If yes, create an <h-state> anchor and a template. When in doubt, use a template — demoting back to surface is trivial.',
        },
      ],
    },
    template: {
      title: 'Template',
      sections: [
        {
          id: 'what',
          heading: 'What is a Template?',
          body: 'A template is a TSX projection component that renders inside an <h-state> anchor. Templates receive data from the server via state frames and project it into DOM. They are stateless by default.',
        },
        {
          id: 'authoring',
          heading: 'Writing Templates',
          body: 'Use defineTemplate(name, Component) to register a template. The component receives typed props matching the data from state frames. Prefer pure, stateless functions — use mount/lmount only for client-only UI state like focus or scroll.',
        },
        {
          id: 'registry',
          heading: 'Template Registry',
          body: 'Templates are auto-discovered from routes/**/templates/**/*.tsx at startup. The same registry is shared by SSR and CSR. No manual registration required — just place the file in the right directory.',
        },
      ],
    },
    transition: {
      title: 'Transition',
      sections: [
        {
          id: 'what',
          heading: 'What is a Transition?',
          body: 'A transition is a server-side async generator that yields state frames. It defines the sequence of UI states that should appear as data becomes available. Transitions are the "state machine" of your page.',
        },
        {
          id: 'frames',
          heading: 'Frame Types',
          body: 'Full frames (full: true or omitted) replace all active states. Partial frames (full: false) merge changes via "changed" and "removed" arrays. The first frame must be full. Frames are streamed as NDJSON over HTTP POST.',
        },
        {
          id: 'progressive',
          heading: 'Progressive Construction',
          body: 'Yield frames as data arrives: loading state first, then content, then supplementary data. The UI constructs itself progressively. No loading flags needed — the stream IS the loading sequence.',
        },
      ],
    },
    action: {
      title: 'Action',
      sections: [
        {
          id: 'what',
          heading: 'What is an Action?',
          body: 'An action is a declarative trigger that connects user interaction to a server transition. Add data-action="name" to any element — the engine handles event delegation, transition invocation, and pending states automatically.',
        },
        {
          id: 'binding',
          heading: 'Declarative Binding',
          body: 'Use data-action for the transition name, data-params for JSON parameters, and data-pending-targets to scope which anchors show pending state. Forms with data-action automatically serialize and submit field data.',
        },
        {
          id: 'lifecycle',
          heading: 'Action Lifecycle',
          body: 'Click → engine reads attributes → abort previous transition → add data-pending → POST /transition/:name → first frame arrives → remove data-pending → frames apply → done. The concurrency policy is "abort previous".',
        },
      ],
    },
  },
  ko: {
    surface: {
      title: 'Surface',
      sections: [
        {
          id: 'what',
          heading: 'Surface란?',
          body: 'Surface는 페이지 셸입니다 — <h-state> 앵커와 정적 구조를 선언하는 순수 HTML 문자열입니다. Surface는 동적 콘텐츠가 나타날 수 있는 위치를 정의하며, 내용 자체는 포함하지 않습니다.',
        },
        {
          id: 'authoring',
          heading: 'Surface 작성하기',
          body: 'Surface는 stateSlots(), joinSurface(), baseSurface() 같은 헬퍼를 사용하여 TypeScript 문자열 빌더로 작성합니다. 공유 레이아웃(header, error)과 페이지별 슬롯을 포함하는 전체 HTML 문서를 구성합니다.',
        },
        {
          id: 'decision',
          heading: 'Surface vs Template 결정',
          body: '"이 콘텐츠가 사용자가 이 페이지에 있는 동안 변할까?"라고 물어보세요. 아니오면 surface에 넣고, 예이면 <h-state> 앵커와 template을 만드세요. 확실하지 않으면 template을 사용하세요 — surface로 되돌리기는 간단합니다.',
        },
      ],
    },
    template: {
      title: 'Template',
      sections: [
        {
          id: 'what',
          heading: 'Template이란?',
          body: 'Template은 <h-state> 앵커 안에서 렌더링되는 TSX 프로젝션 컴포넌트입니다. 서버에서 상태 프레임을 통해 데이터를 받아 DOM으로 투영합니다. 기본적으로 무상태입니다.',
        },
        {
          id: 'authoring',
          heading: 'Template 작성하기',
          body: 'defineTemplate(name, Component)으로 template을 등록합니다. 컴포넌트는 상태 프레임의 데이터와 일치하는 타입된 props를 받습니다. 순수 무상태 함수를 선호하세요 — mount/lmount는 포커스나 스크롤 같은 클라이언트 전용 UI 상태에만 사용합니다.',
        },
        {
          id: 'registry',
          heading: 'Template Registry',
          body: 'Template은 시작 시 routes/**/templates/**/*.tsx에서 자동 발견됩니다. 동일한 레지스트리가 SSR과 CSR에서 공유됩니다. 수동 등록이 필요 없으며, 올바른 디렉토리에 파일을 배치하면 됩니다.',
        },
      ],
    },
    transition: {
      title: 'Transition',
      sections: [
        {
          id: 'what',
          heading: 'Transition이란?',
          body: 'Transition은 상태 프레임을 yield하는 서버 측 async generator입니다. 데이터가 도착할 때 나타나야 하는 UI 상태의 시퀀스를 정의합니다. Transition이 곧 페이지의 "상태 머신"입니다.',
        },
        {
          id: 'frames',
          heading: '프레임 유형',
          body: 'Full 프레임(full: true 또는 생략)은 모든 활성 상태를 교체합니다. Partial 프레임(full: false)은 "changed"와 "removed" 배열을 통해 변경사항을 병합합니다. 첫 프레임은 반드시 full이어야 합니다. 프레임은 HTTP POST를 통해 NDJSON으로 스트리밍됩니다.',
        },
        {
          id: 'progressive',
          heading: '점진적 구성',
          body: '데이터가 도착하는 대로 프레임을 yield합니다: 먼저 로딩 상태, 그 다음 콘텐츠, 마지막으로 보충 데이터. UI가 점진적으로 자체 구성됩니다. 로딩 플래그가 필요 없습니다 — 스트림 자체가 로딩 시퀀스입니다.',
        },
      ],
    },
    action: {
      title: 'Action',
      sections: [
        {
          id: 'what',
          heading: 'Action이란?',
          body: 'Action은 사용자 상호작용을 서버 transition에 연결하는 선언적 트리거입니다. 아무 요소에나 data-action="name"을 추가하면 엔진이 이벤트 위임, transition 호출, pending 상태를 자동 처리합니다.',
        },
        {
          id: 'binding',
          heading: '선언적 바인딩',
          body: 'transition 이름에 data-action, JSON 파라미터에 data-params, pending 상태 범위 제한에 data-pending-targets를 사용합니다. data-action이 있는 form은 자동으로 필드 데이터를 직렬화하여 제출합니다.',
        },
        {
          id: 'lifecycle',
          heading: 'Action 생명주기',
          body: '클릭 → 엔진이 속성 읽기 → 이전 transition abort → data-pending 추가 → POST /transition/:name → 첫 프레임 도착 → data-pending 제거 → 프레임 적용 → done. 동시성 정책은 "abort previous"입니다.',
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
  const items = ['surface', 'template', 'transition', 'action'];
  return {
    'page:header': {
      title: guide ? `${lang === 'ko' ? '가이드' : 'Guide'}: ${guide.title}` : 'Guide',
      nav: 'guide',
      lang,
    },
    'guide:toc': { slug, items },
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

// ── Switch-lang: page content lookup by route key ──

export type PageKey = 'home' | 'guide' | 'streaming' | 'actions' | 'search';

export function pageContent(
  page: PageKey,
  lang: Lang,
  params?: Record<string, unknown>
): Record<string, any> {
  switch (page) {
    case 'home':
      return homeContent(lang);
    case 'guide': {
      const slug = (params?.slug as string) ?? 'surface';
      const guide = guideContent(slug, lang);
      const items = ['surface', 'template', 'transition', 'action'];
      return {
        'page:header': {
          title: guide ? `${lang === 'ko' ? '가이드' : 'Guide'}: ${guide.title}` : 'Guide',
          nav: 'guide',
          lang,
        },
        'guide:toc': { slug, items },
        'guide:content': guide
          ? { slug, loading: false, title: guide.title, sections: guide.sections }
          : { slug, loading: false, title: slug },
      };
    }
    case 'streaming':
      return streamingContent(lang);
    case 'actions':
      return actionsContent(lang);
    case 'search':
      return { ...searchContent(lang), 'search:results': undefined };
    default:
      return homeContent(lang);
  }
}

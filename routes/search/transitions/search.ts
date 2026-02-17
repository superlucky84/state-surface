import type { StateFrame } from '../../../shared/protocol.js';
import { defineTransition } from '../../../server/transition.js';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

type SearchableItem = {
  title: string;
  description: string;
  href: string;
  tags: string[];
};

const FEATURES: SearchableItem[] = [
  {
    title: 'Surface',
    description: 'Page shell with <h-state> anchors declared as plain HTML strings.',
    href: '/guide/surface',
    tags: ['surface', 'layout', 'html', 'anchor', 'h-state', 'shell'],
  },
  {
    title: 'Template',
    description: 'TSX projection components that render inside each <h-state> anchor.',
    href: '/guide/template',
    tags: ['template', 'tsx', 'projection', 'component', 'render'],
  },
  {
    title: 'Transition',
    description: 'Server-side async generators that yield state frames progressively.',
    href: '/guide/transition',
    tags: ['transition', 'stream', 'frame', 'ndjson', 'generator', 'server'],
  },
  {
    title: 'Action',
    description: 'Declarative triggers via data-action attributes for transition invocation.',
    href: '/guide/action',
    tags: ['action', 'data-action', 'click', 'submit', 'form', 'pending'],
  },
  {
    title: 'Streaming Demo',
    description: 'Full/partial frames, removed keys, and error frames in real time.',
    href: '/features/streaming',
    tags: ['streaming', 'full', 'partial', 'removed', 'error', 'frame', 'demo'],
  },
  {
    title: 'Actions Playground',
    description: 'Button actions, form submissions, scoped pending, and multiple actions.',
    href: '/features/actions',
    tags: ['action', 'button', 'form', 'pending', 'scoped', 'playground', 'demo'],
  },
  {
    title: 'Full Frame',
    description: 'Declares complete UI state. Replaces all activeStates. First frame must be full.',
    href: '/features/streaming',
    tags: ['full', 'frame', 'replace', 'state'],
  },
  {
    title: 'Partial Frame',
    description: 'Merges changes via "changed" and "removed" arrays into existing state.',
    href: '/features/streaming',
    tags: ['partial', 'frame', 'changed', 'removed', 'merge'],
  },
  {
    title: 'Hydration',
    description: 'Per <h-state> root hydration with SSR hash mismatch fallback.',
    href: '/guide/template',
    tags: ['hydration', 'ssr', 'hash', 'boundary'],
  },
  {
    title: 'Abort Previous',
    description: 'Starting a new transition cancels the previous in-flight stream.',
    href: '/features/streaming',
    tags: ['abort', 'cancel', 'concurrency', 'previous'],
  },
  {
    title: 'Pending State',
    description: 'data-pending attribute on anchors during transition, removed on first frame.',
    href: '/features/actions',
    tags: ['pending', 'data-pending', 'loading', 'spinner'],
  },
  {
    title: 'Boot Auto-Run',
    description: 'SSR renders initial state, then client auto-runs transition after hydration.',
    href: '/guide/transition',
    tags: ['boot', 'auto', 'ssr', 'hydration', 'initial'],
  },
];

function matchScore(item: SearchableItem, query: string): number {
  const q = query.toLowerCase();
  if (item.title.toLowerCase().includes(q)) return 3;
  if (item.tags.some(t => t.includes(q))) return 2;
  if (item.description.toLowerCase().includes(q)) return 1;
  return 0;
}

async function* search(
  params: Record<string, unknown>
): AsyncGenerator<StateFrame, void, unknown> {
  const query = (params.query as string) ?? '';

  // Frame 1: full — show header + input + loading results
  yield {
    type: 'state',
    states: {
      'page:header': { title: 'Search', nav: 'search' },
      'search:input': { query },
      'search:results': { loading: true, query },
    },
  };

  await delay(300);

  // Frame 2: partial — update results only
  const items = query
    ? FEATURES.map(f => ({ ...f, score: matchScore(f, query) }))
        .filter(f => f.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ score: _score, tags: _tags, ...rest }) => rest)
    : FEATURES.map(({ tags: _tags, ...rest }) => rest);

  yield {
    type: 'state',
    full: false,
    states: {
      'search:results': { loading: false, query, items },
    },
    changed: ['search:results'],
  };

  yield { type: 'done' };
}

export default defineTransition('search', search);

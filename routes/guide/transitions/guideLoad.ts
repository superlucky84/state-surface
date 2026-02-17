import type { StateFrame } from '../../../shared/protocol.js';
import { defineTransition } from '../../../server/transition.js';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const GUIDE_DATA: Record<string, { title: string; sections: { id: string; heading: string; body: string }[] }> = {
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
};

async function* guideLoad(
  params: Record<string, unknown>
): AsyncGenerator<StateFrame, void, unknown> {
  const slug = (params.slug as string) ?? 'surface';
  const guide = GUIDE_DATA[slug];

  if (!guide) {
    yield {
      type: 'error',
      message: `Guide "${slug}" not found`,
      template: 'system:error',
      data: { message: `Guide "${slug}" not found` },
    };
    return;
  }

  const items = ['surface', 'template', 'transition', 'action'];

  // Frame 1: full — TOC + loading content
  yield {
    type: 'state',
    states: {
      'page:header': { title: `Guide: ${guide.title}`, nav: 'guide' },
      'guide:toc': { slug, items },
      'guide:content': { slug, loading: true, title: guide.title },
    },
  };

  await delay(300);

  // Frame 2: partial — content loaded
  yield {
    type: 'state',
    full: false,
    states: {
      'guide:content': {
        slug,
        loading: false,
        title: guide.title,
        sections: guide.sections,
      },
    },
    changed: ['guide:content'],
  };

  yield { type: 'done' };
}

export default defineTransition('guide-load', guideLoad);

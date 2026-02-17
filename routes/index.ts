import type { RouteModule } from '../shared/routeModule.js';
import { baseSurface, joinSurface, stateSlots } from '../layouts/surface.js';

export default {
  layout: stateScript => {
    const body = joinSurface(
      '<main class="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-8 pt-4 md:pt-6">',
      stateSlots('page:hero', 'page:concepts', 'page:features'),
      '</main>'
    );
    return baseSurface(body, stateScript);
  },

  initial: () => ({
    'page:header': { title: 'StateSurface', nav: 'home' },
    'page:hero': {
      badge: 'State-Layout Mapping Runtime',
      title: 'StateSurface',
      description:
        'Server owns state. Client owns DOM projection. Pages are MPA, in-page updates come from NDJSON state streams. Define surfaces, templates, transitions, and actions — the engine handles the rest.',
      primaryLabel: 'Read the Guide',
      primaryHref: '/guide/surface',
      secondaryLabel: 'Try Streaming Demo',
      secondaryHref: '/features/streaming',
    },
    'page:concepts': {
      concepts: [
        {
          key: 'surface',
          title: 'Surface',
          description:
            'Page shell with <h-state> anchors declared as plain HTML strings. Surfaces define structure — slots and layout, no business content.',
          href: '/guide/surface',
        },
        {
          key: 'template',
          title: 'Template',
          description:
            'TSX projection components that render inside each <h-state> anchor. Templates are stateless by default — server state drives all content.',
          href: '/guide/template',
        },
        {
          key: 'transition',
          title: 'Transition',
          description:
            'Server-side async generators that yield state frames. Full frames declare complete UI state; partial frames merge changes progressively.',
          href: '/guide/transition',
        },
        {
          key: 'action',
          title: 'Action',
          description:
            'Declarative triggers via data-action attributes. No JS event wiring in user code — the engine handles delegation, pending states, and abort.',
          href: '/guide/action',
        },
      ],
    },
    'page:features': {
      features: [
        {
          title: 'Streaming Demo',
          description: 'Watch full/partial frames, removed keys, and error frames in real time.',
          href: '/features/streaming',
        },
        {
          title: 'Actions Playground',
          description:
            'Try button actions, form submissions, scoped pending, and multiple actions.',
          href: '/features/actions',
        },
        {
          title: 'Search',
          description: 'Search StateSurface features and concepts with form-based actions.',
          href: '/search',
        },
      ],
    },
  }),
} satisfies RouteModule;

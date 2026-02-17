import type { StateFrame } from '../../../../shared/protocol.js';
import { defineTransition } from '../../../../server/transition.js';
import { isValidLang } from '../../../../shared/i18n.js';
import type { Lang } from '../../../../shared/i18n.js';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function* streamDemo(
  params: Record<string, unknown>
): AsyncGenerator<StateFrame, void, unknown> {
  const mode = (params.mode as string) ?? 'full-sequence';
  const lang: Lang = isValidLang(params.lang) ? params.lang : 'en';
  const headerTitle = lang === 'ko' ? '스트리밍 데모' : 'Streaming Demo';

  if (mode === 'error-demo') {
    // Demonstrate error frame
    yield {
      type: 'state',
      states: {
        'page:header': { title: headerTitle, nav: 'streaming', lang },
        'demo:controls': {
          description: 'Error demo in progress...',
        },
        'demo:timeline': {
          frames: [{ type: 'state', label: 'Full frame sent', ts: Date.now() }],
        },
        'demo:output': { activeKeys: ['demo:controls', 'demo:timeline', 'demo:output'] },
      },
    };

    await delay(500);

    yield {
      type: 'error',
      message: 'Intentional error to demonstrate error frame handling',
      template: 'system:error',
      data: { message: 'This is a demonstration error frame. In real apps, transitions can yield error frames when something goes wrong.' },
    };
    return;
  }

  // Default: full sequence demonstrating all frame types
  const ts = Date.now();

  // Frame 1: Full frame — establishes complete state
  yield {
    type: 'state',
    states: {
      'page:header': { title: headerTitle, nav: 'streaming', lang },
      'demo:controls': {
        description: 'Streaming in progress... Full frame sent.',
      },
      'demo:timeline': {
        frames: [
          { type: 'full', label: 'Full frame: established 3 slots', ts },
        ],
      },
      'demo:output': {
        activeKeys: ['demo:controls', 'demo:timeline', 'demo:output'],
        detail: 'All slots populated by full frame.',
      },
    },
  };

  await delay(600);

  // Frame 2: Partial frame — change timeline + output
  yield {
    type: 'state',
    full: false,
    states: {
      'demo:timeline': {
        frames: [
          { type: 'full', label: 'Full frame: established 3 slots', ts },
          { type: 'partial-changed', label: 'Partial frame: changed timeline + output', ts: Date.now() },
        ],
      },
      'demo:output': {
        activeKeys: ['demo:controls', 'demo:timeline', 'demo:output'],
        detail: 'Timeline and output updated by partial frame. Controls unchanged.',
      },
    },
    changed: ['demo:timeline', 'demo:output'],
  };

  await delay(600);

  // Frame 3: Partial frame with removed — remove output, keep others
  yield {
    type: 'state',
    full: false,
    states: {
      'demo:timeline': {
        frames: [
          { type: 'full', label: 'Full frame: established 3 slots', ts },
          { type: 'partial-changed', label: 'Partial frame: changed timeline + output', ts: ts + 600 },
          { type: 'partial-removed', label: 'Partial frame: removed output slot', ts: Date.now() },
        ],
      },
    },
    changed: ['demo:timeline'],
    removed: ['demo:output'],
  };

  await delay(600);

  // Frame 4: Full frame — restore everything (full supersedes)
  yield {
    type: 'state',
    states: {
      'page:header': { title: headerTitle, nav: 'streaming', lang },
      'demo:controls': {
        description: 'Sequence complete! All frame types demonstrated. Try again or trigger an error.',
      },
      'demo:timeline': {
        frames: [
          { type: 'full', label: 'Full frame: established 3 slots', ts },
          { type: 'partial-changed', label: 'Partial: changed timeline + output', ts: ts + 600 },
          { type: 'partial-removed', label: 'Partial: removed output slot', ts: ts + 1200 },
          { type: 'full', label: 'Full frame: restored all slots', ts: Date.now() },
        ],
      },
      'demo:output': {
        activeKeys: ['demo:controls', 'demo:timeline', 'demo:output'],
        detail: 'Full frame restored all slots. Removed output is back.',
      },
    },
  };

  yield { type: 'done' };
}

export default defineTransition('stream-demo', streamDemo);

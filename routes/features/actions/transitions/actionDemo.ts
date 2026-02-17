import type { StateFrame } from '../../../../shared/protocol.js';
import { defineTransition } from '../../../../server/transition.js';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function* actionDemo(
  params: Record<string, unknown>
): AsyncGenerator<StateFrame, void, unknown> {
  const actionType = (params.type as string) ?? 'button';
  const message = (params.message as string) ?? '';
  const ts = Date.now();

  // Frame 1: full — show action received + log entry
  yield {
    type: 'state',
    states: {
      'page:header': { title: 'Actions Playground', nav: 'actions' },
      'actions:playground': {
        lastAction: actionType,
        lastParams: params,
        processing: true,
      },
      'actions:log': {
        entries: [
          {
            id: ts,
            action: actionType,
            params: JSON.stringify(params),
            status: 'processing',
            ts,
          },
        ],
      },
    },
  };

  await delay(800);

  // Frame 2: partial — processing complete
  yield {
    type: 'state',
    full: false,
    states: {
      'actions:playground': {
        lastAction: actionType,
        lastParams: params,
        processing: false,
        result: actionType === 'form'
          ? `Form received: "${message}"`
          : actionType === 'scoped'
            ? 'Only the log was marked pending (scoped)'
            : `Button action "${actionType}" processed`,
      },
      'actions:log': {
        entries: [
          {
            id: ts,
            action: actionType,
            params: JSON.stringify(params),
            status: 'done',
            ts,
          },
        ],
      },
    },
    changed: ['actions:playground', 'actions:log'],
  };

  yield { type: 'done' };
}

export default defineTransition('action-demo', actionDemo);

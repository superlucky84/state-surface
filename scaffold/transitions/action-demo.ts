import type { SurfaceContext } from 'state-surface/server';
import { defineTransition } from 'state-surface/server';
import type { StateFrame } from 'state-surface';
import { getLang, isValidLang } from '../shared/i18n.js';
import type { Lang } from '../shared/i18n.js';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function* actionDemo(
  params: Record<string, unknown>,
  ctx: SurfaceContext
): AsyncGenerator<StateFrame, void, unknown> {
  const actionType = (params.type as string) ?? 'button';
  const message = (params.message as string) ?? '';
  const lang: Lang = isValidLang(params.lang) ? params.lang : getLang(ctx);
  params = { ...params, lang };
  const ts = Date.now();

  // Frame 1: full — show action received + log entry
  yield {
    type: 'state',
    states: {
      'actions:playground': {
        lastAction: actionType,
        lastParams: params,
        processing: true,
        lang,
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
        lang,
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
        lang,
        result:
          actionType === 'form'
            ? lang === 'ko'
              ? `폼 수신: "${message}"`
              : `Form received: "${message}"`
            : actionType === 'scoped'
              ? lang === 'ko'
                ? '로그만 pending 표시됨 (스코프드)'
                : 'Only the log was marked pending (scoped)'
              : lang === 'ko'
                ? `버튼 액션 "${actionType}" 처리 완료`
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
        lang,
      },
    },
    changed: ['actions:playground', 'actions:log'],
  };
}

// Declared targets: a slow playground action runs in parallel with a like (DC-11).
export default defineTransition({
  targets: ['actions:playground', 'actions:log'],
  handler: actionDemo,
});

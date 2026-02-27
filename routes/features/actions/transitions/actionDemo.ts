import type { StateFrame } from '../../../../engine/shared/protocol.js';
import { defineTransition } from '../../../../engine/server/transition.js';
import { isValidLang } from '../../../../shared/i18n.js';
import type { Lang } from '../../../../shared/i18n.js';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function* actionDemo(
  params: Record<string, unknown>
): AsyncGenerator<StateFrame, void, unknown> {
  const actionType = (params.type as string) ?? 'button';
  const message = (params.message as string) ?? '';
  const lang: Lang = isValidLang(params.lang) ? params.lang : 'en';
  const headerTitle = lang === 'ko' ? '액션 플레이그라운드' : 'Actions Playground';
  const ts = Date.now();

  // Frame 1: full — show action received + log entry
  yield {
    type: 'state',
    states: {
      'page:header': { title: headerTitle, nav: 'actions', lang },
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
        result: actionType === 'form'
          ? (lang === 'ko' ? `폼 수신: "${message}"` : `Form received: "${message}"`)
          : actionType === 'scoped'
            ? (lang === 'ko' ? '로그만 pending 표시됨 (스코프드)' : 'Only the log was marked pending (scoped)')
            : (lang === 'ko' ? `버튼 액션 "${actionType}" 처리 완료` : `Button action "${actionType}" processed`),
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

  yield { type: 'done' };
}

export default defineTransition('action-demo', actionDemo);

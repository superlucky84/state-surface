import { defineTransition } from 'state-surface/server';
import type { StateFrame } from 'state-surface';
import { isValidLang } from '../../../../shared/i18n.js';
import type { Lang } from '../../../../shared/i18n.js';
import { streamingContent } from '../../../../shared/content.js';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function* streamDemo(
  params: Record<string, unknown>
): AsyncGenerator<StateFrame, void, unknown> {
  const mode = (params.mode as string) ?? 'full-sequence';
  const lang: Lang = isValidLang(params.lang) ? params.lang : 'en';
  const ko = lang === 'ko';
  const base = streamingContent(lang);

  if (mode === 'error-demo') {
    // Demonstrate error frame
    yield {
      type: 'state',
      states: {
        'page:header': base['page:header'],
        'demo:controls': {
          ...base['demo:controls'],
          description: ko ? '에러 데모 진행 중...' : 'Error demo in progress...',
        },
        'demo:timeline': {
          frames: [{ type: 'state', label: ko ? 'Full 프레임 전송됨' : 'Full frame sent', ts: Date.now() }],
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
      'page:header': base['page:header'],
      'demo:controls': {
        ...base['demo:controls'],
        description: ko ? '스트리밍 진행 중... Full 프레임 전송됨.' : 'Streaming in progress... Full frame sent.',
      },
      'demo:timeline': {
        frames: [
          { type: 'full', label: ko ? 'Full 프레임: 3개 슬롯 생성' : 'Full frame: established 3 slots', ts },
        ],
      },
      'demo:output': {
        activeKeys: ['demo:controls', 'demo:timeline', 'demo:output'],
        detail: ko ? 'Full 프레임이 모든 슬롯을 채웠습니다.' : 'All slots populated by full frame.',
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
          { type: 'full', label: ko ? 'Full 프레임: 3개 슬롯 생성' : 'Full frame: established 3 slots', ts },
          { type: 'partial-changed', label: ko ? 'Partial 프레임: timeline + output 변경' : 'Partial frame: changed timeline + output', ts: Date.now() },
        ],
      },
      'demo:output': {
        activeKeys: ['demo:controls', 'demo:timeline', 'demo:output'],
        detail: ko ? 'Partial 프레임이 timeline과 output을 갱신. controls는 그대로.' : 'Timeline and output updated by partial frame. Controls unchanged.',
      },
    },
    changed: ['demo:timeline', 'demo:output'],
  };

  await delay(600);

  // Frame 3: Accumulate frame — append new entry to timeline (array concat)
  const accTs = Date.now();
  yield {
    type: 'state',
    accumulate: true,
    states: {
      'demo:timeline': {
        frames: [{ type: 'accumulate', label: ko ? 'Accumulate: timeline에 항목 추가 (배열 concat)' : 'Accumulate: appended to timeline (array concat)', ts: accTs }],
      },
    },
  };

  await delay(600);

  // Frame 4: Partial frame with removed — remove output, keep others
  yield {
    type: 'state',
    full: false,
    states: {
      'demo:timeline': {
        frames: [
          { type: 'full', label: ko ? 'Full 프레임: 3개 슬롯 생성' : 'Full frame: established 3 slots', ts },
          { type: 'partial-changed', label: ko ? 'Partial 프레임: timeline + output 변경' : 'Partial frame: changed timeline + output', ts: ts + 600 },
          { type: 'accumulate', label: ko ? 'Accumulate: timeline에 항목 추가 (배열 concat)' : 'Accumulate: appended to timeline (array concat)', ts: accTs },
          { type: 'partial-removed', label: ko ? 'Partial 프레임: output 슬롯 제거' : 'Partial frame: removed output slot', ts: Date.now() },
        ],
      },
    },
    changed: ['demo:timeline'],
    removed: ['demo:output'],
  };

  await delay(600);

  // Frame 5: Full frame — restore everything (full supersedes)
  yield {
    type: 'state',
    states: {
      'page:header': base['page:header'],
      'demo:controls': {
        ...base['demo:controls'],
        description: ko
          ? '시퀀스 완료! 모든 프레임 유형을 시연했습니다. 다시 실행하거나 에러를 발생시켜 보세요.'
          : 'Sequence complete! All frame types demonstrated. Try again or trigger an error.',
      },
      'demo:timeline': {
        frames: [
          { type: 'full', label: ko ? 'Full 프레임: 3개 슬롯 생성' : 'Full frame: established 3 slots', ts },
          { type: 'partial-changed', label: ko ? 'Partial: timeline + output 변경' : 'Partial: changed timeline + output', ts: ts + 600 },
          { type: 'accumulate', label: ko ? 'Accumulate: timeline에 항목 추가' : 'Accumulate: appended to timeline', ts: accTs },
          { type: 'partial-removed', label: ko ? 'Partial: output 슬롯 제거' : 'Partial: removed output slot', ts: ts + 1800 },
          { type: 'full', label: ko ? 'Full 프레임: 모든 슬롯 복원' : 'Full frame: restored all slots', ts: Date.now() },
        ],
      },
      'demo:output': {
        activeKeys: ['demo:controls', 'demo:timeline', 'demo:output'],
        detail: ko ? 'Full 프레임이 모든 슬롯을 복원. 제거된 output이 돌아왔습니다.' : 'Full frame restored all slots. Removed output is back.',
      },
    },
  };

  yield { type: 'done' };
}

export default defineTransition('stream-demo', streamDemo);

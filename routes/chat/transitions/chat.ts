import { defineTransition } from 'state-surface';
import type { StateFrame } from 'state-surface';
import { isValidLang } from '../../../shared/i18n.js';
import type { Lang } from '../../../shared/i18n.js';


type Message = { id: string; role: 'user' | 'bot'; text: string };

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const BOT_RESPONSES: Record<string, { en: string; ko: string }> = {
  surface: {
    en: 'A Surface is the page shell — plain HTML strings that declare h-state anchors and static layout. Surfaces define where dynamic content can appear without containing any business content themselves.',
    ko: 'Surface는 페이지 셸입니다 — h-state 앵커와 정적 레이아웃을 선언하는 순수 HTML 문자열. Surface는 동적 콘텐츠가 나타날 위치를 정의하며, 비즈니스 콘텐츠를 직접 포함하지는 않습니다.',
  },
  template: {
    en: 'A Template is a TSX projection component that renders inside an h-state anchor. Templates receive data from server state frames and are stateless by default — server state drives all content.',
    ko: 'Template은 h-state 앵커 안에서 렌더링되는 TSX 프로젝션 컴포넌트입니다. 서버 상태 프레임에서 데이터를 받으며 기본적으로 무상태입니다 — 서버 상태가 모든 콘텐츠를 결정합니다.',
  },
  transition: {
    en: 'A Transition is a server-side async generator that yields state frames. Full frames replace all UI state; partial frames merge changes progressively via NDJSON streaming over HTTP POST.',
    ko: 'Transition은 상태 프레임을 yield하는 서버 측 async generator입니다. Full 프레임은 전체 UI 상태를 교체하고, Partial 프레임은 HTTP POST를 통한 NDJSON 스트리밍으로 변경사항을 점진적으로 병합합니다.',
  },
  action: {
    en: 'An Action is a declarative trigger via data-action attributes. No JS event wiring needed — the engine handles event delegation, pending states, and the abort-previous concurrency policy automatically.',
    ko: 'Action은 data-action 속성을 통한 선언적 트리거입니다. JS 이벤트 바인딩이 불필요합니다 — 엔진이 이벤트 위임, pending 상태, abort-previous 동시성 정책을 자동 처리합니다.',
  },
  streaming: {
    en: 'StateSurface streams state as NDJSON over HTTP POST. The server yields frames one by one as data becomes available, and the client applies them progressively — no WebSockets, no special protocol.',
    ko: 'StateSurface는 HTTP POST를 통한 NDJSON으로 상태를 스트리밍합니다. 서버가 데이터가 준비되는 대로 프레임을 하나씩 yield하면 클라이언트가 점진적으로 적용합니다 — WebSocket 없이, 특별한 프로토콜 없이.',
  },
  hydration: {
    en: 'Hydration in StateSurface is per h-state root, not full-page. SSR generates a sha256 hash for each anchor. On client boot, hashes are compared — mismatch triggers a client re-render from state.',
    ko: 'StateSurface의 하이드레이션은 전체 페이지가 아닌 h-state 루트별로 이루어집니다. SSR이 각 앵커에 sha256 해시를 생성합니다. 클라이언트 부트 시 해시를 비교하여 불일치 시 상태에서 재렌더링합니다.',
  },
  abort: {
    en: 'The abort-previous policy means starting a new transition immediately cancels any in-flight stream. In this chatbot, sending a new message while the bot is responding cancels the current generation.',
    ko: 'abort-previous 정책은 새 transition을 시작하면 진행 중인 스트림을 즉시 취소함을 의미합니다. 이 챗봇에서 봇이 응답하는 동안 새 메시지를 보내면 현재 생성이 취소됩니다.',
  },
  ndjson: {
    en: 'NDJSON (Newline-Delimited JSON) is the wire format for state frames. Each line is a complete JSON object. The client parses lines as they arrive, enabling true streaming without buffering the full response.',
    ko: 'NDJSON(줄바꿈 구분 JSON)은 상태 프레임의 전송 형식입니다. 각 줄이 완전한 JSON 객체입니다. 클라이언트는 줄이 도착하는 대로 파싱하여 전체 응답을 버퍼링하지 않고 진정한 스트리밍을 실현합니다.',
  },
  accumulate: {
    en: 'The accumulate frame is a third frame type alongside full and partial. The server sends only delta data; the runtime stacks it into activeStates (arrays concat, strings concat). Templates stay pure functions — no local state needed.',
    ko: 'accumulate 프레임은 full/partial과 함께하는 세 번째 프레임 타입입니다. 서버가 delta만 전송하면 런타임이 activeStates에 누적합니다(배열 concat, 문자열 concat). 템플릿은 순수 함수로 유지됩니다 — 로컬 state 불필요.',
  },
};

function makeBotResponse(userText: string, lang: Lang): string {
  const lower = userText.toLowerCase();
  for (const [key, resp] of Object.entries(BOT_RESPONSES)) {
    if (lower.includes(key)) return resp[lang];
  }
  return lang === 'ko'
    ? 'StateSurface에 대해 질문해보세요! 예: surface, template, transition, action, streaming, hydration, abort, ndjson, accumulate'
    : 'Try asking about: surface, template, transition, action, streaming, hydration, abort, ndjson, or accumulate!';
}

async function* chat(
  params: Record<string, unknown>
): AsyncGenerator<StateFrame, void, unknown> {
  const userText = String(params.message ?? '').trim();
  const lang: Lang = isValidLang(params.lang) ? params.lang : 'en';

  if (!userText) {
    yield { type: 'done' };
    return;
  }

  const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text: userText };

  // Partial frame: reset chat:current, clear input, show typing indicator.
  // chat:messages is NOT touched — previous history is preserved.
  yield {
    type: 'state',
    full: false,
    changed: ['chat:current', 'chat:typing', 'chat:input'],
    states: {
      'chat:current': { text: '' },
      'chat:typing': { text: lang === 'ko' ? '입력 중...' : 'Typing...' },
      'chat:input': {
        placeholder: lang === 'ko' ? '메시지를 입력하세요...' : 'Type a message...',
        submitLabel: lang === 'ko' ? '전송' : 'Send',
        hint:
          lang === 'ko'
            ? '새 메시지를 보내면 진행 중인 응답이 취소됩니다 (abort previous 정책).'
            : 'Sending a new message cancels any in-progress response (abort previous policy).',
        lang,
      },
    },
  };

  // Append user message to history via accumulate
  yield {
    type: 'state',
    accumulate: true,
    states: { 'chat:messages': { messages: [userMsg] } },
  };

  await delay(400);

  // Streaming: accumulate frames carry only new chars; runtime concatenates
  // activeStates['chat:current'].text on the client — no local state in template.
  const fullResponse = makeBotResponse(userText, lang);
  const botId = `b-${Date.now()}`;
  let pos = 0;

  while (pos < fullResponse.length) {
    const chunkSize = Math.floor(Math.random() * 4) + 1;
    const nextPos = Math.min(pos + chunkSize, fullResponse.length);
    const delta = fullResponse.slice(pos, nextPos);
    pos = nextPos;
    yield {
      type: 'state',
      accumulate: true,
      states: { 'chat:current': { text: delta } },
    };
    await delay(Math.floor(Math.random() * 30) + 15);
  }

  // Final: append completed bot message to history, remove streaming slot and typing.
  const botMsg: Message = { id: botId, role: 'bot', text: fullResponse };
  yield {
    type: 'state',
    accumulate: true,
    states: { 'chat:messages': { messages: [botMsg] } },
  };

  yield {
    type: 'state',
    full: false,
    states: {},
    removed: ['chat:current', 'chat:typing'],
  };

  yield { type: 'done' };
}

export default defineTransition('chat', chat);

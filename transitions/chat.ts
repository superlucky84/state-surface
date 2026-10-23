import type { SurfaceContext } from 'state-surface/server';
import { defineTransition } from 'state-surface/server';
import type { StateFrame } from 'state-surface';
import { paramLang } from '../shared/i18n.js';
import type { Lang } from '../shared/i18n.js';
import { chatContent } from '../shared/pages.js';
import { appendMessage } from '../shared/chatHistory.server.js';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const BOT_RESPONSES: Record<string, { en: string; ko: string }> = {
  surface: {
    en: 'A Surface is a TSX page function that places <Slot> boundaries. Each slot renders an <h-state> anchor, and the rest is layout the server renders. Surfaces define where state appears; the components inside the slots render it.',
    ko: 'Surface는 <Slot> 경계를 배치하는 TSX 페이지 함수입니다. 각 슬롯은 <h-state> 앵커로 렌더링되고 나머지는 서버가 렌더링하는 레이아웃입니다. Surface는 상태가 나타날 위치를 정하고, 슬롯 안의 컴포넌트가 그 상태를 렌더링합니다.',
  },
  template: {
    en: 'A Template is a TSX projection component that renders inside an h-state anchor. Templates receive data from server state frames and are stateless by default — server state drives all content.',
    ko: 'Template은 h-state 앵커 안에서 렌더링되는 TSX 프로젝션 컴포넌트입니다. 서버 상태 프레임에서 데이터를 받으며 기본적으로 무상태입니다 — 서버 상태가 모든 콘텐츠를 결정합니다.',
  },
  transition: {
    en: 'A Transition is a server-side async generator that yields state frames. Full frames replace the state of the transition targets (other slots stay); partial frames update selected slots progressively, streamed as NDJSON over HTTP POST.',
    ko: 'Transition은 상태 프레임을 yield하는 서버 측 async generator입니다. Full 프레임은 transition targets의 상태를 교체하고(나머지 슬롯은 그대로), Partial 프레임은 선택한 슬롯을 점진적으로 갱신하며, HTTP POST 위 NDJSON으로 스트리밍됩니다.',
  },
  action: {
    en: 'An Action is a declarative trigger via data-action attributes. No JS event wiring needed — the engine handles event delegation, pending states and target-aware concurrency (the same action or overlapping targets abort, disjoint targets run in parallel) automatically.',
    ko: 'Action은 data-action 속성을 통한 선언적 트리거입니다. JS 이벤트 바인딩이 불필요합니다 — 엔진이 이벤트 위임, pending 상태, targets 기반 동시성(같은 액션·겹치는 targets는 취소, 겹치지 않으면 병렬)을 자동 처리합니다.',
  },
  streaming: {
    en: 'StateSurface streams per-slot updates as NDJSON over HTTP POST. The transition yields frames as data becomes available, the server turns them into patch ops (HTML for server slots, props for client slots), and the browser applies them progressively — no WebSockets.',
    ko: 'StateSurface는 HTTP POST 위 NDJSON으로 슬롯별 갱신을 스트리밍합니다. transition이 데이터가 준비되는 대로 프레임을 yield하면 서버가 patch op(server 슬롯은 HTML, client 슬롯은 props)로 바꾸고, 브라우저가 점진적으로 적용합니다 — WebSocket 없이.',
  },
  hydration: {
    en: 'Hydration in StateSurface is per root, not full-page. Only client slots and islands hydrate, each on its own <h-state> or <h-island> from the props in __SURFACE__; static and server slots ship no component JS, and server slots are updated with server HTML.',
    ko: 'StateSurface의 하이드레이션은 전체 페이지가 아닌 루트별로 이루어집니다. client 슬롯과 아일랜드만 각자의 <h-state> 또는 <h-island>에서 __SURFACE__ props로 하이드레이션하고, static·server 슬롯은 컴포넌트 JS가 없으며 server 슬롯은 서버 HTML로 갱신됩니다.',
  },
  abort: {
    en: 'The abort-previous policy: a new action aborts in-flight requests of the same transition and those whose targets overlap; disjoint targets run in parallel. In this chatbot, sending a new message while the bot is responding cancels the current generation.',
    ko: 'abort-previous 정책: 새 액션은 같은 transition과 targets가 겹치는 진행 중 요청을 취소하고, targets가 겹치지 않으면 병렬로 실행합니다. 이 챗봇에서 봇이 응답하는 동안 새 메시지를 보내면 현재 생성이 취소됩니다.',
  },
  ndjson: {
    en: 'NDJSON (Newline-Delimited JSON) is the wire format: per-slot patch ops, then done or error. Each line is a complete JSON object. The client parses lines as they arrive, enabling true streaming without buffering the full response.',
    ko: 'NDJSON(줄바꿈 구분 JSON)은 전송 형식입니다: 슬롯별 patch op, 마지막에 done 또는 error. 각 줄이 완전한 JSON 객체입니다. 클라이언트는 줄이 도착하는 대로 파싱하여 전체 응답을 버퍼링하지 않고 진정한 스트리밍을 실현합니다.',
  },
  accumulate: {
    en: 'The accumulate frame is a third frame type alongside full and partial. The request reducer on the server merges each delta (arrays concat, strings concat); a server slot is rendered again to HTML, a client slot gets a merge op the browser folds into its props. Templates stay pure functions — no local state needed.',
    ko: 'accumulate 프레임은 full/partial과 함께하는 세 번째 프레임 타입입니다. 서버의 요청 리듀서가 delta를 병합하고(배열·문자열 concat), server 슬롯은 HTML로 다시 렌더되며 client 슬롯은 브라우저가 props에 합치는 merge op을 받습니다. 템플릿은 순수 함수로 유지됩니다 — 로컬 state 불필요.',
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
  params: Record<string, unknown>,
  ctx: SurfaceContext
): AsyncGenerator<StateFrame, void, unknown> {
  const userText = String(params.message ?? '').trim();
  const lang: Lang = paramLang(params);
  // Nothing to send: an empty success (the engine answers `done` only).
  if (!userText) return;

  const content = await chatContent(lang);
  // Written before the first frame, so the session cookie is part of the response.
  const history = appendMessage(ctx, { id: `u-${Date.now()}`, role: 'user', text: userText });

  // Full frame: the history (server slot), an empty streaming bubble (client slot), the
  // typing indicator and a fresh input. These four slots are the transition targets.
  yield {
    type: 'state',
    states: {
      'chat:messages': { ...content['chat:messages'], messages: history },
      'chat:current': { text: '' },
      'chat:typing': { text: lang === 'ko' ? '입력 중...' : 'Typing...' },
      'chat:input': content['chat:input'],
    },
  };

  await delay(400);

  // Streaming: accumulate frames carry only new characters. chat:current is a client slot,
  // so the server sends `merge` ops and the browser concatenates the text.
  const fullResponse = makeBotResponse(userText, lang);
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

  // Final: store the completed bot message, re-render the history, drop the bubble and
  // typing indicator. An aborted request never reaches this point, so it stores nothing.
  const messages = appendMessage(ctx, { id: `b-${Date.now()}`, role: 'bot', text: fullResponse });
  yield {
    type: 'state',
    full: false,
    states: { 'chat:messages': { ...content['chat:messages'], messages } },
    changed: ['chat:messages'],
    removed: ['chat:current', 'chat:typing'],
  };
}

export default defineTransition(chat);

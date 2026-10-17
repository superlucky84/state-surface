---
title: UI Patch
order: 7
demoHref: /examples/ui-patch
demoLabel: UI 패치 데모
---

## 한 줄 요약 {#tldr}

UI Patch는 transition이 슬롯의 외형을 바꾸게 해 줍니다 — 슬롯의 `<h-state>` 엘리먼트에 CSS 클래스를 추가·제거하고 CSS 커스텀 속성을 설정하며, 그 안의 컴포넌트는 다시 렌더링하지 않습니다. `states`는 콘텐츠를, `ui`는 시각적 표현을 결정합니다. 둘은 같은 프레임에 담겨 전달되고, 브라우저는 콘텐츠를 먼저 반영한 뒤 UI를 적용합니다.

## 멘탈 모델 {#analogy}

:::analogy
건물을 생각해 보세요. 템플릿은 인테리어 — 각 방의 가구와 장식입니다. UI Patch는 외벽입니다: 의자 하나 옮기지 않고 벽을 다시 칠하거나 창문 틴팅을 바꿀 수 있습니다. 건물 뼈대(`<h-state>`)는 그 자리에 그대로 있고, 바뀌는 것은 바깥 모습뿐입니다.
:::

왜 상태와 분리할까요? 상태 변경은 다시 렌더링을 일으킵니다: server 슬롯은 `load`와 `render`를 다시 실행해 HTML을 교체하고, client 슬롯의 컴포넌트는 새 props로 갱신됩니다. UI Patch는 이 과정을 모두 건너뜁니다 — 브라우저가 엘리먼트 하나의 클래스와 스타일 속성만 바꿉니다. 컴포넌트는 패치를 받지 않으므로 이를 위한 `tone` prop도, 조건부 클래스 로직도 필요 없습니다.

:::callout{kind="info"}
패치에는 선택 필드가 세 개 있습니다: `classAdd`와 `classRemove`(클래스 이름 배열), `cssVars`(커스텀 속성 → 값). 프레임의 `ui`는 슬롯 이름을 패치 또는 `null`에 매핑하며, 각 항목은 그 슬롯의 **전체** 패치입니다: 다음 항목이 이를 대체하고, `null`은 초기화합니다.
:::

## 사용 시점 {#when}

- 톤과 테마 전환에 사용합니다: 카드의 warning·success·info, 어두운 패널.
- 상태 표시에 사용합니다: 새 행 강조, 에러 테두리, 새 데이터를 불러오는 동안의 `is-stale` 표시.
- CSS가 소비할 수 있는 값에 사용합니다: `--progress: 40%`, `--card-accent: #10b981`.
- 콘텐츠 변경에는 사용하지 마세요 — 그것은 `states`와 template의 역할입니다.
- accumulate 프레임에 `ui`를 넣지 마세요 — 거부됩니다. accumulate 프레임 사이에 `uiChanged`가 있는 partial 프레임을 따로 보내세요.
- 첫 페인트에는 사용하지 마세요 — SSR은 패치를 적용하지 않습니다. 초기 클래스는 `<Slot>`에 적으세요(SSR과 첫 로드 참고).
- 임의의 스타일에는 사용하지 마세요 — 클래스 토큰과 `--*` 변수만 검증을 통과합니다: `style` 문자열도, `url(…)`도 안 됩니다.

## 단계별 가이드 {#steps}

:::sequence
1. 외형은 CSS에 작성합니다: `.tone-warning` 같은 클래스와, `var(--card-accent, #64748b)`처럼 fallback을 둔 변수를 읽는 규칙이나 template 마크업.
2. 슬롯을 갱신 가능하게 만들고 — `<Slot>`에 `mode="server"` 또는 `client:*` 지시자(static 슬롯은 모든 op를 거부) — transition의 `targets`에 넣습니다.
3. full 프레임에서 `states` 옆에 `ui: { 'app:card': { classAdd, classRemove, cssVars } }`를 둡니다. full 프레임은 모든 target의 UI를 설정합니다: 항목이 없는 target은 초기화됩니다.
4. 외형만 바꿀 때는 `full: false`, `states: {}`, `uiChanged: ['app:card']`와 `ui` 항목이 있는 partial 프레임을 yield합니다. 아무것도 렌더링되지 않습니다.
5. 슬롯의 패치를 초기화하려면 `ui: { 'app:card': null }`을 보내거나(partial 프레임이면 `uiChanged`에 포함), full 프레임의 `ui`에서 그 슬롯을 뺍니다.
6. 브라우저는 슬롯 콘텐츠를 반영한 뒤 `<h-state>` 엘리먼트 자체에 패치를 적용합니다: 이전 패치의 `classAdd`와 `cssVars`를 되돌리고, `classRemove`를 제거하고, `classAdd`를 추가하고, `cssVars`를 설정합니다.
:::

## 최소 예제 {#example}

```ts label="✓ 톤 전환 — 콘텐츠와 외형을 한 프레임에"
// transitions/card-tone.ts → data-action="card-tone" data-params='{"tone":"success"}'
import { defineTransition } from 'state-surface/server';
import type { UiPatch } from 'state-surface';

const TONES: Record<string, UiPatch> = {
  warning: {
    classAdd: ['tone-warning'],
    classRemove: ['tone-success'],
    cssVars: { '--card-accent': '#f59e0b' },
  },
  success: {
    classAdd: ['tone-success'],
    classRemove: ['tone-warning'],
    cssVars: { '--card-accent': '#10b981' },
  },
};

export default defineTransition({
  targets: ['app:card'],
  async *handler(params) {
    const tone = params.tone === 'success' ? 'success' : 'warning';
    // Full 프레임: template에는 props, 그 <h-state>에는 패치
    yield {
      type: 'state',
      states: { 'app:card': { tone, label: `Current: ${tone}` } },
      ui: { 'app:card': TONES[tone] },
    };
  },
});
```

:::callout{kind="tip"}
template은 `{ tone, label }`을 props로 받아 콘텐츠를 렌더링합니다. 클래스와 변수는 `<h-state name="app:card">` 엘리먼트 자체가 받습니다 — template은 마크업이나 CSS에서 `var(--card-accent)`를 읽을 뿐, 패치를 전혀 보지 못합니다.
:::

```css label="client/styles.css — 외형은 CSS에"
/* 기본값 먼저: 패치가 없으면 변수가 fallback 값을 사용 */
h-state[name='app:card'] {
  display: block;
  border: 2px solid var(--card-accent, #e2e8f0);
}
h-state.tone-warning {
  background: #fffbeb;
}
h-state.tone-success {
  background: #ecfdf5;
}
h-state.is-saved {
  outline: 2px solid var(--card-accent);
}
```

```ts label="스타일 전용 partial — load도 render도 없음"
// template은 다시 렌더링되지 않음: <h-state> 엘리먼트만 바뀜.
// 항목이 슬롯의 패치를 대체하므로 유지할 것도 다시 적음.
const patch = TONES[tone];
yield {
  type: 'state',
  full: false,
  states: {},
  uiChanged: ['app:card'],
  ui: { 'app:card': { ...patch, classAdd: [...(patch.classAdd ?? []), 'is-saved'] } },
};

// 슬롯의 패치 초기화: 페이지가 렌더링한 클래스로 돌아감
yield {
  type: 'state',
  full: false,
  states: {},
  uiChanged: ['app:card'],
  ui: { 'app:card': null },
};
```

## 실행 시퀀스 {#sequence}

:::diagram{label="ui를 포함한 Full 프레임"}
```text
yield { type: 'state', states: { 'app:card': props }, ui: { 'app:card': patch } }
  │
  ├─ server: reduce → render 'app:card'          // 슬롯 상태는 이 요청 동안만 존재
  ├─ server: ui op for every target              // full 프레임: 항목 없음 → ui: null
  │    → { type: 'patch', reset: true, ops: [
  │         { slot: 'app:card', html },          // 콘텐츠 op 먼저
  │         { slot: 'app:card', ui: patch } ] }  // 그다음 ui op
  ▼
browser: <h-state name="app:card">
  ├─ 1. html → swap the content                  // client 슬롯이면 props
  └─ 2. ui   → patch the element itself
       ├─ undo(previous)                         // 이전 패치의 classAdd와 cssVars
       ├─ classRemove → classList.remove(...)
       ├─ classAdd    → classList.add(...)
       └─ cssVars     → style.setProperty(...)
```
:::

:::diagram{label="스타일 전용 partial (렌더링 없음)"}
```text
yield { type: 'state', full: false, states: {}, uiChanged: ['app:card'],
        ui: { 'app:card': { cssVars: { '--card-accent': '#10b981' } } } }
  │
  ├─ server: no content change                   // load, render, HTML 모두 없음
  │    → { type: 'patch', ops: [{ slot: 'app:card', ui: {…} }] }
  ▼
browser: <h-state name="app:card">
  └─ ui → replace the patch                      // 안쪽 DOM은 그대로
```
:::

## SSR과 첫 로드 {#ssr}

SSR은 UI Patch를 적용하지 않습니다. 패치는 브라우저에만 존재합니다: 서버는 슬롯 상태를 요청 하나 동안만 유지하고, 모든 문서 로드는 페이지가 렌더링한 HTML에서 시작하며, `__SURFACE__`에는 UI 스냅샷이 없습니다. 따라서 첫 외형은 페이지의 몫입니다 — `<Slot>`에 호스트 속성(`class`, `style`, `data-*`, `aria-*`)으로 적으면 SSR이 이를 `<h-state>` 엘리먼트에 씁니다.

```tsx label="첫 외형은 페이지가, 이후 변경은 transition이"
// routes/dashboard.tsx — 서버가 요청마다 첫 외형을 결정
import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Card from './dashboard/_components/card';

export default async function Page(ctx: SurfaceContext) {
  const tone = ctx.cookies.get('tone') === 'success' ? 'success' : 'warning';
  return (
    <html>
      <head>
        <title>Dashboard</title>
      </head>
      <body>
        <Slot name="app:card" mode="server" class={`tone-${tone}`}>
          <Card tone={tone} label={`Current: ${tone}`} />
        </Slot>
      </body>
    </html>
  );
}
```

```html label="SSR 출력"
<h-state name="app:card" class="tone-warning">
  <!-- <Card /> -->
</h-state>
```

:::callout{kind="note"}
패치는 이 속성들 위에 겹쳐집니다. 패치를 교체하거나 초기화하면 그 패치가 한 일만 이름 기준으로 되돌립니다 — 그 `classAdd` 클래스와 `cssVars` — 그래서 SSR 클래스는 남습니다. 기억할 점:

- `classRemove`로 제거한 클래스(예: SSR의 `tone-warning`)는 패치를 초기화해도 돌아오지 않습니다 — 위 예제처럼 각 패치가 다른 톤을 제거하고 자기 톤을 추가하게 하세요.
- SSR과 같은 이름의 패치 클래스나 변수는 패치와 함께 사라집니다.
- `<Boot>` transition의 `ui`는 페이지가 표시된 뒤에 도착합니다 — 실시간 데이터에는 괜찮지만 첫 페인트에는 깜빡임이 보입니다.
- 새로고침 후에도 선택을 유지하려면 서버에 저장하고(예: transition이 첫 프레임 전에 설정하는 쿠키) `<Slot>`에 렌더링하세요.
:::

## 흔한 실수 {#mistakes}

:::warning
accumulate 프레임(`accumulate: true`)에는 `ui`를 넣을 수 없습니다: 프레임이 거부됩니다 — 개발 모드에서는 transition 이름과 프레임 번호와 함께 throw하고, 프로덕션에서는 요청이 에러로 끝납니다. 토큰 스트리밍 중에는 accumulate 프레임 사이에 `uiChanged`가 있는 partial 프레임을 따로 yield하세요.

모든 full 프레임은 target의 UI를 초기화합니다. `ui` 없는 full 프레임은 앞서 보낸 패치를 지웁니다 — 콘텐츠만 바꾸는 갱신은 partial 프레임(`changed`가 있는 `full: false`)으로 보내거나 `ui`를 다시 포함하세요.
:::

:::checklist
- partial 프레임은 패치하는 모든 슬롯을 `uiChanged`에 나열하고, `uiChanged`의 모든 키는 `ui`에 항목이 있습니다.
- 각 항목은 슬롯의 전체 패치입니다 — 유지할 클래스와 변수도 다시 적습니다.
- 클래스 이름은 `A-Z a-z 0-9 _ : / [ ] . -`로 된 단일 토큰입니다: `['badge is-new']`가 아니라 `['badge', 'is-new']`. `#`, `(`, `%`가 들어간 Tailwind 임의 값은 실패합니다 — 색상과 크기는 `cssVars`로 전달합니다.
- `cssVars` 키는 `--`로 시작하고, 값에는 `;` `{` `}` `\` `url(` `expression(`이 없습니다.
- 패치하는 슬롯은 transition의 `targets`에 있고 static이 아닙니다.
- full 프레임에서 패치하는 target에는 `states` 항목도 필요합니다 — `states`에 없는 target은 패치와 함께 제거됩니다.
- 패치 초기화는 반대 클래스를 보내는 대신 `null`로 합니다.
:::

## 트러블슈팅 {#debug}

:::debug{symptom="클래스가 h-state 엘리먼트에 나타나지 않습니다." cause="partial 프레임에 ui는 있지만 uiChanged가 없어 패치가 무시됩니다."}
partial 프레임에서는 `ui` 옆에 `uiChanged: ['app:card']`를 추가하세요. full 프레임은 모든 target의 UI를 설정하므로 `uiChanged`가 필요 없습니다.
:::

:::debug{symptom="콘텐츠를 갱신하면 톤이 사라집니다." cause="갱신이 ui 없는 full 프레임이었고, full 프레임은 모든 target의 UI를 초기화합니다."}
콘텐츠 갱신은 partial 프레임(`full: false`, `changed: ['app:card']`)으로 보내세요 — 슬롯의 패치가 유지됩니다 — 아니면 `ui` 항목을 다시 포함하세요.
:::

:::debug{symptom="스타일 전용 partial이 이전 클래스와 변수를 지웁니다." cause="ui 항목 하나가 슬롯의 전체 패치를 대체합니다."}
화면에 보여야 할 패치 전체를 보내세요. 예를 들어 이전 패치를 펼치고(spread) 거기에 추가합니다.
:::

:::debug{symptom="프레임이 ui 에러로 거부됩니다." cause="accumulate 프레임의 ui, 공백이나 허용되지 않은 문자가 든 클래스, -- 접두사가 없는 cssVars 키나 금지된 값, 또는 static 슬롯."}
메시지에 슬롯과 필드가 나옵니다. `ui`를 partial 프레임으로 옮기고, 클래스 문자열을 토큰으로 나누고, 색상은 `cssVars`로 전달하고, 슬롯에 `mode="server"`나 `client:*` 지시자를 지정하세요.
:::

:::debug{symptom="페이지 로드 후 외형이 깜빡이며 적용되거나, 새로고침하면 사라집니다." cause="첫 외형을 패치(예: Boot transition)로 만들었지만 SSR은 패치를 적용하지 않습니다."}
초기 클래스는 페이지 함수에서 `<Slot>`의 호스트 속성으로 렌더링하세요. 새로고침 후에도 유지돼야 하는 사용자 선택은 서버(쿠키)에 저장하세요.
:::

## 다음: 직접 실습 {#next}

[UI 패치 데모](/ko/examples/ui-patch)를 열어 보세요: 톤 버튼은 `ui`가 있는 full 프레임을, 스타일 전용 버튼은 `uiChanged`가 있는 partial 프레임을 보내고, 초기화 버튼은 `ui`가 빈 full 프레임으로 패치를 지웁니다 — 프리뷰 카드의 template은 그대로인 채 외형만 바뀝니다.

- [Transition 가이드](/ko/guide/transition) — full, partial, accumulate 프레임이 함께 동작하는 방식.
- [Accumulate 가이드](/ko/guide/accumulate) — 스트리밍 패턴과 그곳에서 `ui`가 허용되지 않는 이유.
- [Action 가이드](/ko/guide/action) — 이 transition들을 시작하는 버튼과 폼.

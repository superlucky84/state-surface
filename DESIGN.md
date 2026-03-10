# StateSurface Design (Next)

작성일: 2026-03-08  
상태: Draft (새 설계 문서)

이 문서는 다음 단계 설계를 위한 **활성(working) DESIGN 문서**다.
이전 Phase 설계/구현 문서는 `docs/completed/`로 이동했다.

## 0) 철학/배경 기준선

이 문서의 모든 신규 설계는 `docs/completed/DESIGN.md`에 정리된 프로젝트 철학과 배경을 기준선으로 삼는다.

- Server owns state, client owns DOM projection 원칙 유지
- 페이지 이동은 MPA, 인페이지 변화는 상태 프레임 스트리밍 원칙 유지
- `<h-state>` anchor 중심의 명시적 경계 유지
- 안정성/예측 가능성 우선(escape hatch는 제한적으로 도입)

기준선에서 벗어나는 변경은 사유와 영향 범위를 이 문서에 명시적으로 기록한다.

## 1) 목표

- 다음 릴리스에서 해결할 설계 문제를 명확히 정의한다.
- 코어 경계(프로토콜/런타임/하네스) 기준을 유지한 채 확장 방향을 정한다.
- 구현 전에 결정해야 할 항목을 체크리스트로 관리한다.

## 2) 비목표

- 완료된 Phase 1/2 내용을 이 문서에서 다시 설명하지 않는다.
- 과거 구현 체크리스트를 이 문서에 복사하지 않는다.

## 3) 현재 설계 작업 범위 (초안)

- [ ] 프레임 스펙 확장 범위 확정 (`ui`, `uiChanged` 등)
- [ ] 슬롯 capability 모델의 런타임 계약 확정 (`strict`, `rich`, `unsafe`)
- [ ] SSR/클라이언트 apply 순서와 하위호환 정책 확정
- [ ] validator/observability/보안 가드레일 확정

## 4) h-state UI 디자인 프로토콜 (Draft)

### 4.1 목표와 원칙

동적 스타일 확장을 넣더라도 기존 상태 프로토콜의 안정성을 유지하기 위해, 데이터와 외형을 분리한다.

- `states`: 비즈니스 데이터(템플릿 렌더 입력)
- `ui`: 슬롯 외형 패치(클래스/CSS 변수/허용 스타일 속성)
- `changed`: `states` 변경 슬롯 목록
- `uiChanged`: `ui` 변경 슬롯 목록

### 4.2 프레임 확장 초안 (`ui + uiChanged`)

```ts
type StateFrameState = {
  type: 'state';
  states: Record<string, any>;
  ui?: Record<string, UiPatch | null>;
  full?: boolean;
  accumulate?: boolean;
  changed?: string[]; // states 전용
  removed?: string[]; // states 전용
  uiChanged?: string[]; // ui 전용
};
```

### 4.3 검증 규칙 (초안)

- `full:false`일 때 `changed` / `removed` / `uiChanged` 중 최소 1개는 반드시 존재.
- `changed`의 각 key는 `states`에 존재해야 함.
- `uiChanged`의 각 key는 `ui`에 존재해야 함.
- key 중복 충돌 방지: 같은 key를 `changed`와 `removed`에 동시에 넣지 않음.
- `ui[slot] = null`은 해당 슬롯의 UI override 초기화 의미.

### 4.4 운영 원칙

- 기존 `states` 프로토콜과 하위 호환 유지(`ui`, `uiChanged`는 optional).
- 스타일-only partial 업데이트를 정식 지원(더미 state 강요 금지).
- `ui` 값은 slot capability(`strict | rich | unsafe`)와 allowlist 검증을 통과해야 적용.

### 4.5 스타일-only partial 예시

```json
{
  "type": "state",
  "full": false,
  "states": {},
  "ui": {
    "card:summary": {
      "classAdd": ["tone-warning"],
      "classRemove": ["tone-default"],
      "cssVars": { "--card-accent": "#f59e0b" }
    }
  },
  "uiChanged": ["card:summary"]
}
```

### 4.6 미결정 체크리스트

- [x] `UiPatch` 스키마 확정 → `classAdd: string[]`, `classRemove: string[]`, `cssVars: Record<string, string>`. `style` 직접 주입은 제외(안전성·예측 가능성 우선). 필요 시 `rich`/`unsafe` capability 도입 시 확장.
- [x] capability별 허용 정책 확정 → 1차에서는 capability 모델 미도입. UiPatch 스키마(`classAdd`, `classRemove`, `cssVars`) 자체가 안전 가드레일. `style` 직접 주입 확장 시점에 capability 등급 도입.
- [x] CSS 변수 네이밍 규칙 확정 → 1차에서는 prefix 강제 없음. CSS 변수는 슬롯 엘리먼트 스코프로 자연 제한됨. prefix 규칙은 capability 도입 시점에 재검토.
- [x] 허용 style 속성 allowlist → 해당 없음. `style` 직접 주입 제외, capability 모델 보류로 불필요.
- [x] `full` 프레임에서 `ui` 처리 규칙 확정 → 전체 교체. `states`와 동일하게 full 프레임이면 `ui`도 통째로 교체.
- [x] `accumulate` 프레임에서 `ui` 허용 여부 → 금지. 스타일 변경은 별도 partial 프레임으로 전송.
- [x] `removed`와 `uiChanged` 동시 사용 시 → `removed` 우선. 슬롯이 제거되면 해당 슬롯의 `uiChanged`는 무시.
- [x] 적용 순서 확정 → 템플릿 렌더/업데이트 완료 후 UI 패치 적용. DOM 갱신 이후에 h-state 엘리먼트에 클래스/CSS 변수 설정.
- [x] SSR 초기 상태에서 `ui` 주입 → 지원. 첫 full 프레임의 `ui`를 SSR에 반영: fillHState에서 h-state 태그에 class/style 속성 삽입, `__UI__` 스크립트 태그로 클라이언트 hydration 시 초기 ui 상태 복원. FOUC 방지.
- [x] invalid `ui` 처리 정책 → slot skip + console.warn. 잘못된 ui 슬롯만 건너뛰고 나머지 정상 적용. 프레임 전체 drop 금지.
- [x] 보안/안정성 한도 → 1차에서는 제한 없음. 서버 신뢰 모델 + 스키마 제한으로 충분. 필요 시 추후 추가.
- [x] observability 이벤트 → 1차에서는 미도입. invalid ui 시 console.warn만 출력. 디버그 오버레이에 ui 패치 로그 추가로 충분.
- [x] 하위 호환/버전 전략 → 무시(no-op). 구형 클라이언트는 `ui` 필드를 파싱하지 않으므로 자연스럽게 무시. 별도 버전 협상 불필요.
- [x] 테스트 매트릭스 확정 → validator(ui 필드 검증, uiChanged↔ui 정합, accumulate+ui 거부), apply(classAdd/classRemove/cssVars 적용, ui=null 초기화, 렌더 후 패치 순서), SSR(fillHState ui 삽입, `__UI__` 스크립트), partial(스타일-only partial, removed 슬롯 ui 무시), full(ui 전체 교체), invalid(slot skip + warn). abort/coalesce는 기존 프레임 큐 테스트가 커버.

## 5) 완료 문서(Archive)

- `docs/completed/DESIGN.md`
- `docs/completed/DESIGN_PHASE2.md`
- `docs/completed/IMPLEMENT.md`
- `docs/completed/IMPLEMENT_PHASE2.md`

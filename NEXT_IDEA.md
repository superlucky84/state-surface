# NEST Harness Idea Notes (StateSurface 기반)

작성일: 2026-03-05  
목적: 지금까지 논의한 내용을 빠짐없이 정리하고, **StateSurface 코어를 미래 하네스(NEST) 기반 프레임워크의 런타임 커널**로 활용하기 위한 기준점을 남긴다.

---

## 1. 현재 합의된 방향

- 지금 레포를 곧바로 "Agent 하네스 통합 제품"으로 바꾸지는 않는다.
- 대신 현재 프로젝트를 **하네스의 기반 코어 프레임워크**로 쓴다.
- 하네스 확장 모듈(오케스트레이션/에이전트 연동/정책)은 이후 별도로 만든다.

즉, 방향은 다음과 같다.

```text
지금: StateSurface Core 강화
다음: Harness Layer 별도 구축/결합
```

---

## 2. 원 제안(Agent-Driven UI) 핵심 아이디어 정리

아래는 제안 문서의 핵심 포인트를 구조적으로 압축한 내용이다.

### 2.1 철학

- AI는 HTML/DOM을 직접 생성하지 않는다.
- AI는 `surface`와 `state`를 제어한다.
- 실제 렌더링은 StateSurface runtime이 담당한다.

```text
AI -> State Protocol -> StateSurface Runtime -> DOM Projection
```

### 2.2 기존 방식 대비 개선 목표

- DOM 불안정성 감소
- 스타일 충돌/깨짐 방지
- 유지보수성 개선
- 디자인 시스템 호환성 유지

### 2.3 아키텍처 구성

- User
- AI Agent
- Web Harness (Context + Surface Registry + Protocol + Streaming orchestration)
- StateSurface Runtime
- DOM Projection

### 2.4 Surface 기반 모델

- UI를 `h-state` 슬롯(surface slot) 단위로 구성
- Agent는 슬롯을 직접 렌더링하지 않고 상태 업데이트만 수행
- Surface는 projection slot 역할

### 2.5 Surface Registry

- Agent가 선택 가능한 surface 목록/설명을 알고 있어야 함
- type/description/input 형태의 기계 판독 가능한 레지스트리 필요

### 2.6 State Protocol

- Agent는 상태 패치 단위로 UI 변경
- Runtime은 패치를 적용하고 DOM에 반영

### 2.7 Streaming UI

- Agent reasoning 과정에서 점진 업데이트
- 프레임/패치 스트림 기반 progressively complete UI

### 2.8 Styling / Layout

- Tailwind 같은 utility CSS 활용 가능
- Agent가 레이아웃 조합(grid, spans 등)까지 선언 가능

### 2.9 Harness 책임

- Context Manager
- Surface Registry 제공
- State Protocol 브로커
- Streaming Interface 제공

### 2.10 포지셔닝

- StateSurface는 단순 UI 프레임워크가 아니라:
  - Agent-compatible UI runtime
  - Agent-native UI protocol for web

### 2.11 미래 확장

- Dynamic Surface Creation
- Multi-surface workspace
- Agent UI OS 형태의 지속적 UI 구성

---

## 3. 현재 StateSurface 코어와의 적합성 (이미 갖춘 것)

현재 코드는 제안 모델과 높은 적합성을 보인다.

### 3.1 상태 프로토콜 + 스트리밍

- NDJSON frame protocol 존재
- frame 타입: `state` / `error` / `done`
- full/partial/accumulate semantics 존재
- 서버 스트리밍 엔드포인트 존재: `POST /transition/:name`

관련 코드:
- `PROTOCOL.md`
- `engine/shared/protocol.ts`
- `engine/shared/ndjson.ts`
- `engine/server/index.ts`

### 3.2 Runtime projection 엔진

- `h-state[name]` anchor 발견
- 상태 프레임 큐/flush/backpressure/coalesce 적용
- state -> template update -> DOM projection 처리

관련 코드:
- `engine/client/stateSurface.ts`
- `engine/client/lithentBridge.ts`

### 3.3 점진 스트리밍 사례 검증

- chat transition에서 accumulate 기반 스트리밍 텍스트 적용
- demo transition에서 full/partial/accumulate/error 시퀀스 시연

관련 코드:
- `routes/chat/transitions/chat.ts`
- `routes/features/streaming/transitions/streamDemo.ts`

결론: 현재 코어는 이미 "Agent가 제어하기 좋은 UI projection kernel"에 매우 가깝다.

---

## 4. 하네스 확장을 위해 (향후) 필요한 모듈/계약

아래는 하네스 레이어에서 추가될 항목이다.

1. Surface Registry 표준
- `type`, `description`, `input/output schema`, `capabilities`, `layout constraints`

2. Agent Contract 표준
- Agent 출력 포맷 고정 (`selectSurface`, `patchState`, `composeLayout`, `done/error`)
- LLM 출력 -> StateFrame 어댑터 + 강제 검증

3. Harness Context Model
- `sessionId`, `userGoal`, `activeSurfaces`, `state snapshot`, `history window`
- replay/restore 가능 모델

4. Orchestration Engine
- 입력 -> 추론 -> patch stream -> 완료 상태머신
- 취소/동시성 정책 확장 (abort-previous + keyed cancel + queue/priority)

5. Policy/Safety Layer
- allowlist, patch size limit, timeout, rate limit
- 민감정보 마스킹, 감사 로그

6. Observability
- trace/correlation ID
- frame latency/drop/merge metrics
- 세션 리플레이

7. Extensibility API
- pre/post hooks (agent output, frame apply, errors)
- model/tool provider adapter

8. 패키지 경계 분리
- `@statesurface/core`
- `@statesurface/harness-sdk`
- `@statesurface/harness-server`

---

## 5. "코어만 봤을 때" 현재 부족한 점 (핵심 갭)

아래는 하네스 모듈을 아직 만들지 않는다는 전제에서도, 코어 품질 관점에서 필요한 보강점이다.

### 5.1 스트림 레벨 규약 강제 부족

- 문서에는 "첫 프레임은 full" 규약이 있으나, 현재 검증은 프레임 단위 중심
- 스트림 컨텍스트(`first frame`, `done 이후 frame 금지`)를 코어에서 강제할 필요가 있음

### 5.2 클라이언트 수신 프레임 방어 약함

- 클라이언트가 수신 프레임을 바로 큐에 넣는 흐름
- 에이전트/외부 소스 연결을 고려하면 클라이언트 측 재검증/드롭 정책이 필요

### 5.3 전송 경로 하드코딩

- 현재 `fetch('/transition/:name')` 경로에 결합
- 프레임 소스(HTTP/WebSocket/in-memory)를 교체 가능한 transport adapter 추상화 필요

### 5.4 외부 프레임 주입용 Public API 부족

- 외부에서 직접 frame stream을 주입/적용하는 공개 API가 없음
- `applyFrame(s)` 같은 headless 적용 API가 있으면 하네스 결합이 쉬움

### 5.5 Surface 메타데이터 계약 부재

- 현재는 `name` 중심 슬롯/템플릿 매핑
- 향후 Agent 친화성을 위해 `type/schema/capability` 같은 machine-readable 메타 계약이 필요

### 5.6 SSR 앵커 채움 방식 견고성

- 현재 `fillHState`는 regex 기반 치환
- 복잡 layout/마크업 확장 대비 AST/DOM 기반 처리로 강화 여지

### 5.7 서버 라이프사이클 경계 정리 필요

- 코어의 `createApp()`가 환경에 따라 listen까지 수행하는 경로가 존재
- 임베디드/하네스 서버 결합을 위해 "앱 생성"과 "실행(start/listen)" 경계를 더 명확히 분리하는 편이 좋음

---

## 6. 코어 강화 우선순위 (하네스 전 단계)

### P0 (먼저)

1. Stream validator 도입 (first-frame, done contract)
2. client-side frame guard/validation 옵션 추가
3. transport abstraction 인터페이스 설계

### P1

4. public frame apply API (`applyFrame`, `applyFrames`, `connectStream`) 추가
5. surface metadata registry 최소 스펙 도입
6. server lifecycle API 정리 (`createApp` vs `startServer`)

### P2

7. SSR fill 로직 강화 (regex -> parser 기반)
8. observability hook 확장 (stream-level events)

---

## 7. 코어/하네스 경계 원칙 (결정 사항)

### 코어(StateSurface)가 책임질 것

- 상태 프레임 규약
- 프레임 적용/병합/큐잉
- DOM projection
- 전송 추상화(인터페이스 수준)
- 안전한 기본 동작과 오류 처리

### 하네스(NEST)가 책임질 것

- Agent 실행/추론 루프
- 컨텍스트 생성/압축
- surface 선택 정책
- LLM 출력 파싱/복구
- 권한/보안 정책, 로깅/관측, 세션 운영

---

## 8. 하이브리드 표현 전략 (신규 보강)

직접 HTML 생성의 유연성과 프로토콜 기반 안정성을 동시에 얻기 위한 전략:

```text
Default: strict surface/state protocol
Escape hatch: 제한된 flexible h-state 영역
```

### 8.1 기본 원칙

- 에이전트는 기본적으로 기존 `surface + state` 경로를 우선 사용한다.
- 자유 표현은 전역 허용이 아니라, **사전에 지정된 일부 `h-state` 슬롯**에만 허용한다.

### 8.2 슬롯 capability 모델

- `strict`: 현재 방식. 스키마 기반 상태만 허용.
- `rich`: Markdown/Block AST/Component DSL 같은 구조화 표현 허용.
- `unsafe`(옵션): raw HTML 허용 (실험/내부 모드 한정).

### 8.3 왜 필요한가

- strict-only: 안정성은 높지만 표현 유연성이 제한됨.
- free HTML-only: 유연성은 높지만 운영 안정성이 급격히 저하됨.
- hybrid: 실무에서 필요한 창의적 표현을 얻으면서 코어 안정성 유지 가능.

### 8.4 필수 가드레일

- 자유 영역 allowlist (`slotName`, `capability`) 강제
- sanitizer + schema validation + size limit
- timeout / rate limit / kill switch
- 스타일/스크립트 격리(Shadow DOM 또는 sandbox iframe)

### 8.5 코어에 미리 반영할 준비 항목

- `Surface Registry`에 capability 필드 추가 (`strict | rich | unsafe`)
- 클라이언트 런타임에 capability-aware renderer 분기
- trace에 "flexible-slot 사용 이벤트" 추가 (감사/디버깅 용도)

### 8.6 상태/스타일 분리 상세 스펙 위치

`h-state` UI 디자인 프로토콜의 상세 초안(`ui + uiChanged`)과 미결정 체크리스트는
활성 설계 문서인 `DESIGN.md`의 "4) h-state UI 디자인 프로토콜 (Draft)" 섹션으로 이관했다.

---

## 9. 최종 요약

- 현재 StateSurface는 이미 Agent-driven UI의 코어 런타임으로 충분히 유망하다.
- 지금 단계의 올바른 전략은 "하네스 통합"이 아니라 "코어 경계 강화"다.
- 다음 액션은 **스트림 규약 강제 + 입력 방어 + 전송 추상화 + 공개 프레임 API**다.
- 표현 전략은 **strict 기본 + 제한적 flexible h-state escape hatch**가 가장 현실적이다.
- 이 4가지를 선행하면, 이후 NEST 하네스는 코어 위에 무리 없이 올라간다.

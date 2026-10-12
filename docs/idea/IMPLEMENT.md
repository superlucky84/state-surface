# 서버 렌더링 슬롯과 Lithent 아일랜드 — 구현 후보

작성일: 2026-10-12
상태: Idea / Draft — Phase 0 문서화, 기능 단계 미착수

요구사항: [REQUIREMENTS.md](./REQUIREMENTS.md)
설계와 결정 목록: [DESIGN.md](./DESIGN.md)
사용자 검증: [MANUAL_TEST_CHECKLIST.md](./MANUAL_TEST_CHECKLIST.md)

이 계획은 구현 순서를 검토하기 위한 초안이다.
슬롯 API, 응답 프로토콜과 활성화 정책은 해당 DC 항목을 결정한 뒤 구현한다.
Phase 3~5는 Phase 2의 경계가 정해지면 일부 독립적으로 진행할 수 있다.

## Phase 0: 논의 기록

Entry: 현재 코드와 대화에서 나온 방향을 확인한다.
Exit: 네 문서가 현재 지원 범위, 제안, 미결정 사항을 일관되게 설명한다.

- [x] 요구사항과 작업 범위를 기록한다.
- [x] 현재 구현과 제안된 모드·응답·활성화 방식을 구분한다.
- [x] 일반 Lithent UI 상태와 서버 확정 데이터의 소유권을 기록한다.
- [x] 단계별 테스트 게이트와 수동 검증 항목을 작성한다.
- [x] 문서 링크, 결정 ID 연결, 변경 파일과 공백을 확인한다.

Baseline check: 문서의 상대 링크와 결정·검증 ID 연결을 검사한다.
코드 테스트와 성능 측정 결과를 이번 문서화의 완료 결과로 기록하지 않는다.

문서 검증 결과: 네 문서의 상대 링크·앵커·공백·코드 블록과
DC-01~DC-12, MT-01~MT-12의 참조 연결을 확인했다.

## Phase 1: 현재 비용 측정과 코드 분리

Entry: 현재 production build를 기준선으로 기록한다. DC-02, DC-11의 첫 범위를 정한다.
Exit: 홈·가이드·검색·채팅에서 실제 초기 요청 청크를 비교할 수 있고, 불필요한 페이지 코드를 제외한다.

- [ ] 템플릿 이름 → loader 매핑과 필요한 공통 템플릿 식별 방식을 구현한다.
- [ ] 모듈 로딩을 기다리는 bootstrap·프레임 적용 흐름을 정한다.
- [ ] 플러그인과 디버그 오버레이를 필요한 페이지·시점에 로드한다.
- [ ] 중복 import, 로딩 실패, 취소 후 오래된 프레임의 적용을 처리한다.

Baseline tests: 템플릿 레지스트리, hydration, 클라이언트 flows·abort, 플러그인 테스트.
Build check: Vite manifest에서 실제 청크 의존성과 CSS를 확인한다.
Validation: MT-01, MT-06, MT-11, MT-12.

## Phase 2: 슬롯 모드와 소유권

Entry: DC-01, DC-03, DC-08을 결정하고 기존 API 호환 동작을 기록한다.
Exit: 혼합 페이지에서 static/server/client의 초기 표시와 상태 수명이 구분된다.

- [ ] 모드 메타데이터와 SSR·클라이언트 소비 경로를 구현한다.
- [ ] static/server 슬롯의 hydration을 생략한다.
- [ ] client 슬롯의 일반 Lithent 컴포넌트 작성·SSR·활성화 경로를 제공한다.
- [ ] 같은 컴포넌트의 props 업데이트와 명시적 reset·교체·cleanup을 구현한다.
- [ ] 서버 HTML과 Lithent의 DOM 소유권, 중첩 지원 범위를 적용한다.
- [ ] 서버 전용 페이지의 entry와 최초 액션 경로에서 Lithent를 제외한다.

Baseline tests: SSR renderer·routeHandler, hydration, Lithent bridge의 상태 보존·cleanup 동작.
Validation: MT-02, MT-03, MT-08, MT-11.

## Phase 3: 서버 렌더링 응답과 상태 프로토콜

Entry: DC-04, DC-05를 결정한다. Phase 2의 슬롯 모드가 식별 가능하다.
Exit: 서버 슬롯이 등록된 템플릿 결과로 갱신되고 혼합 슬롯의 상태·UI 의미가 일관된다.

- [ ] transition의 상태 출력과 wire 렌더링 결과를 연결하는 서버 어댑터를 구현한다.
- [ ] 서버 accumulate를 데이터 병합 후 렌더링한다.
- [ ] full/partial/removed/UI-only와 오류·완료 처리 계약을 구현한다.
- [ ] 서버 입력 상태, 액션 메타데이터, 클라이언트 props를 분리한다.
- [ ] 가이드 본문·하이라이팅을 서버 경로로 옮기고 Copy·목차 동작을 연결한다.
- [ ] 실제 계약에 맞춰 PROTOCOL.md와 활성 설계 문서를 갱신한다.

Baseline tests: protocol, NDJSON, routeHandler, initialStates, 클라이언트 stateSurface·flows.
New behavior checks: 혼합 모드 프레임 적용, 서버 병합 상태 수명, 초기 데이터 제외 후 제거 동작.
Validation: MT-03, MT-07, MT-11, MT-12.

## Phase 4: 작은 로더와 컴포넌트 액션 API

Entry: DC-06, DC-07, DC-09, DC-11을 결정한다.
Exit: 첫 액션을 보존하며 필요한 런타임만 활성화하고, Lithent 컴포넌트가 공식 API로 액션을 실행한다.

- [ ] 공통 로더에서 액션과 입력을 동기적으로 캡처한다.
- [ ] 런타임 로딩 Promise를 공유하고 실패 후 재시도 정책을 적용한다.
- [ ] 액션 실행 순서와 기존 abort-previous의 관계를 구현한다.
- [ ] boot 자동 동작과 클라이언트 아일랜드의 활성화 트리거를 연결한다.
- [ ] 컴포넌트용 액션 API와 pending·오류·취소 동작을 제공한다.
- [ ] 선언적 액션과 직접 핸들러의 중복 실행을 막는다.

Baseline tests: actionDelegation, abort, 클라이언트 flows, Lithent bridge.
New behavior checks: 느린 import 중 첫 submit·입력 캡처, 로드 실패, 연속 액션과 취소.
Validation: MT-04, MT-05, MT-06, MT-09, MT-12.

## Phase 5: 일반 JSON 단건 응답

Entry: DC-10과 DC-04의 응답 envelope·완료 의미를 결정한다.
Exit: 단건과 NDJSON이 동일한 결과 적용·오류·취소 동작으로 연결된다.

- [ ] 서버의 응답 모드 선택과 JSON 직렬화를 구현한다.
- [ ] 클라이언트가 Content-Type에 맞춰 JSON 또는 NDJSON을 파싱한다.
- [ ] 단건 결과를 공통 적용 파이프라인으로 전달한다.
- [ ] 필요하면 일반 async 함수 반환을 지원하는 transition 작성 API를 추가한다.
- [ ] 기존 NDJSON 한 번 업데이트 경로를 유지한다.

Baseline tests: 서버 transition, NDJSON, 클라이언트 flows·abort·stateSurface.
New behavior checks: JSON 성공·오류·잘못된 본문, 완료 시 pending 해제, 기존 NDJSON 호환.
Validation: MT-10, MT-11.

## Phase 6: Test Hardening

Entry: 기능 범위의 DC 항목이 결정되고 Phase 1~5의 선택한 기능이 구현되어 있다.
Exit: 상태 수명·이벤트·프로토콜 경계의 실패 조건을 검증하고 전체 테스트가 통과한다.

- [ ] props 갱신 중 입력 초안·선택·포커스 보존과 명시적 reset을 검증한다.
- [ ] 로딩 중 취소, 늦게 도착한 응답, 청크 로딩 실패와 재시도를 검증한다.
- [ ] 혼합 슬롯의 full/partial/accumulate/removed/UI-only를 검증한다.
- [ ] 제거와 컴포넌트 교체의 cleanup, 이벤트 중복과 구형 계약 처리를 검증한다.
- [ ] 필요한 공개 API 경계 테스트를 갱신한다.

Baseline tests: 각 단계의 테스트와 `pnpm test` 전체.
Validation: MT-06, MT-07, MT-08, MT-09, MT-10, MT-11.

## Phase 7: Integration Test와 성능 판정

Entry: hardening 완료, DC-12의 비교 조건과 목표치 확정.
Exit: production 경로와 새 scaffold에서 사용자 동작·호환성·성능을 확인한다.

- [ ] `pnpm build` 후 `pnpm start`로 홈·가이드·검색·채팅의 동작을 확인한다.
- [ ] BASE_PATH가 있는 배포 경로에서 entry·청크·CSS·transition을 확인한다.
- [ ] 원본과 overrides를 갱신하고 빌드로 생성한 scaffold에서 같은 동작을 확인한다.
- [ ] 수동 검증 항목의 결과와 성능 전후 값을 기록한다.
- [ ] 첫 액션 지연과 스트리밍 서버 비용까지 포함해 도입 범위를 결정한다.

Baseline tests: `pnpm test`, `pnpm build`, production HTTP 응답과 브라우저 통합 검증.
Validation: MANUAL_TEST_CHECKLIST.md 전체, 특히 MT-11과 MT-12.

## Handoff

- Done: docs/idea의 요구사항·설계·구현 후보·수동 검증 초안을 작성하고 문서 자체를 검증했다.
- Next: 미결정 항목을 선택하고 Phase 1에서 현재 비용을 측정한다.
- Blockers: 문서화에 대한 막힘은 없다. 기능 구현의 계약과 성능 목표는 TBD다.
- Latest code commit: `9343ada2884719c4e850b22fae177487585acf21`.
- 문서 중간 커밋: 이 파일을 포함하는 커밋은 `git log -1 -- docs/idea`로 확인한다.
- 기능 테스트·build·성능 측정: 이번 문서화에서는 실행하지 않았다.

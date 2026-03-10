# UI Patch Guide — Implementation Checklist

설계: `docs/guide-ui-patch/DESIGN.md`
상태: Complete

---

## Phase 1: 콘텐츠 데이터

`shared/content.ts`에 한/영 가이드 콘텐츠를 추가한다.

**Entry**: 기존 GUIDE_DATA에 6개 가이드 존재.
**Exit**: en/ko 모두 ui-patch 가이드 존재, 섹션 ID·블록 수·블록 타입 일치.

- [x] `GUIDE_DATA.en['ui-patch']` 추가 — 9개 필수 섹션 + `ssr` 추가 섹션
- [x] `GUIDE_DATA.ko['ui-patch']` 추가 — en과 동일 구조 (섹션 ID, 블록 수, 블록 타입)
- [x] `demoHref`/`demoLabel` 설정: `/examples/ui-patch`, en: `UI Patch Demo`, ko: `UI 패치 데모`

### Baseline Test

- [x] `pnpm test shared/guideContent.test.ts` 통과 — 164 tests passed

---

## Phase 2: 라우트 등록 + UI 연동

가이드 시스템이 ui-patch slug를 인식하도록 등록한다.

**Entry**: Phase 1 완료.
**Exit**: `/guide/ui-patch` 접속 시 가이드 렌더링, TOC에 항목 표시.

- [x] `routes/guide/[slug].ts` — `VALID_SLUGS`에 `'ui-patch'` 추가
- [x] `shared/content.ts` — `guideLoadingState` 내 `items` 배열에 `'ui-patch'` 추가
- [x] `shared/content.ts` — `pageContent` guide case `items` 배열에 `'ui-patch'` 추가
- [x] `routes/guide/templates/guideToc.tsx` — `LABELS` 맵에 `'ui-patch': 'UI Patch'` 추가

### Baseline Test

- [x] SSR rendering test 통과 (GET /guide/ui-patch + transition/guide-load)

---

## Phase 3: 테스트 추가

기존 가이드 테스트에 ui-patch를 포함한다.

**Entry**: Phase 1, 2 완료.
**Exit**: 전체 테스트 통과.

- [x] `shared/guideContent.test.ts` — CONCEPT_SLUGS, ALL_SLUGS에 `'ui-patch'` 추가
- [x] `UI_PATCH_EXTRA_SECTION_IDS = ['ssr']` 추가 + 검증 로직 연결
- [x] `pnpm test` 전체 통과 — 458 tests passed

---

## Phase 4: Test Hardening

- [x] 한/영 i18n 패리티 검증 — 기존 i18n equality 테스트가 ui-patch 포함하여 통과
- [x] guideLoadedState('ui-patch', lang)가 demoHref/demoLabel 포함 — 테스트 통과
- [x] `pnpm build` 성공

---

## Phase 5: Integration Test

- [ ] `pnpm dev` → 전체 가이드 페이지 순회 — 기존 가이드 깨짐 없음
- [ ] `/guide/ui-patch` — 로딩 스켈레톤 → 콘텐츠 전환 정상
- [ ] TOC 섹션 앵커 클릭 → 해당 섹션으로 스크롤
- [ ] 한/영 언어 전환 정상
- [ ] `/examples/ui-patch` 데모 링크 동작
- [x] `pnpm build && pnpm test` 전체 통과

---

## Handoff

- **Done**: Phase 1~4 완료. 콘텐츠(en/ko), 라우트 등록, 테스트, 빌드 모두 통과.
- **Next**: Phase 5 수동 통합 테스트 (pnpm dev로 브라우저 확인)
- **Blockers**: 없음
- **Latest commit**: not committed yet

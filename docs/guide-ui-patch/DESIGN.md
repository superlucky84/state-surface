# UI Patch Guide — Design

작성일: 2026-03-10
상태: Draft

---

## 1. 개요

기존 가이드 시스템에 `ui-patch` slug를 추가한다.
변경은 콘텐츠 데이터 + 라우트 등록 + 테스트에 한정되며, 엔진 코드 변경은 없다.

## 2. 가이드 콘텐츠 구조

### 2.1 필수 섹션 (9개, 기존 concept 가이드 동일)

| 순서 | ID         | heading (en)          | 주요 블록 타입                    |
| ---- | ---------- | --------------------- | --------------------------------- |
| 1    | `tldr`     | TL;DR                 | paragraph                         |
| 2    | `analogy`  | Mental model          | analogy, paragraph, callout       |
| 3    | `when`     | When to use           | bullets                           |
| 4    | `steps`    | Step-by-step          | sequence (≥5 steps)               |
| 5    | `example`  | Minimal example       | code (필수), callout              |
| 6    | `sequence` | Execution sequence    | diagram, paragraph                |
| 7    | `mistakes` | Common mistakes       | checklist (필수), warning (필수)  |
| 8    | `debug`    | Debugging checklist   | debug                             |
| 9    | `next`     | Next: try it live     | paragraph, bullets                |

### 2.2 추가 섹션

| ID         | heading (en)              | 설명                                      |
| ---------- | ------------------------- | ----------------------------------------- |
| `ssr`      | SSR behavior              | SSR에서 UI patch가 적용되는 방식 설명     |

추가 섹션은 `sequence`와 `mistakes` 사이에 배치한다.

### 2.3 콘텐츠 방향

- **tldr**: 템플릿 재렌더 없이 h-state 엘리먼트의 class/CSS 변수를 서버에서 제어하는 메커니즘
- **analogy**: 건물 외벽 페인트 비유 — 내부 인테리어(template)를 바꾸지 않고 외관(ui patch)만 변경
- **when**: 테마 토글, 상태별 시각 피드백, 다크모드, 조건부 스타일링
- **steps**: ui 필드 정의 → full frame에 포함 → partial에서 uiChanged로 업데이트 → SSR 반영
- **example**: transition에서 ui 필드를 포함하는 최소 코드 + 대비 코드(template에서 직접 class 조작)
- **sequence**: Full frame → DOM patch, Partial frame with uiChanged → style-only update 다이어그램
- **ssr**: fillHState에서 class/style 주입, __UI__ script 태그로 hydration 데이터 전달
- **mistakes**: accumulate에서 ui 사용 시도, uiChanged 누락, classAdd/classRemove 충돌
- **debug**: 증상-원인-해결 카드 (스타일 미적용, SSR 불일치 등)
- **next**: /examples/ui-patch 데모 링크, 관련 가이드(transition, accumulate) 안내

### 2.4 데모 링크

```
demoHref: '/examples/ui-patch'
demoLabel: 'UI Patch Demo'  (ko: 'UI 패치 데모')
```

## 3. 등록 변경

### 3.1 라우트 (`routes/guide/[slug].ts`)

- `VALID_SLUGS`에 `'ui-patch'` 추가

### 3.2 TOC (`shared/content.ts` — guideLoadingState)

- `items` 배열에 `'ui-patch'` 추가 (accumulate 다음)

### 3.3 TOC 라벨 (`routes/guide/templates/guideToc.tsx`)

- `LABELS` 맵에 `'ui-patch': 'UI Patch'` 추가

### 3.4 가이드 하단 링크 (`routes/guide/templates/guideContent.tsx`)

- DC-1 결정: `CONCEPT_SLUGS`에 추가하지 않는다.
  - 이유: CONCEPT_SLUGS는 StateSurface의 4대 핵심 개념(surface/template/transition/action)이다.
  - ui-patch와 accumulate는 고급 개념이므로 하단 링크 대신 `next` 섹션에서 관련 가이드 참조로 안내한다.

### 3.5 GUIDE_DATA (`shared/content.ts`)

- `en.ui-patch`와 `ko.ui-patch` 항목을 GUIDE_DATA에 추가

## 4. 테스트 변경

### 4.1 `shared/guideContent.test.ts`

- concept slugs 배열에 `'ui-patch'` 추가
- 추가 섹션: `extraSections['ui-patch'] = ['ssr']`
- 기존 테스트 구조(섹션 존재, 블록 최소 1개, example에 code, mistakes에 checklist+warning 등) 자동 적용

## 5. 결정 체크리스트

- [x] DC-1: CONCEPT_SLUGS에 추가하지 않음 — 고급 개념은 next 섹션에서 참조 링크로 안내
- [x] DC-2: 추가 섹션 1개 — `ssr` (SSR 동작 설명)

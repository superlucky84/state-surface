# UI Patch Guide — Requirements

작성일: 2026-03-10
상태: Draft

---

## 범위

`/guide/ui-patch` 경로에 UI Patch 개념 가이드를 추가한다.
기존 6개 가이드(quickstart, surface, template, transition, action, accumulate)와 동일한 구조·패턴을 따른다.

## 목표

- UI Patch(classAdd/classRemove/cssVars)의 개념과 사용법을 한/영 이중 언어로 설명
- 기존 가이드 패턴(9개 필수 섹션 + 선택 추가 섹션)을 준수
- TOC 사이드바에 `ui-patch` 항목 추가
- 가이드 하단에서 `/examples/ui-patch` 데모 페이지로 연결
- 기존 가이드 테스트(guideContent.test.ts)에 ui-patch 가이드 검증 추가

## 비목표

- 기존 가이드 콘텐츠 수정
- UI Patch 엔진 코드 변경
- 새로운 블록 타입 추가

## 제약

- 기존 concept 가이드의 필수 섹션 ID: `tldr`, `analogy`, `when`, `steps`, `example`, `sequence`, `mistakes`, `debug`, `next`
- 한/영 섹션 ID·블록 수·블록 타입이 동일해야 함 (기존 테스트 규칙)
- `VALID_SLUGS` 배열과 TOC `items` 배열에 `ui-patch` 추가 필요
- `guideContent.tsx` 하단 CONCEPT_SLUGS 연동 링크에 포함 여부 결정 필요

## 가정

- UI Patch 프로토콜 구현이 완료된 상태 (cc939fc)
- 기존 가이드 블록 렌더러(10종)로 충분
- `/examples/ui-patch` 데모 페이지가 이미 존재

## 결정 필요 항목

- [ ] DC-1: `ui-patch`를 CONCEPT_SLUGS에 추가하여 가이드 하단 링크에 포함할지 (기존 4개: surface/template/transition/action)
- [ ] DC-2: 가이드 추가 섹션(필수 9개 외) 필요 여부 및 ID

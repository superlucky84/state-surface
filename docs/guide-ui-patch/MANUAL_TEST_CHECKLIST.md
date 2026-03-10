# UI Patch Guide — Manual Test Checklist

상태: Ready

---

## 사전 조건

- `pnpm dev` 실행 상태
- `pnpm test` 전체 통과
- `pnpm build` 성공

---

## 체크리스트

### 1. 라우팅

- [ ] `/guide/ui-patch` 접속 → 200 응답, 가이드 페이지 렌더링
- [ ] 잘못된 slug (`/guide/invalid`) → 에러 처리 정상

### 2. 콘텐츠 렌더링

- [ ] 로딩 스켈레톤 표시 후 콘텐츠 전환
- [ ] 모든 섹션(10개) 제목과 본문 표시
- [ ] 코드 블록 구문 강조(Prism) 적용
- [ ] Copy 버튼 동작

### 3. TOC

- [ ] 사이드바에 "UI Patch" 항목 표시
- [ ] 클릭 시 `/guide/ui-patch` 이동 (이미 해당 페이지면 active 스타일)
- [ ] 섹션 앵커 목록 표시, 클릭 시 해당 섹션으로 스크롤

### 4. 데모 링크

- [ ] 가이드 하단 "UI Patch Demo" 버튼 표시
- [ ] 클릭 시 `/examples/ui-patch`로 이동

### 5. i18n

- [ ] 영어 상태에서 콘텐츠 영어로 표시
- [ ] `switch-lang` 트랜지션 후 한국어로 전환
- [ ] 한국어 상태에서 모든 섹션 한국어로 표시

### 6. 기존 가이드 영향 없음

- [ ] `/guide/surface` — 정상 렌더링
- [ ] `/guide/accumulate` — 정상 렌더링
- [ ] `/guide/quickstart` — 정상 렌더링

### 7. 반응형

- [ ] 데스크탑: 좌측 사이드바 TOC + 우측 콘텐츠
- [ ] 모바일: 가로 스크롤 TOC + 세로 콘텐츠

---

## 합격 기준

모든 항목 통과 + `pnpm test` + `pnpm build` 성공

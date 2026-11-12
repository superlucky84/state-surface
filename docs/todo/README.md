# 개선사항 (todo)

아직 구현하지 않은 개선사항을 기능별 문서 묶음으로 모아 둔다. 각 묶음은 doc-driven 형식
(REQUIREMENTS → DESIGN → IMPLEMENT → MANUAL_TEST_CHECKLIST)을 따르며, 구현을 시작하면 해당 묶음의
IMPLEMENT.md handoff 블록부터 읽는다.

| 묶음                                            | 요약                                                                                                      | 상태 | 기록일     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---- | ---------- |
| [proxy-origin/](./proxy-origin/REQUIREMENTS.md) | TLS 리버스 프록시 뒤 배포 시 POST Origin 검사 403: 템플릿 `ORIGIN`, Bun/Deno `origin` 옵션, 403 진단 힌트 | Todo | 2026-11-12 |

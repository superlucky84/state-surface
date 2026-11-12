# 개선사항 (todo)

아직 구현하지 않은 개선사항을 모아 둔다. 설계가 필요한 항목은 doc-driven 형식의 문서 묶음
(REQUIREMENTS → DESIGN → IMPLEMENT → MANUAL_TEST_CHECKLIST)으로, 작은 문서 보강은 메모 한 파일로 둔다.
묶음의 구현을 시작하면 해당 IMPLEMENT.md handoff 블록부터 읽는다.

| 묶음                                                   | 요약                                                                                                      | 상태 | 기록일     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---- | ---------- |
| [proxy-origin/](./proxy-origin/REQUIREMENTS.md)        | TLS 리버스 프록시 뒤 배포 시 POST Origin 검사 403: 템플릿 `ORIGIN`, Bun/Deno `origin` 옵션, 403 진단 힌트 | Todo | 2026-11-12 |
| [multi-instance-deploy.md](./multi-instance-deploy.md) | 여러 프로세스·인스턴스 배포 안내: 같은 빌드 산출물 또는 공통 `SURFACE_SECRET`, 앱 상태는 공유 저장소      | Todo | 2026-11-12 |

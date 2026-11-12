# 데모 서버: 좋아요가 한 번씩 씹히고 챗봇 대화가 번갈아 사라짐

기록일: 2026-11-12
상태: Mitigated — 데모 서버에 해결 방안 1 적용(2026-11-12), 해결 방안 3(템플릿 안내) 미반영
분류: 운영 설정 + 데모 템플릿 결함 (엔진 결함 아님)
환경: `https://state-surface.subtleflo.com` — `create-state-surface@0.2.0 --template demo --adapter node`,
`state-surface@0.2.0`, pm2 `exec_mode: 'cluster'`, `instances: 2` (`/var/www/state-surface/ecosystem.config.cjs`)

## 증상 (사용자 보고)

1. `/ko/examples/actions` 좋아요: 첫 번째 클릭은 카운터가 오르고, 두 번째는 그대로, 세 번째는 다시 오른다.
   한 번씩 씹힌다.
2. `/ko/examples/chat`: `aaaaa` 입력 후 `bbbb`를 입력하면 `aaaaa`가 사라지고 `bbbb`만 남는다. 이어서 `cccc`를
   입력하면 `aaaaa`, `cccc`만 보이고 `bbbb`가 사라진다.
3. 다른 예제도 전반적으로 비슷하게 동작이 이상하다는 보고(아래 영향 범위 참고).

## 재현

같은 세션 쿠키로 `like` transition을 6번 보낸다(2026-11-12, production).

```bash
S=https://state-surface.subtleflo.com; J=$(mktemp)
H=$(curl -s -c $J -b $J $S/en/examples/actions)
B=$(echo "$H" | grep -o '"buildId":"[^"]*"' | head -1 | cut -d'"' -f4)
for i in 1 2 3 4 5 6; do
  curl -s -c $J -b $J -X POST $S/transition/like -H 'Content-Type: application/json' \
    -H "Origin: $S" -H "X-Surface-Build: $B" -H 'X-Surface-Page: [lang]/examples/actions' \
    -d '{"delta":1,"lang":"en"}' | grep -o '>[0-9]\+<' | head -1
done
```

결과: `1, 1, 2, 2, 3, 3` — 요청이 두 프로세스에 번갈아 가며 각자의 카운터만 올린다.

## 원인

- 데모의 서버 저장소는 **프로세스 메모리의 `Map`**이다. 세션 쿠키(`actions_session`, `chat_session`)를 키로 쓴다.
  - `shared/actionsStore.server.ts` — 좋아요·댓글 (`sessions = new Map<string, Board>()`)
  - `shared/chatHistory.server.ts` — 챗봇 대화 (`sessions = new Map<string, Message[]>()`)
  - 두 파일의 주석이 "실제 앱은 데이터베이스를 쓴다"고 밝힌 데모용 저장소다.
- 데모 서버는 pm2 cluster 모드로 **프로세스 2개**를 띄우고, pm2(node cluster)가 연결을 라운드로빈으로 나눈다.
  프로세스끼리 메모리를 공유하지 않으므로 같은 쿠키라도 프로세스마다 다른 저장소를 본다.
  - 좋아요: 1번째 요청(A) A=1 → 2번째(B) B=1 → 3번째(A) A=2 → 4번째(B) B=2 …
    → 화면에는 `1, 1, 2, 2, 3, 3`으로 보여 "한 번씩 씹힘".
  - 챗봇: `aaaaa`(A) A=[a] → `bbbb`(B) B=[b] → `cccc`(A) A=[a, c] → 보고된 증상과 정확히 일치한다.
  - 페이지 GET(SSR)도 어느 프로세스로 가느냐에 따라 다른 목록·카운트를 그린다.
- 엔진은 요청 단위 상태만 가지며(DC-10, 서버는 요청 사이에 슬롯 상태를 보관하지 않음) 이 동작과 무관하다.
  0.1.0 데모도 같은 pm2 설정이었으므로, 서버 저장소를 쓰는 예제는 그때부터 같은 문제가 있었을 가능성이 높다(미확인).

## 영향 범위

서버 메모리 저장소를 읽거나 쓰는 예제만 해당한다(코드 기준).

| 예제                                                                 | 영향                                         | 관련 파일                                                                                      |
| -------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/:lang/examples/actions` 좋아요                                     | 있음 (재현 확인)                             | `transitions/like.ts`, `routes/[lang]/examples/actions/_components/likesPanel.tsx`             |
| `/:lang/examples/actions` 댓글                                       | 있음 (같은 저장소, 코드 기준)                | `transitions/comments/add.ts`, `.../_components/commentBoard.tsx`, `shared/pages.ts`           |
| `/:lang/examples/chat`                                               | 있음 (사용자 보고와 일치)                    | `transitions/chat.ts`, `routes/[lang]/examples/chat.tsx`, `.../chat/_components/chatInput.tsx` |
| streaming, search, view-transition, ui-patch, actions 플레이그라운드 | 저장소를 쓰지 않음 — 이 원인으로는 영향 없음 | `transitions/{stream-demo,search,vt-demo,ui-patch-demo,action-demo}.ts`                        |

"다른 예제도 이상하다"는 보고 중 저장소를 쓰지 않는 예제의 증상은 이 리포트로 설명되지 않는다. 해결 방안 1을 적용한 뒤
여전히 이상한 예제가 있으면 별도 리포트로 증상과 재현 절차를 기록한다.

## 해결 방안

1. **(권장, 운영) 데모 서버를 단일 프로세스로 실행** — `ecosystem.config.cjs`를 `instances: 1`, `exec_mode: 'fork'`로
   바꾸고 `pm2 delete state-surface && pm2 start ecosystem.config.cjs && pm2 save`. 데모 트래픽에 충분하고 서버 메모리
   (2 GB, swap 없음)도 아낀다. 재시작하면 저장소가 비는 것은 데모로서 허용 범위다.
2. **(데모 앱) 공유 저장소로 교체** — 파일·SQLite·Redis 등 프로세스 밖 저장소. 데모 의존성과 설정이 늘어나므로 데모
   목적에 비해 과하다. 하지 않는 것을 제안한다.
3. **(문서) 데모 템플릿 안내** — `create-state-surface/templates/demo/README.md`와 두 저장소 파일 주석에 "프로세스
   메모리 저장소: 단일 프로세스로 실행할 것, cluster·여러 인스턴스·서버리스에서는 공유 저장소 필요"를 명시한다.
   생성된 데모를 cluster로 배포하는 다른 사용자도 같은 증상을 겪을 수 있으므로 1과 함께 권장한다.

### 판단: 엔진 결함이 아니라 데모 템플릿의 결함

- 엔진은 요청 사이에 상태를 보관하지 않으므로(DC-10) 프로세스 수와 무관하게 같게 동작한다. 같은 메모리 세션 저장소를
  cluster로 띄우면 어떤 프레임워크에서도 같은 증상이 난다.
- 다만 이 저장소는 `create-state-surface --template demo`로 사용자에게 배포되는 템플릿의 일부이고, 단일 프로세스 전용이라는
  제약이 안내되지 않는다. 그래서 해결 방안 3이 남은 과제다.
- 해결 방안 1은 임시 회피가 아니라 이 데모에 맞는 실행 구성이다. 여러 인스턴스가 필요해지면 해결 방안 2(공유 저장소)가
  근본 해결이다.

## 조치 기록

- 2026-11-12: 데모 서버 `ecosystem.config.cjs`를 `instances: 1`, `exec_mode: 'fork'`로 변경, `pm2 delete state-surface &&
pm2 start ecosystem.config.cjs && pm2 save`. `ORIGIN`·`PORT`·`NODE_ENV` env 유지 확인. 재현 스크립트 결과
  `1, 2, 3, 4, 5, 6`.

## 확인 절차 (해결 후)

- [x] 위 재현 스크립트 결과가 `1, 2, 3, 4, 5, 6`이다. (2026-11-12, production)
- [ ] 브라우저에서 좋아요를 연속 클릭하면 매번 오른다(`mode: 'queue'`로 순서대로 반영).
- [ ] 챗봇에 `aaaaa`, `bbbb`, `cccc`를 입력하면 셋 다 순서대로 남고, 새로고침해도 유지된다.
- [ ] 댓글을 여러 개 추가하고 새로고침을 반복해도 목록이 같다.
- [ ] 저장소를 쓰지 않는 예제(streaming, search, view-transition, ui-patch)를 다시 점검하고, 남은 이상은 별도 리포트로 남긴다.

## 관련

- 같은 날 배포에서 발견한 다른 문제: TLS 프록시 뒤 POST 403 — [docs/todo/proxy-origin/](../todo/proxy-origin/REQUIREMENTS.md)

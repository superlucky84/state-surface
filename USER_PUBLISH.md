# StateSurface 사용자 배포 가이드

이 문서는 **사용자 계정으로 npm 배포를 직접 진행**하기 위한 실행 절차입니다.
순서는 반드시 지켜주세요.

- 1순위 배포: `state-surface` (런타임 패키지)
- 2순위 배포: `create-state-surface` (스캐폴딩 CLI)

---

## 권장: GitHub Actions(Trusted Publishing)로 배포

토큰 없이 `.github/workflows/publish.yml`이 npm에 배포한다(OIDC, provenance 포함).

1. 최초 1회, npmjs.com에서 두 패키지 각각: Settings → Trusted Publisher → GitHub Actions
   - Organization or user: `superlucky84`, Repository: `state-surface`
   - Workflow filename: `publish.yml`, Environment: 비움
2. 아래 2)~3)의 버전·CLI 기본값·`TEMPLATE_REF`를 맞춰 main에 반영한다.
3. GitHub Actions 탭 → Publish → Run workflow(main), 또는 GitHub Release를 publish한다.
   검증(format·check·test) 뒤 `state-surface` → `create-state-surface` 순서로 배포하고, 이미 npm에 있는
   버전은 건너뛴다.
4. 5) 배포 후 검증을 실행한다.

로컬에서 직접 배포할 때는 아래 절차를 따른다.

---

## 0) 사전 조건

- Node.js `>=20`
- `pnpm@10.13.1`
- npm 로그인 계정이 두 패키지(`state-surface`, `create-state-surface`) 배포 권한 보유
- npm 2FA(OTP) 준비

```bash
node -v
pnpm -v
npm whoami
```

`npm whoami`가 실패하면 먼저 로그인:

```bash
npm login
```

---

## 1) 배포 전 점검 (루트에서 실행)

작업 위치:

```bash
cd /Users/n250109005/project/stateSurface
```

체크:

```bash
git status --short
pnpm test
pnpm build
```

- `git status`가 비어있는 상태 권장
- `pnpm test`, `pnpm build` 실패 시 배포 중단

패키지 포함 파일 확인:

```bash
npm pack --dry-run
cd create-state-surface
npm pack --dry-run
cd ..
```

---

## 2) 버전 확인/결정

이미 같은 버전이 npm에 있으면 publish가 거절됩니다.

```bash
npm view state-surface version
npm view create-state-surface version
```

필요 시 버전 업데이트:

```bash
# 예시: 0.2.1로 올릴 때
npm version 0.2.1 --no-git-tag-version
cd create-state-surface
npm version 0.2.1 --no-git-tag-version
cd ..
```

그리고 `CHANGELOG.md`의 릴리스 섹션도 맞춰 업데이트하세요.

---

## 3) (중요) CLI 기본 런타임 버전 점검

`create-state-surface`는 템플릿의 `state-surface` 버전을 기본값으로 주입합니다.
아래 값이 이번 릴리스 라인과 맞는지 확인하세요.

확인 대상 파일(세 곳이 같은 값이어야 함):

- `create-state-surface/bin/create-state-surface.js`: `process.env.STATE_SURFACE_VERSION ?? '^0.2.0'`와 도움말
- `create-state-surface/lib/create.js`: `options.version ?? '^0.2.0'`
- `create-state-surface/README.md`: `STATE_SURFACE_VERSION` 기본값 설명

예:

- `create-state-surface/bin/create-state-surface.js`: `TEMPLATE_REF` — CLI가 템플릿을 내려받는 Git 태그 또는
  커밋 SHA(0.2.0은 릴리스 커밋 SHA). 그 ref가 GitHub에 push된 뒤에 CLI를 publish해야 한다(없으면 `npx` 실행이
  404로 실패). 브랜치 이름은 쓰지 않는다: 브랜치가 움직이면 이미 배포된 CLI가 깨진다.

- `state-surface@0.2.x` 릴리스 라인: `^0.2.0` 유지
- `state-surface@0.3.0` 릴리스 라인: 기본값을 `^0.3.0`로 변경 (0.x의 `^`는 두 번째 자리를 넘지 않음)

검사 명령:

```bash
rg -n "STATE_SURFACE_VERSION|options.version \\?\\?|\\^0\\.[0-9]+\\.0" create-state-surface/bin create-state-surface/lib create-state-surface/README.md
```

---

## 4) 실제 publish (순서 고정)

### 4-1. `state-surface` publish

루트에서:

```bash
npm publish --access public
```

성공 확인:

```bash
npm view state-surface version
```

### 4-2. `create-state-surface` publish

서브패키지에서:

```bash
cd create-state-surface
npm publish --access public
cd ..
```

성공 확인:

```bash
npm view create-state-surface version
```

---

## 5) 배포 후 검증 (필수)

새 폴더에서 실제 사용자 경로 검증:

```bash
cd /tmp
rm -rf ss-publish-smoke
npx create-state-surface@latest ss-publish-smoke
cd ss-publish-smoke
pnpm install
pnpm test
pnpm build
```

dev/start 스모크:

```bash
pnpm dev
# 브라우저에서 http://localhost:3000 확인 후 종료(Ctrl+C)
pnpm start
# 브라우저에서 http://localhost:3000 확인 후 종료(Ctrl+C)
```

추가로, 방금 배포한 런타임 버전을 강제로 검증하려면:

```bash
cd /tmp
rm -rf ss-publish-smoke-versioned
STATE_SURFACE_VERSION=<방금_배포한_버전_or_tag> npx create-state-surface@latest ss-publish-smoke-versioned
```

예: `STATE_SURFACE_VERSION=0.2.0`

---

## 6) 기존 프로젝트 업데이트 경로 검증 (권장)

기존 프로젝트(또는 fixture)에서:

```bash
pnpm up state-surface
pnpm test
pnpm build
```

이 단계가 통과되어야 “재스캐폴딩 없이 업데이트 가능”을 근거 있게 완료 처리할 수 있습니다.

---

## 7) 자주 발생하는 실패와 조치

### `403 Forbidden` / `You cannot publish over existing version`

- 이미 같은 버전이 배포됨
- `package.json` 버전 올리고 다시 publish

### `404 Not Found` (패키지 조회 시)

- 아직 최초 배포 전일 수 있음
- 패키지명 오타 여부 확인

### `402 Payment Required` / 권한 관련 오류

- npm org/권한 설정 문제
- 해당 계정에 publish 권한 있는지 확인

### OTP 관련 실패

- 2FA 코드 만료
- 새 코드로 즉시 재시도

---

## 8) 배포 완료 후 마무리 체크리스트

- [ ] `npm view state-surface version`이 기대 버전
- [ ] `npm view create-state-surface version`이 기대 버전
- [ ] `/tmp` 신규 스캐폴딩 검증 통과
- [ ] 기존 프로젝트 `pnpm up state-surface` 검증 통과
- [ ] `CHANGELOG.md` / 릴리스 노트 정리 완료
- [ ] Git 태그 생성 (예: `v0.2.0`) 및 푸시 완료

태그 예시:

```bash
git tag v0.2.0
git push origin v0.2.0
```


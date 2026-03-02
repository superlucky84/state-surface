# StateSurface Phase 2 — 프로덕션 프레임워크 설계

> StateSurface를 프로덕션 서비스 가능한 프레임워크로 전환하기 위한 아키텍처 설계.
> `IMPLEMENT_PHASE2.md`가 **실행 체크리스트**라면, 이 문서는 **왜·어떻게**를 정의한다.

읽기 순서: `DESIGN.md`(코어 설계) → `PROTOCOL.md`(프레임 규약) → **이 파일** → `IMPLEMENT_PHASE2.md`(실행).

---

## 0. 현재 상태 진단

### 엔진에 하드코딩된 앱 종속 코드

| 위치 | 문제 | 영향 |
|------|------|------|
| `engine/server/index.ts` L7 | `shared/i18n.js` import (`getLang`, `isValidLang`, `langCookie`) | 엔진이 앱의 i18n 구현에 직접 의존 |
| `engine/server/index.ts` L53 | `switch-lang` 트랜지션 이름 하드코딩 | 특정 트랜지션 이름에 엔진이 반응 |
| `engine/server/index.ts` L64 | `body.lang = getLang(req)` 자동 주입 | 모든 트랜지션에 lang 파라미터 강제 |
| `engine/client/main.ts` L6-10 | Prism.js 6개 모듈 import | 프레임워크 번들에 syntax highlighting 포함 |
| `engine/client/main.ts` L50-68 | `highlightCode()` + MutationObserver | 앱 전용 DOM 조작이 엔진에 존재 |
| `engine/client/main.ts` L20 | `fallbackTemplate: 'system:error'` 하드코딩 | 사용자가 fallback 템플릿명 변경 불가 |
| `engine/client/main.ts` L72 | `window.__surface = surface` | 프로덕션에서 불필요한 전역 노출 |

### 프로덕션 경로 부재

| 항목 | 현재 | 필요 |
|------|------|------|
| 서버 빌드 | 없음 (tsx 개발 모드만) | `vite build --ssr` → `node dist/server.js` |
| 프로덕션 시작 | `pnpm start` 없음 | `pnpm start` 스크립트 |
| 정적 에셋 서빙 | Vite 미들웨어 모드만 | `express.static()` |
| PORT 설정 | 3000 하드코딩 | `process.env.PORT` |
| Graceful shutdown | 없음 | `SIGTERM`/`SIGINT` 핸들러 |

### 에러 처리 갭

| 위치 | 문제 |
|------|------|
| `engine/shared/ndjson.ts` L23, L43, L51 | `JSON.parse` try/catch 없음 — 잘못된 프레임 하나로 전체 스트림 크래시 |
| `engine/server/routeHandler.ts` L39 | SSR 에러 내부 메시지를 NODE_ENV 무관하게 클라이언트에 노출 |
| `engine/server/index.ts` L61-88 | 트랜지션 스트림 타임아웃 없음 — 행 걸린 제너레이터가 커넥션 무한 점유 |
| `engine/client/stateSurface.ts` | 네트워크 에러 시 재시도/복구 없음 |

### 보안 부재

| 항목 | 현재 |
|------|------|
| 보안 헤더 | 없음 (`X-Content-Type-Options`, `X-Frame-Options`, CSP 등) |
| SSR Content-Type | `res.send(html)` — Express 자동 감지 의존 |
| Transition body 크기 제한 | Express 기본값(100kb) 의존, 명시적 설정 없음 |
| CORS | 미설정 |

### 구조적 문제

| 항목 | 문제 |
|------|------|
| 전역 싱글턴 | `templateRegistry`, `transitionRegistry`, `basePath`가 모듈 스코프 변수 — 테스트 격리 불가, 멀티 인스턴스 불가 |
| Public API 단일 진입점 | `engine/index.ts`가 서버/클라이언트 코드를 모두 export — 클라이언트 번들에 서버 코드 포함 가능 |
| 트랜지션 미들웨어 없음 | 인증, 로깅, rate limiting 등을 트랜지션 단위로 걸 수 없음 |
| 클라이언트 커스터마이징 불가 | `engine/client/main.ts`가 부트스트랩 전체를 하드코딩 — 포크 없이 확장 불가 |

---

## 1. 서버 훅 시스템

### 1.1 설계 목표

엔진의 트랜지션 엔드포인트에 **before/after 훅**을 제공하여, i18n·인증·로깅 등 앱 종속 로직을 엔진 밖으로 분리한다.

### 1.2 인터페이스

```typescript
/**
 * 트랜지션 요청의 전처리/후처리 훅.
 * engine/server/index.ts의 POST /transition/:name 핸들러에서 호출된다.
 */
interface TransitionHooks {
  /**
   * 트랜지션 핸들러 실행 전에 호출.
   * - body를 변환하여 반환하면 핸들러에 변환된 body가 전달된다.
   * - res에 헤더(Set-Cookie 등)를 설정할 수 있다.
   * - null/undefined를 반환하면 원본 body를 그대로 사용.
   */
  onBeforeTransition?(ctx: {
    name: string;
    body: Record<string, unknown>;
    req: Request;
    res: Response;
  }): Record<string, unknown> | void | Promise<Record<string, unknown> | void>;

  /**
   * 트랜지션 스트림 완료 후 호출 (res.end() 직전).
   * 로깅, 메트릭 수집 등에 사용.
   */
  onAfterTransition?(ctx: {
    name: string;
    req: Request;
    res: Response;
  }): void | Promise<void>;
}
```

### 1.3 i18n 분리 예시

현재 `engine/server/index.ts`에 하드코딩된 i18n 로직이 사용자 공간으로 이동한다:

```typescript
// routes/_shared/hooks.ts (사용자 코드)
import { getLang, isValidLang, langCookie } from '../../shared/i18n.js';

export const transitionHooks: TransitionHooks = {
  onBeforeTransition({ name, body, req, res }) {
    // 1. 모든 트랜지션에 lang 자동 주입 (기존 L64)
    if (!body.lang) body.lang = getLang(req);

    // 2. switch-lang 쿠키 설정 (기존 L53-55)
    if (name === 'switch-lang' && isValidLang(body.lang)) {
      res.setHeader('Set-Cookie', langCookie(body.lang as string));
    }

    return body;
  },
};
```

### 1.4 엔진 변경 범위

`engine/server/index.ts`에서:
1. `shared/i18n.js` import 3개 제거.
2. L53-55 (`switch-lang` 쿠키 설정) 제거.
3. L64 (`body.lang = getLang(req)`) 제거.
4. `onBeforeTransition` 훅 호출 지점 추가 (트랜지션 핸들러 호출 전).
5. `onAfterTransition` 훅 호출 지점 추가 (`res.end()` 직전).

### 1.5 훅 등록 방법

```typescript
// engine/server/index.ts (또는 createApp 내부)
interface StateSurfaceServerOptions {
  hooks?: TransitionHooks;
  // ... 기타 옵션
}
```

사용자가 `createApp({ hooks })` 또는 서버 엔트리에서 직접 등록한다.
파일 컨벤션 기반 자동 로딩(예: `routes/_shared/hooks.ts`)은 Phase 2 이후 고려.

---

## 2. 클라이언트 플러그인 시스템

### 2.1 설계 목표

`engine/client/main.ts`에서 앱 종속 코드(Prism.js 등)를 제거하고, 사용자가 플러그인으로 확장할 수 있게 한다.

### 2.2 인터페이스

```typescript
interface StateSurfacePlugin {
  /** 플러그인 식별자 (디버깅/트레이스용). */
  name: string;

  /** StateSurface 인스턴스 초기화 직후 호출. */
  onInit?(surface: StateSurface): void;

  /** 슬롯에 템플릿이 마운트된 직후 호출. */
  onMount?(slotName: string, el: Element, data: unknown): void;

  /** 슬롯의 데이터가 업데이트된 직후 호출. */
  onUpdate?(slotName: string, el: Element, data: unknown): void;

  /** 슬롯에서 템플릿이 언마운트된 직후 호출. */
  onUnmount?(slotName: string, el: Element): void;

  /** 트랜지션 시작 시 호출. */
  onTransitionStart?(name: string): void;

  /** 트랜지션 완료 시 호출 (성공/실패 무관). */
  onTransitionEnd?(name: string, error?: Error): void;
}
```

### 2.3 클라이언트 부트스트랩 변경

**Before** (현재 `engine/client/main.ts` — 앱 코드 하드코딩):

```typescript
import Prism from 'prismjs';
import 'prismjs/components/prism-markup';
// ... 5개 더

const surface = new StateSurface({ fallbackTemplate: 'system:error' });
// ... highlightCode() MutationObserver ...
(window as any).__surface = surface;
```

**After** (엔진은 최소 부트스트랩만, 앱 코드는 사용자 공간):

```typescript
// engine/client/main.ts — 프레임워크 코어만
import './templates/auto.js';
import { StateSurface } from './stateSurface.js';
import { createLithentBridge } from './lithentBridge.js';
import { bindDeclarativeActions } from './actionDelegation.js';

export function createStateSurface(options?: {
  fallbackTemplate?: string;
  plugins?: StateSurfacePlugin[];
  debug?: boolean;
}): StateSurface {
  const bridge = createLithentBridge();
  const surface = new StateSurface({
    fallbackTemplate: options?.fallbackTemplate ?? 'system:error',
    renderSlot: bridge.renderSlot,
    hydrateSlot: bridge.hydrateSlot,
    updateSlot: bridge.updateSlot,
    unmountSlot: bridge.unmountSlot,
  });

  // 플러그인 초기화
  for (const plugin of options?.plugins ?? []) {
    plugin.onInit?.(surface);
  }

  // 부트스트랩
  surface.bootstrap();
  bindDeclarativeActions(surface);

  // 디버그 모드
  if (options?.debug) {
    (window as any).__surface = surface;
  }

  return surface;
}
```

```typescript
// client/main.ts — 사용자 앱 코드 (showcase site)
import { createStateSurface } from 'state-surface/client';
import { prismPlugin } from './plugins/prism.js';

createStateSurface({
  plugins: [prismPlugin()],
  debug: location.search.includes('debug=1'),
});
```

### 2.4 Prism 플러그인 예시

```typescript
// client/plugins/prism.ts (사용자 코드, showcase site 전용)
import Prism from 'prismjs';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-tsx';
import type { StateSurfacePlugin } from 'state-surface/client';

export function prismPlugin(): StateSurfacePlugin {
  function highlight(el: Element) {
    el.querySelectorAll('pre code[class*="language-"]').forEach(block => {
      Prism.highlightElement(block as HTMLElement);
    });
  }

  return {
    name: 'prism',
    onMount(_slot, el) { highlight(el); },
    onUpdate(_slot, el) { highlight(el); },
  };
}
```

### 2.5 StateSurface 클래스 변경

`engine/client/stateSurface.ts`에 플러그인 호출 지점 추가:

- `mountTemplate()` 완료 후 → `plugin.onMount()` 호출
- `updateSlot()` 완료 후 → `plugin.onUpdate()` 호출
- `unmountTemplate()` 완료 후 → `plugin.onUnmount()` 호출
- `runTransition()` 시작 시 → `plugin.onTransitionStart()` 호출
- `runTransition()` 완료 시 → `plugin.onTransitionEnd()` 호출

---

## 3. 프로덕션 서버 빌드

### 3.1 빌드 파이프라인

```
pnpm build
  ├── vite build                          → dist/client/   (JS, CSS, assets)
  └── vite build --ssr engine/server/index.ts  → dist/server.js
```

### 3.2 vite.config.ts 변경

```typescript
export default defineConfig({
  // ... 기존 설정
  build: {
    outDir: 'dist/client',
  },
  ssr: {
    // Express, Node.js 내장 모듈은 번들에서 제외
    noExternal: ['lithent'],
  },
});
```

SSR 빌드는 별도 CLI 옵션(`--ssr`)으로 호출하므로 vite.config.ts의 `build` 설정은 클라이언트 전용.

### 3.3 서버 엔트리 분기

```typescript
// engine/server/index.ts
const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
  // 프로덕션: Vite 빌드 결과물 정적 서빙
  app.use(express.static(path.join(rootDir, 'dist/client')));
  app.use((_req, res) => res.status(404).send('Not Found'));
  app.listen(PORT, () => {
    console.log(`StateSurface running at http://localhost:${PORT}`);
  });
} else if (process.env.NODE_ENV === 'test') {
  // 테스트: 404 핸들러만
  app.use((_req, res) => res.status(404).send('Not Found'));
} else {
  // 개발: Vite 미들웨어 모드
  startDev();
}
```

### 3.4 package.json 스크립트

```json
{
  "scripts": {
    "dev": "tsx watch engine/server/index.ts",
    "build": "vite build && vite build --ssr engine/server/index.ts --outDir dist",
    "start": "NODE_ENV=production node dist/server.js",
    "test": "vitest run"
  }
}
```

### 3.5 Graceful Shutdown

```typescript
const server = app.listen(PORT, () => { /* ... */ });

function shutdown() {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
  // 강제 종료 타임아웃 (진행 중 스트림 drain 대기)
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

---

## 4. 에러 처리 강화

### 4.1 NDJSON 파서

**`engine/shared/ndjson.ts`** — 3개 `JSON.parse` 호출에 try/catch 추가:

```typescript
// createNdjsonParser.push()
try {
  const frame = JSON.parse(line) as StateFrame;
  onFrame(frame);
} catch {
  // 잘못된 프레임 스킵, trace로 보고
  trace?.('ndjson:parse-error', { line });
}
```

`decodeFrames()`도 동일하게 처리. 파싱 실패한 라인은 스킵하고 나머지 스트림은 계속 처리.

### 4.2 SSR 에러 응답

**`engine/server/routeHandler.ts`**:

```typescript
catch (err) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  console.error('SSR Error:', message);

  if (process.env.NODE_ENV === 'production') {
    res.status(500).type('text/html; charset=utf-8').send('Internal Server Error');
  } else {
    res.status(500).type('text/html; charset=utf-8').send(`SSR Error: ${message}`);
  }
}
```

### 4.3 트랜지션 스트림 타임아웃

**서버측** — 제너레이터에 AbortSignal 전달:

```typescript
// engine/server/index.ts — POST /transition/:name
const TRANSITION_TIMEOUT = 30_000; // 30초

const timeoutController = new AbortController();
const timer = setTimeout(() => timeoutController.abort(), TRANSITION_TIMEOUT);

try {
  const gen = handler(body, { signal: timeoutController.signal });
  for await (const frame of gen) {
    if (timeoutController.signal.aborted) {
      res.write(encodeFrame({ type: 'error', message: 'Transition timeout' }));
      break;
    }
    // ... 기존 프레임 처리
  }
} finally {
  clearTimeout(timer);
}
```

`TransitionHandler` 타입에 signal 옵션 추가:

```typescript
type TransitionHandler = (
  body: Record<string, unknown>,
  options?: { signal?: AbortSignal }
) => AsyncGenerator<StateFrame>;
```

**클라이언트측** — fetch에 timeout 설정:

```typescript
// engine/client/stateSurface.ts — runTransition()
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), this.options.transitionTimeout ?? 30_000);
```

---

## 5. 보안 강화

### 5.1 기본 보안 헤더

`engine/server/index.ts`에 기본 미들웨어 추가:

```typescript
// 기본 보안 헤더 (옵션으로 비활성화 가능)
if (options.securityHeaders !== false) {
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });
}
```

### 5.2 SSR Content-Type 명시

`engine/server/routeHandler.ts`:

```typescript
res.status(200).type('text/html; charset=utf-8').send(html);
```

### 5.3 Body Size Limit

```typescript
app.use(express.json({ limit: options.bodyLimit ?? '100kb' }));
```

---

## 6. Public API 분리

### 6.1 현재 문제

`engine/index.ts`가 서버와 클라이언트 코드를 모두 re-export한다.
클라이언트 번들에서 `import { defineTemplate } from 'state-surface'`를 쓰면, `defineTransition`(서버 전용)도 함께 번들될 수 있다.

### 6.2 진입점 분리

```
engine/
  index.ts          → 공통 타입/유틸 (RouteModule, StateFrame, prefixPath 등)
  server.ts         → 서버 전용 API (defineTransition, TransitionHooks 등)
  client.ts         → 클라이언트 전용 API (createStateSurface, StateSurfacePlugin 등)
```

```typescript
// engine/index.ts — 공통 (서버/클라이언트 양쪽에서 import 가능)
export { prefixPath, getBasePath } from './shared/basePath.js';
export { defineTemplate } from './shared/templateRegistry.js';
export type { RouteModule, BootConfig } from './shared/routeModule.js';
export type { StateFrame } from './shared/protocol.js';
export type { TemplateModule } from './shared/templateRegistry.js';

// engine/server.ts — 서버 전용
export { defineTransition } from './server/transition.js';
export type { TransitionHandler } from './server/transition.js';
export type { TransitionHooks, StateSurfaceServerOptions } from './server/types.js';

// engine/client.ts — 클라이언트 전용
export { createStateSurface } from './client/main.js';
export type { StateSurfacePlugin } from './client/types.js';
```

### 6.3 package.json exports 맵

```json
{
  "exports": {
    ".": "./engine/index.ts",
    "./server": "./engine/server.ts",
    "./client": "./engine/client.ts"
  }
}
```

`tsconfig.json`의 `paths`와 `vite.config.ts`의 `resolve.alias`도 동일하게 추가.

### 6.4 프레임워크 패키지 분리 및 배포 모델

Phase 2의 배포 단위는 **코어 런타임 패키지**와 **스캐폴딩 CLI 패키지**를 분리한다.

- `state-surface`:
  - 프레임워크 런타임 배포 단위.
  - public API 진입점(`.`, `./server`, `./client`)과 타입 선언을 포함.
  - 기존 프로젝트는 이 패키지 버전을 올려 업데이트한다.
- `create-state-surface`:
  - 신규 프로젝트 생성 전용 CLI.
  - 생성된 템플릿의 `package.json`은 `state-surface`를 의존성으로 가진다.
  - 프레임워크 업데이트 수단으로 재실행하지 않는다.

업데이트 경로는 다음을 기본 원칙으로 한다.

1. 기존 프로젝트: `pnpm up state-surface`로 업그레이드.
2. 브레이킹 변경: `MIGRATION.md`를 기준으로 수정.
3. 반복되는 브레이킹 패턴은 `state-surface migrate` codemod로 자동화.

---

## 7. 설정 시스템

### 7.1 설계 원칙

- **환경 변수 기반** — 설정 파일 없이 `PORT`, `BASE_PATH`, `NODE_ENV`로 제어.
- **프로그래매틱 옵션** — `createApp(options)`로 코드에서 세부 설정.
- 설정 파일(`state-surface.config.ts`)은 Phase 2 이후 필요 시 도입.

### 7.2 서버 옵션 인터페이스

```typescript
interface StateSurfaceServerOptions {
  /** 서버 포트. 기본값: process.env.PORT || 3000 */
  port?: number;

  /** URL 접두사. 기본값: process.env.BASE_PATH || '' */
  basePath?: string;

  /** 트랜지션 훅. */
  hooks?: TransitionHooks;

  /** 기본 보안 헤더 활성화. 기본값: true */
  securityHeaders?: boolean;

  /** express.json() body size limit. 기본값: '100kb' */
  bodyLimit?: string;

  /** 트랜지션 스트림 타임아웃 (ms). 기본값: 30000 */
  transitionTimeout?: number;
}
```

### 7.3 createApp 팩토리

현재 `engine/server/index.ts`는 top-level await로 모듈 임포트 시 즉시 Express app을 생성한다.
이를 `createApp()` 팩토리 함수로 감싸서 lazy 초기화하고, 옵션을 받을 수 있게 한다.

```typescript
// engine/server/index.ts
export async function createApp(options?: StateSurfaceServerOptions) {
  const port = options?.port ?? Number(process.env.PORT) || 3000;
  const basePath = options?.basePath ?? process.env.BASE_PATH ?? '';

  setBasePath(basePath);

  const app = express();
  app.use(express.json({ limit: options?.bodyLimit ?? '100kb' }));

  // 보안 헤더
  if (options?.securityHeaders !== false) { /* ... */ }

  // 라우트/트랜지션 자동 등록
  await bootstrapServer();
  const scannedRoutes = await scanRoutes(routesDir);
  // ... 라우트 등록

  // 트랜지션 엔드포인트 (훅 적용)
  app.post(prefixPath('/transition/:name'), async (req, res) => {
    let body = req.body ?? {};

    // before 훅
    if (options?.hooks?.onBeforeTransition) {
      const result = await options.hooks.onBeforeTransition({
        name: req.params.name, body, req, res,
      });
      if (result) body = result;
    }

    // ... 트랜지션 스트리밍 (기존 로직)

    // after 훅
    await options?.hooks?.onAfterTransition?.({ name: req.params.name, req, res });

    res.end();
  });

  return { app, port };
}
```

### 7.4 서버 엔트리 분리

`engine/server/index.ts`의 top-level 실행 코드는 **사용자 공간의 서버 엔트리**로 이동한다:

```typescript
// server.ts (프로젝트 루트, 사용자 코드)
import { createApp } from 'state-surface/server';
import { transitionHooks } from './routes/_shared/hooks.js';

const { app, port } = await createApp({
  hooks: transitionHooks,
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
```

`engine/server/index.ts`는 `createApp` 팩토리만 export하는 순수 모듈이 된다.

---

## 8. 전역 싱글턴 → 인스턴스 기반

### 8.1 현재 문제

| 모듈 | 전역 상태 | 영향 |
|------|----------|------|
| `templateRegistry.ts` | `Map<string, TagFunction>` | 테스트 간 상태 누수 |
| `transition.ts` | `Map<string, TransitionHandler>` | `clearRegistry` 없음 |
| `basePath.ts` | `let _basePath` | 테스트에서 리셋 필요 |

### 8.2 해결 방향

`createApp()` 내부에서 격리된 레지스트리 인스턴스를 생성하고, bootstrap·라우트 등록에 주입한다.

```typescript
// createApp 내부
const templates = new Map<string, TagFunction>();
const transitions = new Map<string, TransitionHandler>();

await bootstrapServer({ templates, transitions, routesDir });
```

**단, 클라이언트측 templateRegistry는 모듈 레벨 유지.** 브라우저에서는 앱 인스턴스가 하나이므로 전역 레지스트리가 자연스럽다.

서버측만 인스턴스 기반으로 변경하고, `defineTransition`/`defineTemplate` 헬퍼는 기본 전역 레지스트리에 등록하되 `createApp`이 override할 수 있게 한다.

---

## 9. 구현 우선순위

IMPLEMENT_PHASE2.md의 기존 Phase와 매핑:

| 순서 | 설계 섹션 | 대응 Phase | 중요도 |
|------|----------|-----------|--------|
| 1 | §7.3–7.4 createApp 팩토리 | 2-7, 2-8 | **Critical** — 이후 모든 변경의 기반 |
| 2 | §3 프로덕션 빌드 | 2-7 | **Critical** — 서비스 불가 |
| 3 | §1 서버 훅 시스템 | 2-8 (신규) | **Critical** — i18n 분리 선행 조건 |
| 4 | §2 클라이언트 플러그인 | 2-8 (신규) | **High** — Prism 분리 선행 조건 |
| 5 | §4 에러 처리 | 2-9 | **High** — 안정성 |
| 6 | §5 보안 | 2-9 | **High** — 안정성 |
| 7 | §6 Public API 분리 | 2-12 (확장) | **Medium** — DX |
| 8 | §6.4 패키지 분리/배포 | 2-6 (확장) | **Critical** — 재스캐폴딩 없는 업데이트 경로 |
| 9 | §8 싱글턴 → 인스턴스 | 2-13 (확장) | **Medium** — 테스트 품질 |

### 구현 의존성 그래프

```
§7.3 createApp 팩토리
  ├── §1 서버 훅 (createApp options에 hooks 추가)
  │     └── i18n 분리 (훅으로 이동)
  ├── §3 프로덕션 빌드 (createApp이 prod/dev 분기)
  │     └── §5.1 보안 헤더 (createApp options에 포함)
  └── §8 인스턴스 기반 (createApp이 레지스트리 소유)

§2 클라이언트 플러그인
  └── Prism.js 분리 (플러그인으로 이동)

§4 에러 처리 (독립 — 언제든 적용 가능)

§6 Public API 분리 (§1, §2 완료 후 — 새 export 대상이 확정되어야)
  └── §6.4 패키지 분리/배포
        ├── state-surface 패키지 배포
        └── create-state-surface 템플릿 의존성 정렬
```

---

## 10. 마이그레이션 전략

### 10.1 Breaking Changes

이 설계의 변경 중 기존 사용자 코드에 영향을 주는 항목:

| 변경 | 영향 | 마이그레이션 |
|------|------|-------------|
| `engine/server/index.ts` → `createApp()` 팩토리 | 서버 엔트리가 사용자 코드로 이동 | `server.ts` 파일 생성, `pnpm dev` 스크립트 변경 |
| `engine/client/main.ts` → `createStateSurface()` | 클라이언트 엔트리가 사용자 코드로 이동 | `client/main.ts` 수정, Prism 코드 플러그인으로 이동 |
| `import from 'state-surface'` → `/server`, `/client` 분리 | 일부 import 경로 변경 | `defineTransition` → `'state-surface/server'` |
| i18n 로직 엔진에서 제거 | 기존 자동 lang 주입 동작 변경 | 훅으로 명시적 등록 필요 |
| 업데이트 경로 전환 (`재스캐폴딩` → `패키지 업그레이드`) | 운영 중 프로젝트의 업데이트 방식 변경 | `pnpm up state-surface` + 브레이킹 시 `MIGRATION.md`/`state-surface migrate` 적용 |

### 10.2 단계별 적용

1. **createApp 팩토리 + 프로덕션 빌드** 먼저 구현 (서비스 가능한 상태 확보).
2. **서버 훅** 추가 후 i18n 분리 (기존 동작 유지하면서 훅 기반으로 전환).
3. **클라이언트 플러그인** 추가 후 Prism 분리.
4. **Public API 분리** 마지막 (export 대상 확정 후).
5. **패키지 분리/배포 모델** 적용 (`state-surface` 업그레이드 경로 + `create-state-surface` 생성 전용 역할 확정).

각 단계는 `pnpm test` 통과를 게이트로 한다.

---

## 11. 미래 고려사항 (Phase 2 범위 밖)

이 설계에서는 다루지 않지만, 프레임워크 성장 시 검토가 필요한 항목:

- **라우트별 미들웨어**: `RouteModule`에 `middleware` 필드 추가 (인증, 캐싱 등).
- **`<h-state>` 커스텀 엘리먼트 등록**: `customElements.define()`으로 정식 등록하여 라이프사이클 콜백·DevTools 통합.
- **SSE/WebSocket 대안 전송**: 프록시/CDN 환경에서 chunked encoding 문제 대응.
- **스트리밍 SSR**: 현재 전체 HTML을 동기 렌더링 후 전송. `Transfer-Encoding: chunked`로 점진적 전송.
- **Health check 엔드포인트**: `/health`, `/ready` — 컨테이너 오케스트레이션 연동.
- **구조화된 로깅**: pino 등 도입, 로그 레벨·JSON 포맷 지원.

# AF03 MAIN runtime·site adapter 분리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 MAIN world 동작과 공개 ABI를 유지하면서 runtime과 치지직 내부 객체 접근을 TypeScript module graph와 bounded site capability 경계로 이전한다.

**Architecture:** `web/runtime.js`와 `web/site-adapter.js`는 각각 하나의 classic IIFE 산출물로 남지만, 수기 원본은 `src/main/**`의 작은 TypeScript module로 교체한다. Runtime은 route·scope·status·bridge·lifecycle을 조립하고, adapter는 React/webpack/치지직 DOM을 검증된 primitive snapshot과 소유권을 가진 operation으로만 노출한다.

**Tech Stack:** Chrome MV3 MAIN world, TypeScript 7.0.2 strict, esbuild 0.28.2, Node 24.19.0 test runner, jsdom 30.1.2, Playwright 1.62.1.

**Spec:** `docs/superpowers/specs/2026-10-12-af03-runtime-site-adapter-design.md`

## Global Constraints

- Chrome 121 이상만 대상으로 하며 Firefox 구현·빌드·배포를 추가하지 않는다.
- manifest의 `web/runtime.js`, `web/site-adapter.js` 파일명, MAIN world와 로드 순서를 바꾸지 않는다.
- `Symbol.for('cheese-knife.runtime.v1')` 공개 이름과 기존 runtime 공개 ABI를 유지한다.
- esbuild `0.28.2`, target `chrome121`, bundle `true`, format `iife`, platform `browser`, minify `false`, sourcemap `false`, legalComments `none`, charset `utf8`을 고정한다.
- 새 dependency, 권한, host permission, storage key, endpoint, telemetry, 사용자 데이터 수집·전송과 remote code를 추가하지 않는다.
- 설정 key/default, UI, CSS, 기능 정책, Chrome 웹 스토어 버전·제출은 변경하지 않는다.
- 일반 check/build/candidate/package/CI는 generated output을 쓰지 않으며, 명시적 `--write`는 CI에서 거부한다.
- 사이트 내부 객체는 `unknown`에서 own data descriptor와 bounded traversal을 통과해야 한다. accessor를 실행하거나 raw React/webpack/controller/player 객체를 공개하지 않는다.
- 공개 artifact와 테스트 fixture에는 실제 계정·쿠키·채팅·결제·후원·연령 제한 콘텐츠를 넣지 않는다.
- manifest, 권한, endpoint, storage 또는 기능 정책 변경이 필요해지면 구현을 중지하고 설계를 다시 승인받는다.

## Review Focus

1. accessor·Proxy·cycle·상한 초과 site object는 getter 실행이나 무한 순회 없이 capability `null`로 끝나야 한다. Task 3 adapter hostile-fixture 검사로 고정한다.
2. BFCache freeze/show, final pagehide와 startup 예외가 교차해도 observer·pulse·config timer·registry가 중복되거나 남지 않아야 한다. Task 2 lifecycle 검사로 고정한다.
3. runtime보다 늦게 오거나 누락·중복된 adapter는 한 번만 reconcile하고 기능별 limited 상태로 격리돼야 한다. Task 4 load-order 검사로 고정한다.
4. chat controller·listener slot·message array identity가 교체되거나 native handler가 thenable을 반환해도 외부 데이터를 덮어쓰거나 raw 객체를 유출하지 않아야 한다. Task 3·4 chat ownership 검사로 고정한다.
5. symlink source, stale output, Windows 경로 차이와 adapter bundle의 runtime 중복은 build·candidate·CI 전에 실패해야 한다. Task 1·2·5 생성 gate 검사로 고정한다.

---

### Task 1: 공통 generated-runtime guard 추출

**Files:**
- Create: `scripts/generated-runtime.mjs`
- Create: `tests/generated-runtime.test.cjs`
- Modify: `scripts/settings-runtime.mjs`
- Modify: `tests/settings-runtime-generation.test.cjs`

**Interfaces:**
- Produces: `CLASSIC_RUNTIME_OPTIONS`, `generatedFailure(code)`, `validateClassicRuntime(source, identities, codes)`, `checkGeneratedRuntime(root, entries, render, codes)`, `writeGeneratedRuntime(root, entries, render, codes)`.
- Preserves: `SETTINGS_RUNTIME_ENTRIES`, `SETTINGS_RUNTIME_OPTIONS`, `renderSettingsRuntime`, `validateSettingsRuntime`, `checkSettingsRuntime`, `writeSettingsRuntime`와 현재 오류 코드·CLI.

- [ ] **Step 1: 공통 guard의 실패 검사를 작성**

`tests/generated-runtime.test.cjs`에 다음 사례를 추가한다.

- `CLASSIC_RUNTIME_OPTIONS`가 target/minify/sourcemap/legalComments/charset을 정확히 고정한다.
- 예상 output set 불일치, classic-script 구문 오류, `require(`, dynamic import, `eval`, `new Function`, source map URL과 remote import를 지정 오류 코드로 거부한다.
- `checkGeneratedRuntime`은 두 번 render한 byte가 다르거나 committed output이 stale이면 쓰기 없이 실패한다.
- `writeGeneratedRuntime`은 `CI`가 설정되면 실패하고, source/output link는 `openOwnedRoot`를 통해 거부한다.

- [ ] **Step 2: 실패 검사를 실행**

Run: `node --test tests/generated-runtime.test.cjs tests/settings-runtime-generation.test.cjs`

Expected: FAIL because `scripts/generated-runtime.mjs` and its exports do not exist.

- [ ] **Step 3: 최소 공통 guard를 구현하고 settings wrapper를 유지**

`scripts/generated-runtime.mjs`는 실제 공유되는 고정 옵션, classic output 검사, 두 번 render 비교, owned committed-output 비교와 CI write 거부만 가진다. Entry별 global/ABI·marker·hash 검사는 `scripts/settings-runtime.mjs`에 남긴다.

`validateClassicRuntime` signature:

```ts
validateClassicRuntime(
  source: string,
  identities: readonly string[],
  codes: { syntax: string; sourceMap: string; forbidden: string },
): void
```

`checkGeneratedRuntime`와 `writeGeneratedRuntime`은 `{ source, output }` entry 목록만 사용하고 render callback이 반환한 `Record<string, string>` 외의 값을 받지 않는다.

- [ ] **Step 4: 집중 검사를 통과시킨다**

Run: `node --test tests/generated-runtime.test.cjs tests/settings-runtime-generation.test.cjs tests/settings-contract.test.cjs tests/settings-client.test.cjs tests/settings-broker.test.cjs`

Expected: all tests PASS and existing settings error codes remain unchanged.

- [ ] **Step 5: 정적 검사를 실행**

Run: `npm run typecheck; node scripts/tool-audit.mjs`

Expected: TypeScript PASS; tool audit reports npm 0, Gitleaks directory 0, Git 0 and no new ESLint observation outside `scripts/owned-files.mjs`.

- [ ] **Step 6: 커밋**

```powershell
git add scripts/generated-runtime.mjs scripts/settings-runtime.mjs tests/generated-runtime.test.cjs tests/settings-runtime-generation.test.cjs
git commit -m "refactor: share generated runtime guards"
```

### Task 2: MAIN runtime과 현재 adapter를 TypeScript module graph로 생성

**Files:**
- Create: `scripts/main-runtime.mjs`
- Create: `tests/main-runtime-generation.test.cjs`
- Create: `src/main/runtime/contracts.ts`
- Create: `src/main/runtime/route.ts`
- Create: `src/main/runtime/scope.ts`
- Create: `src/main/runtime/status.ts`
- Create: `src/main/runtime/bridge.ts`
- Create: `src/main/runtime/lifecycle.ts`
- Create: `src/main/runtime/entry.ts`
- Create: `src/main/site-adapter/entry.ts`
- Modify generated: `web/runtime.js`
- Modify generated: `web/site-adapter.js`
- Modify: `tsconfig.json`
- Modify: `tests/runtime.test.cjs`
- Modify: `tests/adapter.test.cjs`

**Interfaces:**
- Consumes: Task 1 `CLASSIC_RUNTIME_OPTIONS`, `validateClassicRuntime`, `checkGeneratedRuntime`, `writeGeneratedRuntime`.
- Produces: `MAIN_RUNTIME_ENTRIES`, `MAIN_RUNTIME_OPTIONS`, `renderMainRuntime`, `validateMainRuntime`, `checkMainRuntime`, `writeMainRuntime`.
- Produces runtime types: `Route`, `PlayerSnapshot`, `RuntimeState`, `FeatureStatus`, `ResourceScope`, `KnifeRuntime`.
- Preserves runtime methods: `route()`, `selectPlayer()`, `setStatus()`, `diagnostics()`, `subscribe()`, `reconcile()`, `schedule()`, `createScope()`.

- [ ] **Step 1: MAIN 생성 계약 실패 검사를 작성**

`tests/main-runtime-generation.test.cjs`에 다음을 고정한다.

- entry는 `src/main/runtime/entry.ts → web/runtime.js`, `src/main/site-adapter/entry.ts → web/site-adapter.js` 두 개뿐이다.
- render를 두 번 실행하면 byte-identical하고, output 두 개 모두 `vm.Script`로 파싱된다.
- adapter metafile input에 `src/main/runtime/entry.ts`·`lifecycle.ts`가 없고 runtime registry 구현이 중복되지 않는다.
- stale output, linked source/output, 저장소 밖 input, unexpected output, `--write`의 CI 사용을 거부한다.
- runtime output은 registry symbol을, adapter output은 runtime lookup과 adapter 단일 설치를 포함한다.

- [ ] **Step 2: runtime 수명주기 실패 검사를 보강**

`tests/runtime.test.cjs`에 다음 test name과 assertion을 추가한다.

- `startup failure rolls back only its own registry and resources`
- `scope cleanup is reverse ordered and one cleanup failure does not stop the rest`
- `persisted pagehide freezes one pulse and pageshow resumes it once`
- `final pagehide removes owned listeners observer timers and registry`
- `bridge copies config and i18n own data descriptors and rejects accessors prototypes and stale revisions`

Startup fault는 MutationObserver/`postMessage` 등 한 경계만 fixture로 실패시키고, 실제 DOM lifecycle과 runtime code는 그대로 실행한다.

- [ ] **Step 3: 실패 검사를 실행**

Run: `node --test tests/main-runtime-generation.test.cjs tests/runtime.test.cjs tests/adapter.test.cjs tests/bridge.test.cjs`

Expected: FAIL because MAIN generator and TypeScript entries do not exist and current cleanup/descriptor behavior is incomplete.

- [ ] **Step 4: runtime 모듈을 최소 구현**

정확한 exported signature는 다음과 같다.

```ts
parseRoute(pathname: string): Route
createResourceScope(environment: ScopeEnvironment): ResourceScope
createStatusStore(post: (payload: StatusPayload) => void, diagnostics: () => RuntimeDiagnostics): StatusStore
readConfigEnvelope(event: MessageEvent, expected: BridgeExpectation): ConfigEnvelope | null
createLifecycle(runtime: KnifeRuntime, environment: RuntimeEnvironment): RuntimeLifecycle
installRuntime(window: Window): KnifeRuntime | null

interface BridgeExpectation {
  source: Window
  origin: string
  requestId: string
  revision: number
}
```

`entry.ts`는 모든 component와 cleanup stack을 만든 뒤 own symbol descriptor로 registry를 한 번 설치한다. Startup 실패 시 instance identity가 같은 registry만 삭제하고 cleanup을 역순 실행한다. Runtime의 현재 route 결과, status key/reason 상한, scope API, subscriber 격리, config 재시도 20회·100ms, transition 20개와 URL pulse 1000ms를 유지한다.

이 task에서는 행동 parity를 위해 player/sidebar discovery와 기존 raw adapter API를 그대로 옮기되, 다음 task에서 경계를 좁힐 수 있도록 runtime 내부 함수와 adapter entry에만 둔다. 새 fallback이나 새 기능은 추가하지 않는다.

- [ ] **Step 5: 두 classic output을 생성하고 검사**

Run: `node scripts/main-runtime.mjs --write`

Expected: exactly `web/runtime.js` and `web/site-adapter.js` are written with generated markers.

Run: `node scripts/main-runtime.mjs; npm run typecheck`

Expected: `MAIN runtime OK: 2 files`; TypeScript PASS.

- [ ] **Step 6: 집중 회귀를 통과시킨다**

Run: `node --test tests/main-runtime-generation.test.cjs tests/runtime.test.cjs tests/adapter.test.cjs tests/bridge.test.cjs tests/bridge-cleanup.test.cjs tests/integration.test.cjs`

Expected: all tests PASS; no user-visible behavior or manifest change.

- [ ] **Step 7: 커밋**

```powershell
git add scripts/main-runtime.mjs tests/main-runtime-generation.test.cjs src/main tsconfig.json web/runtime.js web/site-adapter.js tests/runtime.test.cjs tests/adapter.test.cjs
git commit -m "refactor: generate MAIN runtime from TypeScript"
```

### Task 3: bounded site capability와 hostile-object 검증 구현

**Files:**
- Create: `src/main/site-adapter/contracts.ts`
- Create: `src/main/site-adapter/react.ts`
- Create: `src/main/site-adapter/discovery.ts`
- Create: `src/main/site-adapter/capabilities.ts`
- Modify: `src/main/site-adapter/entry.ts`
- Modify generated: `web/site-adapter.js`
- Modify: `tests/adapter.test.cjs`
- Create: `tests/adapter-capabilities.test.cjs`
- Modify: `tests/tool-warning-remediation.test.cjs`

**Interfaces:**
- Produces `SiteAdapter` with `discover`, `chat.readMessage`, `chat.connect`, `banner.closeHandler`, `video.openDate`, `player.readMetrics`.
- Produces snapshots: `SiteSnapshot`, `ChatMessageSnapshot`, `BlindEventSnapshot`, `SitePlayerMetrics`.
- Produces ownership interfaces: `OwnedBinding`, `ChatControllerPort`, `BlindTransition`.
- Temporarily preserves only the raw methods with current callers (`fiberOf`, `propsOf`, `stateOf`, `getCorePlayer`) until Task 4 migrates them. 사용처가 없는 `contextOf`, `getWebpackRequire`는 이 task에서 제거하며 새 caller는 어떤 raw method도 사용하지 않는다.

- [ ] **Step 1: hostile React/site fixture 검사를 작성**

`tests/adapter-capabilities.test.cjs`에 다음을 추가한다.

- React own data property만 읽고 inherited property와 throwing accessor를 실행하지 않는다. Throwing Proxy도 예외를 capability 실패로 격리하고 같은 generation에서 반복 탐색하지 않는다.
- fiber/hook/context chain은 각각 300/300/100에서 끝나며 cycle은 `null`로 끝난다.
- `discover`는 route root 안의 정확히 한 player만 반환하고 `.knife-preview`, `.knife-popup`, broad `aside/nav` fallback을 선택하지 않는다.
- `readMessage`는 primitive snapshot과 안정된 numeric identity만 반환하고 64KiB 초과 content, 256자 초과 key/user/openDate/codec과 non-finite number를 거부한다.
- `closeHandler`는 원 receiver를 보존하며 raw props/fiber를 callback에 전달하지 않는다.
- `readMetrics`는 codec 문자열만 반환하고 `_corePlayer`를 반환하지 않는다.

- [ ] **Step 2: chat ownership 실패 검사를 작성**

`tests/adapter-capabilities.test.cjs`에 synthetic controller로 다음을 고정한다.

- 같은 controller는 같은 active port를 반환하고 교체 controller는 다른 port를 반환한다.
- `installMessageFilter(predicate)`는 원 receiver/result를 보존하고 exact replacement identity일 때만 복원한다.
- `installBlindListener(handler)`는 ordered native slot 하나만 소유하며 reconnect 시 exact copied identity만 unwrap한다.
- blind handler는 primitive `event`, `before`, `after`와 `replaceAfterStatus(expected, nextStatus)` operation만 받는다.
- message array/index/controller identity가 바뀌면 replace는 `null`; thenable native result는 after/replace 없이 반환되고 원 thenable을 보존한다.
- `dispose()`는 멱등이고 foreign replacement를 덮어쓰지 않는다.

- [ ] **Step 3: 실패 검사를 실행**

Run: `node --test tests/adapter.test.cjs tests/adapter-capabilities.test.cjs tests/tool-warning-remediation.test.cjs`

Expected: FAIL because safe capabilities and bounded descriptors do not exist.

- [ ] **Step 4: descriptor 기반 traversal과 capability를 구현**

중요 signature는 다음과 같다.

```ts
interface SiteAdapter {
  discover(root: Document, route: Route): SiteSnapshot
  chat: {
    readMessage(row: Element): ChatMessageSnapshot | null
    connect(container: Element): ChatControllerPort | null
  }
  banner: { closeHandler(node: Element): (() => void) | null }
  video: { openDate(node: Element): string | null }
  player: { readMetrics(layout: Element): Promise<SitePlayerMetrics | null> }
}
interface OwnedBinding { readonly active: boolean; dispose(): void }
interface ChatControllerPort {
  readonly active: boolean
  emptyStatus(): string | null
  messages(): readonly ChatMessageSnapshot[]
  installMessageFilter(block: (message: ChatMessageSnapshot | null) => boolean): OwnedBinding | null
  installBlindListener(handler: (transition: BlindTransition) => void): OwnedBinding | null
  replaceStatus(expected: ChatMessageSnapshot, nextStatus: string): ChatMessageSnapshot | null
  dispose(): void
}
interface BlindTransition {
  event: BlindEventSnapshot | null
  before: ChatMessageSnapshot | null
  after: ChatMessageSnapshot | null
  replaceAfterStatus(expected: ChatMessageSnapshot, nextStatus: string): ChatMessageSnapshot | null
}
```

Identity는 adapter 내부 `WeakMap<object, number>`로만 관리한다. Snapshot은 `identity`, `key`, `user`, `time`, `playerTime`, `type`, `status`, `content`의 검증된 primitive만 가진다. `replaceStatus`는 current list·index·descriptor·identity를 재검사하고 clone replacement와 native update를 한 operation 안에서 수행한다.

Known webpack diagnostics는 own descriptor의 array 여부만 읽는다. 제품에서 사용하지 않는 webpack module injection/probe와 timeout은 제거한다.

- [ ] **Step 5: adapter를 재생성하고 집중 검사를 통과시킨다**

Run: `node scripts/main-runtime.mjs --write`

Run: `node --test tests/main-runtime-generation.test.cjs tests/adapter.test.cjs tests/adapter-capabilities.test.cjs tests/tool-warning-remediation.test.cjs`

Expected: all tests PASS; no getter invocation, raw return or timer-based webpack probe.

- [ ] **Step 6: 커밋**

```powershell
git add src/main/site-adapter web/site-adapter.js tests/adapter.test.cjs tests/adapter-capabilities.test.cjs tests/tool-warning-remediation.test.cjs
git commit -m "refactor: add bounded site adapter capabilities"
```

### Task 4: runtime과 기능 호출부를 capability로 이전하고 raw API 제거

**Files:**
- Modify: `src/main/runtime/contracts.ts`
- Modify: `src/main/runtime/lifecycle.ts`
- Modify: `src/main/runtime/entry.ts`
- Modify: `src/main/site-adapter/entry.ts`
- Modify: `src/main/site-adapter/discovery.ts`
- Modify generated: `web/runtime.js`
- Modify generated: `web/site-adapter.js`
- Modify: `web/inject.js`
- Modify: `web/player.js`
- Modify: `tests/runtime.test.cjs`
- Modify: `tests/adapter.test.cjs`
- Modify: `tests/deleted-chat.test.cjs`
- Modify: `tests/player.test.cjs`
- Modify: `tests/integration.test.cjs`
- Modify: `tests/main-runtime-generation.test.cjs`

**Interfaces:**
- Consumes: Task 3 `SiteAdapter`, `ChatControllerPort`, `ChatMessageSnapshot`, `BlindTransition`.
- Removes: `fiberOf`, `propsOf`, `stateOf`, `contextOf`, `getWebpackRequire`, `getCorePlayer` from `runtime.adapter`.
- Preserves: deleted-chat eligibility/retention policy, donation type `10` filter, timestamp formatting, start-time annotation and player statistics UI.

- [ ] **Step 1: late/missing adapter와 raw API 부재 검사를 작성**

다음을 고정한다.

- runtime만 load하면 route/bridge/status는 동작하고 body/sidebar/player는 `null`이다.
- adapter load는 capability를 한 번 설치하고 `runtime.reconcile()`을 정확히 한 번 호출한다.
- adapter duplicate load, runtime 없는 adapter load와 accessor/proxy 실패는 listener·timer를 추가하지 않는다.
- generated adapter source와 runtime adapter own keys에 금지 raw API 여섯 개가 없다.
- adapter unavailable은 player/chat 관련 상태만 pending/limited로 두고 다른 runtime 기능을 중단하지 않는다.

- [ ] **Step 2: 기능 parity 실패 검사를 capability 기준으로 변경**

`tests/deleted-chat.test.cjs`는 기존 native order, CANCEL, repeated blind, OFF re-hide, reconnect, foreign replacement, VOD 제한과 row reuse assertions를 그대로 유지하되 raw controller access assertion을 제거한다. 추가로 native thenable, message list 교체와 64KiB 초과 content가 외부 데이터를 변경하지 않고 `limited`가 되는지 검사한다.

`tests/player.test.cjs`는 codec snapshot을 통해 동일 codec 문자열을 표시하고 raw `_corePlayer`가 runtime 밖으로 나오지 않는지 검사한다.

`tests/integration.test.cjs`는 timestamp `time/playerTime`, `video.openDate`, banner receiver-preserving close를 각각 capability fixture로 검사한다.

- [ ] **Step 3: 실패 검사를 실행**

Run: `node --test tests/runtime.test.cjs tests/adapter.test.cjs tests/adapter-capabilities.test.cjs tests/deleted-chat.test.cjs tests/player.test.cjs tests/integration.test.cjs tests/main-runtime-generation.test.cjs`

Expected: FAIL while callers still use raw adapter APIs and runtime owns site selectors.

- [ ] **Step 4: runtime discovery를 adapter snapshot으로 치환**

`runtime.reconcile()`은 `runtime.adapter?.discover(document, route)` 결과만 사용해 body/sidebar/player/diagnostics를 구성한다. Adapter가 없거나 실패하면 null snapshot으로 계속 실행한다. Adapter entry는 완성된 object를 한 번 설치한 직후 reconcile하고, 중복 설치는 아무 작업도 하지 않는다.

- [ ] **Step 5: chat 호출부를 capability로 치환**

- timestamp와 deleted-chat row는 `chat.readMessage` snapshot을 사용한다.
- donation/deleted-chat은 `chat.connect` port와 owned binding만 사용한다.
- retained message는 numeric identity와 immutable snapshot으로 보관하고 `replaceStatus` 성공분만 확장 소유로 간주한다.

- [ ] **Step 6: 단순 metadata·banner·player 호출부를 capability로 치환**

- start-time은 `video.openDate`, banner는 `banner.closeHandler`, player codec은 `player.readMetrics`를 사용한다.
- capability `null`, detached node와 ownership 충돌은 기존 reason code 또는 `native-deletion-adapter-unavailable`로 limited 처리한다.

- [ ] **Step 7: raw API를 제거하고 생성 validator로 재발을 막는다**

`src/main/site-adapter/entry.ts`에서 임시 raw exports를 삭제한다. `validateMainRuntime`은 adapter output에서 `fiberOf`, `propsOf`, `stateOf`, `contextOf`, `getWebpackRequire`, `getCorePlayer` 공개 key marker가 나타나면 `main-runtime-raw-adapter`로 실패한다.

- [ ] **Step 8: 재생성·집중 회귀를 통과시킨다**

Run: `node scripts/main-runtime.mjs --write; npm run typecheck`

Run: `node --test tests/runtime.test.cjs tests/adapter.test.cjs tests/adapter-capabilities.test.cjs tests/deleted-chat.test.cjs tests/player.test.cjs tests/integration.test.cjs tests/tool-warning-remediation.test.cjs tests/main-runtime-generation.test.cjs`

Expected: all tests PASS and `rg -n "fiberOf|propsOf|stateOf|contextOf|getWebpackRequire|getCorePlayer|_currentCodecs" web src/main` matches only private implementation names/tests allowed by the plan, never a public adapter key or feature caller.

- [ ] **Step 9: 커밋**

```powershell
git add src/main web/runtime.js web/site-adapter.js web/inject.js web/player.js tests
git commit -m "refactor: isolate site internals behind adapter"
```

### Task 5: build·candidate·package·CI 생성 gate 연결

**Files:**
- Modify: `package.json`
- Modify: `scripts/build.mjs`
- Modify: `scripts/verify-candidate.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/package.test.cjs`
- Modify: `tests/installed-extension-candidate.test.cjs`
- Modify: `tests/runtime-inventory.test.cjs`
- Modify: `tests/fixtures/runtime-executable-baseline.json`
- Modify only if proof output changed: `tests/fixtures/build-proof-baseline.json`

**Interfaces:**
- Adds scripts: `generate:main = node scripts/main-runtime.mjs --write`, `check:main-runtime = node scripts/main-runtime.mjs`.
- Changes `buildChecked` and `verifyCandidate` to run both `checkSettingsRuntime` and `checkMainRuntime` before copying files.
- Preserves runtime JavaScript inventory at 16 shipped files.

- [ ] **Step 1: 우회 방지 실패 검사를 작성**

다음을 추가한다.

- stale `web/runtime.js` 또는 `web/site-adapter.js`에서 `buildChecked`가 `main-runtime-drift`로 실패하고 어떤 generated file도 고치지 않는다.
- candidate 검사는 stale MAIN output이면 candidate directory를 남기지 않는다.
- package fixture는 source graph와 두 generated output을 갖출 때만 성공한다.
- runtime inventory 파일 목록은 16개로 유지하지만 executable baseline은 새 generated bytes를 요구한다.
- foundation workflow가 `check:main-runtime`을 typecheck 뒤·build proof 전에 실행한다.

- [ ] **Step 2: 실패 검사를 실행**

Run: `node --test tests/package.test.cjs tests/installed-extension-candidate.test.cjs tests/runtime-inventory.test.cjs tests/build-proof.test.cjs`

Expected: FAIL because build/candidate/CI do not call the MAIN drift checker and baselines are stale.

- [ ] **Step 3: 최소 gate 연결을 구현**

`buildChecked`와 `verifyCandidate`는 settings와 MAIN checker를 순서대로 호출한다. 일반 `build` 함수는 copied candidate 내부에서 이미 검증된 파일을 다시 생성하지 않는다. Package script와 workflow에 명시적 check command만 추가한다.

- [ ] **Step 4: 승인된 baseline을 기계적으로 갱신**

Run: `node scripts/check-runtime-inventory.mjs`

Expected: `runtime-executable-changed` only. 새 generated output을 검토한 뒤 executable hash fixture만 갱신한다. 파일 목록, manifest/permission baseline이나 build-proof 의미가 달라지면 자동 승인하지 않고 원인을 먼저 고친다.

- [ ] **Step 5: build 경로 회귀를 통과시킨다**

Run: `npm run check:toolchain; npm run check:runtime-js; npm run typecheck; npm run check:settings-runtime; npm run check:main-runtime; npm run check:build-proof`

Run: `node --test tests/package.test.cjs tests/installed-extension-candidate.test.cjs tests/runtime-inventory.test.cjs tests/build-proof.test.cjs`

Run: `npm run build; npm run check`

Expected: all commands PASS; `dist` contains the same 20 packaged resources and no `.ts`, map or extra bundle.

- [ ] **Step 6: 커밋**

```powershell
git add package.json scripts/build.mjs scripts/verify-candidate.mjs .github/workflows/ci.yml tests/package.test.cjs tests/installed-extension-candidate.test.cjs tests/runtime-inventory.test.cjs tests/fixtures/runtime-executable-baseline.json tests/fixtures/build-proof-baseline.json
git commit -m "build: gate MAIN runtime generation"
```

### Task 6: 전체 검증, 독립 검토와 AF03 상태 고정

**Files:**
- Create: `docs/superpowers/validation/2026-10-12-af03-runtime-site-adapter.md`
- Modify: `PLANS.md`
- Modify if findings require a fix: only files owned by Tasks 1–5 and their tests

**Interfaces:**
- Consumes: Tasks 1–5 completed branch.
- Produces: reproducible validation record, resolved Critical/Important review findings, Korean PR and public CI evidence.

- [ ] **Step 1: focused and whole-suite tests**

Run: `node --test tests/*.test.cjs`

Expected: all tests PASS with only the existing intentional skip, and no new skipped/empty target.

- [ ] **Step 2: foundation·build·package gates**

Run: `npm run check:toolchain; npm run check:runtime-js; npm run typecheck; npm run check:settings-runtime; npm run check:main-runtime; npm run check:build-proof; npm run build; npm run check`

Expected: all PASS; generator checks are read-only and the working tree remains unchanged except expected `dist` ignored output.

- [ ] **Step 3: objective audio와 설치형 E2E**

Run: `node scripts/check-audio-quality.mjs --chrome`

Expected: full-scale/stress/transition baseline PASS with no AF03 metric regression.

Run: `npm run test:e2e; npm run test:e2e:negative`

Expected: positive scenario PASS including multiwindow/settings/reload/context coverage; negative scenario reports the expected `main-runtime-missing` control.

- [ ] **Step 4: security/tool and delta audit**

Run: `node scripts/tool-audit.mjs`

Expected: npm 0, Gitleaks directory 0, Git 0; no new ESLint observation outside the existing guarded owned-file boundary.

Run: `git diff main...HEAD -- manifest.json package.json web src/main scripts .github tests`

Expected: no manifest permission, host permission, storage key, endpoint, telemetry, remote code, version or packaged resource-set expansion.

- [ ] **Step 5: 독립 whole-branch 코드 검토**

검토자는 spec과 plan을 함께 읽고 `main...HEAD` 전체를 다음 순서로 확인한다.

- runtime startup rollback, BFCache/final teardown와 duplicate install
- accessor/proxy/cycle·bounded traversal과 primitive-only capability
- chat filter/blind/message ownership 및 foreign replacement 보존
- generated source/output drift와 build/candidate/CI 우회 가능성
- 권한·데이터·네트워크·스토어 정책 delta

Critical/Important finding은 최소 수정과 회귀 검사로 보완하고 focused/full gate를 다시 실행한다. 근거 없는 style-only 제안은 AF03에 넣지 않는다.

- [ ] **Step 6: validation과 PLANS를 기록**

Validation 문서에는 base/head commit, 명령·결과, test pass/skip 수, generated hash, runtime inventory, package resource 수, E2E 결과, tool audit, manifest/data/network delta, review findings와 롤백 commit을 기록한다.

`PLANS.md`는 AF03 구현·검증 항목을 실제 근거가 있는 것만 `[x]`로 바꾸고, 상태는 PR/CI 전 `DOING`, 병합 뒤 `DONE`으로 갱신한다. AF04는 AF03 병합 전 열지 않는다.

- [ ] **Step 7: 문서 커밋**

```powershell
git add docs/superpowers/validation/2026-10-12-af03-runtime-site-adapter.md PLANS.md
git commit -m "docs: validate AF03 runtime adapter migration"
```

- [ ] **Step 8: 한글 PR·공개 CI·병합**

Branch를 push하고 `Do-hyeon/cheese-knife`의 `main` 대상으로 한글 PR을 만든다. PR에는 scope, 불변 조건, 객관 검증, 미검증·롤백을 포함하고 스토어 배포 문구는 넣지 않는다.

Expected public checks: Windows/Ubuntu foundation and verify PASS. 실패하면 merge하지 않는다. 모두 통과하고 새로운 finding이 없을 때 승인된 방식으로 병합하고 merge commit·CI run을 validation과 `PLANS.md`에 후속 문서 PR로 고정한다.

## 실행 종료 조건

- 두 generated MAIN output의 유일한 수기 원본이 `src/main/**`이다.
- feature caller와 공개 adapter에 raw React/webpack/controller/core-player object가 없다.
- 현재 사용자 동작, manifest, 권한, storage, endpoint와 packaged resource set이 유지된다.
- 전체 로컬 gate, 설치형 positive/negative E2E, 독립 검토와 공개 CI가 통과한다.
- AF03 병합·상태 고정 전에는 AF04나 Chrome 웹 스토어 버전 작업을 시작하지 않는다.

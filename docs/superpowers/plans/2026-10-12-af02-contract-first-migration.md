# AF02 계약 우선 TypeScript 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정 protocol·validator·revision 계약과 client/broker 구현을 한 TypeScript 원본으로 이전하면서 기존 Chrome MV3 전역 ABI와 제품 동작을 유지한다.

**Architecture:** 세 TypeScript global-script를 기존 esbuild `transform`으로 각각 기존 root JavaScript에 결정적으로 생성한다. 생성 JS는 unpacked checkout 호환을 위해 커밋하지만 기본 검사와 build는 byte drift만 확인하고 자동 수정하지 않는다. manifest, HTML/background 로드 순서, message/storage 형식과 권한은 변경하지 않는다.

**Tech Stack:** Chrome MV3, TypeScript 7.0.2, esbuild 0.28.2, Node 24.19.0 test runner, jsdom, Playwright 1.62.1.

**Spec:** `docs/superpowers/specs/2026-10-12-af02-contract-first-migration-design.md`

## Global Constraints

- Google Chrome 121 이상만 지원하며 Firefox build·manifest·테스트를 추가하지 않는다.
- 새 dependency, bundle, source map, minification, remote code, `eval`, `new Function`을 추가하지 않는다.
- `settings-contract.js`, `settings-client.js`, `settings-broker.js`의 파일명, 전역 이름과 기존 로드 순서를 유지한다.
- message namespace `cheese-knife-settings`, protocol `1`, action과 revision/storage 의미를 변경하지 않는다.
- Chrome message, storage와 tab 값은 validator 전까지 `unknown`으로 취급한다.
- `any`, `@ts-ignore`, `@ts-nocheck`, `skipLibCheck`로 type error를 숨기지 않는다.
- manifest 권한, host permission, 사용자 데이터 저장·전송·삭제와 스토어 공개 범위를 변경하지 않는다.
- 일반 check/build는 source tree를 수정하지 않으며 write mode는 명시적 명령에서만 허용하고 CI에서는 거부한다.
- 실제 계정·쿠키·결제·후원·연령 제한 콘텐츠를 test fixture나 공개 artifact에 넣지 않는다.

## Review Focus

- TypeScript source에 top-level `import`/`export`가 들어오면 기존 전역이 숨을 수 있다 — Task 1의 module-source negative test가 생성을 거부해야 한다.
- 생성 JS가 수동 변경됐을 때 check/build가 이를 덮어쓰지 않고 drift로 실패해야 한다 — Task 1과 Task 3의 read-only 검사로 고정한다.
- 손상·소진 revision과 오래된 snapshot/ack가 편집 가능 상태나 최신 UI를 덮으면 안 된다 — Task 2의 contract/client 집중 회귀로 고정한다.
- queue overflow, 닫힌 response channel과 CSS 실패가 durable commit을 되돌리거나 다음 요청을 막으면 안 된다 — Task 2의 broker/style 집중 회귀로 고정한다.
- Windows CRLF 또는 `verify-candidate` 직접 build 경로가 drift 검사를 우회하면 안 된다 — Task 2의 LF 속성과 Task 3의 checked-build/candidate 회귀로 고정한다.

---

## File Structure

- `src/settings/contract.ts`: protocol 타입, validator, revision, merge, snapshot과 `KnifeSettingsContract` 전역의 단일 원본.
- `src/settings/client.ts`: action별 reply 검증, pending/confirmed 상태와 `createSettingsClient` 전역의 단일 원본.
- `src/settings/broker.ts`: 직렬 queue, storage/CSS/reload 처리와 `createSettingsBroker` 전역의 단일 원본.
- `scripts/settings-runtime.mjs`: 고정된 세 TS 입력을 결정적으로 생성·검사·명시적으로 기록한다.
- `settings-contract.js`, `settings-client.js`, `settings-broker.js`: generator가 만드는 커밋된 Chrome classic-script 산출물. 직접 수정하지 않는다.
- `tsconfig.json`: config/style schema, settings TS와 기존 build proof를 검사하는 일반 strict no-emit 설정.
- `tests/settings-runtime-generation.test.cjs`: 생성 옵션, 전역, drift, 결정성, read-only/write 경계와 금지 artifact를 검사한다.
- 기존 settings tests: 생성 JS의 runtime 계약과 UI/background 호출자를 그대로 검증한다.
- build/package/candidate tests: 생성 drift가 배포 경로를 우회하지 않고 `.ts`가 `dist`에 들어가지 않는지 검증한다.

### Task 1: 결정적 settings runtime generator

**Files:**
- Create: `scripts/settings-runtime.mjs`
- Create: `tests/settings-runtime-generation.test.cjs`
- Modify: `scripts/check-build-proof.mjs`
- Modify: `tests/build-proof.test.cjs`

**Interfaces:**
- Consumes: `openOwnedRoot(directory)`; esbuild `transform(source, options)`; AF01의 browser artifact 금지 규칙.
- Produces: `SETTINGS_RUNTIME_ENTRIES`, `SETTINGS_RUNTIME_OPTIONS`, `renderSettingsRuntime(root)`, `validateSettingsRuntime(outputs, identities?)`, `checkSettingsRuntime(root)`, `writeSettingsRuntime(root)`.

- [ ] **Step 1: generator 계약의 실패 검사를 작성한다**

`tests/settings-runtime-generation.test.cjs`에 임시 owned root와 세 최소 global-script source를 만들고 다음을 단언한다.

```js
assert.deepEqual(mod.SETTINGS_RUNTIME_ENTRIES, [
  { source: 'src/settings/contract.ts', output: 'settings-contract.js', global: 'KnifeSettingsContract' },
  { source: 'src/settings/client.ts', output: 'settings-client.js', global: 'createSettingsClient' },
  { source: 'src/settings/broker.ts', output: 'settings-broker.js', global: 'createSettingsBroker' },
]);
await assert.rejects(mod.checkSettingsRuntime(root), { code: 'settings-runtime-drift' });
```

같은 test file에 다음 case를 추가한다.

- 두 번 render한 output map이 byte 동일
- output set이 세 파일과 다르거나 각 `var <global>`이 없으면 거부
- source의 top-level `import` 또는 `export`를 `settings-runtime-source-module`로 거부
- stale output의 check가 source/output byte를 변경하지 않음
- write가 정확히 세 output만 만들고 다시 check하면 통과
- `CI` 환경 write는 `settings-runtime-write-ci`로 거부
- symlink input, source map marker, `eval`, `new Function`, remote URL, 절대 경로, 환경 식별자와 timestamp 거부

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/settings-runtime-generation.test.cjs tests/build-proof.test.cjs`

Expected: FAIL because `scripts/settings-runtime.mjs` and shared source inspection export do not exist.

- [ ] **Step 3: 기존 artifact 검사를 재사용 가능하게 만든다**

`scripts/check-build-proof.mjs`에서 한 output string의 `eval`, function constructor, remote URL/import, Windows/POSIX/temp path, environment identity와 timestamp를 검사하는 `inspectBrowserSource(source: string, identities?: string[]): void`를 export한다. 기존 `inspectProofRun`은 같은 함수를 호출하고 현재 `proof-*` error code와 baseline 결과를 유지한다.

`tests/build-proof.test.cjs`는 기존 negative table이 그대로 통과하며 직접 `inspectBrowserSource` 호출도 같은 error code를 내는지 한 case로 고정한다.

- [ ] **Step 4: 최소 generator/checker를 구현한다**

`scripts/settings-runtime.mjs`에 다음 고정 계약을 구현한다.

```ts
renderSettingsRuntime(root?: string): Promise<Record<string, string>>
validateSettingsRuntime(outputs: Record<string, string>, identities?: string[]): void
checkSettingsRuntime(root?: string): Promise<{ files: string[]; hashes: Record<string, string> }>
writeSettingsRuntime(root?: string): Promise<{ files: string[]; hashes: Record<string, string> }>
```

각 source는 `loader: 'ts'`, `target: 'chrome121'`, `minify: false`, `sourcemap: false`, `legalComments: 'none'`으로 개별 transform한다. bundle과 format wrapper는 사용하지 않는다. output 앞에는 source 경로를 포함한 고정 generated marker 한 줄만 붙인다. check는 두 번 render해 결정성을 확인한 뒤 committed output과 byte 비교하고, write는 `CI`가 아닐 때만 `openOwnedRoot.writeFile`로 세 output을 쓴다. CLI는 무인수 check와 단일 `--write`만 허용한다.

- [ ] **Step 5: generator와 기존 proof 회귀를 통과시킨다**

Run: `node --test tests/settings-runtime-generation.test.cjs tests/build-proof.test.cjs tests/owned-files.test.cjs`

Expected: PASS; temporary roots are removed and repository files are unchanged.

- [ ] **Step 6: 커밋한다**

```bash
git add scripts/settings-runtime.mjs scripts/check-build-proof.mjs tests/settings-runtime-generation.test.cjs tests/build-proof.test.cjs
git commit -m "build: add deterministic settings generator"
```

### Task 2: 설정 계약·client·broker TypeScript 원본 이전

**Files:**
- Create: `src/settings/contract.ts`
- Create: `src/settings/client.ts`
- Create: `src/settings/broker.ts`
- Create: `tsconfig.json`
- Modify: `.gitattributes`
- Modify: `package.json`
- Modify: `settings-contract.js`
- Modify: `settings-client.js`
- Modify: `settings-broker.js`
- Modify: `tests/type-foundation.test.cjs`
- Modify: `tests/settings-runtime-generation.test.cjs`
- Delete: `tsconfig.af01.json`
- Delete: `types/knife-settings.d.ts`
- Verify unchanged: `tests/fixtures/runtime-js-baseline.json`
- Verify unchanged unless executable semantics differ: `tests/fixtures/runtime-executable-baseline.json`

**Interfaces:**
- Consumes: Task 1 generator; existing `CONFIGS`, `STYLES`, `normalizeConfig`, `KnifeHostPolicy` globals.
- Produces: unchanged `KnifeSettingsContract.{validateOperations,validateRequest,readRevision,mergeOperations,makeSnapshot,cssFiles}`; unchanged `createSettingsClient(chromeApi)` and `createSettingsBroker(chromeApi)` factory APIs; package scripts `generate:settings`, `check:settings-runtime`, `typecheck`.

- [ ] **Step 1: 새 source와 일반 TypeScript 설정을 요구하는 실패 검사를 작성한다**

`tests/type-foundation.test.cjs`를 AF02 이름과 다음 assertion으로 바꾼다.

- `tsconfig.json`에 strict/noEmit/noUnchecked/exactOptional/useUnknown이 모두 true
- include가 `config.js`, `style-schema.js`, `src/settings/**/*.ts`, `build-proof/**/*.ts`
- `skipLibCheck` 없음
- 세 TS source에 `any`, `@ts-ignore`, `@ts-nocheck`, top-level `import`/`export` 없음
- old `tsconfig.af01.json`과 `types/knife-settings.d.ts` 없음
- `git check-attr eol`에서 세 TS source와 세 generated JS가 모두 `lf`
- 실제 `tsc -p tsconfig.json` 성공

`tests/settings-runtime-generation.test.cjs`에는 repository root의 `checkSettingsRuntime()`가 통과하고 check 전후 `git` 대상 여섯 파일 byte가 같다는 test를 추가한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/type-foundation.test.cjs tests/settings-runtime-generation.test.cjs`

Expected: FAIL because `src/settings/*.ts` and `tsconfig.json` do not exist and old declaration files still exist.

- [ ] **Step 3: 계약 타입과 구현을 `contract.ts`로 기계적으로 이동한다**

`types/knife-settings.d.ts`의 settings 관련 type alias와 현재 `settings-contract.js` 구현을 `src/settings/contract.ts`에 합친다. namespace `cheese-knife-settings`, protocol `1`과 action type/validator를 같은 파일에 두되 새 공개 helper나 전역은 만들지 않는다. client의 기존 request literal은 유지하고 통합 테스트로 validator와의 일치를 고정한다. 허용 config/style ID와 range는 literal union으로 복제하지 않고 기존 `CONFIGS`/`STYLES`에서 계산한다.

다음 signature와 runtime 결과를 유지한다.

```ts
validateOperations(operations: unknown): KnifeOperationsResult
validateRequest(message: unknown, sender: chrome.runtime.MessageSender | null | undefined, extensionId: string, getURL: (path: string) => string): KnifeRequestResult
readRevision(value: unknown): number
mergeOperations(raw: KnifeUnknownRecord, operations: KnifeSettingsOperation[]): KnifeMergeResult
makeSnapshot(raw: KnifeUnknownRecord, css: KnifeCssState): KnifeSettingsSnapshot
cssFiles(styles: unknown): string[]
```

- [ ] **Step 4: client와 broker를 제어 흐름 변경 없이 TypeScript로 이동한다**

`settings-client.js`와 `settings-broker.js`를 각각 `src/settings/client.ts`, `src/settings/broker.ts`로 옮긴다. JSDoc type cast를 TypeScript annotation/narrowing으로 바꾸되 다음은 그대로 둔다.

- client: 10초 transport timeout, action별 reply validator, dirty/confirmed generation, one-mutation slot, coalesced refresh, dispose 취소
- broker: 최대 64 waiting jobs, synchronous listener factory, single boot, durable revision, CSS fingerprint/retry, response-channel failure containment, reload 직전 tab origin/window 재검증

새 helper, class, generic framework나 동작 개선은 추가하지 않는다.

- [ ] **Step 5: 일반 TypeScript project와 LF 경계를 고정한다**

`tsconfig.af01.json`을 `tsconfig.json`으로 교체하고 세 TS source를 global-script로 함께 검사한다. `types/knife-settings.d.ts`는 삭제한다. `package.json`은 다음 script만 변경/추가한다.

```json
"generate:settings": "node scripts/settings-runtime.mjs --write",
"check:settings-runtime": "node scripts/settings-runtime.mjs",
"typecheck": "tsc -p tsconfig.json"
```

`.gitattributes`에 `src/settings/*.ts`와 세 generated root JS를 `text eol=lf`로 고정한다.

- [ ] **Step 6: 생성 JS를 명시적으로 갱신한다**

Run: `node scripts/settings-runtime.mjs --write`

Expected: exactly `settings-contract.js`, `settings-client.js`, `settings-broker.js` change; no source map or additional output exists.

- [ ] **Step 7: contract·client·broker의 집중 회귀를 순서대로 실행한다**

Run:

```bash
node --test tests/settings-contract.test.cjs
node --test tests/settings-client.test.cjs tests/settings-multi-ui.test.cjs tests/multi-page-settings.test.cjs
node --test tests/settings-broker.test.cjs tests/settings-style-apply.test.cjs tests/background.test.cjs tests/settings-load-order.test.cjs tests/settings-ui.test.cjs
```

Expected: all PASS. 특히 malformed request/reply, inherited key, invalid/exhausted revision, stale read/ack, queue overflow, closed response channel, CSS retry와 target reload case가 유지된다.

- [ ] **Step 8: 타입·생성·실행 hash를 검증한다**

Run: `npm run typecheck && npm run check:settings-runtime && npm run check:runtime-js && node --test tests/type-foundation.test.cjs tests/settings-runtime-generation.test.cjs tests/runtime-inventory.test.cjs`

Expected: PASS; runtime JS 파일 목록은 기존 16개이고 세 생성 파일의 normalized executable hash는 AF01 기준과 동일하다. hash가 다르면 baseline을 바로 갱신하지 말고 생성 전후 실행 코드를 비교해 의미 변화 원인을 제거하거나 설계를 다시 검토한다.

- [ ] **Step 9: 커밋한다**

```bash
git add .gitattributes package.json tsconfig.json src/settings settings-contract.js settings-client.js settings-broker.js tests/type-foundation.test.cjs tests/settings-runtime-generation.test.cjs
git rm tsconfig.af01.json types/knife-settings.d.ts
git commit -m "refactor: move settings contracts to TypeScript"
```

### Task 3: build·후보·package·CI drift 게이트 연결

**Files:**
- Modify: `scripts/build.mjs`
- Modify: `scripts/verify-candidate.mjs`
- Modify: `scripts/check-package.mjs`
- Modify: `tests/package.test.cjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 1 `checkSettingsRuntime(root)`; existing `build(directory, output, browser)` copy builder.
- Produces: `buildChecked(directory, output, browser)` for repository CLI builds; candidate pre-copy drift gate; distribution `.ts` rejection; Windows/Ubuntu foundation drift check.

- [ ] **Step 1: 배포 경로 우회 실패 검사를 작성한다**

`tests/package.test.cjs`에 다음을 추가한다.

- owned fixture에 세 TS source와 matching generated JS를 둔 뒤 generated JS 한 byte를 바꾸면 `buildChecked`가 `settings-runtime-drift`로 실패하고 기존 `dist/sentinel.txt`를 건드리지 않음
- 정상 matching fixture의 `buildChecked`는 기존 portable dist를 생성
- `checkDistributionFiles`가 `src/settings/contract.ts`를 `distribution-developer-file`로 거부
- 실제 `verifyCandidate` 성공 전에 repository `checkSettingsRuntime`가 통과하며 결과 `dist`에는 `.ts`, `src/`, `types/`, source map이 없음

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/package.test.cjs`

Expected: FAIL because `buildChecked`, candidate drift gate and `.ts` distribution rejection do not exist.

- [ ] **Step 3: checked repository build와 candidate gate를 연결한다**

`scripts/build.mjs`에 다음 wrapper를 추가하고 CLI가 이를 호출하게 한다.

```ts
buildChecked(directory?: string, output?: string, browser?: 'chrome'): Promise<string>
```

`buildChecked`는 `checkSettingsRuntime(directory)` 성공 뒤 기존 `build`를 호출한다. 임시 package fixture와 candidate dist 조립에 쓰이는 기존 `build` 함수는 순수 copy/package 검사 역할을 유지한다.

`scripts/verify-candidate.mjs`는 repository 파일을 후보로 복사하기 전에 `checkSettingsRuntime(repositoryRoot)`를 호출한다. candidate에 `src/`, generator 또는 node_modules를 복사하지 않는다.

- [ ] **Step 4: TypeScript source가 배포물에 들어가지 않게 한다**

`scripts/check-package.mjs`의 `checkDistributionFiles`가 모든 `.ts` 파일과 `src/` tree를 `distribution-developer-file`로 거부하도록 한다. 기존 `.map`, `build-proof/`, `types/`, `tsconfig*.json` 거부를 유지한다.

- [ ] **Step 5: 공개 foundation CI에 drift 검사를 추가한다**

`.github/workflows/ci.yml`의 Windows/Ubuntu offline foundation command를 다음 순서로 고정한다.

```bash
npm run check:toolchain && npm run check:runtime-js && npm run typecheck && npm run check:settings-runtime && npm run check:build-proof
```

publish workflow는 기존 `npm run build`가 `buildChecked`를 호출하므로 별도 중복 step을 추가하지 않는다.

- [ ] **Step 6: package와 foundation 집중 검증을 통과시킨다**

Run:

```bash
node --test tests/package.test.cjs tests/runtime-inventory.test.cjs tests/type-foundation.test.cjs tests/settings-runtime-generation.test.cjs tests/build-proof.test.cjs
npm run check:toolchain
npm run check:runtime-js
npm run typecheck
npm run check:settings-runtime
npm run check:build-proof
npm run build
npm run check
```

Expected: all PASS; `dist`에는 generated JS만 있고 TS source/developer files는 없다.

- [ ] **Step 7: 커밋한다**

```bash
git add scripts/build.mjs scripts/verify-candidate.mjs scripts/check-package.mjs tests/package.test.cjs .github/workflows/ci.yml
git commit -m "build: gate settings artifacts before packaging"
```

### Task 4: 전체 회귀·검증 기록·PR 준비

**Files:**
- Create: `docs/superpowers/validation/2026-10-12-af02-contract-first-migration.md`
- Modify: `PLANS.md`

**Interfaces:**
- Consumes: Tasks 1–3의 최종 branch와 기존 AF01/AF00 검증 명령.
- Produces: AF02 code evidence commit, validation 기록, 갱신된 장기 커서와 review-ready 한글 PR 범위.

- [ ] **Step 1: clean working tree 후보에서 전체 자동 회귀를 실행한다**

Run:

```bash
npm test
npm run check:toolchain
npm run check:runtime-js
npm run typecheck
npm run check:settings-runtime
npm run check:build-proof
npm run build
npm run check
node scripts/check-audio-quality.mjs --chrome
npm run test:e2e
npm run test:e2e:negative
node scripts/tool-audit.mjs
git -c core.safecrlf=false diff --check
```

Expected: all required product gates PASS. `tool-audit`는 기존 guarded observation을 clean으로 위장하지 않고 AF02 신규 finding 0을 별도로 판정한다.

- [ ] **Step 2: 제품·정책 diff를 고정한다**

AF02 기준점 `2e2ee90`과 비교해 다음을 확인한다.

- `manifest.json`, popup/styles HTML과 background import order 의미 변화 0
- 권한, host permission, external origin, storage key, protocol/revision 의미 변화 0
- telemetry, 사용자 데이터 수집·전송, remote code 변화 0
- runtime JS 파일 목록 변화 0, 세 파일의 생성 provenance와 source→dist byte 일치
- 실제 계정·쿠키·결제·연령 제한 자료가 commit/output에 없음

- [ ] **Step 3: validation과 PLANS를 증거에 맞게 갱신한다**

`docs/superpowers/validation/2026-10-12-af02-contract-first-migration.md`에 code evidence commit, Node/Chrome/tool version, test 수, 생성 hash, Windows/Ubuntu 예정 CI gate, installed E2E 결과, 정책 불변성, 알려진 한계와 rollback을 기록한다.

`PLANS.md`는 실제 증거가 있는 AF02 checklist만 완료하고 현재 커서를 한글 PR/CI 또는 다음 미완료 gate로 이동한다. 이번 내부 전환은 사용자 사용법과 공개 기능을 바꾸지 않으므로 README는 수정하지 않는다.

- [ ] **Step 4: 문서와 branch diff를 자체 검토한다**

Run:

```bash
git diff --check
git diff --stat 2e2ee90...HEAD
git diff 2e2ee90...HEAD -- manifest.json popup.html styles.html background.js
```

Expected: whitespace clean; 마지막 command의 제품 진입점 diff는 empty; 변경은 승인된 source/generator/test/build/docs에 한정된다.

- [ ] **Step 5: 검증 문서를 커밋한다**

```bash
git add PLANS.md docs/superpowers/validation/2026-10-12-af02-contract-first-migration.md
git commit -m "docs: record AF02 validation"
```

- [ ] **Step 6: 전체 branch를 독립 검토에 넘긴다**

가장 최신 `main`과 AF02 HEAD의 immutable diff를 대상으로 correctness, runtime validation, generated artifact drift, Windows/Ubuntu line endings, build/candidate bypass, permission/data/store-policy 변화와 rollback을 검토한다. Critical/Important finding은 구현 commit에서 보완하고 Task 4 전체 게이트를 다시 실행한다.

Expected: reportable Critical/Important finding 0건 뒤 한글 PR을 열 수 있다.

## 실행 완료 조건

- 네 Task가 각각 테스트와 커밋으로 완료됨
- TypeScript source가 settings runtime의 유일한 수기 원본임
- generated JS drift가 local build, candidate, Windows/Ubuntu CI에서 거부됨
- 기존 settings·다중 창·CSS·reload·설치형 E2E 동작 유지
- manifest·권한·사용자 데이터·외부 전송·스토어 공개 범위 변화 0건
- validation, 독립 검토와 한글 PR 준비 완료

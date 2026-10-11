# AF01 타입·빌드 기반 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 Chrome MV3 제품 산출물을 바꾸지 않고 엄격한 타입 검사, 네 실행 문맥 build proof, 결정적 출력과 신규 런타임 JavaScript 차단 게이트를 추가한다.

**Architecture:** 현재 classic-script 전역 ABI와 copy-based production build는 그대로 유지한다. TypeScript는 다섯 설정 계약 JavaScript와 proof 전용 TypeScript만 검사하고, esbuild는 `build-proof/`의 합성 entry를 `write: false`로 번들해 출력 계약만 검증한다. JSDoc으로 달라지는 주석 byte는 허용하되 고정 transform으로 계산한 실행 코드 hash, source→dist byte 동일성과 제품 파일 집합은 기준선에서 바뀌지 않아야 한다. 단, pre-merge 검토에서 확인된 외부 reply 타입 과신은 malformed-response validator와 회귀 테스트를 함께 추가하고 `settings-client.js` 실행 hash만 명시적으로 전진시키는 승인 범위 내 보안 보완으로 처리한다.

**Tech Stack:** Node.js 24.19.0, TypeScript 7.0.2, `@types/chrome` 0.2.8, esbuild 0.28.2, Node test runner, Chrome MV3, GitHub Actions Windows/Ubuntu.

**Spec:** `docs/superpowers/specs/2026-10-12-af01-type-build-foundation-design.md`

## Global Constraints

- `typescript`은 `7.0.2`, `@types/chrome`은 `0.2.8`, `esbuild`는 `0.28.2`로 exact pin하고 lockfile integrity를 요구한다.
- Node.js는 로컬·CI 모두 `24.19.0`, esbuild target은 `chrome121`로 고정한다.
- `manifest.json`, permissions, host permissions, content script의 순서와 world, HTML script 순서, background `importScripts` 순서를 변경하지 않는다.
- production `npm run build`는 기존 copy-based 산출물을 유지하며 build proof 결과를 소비하지 않는다.
- JSDoc 대상 runtime은 esbuild `transform`의 고정된 comment/whitespace 제거 결과 hash가 AF01 시작 baseline과 같아야 한다. 유일한 예외는 action별 malformed reply 거부를 추가한 `settings-client.js`이며, 독립 검토·회귀 뒤 새 hash를 고정한다.
- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `allowJs`, `checkJs`, `noEmit`을 켜고 `skipLibCheck`는 켜지 않는다.
- `any`, `@ts-ignore`, `@ts-nocheck`, 무검증 이중 단언과 runtime validator 제거로 타입 오류를 숨기지 않는다.
- proof output은 IIFE, browser, unminified, no source map, no tree shaking, `write: false`이며 원격 코드·동적 원격 import·`eval`·`new Function`을 허용하지 않는다.
- 신규 첫 번째 당사자 runtime `.js`는 root와 `web/`에서 금지하되 기존 16개 inventory 파일의 수정은 허용한다.
- `vendor/**`, `tests/**/*.cjs`, `tests/fixtures/**`, `scripts/**/*.mjs`, `dist/**`, `output/**`는 first-party runtime inventory 대상이 아니다.
- 사용자 데이터, 저장 key, message/revision, 네트워크 요청, 개인정보처리방침과 스토어 공개 범위를 변경하지 않는다.
- Firefox 구현·빌드·배포를 추가하지 않는다.

## Review Focus

- `npm ci --ignore-scripts`에서 TypeScript 7 또는 esbuild native executable이 빠지면 명시적으로 실패하고 일반 설치로 몰래 우회하지 않아야 한다 — Task 1의 실행 파일 검사로 고정한다.
- `web/nested/new-feature.js`처럼 하위 폴더에 추가된 runtime JavaScript도 inventory 우회를 하지 못해야 한다 — Task 2의 nested negative test로 고정한다.
- storage/message/Chrome callback의 `unknown` 값이 정적 타입 단언으로 validator를 우회하지 않아야 한다 — Task 3의 금지 표식 검사와 typecheck negative fixture로 고정한다.
- 임시 root 절대 경로, source map, 원격 URL, `eval` 또는 `new Function`이 proof에 섞이면 hash가 같아도 실패해야 한다 — Task 4의 artifact negative table test로 고정한다.
- `build-proof/`, `types/`, tsconfig 또는 `.map`이 production `dist`에 복사되면 설치 E2E 전이라도 실패해야 한다 — Task 5의 distribution boundary test로 고정한다.

---

## 파일 구조

### 새 파일

- `scripts/check-toolchain.mjs`: exact dependency, lockfile integrity, license, 설치 실행 파일과 금지 네트워크 모듈을 검사한다.
- `scripts/check-runtime-inventory.mjs`: root와 `web/`의 first-party `.js`를 baseline과 비교한다.
- `scripts/check-build-proof.mjs`: 두 격리 root에서 네 entry를 번들하고 artifact와 결정성을 검사한다.
- `tsconfig.af01.json`: 계약 JavaScript와 proof TypeScript만 포함하는 no-emit strict 설정이다.
- `types/knife-settings.d.ts`: 설정 field, operation, snapshot, client view의 runtime-neutral 전역 타입만 정의한다.
- `build-proof/shared.ts`: 네 proof entry가 공유하는 context marker와 결과 타입을 제공한다.
- `build-proof/background.ts`: service worker의 Chrome runtime 타입 경계를 증명한다.
- `build-proof/extension-page.ts`: extension page의 DOM과 Chrome API 타입 경계를 증명한다.
- `build-proof/isolated.ts`: ISOLATED world의 runtime messaging과 page bridge 경계를 증명한다.
- `build-proof/main.ts`: MAIN world의 DOM과 `Symbol.for` runtime key 경계를 증명하며 Chrome API를 사용하지 않는다.
- `tests/toolchain-contract.test.cjs`: pinned toolchain과 native executable 실패를 검사한다.
- `tests/runtime-inventory.test.cjs`: baseline, nested JS, symlink와 제외 경계를 검사한다.
- `tests/type-foundation.test.cjs`: tsconfig와 금지 타입 우회를 검사한다.
- `tests/build-proof.test.cjs`: 네 출력, 금지 artifact, 결정성과 negative controls를 검사한다.
- `tests/fixtures/runtime-js-baseline.json`: 현재 package-shippable first-party runtime JavaScript 16개를 정렬해 고정한다.
- `tests/fixtures/runtime-executable-baseline.json`: 기존 16개 runtime의 정규화된 실행 코드 SHA-256을 고정한다.
- `tests/fixtures/build-proof-baseline.json`: 네 출력 SHA-256과 정규화 metafile SHA-256을 고정한다.
- `docs/superpowers/validation/2026-10-12-af01-type-build-foundation.md`: 구현·CI·불변 계약 검증 결과를 기록한다.

### 수정 파일

- `package.json`, `package-lock.json`: exact dev dependencies와 AF01 명령을 추가한다.
- `config.js`, `style-schema.js`, `settings-contract.js`, `settings-client.js`, `settings-broker.js`: 런타임 변화 없는 JSDoc 타입만 추가한다.
- `scripts/check-package.mjs`: distribution 전용 금지 파일 검사를 export한다.
- `scripts/build.mjs`: 복사 완료 뒤 distribution 금지 파일 검사를 호출한다. 복사 목록은 바꾸지 않는다.
- `tests/package.test.cjs`: proof/developer 파일 미포함과 source→dist runtime byte 동일성을 검사한다.
- `.github/workflows/ci.yml`: Windows/Ubuntu foundation matrix와 기존 Ubuntu 전체 회귀의 선행 관계를 추가한다.
- `PLANS.md`: AF01 구현 상태와 validation 링크를 갱신한다.

## Task 1: exact toolchain과 공급망 계약

**Files:**
- Create: `scripts/check-toolchain.mjs`
- Create: `tests/toolchain-contract.test.cjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: lockfile v3의 `packages` map과 설치된 direct package metadata.
- Produces: `TOOLCHAIN_CONTRACT`, `inspectToolchain(root) -> Promise<ToolchainReport>`, `checkToolchain(root) -> Promise<ToolchainReport>`; package script `check:toolchain`.

- [ ] **Step 1: pinned dependency 실패 검사를 작성한다**

`tests/toolchain-contract.test.cjs`에 exact version/license/integrity가 없거나 root dependency가 range일 때 `checkToolchain`이 거부하는 테스트와, `node_modules/.bin/tsc`·`esbuild` 중 하나가 없을 때 `toolchain-executable-missing`으로 실패하는 테스트를 작성한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/toolchain-contract.test.cjs`

Expected: FAIL because `scripts/check-toolchain.mjs` does not exist.

- [ ] **Step 3: exact dependencies와 scripts를 추가한다**

Run: `npm install --save-dev --save-exact --ignore-scripts typescript@7.0.2 @types/chrome@0.2.8 esbuild@0.28.2`

`package.json`에는 이 Task에서 동작하는 `check:toolchain`만 먼저 추가한다. 이후 Task가 각각 `check:runtime-js`, `typecheck` (`tsc -p tsconfig.af01.json`), `check:build-proof`를 추가한다. `package-lock.json`의 direct/transitive package에 resolved, integrity, license와 dev 표시가 남아야 한다.

- [ ] **Step 4: toolchain checker를 최소 구현한다**

`TOOLCHAIN_CONTRACT`는 `{ typescript: { version: '7.0.2', license: 'Apache-2.0' }, '@types/chrome': { version: '0.2.8', license: 'MIT' }, esbuild: { version: '0.28.2', license: 'MIT' } }`로 고정한다. `inspectToolchain`은 package/lock/install metadata를 읽어 보고서만 반환하고, `checkToolchain`은 exact pin, integrity, license, dev-only와 실행 파일을 강제한다. 현재 OS/architecture에 선택된 `@typescript/typescript-*`와 `@esbuild/*` companion도 parent와 같은 version, lockfile integrity와 license를 가져야 한다.

- [ ] **Step 5: ignore-scripts 설치 계약을 확인한다**

Run: `npm ci --ignore-scripts && node --test tests/toolchain-contract.test.cjs && npm run check:toolchain`

Expected: PASS, report lists all three exact direct tools and both `tsc` and `esbuild` executables as available.

- [ ] **Step 6: 일반 설치 계약도 별도로 확인한다**

Run: `npm ci && node --test tests/toolchain-contract.test.cjs && npm run check:toolchain`

Expected: PASS with the same direct versions, selected platform companions and executable availability as the ignore-scripts install.

- [ ] **Step 7: 커밋한다**

```bash
git add package.json package-lock.json scripts/check-toolchain.mjs tests/toolchain-contract.test.cjs
git commit -m "build: pin AF01 toolchain contract"
```

## Task 2: 신규 runtime JavaScript inventory 게이트

**Files:**
- Create: `scripts/check-runtime-inventory.mjs`
- Create: `tests/runtime-inventory.test.cjs`
- Create: `tests/fixtures/runtime-js-baseline.json`
- Create: `tests/fixtures/runtime-executable-baseline.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: repository root와 정렬된 baseline JSON string array.
- Produces: `listRuntimeJavaScript(root) -> Promise<string[]>`, `runtimeExecutableHashes(root, files) -> Promise<Record<string, string>>`, `checkRuntimeInventory(root, inventoryFile, executableFile) -> Promise<{ files: string[], hashes: Record<string, string> }>`; package script `check:runtime-js`.

- [ ] **Step 1: baseline과 우회 negative tests를 작성한다**

현재 root/web 16개가 정확히 일치하는 테스트, `web/nested/new-feature.js`가 `runtime-js-inventory-changed`로 실패하는 테스트, vendor/tests/scripts/output/dist가 제외되는 테스트와 root/web 내부 directory link를 거부하는 테스트를 작성한다. JSDoc 주석만 추가한 fixture는 실행 hash가 같고 literal 또는 연산자를 바꾼 fixture는 `runtime-executable-changed`로 실패해야 한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/runtime-inventory.test.cjs`

Expected: FAIL because the inventory module and baseline are absent.

- [ ] **Step 3: baseline과 checker를 구현한다**

inventory baseline에는 `background.js`부터 `web/site-adapter.js`까지 현재 first-party runtime 16개를 POSIX path·사전식 정렬로 기록한다. checker는 `openOwnedRoot`로 root의 직접 `.js`와 `web/` tree만 열고 link·special file·역슬래시·중복을 거부한다. executable baseline은 esbuild `transform`에 `loader: 'js'`, `target: 'chrome121'`, `legalComments: 'none'`, `minifyWhitespace: true`, `minifySyntax: false`, `minifyIdentifiers: false`, `sourcemap: false`를 사용한 결과 byte의 SHA-256을 저장한다. production build는 이 transform을 사용하지 않는다.

- [ ] **Step 4: 집중 검사를 통과시킨다**

Run: `node --test tests/runtime-inventory.test.cjs && node scripts/check-runtime-inventory.mjs`

Expected: PASS and `Runtime JavaScript inventory OK: 16 files`.

- [ ] **Step 5: 커밋한다**

```bash
git add package.json scripts/check-runtime-inventory.mjs tests/runtime-inventory.test.cjs tests/fixtures/runtime-js-baseline.json tests/fixtures/runtime-executable-baseline.json
git commit -m "test: guard legacy runtime JavaScript inventory"
```

## Task 3: strict checkJs 타입 기반

**Files:**
- Create: `tsconfig.af01.json`
- Create: `types/knife-settings.d.ts`
- Create: `tests/type-foundation.test.cjs`
- Modify: `config.js`
- Modify: `style-schema.js`
- Modify: `settings-contract.js`
- Modify: `settings-client.js`
- Modify: `settings-broker.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: Chrome API types and the existing runtime validators without changing their return values.
- Produces: global declaration names `KnifeConfigLeaf`, `KnifeConfigGroup`, `KnifeStyleField`, `KnifeSettingsOperation`, `KnifeSettingsSnapshot`, `KnifeSettingsView`; JSDoc signatures for `normalizeConfig`, contract methods, `createSettingsClient(chromeApi: typeof chrome)`, `createSettingsBroker(chromeApi: typeof chrome)`.

- [ ] **Step 1: strict config와 금지 우회 tests를 작성한다**

테스트는 compiler option의 정확한 true/noEmit 값, include가 다섯 JS·`types/**/*.d.ts`·`build-proof/**/*.ts`로 제한되는지, 대상 파일에 `@ts-ignore`, `@ts-nocheck`, `skipLibCheck`, `{any}`가 없는지 검사한다. 동일 strict flag로 검사하는 독립 임시 JavaScript fixture에 `const af01TypeError = /** @type {number} */ ('wrong');`를 쓰면 tsc가 nonzero가 되는 negative control도 작성한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/type-foundation.test.cjs`

Expected: FAIL because `tsconfig.af01.json` and declarations are absent.

- [ ] **Step 3: tsconfig와 runtime-neutral declarations를 추가한다**

`tsconfig.af01.json`은 global classic scripts를 유지하도록 module emit을 만들지 않고, `lib`는 `ES2023`과 `DOM`, target은 `ES2022`, types는 `chrome`으로 고정한다. declaration은 discriminated union과 `unknown` 입력을 표현하되 런타임 값이나 구현을 선언하지 않는다. `package.json`에 `typecheck` script를 추가한다.

- [ ] **Step 4: 다섯 계약 파일에 최소 JSDoc을 추가한다**

callback, Map/Set entry, error code와 nullable state에만 구체 타입을 붙인다. `record(value: unknown)`와 validator 입력은 `unknown`에서 시작하고, Chrome mock 호환 때문에 필요한 API surface는 `typeof chrome`의 부분형을 별도 `any` 없이 표현한다. 실행문·문자열·분기·객체 반환 shape는 바꾸지 않는다.

- [ ] **Step 5: 타입과 기존 설정 회귀를 통과시킨다**

Run: `npm run typecheck && npm run check:runtime-js && node --test tests/type-foundation.test.cjs tests/config.test.cjs tests/settings-contract.test.cjs tests/settings-client.test.cjs tests/settings-broker.test.cjs tests/settings-load-order.test.cjs`

Expected: PASS with zero TypeScript diagnostics and unchanged runtime tests.

- [ ] **Step 6: 커밋한다**

```bash
git add package.json tsconfig.af01.json types/knife-settings.d.ts tests/type-foundation.test.cjs config.js style-schema.js settings-contract.js settings-client.js settings-broker.js
git commit -m "types: add strict settings contract proof"
```

## Task 4: 네 실행 문맥 결정적 build proof

**Files:**
- Create: `build-proof/shared.ts`
- Create: `build-proof/background.ts`
- Create: `build-proof/extension-page.ts`
- Create: `build-proof/isolated.ts`
- Create: `build-proof/main.ts`
- Create: `scripts/check-build-proof.mjs`
- Create: `tests/build-proof.test.cjs`
- Create: `tests/fixtures/build-proof-baseline.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: exact esbuild JS API and proof-only TypeScript entry graph.
- Produces: `PROOF_CONTEXTS`, `buildProof(proofRoot) -> Promise<ProofRun>`, `inspectProofRun(run) -> ProofReport`, `compareProofRuns(left, right) -> void`, `runBuildProof(repositoryRoot) -> Promise<ProofReport>`; package script `check:build-proof`.

- [ ] **Step 1: output contract와 negative table tests를 작성한다**

네 `.js` output 이름, IIFE/unminified/no-map 옵션, baseline hash 일치와 서로 다른 두 root 비교를 검사한다. 인공 artifact table로 `eval`, `new Function`, `https://`, dynamic remote import, `.map`, Windows drive path, POSIX temp path, timestamp marker와 예상 밖 `node_modules` input 각각이 고유 오류 code로 실패하는지 검사한다. runner가 `node:http`, `node:https`, `node:net`, `node:tls`, `node:dns`를 import하면 별도 source-contract test가 실패해야 한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/build-proof.test.cjs`

Expected: FAIL because proof entries and runner are absent.

- [ ] **Step 3: 네 entry와 shared module을 작성한다**

각 entry는 `shared.ts`를 import하고 한 문맥만 표현한다. background는 `chrome.runtime.id`, extension page는 DOM+Chrome API, isolated는 `chrome.runtime.sendMessage`+`window.postMessage`, MAIN은 DOM+`Symbol.for`만 사용한다. 어떤 entry도 네트워크·storage write·실제 제품 모듈을 import하지 않는다.

- [ ] **Step 4: build와 artifact inspection을 구현한다**

esbuild options를 spec의 아홉 값으로 고정하고 `entryNames: '[name]'`, `outdir: 'proof-output'`, `absWorkingDir`를 격리 source root로 둔다. output byte는 그대로 SHA-256하고 metafile만 POSIX logical path로 정규화한다. 허용된 runtime input은 `build-proof/**`뿐이다.

- [ ] **Step 5: 두 owned temporary root 결정성 비교를 구현한다**

`output/af01-proof-*` 두 디렉터리에 `build-proof/`를 각각 복사하고 두 run의 output set, byte hash와 normalized metafile hash를 비교한다. 성공·실패 모두 `finally`에서 두 디렉터리를 제거한다. `--write-baseline`은 CI에서 거부하고 명시적 로컬 갱신에만 사용한다. `package.json`에 `check:build-proof` script를 추가한다.

- [ ] **Step 6: baseline을 생성하고 집중 검사를 통과시킨다**

Run: `node scripts/check-build-proof.mjs --write-baseline && node --test tests/build-proof.test.cjs && node scripts/check-build-proof.mjs`

Expected: PASS, four output hashes and one normalized graph hash match the committed baseline, and no `output/af01-proof-*` remains.

- [ ] **Step 7: 커밋한다**

```bash
git add package.json build-proof scripts/check-build-proof.mjs tests/build-proof.test.cjs tests/fixtures/build-proof-baseline.json
git commit -m "build: add deterministic Chrome context proof"
```

## Task 5: production package 불변성과 Windows/Ubuntu CI

**Files:**
- Modify: `scripts/check-package.mjs`
- Modify: `scripts/build.mjs`
- Modify: `tests/package.test.cjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `dist` tree and Tasks 1–4 package scripts.
- Produces: `checkDistributionFiles(directory) -> Promise<{ files: string[] }>` and CI `foundation` matrix gate.

- [ ] **Step 1: distribution boundary 실패 tests를 작성한다**

fixture dist에 `build-proof/main.js`, `types/knife-settings.d.ts`, `tsconfig.af01.json`, `source.js.map`을 각각 넣으면 `checkDistributionFiles`가 거부하는 table test를 추가한다. 정상 build에서는 모든 shipped first-party `.js` byte가 source와 같고 proof/developer 파일이 0개임을 검사한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/package.test.cjs`

Expected: FAIL because `checkDistributionFiles` is not exported.

- [ ] **Step 3: distribution 검사와 build 호출을 추가한다**

검사는 owned recursive walk로 regular file만 허용하고 `.map`, `build-proof/`, `types/`, `tsconfig*.json`을 거부한다. `scripts/build.mjs`는 기존 복사 목록을 바꾸지 않고 마지막 `checkPackage` 직전에 이 함수를 호출한다.

- [ ] **Step 4: foundation CI matrix를 추가한다**

`windows-latest`와 `ubuntu-latest` matrix job에서 Node `24.19.0`, `npm ci --ignore-scripts`, toolchain, inventory, typecheck, build proof를 실행한다. 검사 step에는 `npm_config_offline=true`, `HTTP_PROXY=http://127.0.0.1:9`, `HTTPS_PROXY=http://127.0.0.1:9`, 빈 `NO_PROXY`를 지정한다. 기존 Ubuntu `verify` job은 `needs: foundation` 뒤 그대로 전체 회귀를 실행한다.

- [ ] **Step 5: package 집중 검사를 통과시킨다**

Run: `node --test tests/package.test.cjs tests/toolchain-contract.test.cjs tests/runtime-inventory.test.cjs tests/type-foundation.test.cjs tests/build-proof.test.cjs && npm run build && npm run check`

Expected: PASS; `dist` contains no proof/type/map files, source→dist runtime bytes match, and normalized executable hashes remain at the AF01 baseline.

- [ ] **Step 6: 커밋한다**

```bash
git add scripts/check-package.mjs scripts/build.mjs tests/package.test.cjs .github/workflows/ci.yml
git commit -m "ci: enforce AF01 foundation gates"
```

## Task 6: 전체 검증·기록·PR 준비

**Files:**
- Create: `docs/superpowers/validation/2026-10-12-af01-type-build-foundation.md`
- Modify: `PLANS.md`

**Interfaces:**
- Consumes: Tasks 1–5의 명령 출력, CI run URL, source/dist hashes.
- Produces: 공개 가능한 AF01 검증 기록과 완료 체크리스트.

- [ ] **Step 1: AF01 전용 게이트를 실행한다**

Run: `npm run check:toolchain && npm run check:runtime-js && npm run typecheck && npm run check:build-proof`

Expected: all PASS, exact versions reported, 16 runtime JS files and four proof contexts reported.

- [ ] **Step 2: 전체 저장소 회귀를 실행한다**

Run: `npm test && npm run build && npm run check && node scripts/check-audio-quality.mjs && npm run test:e2e && npm run test:e2e:negative`

Expected: all PASS with no product behavior, permission or package boundary change.

- [ ] **Step 3: 보안·패키지 도구를 실행한다**

Run: `npm run audit:tools`

Expected: scanner run completes. 현재 guarded ESLint findings 때문에 exit 1이면 최신 private ledger와 정확히 대응해야 하며, 새 AF01 finding·도구 실패·변경된 입력은 성공이나 기존 경고로 처리하지 않는다.

- [ ] **Step 4: diff와 제품 불변성을 확인한다**

Run: `git -c core.safecrlf=false diff --check && git diff main...HEAD -- manifest.json popup.html styles.html permission.html background.js scripts/build.mjs`

Expected: no whitespace errors; manifest/HTML/background runtime contract unchanged; `scripts/build.mjs` only adds the distribution check call.

- [ ] **Step 5: validation과 PLANS를 갱신한다**

validation에 exact tool versions, OS별 proof hashes, test 수, CI URL, source→dist byte 동일성과 executable hash 불변, 권한·데이터·네트워크 변화 0건, 알려진 한계와 롤백 명령을 기록한다. `PLANS.md`에서 AF01 체크리스트는 실제 증거가 있는 항목만 완료 처리하고 AF02는 AF01 PR 병합 전까지 BLOCKED로 유지한다.

- [ ] **Step 6: 문서 검증 후 커밋한다**

Run: `git -c core.safecrlf=false diff --check && git status --short`

```bash
git add docs/superpowers/validation/2026-10-12-af01-type-build-foundation.md PLANS.md
git commit -m "docs: record AF01 foundation validation"
```

- [ ] **Step 7: 브랜치 검토와 한글 PR을 준비한다**

Run: `git log --oneline main..HEAD && git diff --stat main...HEAD`

Expected: 여섯 독립 커밋, 제품 기능·manifest·권한 변화 0건. 한글 PR에는 목표, 도구 버전, 불변 계약, Windows/Ubuntu CI, 검증 명령, 중단 조건과 롤백을 기록한다.

# 정적 경고 경계 보완 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** ESLint 보안 규칙의 기존 75개 관찰을 규칙 비활성화나 이름 변경으로 숨기지 않고, 실행 코드의 동적 자료 접근과 개발 도구의 파일 접근을 검증 가능한 경계로 축소한 뒤 각 기존 행의 후속 근거를 남긴다.

**Architecture:** 실행 코드는 `Map`, 검증된 entry snapshot, own property descriptor, 범위 확인된 `Array.at`/`splice`로 공개 JSON 형태를 보존한다. 개발 도구는 `scripts/owned-files.mjs`의 root capability를 통해서만 동적 파일 경로를 사용하며, 실제 `fs` 호출과 필요한 좁은 ESLint 예외는 이 모듈 안에만 둔다. 각 묶음은 기능 실패 검사와 scoped ESLint 실패를 함께 RED로 만들고 같은 명령을 GREEN으로 되돌린다.

**Tech Stack:** Chrome Extension Manifest V3, JavaScript, Node.js 24.14.0, `node:test`, jsdom 30.1.2, Playwright 1.62.1, ESLint 10.12.0, `eslint-plugin-security` 4.2.0, `eslint-plugin-no-unsanitized` 4.1.5.

**Spec:** [정적 경고 경계 보완 설계](../specs/2026-10-11-static-warning-boundaries-design.md)

## 전역 제약

- 현재 checkout과 현재 브랜치를 사용한다. 새 worktree를 만들지 않는다.
- 작업 트리가 이미 더럽기 때문에 이 계획에서는 `git add`, commit, push, PR, tag, release, 스토어 조작을 하지 않는다.
- `scripts/hls-hardening.mjs`, `scripts/vendor-hls.mjs`, `vendor/hls.light.private.js`, `THIRD_PARTY_NOTICES.md`를 변경하지 않는다. HLS 전용 검사와 `tests/vendor.test.cjs`도 실행하지 않는다.
- root `dist`를 삭제하거나 다시 빌드하지 않는다. 후보는 매번 `output/tool-audit/` 아래 새 폴더에 만든다.
- `eslint.security.config.mjs`의 검사 범위와 규칙을 약화하지 않는다. 파일/규칙 전체 ignore, 파일 전체 disable, 기대 경고 수 완화, 별칭·`Reflect.get`을 이용한 탐지 회피를 금지한다.
- 동적 `fs` 호출에 필요한 `security/detect-non-literal-fs-filename` 행 단위 예외는 `scripts/owned-files.mjs` 안에서만 허용하며, 바로 앞에 수행한 containment/link/type 검사 이름을 주석에 적는다.
- 새 테스트는 실제 공개 계약과 실패 경계를 검사한다. 소스 문자열 검색만으로 구현 모양을 고정하지 않는다. scoped ESLint 검사는 기능 검사와 함께 사용한다.
- npm 재조회는 사용자가 이미 승인한 `scripts/tool-audit.mjs`의 공식 npm registry 요청에만 한정한다. 다른 원격 서비스로 소스나 결과를 전송하지 않는다.
- Astra max는 마지막 독립 기능 정확성·회귀 검토에만 사용할 수 있다. 보안 판정이나 HLS 검토를 요청하지 않는다.
- 새 문서·주석·오류 문구는 한글 또는 영문으로만 작성한다.

## 구현 전 검토 초점

아래 다섯 실패 양상을 각 지정 Task의 검사로 고정한다.

1. `__proto__`·상속 property가 status/settings/i18n에 들어가는 경우 — Task 1, 2.
2. bridge가 30개 status 또는 80자 reason 제한을 잃거나 공개 객체 형태가 바뀌는 경우 — Task 1.
3. 삭제 메시지의 `findIndex() === -1`, 배열 교체, index 변경이 다른 메시지를 덮는 경우 — Task 3.
4. Windows 형제 접두사·UNC·다른 드라이브·junction·깨진 링크·출력 링크가 root 포함 검사를 우회하는 경우 — Task 5, 6.
5. 경고가 위치만 이동했는데 predecessor 없이 해결로 기록되는 경우 — Task 7.

## Task 0: 기준선과 보호 해시를 동결한다

**Files:** Read `PLANS.md`, `output/tool-audit/run-2026-10-11T08-44-26-027Z-WVMEtL/summary.json`, `output/tool-audit/recovery-backlog/warning-ledger.json`; create `output/tool-audit/recovery-backlog/p02-static-boundaries-baseline-2026-10-11.json`.

**Step 1: 실행 환경과 입력을 확인한다.**

```powershell
$knifeNode = 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $knifeNode --version
git status --short
```

Expected: Node `v24.14.0`; 기존 dirty tree가 그대로 보이며 이를 정리하거나 stage하지 않는다.

**Step 2: 관련 일반 회귀 기준선을 실행한다.**

```powershell
& $knifeNode --test tests/runtime.test.cjs tests/bridge-cleanup.test.cjs tests/settings-ui.test.cjs tests/player.test.cjs tests/settings-contract.test.cjs tests/audio.test.cjs tests/deleted-chat.test.cjs tests/audio-metrics.test.cjs tests/tool-audit.test.cjs tests/package.test.cjs
```

Expected: 현재 검사는 exit 0. 실패하면 제품 수정을 시작하지 않고 기준선 실패로 기록한다.

**Step 3: scoped ESLint RED 기준선을 저장한다.**

```powershell
& $knifeNode node_modules/eslint/bin/eslint.js --config eslint.security.config.mjs --no-inline-config --format=json popup.js settings-contract.js web/audio.js web/inject.js web/main.js web/player.js web/runtime.js scripts/audio-metrics.mjs scripts/build.mjs scripts/check-audio-quality.mjs scripts/check-package.mjs scripts/check-preview-autoplay.mjs scripts/check-store-popup.mjs scripts/check-styles.mjs scripts/check-video-filters.mjs scripts/smoke-browser.mjs scripts/tool-audit.mjs
```

Expected: exit 1, 기존 75개 관찰. 원시 JSON을 baseline evidence에 보존하고 20 runtime/UI + 55 developer-tools 및 43 object + 32 filesystem 분할을 대조한다.

**Step 4: 보호 해시와 root `dist` inventory를 기록한다.**

`Get-FileHash -Algorithm SHA256`으로 보호 네 파일, `dist/manifest.json`, `dist/web/main.js` 및 root `dist` 전체 상대경로/해시를 기록한다. 기준값과 다르면 후속 구현을 중지한다. 이 단계는 어떤 보호 파일도 쓰지 않는다.

**Step 5: 기준선 문서를 검증한다.**

Baseline JSON에는 명령, exit, test count, 75행 finding ID/source hash, 보호 해시, root dist inventory, 현재 commit/branch, dirty status를 넣는다. 보안 완료나 취약점 확정 문구를 넣지 않는다.

## Task 1: runtime status·bridge·표시 사전을 own-entry 경계로 바꾼다

**Files:** Modify `web/runtime.js`, `web/main.js`, `web/player.js`, `popup.js`, `tests/runtime.test.cjs`, `tests/bridge-cleanup.test.cjs`, `tests/player.test.cjs`, `tests/settings-ui.test.cjs`, `tests/tool-warning-remediation.test.cjs`.

**Interfaces:** `runtime.statuses.<feature>`와 bridge의 일반 객체 형태는 유지한다. runtime status key는 `/^[a-zA-Z][a-zA-Z0-9-]{0,39}$/`를 만족하고 `__proto__`, `prototype`, `constructor`가 아니어야 하며, state는 기존 5개, reason은 80자 이하로 정규화한다. bridge는 own enumerable status 최대 30개만 직렬화한다. popup은 기존 고정 표시 목록만 읽는다.

**Step 1: 기능 RED 검사를 추가한다.**

- `tests/runtime.test.cjs`: inherited Symbol runtime은 singleton으로 인정하지 않고 own runtime을 설치한다. `setStatus('__proto__', ...)`, 빈 키, 41자 키, 허용되지 않은 키는 prototype과 공개 status를 바꾸지 않는다. 유효 key는 dot access와 `Object.keys`에서 기존처럼 보인다.
- `tests/bridge-cleanup.test.cjs`: inherited status는 전송하지 않는다. 31개 유효 status 중 30개만 안정된 순서로 전송하고 reason은 80자로 잘린다. 공개 payload prototype과 JSON shape는 기존과 같다.
- `tests/settings-ui.test.cjs`: popup 응답의 inherited status 및 고정 목록 밖 status는 행을 만들지 않는다.
- `tests/player.test.cjs`: 알려진 label은 번역을, 상속되거나 알 수 없는 key는 fallback을 사용한다.

**Step 2: scoped ESLint RED를 추가한다.**

`tests/tool-warning-remediation.test.cjs`에 `popup.js`, `web/main.js`, `web/player.js`, `web/runtime.js`의 `security/detect-object-injection` 개수가 0이어야 한다는 검사를 추가한다. 기존 `--no-inline-config` 최종 도구 실행과 달리 테스트 API가 inline suppression을 허용하므로, 같은 테스트에서 AST 결과의 suppression count도 0인지 확인하지 말고 최종 Task 7에서 `--no-inline-config`로 강제한다.

**Step 3: RED를 확인한다.**

```powershell
& $knifeNode --test tests/runtime.test.cjs tests/bridge-cleanup.test.cjs tests/player.test.cjs tests/settings-ui.test.cjs tests/tool-warning-remediation.test.cjs
```

Expected: 새 prototype/limit/lint assertion 중 하나 이상이 실패한다. 실패 내용을 baseline에 연결한다.

**Step 4: 최소 구현을 한다.**

- `web/runtime.js`: `Object.getOwnPropertyDescriptor(window, symbol)`로 기존 own runtime만 확인한다. 설치는 `Object.defineProperty`; status 조회·기록도 own descriptor와 `Object.defineProperty`를 사용한다. 유효하지 않은 feature는 아무 transition도 만들지 않는다.
- `web/main.js`: status는 `Object.entries`에서 own entry를 필터링해 최대 30개 `[key, normalizedValue]`를 만든 뒤 `Object.fromEntries`로 snapshot한다. i18n은 고정 key 배열을 entry로 만들고, brightness/contrast/gamma는 명시적 getter 표로 읽는다.
- `web/player.js`: 지원 label을 고정 `Map`으로 구성하고 알 수 없는 key는 fallback한다.
- `popup.js`: `Object.entries(result?.statuses || {})`로 만든 `Map`에서 기존 고정 feature 목록만 조회한다.

**Step 5: GREEN과 계약 회귀를 확인한다.**

```powershell
& $knifeNode --test tests/runtime.test.cjs tests/bridge-cleanup.test.cjs tests/bridge.test.cjs tests/integration.test.cjs tests/player.test.cjs tests/settings-ui.test.cjs tests/tool-warning-remediation.test.cjs
& $knifeNode node_modules/eslint/bin/eslint.js --config eslint.security.config.mjs --no-inline-config --max-warnings=0 popup.js web/main.js web/player.js web/runtime.js
```

Expected: 모두 exit 0. runtime 공개 status, popup 행 순서, bridge payload와 player 접근성 regression이 유지된다.

## Task 2: settings snapshot과 compressor 필드를 명시적 필드 경계로 바꾼다

**Files:** Modify `settings-contract.js`, `web/audio.js`, `tests/settings-contract.test.cjs`, `tests/config.test.cjs`, `tests/audio.test.cjs`, `tests/multi-page-settings.test.cjs`, `tests/tool-warning-remediation.test.cjs`.

**Interfaces:** 저장 JSON의 `revision`, `config`, `styles`, `styleParameters` 형태와 merge semantics를 유지한다. compressor는 `threshold`, `knee`, `ratio`, `attack`, `release` 다섯 필드 및 기존 min/max/fallback만 사용한다.

**Step 1: 기능 RED 검사를 추가한다.**

- settings raw/operations에 `__proto__`, `constructor`, inherited style parameter, 알 수 없는 ID를 넣어 snapshot·저장 객체·prototype이 변하지 않음을 검사한다.
- key 순서가 달라도 같은 record/array는 동일하다고 판단하고, own 값 하나가 다르면 변경으로 판단하는 기존 revision 계약을 검사한다.
- compressor 다섯 필드 각각의 0값, 범위 밖 값, `NaN`, 누락 fallback을 한 table test로 검증하고 다른 AudioNode property가 쓰이지 않음을 검사한다.

**Step 2: scoped ESLint RED를 추가하고 실행한다.**

```powershell
& $knifeNode --test tests/settings-contract.test.cjs tests/config.test.cjs tests/audio.test.cjs tests/multi-page-settings.test.cjs tests/tool-warning-remediation.test.cjs
```

Expected: 새 malicious-key 또는 `settings-contract.js`/`web/audio.js` object-injection zero assertion이 실패한다.

**Step 3: 최소 구현을 한다.**

- record 비교는 `Object.entries(a)`와 `Object.getOwnPropertyDescriptor(b, key)?.value`를 사용한다.
- array 비교는 `b.at(index)`를 사용한다.
- style parameter는 `styleFields` Map 순회에서 유효 `[id, value]`만 모아 `Object.fromEntries`로 만든다.
- compressor는 다섯 개의 명시적 `{ parameter, configured, min, max, fallback }` entry를 구성해 적용한다. 설정 key 조합이나 node의 동적 property 접근을 만들지 않는다.

**Step 4: GREEN과 다중 창 저장 회귀를 확인한다.**

```powershell
& $knifeNode --test tests/settings-contract.test.cjs tests/config.test.cjs tests/audio.test.cjs tests/multi-page-settings.test.cjs tests/settings-broker.test.cjs tests/settings-client.test.cjs tests/settings-multi-ui.test.cjs tests/tool-warning-remediation.test.cjs
& $knifeNode node_modules/eslint/bin/eslint.js --config eslint.security.config.mjs --no-inline-config --max-warnings=0 settings-contract.js web/audio.js
```

Expected: 모두 exit 0. 설정 병합, zero compressor attack, 여러 창 동기화 계약이 유지된다.

## Task 3: 삭제 메시지 배열 교체를 identity·범위 검증 경계로 바꾼다

**Files:** Modify `web/inject.js`, `tests/deleted-chat.test.cjs`, `tests/tool-warning-remediation.test.cjs`.

**Interfaces:** native message 순서, retained marker, callback ownership, `notiUpdateMessageList()` 호출 횟수를 유지한다. 배열 identity가 바뀌거나 index가 유효하지 않으면 수정하지 않는다.

**Step 1: 실패 경계를 검사한다.**

- native blind callback 뒤 `findIndex()`가 `-1`인 경우 마지막 메시지를 읽거나 교체하지 않는다.
- callback 도중 `controller.messageList`가 새 배열로 바뀐 경우 이전/새 배열 모두 잘못 교체하지 않는다.
- 같은 index의 message identity가 바뀐 경우 foreign writer의 값을 보존한다.
- 복원 loop 중 배열 길이 또는 identity가 바뀌어도 범위 밖 write와 중복 notification이 없다.

**Step 2: scoped ESLint RED를 추가하고 실행한다.**

```powershell
& $knifeNode --test tests/deleted-chat.test.cjs tests/tool-warning-remediation.test.cjs
```

Expected: 새 race 또는 `web/inject.js` object-injection zero assertion이 실패한다.

**Step 3: 최소 구현을 한다.**

현재 배열을 local `list`로 고정한다. 읽기는 `list.at(index)`, 교체는 `index >= 0 && index < list.length && controller.messageList === list && list.at(index) === expected`를 확인한 뒤 `list.splice(index, 1, replacement)`로 수행한다. 검증 실패는 기존 `paint()`/native return 흐름만 수행한다.

**Step 4: GREEN과 삭제 표시 회귀를 확인한다.**

```powershell
& $knifeNode --test tests/deleted-chat.test.cjs tests/integration.test.cjs tests/tool-warning-remediation.test.cjs
& $knifeNode node_modules/eslint/bin/eslint.js --config eslint.security.config.mjs --no-inline-config --max-warnings=0 web/inject.js
```

Expected: 모두 exit 0, 기존 controller notification 수와 marker 정리가 변하지 않는다.

## Task 4: 개발 도구의 동적 객체·배열 접근을 의미 있는 고정 경계로 바꾼다

**Files:** Modify `scripts/audio-metrics.mjs`, `scripts/check-audio-quality.mjs`, `scripts/check-store-popup.mjs`, `scripts/check-video-filters.mjs`, `scripts/tool-audit.mjs`, `tests/audio-metrics.test.cjs`, `tests/tool-audit.test.cjs`, `tests/tool-warning-remediation.test.cjs`.

**Interfaces:** 합성 오디오 report, popup locale 검사, video filter 결과, tool audit의 redacted Gitleaks report/catalog JSON field와 순서를 유지한다. 이 Task에서는 파일 경로 경고를 아직 닫지 않는다.

**Step 1: 기능 RED 검사를 추가한다.**

- audio metrics의 첫/마지막 sample, stereo channel mismatch, non-finite sample, envelope boundary를 table test로 고정한다.
- tool audit Gitleaks projection은 허용된 8개 field만 own value로 보존하고 inherited/secret/unknown field를 버린다.
- npm vulnerability name `__proto__` 및 ESLint report의 unusual file/rule 문자열이 catalog prototype을 바꾸지 않고 독립 row로 남는지 검사한다.

**Step 2: scoped ESLint RED를 추가한다.**

대상 다섯 파일의 `security/detect-object-injection`이 0이라는 검사를 추가한다. 파일 경로 rule은 이 Task의 expectation에 포함하지 않는다.

```powershell
& $knifeNode --test tests/audio-metrics.test.cjs tests/tool-audit.test.cjs tests/tool-warning-remediation.test.cjs
```

Expected: 새 경계 또는 object-injection zero assertion이 실패한다.

**Step 3: 최소 구현을 한다.**

- numeric arrays와 channel arrays는 bounds가 성립하는 loop 안에서 `at(index)`를 사용한다.
- audio compressor report는 다섯 AudioParam을 명시적으로 snapshot한다.
- popup locale 메시지는 own entry `Map`으로 조회한다.
- video pixel comparisons는 `at(index)`를 사용한다.
- Gitleaks retained row는 명시적 destructuring과 조건부 own field 생성으로 구성한다. catalog는 `Object.entries`/`Map`과 검증된 entry를 사용한다.

**Step 4: GREEN과 합성 도구 회귀를 확인한다.**

```powershell
& $knifeNode --test tests/audio-metrics.test.cjs tests/tool-audit.test.cjs tests/tool-warning-remediation.test.cjs
& $knifeNode node_modules/eslint/bin/eslint.js --config eslint.security.config.mjs --no-inline-config scripts/audio-metrics.mjs scripts/check-audio-quality.mjs scripts/check-store-popup.mjs scripts/check-video-filters.mjs scripts/tool-audit.mjs
& $knifeNode scripts/check-store-popup.mjs
& $knifeNode scripts/check-video-filters.mjs
```

Expected: Node tests와 두 Playwright 도구 exit 0. ESLint는 아직 이 파일들의 filesystem 경고 때문에 exit 1일 수 있지만 object-injection은 0이어야 한다. raw rule별 개수를 기록한다.

## Task 5: 소유 파일 root capability를 TDD로 만든다

**Files:** Create `scripts/owned-files.mjs`, `tests/owned-files.test.cjs`; modify `tests/tool-warning-remediation.test.cjs`.

**Interfaces:**

```js
resolveOwnedPath(root, relative);                 // sync lexical containment
const files = await openOwnedRoot(directory);
files.root;                                      // realpath로 고정된 절대 root
await files.resolve(relative, { type, optional }); // 검사 완료 경로, fs 외 소비자용
await files.readFile(relative, options);
await files.readdir(relative, options);
await files.lstat(relative, { optional });
await files.ensureDirectory(relative);
await files.makeTempDirectory(relativePrefix);
await files.writeFile(relative, data, options);
await files.removeTree(relative);
await files.copyFile(sourceRelative, destinationRelative);
await files.copyTree(sourceRelative, destinationRelative, { accept });
```

`relative`는 `/` 기준 package relative path만 받는다. 빈 문자열은 root를 뜻하되 destructive method에는 허용하지 않는다. `resolve`의 `type`은 `file`, `directory`, `missing-or-file`, `missing-or-directory` 중 하나다. `optional`은 ENOENT만 null로 바꾸고 broken link나 ENOTDIR은 숨기지 않는다. `copyTree.accept`는 검증된 relative path와 Dirent를 받아 포함 여부만 결정하며 임의 절대경로를 반환하지 않는다.

**Step 1: pure containment RED를 작성한다.**

- exported pure helper `resolveOwnedPath(root, input)`가 정상 하위, root, `..`, 절대 Windows/POSIX, UNC, 다른 drive, 형제 접두사를 구분한다.
- Windows 대소문자 판정은 `path.relative` 결과를 사용하며 단순 `startsWith(root)`에 의존하지 않는다.

**Step 2: 실제 filesystem RED를 작성한다.**

- root alias junction 자체는 `realpath` 후 허용한다.
- 중간/최종 junction, 깨진 link, file/directory mismatch, linked output root를 operation 전에 거부한다.
- 존재하지 않는 출력은 가장 가까운 기존 parent까지 link/type을 확인한 뒤 정확한 child만 만든다.
- `removeTree('')`, root 밖 destination, source와 destination가 겹치는 copy를 거부한다.
- symlink 권한이 있으면 file symlink도 실행하고, Windows EPERM이면 해당 case만 명시적으로 환경 미검증으로 기록한다. junction case는 skip하지 않는다.

**Step 3: RED를 확인한다.**

```powershell
& $knifeNode --test tests/owned-files.test.cjs tests/tool-warning-remediation.test.cjs
```

Expected: 모듈 부재 또는 새 contract assertion으로 실패한다.

**Step 4: 최소 capability를 구현한다.**

- `openOwnedRoot`는 root만 한 번 `realpath`하고 실제 directory인지 확인한다.
- 모든 method는 lexical containment를 확인한 뒤 기존 각 구성 요소를 `lstat`하여 link를 거부하고 type을 확인한다.
- write/create는 가장 가까운 기존 parent부터 검사하며 최종 대상이 이미 link이면 거부한다.
- raw `fs` 호출 바로 앞에 검사 함수 이름을 적은 행 단위 disable만 둔다. 같은 행이 검사보다 먼저 실행되지 않게 한다.
- 이 모델이 동시 교체에 대한 atomic sandbox가 아니라는 현재 문구를 유지한다.

**Step 5: GREEN과 자체 lint를 확인한다.**

```powershell
& $knifeNode --test tests/owned-files.test.cjs tests/tool-warning-remediation.test.cjs
& $knifeNode node_modules/eslint/bin/eslint.js --config eslint.security.config.mjs --no-inline-config --format=json scripts/owned-files.mjs
```

Expected: Node tests exit 0. `owned-files.mjs`의 행 단위 disable은 `--no-inline-config`에서 무시되므로 JSON에는 검증 직후의 실제 dynamic fs call만 남아야 한다. 이 행들은 Task 7 원장에 `guarded-boundary`로만 기록하고 경고 0을 거짓으로 요구하지 않는다. 다른 rule이나 검증 전 호출이 있으면 GREEN이 아니다. 공용 모듈 밖 dynamic fs 관찰은 허용하지 않는다.

## Task 6: build·package·검사 도구의 파일 연산을 capability로 이관한다

**Files:** Create `scripts/verify-candidate.mjs`; modify `scripts/build.mjs`, `scripts/check-package.mjs`, `scripts/check-audio-quality.mjs`, `scripts/check-preview-autoplay.mjs`, `scripts/check-store-popup.mjs`, `scripts/check-styles.mjs`, `scripts/smoke-browser.mjs`, `scripts/tool-audit.mjs`, `tests/package.test.cjs`, `tests/tool-audit.test.cjs`, `tests/owned-files.test.cjs`, `tests/tool-warning-remediation.test.cjs`.

**Interfaces:** 기존 exported `manifestFiles`, `resolveFile`, `checkPackage`, `build`, `sourceFiles`, `snapshotInput`, `runTool`, `classifyReport`, `buildCatalog`, `auditExitCode`를 유지한다. 동기 함수 `resolveFile`은 새 pure lexical helper `resolveOwnedPath`를 호출하는 compatibility wrapper로 남기고, 실제 파일 operation은 async root capability가 다시 link/type을 확인한다. `verifyCandidate(id)`는 영숫자 ID만 받아 `output/tool-audit/p02-candidate-<id>/chrome-candidate`를 새로 만들고 `{ root, dist, files, resources }`를 반환한다.

**Step 1: consumer RED를 추가한다.**

- package/build fixture가 새 `owned-files.mjs`도 복사하도록 하고, source/dist 중간 junction, linked dist, broken optional metadata, output sibling-prefix, root alias를 재검사한다.
- tool audit source walk는 internal link를 따라가지 않고, linked `output/tool-audit` 또는 linked run destination에서 쓰기 전에 실패한다.
- fixed-source check scripts는 repository root 밖 cwd에서 실행해도 module 기준 root의 정확한 파일만 읽는다.
- candidate verifier는 `..`, separator, absolute ID와 기존 destination을 거부하고 package inputs 외 development/output/private report를 복사하지 않는다.
- 실패 전후 보호 네 파일과 caller fixture의 외부 sentinel hash가 같다.

**Step 2: consumer scoped ESLint RED를 추가하고 실행한다.**

```powershell
& $knifeNode --test tests/owned-files.test.cjs tests/package.test.cjs tests/tool-audit.test.cjs tests/tool-warning-remediation.test.cjs
```

Expected: 새 경계 또는 공용 모듈 밖 filesystem warning zero assertion이 실패한다.

**Step 3: package/build를 먼저 이관한다.**

- `check-package.mjs`는 package capability의 `readFile`, `readdir`, `lstat`만 사용한다. 현재 package root alias 허용과 내부 링크 거부를 보존한다.
- `build.mjs`는 같은 root capability 안의 정확한 `dist`만 remove/create/copy한다. root 자체, 외부 output, `dist-firefox`, linked dist를 거부한다.
- recursive copy는 capability의 `copyTree`와 기존 extension allowlist를 사용한다. manifest가 참조한 vendor와 license만 복사한다.

**Step 4: 나머지 검사 도구를 이관한다.**

- 각 스크립트는 `import.meta.url` 기준 repository root capability를 한 번 연다.
- fixed product/style/locale source는 `readFile`; Playwright와 child process에 필요한 실제 경로는 type 검사를 통과한 `resolve` 결과만 전달한다.
- `check-audio-quality`는 `output/audio-quality`, `check-preview-autoplay`는 `output/playwright`, `tool-audit`는 `output/tool-audit/run-*`만 생성한다.
- `tool-audit`의 source walk, package version, input snapshot, report write는 capability method만 사용한다. npm/Gitleaks/ESLint 명령 계약과 timeout/redaction/exit 판정은 바꾸지 않는다.
- `verify-candidate.mjs`는 package에 들어갈 source만 같은 repository capability로 새 candidate root에 복사하고, original `build(candidateRoot, candidateRoot/dist)`와 `checkPackage`를 호출한다. 보호 HLS bytes는 복사만 하며 HLS 생성·전용 검사를 호출하지 않는다.

**Step 5: 집중 GREEN을 확인한다.**

```powershell
& $knifeNode --test tests/owned-files.test.cjs tests/package.test.cjs tests/tool-audit.test.cjs tests/tool-warning-remediation.test.cjs
& $knifeNode node_modules/eslint/bin/eslint.js --config eslint.security.config.mjs --no-inline-config scripts/build.mjs scripts/check-package.mjs scripts/check-audio-quality.mjs scripts/check-preview-autoplay.mjs scripts/check-store-popup.mjs scripts/check-styles.mjs scripts/smoke-browser.mjs scripts/tool-audit.mjs scripts/verify-candidate.mjs
```

Expected: tests exit 0. ESLint의 `security/detect-non-literal-fs-filename`은 공용 모듈 밖에서 0. 공용 모듈의 guarded rows만 별도로 계산한다.

**Step 6: 실제 개발 도구 회귀를 실행한다.**

```powershell
& $knifeNode scripts/check-package.mjs
& $knifeNode scripts/check-store-popup.mjs
& $knifeNode scripts/check-styles.mjs
& $knifeNode scripts/check-video-filters.mjs
& $knifeNode scripts/check-preview-autoplay.mjs
& $knifeNode scripts/check-audio-quality.mjs
& $knifeNode scripts/smoke-browser.mjs
```

Expected: 모두 exit 0. 합성 fixture만 사용하고 실제 사용자 방송이나 프로필을 기록하지 않는다. root `dist`에는 쓰지 않는다.

## Task 7: 전체 회귀·도구 원장·격리 후보·독립 기능 검토를 완료한다

**Files:** Modify `output/tool-audit/recovery-backlog/warning-ledger.json`, create `output/tool-audit/recovery-backlog/p02-static-boundaries-implementation-2026-10-11.json`, modify `docs/superpowers/specs/2026-10-11-static-warning-boundaries-design.md`, `PLANS.md`; modify code/tests only if verified functional review finding requires a new RED→GREEN fix.

**Step 1: HLS 제외 일반 회귀를 실행한다.**

```powershell
$knifeTests = @(Get-ChildItem tests -Filter '*.test.cjs' |
  Where-Object { $_.Name -notlike 'hls-*' -and $_.Name -ne 'vendor.test.cjs' } |
  ForEach-Object { $_.FullName })
& $knifeNode --test @knifeTests
```

Expected: exit 0, fail/cancel/skip 0. 실제 총 개수는 기록하되 기대값을 낮춰 성공시키지 않는다.

**Step 2: 같은 도구를 새 입력으로 완전 재실행한다.**

```powershell
& $knifeNode scripts/tool-audit.mjs
```

Expected interpretation:

- exit 0: 모든 도구가 완전 실행되고 finding 0.
- exit 1: 완전 실행됐으나 finding이 남음. clean으로 부르지 않는다.
- exit 2: 도구 실패 또는 입력 snapshot 변화. 완료로 부르지 않는다.

새 summary의 npm/Gitleaks/ESLint raw report, 버전, input before/after hash와 exit을 evidence에 기록한다.

**Step 3: warning ledger 검증을 RED로 만들고 predecessor 기준으로 갱신한다.**

`tests/tool-audit.test.cjs`에 baseline 75행과 최신 catalog/ledger를 읽어 predecessor가 정확히 한 번 연결되고, source hash·RED test·GREEN command·최종 상태가 비어 있지 않으며 새 unresolved row를 누락하지 않는 검사를 추가한다. 기존 ledger로 먼저 실행해 RED를 확인한다. 그 뒤 기존 75행 각각에 `previousFindingId`, 이전/현재 source hash, 관련 RED test 이름, GREEN command, 최종 rule/location, 상태를 기록한다.

- 기능 검사와 warning 소멸이 모두 있으면 `remediated`.
- 공용 `owned-files.mjs`의 실제 syscall 관찰만 남고 containment/link/type RED→GREEN이 있으면 `guarded-boundary`.
- 경고가 남거나 기능 근거가 없으면 `open`.
- predecessor가 없는 새 항목만 `new`.

위치만 이동했거나 파일을 ignore해 보이지 않는 항목은 `remediated`로 기록하지 않는다. 갱신 뒤 `& $knifeNode --test tests/tool-audit.test.cjs`를 실행해 GREEN을 확인한다.

**Step 4: 새 소유 후보를 만든다.**

새 영숫자 ID로 재사용 가능한 verifier를 실행한다. 보호 HLS bytes는 현 source를 그대로 복사할 뿐 실행·재생성하지 않는다.

```powershell
$candidateId = [guid]::NewGuid().ToString('N')
& $knifeNode scripts/verify-candidate.mjs $candidateId
```

Expected: `output/tool-audit/p02-candidate-$candidateId/chrome-candidate/dist`만 생성되고 내부 package check exit 0. 58개 전체 package file inventory와 source 대응 hash를 기록한다. root `dist` inventory/hash는 Task 0과 같아야 한다.

**Step 5: Astra max 독립 기능 검토를 요청한다.**

범위를 다음으로 제한한다.

- status/settings/audio/deleted-chat 공개 계약의 회귀와 race
- owned file capability의 명시된 containment/link/type 동작과 consumer API 일치
- 테스트가 구현을 실제로 깨뜨리는 반례인지
- ledger predecessor와 evidence 일관성

보안 판정, 취약점 없음 선언, HLS 검토를 요청하지 않는다. Critical/Important/Minor 형식으로 받고 모든 finding을 현재 소스와 재현한다. 유효 finding은 먼저 RED를 추가한 뒤 최소 수정하고 관련 집중/일반 회귀를 다시 실행한다. Critical/Important가 남으면 P02를 완료하지 않는다.

**Step 6: 검토 조치 뒤 HLS 제외 일반 회귀를 한 번 더 실행한다.**

Step 1과 같은 `$knifeTests` 명령을 다시 실행한다. Expected: exit 0, fail/cancel/skip 0. Task 3에서 추가한 ledger 검사와 독립 검토 후 수정까지 최종 결과에 포함한다.

**Step 7: 보호 경계와 문서 품질을 확인한다.**

```powershell
git -c core.safecrlf=false diff --check
Select-String -Path docs/superpowers/plans/2026-10-11-static-warning-boundaries.md,docs/superpowers/specs/2026-10-11-static-warning-boundaries-design.md,PLANS.md -Pattern '[\u3040-\u30ff]'
git status --short
```

Expected: diff check exit 0, 일본어 문자 검색 결과 0. 보호 네 파일과 root `dist` hash/inventory가 Task 0과 동일하다. `git status`에는 기존 사용자 변경과 이 계획의 허용 파일만 더해지고 stage된 파일은 없다.

**Step 8: 상태를 사실대로 갱신한다.**

- 모든 기존 행에 근거가 있고 unresolved `open/new`가 없으며 회귀·candidate·독립 기능 검토가 통과하면 P02를 `DONE-LOCAL`로 표시한다.
- 공용 경계의 `guarded-boundary`는 숨기지 않고 실제 남은 ESLint raw row와 함께 기록한다.
- 도구 실패, open/new, Critical/Important, 보호 hash 변화가 있으면 P02를 해당 `BLOCKED-*` 또는 `DOING`으로 유지한다.
- P03 HLS, Chrome 121/file symlink 실환경, 최종 버전 metadata, P06 설치본 수용, G-SEC/G-REL은 자동 완료시키지 않는다.

## 완료 산출물

- 실행/UI object-injection 20건의 predecessor·기능 근거·후속 상태.
- 개발 도구 object/filesystem 55건의 predecessor·기능 근거·후속 상태.
- `scripts/owned-files.mjs`와 Windows/링크/type/output 실패 검사.
- 최신 complete tool-audit raw report 및 정확한 exit.
- HLS 제외 일반 회귀와 새 격리 candidate package 결과.
- 보호 네 파일과 root `dist` 불변 근거.
- Astra max 기능 정확성 검토 결과와 재현/조치 기록.
- `PLANS.md`의 다음 실행 cursor. 공개·설치·배포 승인은 포함하지 않는다.

# HTTPS 호스트 권한 정합성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task in the current session. Steps use checkbox (`- [ ]`) syntax for tracking. 사용자 요청에 따라 설계와 실행 계획을 한 번에 검토받는다. 승인 전 제품 코드·테스트·설치본을 변경하지 않는다.

**Goal:** 실제 확장 기능에 필요한 HTTPS 본 사이트 권한만 요청하고, 기존 설정·페이지 주입·권한 재허용 후 스타일 복구를 보존한다.

**Architecture:** 기존 classic script의 `config.js`에 읽기 전용 호스트 정책을 두고, 권한 안내·백그라운드·동적 CSS가 같은 값을 소비한다. manifest의 선언은 정적 파일로 유지하며 테스트로 정책과 대조한다. 새 네트워크 프록시·저장 계약·자동 탭 새로고침은 도입하지 않는다.

**Tech Stack:** Chrome MV3 / minimum Chrome `121`, JavaScript classic scripts, Node `24.19.0`, node:test, 기존 jsdom·Chrome 합성 검사.

**Spec:** 이 문서의 [설계](#설계)와 [일괄 승인 범위](#일괄-승인-범위). 상위 순서·게이트는 [PLANS.md](../../../PLANS.md)를 따른다.

2026-10-11 / Asia-Seoul / **DONE-LOCAL — 상위 게이트 유지**. 사용자의 “후속 권장안 진행” 응답으로 A1–A3 전체를 승인받아 구현·회귀·격리 후보·독립 기능 검토를 마쳤다. npm 레지스트리 재조회, Chrome 121/file symlink 환경, 최종 메타데이터, P02/P03, 실제 설치 수용은 완료하지 않았으며 이 단위의 통과로 확대하지 않는다.

## Global Constraints

- `host_permissions`와 두 정적 content script의 `matches`: 정확히 `['https://chzzk.naver.com/*']`.
- `permissions`는 기존 `['scripting', 'storage']`, `minimum_chrome_version`은 `121`, MV3와 Chrome 전용 지원 유지.
- 정적 content script의 기존 `exclude_matches`, `all_frames`, `world`, `run_at`, JS/CSS 파일 목록은 그대로 보존한다.
- API 요청 URL·`credentials: 'include'`·미디어·오디오·설정 값·저장 revision 계약은 변경하지 않는다.
- 일본어를 작성하지 않는다. 사용자 설명·신규 문서는 한글 또는 영문, UI locale은 ko/en만 사용한다.
- 기존 `dist`, 보류 HLS 네 파일·HLS 전용 테스트·벤더 재생성·보안 모델 검토는 변경/실행하지 않는다.
- 현재 폴더와 `codex/sidebar-preview-followup` 유지. 전체 stage·commit·push·PR·릴리즈·스토어 변경은 이 묶음에 없다.
- 권한/정책 정합성 확인은 보안 인증이 아니다. P02의 75건과 P03/G-SEC/G-REL 보류를 유지한다.

## Review Focus

1. 이전 CSS 실패와 같은 파일 선택: 권한 재허용이 실패 캐시를 한 번 우회하고 최신 저장값으로 복구해야 한다 — Task 2.
2. 대기/실행 중 재허용·설정 변경: retry 신호가 일반 invalidation에 지워지거나 늦은 CSS가 최종 선택을 덮으면 안 된다 — Task 2.
3. 거절·예외·연속 클릭: 사용자가 다시 시도할 수 있고 자동 허용/창 종료/중복 요청이 없어야 한다 — Task 1.
4. 옛 wildcard 동적 등록: 소유한 `styles`만 HTTPS로 갱신하고 foreign 등록과 저장값은 보존해야 한다 — Task 2.
5. API/미디어의 페이지 실행 경로: 호스트 권한 축소를 외부 통신 중단이나 CORS 우회로 설명하면 안 된다 — Task 3과 P06.

## 설계

### 목적과 확인한 근거

사용자 목표는 기존 문제·보안 미완료를 해결한 뒤 배포하는 것이다. 이번 단위는 P04의 최소 권한/기능 정합성을 해결하며, 전체 보안·설치 수용을 대신하지 않는다.

현재 manifest와 권한 요청/조회는 `*://*.chzzk.naver.com/*`, 정적/동적 주입은 `*://chzzk.naver.com/*`이다. 팝업의 대상 캡처와 스타일 새로고침은 이미 `https://chzzk.naver.com`을 사용한다. `web/preview.js`의 live-detail 및 `web/inject.js`의 VOD 요청은 본 사이트에 주입한 MAIN 코드에서 실행된다. 확장 백그라운드/권한/설정 화면에는 해당 API를 호출하는 네트워크 프록시가 없다.

Chrome 문서는 웹 페이지/콘텐츠 코드의 cross-origin 요청과 확장 origin의 요청을 구분한다. 페이지 측 CORS는 확장 host permission으로 해제되지 않는다. **이 코드와 문서를 근거로 한 설계 추론**은 현재 API 요청에 확장 origin용 API 호스트 권한을 남길 필요가 없다는 것이다. 실제 서비스 응답/세션/설치 수용은 아직 검사하지 않았으며 승인 이후에도 P06의 실환경 근거가 필요하다. [네트워크 요청 공식 문서](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

| 선택지 | 장점 | 남는 문제 |
| --- | --- | --- |
| HTTPS 본 사이트만 — 권장 | 현재 확장 origin 기능과 주입 대상에 맞춰 HTTP·서브도메인 권한을 제거 | 최종 설치본의 live/VOD/API/미리보기 수용 필요 |
| HTTPS 본 사이트 + API | 기존 wildcard보다 좁음 | 확장 origin API 호출이 없어 현재 근거로 불필요한 권한을 유지 |
| wildcard 유지 | 선언 변경 없음 | 최소 권한 필요성 미확정 상태가 그대로 남음 |

미래 기능을 위해 권한을 미리 남기지 않는다. 이는 Google의 정책 적합성 판정이 아닌 로컬 준비 판단이다. [최소 권한 정책](https://developer.chrome.com/docs/webstore/program-policies/permissions)

### 호스트 정책과 주입

`config.js`의 새 classic 전역 계약은 `var KnifeHostPolicy = Object.freeze({ origins: Object.freeze(['https://chzzk.naver.com/*']) });`이다. 소비자는 API에 전달할 때 배열을 복사한다. 별도 matches/hosts 상수를 만들어 같은 범위를 세 번 관리하지 않는다. 안내 목록도 이 패턴을 그대로 표시한다.

manifest의 host 선언과 두 content script match를 같은 한 값으로 바꾼다. 이미 제외한 chat/embed/donation 등의 경로와 실행 world/frame/timing은 바꾸지 않는다. dynamic CSS `desired.matches`는 `KnifeHostPolicy.origins`의 복사본이다. host permission의 경로는 접근을 제한하지 않으며, content script 경로 제외와 구분한다. 해당 match pattern을 포트 443만 허용한다고 설명하지 않는다. [Match patterns 공식 문서](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)

HTTP 직접 URL에서는 확장을 실행하지 않는다. HTTPS로 이동한 문서에는 기존 조건대로 실행된다. API/CDN/game 호스트 grant, optional permission, `tabs`/`cookies`/`debugger`, 원격 코드, 네트워크 중계는 추가하지 않는다.

### 권한 화면의 상태 계약

`permission.html`은 `config.js` → `permission.js` 순서로 로드한다. 새 `<p id="permission-status" role="status" aria-live="polite"></p>`를 기존 버튼 아래에 둔다. 고정된 상태만 `textContent`로 표시하고 raw 예외나 계정 정보를 표시하지 않는다.

`grant` 클릭의 동기 구간에서 `chrome.permissions.request({ origins: [...KnifeHostPolicy.origins] })`를 바로 호출한다. 호출 전에 await/조회/타이머를 넣지 않는다. 초기 로드·worker wake가 권한 요청을 자동 실행하지 않는다. pending 동안 버튼을 disabled로 하며 handler에서도 중복 요청을 막는다. synchronous throw와 Promise rejection 모두 실패 상태로 처리한다. true일 때만 현재처럼 창을 닫고, false/예외는 버튼을 복구하고 화면을 유지한다. [Permissions API 공식 문서](https://developer.chrome.com/docs/extensions/reference/api/permissions)

locale의 새 상태 키와 정확한 문구:

| 키 | ko | en |
| --- | --- | --- |
| `permission_pending` | 권한 허용 여부를 확인하고 있습니다. | Waiting for your permission decision. |
| `permission_denied` | 권한이 허용되지 않았습니다. 허용 버튼을 눌러 다시 시도할 수 있습니다. | Permission was not granted. Select Allow to try again. |
| `permission_failed` | 권한 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요. | Could not complete the permission request. Please try again. |

기존 `permission_host`는 ko `$HOST$ 접근(HTTPS 치지직 페이지 기능·스타일 적용)` / en `Access $HOST$ (features and styles on HTTPS CHZZK pages)`로 바꾼다. 현재 HOST placeholder 계약은 유지하며 값은 정책 패턴이다.

### worker와 CSS 복구 계약

`checkPermission(): Promise<void>`은 공유 origins를 조회하고 미허용일 때 기존 안내 페이지를 연다. 이번 변경은 안내 탭의 새로운 중복 방지 시스템을 만들지 않는다.

새 `retryStylesAfterPermissionGrant(): Promise<void>`은 공유 origins의 `permissions.contains`를 재조회하고 true이면 `settingsBroker.invalidateStyles({ retry: true })`를 호출한다. `permissions.onAdded`에 등록하고 rejection은 기존 worker처럼 경계에서 처리한다. true가 아닌 이벤트는 강제 재등록하지 않으며, 권한을 자동 요청하거나 탭을 새로고침하지 않는다. 동적 content script 등록 성공 상태와 실제 페이지 주입 가능 여부는 같지 않다. 조회 뒤 권한이 다시 사라지는 경쟁에서는 Chrome이 등록을 보존하면서 주입만 막을 수 있으므로, 이를 broker의 CSS 실패 상태로 단정하지 않고 실제 설치 수용에서 권한·등록·페이지 적용을 각각 확인한다.

broker의 공개 인터페이스는 기존 호출과 호환되는 `invalidateStyles(options = {}): void`, `options.retry === true`만 강제 재시도 플래그로 사용한다. 기존 settings 메시지 프로토콜에는 이 옵션을 노출하지 않는다.

현재 `applyStyles(raw, force = false)`는 동일한 CSS 파일 목록의 이전 실패를 캐시한다. 단순 invalidation만으로는 권한 복구 뒤 같은 선택의 등록을 건너뛸 수 있다. 따라서 별도 pending retry boolean을 dirty/queued와 함께 관리한다:

- 일반 호출은 dirty만 설정하고 pending retry를 지우지 않는다. retry 호출은 dirty와 pending retry를 설정한다.
- 기존 직렬 큐의 스타일 작업이 **실행을 시작할 때** force 값을 캡처하고 dirty/retry를 함께 소비한다. 실행 중 새 신호는 다음 작업에 남긴다.
- 최신 storage를 읽고 `applyStyles(raw, capturedRetry)`를 호출한다. 이전 실패와 같아도 retry이면 한 번 실제 API를 시도한다.
- 캡처 뒤 CSS API에 도달하기 전 boot/storage/revision 조회가 실패하면 retry 의도를 보존하되 자동 반복하지 않는다. 이후의 일반 invalidation이 보존된 retry를 소비해 실제 CSS API를 한 번 시도할 수 있어야 한다.
- 성공 시 기존 실패 캐시를 해제한다. 실패 시 기존 `style-registration-failed` 상태를 유지한다. 새 신호가 없으면 반복 재시도하지 않는다.
- boot/초기화 실패·64개 큐 제한·저장 직렬화·reload-target의 탭/창 확인을 약화하지 않는다. queue가 가득 차면 dirty/retry를 보존하고 기존 drain 뒤에 처리한다.
- 기존 owned `styles`의 match가 달라졌으면 `updateContentScripts`로 갱신한다. 다른 ID는 수정/해제하지 않는다. 저장 config/styles/parameters/revision은 이 등록 복구 때문에 변경하지 않는다.

### 문서·환경·수용 경계

README 한/영·PRIVACY 한/영·스토어 체크리스트·private 배포 초안에 요청 범위와 API/미디어 통신의 차이를 반영한다. API 호스트 grant 제거를 데이터 처리/세션 전송의 제거라고 쓰지 않는다. 고지 변경은 사실 정합성만 다루며 스토어 답변/URL은 아직 조작하지 않는다.

현재 Chrome은 `155.0.8059.39`다. 121 지원 선언을 유지하지만 실제 121 수용은 미검증이다. 실제 file symlink 생성도 EPERM으로 미검증이며, WSL 목록 조회는 `Wsl/E_ACCESSDENIED`여서 사용 가능한 환경을 확인하지 못했다. 이를 배포판 미지원 결정이나 성공한 환경 조사로 처리하지 않는다.

시험은 기존 로컬 Node 환경과 접근 가능한 소유된 임시 폴더/격리 Chrome 프로필에서만 진행한다. 새 시스템 도구 설치·관리자/개발자 모드·WSL 설정·브라우저 정책 변경·사용자 계정/쿠키 복사·외부 소스 업로드는 승인 묶음에 포함하지 않는다. 새 환경이 실제 필요하면 구체적 최소 행동을 한 번 요청한다. 승인만으로 missing environment를 PASS 처리하지 않는다.

G-SEC 이후 P06에서 같은 최종 후보의 HTTPS live/VOD, API 응답, 미리보기/음량, 원래 탭 스타일 적용, 권한 거절/재허용, 제외 iframe, 업데이트 뒤 옛 페이지 정리를 확인한다. 현재는 설치본을 바꾸거나 새로고침을 요청하지 않는다. 실패한다고 API grant/프록시/CORS 완화를 몰래 추가하지 않는다.

## 일괄 승인 범위

아래 A1–A3 전체를 한 번 승인하면 Task 1→2→3을 주 실행자가 순차 구현·회귀·기록한다. 이미 명시한 파일별 변경·테스트·사실 고지에는 재승인을 요청하지 않는다.

| ID | 승인받을 결정 | 포함하지 않는 행동 |
| --- | --- | --- |
| A1 | HTTPS 본 사이트만 선언·요청·조회·주입, API grant 제거, 기존 제외 경로 유지 | 새 호스트/권한·프록시·Firefox·최소 버전 변경 |
| A2 | 공유 정책, 클릭 기반 권한 안내/실패 표시, 재허용 후 직렬 CSS 재시도 계약 | 자동 grant/페이지 reload·설정 초기화·새 settings 메시지 |
| A3 | 현재 브랜치의 TDD/일반 회귀·기존 점검 도구·격리 후보 검사·한/영 문서 갱신 및 기존 범위의 독립 기능 검토 | HLS/모델 보안 검토·시스템 변경·실제 dist 설치·공개/스토어 조작 |

P02/P03·121/file symlink·최종 버전/대시보드/설치 수용은 실제 근거가 필요한 잔여 게이트다. 이 일괄 승인은 이를 면제하거나 완료시키지 않는다. 새로운 계약/외부 전송/지원 범위가 필요하거나 사용자 직접 조작에 도달할 때만 추가 요청한다.

## Task 1: 호스트 계약과 권한 화면

**Files:** Modify `config.js`, `manifest.json`, `permission.html`, `permission.js`, `_locales/ko/messages.json`, `_locales/en/messages.json`, `background.js`, `tests/settings-load-order.test.cjs`; Create `tests/host-permissions.test.cjs`, `tests/permission.test.cjs`.

**Interfaces:** Produces frozen `KnifeHostPolicy.origins: readonly string[]`; existing `checkPermission(): Promise<void>` consumes it. permission HTML consumes config before permission JS. No new network API or storage field.

- [x] **Step 1: Write failing tests.** `host policy and manifest use HTTPS main only` compares origins, host permissions and every static match to `['https://chzzk.naver.com/*']`, asserts frozen object/array, permissions `['scripting','storage']`, floor `121`, unchanged excluded paths/world/frames/timing. Record the actual pre-change static script metadata as test fixture data, not guessed paths. `permission HTML loads policy before grant UI` asserts exactly `['config.js','permission.js']`.
- [x] **Step 2: Write real UI boundary tests** using actual HTML/JS and ko/en locales: `click requests exact host synchronously`; `pending click issues only one request`; `deny keeps page open and allows retry`; `synchronous throw and rejection show localized failure without unhandled rejection`; `grant closes once`. Track request call before handler returns, request count, disabled/status text, close count; no automatic request before click.
- [x] **Step 3: Run RED.** Node `--test tests/host-permissions.test.cjs tests/permission.test.cjs tests/settings-load-order.test.cjs`. Expect new policy/load-order/behavior assertions to fail against current code, not module/dependency setup errors. Save log and failed names.
- [x] **Step 4: Implement only the specified policy/manifest/UI/contains changes.** Preserve unrelated manifest and locale entries. Handle false/throw/rejection explicitly with the prescribed text and user-gesture ordering.
- [x] **Step 5: Run GREEN** with the same command plus `tests/background.test.cjs`; expect exit 0, no failed/cancelled/skipped tests. Record exact changed files/hash/diff; no commit/stage at this gate.

## Task 2: 권한 재허용 뒤 CSS 복구

**Files:** Modify `settings-broker.js`, `background.js`, `tests/settings-fixture.cjs`, `tests/settings-broker.test.cjs`, `tests/background.test.cjs`.

**Interfaces:** Consumes Task 1 policy. Produces `invalidateStyles(options = {}): void` with `{ retry: true }`; internal `retryStylesAfterPermissionGrant(): Promise<void>` connects Chrome onAdded to the broker. Existing initialize/listener contracts unchanged. Fixture adds `permissions.onAdded` using its existing event boundary.

- [x] **Step 1: Write failing tests** `owned wildcard CSS registration updates to HTTPS only` (foreign registration and all saved fields unchanged); `grant retries identical failed CSS once` (failed registration → same settings → onAdded/contains true → ready); `ungranted event does not force retry`; `grant listener rejection causes no unhandled failure`; `grant retry does not reload tabs or write storage`.
- [x] **Step 2: Pin scheduler races** `normal invalidation preserves queued retry`; `retry arriving during registration remains pending`; `queue saturation retains retry until drain`; `repeated notifications coalesce without parallel registration`; `repeated failure settles until a new retry signal`; `failed boot stays gated`. Use fixture held CSS/read/write boundaries, assert latest CSS selection, max concurrency 1, bounded API calls, unchanged revision and no automatic reload. No delay-based real browser policy assertions in jsdom.
- [x] **Step 3: Run RED.** Node `--test tests/settings-broker.test.cjs tests/background.test.cjs`; expect new exact match/force retry assertions to fail with current code. Save baseline before editing product code.
- [x] **Step 4: Implement shared desired matches and sticky retry consumption** as specified, adding no second queue or message protocol. `permissions.onAdded` rechecks actual required origins; attach listener synchronously like existing worker listeners.
- [x] **Step 5: Run GREEN** with the same command plus `tests/settings-load-order.test.cjs tests/settings-client.test.cjs tests/settings-ui.test.cjs`; all exit 0 with failure/cancel/skip 0. Save results and relevant hash map; inspect failed/retry outcomes, not only final CSS.

## Task 3: 한/영 고지·회귀·후속 게이트 기록

**Files:** Modify `README.md`, `README-en.md`, `PRIVACY.md`, [스토어 체크리스트](../validation/2026-10-11-store-policy-checklist.md), [최종 설치 체크리스트](../validation/2026-10-11-final-installed-checklist.md), `PLANS.md`; private drafts/results under `output/tool-audit/recovery-backlog/`. Do not change build/HLS code.

**Interfaces:** Consumes Tasks 1/2 exact host contract and real outcomes. Produces a local evidence record with input hashes, commands/exits/counts, original settings preserved, held-file/dist hashes, unresolved gates; no release approval.

- [x] **Step 1: Update only factual ko/en disclosure** for exact HTTPS host request and unchanged page-side API/media processing. Add P06 permission denial/regrant + legacy registration upgrade cases. Keep 121/symlink/HLS/security/actual Dashboard conditions pending.
- [x] **Step 2: Run relevant full ordinary regression** with commands below, excluding only the already held HLS test files. Expect exit 0 and fail/cancel/skip 0; actual count may exceed 413. A failure blocks local completion and is not accepted by lowering expectations.
- [x] **Step 3: Run existing local tool audit** `node scripts/tool-audit.mjs`. Preserve raw reports/new input hashes. Exit 1 with findings is not clean; runner 2 is incomplete. Carry prior 75 rows forward by evidence rather than marking moved/absent rows resolved. No model triage or blanket ignore.
- [x] **Step 4: Check a new owned isolated candidate** by copying only package inputs into a fresh output subdirectory, calling existing `build(candidateRoot, candidateRoot/dist)` and `checkPackage(candidateRoot/dist)`. Preserve held HLS bytes without executing/regenerating them. Inventory/hash package, require exact host/permission/config/HTML entries; root installed dist must remain unchanged. Source metadata is still preview, not final release.
- [x] **Step 5: Perform existing-scope independent functional review** on these changed contracts/tests only, using the user's Astra max choice. No security/HLS assessment. Verify supplied ordinary correctness findings before fixes, repeat impacted tests only, and record review scope/remaining limits.
- [x] **Step 6: Check diff, links, held hashes and state.** Mark this local permission unit DONE-LOCAL only with passing functional evidence; P04 as a whole stays incomplete while actual environment/metadata/installation conditions remain. Stop before P06/G-REL unless their separate prerequisites actually hold.

Commands (verify Node path exists; execute each separately and preserve output):

```powershell
$knifeNode = 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$knifeTests = @(Get-ChildItem tests -Filter '*.test.cjs' |
  Where-Object { $_.Name -notlike 'hls-*' } |
  ForEach-Object { $_.FullName })
& $knifeNode --test @knifeTests
& $knifeNode scripts/tool-audit.mjs
git -c core.safecrlf=false diff --check
```

Do not use bare `npm test`, bare root build, HLS regeneration or publish scripts. Native autoplay/real stream acceptance is P06, not a fabricated result of fixture tests.

## 반례 중심 자체 검토

| 반례 | 설계 판정 / 검사 담당 |
| --- | --- |
| MAIN API 호출이 CORS 실패 | 호스트 grant가 해결책이라고 단정하지 않음. 현 endpoint 유지, 실제 수용 실패 원인을 확인하고 설계 변경 필요 시 멈춤 — Task 3/P06 |
| policy 배열만 수정하고 manifest 누락 | 정적 manifest와 런타임 정책 exact equality로 잡음 — Task 1 |
| shared config 로드가 늦어 권한 화면 실패 | actual HTML script order + UI execution으로 잡음 — Task 1 |
| retry 전에 await로 사용자 gesture 소실 | permission.request는 click 동기 구간, CSS 복구는 별도 worker 이벤트 — Task 1/2 |
| 같은 CSS 실패 캐시가 성공 기회를 차단 | explicit one-shot force, failure bound, queue races — Task 2 |
| 옛 HTTP match/foreign 등록/저장값 변경 | owned update + metadata snapshot + saved deep equality — Task 1/2 |
| 스토어 권한 감소만으로 전체 준비 완료 표시 | source/isolated/install/store와 P02/P03/P04 잔여 조건 분리 — Task 3 |

자체 검토는 계약·회귀·계획 정합성 검토다. 보안 취약성/오탐 판정은 수행하지 않았다. 위 체크 항목은 승인 뒤 실제 구현·검사 결과로 갱신했으며, 전체 보안·설치본·공개 준비 완료를 뜻하지 않는다.

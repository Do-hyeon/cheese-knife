# AF05-B Native Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. 사용자 지정 Native(주 실행자 순차 구현) 방식을 유지한다. 체크박스는 계획 작성과 실제 실행을 구분한다.

**Goal:** 실제 스토어2.13.3의 실행 출처·비기본 저장값·설정 UI·동적 CSS 등록을 연결하는 좁은 사전검증을 마련한다.

**Architecture:** 고정 게시 ZIP reader와 owned-files를 재사용한다. 로컬 준비/검사 CLI와 읽기 전용 DevTools probe만 추가하며 제품에는 코드를 넣지 않는다. 브라우저 제어 연결이 없는 현재 환경의 native 관측은 사용자가 일반 Chrome UI/DevTools에서 실행한 JSON을 로컬 checker가 검증하는 경로로 계획한다. 실제 연결 가능 여부는 실행 단계에서 증명해야 한다.

**Tech Stack:** 기존 Node24.19.0·Node test runner·JSDOM·Chrome의 공개 extension API. 새 의존성·제어 확장·CDP 연결을 추가하지 않는다.

**Spec:** [AF05-B 상위 설계](../specs/2026-10-12-af05b-release-acceptance-design.md) §2·3·6·7·9, [P09 게시/설치 근거](../validation/2026-10-12-p09-store-publication.md). B2의 c707af6 로컬 전환 결과는 별도 [검증 기록](../validation/2026-10-12-af05b2-installed-transition.md)이다.

2026-10-13 / Asia-Seoul. **Task1 로컬 완료, Task2 코드/현재 출처 조회 후 첫 probe의 Chrome paste 보호로 BLOCKED-CAPABILITY.** 기존 P09만 실행 승인됐으며 actual API JSON·runtime/baseline/seeded/cold는 없다. 보호 우회 없이 중지, 원래 Developer modefalse 복원/검사 창 종료 정리는 확인 대기다. 제품2.13.3을 유지하고 push/PR/배포하지 않는다. 결과는 [검증 기록](../validation/2026-10-13-af05b-native-preflight.md)에 분리한다.

## Global Constraints

- 과거 native2.13.2→2.13.3은 `UNVERIFIED-HISTORICAL`, 플랫폼 롤백은 `NOT-EXECUTED`로 남긴다. B2 동일 개발용 ID의 코드 복귀 PASS로 대체하지 않는다.
- native 대상은 기존 P09의 `output/p09-public-20261012152819/fresh-chrome-profile` 한 개, 확장 ID `cgfddiiffponlciljlfbiecmlagflbpe`, version `2.13.3`, version_name `2.13.3 sidebar follow-up preview`다. 없거나 변경됐으면 STOP; 새 프로필/재설치로 대체하지 않는다.
- 원래 시청 Chrome·root dist·원본 ZIP/CRX·frozen P02·보호 브랜치는 변경하지 않는다. root에서 build하지 않는다.
- native 기존 프로필의 열기·Developer mode·DevTools·검사용 UI 저장·seed 유지에는 실행 직전 묶음 승인을 받는다. 스토어 설치/업데이트·권한 변경·version/릴리즈/제출/게시·push/PR은 그 승인에 포함하지 않는다.
- Browser 도구가 제한한 URL·기능을 shell/CDP/Preferences 편집/다른 도구로 우회하지 않는다. 제어 확장·force flag·원격 디버깅 포트·프로필 복제/초기화/삭제·uninstall/reinstall은 금지한다.
- 정상 native UI/DevTools가 정책으로 막히거나 사용자에게 해당 관측 경로가 없으면 `WAITING-USER` 또는 `BLOCKED-CAPABILITY`로 남긴다. 도구 제한 때문에 사용자가 대신 우회하는 절차를 제시하지 않는다.
- 실제 데이터는 private `output/native-preflight-<runId>/`에만 둔다. 쿠키·계정·채팅·전체 탭·다른 확장·전체 storage export를 수집하지 않는다. 공개 결과에는 기준 해시·판정·한계만 남긴다.
- 검사 UI 저장은 `arrowSeek=false`, `previewVolume=25`, `hide-ranking=true`, `chat-font-size=8` 네 값에 한정한다. native legacy/손상/unknown 값 시험과 인위적 storage loss는 B1/B2에서만 수행한다.
- native preflight는 스토어 baseline의 실행 worker/설정 client/CSS **등록** 근거다. 실제 방송 MAIN·화면 CSS 적용·오디오·업데이트·서명 인증·전체 보안 검증은 아니다.
- AF05-B 전체 완료 전 push/PR 금지, 기능 F00–F05 동결을 유지한다. 공개 이후에만 가능한 수용은 로컬 개발 완료와 별도로 추적한다.

## 관측 경로와 승인 경계

[Chrome 공식 debugging 안내](https://developer.chrome.com/docs/extensions/get-started/tutorial/debug)는 일반 관리 화면의 service worker Inspect와 popup Inspect 경로를 설명한다. [service worker 안내](https://developer.chrome.com/docs/extensions/get-started/tutorial/service-worker-events)는 DevTools를 닫고 수명주기를 확인하라고 명시한다. 따라서 inspector가 열린 채 유지된 worker를 cold-start 성공으로 보지 않는다. 이것은 공개 API에 근거한 **실행 후보 경로**이지 현재 native 연결 확보 판정이 아니다.

1. **완료된 계획 단계:** 계획·리뷰·P09 수용 기준 문서 정합성만 변경했다. native Chrome을 열거나 설정하지 않았다.
2. **현재 완료된 Task1:** 승인된 로컬 도구 구현/테스트만 수행했다. native 프로필을 읽거나 열지 않았다.
3. **Task2 실행 전 승인 묶음:** 지정 P09 프로필만 열기, 그 프로필에서 정상 Developer mode ON(필요할 때), target service worker와 popup/styles Inspect, 네 UI 값 저장, Chrome 종료/재시작, seed를 다음 실제 업데이트 검사까지 보존. Developer mode는 이전 상태를 기록하고 관측 후 원래 상태로 복원한다. 정상 UI에서 가능한 경우에만 진행한다.
4. **사용자가 해야 하는 최소 작업:** 같은 검사용 Chrome의 대상 확장 Inspect를 열고 생성된 읽기 전용 probe를 실행해 결과 JSON을 전달한다. 설정 변경과 관측을 체크포인트별로 안내하며 답변 전에 검사창을 닫지 않는다. 화면 사진이나 ‘정상’ 응답만으로 API 게이트를 통과시키지 않는다.

**수동 출처 연결의 한계:** extension API는 Chrome user-data-dir를 반환하지 않는다. 따라서 ID/version/hash가 맞는 JSON과 별도 파일/프로세스 근거만으로 profile 동일성을 자동 인증하지 않는다. 사용자가 정상 Chrome UI에서 지정 P09 profile 경로와 그 창의 대상 extension Inspect context를 확인하고 `profile-context=confirmed`로 기록해야 한다. 확인 가능한 정상 UI가 없으면 STOP이다. 이 사람의 context 확인은 API 값 비교와 분리하며 서명된/unattended attestation으로 표현하지 않는다. native 사전검증에서는 popup 한 문서만 사용하고 두 창 동기화·경합은 주장하지 않는다. B2와 공개 후 actual-update 수용의 두 client 검사는 별도다.

probe는 `chrome.runtime.id/getManifest()`, `chrome.permissions.getAll()`, `chrome.storage.local.get(['config','styles','styleParameters','settingsRevision'])`, `chrome.scripting.getRegisteredContentScripts({ids:['styles']})`와 고정 DOM control 조회만 한다. 저장·삭제·등록·reload·sendMessage·fetch·네트워크 요청을 하지 않는다. worker에서는 실제 `createSettingsBroker.toString()`의 SHA-256을 계산한다. expected 값은 `readPublishedPayload()`와 `brokerFunctionSource()`로 고정 ZIP의 broker에서 구한다. 사용자가 source를 직접 변경/재포장하지 않는다.

확장 popup/styles 페이지는 사용자가 원래 확장의 정상 UI 또는 같은 ID의 `popup.html`/`styles.html`을 직접 연다. 브라우저 도구의 차단 URL을 대신 열게 하는 방식으로 사용하지 않는다. worker probe는 worker context, UI probe는 해당 extension page의 DevTools context에서만 성공해야 한다. window/page가 없거나 pathname/ID/version이 다르면 FAIL이다.

## File Map / Interfaces

| 파일 | 책임 |
| --- | --- |
| Create `scripts/extension-e2e/native-preflight.mjs` | 고정 probe 생성·입력 schema·독립 native baseline/seed/UI/CSS 판정. 브라우저 실행/프로필 접근/파일 쓰기 없음 |
| Create `scripts/extension-e2e/native-preflight-contract.mjs` | 부작용 없는 stage/context/오류 코드 상수. fallible payload 초기화 전에 CLI 오류 경계를 구성 |
| Create `scripts/extension-e2e/native-profile.mjs` (Task2) | 고정 P09 설치/Developer mode/현재 root 사실의 read-only projection, 공개키 ID·52파일 검증. launch/쓰기/브라우저 제어 없음 |
| Create `scripts/check-native-preflight.mjs` | `--prepare`로 새 private run/probe 생성, `--check=<stage>`로 단계 판정, 승인 뒤 `--inspect-native`로 좁은 사실 조회, `--record`로 고정 outcome 기록. native 실행/프로필 쓰기 없음 |
| Create `tests/native-preflight.test.cjs` | VM/JSDOM에서 생성된 **실제 probe** 실행·읽기 전용 호출 대조·literal oracle·오류/혼합 증거 negative |
| Create `tests/native-preflight-runner.test.cjs` | owned 경로·입력 크기·frozen baseline·설치 출처 projection·실패/cleanup·증거 ledger 검사; 실제 프로필 대신 owned fixture |
| Create `tests/native-preflight-fixture.cjs` | 두 test 파일의 hand-checked literal 관측/순차 outcome 입력. 제품 helper를 기대값 생성기로 사용하지 않음 |
| Create `tests/native-profile.test.cjs` (Task2) | fixed-path owned 설치 fixture와 synthetic CIM provider에서 실행하는 실제 PowerShell 조회. native 원본 profile/process 미사용 |
| Modify `docs/superpowers/validation/2026-10-13-af05b-native-preflight.md`, `PLANS.md` | 리뷰·승인·실행 결과와 한계, 완료/미실행 체크박스 |

기존 `readPublishedPayload()`, `PUBLISHED_PAYLOAD_BASELINE`, `brokerFunctionSource(source)`, `openOwnedRoot()`를 사용한다. 기존 B2 launch/Developer mode helper는 bundled fixture 전용이므로 native 프로필에 재사용하지 않는다. package scripts/CI/제품 manifest·settings·build 입력은 변경하지 않는다. 이 검사는 native 수동 관측용이며 CI가 native PASS를 생산하지 않는다.

신규 함수:

- `createNativePreflightProbe({runNonce, stage, context, baseline}) -> string`: nonce는32자리 hex, stage=`baseline|seeded|cold`, context=`worker-before|worker-after|popup|styles`. baseline은 고정 ZIP의 허용 ID·expected broker hash다. 결과는 `{schema:1, runNonce, stage, context, capturedAt, outcome, code, identity, observation}`. 성공은 outcome=`observed`/code=null; 실패는 outcome=`failed`/고정 오류 코드/identity=null/observation=null이다. 원시 예외 message/stack/부분 성공 object를 출력하지 않는다.
- `assertNativePreflight(evidence, baseline, through) -> {status, complete}`: evidence=`{observations,events,nativeFacts}`, through=`baseline|seeded|complete`. 정확히4→8→12개 관측과 그 단계까지의 journal/native facts를 검사한다. 앞 두 성공은 `STAGE-ACCEPTED`/complete=false, 전체 마감 성공만 `NATIVE-PREFLIGHT-PASS`/complete=true다. identity·raw presence/type/value·UI/CSS 실패 표시·등록·코드 해시·전후 안정성을 비교하며 기대값을 성공 관측에서 복사하지 않는다.
- `executeNativePreflight(args, dependencies={}) -> Promise<summary>`: CLI parser·owned IO·좁은 native 사실 조회만 외부 경계로 주입한다. CLI는 `--prepare`, `--check=<baseline|seeded|complete>`, `--inspect-native=<before|closed|restarted|after>`, `--record=<event>` 중 하나와 `--run-id=<alnum1..64>`를 허용한다. record만 `--status=<requested|confirmed|failed|unknown>` 및 실패용 고정 code를 받는다. prepare/check/record는 native profile/process를 조회하지 않는다. inspect-native만 Task2 별도 실행 승인 대상이다. 사용자 지정 profile/URL/임의 input path 옵션은 없다.

**고정 outcome 계약:** `events/<ordinal>.json`에 `{schema:1,runNonce,ordinal,event,recordedAt,status,code}`를 no-overwrite로 남긴다. event는 `profile-context`, `seed-start`, `probe:<stage>:<context>`, `abort`, `finalize` 및 CLI 자동 생성 `inspection:<phase>`, `check:<stage>`뿐이다. probe는 사용자에게 실행을 안내하기 **전** requested event를 기록하고, 같은 요청에 대응하는 observed/failed JSON 하나만 받는다. 중단/응답 부재는 unknown/abort로 남긴다. checker가 본 probe/API/parse/timeout 오류는 고정 code의 failed check event로 남긴다. 첫 failed/unknown/abort가 있으면 이후 정상 JSON/후속 check가 있어도 이 run의 최종 PASS를 금지한다.

**오류 기록 내구성 보완:** 기존 run의 fallible dependency 초기화/관측 입력 처리 전 `attempts/<ordinal>.json` intent를 배타적으로 쓰고, 결과는 별도 `-result.json`에 no-overwrite로 쓴다. failed 또는 미완료 intent는 이후 재시도를 차단한다. 이 결과 기록은 성공 journal의 monotonic 시각 검사에 의존하지 않는다. 따라서 시계 역전이나 주 오류/추가 오류 기록 실패 뒤 시계·IO가 회복돼도 같은 run이 PASS로 바뀌지 않는다. intent 자체를 쓰지 못하면 해당 작업에 진입하지 않는다. 준비 중 실패 run은 불완전한 그대로 보존하고 재사용하지 않는다.

probe 실패 code는 `native-context-invalid`, `native-read-failed`, `native-timeout`, `native-data-invalid`, `native-crypto-unavailable`, `native-ui-failed` 중 하나다. CLI 실패 code는 `native-evidence-invalid`, `native-sequence-invalid`, `native-source-changed`, `native-user-aborted`, `native-unavailable`, `native-finalization-failed`, `native-owned-io-failed`로 한정한다. known 외 예외는 generic failure code로 매핑하며 원래 exception text를 journal에 넣지 않는다. 실패 event를 쓸 수 없는 IO 오류도 nonzero이며, event 부재로 다음 check가 PASS하지 않도록 요청/마감 completeness를 검사한다.

prepare→before→profile-context→baseline 요청/관측/check→seed-start→seeded 요청/관측/check→closed→restarted→cold 요청/관측→after→finalize→complete check 순서를 ordinal로 고정한다. 각 단계의 worker-before→popup→styles→worker-after 및 request.recordedAt≤capturedAt≤ingest recordedAt을 검사한다. closed는 마지막 seeded 관측 뒤, restarted는 closed 뒤, cold는 restarted 뒤여야 한다. 시각 누락/역전/시계 변경은 실패이며 추정으로 재정렬하지 않는다. finalize의 confirmed는 Inspect 닫기·Developer mode 원상태·지정 창 종료·승인된 seed 유지가 모두 확인됐다는 수동 outcome이다. after 사실의 Developer mode/target process 부재와도 대조한다. 수동 outcome의 진실성을 암호학적으로 증명하지 않으며, 제출되지 않은 실행/숨겨진 실패를 자동 발견한다고 주장하지 않는다.

native facts는 `{schema:1,runNonce,phase,capturedAt,profileIdentity,installation,developerMode,process}`다. profileIdentity는 고정 P09 경로의 resolved identity 해시이며 before/restarted/after가 같아야 한다. installation은 target ID/version/fromWebstore/disableReasons/permissions/origins 및 일반 file name/hash inventory projection이다. before/after 내용이 같고 frozen 기준에 맞아야 한다. developerMode는 좁은 test-profile preference의 boolean, after는 before와 같아야 한다. process는 조회 성공 여부와 exact target browser root의 `{pid,startedAt}` 또는 null만 내보낸다. before/restarted는 유일한 root, closed/after는 조회 성공+root 없음이어야 한다. 재시작은 새 start time과 closed 뒤의 시각을 요구한다. 원시 command line/전체 Preferences를 artifact로 만들지 않는다.

worker identity는 ID·숫자 version·display version·MV3·background file·현재 승인 권한과 broker function hash를 포함한다. UI identity는 같은 ID/version과 정확한 pathname이다. permission/origin 집합은 순서에 무관하게 `scripting, storage`와 `https://chzzk.naver.com/*`만 허용한다. [getRegisteredContentScripts](https://developer.chrome.com/docs/extensions/reference/api/scripting) 결과의 `id/css/matches/runAt/js`만 내보내며 불필요한 metadata는 받지 않는다.

## Review Focus

1. 다른 프로필·같은 번호의 다른 코드·다른 extension page: 코드 hash와 별도 수동 profile/context 확인을 요구하며 자동 profile 인증으로 합산하지 않는다(Task1 identity/context-confirmation negative, Task2 좁은 출처 대조).
2. Inspector가 worker를 살려 둔 경우: 모든 inspector와 해당 검사용 Chrome을 닫은 사실을 별도로 확인하고, 확인 없이 cold PASS를 내지 않는다(Task2 lifecycle negative).
3. UI는 ready지만 저장·CSS가 지연/실패한 경우: worker-before/after와 각 UI의 완료·값 및 retry/discard 표시를 대조하고 stale/failed/missing은 FAIL이다(Task1 stale/individual control/CSS-failed-ready negative).
4. 원래 raw 값이 absent인데 UI 복원으로 explicit default가 남는 경우: 완전 복원을 약속하지 않고 empty baseline만 승인된 seed로 바꿔 보존한다. 예상 외 기존 설정이면 삭제 없이 STOP한다(Task1 nonempty/own-key negative).
5. 개인/unknown 값·나중에 생긴 error·관측 timeout/사용자 중단: 값을 내보내지 않고 journal의 첫 실패를 유지한다. **seed 전 실패만** 새 run 재시도 가능하다. seed-start 이후 실패는 현 상태를 보존하고 별도 재개 계획/승인을 기다린다(Task1 privacy/journal negative, Task2 bounded/post-seed-stop negative).

## Task 1: Local probes and fail-closed evidence checker

**Files:** 위 신규 `.mjs`3개·test2개·공통 fixture. **Produces:** `createNativePreflightProbe`, `assertNativePreflight`, `executeNativePreflight`와 새 private run의 `manifest.json`/probe text. **Consumes:** 고정 ZIP reader·broker function parser·owned-files. 이 Task는 native 프로필 IO/launch를 실행하지 않는다.

- [x] **Step1 / RED:** `tests/native-preflight.test.cjs`에 다음 literal assertion을 작성한다. 존재하지 않는 export 때문에 실패하는 것을 확인한다: `node --test tests/native-preflight.test.cjs`.
  - `baseline is absent, not normalized defaults`: raw 네 키 모두 absent(관측 sentinel `{present:false}`), UI arrowtrue/volume5/rankingfalse/font0·ready/enabled·discard hidden, styles retry hidden/popup retry 없음(null), CSS 등록[]; baseline의 `{config:{}}`, revision0 explicit 또는 다른 기존 값도 STOP한다.
  - `seeded and cold keep the exact raw write`: raw config=`{arrowSeek:false,previewVolume:25}`, styles=`['hide-ranking','chat-font-size']`, parameters=`{'chat-font-size':8}`, revision R은safe integer이며4 이상. UI false/25/true/8, 각 control enabled/phase ready. styles 등록 하나: id styles·CSS `styles/chat-font-size.css`,`styles/hide-ranking.css` 순서·matches chzzk·document_start·JS[]. raw styles는 수정 순서, CSS는 frozen schema 순서다. seeded의 R을 고정해 cold에서 정확히 같아야 한다. 수동 range 입력은 여러 input event를 만들 수 있어 revision4만 강제하지 않는다.
  - `real probes make no writes`: 생성 string을 VM/JSDOM에서 실행해 위 결과 확인. set/remove/clear/runtime.reload/sendMessage/fetch/register/update/unregister 호출은 모두 throwing spy, 호출0. worker에서만 broker hash와 storage/permission/CSS read를 허용한다. unknown context/API reject/timeout은 failed JSON·고정 code이며 secret exception message가 없어야 한다.
  - `one bad observation vetoes all`: 잘못된 ID/숫자 version/display version/worker hash/page pathname·다른 nonce·중복/missing stage-context·nonempty baseline·own key absent vs explicit·wrong type·revision3/NaN/unsafe·seeded/cold revision 불일치·CSS 누락/추가 JS·한 control만 disabled·pending/unknown/failed phase·stale UI·before/after 차이는 각각 throw한다.
  - `css failure is not UI ready`: frozen styles UI에서 첫 CSS 조회를 reject시켜 phase ready/등록[]지만 retry visible인 실제 fixture를 만든다. worker registration이 맞아도 실패여야 한다. styles retry·각 화면 discard visible/필수 node missing도 veto한다. frozen popup HTML/scripts의 정상 baseline/seeded probe를 실제 실행하며 없는 retry node를 요구하지 않는다.
  - `unknown raw values are never exported`: known config/style/parameter allowlist는 frozen ZIP schema에서 가져온다. unknown 또는 비정상 값이면 fixed code만 반환하고 secret sentinel이 JSON/오류에 없음을 assert한다. storage.get(null), 탭 조회, 계정/쿠키 조회는 허용하지 않는다.
- [x] **Step2 / 최소 구현:** `native-preflight.mjs`에 위 함수/JSDoc 계약을 구현한다. 네 키의 presence와 value를 구분한다. 각 API15s 제한, read/timeout/crypto 실패는 failed envelope, 성공 fallback 없음. UI는 `#settings-status[data-phase]`, popup의 `#arrowSeek/#previewVolume`, styles의 `#hide-ranking/#chat-font-size`와 각 화면의 `#settings-discard`를 읽는다. discard는 필수이며 hidden=true, styles의 retry도 필수/hidden=true다. frozen popup에는 retry가 없어 `retryHidden:null`로 구분한다. 같은 stage raw/revision/CSS 등록 안정성을 확인한다.
- [x] **Step3 / CLI RED:** `tests/native-preflight-runner.test.cjs`에 fresh run·4→8→12 정상 CLI 진행(STAGE-ACCEPTED→STAGE-ACCEPTED→최종 PASS)을 작성한다. 기존 run 재사용·link/escape·잘못된 runId·missing/wrong ZIP·1MiB 초과·필수 단계 하나 누락·parse 실패·출처 mismatch·first failure 뒤 성공/cleanup failure·ordinal/time 역전·finalize unknown·post-check source drift는 각각 nonzero여야 한다. 이전 단계 합격이 최종 PASS를 만들면 실패한다. 검토 보완의 clock 회복/이중 IO 오류/startup metadata/쓰기 전 크기 제한도 RED를 확인했다.
- [x] **Step4 / 최소 CLI:** prepare는 fresh owned run·32hex nonce·frozen ZIP 해시/예상 broker hash와12개 probe를 쓴다. source input은 신규 helper/CLI/순수 contract와 재사용 published-payload/transition-scenario/fixture-router/owned-files 및 frozen metadata JSON, 총8개 name/hash·Node version으로 고정하며 check 전후 같아야 한다. record/check는 고정 outcome과 durable attempt를 배타적 ordinal 파일에 기록하며 native profile/process는 조회하지 않는다. 각 JSON 최대1MiB·run artifact 합계16MiB·event/attempt 각각 최대64개, no overwrite. inspector JSON은 쓰기 전 크기와 고정 기록4KiB 여유를 대조한다. 오류는 최종 실패이며 불확실한 산출물은 보존한다.
- [x] **Step5 / GREEN·연결:** `node --test tests/native-preflight.test.cjs tests/native-preflight-runner.test.cjs tests/installed-transition-scenario.test.cjs tests/published-payload.test.cjs tests/owned-files.test.cjs`가 실패0이어야 한다. 생성 probe의 금지 call spy와 정상 frozen broker/DOM fixture를 연결했다. 제품 입력과 root dist 전후 해시 불변을 확인했다. 기존 감사 제외/skip 확대 없음. 실제 결과는 검증 기록 참조.
- [x] **Step6 / local commit:** 위 코드/테스트와 검증 기록만 로컬 commit. push/PR 없음. actual native PASS 없음. Task2 별도 실행 승인은 후속2026-10-13에 받았다.

## Task 2: Approved native observation and cold restart

**Files:** 같은 CLI와 내부 `native-profile.mjs` read 경계·runner/native-profile tests·검증 문서/PLANS. **Consumes:** Task1 준비 run/probe와 사용자 실행 승인. **Produces:** private native summary, `NATIVE-PREFLIGHT-PASS` 또는 실패/접근 대기, 승인된 seed baseline(다음 실제 업데이트용). 제품/공개 후보를 생산하지 않는다. source binding에 native reader를 추가해 현재 총9개 입력이며 실제 준비 run은 코드 고정 뒤 만든다.

- [x] **Step1 / RED:** 새 reader의 current target facts·HTML/extra runtime/추가 version·권한/key/preference/link·root prefix/renderer/duplicates/query failure/closed-negative를 owned fixture에 추가하고 missing module RED를 확인했다. 실제 PowerShell은 synthetic CIM provider로 실행해 조회 실패와 경로 `..`/구분자 정규화 RED→GREEN을 확인했다. Task1의 profile-context/user-report/첫 실패/seed 이후 abort negative는 그대로 재실행하며 중복 테스트를 만들지 않는다.
- [x] **Step2 / 좁은 출처 경계:** 승인 뒤 `--inspect-native=before|closed|restarted|after`만 고정 `Default/Extensions/<ID>/2.13.3_0/manifest.json`과 target 설치 기록을 read한다. Preferences/Secure Preferences container는 메모리에서 parse해 해당 ID의 from_webstore/version/disable_reasons/granted 권한만 projection한다. 전체 파일/다른 확장/다른 profile 내용은 출력·복사하지 않는다. 잘못된 JSON/복수 버전/record 부재/비-store/disabled/권한 차이는 STOP한다. Developer mode 저장 항목 absent는 [Chromium 기본값 false](https://chromium.googlesource.com/chromium/src/+/HEAD/components/policy/test/data/pref_mapping/ExtensionDeveloperModeSettings.json)를 사용하며 present null/다른 타입은 실패다. policy 허용이나 실제 UI 상태를 추정하는 근거는 아니다.
  - 설치 manifest 공개키의 ID는 Node crypto/해시로 계산해 target ID와 대조한다. runtime MV3/version/background/permissions와 설치 manifest 및 P09 고정 근거를 연결한다. manifest 공개키는 서명 검증 근거라고 부르지 않는다.
  - 고정 ZIP58개 중 manifest/locale2개/icon3개를 제외한 **52개 일반 파일 모두** 설치 SHA-256이 같아야 한다. JS/CSS46개뿐 아니라 HTML3개와 나머지 게시 resource/라이선스도 포함한다. 허용 file inventory는 frozen58개와 `_metadata/verified_contents.json`, `_metadata/computed_hashes.json`만이며 extra/missing/link/추가 runtime 파일은 실패다. manifest는 key/update_url 외 object, locale2개는 parsed object가 같아야 한다. P09의 icon 설치 정규화/Chrome metadata 예외는 명시적으로 유지하되 이번 검사로 아이콘 pixels나 독립 CRX 서명 인증을 다시 완료했다고 주장하지 않는다. 설치 파일은 쓰지 않는다.
  - 필요한 from_webstore 경로가 현재 설치 container와 다르면 다른 개인 파일을 탐색하지 말고 STOP/계획 변경으로 처리한다. 실제 프로필 대상 접근과 설치 IO는 CLI 전체 유닛 테스트에서 owned fixture로 대체한다.
- [x] **Step3 / GREEN·출처만 확인:** d9866c2 focused123/123·전체1186중1185pass/0fail/기존skip1·foundation9·새 lint0, Astra max Critical0/Important0/Minor0 후 승인된 정확한 P09 Chrome만 일반 방식으로 열었다. `P09Native20261013A`의 `--inspect-native=before`로 현재2.13.3/fromWebstore/공개키ID/정확한60 inventory·52파일/권한·Developer mode 원상태 false·유일한 target root를 기록했다. 로그인·동기화·방송/계정 탐색·제어 연결 없음. 이것은 runtime/API native PASS가 아니다. 다음은 사용자의 정상 UI profile/context 및 Console 준비 확인이다.
- [ ] **Step4 / baseline(4 JSON):** profile/context 수동 확인과 각 probe requested event 뒤 worker-before → popup → styles → worker-after를 받는다. `--check=baseline`의 STAGE-ACCEPTED만 다음 단계 진입을 허용한다. raw 네 키 absent·UI default·ready·discard hidden·styles retry hidden/popup retry 없음(null)·CSS[]와 current identity를 확인한다. 존재하는 값은 없애지 않고 STOP한다. partial 판정은 native PASS가 아니다.
- [ ] **Step5 / seeded(4 JSON):** seed-start confirmed event를 **저장 조작 전** 기록한다. 같은 popup에서 방향키 OFF·volume25, styles에서 hide-ranking ON·font8을 순서대로 변경하며 각 저장을 기다린다. 마지막 raw 네 값 literal·revision R safe/4 이상·before/after 동일을 요구한다. worker-before → popup → styles → worker-after 뒤 `--check=seeded` STAGE-ACCEPTED를 요구한다. 동기화/경합은 이 단계 판정이 아니다. target 없는 reload 버튼을 누르지 않고 실제 페이지 적용을 흉내 내지 않는다.
- [ ] **Step6 / cold(4 JSON):** 모든 Inspect/popup/styles와 **검사용 프로필의 창만** 사용자에게 닫도록 요청한다. `--inspect-native=closed`는 before에서 특정된 정확한 user-data-dir의 Chrome browser root process 부재를 좁은 process metadata로 확인할 수 있을 때만 `closedObserved=true`를 기록한다. unrelated 탭/명령행을 출력하지 않는다. launcher PID 종료만으로 browser 종료를 추정하지 않는다. before의 root identity/조회 권한을 확보하지 못하면 `cold=UNVERIFIED`로 남긴다. 다른 Chrome 전체 kill 금지.
  - 같은 profile을 일반 방식으로 재시작해 `--inspect-native=restarted`로 새 browser root identity/start time과 관측 시각을 연결한다. worker-before → popup → styles → worker-after. 저장/CSS/UI가 seeded와 같고 profile/source가 같아야 한다. inspector 재연결은 그 이후 수명만 연장하며 자동 suspension 시험으로 표시하지 않는다. 프로세스 조회는 기존 PowerShell `Get-CimInstance Win32_Process`의 Chrome browser root(no --type)·parsed user-data-dir의 resolved path **정확한 일치**와 좁은 PID/start-time projection만 사용한다. 경로 prefix/launcher PID만 같음/복수 root는 실패하는 fixture를 추가하며 launcher/control API를 만들지 않는다.
- [ ] **Step7 / 마감·보존:** inspector를 닫고 Developer mode를 이전 정상 UI 상태로 복원한 뒤 지정 창만 종료한다. seed/revision R은 승인된 다음 업데이트 baseline으로 남긴다. 실패 시 raw 재주입/삭제/재설치로 수리하지 않고 abort/부분 변경을 기록한다. **seed-start 이후 실패는 새 absent-baseline run으로 자동 재시도하지 않으며, 현 상태 보존과 별도 재개 계획 승인 대기**다. `--inspect-native=after`로 같은 설치 파일·target 권한·Developer mode 원상태·target root process 부재를 확인한 뒤 finalize confirmed/failed/unknown을 남긴다.
- [ ] **Step8 / 최종 판정·local commit:** `--check=complete`에서12개 JSON·nonce·current 설치/실행 출처·수동 context 확인·각 단계 안정성·journal 순서·첫 실패·cold/마감 사실을 함께 대조한다. 단일 누락/불명/오류라도 native PASS 금지. private report와 public-safe 문서를 분리하며 native 자료/개인 값은 Git에 넣지 않는다. whole-scope Astra max 품질 검토 뒤 로컬 commit, push/PR 없음.

## 전체 종료·다음 게이트

- [x] 계획·Task1 로컬 구현/검증 승인 및 기존 Native 방식 유지.
- [x] Task1 구현/로컬 검사 완료. native는 아직 미실행.
- [x] 기존 P09 검사용 프로필에 한정한 Task2 실행 묶음 승인2026-10-13. 실제 스토어 설치/업데이트 승인은 별도.
- [ ] native preflight PASS와 승인된 seed baseline 고정. 실패/미검증이면 version/스토어 제출/게시 대기.
- [ ] AF05-B 전체 목록의 잔여 공개 게이트를 대조하고 공개 전 로컬 준비와 공개 후 수용의 경계를 사용자에게 확인. **현재 ‘전체 완료 전 push/PR 금지’를 공개 후 실제 update 완료 전 조건으로 해석하면 순환하므로, 임의로 PR 가능으로 완화하지 않는다.** 후속 공개 시점 결정을 받을 때 이 범위를 명시한다.
- [ ] 그 이후에만 공개 version·단일 한글 PR/push·CI/병합·스토어 upload/심사/수동 게시 각 승인을 확인한다. 지금 구체적인 차기 번호·출시일을 정하지 않는다.
- [ ] 게시 후의 실제2.13.3→후보 업데이트/신규 설치·열린 페이지/MAIN·대상 reload·context invalidation 오류 수용은 상위 AF05-B에 남긴다. 이번 baseline probe 결과로 닫지 않는다.

## 작성자 자체 대조

- [x] 상위 §2 수용 기준과 P09 소유권: 역사 미검증/미실행 구분, 차기 실제 업데이트는 AF05-B 소유.
- [x] §3·6 경로/출처·version·공개 승인·private 증거: Task1/2와 전역 경계에 매핑. native CI 자동 PASS 없음.
- [x] §7 runtime/seeded raw/UI/CSS 관측: Task1 literal/probe tests와 Task2 실제 JSON으로 매핑. 정책/접근 부재는 STOP이며 현재 경로 확보를 주장하지 않음.
- [x] §9 승인·완료: 계획/구현/native 변경/public/post-public를 분리. push/PR 순환 경계는 미결정으로 명시.
- [x] 다섯 Review Focus 각각 owning task negative에 연결. 고정 함수명/12개 stage-context/단계4→8→12/seed4개/revision R 일치, CSS frozen schema 순서 대조. 신규 제품 기능·일반 profile controller·배포 framework 없음.

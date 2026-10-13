# AF05-B2 — 격리 설치본 코드 전환·복귀 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this approved Native plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 사용자2026-10-13 B2 설계·Native 구현/격리검증·최종 Astra max 묶음 승인. 중간 push·PR과 제품 배포는 하지 않는다.

**Goal:** 게시 전체 payload와 후보를 같은 private Chromium profile/개발용 ID에서 old→new→old로 실행해 실제 raw 저장·구/새 UI·CSS 보존과 저장 손실 negative 탐지를 증명한다.

**Architecture:** 고정 hash/offset table로 공개 ZIP58파일만 읽고 기존 후보 builder·owned-files·Chromium harness·fixture-router를 재사용한다. 별도 순수 oracle/설치 phase와 단일 supervised runner를 추가한다. 기존 E2E의 storage repair 재주입 시나리오는 연속 전환에 호출하지 않는다.

**Tech Stack:** Node24.19.0, built-in crypto/zlib/child_process, 현재 Playwright1.62.1, node:test, 기존 JS/JSDoc 도구. 제품 TS/JS·의존성·버전은 변경하지 않는다.

**Spec:** [AF05-B2 상세 설계](../specs/2026-10-12-af05b2-installed-transition-design.md). 상위 [AF05-B 수용 설계](../specs/2026-10-12-af05b-release-acceptance-design.md)의 native/공개/waiver 게이트는 별도다.

## Global Constraints

- 2026-10-13 복귀 기준 main `6b919e1c62661ec49a12ce6df2c02e11273af41d`. 현재 foundation9·settings fixture 계약을 유지한다. B2 구현/Native 실행 묶음은 승인됐으며 AF05-B 전체 완료 전 중간 push·Task/B2/문서 PR은 하지 않는다. 최종 단일 한글 PR의 공개·CI·통합 승인과 실제 배포 승인은 구분한다.
- 제품 version2.13.3 유지. package/lock/manifest·제품 TS/생성 JS·권한·root dist·원본 ZIP/CRX·시청/native 기준 profile·frozen 자료에 쓰지 않는다.
- 고정 원본 ZIP201802bytes/SHA `67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`,58파일/raw599793bytes. private file·최신 release·current source fallback/skip 없음.
- 공개 JSON metadata의 canonical hash `669cc7f64599e748f4d3ec86e45472786cf331e4a0b207914619a03f849a652c`; ordinal `[name,sha256]` 목록 hash `a7a23d74b79132479b53d80b3cac2d71ab89a3cdb15b68cdda81732e6064ddd2`. localeCompare를 쓰지 않는다.
- archive1MiB·entry raw1MiB·합계2MiB·metadata64KiB. 검증→해제→hash→owned write 순서를 지킨다. 일반 ZIP parser/새 dependency/새 외부 account/브라우저 정책 우회 없음.
- 새 root의 고정 profile/extension 경로·같은 worker ID, 초기 seed1회 후 실제 UI 저장만. profile 복사/초기화/uninstall/repair 재주입 금지.
- private 복사본 T=`2.13.4`, R=`2.13.5`; version_name=`AF05-B2 TEST ONLY new|rollback`. 시험값에도 기존 세 자리 형식을 유지한다(사용자2026-10-13 지시). 원본 manifest bytes 불변, 변형 manifest는 두 값만 clone/canonical JSON으로 변경. 제품/출시 번호 확정이나 스토어 제출용 아님.
- wait15초/phase120초/close10초/CLI600초/kill 확인5초. 실패와 cleanup 실패를 PASS·negative 탐지로 바꾸지 않는다.
- launch-intent/parent ACK 후에만 browser launch. 성공한 context.close만 close-success ACK다. runner exit로 detached Chromium 종료를 추정하지 않고 미확인root는보존·cleanup-unconfirmed/nonzero로남긴다.
- root dist에서 build하지 않는다. code checkpoint를 commit한 후 clean tracked clone에서 실제 전체 게이트를 실행한다. 별도 새 GPT security scan은 실행하지 않는다.
- 신규 문서·보고·승인 질문은 한국어 또는 영어. 새 개발 도구의 단언/상한·guarded 경고는 현재 tool run으로 확인하며 rule/suppression을 완화하지 않는다.

## Review Focus

1. 물리 manifest만 바뀌고 이전 worker/혼합 JS가 실행되는 경우: 모든 phase의 전체 hash·실제 broker function provenance를 요구. Task2/3 반례.
2. 같은 ID처럼 보여도 profile reset/seed 재주입/unknown 손실이 숨는 경우: runNonce·raw literal·seed 호출1회·negative 실제 제거로 거부. Task2/3.
3. 손상 revision/legacy cleanup을 일반 ready/무삭제로 취급하는 경우: 5case의 독립 expected state·repair 제한 상태·반복 migration no-op. Task2.
4. browser close/부분 준비/child timeout/cleanup 실패 후 교체나 PASS가 이어지는 경우: supervisor와 순서/소유권/fault 테스트. Task3.
5. 원본 취득/metadata 변경/네트워크/trace 자료가 fallback·무제한·개인 profile 접근으로 확장되는 경우: fixed hash 우선·offset table/크기·고정 CLI·upload 범위 반례. Task1/3.

## 파일 책임·인터페이스

새 파일은 아래 세 작업의 deliverable만 만든다. 기존 product/helper를 임의로 분리하지 않는다.

- `scripts/extension-e2e/published-payload.mjs`: 고정 ZIP 취득/reader/cache 검증, 일반 archive 기능 없음.
- `tests/fixtures/installed-extension/published-payload.json`: 위 JSON58행, 공개 원본 metadata만.
- `scripts/extension-e2e/transition-scenario.mjs`: case seed/expected raw·순수 oracle·실제 phase UI/CSS/MAIN/broker 관측. browser/profile/파일 수명은 소유하지 않음.
- `scripts/check-installed-transition.mjs`: positive/control CLI, child supervisor, 후보/고정 설치 복사/phase 수명·보고·cleanup.
- 세 대응 `.test.cjs` 파일; `.github/workflows/ci.yml`의 verify preparation·positive/negative 명령; 실행 후 validation/PLANS.

공통 JSDoc 계약:

- `PayloadEntry = {name:string,bytes:Buffer,sha256:string}`; `Payload = {entries:readonly PayloadEntry[],inventorySha256:string}`. bytes는 불변 type/객체를 가장하지 않으며 새 호출마다 독립 Buffer다.
- `Phase = 'old'|'new'|'rollback'`; `CaseId = 'valid-ui'|'legacy-valid'|'legacy-null'|'legacy-invalid'|'damaged-revision'`.
- `TransitionStep = 'startup'|'arrow-off'|'volume25'|'hide-ranking-on'|'font8'|'two-popup-merge'|'font0'|'volume26'|'rollback-font8'|'rollback-font0'`. startup은 모든case/phase, 나머지는 spec§5 valid-ui의 해당phase/순서만 허용하고 잘못된 조합은 거부한다.
- `PhaseObservation = {raw:object,ui:object,css:object,runtime:object,execution:{extensionId:string,version:string,brokerMatches:boolean}}`. trace/절대 개인 경로/쿠키는 넣지 않음.
- `TransitionFailure = {code:string,caseId:CaseId|null,phase:'seed'|Phase|null,step:TransitionStep|'prepare'|'seed'|'launch'|'prelaunch'|'postclose'|'close'|'replace'|'report'|null,stage:'prepare'|'seed'|'old-init'|'candidate-init'|'rollback-init'|'phase-action'|'launch'|'inventory'|'close'|'replace'|'cleanup'|'report',observation?:PhaseObservation,cleanupErrors:readonly {code:string,caseId:CaseId|null,phase:'seed'|Phase|null}[]}`. Task2가 이미 얻은 observation을 error.failure에 붙여 throw, child가 bounded record로 IPC 전송, parent가 첫failure를유지하며cleanupErrors를추가한다. code240자/cleanupErrors32개/summary1MiB 상한과검사용raw만유지한다. phase startup의stage는 old-init/candidate-init/rollback-init로고정하며UI추가조작은phase-action이다.
- IPC `launch-intent/launch-ack/close-success/failure/result`는 runNonce·caseId·phase·launchId·owned relative root를검증한다. intent마다exact close-success1개, 중복/잘못된ack/child exit 전미응답을거부한다. parent가관측기록을받기전에child종료하면정상/control PASS가아니다.

### Task 1: 고정58파일 reader와 preparation

**Files:** Create `scripts/extension-e2e/published-payload.mjs`, `tests/fixtures/installed-extension/published-payload.json`, `tests/published-payload.test.cjs`. Modify `.github/workflows/ci.yml`의 fixed Git fetch 다음 preparation step만.

**Interfaces:** Produces `readPublishedPayloadZip(bytes:Buffer): Payload`, `readPublishedPayload(): Promise<Payload>`, `preparePublishedPayload(): Promise<void>`, frozen `PUBLISHED_PAYLOAD_BASELINE`. reader는 고정 cache를 읽기만 하며 준비는 CLI `node scripts/extension-e2e/published-payload.mjs --prepare` 한 모드만 허용한다. Task2/3이 readPublishedPayload를 소비한다.

- [ ] **Step 1 — provenance/negative 테스트 작성:** 고정 metadata fixture의58행·canonical hash·offset/크기·경로를 assert하고 reader 결과58파일/ordinal inventory·config published hash/B1 four outputs·manifest2.13.3·총599793bytes를 검사한다. original input byte 불변과 두 호출 Buffer 독립성도 assert한다. 길이201801/201803·1MiB 초과·non-Buffer·one-bit ZIP mutation은 inflate/write 전에 `published-payload-input|size|hash`로 실패한다. cache 부재·손상에 fallback/network 호출0, metadata 변형/중복/case alias/offset overflow/겹침은 `published-payload-metadata`다. 준비 dependency stub은 timeout·redirect5/비HTTPS/다른host·stream1MiB 초과·wrong hash·existing wrong cache에서 실패하고 existing cache를 overwrite하지 않으며 partial owned 경로만 정리함을 검사한다. invalid payload 해제로 경로 공격을 재현하는 일반 parser 시험은 만들지 않는다; exact hash가 우선 거부함을 시험한다.

```js
assert.equal(result.entries.length, 58);
assert.equal(result.inventorySha256, 'a7a23d74b79132479b53d80b3cac2d71ab89a3cdb15b68cdda81732e6064ddd2');
assert.equal(result.entries.reduce((n,e)=>n+e.bytes.length,0),599793);
assert.notStrictEqual(first.entries[0].bytes, second.entries[0].bytes);
assert.equal(await readAttemptsAfterCorruptCache(), 1); // no source substitution
```

- [ ] **Step 2 — RED 실행:** `node --test tests/published-payload.test.cjs`. Expected: 신규 module/metadata 부재로 실패. 준비 경로/cache 부재 때문에 provenance positive만 실패하는 상태는 구현 RED의 대체가 아님.
- [ ] **Step 3 — 최소 reader/prepare 구현:** 메타데이터는 고정 공개 ZIP을 읽기 전용 검사한 offset58행으로 작성하고 두 고정hash로 검증한다. Node built-in crypto/zlib·owned-files만 사용한다. full ZIP hash 전에 metadata 기반 경로/해제/쓰기를 수행하지 않는다. 준비는 anonymous Node fetch의 수동 redirect 검증과 stream cap·AbortSignal timeout, 새 partial directory를 사용한다. 기존 valid cache는 재검증 후 재사용한다. 준비 dependency 입력은 테스트용 내장 default 함수 교체만 가능하며 CLI에서 URL/파일/profile/hash override를 받지 않는다. frozen baseline은 metadata·상한을 한 곳에 정의한다.
- [ ] **Step 4 — GREEN/연결:** `node scripts/extension-e2e/published-payload.mjs --prepare` 후 `node --test tests/published-payload.test.cjs tests/published-settings-baseline.test.cjs tests/settings-compatibility.test.cjs`. Expected: 실패/새skip0, 고정 source 대조 통과. fixed metadata 생성에 사용한 원본/hash/명령을 validation에 기록한다. verify CI에서 same prepare를 Run tests 앞에 추가; foundation과 기존 Git fetch 유지.
- [ ] **Step 5 — commit:** Task1 reader/metadata/tests/CI만 `git add ...`, `git commit -m "test: pin complete published payload for installed transitions"`. 보호 파일/version hash 불변 확인.

### Task 2: 실제 phase와 독립 저장/UI/CSS oracle

**Files:** Create `scripts/extension-e2e/transition-scenario.mjs`, `tests/installed-transition-scenario.test.cjs`. Existing `check-installed-extension.mjs`, packaged old/new UI는 변경하지 않음.

**Interfaces:** Consumes Task1 `Payload`. Produces `transitionSeed(caseId:CaseId,runNonce:string): object`, `expectedTransitionRaw(caseId:CaseId,phase:Phase,step:TransitionStep,runNonce:string): object`, `assertTransitionState(actual:PhaseObservation,expected:PhaseObservation): void`, `runTransitionPhase({context,worker,extensionId,responses,caseId,phase,runNonce,expectedBrokerSource}: object): Promise<PhaseObservation>`. seed phase의 storage set은 runner가 한 번 소유하고 이 phase 함수는 직접 storage 쓰기/repair를 하지 않음.

- [ ] **Step 1 — 독립 oracle/phase 테스트 작성:** spec§5의 seed와 모든 revision·unknown·nonce·raw styles/parameter를 literal로 assert한다. generated expected를 자신과 비교하는 테스트는 금지다. valid old8→new11→rollback14, legacy-valid5·t삭제·resizeChat삭제, null/invalid cleanup-only4, damaged raw revision/unknown 불변·UI repair-required/control disabled·CSS 없음과 **MAIN ready/normalized config**를 고정한다. damaged MAIN brightness1.25/arrowSeek=true/previewVolume5·unknown config 비노출을assert하고 known defaults는B1의고정게시schema와대조한다. CSS files/matches/runAt/js·font px·타겟loads만+1·MAIN config/bridge metadata를 각각 assert한다. broker function 불일치·ID 변경·unknown/nonce 손실·revision reset·font0 raw 제거·두 번째 tab reload·UI repair-ready 가장·MAIN timeout은 해당 preservation/execution/UI/CSS code로 실패해야 한다. actual observer가 보고한 값만 assertion에 전달하며 UI 작업 후 raw 변경 완료를 기다리는 것, concurrent patch 순서 무관/두값 보존, 타임아웃/worker 실패 전파를 fake page/worker 경계에서 시험한다. negative startup에서는expected값이아닌기본ready만기다려raw 손실이preservation code로도달함을확인한다. failed observation/code/case/phase/step/stage가error.failure에유지되는것과관측누락/틀린stage를검사한다.

```js
assert.deepEqual(raw.config, {futureFlag:'keep',brightness:1.25,arrowSeek:true,previewVolume:35});
assert.deepEqual(raw.styles, ['future-style','hide-ranking']);
assert.deepEqual(raw.styleParameters, {future:9,'chat-font-size':0});
assert.equal(raw.settingsRevision,11);
assert.equal(raw.futureTop.runNonce,nonce);
assert.throws(()=>assertTransitionState(lostRaw,expected),{code:'transition-storage-preservation'});
```

- [ ] **Step 2 — RED:** `node --test tests/installed-transition-scenario.test.cjs`. Expected: 신규 module/행동 부재 실패. 잘못된 literal 기대값 때문에 old/new 모두 실패하면 설계/입력부터 대조한다.
- [ ] **Step 3 — phase 구현:** 실제 packaged popup `#arrowSeek/#previewVolume`와 styles `#hide-ranking/#chat-font-size/#reload`만 조작한다. 두 popup의 ready와 동기화, Chrome storage/scripting/tabs API의 관측, fixture loads/style/MAIN symbol을 사용한다. 첫fixture tab metadata는두번째page를열기전에취득한다. broker provenance는 B1 `var createSettingsBroker = ` function expression 대조를 적용한다. 손상에서는UI repair-required와MAIN ready를분리한다. startup은provenance/기본ready→actual raw/UI/CSS/MAIN→oracle 순서다. field값일치를먼저기다리거나관측을기대값으로채우지않는다. 이미얻은observation을실패contract에붙이고case/phase/startup별stage를고정한다. default wait15초, phase전체120초, case/phase/expected 분기를 명시한다. pending 허용이나 storage snapshot restore 경로 없음. fixture requests3개만 fulfill·기타abort·WebSocketclose·pageerror32개상한을 유지한다. phase가 소유하지 않는 context/profile을 cleanup하지 않는다.
- [ ] **Step 4 — GREEN:** `node --test tests/installed-transition-scenario.test.cjs tests/settings-compatibility.test.cjs tests/installed-extension-fixture.test.cjs tests/installed-extension-harness.test.cjs`. Expected: 실패/새skip0. Actual browser 연속 전환은 Task3의 별도 gate이며 모의 phase 성공을 설치 PASS로 쓰지 않는다.
- [ ] **Step 5 — commit:** Task2 source/test만 `git commit -m "test: define installed transition preservation oracles"`.

### Task 3: supervised runner·실제 positive/control·전체 게이트

**Files:** Create `scripts/check-installed-transition.mjs`, `tests/installed-transition-runner.test.cjs`. Modify `.github/workflows/ci.yml` verify에 positive/control 두 명령. Create `docs/superpowers/validation/2026-10-12-af05b2-installed-transition.md` 실행 기록, update `PLANS.md`. 새 npm script alias는 필요 없음.

**Interfaces:** Consumes Task1 readPublishedPayload, Task2 seed/oracle/runTransitionPhase, existing verifyCandidate/removeCandidate/owned-files/launchInstalledExtension/fixture-router. Produces `runInstalledTransition({runId:string,headed?:boolean,control?:'storage-loss',dependencies?:object}): Promise<object>` 및 고정 CLI. private child IPC는 parent-created root와 실행 옵션만 전달하며 사용자 임의 source/profile/extension path 인자를 받지 않는다. parent가 owned root·child·최종 report/cleanup을 소유하고 child는 실행한 context/phase를 소유한다. child 성공만으로 최종 ok:true를 쓰지 않는다.

- [ ] **Step 1 — runner faults/negative 테스트 작성:** fake dependencies의 순서 `prepare→candidate×2→freshRoot→launch-intent/ACK→seed UI-ready fence/empty recheck→seed once→close-success→old→close-success→replace→new→close-success→replace→rollback→close-success→cleanup→summary`를 assert한다. 전환마다 ID/profile/extension identity·prelaunch/postclose 전체hash를 검사하고 close 실패면 replace/new launch0이다. seed 호출1회, 후속 raw injection0. 준비/후보2차빌드/partial write/launch/trace/startup/case/close/report/cleanup 실패·child deadline/kill 실패·existing artifact/candidate/cache·소유경로 밖 요구·mixed rollback·source input 변경을 실패시키고 처음code와cleanupErrors를 모두 보존한다. Node-only fixture child가별도group의detached descendant를만든뒤exit/hang하는실제subprocess검사에서runner exit는browser close로판정하지않고affected root를보존/nonzero로끝내야한다. 테스트는자신이만든descendant PID를별도finally에서회수하고사용자process를조회/종료하지않는다. partial harness launch/내부close오류삼킴·close ACK전child exit·중복/다른launch ACK·result전exit·fake never-resolving child를각각검사한다. negative는exact code/case valid-ui/phase new/step startup/stage candidate-init과observation.raw의own config 삭제·old revision8/nonce·successful close/cleanup만받는다. 관측누락·틀린stage·remove 실패·provenance 실패·timeout·wrong worker·inventory는FAIL이다. marker0/복수도control-preparation FAIL로검사한다.
- [ ] **Step 2 — RED:** `node --test tests/installed-transition-runner.test.cjs`. Expected: 신규 runner/행동 부재 실패. 실제 Chromium 부재/네트워크 부재를 RED 근거로 삼지 않는다.
- [ ] **Step 3 — runner 구현:** Node child_process의 부모/동일 script child IPC로 deadline을 소유한다. parent가 새 root의 소유권을 먼저 확보하고 child에 고정 relative directories를 전달한다. child는harness호출전intent를보내parent ACK 후launch하고정상context.close 후에만close-success를전송한다. 최종PASS는모든intent의close-success·child정상exit·관측/result/cleanup/report까지확인한다. 정상 phase 종료 확인 후 whole-tree replace, phase별 expected manifest/inventory와 actual worker/case result를 기록한다. 세대별 marker/스토어 ID 강제 주입은 하지 않는다. 5case는 각각 fresh root/profile, positive 전체와 storage-loss control은 별도 fresh 결과다. control은spec§6의단일queued initialize insertion으로config 삭제를await한뒤raw를읽는다. background import/listener를변경하지않고mutated broker hash/function을별도로pin한다. Windows child-tree/Unix runner group 종료는생성한PID만대상이며detached Chromium 종료증거가아니다. unacknowledged launch는root 보존/cleanup-unconfirmed/nonzero, 다음phase와negative PASS 금지다. TransitionFailure를IPC로먼저보내고close 뒤cleanupErrors를추가한다. summary/최종보존artifact cap·첫실패/cleanup실패를 parent finally에서 확정하고 source/protected input 전후hash도 대조한다. CLI `--run-id=ALPHANUMERIC`, 선택 `--headed`, control은 `--control=storage-loss`만 허용한다.
- [ ] **Step 4 — GREEN·immutable checkpoint:** `node --test tests/published-payload.test.cjs tests/installed-transition-scenario.test.cjs tests/installed-transition-runner.test.cjs tests/installed-extension-runner.test.cjs tests/installed-extension-negative.test.cjs tests/owned-files.test.cjs tests/installed-extension-candidate.test.cjs tests/package-isolation.test.cjs`. Expected: 실패/새skip0. 기존 test 경로를 `rg --files tests`로 확인했다. 전체 file inventory/CLI/protected paths 확인 후 코드checkpoint commit, clean tracked validation clone·물리 dependencies를 준비한다. tests 이름 누락은 skip으로 숨기지 않는다.
- [ ] **Step 5 — 실제 설치 GREEN/negative:** clone에서 fixed Git baseline을 명시 fetch하고 `node scripts/extension-e2e/published-payload.mjs --prepare`; `node scripts/check-installed-transition.mjs --run-id=B2positive`; `node scripts/check-installed-transition.mjs --run-id=B2negative --control=storage-loss`. Expected: positive5case의old/new/rollback 관측 및 literal oracle PASS; negative는 candidate-init의transition-storage-preservation/config loss만 탐지·cleanup 성공. negative가 positive 성공을 대체하지 않는다. 실패는 code·phase·fixture/input/output hash로 진단하고 사용자에게 기존 방송/설정을 반복 조작하도록 요구하지 않는다.
- [ ] **Step 6 — 전체·보존·CI:** 현재 CI의 foundation9를 clone에서 실행한다: `npm run check:toolchain`, `npm run check:runtime-js`, `npm run typecheck:settings-fixture`, `npm run typecheck`, `npm run typecheck:development`, `npm run check:settings-runtime`, `npm run check:main-runtime`, `npm run check:build-proof`, `npm run typecheck:audio-tools`. 이어 `npm test`, `npm run build`, `npm run check`, `node scripts/check-audio-quality.mjs`, `npm run test:e2e`, `npm run test:e2e:negative`, `node scripts/tool-audit.mjs`, `git -c core.safecrlf=false diff --check`. Expected: 각 gate 성공/품질실패0/제외없는전체fail0, 기존private자료부재skip만 별기. 원래폴더P02 역사실패는별도유지. 도구 raw exit·현재guarded/new 관측을새report로기록; 새경고/실패미해결시공개불가. 기존rootdist58/원본ZIP/CRX/frozen/version/프로필 불변을 확인한다. verify CI에는 prepare와두새runner 명령만추가하고 기존foundation/strict/positive/MAIN-negative 유지, artifact는기존installed-extension-* summary/trace 패턴안에만 둔다.
- [ ] **Step 7 — 기록·최종 검토·전체 묶음 인계:** validation에 sourceCommit·old/new/testmanifest 모든hash·각phase literal/actual·identity·실제실패control·cleanup·제한·도구결과를기록한다. 구현후fresh Astra max whole-branch 검토와critical/important 보완까지 로컬에서 마친다. B2만의 push/PR/병합은 하지 않고 AF05-B 전체 카테고리 종료·공개 승인 후 단일 한글 PR에서 최종head 공개CI를확인한다. main 병합/참조검사/해당branch 정리는별도승인범위다. B2 로컬완료와native/전체수용을구분하고버전승인/스토어작업으로자동진행하지않는다.

## 승인 묶음·자체 대조·인계

2026-10-13 후속 승인/보완: `scripts/extension-e2e/transition-preparation.mjs`가 B2만의 정상 Developer mode UI 준비를 소유하며 기존 runner의 `refreshTransitionWorker` export를 유지한다. UI 잠금·대상 부재·작동 없는 toggle·old-worker 종료 부재·ID/version/활성 mismatch·popup·reload·close 오류의 DOM 회귀 검사와 parent 준비 증거 mutation을 RED→GREEN으로 대조한다. 기존 두 최소 refresh double은 확장된 실제 DOM 경계 검사로 대체한다. 실제 첫 fixture의 성립 확인 뒤5case positive/storage-loss와 기존 전체 gate를 다시 실행한다. child seed/phase와 parent admission은 `{developerMode:true,workerClosed:true,extensionId,version,state:'ENABLED'}`를 유지한다. 사용자 Chrome/P09/제품/권한/버전·스토어에는 적용하지 않으며 미완료를 PASS로 바꾸지 않는다.

- [x] 사용자2026-10-13 written B2 spec·구현 계획 승인. 새 bundled Chromium fixture 프로필5case+control·T/R test-copy·기계적 UI seed/수정·실제 삭제 negative·owned process/directory cleanup. 종료미확인시실패/root보존과private시험browser 수동종료필요가능성포함. 기존 시청/native 프로필·스토어는 제외.
- [x] 사용자2026-10-13 Native 구현·격리검증·최종 Astra max 검토 묶음 승인. 설계 작성만으로 실행 승인을 추정한 것이 아님.
- [ ] 구현 후 최종 Astra max 검토. 공개CI·단일 PR/통합은 AF05-B 전체 카테고리 완료 후 승인 범위에서 수행. 상위 AF05-B의waiver/플랫폼롤백완료기준은 별도.
- [x] B1의4파일 모의검사와B2의58파일/실제UI/storage를구분. 기존base scenario의restore 경로는사용하지않음.
- [x] 세Task의함수/파일이연결되며각단위의RED/GREEN·실행gate를분리. 새dependency/일반ZIP/배포프레임워크 없음.
- [x] Review Focus5건 각각소유Task에반례배정. 정상/negative·손상/legacy·phase timeout/cleanup을구분.
- [x] Astra max 독립 설계·계획 검토 Critical0·Important3·Minor1과주실행자보완. MAIN의ready/repair 분리·동기background 유지/awaited broker loss·launch/close ACK/fail-closed 보존·실패관측IPC를반영했다. [검토 기록](../validation/2026-10-12-af05b2-design-review.md). 수정후독립0건/설치/보안인증의PASS가아니다.

승인된 B2만 Native 방식으로 구현·격리검증한다. 별도 미승인 native 기준 프로필·스토어·실제 업데이트/플랫폼 롤백·버전·공개/통합 게이트로 자동 진행하지 않는다.

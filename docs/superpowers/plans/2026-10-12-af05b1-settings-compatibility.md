# AF05-B1 — 게시 설정 계약 호환성 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 사용자가2026-10-12 B1 계획·Native 실행·최종 Astra max whole-branch 검토를 승인했다. 전체 AF05-B 수용 기준 변경이나 공개 실행 승인은 아니다.

**Goal:** 게시된2.13.3과 현재 AF 코드의 설정 계약을 객관적으로 비교하고, 하나의 모의 저장소에서 old→new→old 처리 중 값 손실을 검출한다.

**Architecture:** 고정 Git commit의 설정 파일4개를 배포 파일 SHA-256까지 검증한 뒤 기존 jsdom settings fixture에 공급한다. fixture의 저장 객체와 CSS 등록 Map은 교체하지 않고 worker 코드만 바꾼다. 고정 기대값·오류 순서와 differential 비교를 함께 사용한다.

**Tech Stack:** Node24.19.0, Git, 기존 jsdom30.1.2, Node test runner. 새 의존성·ZIP parser·실행 loader는 없다.

**Spec:** [AF05-B 수용 설계](../specs/2026-10-12-af05b-release-acceptance-design.md)의 §4를 단계화한 첫 구현 단위. 원래 전체 written-spec의 과거 업데이트 미검증 수용·플랫폼 rollback 완료 기준 변경은 여전히 사용자 승인 대기다. **이 계획만 승인하면 B1 로컬 검사만 구현하며 그 수용 기준은 변경하지 않는다.**

## Global Constraints

- 제품 version2.13.3 유지. 차기 공개 번호는 미정이다. package/lock/manifest·제품 TS/생성 JS·권한·기능·root dist·원본 제출 ZIP/CRX를 변경하지 않는다.
- 사용자 시청 프로필·native 스토어2.13.3 검사용 프로필·실제 설정을 읽거나 바꾸지 않는다. fixture 값은 합성 입력이다.
- frozen P02 기준선/원장과 기존 skip/exclusion을 변경하지 않는다. 역사 자료가 있는 원래 폴더의 기존 해시 실패를 숨기지 않는다.
- 실제 `background.js` IIFE·구 UI/client·Chrome worker·설치 전환은 B1의 실행 대상이 아니다. broker/contract4개 실행을 실제 업데이트·내구 저장·전체 제품 호환성으로 표시하지 않는다.
- B2에서 전체58파일 payload·background/구 UI·동일 프로필/ID 전환과 rollback을 검사한다. native preflight·스토어 조작·실제 업데이트·F00–F05는 별도 게이트다.
- 현재 설정 fixture의 기본 호출·zero-argument restart와 기존 CI foundation/offline 검사를 유지한다. DT01-S 전면 타입화·새 배포 runner는 추가하지 않는다.
- 새 문서·PR은 한국어 또는 영어. 승인 후에도 구현 중 제품 계약 차이를 발견하면 검사 기대값을 맞춰 숨기지 않고 원인을 분리해 중지한다.

## Review Focus

1. Git LF와 실제 배포 mixed EOL이 다르면 의미 비교만으로 출처를 증명할 수 없다. Task1은 입력·복원 출력의 고정 hash와 잘못된 EOL map을 검사한다.
2. shallow checkout에 과거 object가 없으면 최신 소스로 대체해 거짓 PASS가 날 수 있다. Task1은 명시적 CI fetch와 absent-object hard failure를 검사한다.
3. worker 교체가 pending write/CSS/event를 남기거나 저장을 재주입하면 rollback 검사 의미가 사라진다. Task2는 busy 거부·같은 저장/등록 객체 identity·교체 후 listener 수를 검사한다.
4. unknown raw 키 보존과 snapshot 비노출, invalid legacy 정리는 서로 다른 계약이다. Task2는 literal golden과 own t cleanup·revision 오류를 별도 검사한다.
5. 양쪽 코드에 같은 버그가 있거나 commit 뒤 응답 실패가 나면 differential만 통과할 수 있다. Task2는 독립 golden·fault 순서·저장 손실 negative control을 요구한다.

---

## 파일 지도와 고정 출처

| 파일 | 책임 |
| --- | --- |
| 새 `scripts/published-settings-baseline.mjs` | 고정 metadata·Git blob 읽기·정확한 배포 bytes 검증; 네트워크/쓰기 없음 |
| 새 `tests/published-settings-baseline.test.cjs` | 출처·크기/형식·EOL·누락 입력과 absent-object 실패 |
| 수정 `tests/settings-fixture.cjs` | 기존 worker 로드 입력만 선택 가능하게 추가; 기존 호출자 유지 |
| 새 `tests/settings-compatibility.test.cjs` | 두 worker의 golden/differential·같은 저장 old→new→old·negative control |
| 수정 `.github/workflows/ci.yml` | verify job의 테스트 전 고정 과거 commit fetch; foundation 불변 |
| 수정 `PLANS.md`, 새 validation 문서 | 승인·실행 결과·한계·CI/PR 이력 |

`WorkerFile`은 아래 정확한4개 이름의 union, `WorkerSources`는 `Readonly<Record<WorkerFile,string>>`다. JSDoc에 같은 정의를 쓰며 새로운 TS gate에 untyped fixture 전체를 끌어오지 않는다.

출처 commit `fb15f9675f9ea910e98363635155bc4ff9eb1d2f`; 제품2.13.3; 제출 ZIP SHA-256 `67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`.

| WorkerFile | Git blob SHA-256 | 게시 ZIP entry SHA-256 |
| --- | --- | --- |
| `config.js` | `9cd127c2ad33f349660d7730366db9015d08b94bc98f2d42e20bff244447f61b` | `b29dde24d8a7d0245a1a54a2eb55e08360e42a75e138ca34e072f816bf3730c1` |
| `style-schema.js` | `43f37f8231ebac76fcff3ea4630ef958b1781ba53c9cb3c6fbcb2404311280c8` | 왼쪽과 byte/hash 모두 일치 |
| `settings-contract.js` | `5affb77bc67ade7ee48b4a00a84d5839a4bd7fd8bed24db59961db6514c954aa` | 왼쪽과 byte/hash 모두 일치 |
| `settings-broker.js` | `83f3b72a9cfd63ad15e85680fa97b71d72972b5d356eea593e7278bbfbd1726e` | 왼쪽과 byte/hash 모두 일치 |

`config.js`의 정확한 변환: Git LF source를`\n`으로 분할하고, 1-based line ranges `[1,12]`, `[21,49]`, `[52,220]`에만 끝에`\r`을 추가해`\n`으로 결합한다. 다른 행/문자/파일은 변환하지 않는다. Git5506 bytes→ZIP5716 bytes, LF254·CRLF210을2026-10-12 원본 ZIP과 대조해 byte 일치를 확인했다. 전체LF→CRLF나 느슨한 줄바꿈 정규화는 사용하지 않는다. 구현 metadata에는 각 entry의input/output hash와config의 고정ranges를 넣는다. 이 재구성은4파일만의 출처 근거이며 전체58파일ZIP의 대체가 아니다.

## Task 1: 고정된 게시 설정 소스를 읽는 검사 경계

**Files:** Create `scripts/published-settings-baseline.mjs`, `tests/published-settings-baseline.test.cjs`; Modify `.github/workflows/ci.yml`의verify/test 준비.

**Interfaces:**

- Produces `PUBLISHED_SETTINGS_BASELINE`: deeply frozen sourceCommit/version/submissionZipSha256/files metadata. 각file의gitSha256/publishedSha256, config만crlfLineRanges를 고정한다.
- Produces `validatePublishedWorkerBlobs(blobs: Readonly<Record<WorkerFile,Buffer>>): WorkerSources`. 성공할 때만 복원한UTF-8 문자열4개를 반환한다. 입력Buffer를 변경하지 않는다.
- Produces `readPublishedWorkerSources(): WorkerSources`. module URL에서repository root를 고정하고 각file을 `execFileSync('git', ['show', sourceCommit + ':' + file], {cwd: root, timeout: 15000, maxBuffer: 1048576})`로raw Buffer로 읽어 위validator에 넘긴다. 임의repo/URL/commit 인자·shell·자동fetch는 제공하지 않는다.
- Errors `.code`: `published-baseline-input`, `published-baseline-size`, `published-baseline-git-hash`, `published-baseline-payload-hash`, `published-baseline-unavailable`. exact own keys4개·Buffer·각1MiB/합계2MiB 이하를 요구한다. git absent/timeout/nonzero exit는unavailable, 입력hash 일치 후 고정EOL 복원output 불일치는payload-hash다.

- [x] **Step1 — failing provenance tests**: 위exact API를import하고 실제Git blobs를 원본으로 보존한다. 다음test명과assert를 고정한다.

```js
// published baseline bytes match the attested submission entries
assert.equal(sha256(Buffer.from(sources['config.js'])), 'b29dde24d8a7d0245a1a54a2eb55e08360e42a75e138ca34e072f816bf3730c1');
assert.equal(Buffer.byteLength(sources['config.js']), 5716);
assert.equal((sources['config.js'].match(/\r\n/g) || []).length, 210);
// published baseline rejects a changed blob before execution
assert.throws(() => validatePublishedWorkerBlobs(oneBitChanged), { code: 'published-baseline-git-hash' });
assert.deepEqual(blobs, beforeValidation);
```

다른entry3개도 표의hash와 완전히 일치시킨다. missing/extra/non-Buffer는input, 1MiB+1/합계2MiB+1은size다. 입력hash 자체를 바꿔 허용하는test용metadata 인자는 추가하지 않는다. metadata의config ranges와 정확한byte 결과를assert하고, 전체LF→CRLF의hash가`26c0db7bccbb73e305b75db01003bf9ec97eb7a012f62f6ab2409101685f10f7`여서 틀린 결과임을 확인한다.

- [x] **Step2 — RED**: `node --test tests/published-settings-baseline.test.cjs`. 미작성module의import 실패로RED. git objects 누락을RED의 대체로 삼지 않는다.
- [x] **Step3 — reader 구현**: 고정4파일과Node 표준crypto/child_process만으로 위API를 구현한다. metadata는 같은module에 두고 중복JS fixture나 범용archive reader를 만들지 않는다.
- [x] **Step4 — CI preparation과absent-object test**: verify의Run tests 직전에 `git fetch --no-tags --depth=1 origin fb15f9675f9ea910e98363635155bc4ff9eb1d2f`를 명시한다. foundation/check offline은 변경하지 않는다. fresh owned temp의empty Git repo에module만 복사하고child import로reader를 호출해object 누락에서`.code === 'published-baseline-unavailable'`·nonzero exit를 확인한다. child timeout20초, finally에서 자신의 새temp만 삭제하고 기존 경로를 인수하지 않는다. 로컬object가 있다는 이유로skip하지 않는다.
- [x] **Step5 — GREEN/commit**: `node --test tests/published-settings-baseline.test.cjs` PASS, `git diff --check` 0을 확인하고Task1의3파일만commit한다. 원본ZIP/private output 없이 실행되는test임을 확인한다.

## Task 2: 같은 저장 상태에서 두 세대를 실행

**Files:** Modify `tests/settings-fixture.cjs`의worker 로드 경계·request/boundary 계수; Create `tests/settings-compatibility.test.cjs`, `docs/superpowers/validation/2026-10-12-af05b1-settings-compatibility.md`; Modify `PLANS.md`.

**Interfaces:**

- Consumes Task1 `readPublishedWorkerSources(): WorkerSources`. 후보4파일은 현재 생성JS의fixed filenames만read한다. `check:settings-runtime`의drift gate를 먼저 통과시키고 후보HEAD/file hash를validation에 기록한다.
- Extends `settingsHarness(t, stored = {}, workerSources?: WorkerSources)`. undefined는 기존CWD 로드를 유지한다. explicit 입력은exact4 own keys/nonempty strings를 검증하고 전체4개를 고정 순서로eval한다. 부분 입력을current source로 보충하지 않는다.
- Extends `restartBroker(nextWorkerSources?: WorkerSources): void`. 생략하면 현재 선택된source를 유지한다. explicit 입력 검증은old worker 제거 전에 한다. versioned harness 교대에는 **마지막 작업 이후 안정화된settle 완료**가 필요하다. 아래epoch 조건을 만족하지 않거나 미응답request/실행 중boundary가 있으면 `fixture-worker-busy`로throw하고 저장/worker를 변경하지 않는다. 전체request reply와`settle()`를 기다리고gate를release한 후에만 교체한다.
- versioned 모드의 `activityEpoch`는 initialize/send/runtime.sendMessage/invalidate의 진입, storage event에서style 갱신을 예약하는signal, 모든boundary 진입에서 증가한다. 기존 `settle(): Promise<void>`의 첫flush 뒤epoch를 캡처하고 둘째flush 뒤epoch 불변·pendingRequests0·activeBoundaries0일 때만 `settledEpoch`를 그 값으로 기록한다. 조건이 안 되면기존 표시를 무효화하며settle 자체는 기존처럼resolve한다. 교대는 `settledEpoch === activityEpoch`를 요구하고 성공 시표시를 다시 무효화한다. `invalidate→즉시 교대`의microtask gap도 epoch가 먼저 바뀌므로 거부된다. product broker에idle API나 새scheduler를 추가하지 않는다.
- `saved`와`registrations`의identity를 유지한다. worker별style invalidation listener는 교대 때 해제하고 이전DOM을 닫는다. 초기seed 외에storage 재주입·clone 교체를 하지 않는다. 기존default harness의zero-argument restart 동기 계약은 바꾸지 않는다.
- `client()/openUi()`는 계속current files만 사용한다. B1은 직접`patch('popup'|'styles', operations)`를 사용한다. sender명이 두 종류라도 두 실제UI를 검증한 것은 아니다.

- [x] **Step1 — failing version-switch tests**: `tests/settings-compatibility.test.cjs`에 다음test를 추가한다.

```js
// old new old keeps the same raw storage and registration identities
const initial = { config: { futureFlag: 'keep', brightness: 1.225 },
  styles: ['left-chat', 'future-style'], styleParameters: { future: 9 }, settingsRevision: 4,
  futureTop: { untouched: true } };
const h = settingsHarness(t, initial, oldSources);
const saved = h.saved, registrations = h.registrations;
await h.initialize(); await h.patch('popup', [config('arrowSeek', false)]); await h.settle();
assert.equal(h.saved.settingsRevision, 5);
h.restartBroker(newSources); await h.initialize();
assert.strictEqual(h.saved, saved); assert.strictEqual(h.registrations, registrations);
await h.patch('styles', [parameter('chat-font-size', 8)]); await h.settle();
assert.equal(h.saved.settingsRevision, 6);
h.restartBroker(oldSources); await h.initialize();
await h.patch('styles', [parameter('chat-font-size', 0)]); await h.settle();
assert.deepEqual(h.saved, { ...initial, config: { ...initial.config, arrowSeek: false },
  styleParameters: { future: 9, 'chat-font-size': 0 }, settingsRevision: 7 });
assert.strictEqual(h.saved, saved); assert.strictEqual(h.registrations, registrations);
assert.equal(h.changes.listeners.size, 1);
```

`versioned switch refuses incomplete input without retiring current worker`: missing key→assert throws·old worker identity 불변·다음patch 성공.
`versioned switch rejects in-flight commit and response`: commit/write-result/response gate별로pending patch를hold하고busy throw·identity 불변, release/await/settle 후 동일switch 성공. CSS와event hold도 검사한다. queued job도 전체reply 전에는 교대하지 않는다.
`versioned switch rejects queued invalidation before any boundary`: initialized/settled 상태에서`h.invalidate({retry:true})` 직후boundary 추가0이어도switch는busy. 이후settle→switch→새initialize/settle는성공한다. 이전worker의storage/scripting/tabs/permissions API 함수들을검사용wrapper로감싸퇴역 이후호출수를세고0회임을assert한다. DOM.close만으로취소됐다고판정하지않는다.
`default fixture and zero-argument restart remain compatible`: 기존settings/background/client/UI 검사를 변경 없이 재실행한다.

- [x] **Step2 — RED**: `node --test tests/settings-compatibility.test.cjs`. source 선택 미구현으로old worker가 실행되지 않는 검출assert 또는 미지원switch assert로 실패시킨다. 먼저old/current worker global 함수의source 문자열이 각 공급source에서eval되었음을 확인해 내용 비교만으로 우연히PASS하는 것을 막는다.
- [x] **Step3 — fixture 구현**: 위optional source 입력·versioned 교대 검증·pendingrequest/activeboundary 계수와activity/settled epoch를 기존fixture에 추가한다. versioned 작업은계수/epoch를관리하는fixture 메서드로시작한다; raw broker 참조는진단용이다. timer 연장으로busy를 숨기지 않고reject/throw에도finally로 계수를 복원한다. default callers를 새API로 일괄 변경하지 않는다.
- [x] **Step4 — independent goldens/differential**: 아래named tests를old/new의 독립context에서 실행한다. snapshot의cross-realm값은JSON으로plain화, raw는structuredClone 비교를 사용한다. code에서default 기대값을 생성하지 않는다.

| test명/입력 | literal assertion/순서 |
| --- | --- |
| `defaults and unknown storage remain separate` | 빈storage→snapshot arrowSeek=true/previewWidth=400/previewVolume=5/revision=0, 초기화commit/remove0. unknown config/style/parameter/top-level은raw 보존, snapshot에는 비공개; CSS는chat-font-size→left-chat 고정 순서 |
| `fractional field patch and no-op preserve the rest` | brightness1.225/futureFlag/revision4에arrowSeek=false→raw 해당field 추가만/revision5. 재저장은write 없음/revision5 |
| `parameter zero removes membership not the raw value` | chat-font-size8→style 추가/revision+1, 0→known style만 제거/parameter0 보존, unknown style/parameter 보존 |
| `legacy cleanup is committed once` | own t=0 + resizeChat=true→sharpness0/chat-resize/resizeChat 제거/commit 후remove t. t=null/'invalid' cleanup-only는commit 없이도remove. resizeChat=false는보존. 재초기화commit/remove 증가 없음 |
| `corrupt revision never resets unrelated values` | null/-1/1.5/'1'/NaN/Infinity→revision-invalid, MAX_SAFE_INTEGER→revision-exhausted; patch 거부·raw unknown 키/revision 불변. legacy 없는 독립seed 사용 |
| `field shape bounds are unchanged` | 아래고정게시schema의모든config/style id·type·default·min/max·step를대조하고그게시범위의동일입력을두context에서실행. brightness1.225 허용, font -6/16/2.5 허용·-7/17 거부, operations64 허용/65 거부, unknown/prototype-reserved id·extra property·잘못된형 거부, validation 전storage/CSS/reload0 |
| `two senders merge without whole-object overwrite` | popup arrowSeek=false와styles previewVolume25를 병렬patch→두값 보존/revision2/maxConcurrentWrites1. same-field 후착 우선/no-op 보존; snapshot은held write 완료 전에resolve하지 않음 |
| `migration faults block patches until a fresh worker` | read/commit/remove failure 각각initialize reject/patch stage initialization, fresh worker로 회복. remove failure 전에commit되었다면 값을undo하지 않음; commit 전실패면remove 없음 |
| `post-commit completion failure keeps the durable fields` | raw config={futureFlag:'keep'},revision4에서arrowSeek=false 저장 중write-result를실제fail. reply stored=false/stage='write'지만raw config={futureFlag:'keep',arrowSeek:false}/revision5. 다음previewVolume25 patch→두필드/unknown 보존/revision6. 실패뒤settle→same-source restart→initialize/settle 성공 |
| `lost response never rolls storage back` | 같은seed/patch에서response를실제fail→reply undefined지만raw field/revision5 보존. 다음patch가merge해revision6, settle→교대성공. pending계수유출/초기화undo 없음 |
| `durable write and CSS result are not the same` | initialized left-chat→css-update failure를hold/fail하고hide-studio patch. stored=true/ok=false/css.state=failed, raw 변경/revision+1, 등록은left-chat. retry로CSS만 회복·추가commit/reload 없음 |
| `reload only touches the original target` | 7/window9→tab-reload7, closed/tab-window mismatch는reload0. 잘못된protocol/sender/frame은storage/CSS/reload0 |

valid seeds의빈값/비기본/unknown/migration마다old→new→old 연속 저장도 실행한다. 기대raw/snapshot·필요CSS 등록값·commit/remove/reload 중요 순서를literal로 먼저 확인하고 그projection을old/new에서 비교한다. requestId/timing/cross-realmprototype은 비교 대상에서 제외한다. 의미 없는read 횟수까지 계약화하는boundary log 전체 배열 일치는 요구하지 않는다.

`all published field descriptors and bounds are fixed`의고정schema: 게시worker의`CONFIGS.flatMap(g => g.configs.flatMap(f => f.configs || [f]))`를선언순서대로 `{id,type:f.type || 'boolean',defaultValue,...(f.type==='range'?{min,max,step}:{})}`에projection하고`{config:fields,styles:plain(STYLES)}`를JSON.stringify한다. config25개·style group7개와SHA-256 `b5b80219c2554520640d060c73e1d9de4ce7670637fe22d9338c58d8528ca823`을literal로assert한다. 주실행자가고정Git 게시소스에서읽기전용으로계산한값이다. 후보의동일projection은게시schema와deepEqual이어야한다. 검사입력은후보schema가아닌위hash를통과한게시fields에서만생성한다: range good=min/max/default, bad=min-1/max+1/NaN/Infinity/'0'/null/false, boolean good=false/true 및bad=0/1/'true'/null. plain style은true/false만허용하고range style은parameter의min/max/0/2.5를허용·min-1/max+1을거부한다; range id에style toggle은거부한다. 각config의빈snapshot default도게시default와같아야한다. 기존literal golden은그대로유지한다.

- [x] **Step5 — negative controls/GREEN**: `compatibility oracle rejects seeded data loss`에서fresh harness용newSources의broker 앞에test 전용 `void chrome.storage.local.set({config:{}});`를 추가하고old가 저장한arrowSeek=false/futureFlag를 잃는candidate를 실제eval한다. 초기화/settle 후raw 손실을확인하고정상과 같은assertion 경로가해당field의AssertionError를 내는 것을assert rejects한다. `schema oracle rejects widened previewVolume bound`는별도fresh candidate worker의CONFIGS previewVolume.max를100→101로바꾸고동일schema assertion이실패하며게시contract는101거부/변형candidate는101허용임을assert한다. 두control은normal sources/on-disk files를 변경하지 않는다; baseline mutation의hash 거부와도 별개다. `node --test tests/published-settings-baseline.test.cjs tests/settings-compatibility.test.cjs tests/settings-contract.test.cjs tests/settings-broker.test.cjs tests/settings-client.test.cjs tests/background.test.cjs tests/settings-ui.test.cjs tests/settings-multi-ui.test.cjs tests/settings-style-apply.test.cjs`를 모두PASS시킨다. test명은`rg --files tests`로 확인했고 누락을skip으로 숨기지 않는다.
- [x] **Step6 — full gates/record/commit**: 아래 검증을 실행하고 결과·후보SHA/hash·미검사 범위를validation과PLANS에 기록한다. Task2의fixture/tests/doc만commit한다.

## 구현 후 검증과 공개 문서 게이트

1. `npm run check:toolchain`, `npm run check:runtime-js`, `npm run typecheck`, `npm run typecheck:development`, `npm run typecheck:audio-tools`, `npm run check:settings-runtime`, `npm run check:main-runtime`, `npm run check:build-proof`를 각각exit0으로 확인한다.
2. original root에서`npm test`를 실행하면 기존frozen 역사hash 불일치를 별기한다. 제외 없는 전체suite PASS는 새tracked checkout에 물리dependencies를 준비하고 위fixed commit을 명시fetch해 실행한다. 공개CI verify도 같은fixed fetch로 실행한다. private baseline 복사나 새skip으로 실패를 지우지 않는다.
3. product build/package/audio/installed positive/negative는 후보/새tracked checkout에서 기존command를 사용한다. root dist에build하지 않는다. 후보의 물리JS/CSS를 실행하는 기존 검사를 생략하지 않는다. 변경하지 않는 제품 영역을 사용자에게 다시 주관적으로 확인하도록 요청하지 않는다.
4. root dist/원본ZIP/frozen2파일의 전후hash·package/manifest/lock version2.13.3을 확인한다. 공개CI·Astra max whole-branch final review에source provenance, 실행worker와 같은storage, fault/negative 반례를 제시한다. 확인하지 않은native 결과는 기록하지 않는다.
5. 한글PR의 최종head checks PASS 확인 후 기존 승인 범위에서main에merge한다. main이head를 포함하고openPR/worktree 참조가 없으며 보호 대상이 아닐 때만 작업branch를 삭제한다.

## 자체 검사·인계

- [x] §4의broker/contract 부분을Task1/2에 대응. background/전체UI/전체payload·native는B2 이후 미구현으로 명시했다.
- [x] fixed4file signatures와optional fixture 인자를 같은 이름으로 통일. source 취득에private ZIP을 요구하지 않는다.
- [x] Review Focus5건에test를 배정. 저장projection의 독립golden과 실행negative를 함께 요구했다.
- [x] 구현 단위는 출처reader와fixture/compatibility의2개. 새 기능·ZIP 추상화·DT 전체 타입화를 추가하지 않는다.
- [x] Astra max 독립 계획 검토 Critical0·Important3·Minor0. 예약작업gap·전체schema oracle·post-commit/response 실패를주실행자가보완했다. [기록](../validation/2026-10-12-af05b1-plan-review.md). 수정후독립0건판정/새B1 PASS를주장하지않는다.
- [x] 사용자B1 계획·Native 실행 방식 승인. 주 실행자가순차구현한후Astra max 최종검토를진행한다. 과거미검증수용·전체AF05-B/실제배포승인은포함하지않는다.
- [x] 승인 후 Task1→Task2→최종 whole-branch 검토→공개 CI 완료. [PR #36](https://github.com/Do-hyeon/cheese-knife/pull/36)·`8257c113`의 공개 run `38254502868` 통과. 문서 갱신 이후 최종 head checks·병합 상태는 해당 PR의 최신 기록을 따른다. 최종 checks PASS 전에는 병합하지 않으며 B1만으로 P09/AF05-B 완료·로드맵 동결 해제를 선언하지 않는다.

# DT01-B Quality Report Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정상 quality report의 정적 오용을 검출하고 기존 partial/raw gate·실제 CLI·감사 연결의 의미를 보존한다.

**Architecture:** 기존 순수 audio-metrics에 JSDoc 정상/partial 계약과 동일 함수 alias를 추가한다. 기존 audio-tools graph에 gate와 checked 소비자를 편입하며 browser/file capability는 편입하지 않는다. 원래 결과와 compiler 진단을 독립 oracle로 검증한다.

**Tech Stack:** Node24.19.0, TypeScript7.0.2 checkJs/noEmit, Node test runner, 기존 Playwright1.62.1·ESLint·npm/Gitleaks 점검. 새 의존성 없음.

**Spec:** [승인된 DT01-B 설계](../specs/2026-10-12-dt01b-quality-report-contract-design.md). 사용자2026-10-13 설계 승인. 기준 main `b1b7b70980c30e25aafa0c87d5b2e92f643f422e`; 이 문서는 계획이며 구현·실행 승인은 별도다.

## Global Constraints

- 제품 src/생성 JS/manifest/권한과 package/lock 버전2.13.3, root dist58파일, 제출 ZIP, native 기준 프로필, frozen P02 baseline/원장을 보존한다.
- root dist에서 build/cleanup하지 않는다. 실제 계정·방송·speaker·쿠키·설정·스토어를 조작하지 않는다.
- 기존 반환/예외/실패 순서·키 순서·coercion·threshold·수치 의미를 유지한다. 새 validator·wrapper·normalization·schema dependency·오류 정책은 없다.
- 정상 alias의 unknown/any escape hatch, 전체 report cast, @ts-nocheck/@ts-ignore, 검사/감사 제외 확대는 금지한다.
- browser CLI 전체 report 조립은 checked가 아니다. 정상 API·순수 gate·대표 소비자와 실제 import 연결만 보장한다.
- DT01-C/S·NUM01, B2/native 공개 수용·기능 로드맵은 이번 작업에 추가하지 않는다. B2보다 먼저 하는 것은 우선순위이지 새 출시 조건이 아니다.
- 한국어/영어만 사용한다. 기존 npm/CI/테스트 발견 경로와 .mjs/.cjs 파일 형식을 유지한다.

## Review Focus

1. 선택 step/peak와 getter: guard가 없는 값의 native coercion과 읽기 순서까지 유지해야 한다 — Task1 oracle·국소 주석 검사.
2. null/hole/wrong-container: 예외를 빈 실패 배열로 바꾸거나 실패 순서를 잃지 않아야 한다 — Task1 raw golden.
3. Array.isArray의 any[] narrowing: 정상 alias만 엄격하고 구현 원소가 any인 상태를 허용하지 않는다 — Task1 내부5곳 mutation proof.
4. readonly tuple·상관 transition: 정상 보고서 오용은 거부하되 최소 partial1채널과 추가 metadata는 허용한다 — Task1 양성/음성 compiler proof.
5. CLI/감사·격리 출력: import 변경이 실제로 연결되고 report/throw/finally·audit inventory·사용자 dist가 유지돼야 한다 — Task2 연결/격리 회귀.

---

## Task 1 — Gate 계약·호환 oracle·실효성 증명

**Files:** Modify `scripts/audio-metrics.mjs`, `tests/audio-metrics.test.cjs`, `tests/audio-signal-contract.test.cjs`, `tsconfig.audio-tools.json`; Create `tests/audio-quality-contract.test.cjs`, `tests/fixtures/audio-quality-compatibility.json`.

**Interfaces:**

- Consumes: 기존 `summarizeCapture(data:CaptureWindow,frequency?:number|null):CaptureSummary`, `ChannelMeasurement`, `RmsEnvelope`와 숫자3개 export.
- Produces: 기존 `audioQualityFailures(input?:QualityGateInput):string[]`와 동일 객체 `audioQualityReportFailures:(report:QualityReport)=>string[]`. type import로 아래 typedef를 공개하며 runtime type 객체는 만들지 않는다.
- `QualityCase = CaptureSummary & {frequency:number,inputAmplitude:number,gain:number,enabled:boolean,stereo:'identical'|'left-only',bursts:boolean}`.
- `QualityTransition = {frequency:number,before:CaptureSummary,change:CaptureSummary,after:CaptureSummary} & ({kind:'enabled',value:boolean}|{kind:'gain',value:number})`.
- `DelayAlignment = {sampleRate:number,expectedFrame:number,dryFirst:number,dryLast:number,compressorFirst:number,compressorLast:number}`.
- `QualityReport = {cases:readonly QualityCase[],transitions:readonly QualityTransition[],stress:CaptureSummary & {profile:string},alignments:readonly DelayAlignment[]}`.
- `QualityGateChannel`: rms/peak/maxAdjacentStep/overFullScaleSamples의 선택 number, envelope8ms의 선택 `{min?:number}` 또는 null. scalar의 null/string은 raw 테스트에 남기며 정상 숫자 타입으로 주장하지 않는다.
- `QualityGateChannels = readonly (QualityGateChannel|null|undefined)[]`; `QualityGateCapture = {channels?:QualityGateChannels|null}`.
- `QualityGateCase = QualityGateCapture & {enabled?:boolean,stereo?:string}`; `QualityGateTransition = {frequency?:number,kind?:string,value?:number|boolean,before?:QualityGateCapture|null,change?:QualityGateCapture|null,after?:QualityGateCapture|null}`.
- `QualityGateInput`: 선택 cases/transitions/alignments는 각각 위 부분 case/transition/`Partial<DelayAlignment>`와 null/undefined 원소의 readonly 배열 또는 null, stress는 선택 QualityGateCapture 또는 null. root undefined/default는 허용하고 root null은 typed 경로 밖이다. 완전한 정상 report는 이 부분 계약에 대입 가능해야 한다.
- Test-only `qualityBase()`는 아래 minimal partial factory, `observe(run)`은 `{kind:'return',failures}` 또는 `{kind:'throw',name,message}` 관측이다. helper를 runtime/public 모듈로 추출하지 않는다.

- [ ] **1. 변경 전 독립 기대값을 고정한다.** 기준 commit의 audio-metrics와 아직 미변경 source가 EOL 외에는 같음을 확인한다. `qualityBase()`에서 두 개의 독립 channel `{rms:0.25,peak:0.98,overFullScaleSamples:0,maxAdjacentStep:0.1,envelope8ms:{min:0.25}}`, enabled/identical case, frequency250/kind enabled/value true의 before/change/after 각1채널, stress2채널, rate48000·frame288의6개 alignment 필드를 만든다. 각 변형은 새 factory를 사용한다. JSON은 `{baselineCommit,cases:[{name,expected}]}`의 literal 반환/예외만 저장하고 입력 NaN/undefined/BigInt/Symbol/getter는 JS factory로 만든다. 기대값을 candidate로 재생성하지 않는다.

```js
assert.deepEqual(audioQualityFailures(qualityBase()), []);
assert.deepEqual(audioQualityFailures(), ['invalid-quality-report']);
assert.deepEqual(audioQualityFailures({...qualityBase(), cases:[]}), ['missing-enabled-signal-case']);
assert.deepEqual(audioQualityFailures({...qualityBase(), transitions:[{kind:'gain',value:1}]}), ['missing-enabled-transitions']);
```

  모든 배열 위치의 channel/envelope는 서로 공유하지 않는 새 객체다. 기존 검사를 삭제하지 않고 `quality gate preserves the pinned raw compatibility oracle`를 추가한다. spec §6 전체에 더해 빈 배열/1·3채널 shape, sparse channel, missing/nonfinite/negative scalar/frame, 기존 수치 export와 typed buffer 비변경을 검사한다. 관측은 전체 배열/예외 deepEqual이다. getter를 읽지 않는 plain 입력은 structuredClone 전후 대조, getter 사례는 별도 read trace를 대조한다. 기본 입력 null case/transition·stress[null,null]·alignments[null]의 정확한 순서는 다음이다:

```js
['missing-enabled-signal-case','missing-enabled-transitions',
 'stress-channel-0/signal','stress-channel-0/stress-peak-low','stress-channel-0/overFullScaleSamples=undefined',
 'stress-channel-1/signal','stress-channel-1/stress-peak-low','stress-channel-1/overFullScaleSamples=undefined',
 'undefined/delay-alignment']
```

  특수 값은 첫 대상만 변경하고 나머지는 base를 유지한다. baseline step 생략→`['250Hz/on/step']`, null/string'0.1'→[], change step string'0.1'→step, native Math.max에 BigInt/Symbol→기존 TypeError. stress 첫 peak string'1'→`['stress-channel-0/stress-peak-low','stress-channel-0/peak=1']`, undefined/null→stress-peak-low, 0.9801→[], 0.98010001→peak=0.98010001. getter peak12값(undefined/null/0/0.98/0.9801/1/NaN/Infinity/'1'/1n/Symbol/valueOf object)의 원래 결과/예외와 읽기 trace를 변경 전 pin한다. 원소/type cast를 위해 stress.channels/case.channels accessor를 cache하지 않으며 그 읽기 trace도 pin한다.

- [ ] **2. 경계 및 oracle 실패 검사를 추가한다.** `quality gate retains exact signal and step thresholds`: RMS1e-4→[], 1e-4-Number.EPSILON→enabled-signal; transition change envelope0.25*0.95→[], 그 값-Number.EPSILON→rms; change step0.1+1e-6→[], 그 값+Number.EPSILON→step; stress0.97→[], 그 값-Number.EPSILON→stress-peak-low; frame1023→[],1024/음수/분수/NaN→delay-alignment. 각 case에서 같은 값의 다른 필드를 실수로 바꾸지 않는다. 변형 source의 정확한1곳 `baselineRms * 0.95`를0.90으로 바꾼 RAM function이 원래 rms oracle에 실패함도 확인한다. 이 테스트용 함수는 실제 gate의 toString에서만 만들고 runtime/source 파일은 변형하지 않는다. import/parse 실패를 control 성공으로 인정하지 않는다.

- [ ] **3. checked 소비자와 compiler RED를 작성한다.** 새 cjs에서 기존 방식의 resolution-mode JSDoc type import·dynamic mjs import를 사용한다. rate1000/start0/end8의 두 채널8개 상수0.25를 summarizeCapture(tone 생략)하여 before/change/after 및 steady를 만들고, 같은 길이0.98을 stress로 만든다. case frequency125/inputAmplitude0.25/gain1/enabled true/stereo identical/bursts false, enabled true와 gain1.5 두 transition, frame0/rate1000 alignment, stress profile'fixture'의 완전 QualityReport를 만든다.

```js
assert.equal(audioQualityReportFailures, audioQualityFailures);
assert.deepEqual(audioQualityReportFailures(report), []);
const reportWithMetadata = {...report,browser:'fixture',qualityFailures:[]};
assert.deepEqual(audioQualityReportFailures(reportWithMetadata), []);
assert.deepEqual(audioQualityFailures(report), []);
```

  metadata 호출은 먼저 변수에 담아 structural 추가 필드를 검사한다. partial1채널 fixture는 checked 소비자에서 QualityGateInput으로도 구성한다. 새 alias 부재의 RED를 기록한다. 신규4파일 config와 기존2파일 assertion 불일치·현재 untyped gate 진단은 기대한 준비 RED이며 negative compiler proof 성공으로 세지 않는다.

- [ ] **4. 최소 타입/국소 경계를 구현한다.** 위 typedef와 함수 param/return·좁은 변수 alias를 선언한다. 동일 함수 대입이지 cast/wrapper가 아니다. guarded 배열 읽기는 `NonNullable<QualityGateInput['cases'|'transitions'|'alignments']>` 및 `QualityGateChannels`의 erased 국소 주석으로 복원한다. 배열 loop의 original getter 읽기/순서를 유지하며 cache를 새로 만들지 않는다. 기존 finite 검사 이후의 scalar/channel 존재만 정확한 read에서 좁힌다. Math.max baselineStep 호출의 callable signature만 `(...values:(number|undefined)[])=>number`로 표현한다. peak 상한 비교 위치에서 peak capture/undefined guard만 추가하고 실패 메시지의 원래 channel.peak 읽기를 유지한다. 정렬/순서·기본값·threshold·오류·수치 계산은 바꾸지 않는다. 각 주석을 validation에 위치/근거별로 기록한다.

- [ ] **5. strict graph와 compiler proof를 완성한다.** config의 files 순서는 `scripts/audio-signal.mjs`, `scripts/audio-metrics.mjs`, `tests/audio-signal-contract.test.cjs`, `tests/audio-quality-contract.test.cjs`; include[]·extends·기존 strict 옵션·noEmit/Node16 유지. 기존 config/listFilesOnly assertion을4파일로 갱신하며 npm/CI는 바꾸지 않는다.

  기존 compile helper 패턴을 새 test 안에서 재사용한다: process.execPath/local tsc, encoding utf8, timeout30000, maxBuffer1048576; error/signal/null status는 실패. owned `output/audio-quality-types-*` mkdtemp와 after cleanup, extends absolute audio config·files:[proof]·include[]를 사용하고 파일을 실행하지 않는다. 정상 proof1개와 음성 식들의 line→expected-code map을 가진 proof1개로 묶는다. 모든 음성 식은 적어도 자기 줄의 목표 진단이 있어야 하고 다른 파일/줄·missing-module/import/ambient/crash 진단은 실패다. indented continuation만 기존 규칙으로 허용한다. 정상 report·추가 metadata·narrowed nullable 산술·최소 partial1채널은 진단0이어야 한다.

| Negative expression | 허용 진단 |
| --- | --- |
| 정상 alias 인자 생략/undefined/null | TS2554 / TS2345 |
| 정상 report의 root/stress/before/change/after 또는 측정 필드 누락 | TS2322 / TS2345 / TS2741 |
| enabled value1, gain value false, kind'unknown' | TS2322 / TS2345 |
| 정상 summary 채널1개/3개 | TS2322 / TS2345 |
| string sampleRate/frame, 잘못된 stereo/enabled | TS2322 / TS2345 |
| null 확인 없이 thdPercent 산술 | TS2531 / TS18047 |
| report의 nonexistentField | TS2339 |

  해당 식마다 다른 정상 필드는 유지한다. alias 계약의 음성 식은 잘못된 값/누락 필드를 alias의 직접 호출 인자에 넣고, 별도의 잘못된 QualityReport 변수 선언에서 발생한 오류로 대체하지 않는다. 누락된 목표 줄의 진단은 반드시 test 실패다. nullable 산술은 known summary tuple의 채널을 사용하여 case 배열의 undefined index 오류와 섞지 않는다. weak-alias 민감도는 이 직접 호출·per-line assertion을 읽어 구조적으로 확인한다. alias를 약화한 별도 compile 실행은 이번 계획에서 요구하지 않으며 steady-state4회 예산 밖의5번째 control을 몰래 추가하지 않는다.

  **실제 구현의 내부 negative control:** 테스트가 읽은 실제 audio-metrics source를 owned temp 폴더에 복사한다. copy의 `./audio-signal.mjs` import/JSDoc 경로만 `../../scripts/audio-signal.mjs`로 바꾸고, 수정 없는 copy를 독립 config로 먼저 compile하여 진단0을 확인한다. actual gate의 case·case channel·enabled transition·stress channel·alignment의5곳에 `if (item/channel) item/channel.__dt01b_missing`을 넣는다. 각 unique 기존 anchor(enabledSignals++, enabledTransitions++, case/stress RMS check, frames 선언)가 정확히1곳인지 확인하고 원래 source는 쓰지 않는다. 변형 copy는5곳 모두 그 위치의 TS2339가 있어야 하며 다른 진단은 거부한다. 하나라도 any라서 진단이 빠지면 실패다. 공통 helper/TypeScript compiler API 의존 graph를 새로 만들지 않는다.

- [ ] **6. GREEN·정적/호환 대조를 실행한다.** 아래 명령 모두 실패/skip0이어야 한다. 기존 A 수치 proof와 raw golden을 유지하고 source 키/입력/old numeric export identity도 확인한다. checker의 repo listFiles는4파일뿐이어야 한다. fixture의 expected는 수정하지 않는다.

```text
node node_modules/typescript/bin/tsc -p tsconfig.audio-tools.json --pretty false
node --test tests/audio-quality-contract.test.cjs tests/audio-signal-contract.test.cjs tests/audio-metrics.test.cjs tests/audio-artifacts.test.cjs
```

- [ ] **7. 커밋한다.** 위6파일만 stage하여 `test: enforce quality report contracts without changing raw gate semantics`로 기록한다. CLI/제품/package/lock/CI·동결 증거 diff0을 확인한다. 중간 commit은 실행/출시 승인이나 전체 DT01-B 완료가 아니다.

## Task 2 — 실제 CLI 연결·감사·격리 전체 게이트

**Files:** Modify `scripts/check-audio-quality.mjs`, `tests/audio-artifacts.test.cjs`; Create `docs/superpowers/validation/2026-10-13-dt01b-quality-report-contracts.md`; Modify `PLANS.md`와 이 계획의 체크리스트. 기존 `tests/tool-warning-remediation.test.cjs`/`tests/tool-audit.test.cjs`는 우선 재사용하며 목표 검사 부족이 확인될 때만 최소 assertion을 보완한다.

**Interfaces:** Task1의 동일 객체 audioQualityReportFailures를 CLI에서 기존 지역 이름 audioQualityFailures로 import한다. 기존 summarizeCapture5개 호출·report 조립·artifact/file capability·출력 형식은 유지한다. 기존 verifyCandidate(id)는 새 영숫자 ID의 격리 candidate/dist를 반환하고 기존 설치형 runner는 자기 owned candidate/profile을 관리한다.

- [ ] **1. 실제 연결의 RED를 고정한다.** artifact test에 `audio CLI selects the strict normal alias without a wrapper`를 추가한다. CLI source의 새 named alias import와 기존 call `audioQualityFailures(report)`를 확인한다. import의 목표 assertion은 변경 전 실패해야 한다. 기존 `--unknown`이 browser 시작 전 `audio-argument-invalid`로 nonzero이고 기존 artifact projection/comparison 허용치·정상/실패 결과는 유지한다.
- [ ] **2. import만 교체하고 GREEN을 확인한다.** `import {audioQualityReportFailures as audioQualityFailures} from './audio-metrics.mjs'`. 기준 CLI diff는 이 import 외에는 EOL 차이0이어야 한다. capture/calibration→quality→파일 저장/log→quality 실패 throw→finally close를 원본과 대조한다. 이 소스 보존은 모든 실제 CLI 오류 경로를 재실행한 증거가 아니다.
- [ ] **3. 기존 연결·감사를 회귀한다.** 아래 focused 명령을 실행한다. 기존 명시적 ESLint 목록의 metrics/signal/CLI, 실제 source snapshot/hash와 config 적용이 유지돼야 한다. 신규 mjs가 없으므로 audit inventory 변경은 필요하지 않다. root의 역사 P02 assertion을 skip-option으로 감추지 않고 원본 baseline/원장 해시를 보존한다.

```text
node --test tests/audio-quality-contract.test.cjs tests/audio-signal-contract.test.cjs tests/audio-metrics.test.cjs tests/audio-artifacts.test.cjs tests/development-types.test.cjs tests/tool-warning-remediation.test.cjs
```

- [ ] **4. immutable tracked clone을 준비한다.** 검증할 코드 checkpoint를 먼저 commit한다. ignored output 아래 고유 DT01-B clone 경로가 없음을 확인하고 현재 checkpoint를 no-hardlinks 로컬 clone으로 만들며 HEAD/tracked tree 일치를 확인한다. node_modules는 기존 pinned 의존성의 물리 복사로 마련한다(연결/junction으로 owned-files contract를 바꾸지 않음). fixed published settings commit `fb15f9675f9ea910e98363635155bc4ff9eb1d2f`를 명시 fetch/존재 확인한다. 기존 tool binary는 TOOL_AUDIT_NPM_CLI/TOOL_AUDIT_GITLEAKS에 정확한 기존 절대 경로로 지정한다. 원래 frozen private output을 clone에 복사하지 않는다. 신규 tool 설치/버전 변경이 필요하면 별도 승인받는다.
- [ ] **5. clone에서 전체 gate를 실행한다.** cwd는 위 clone으로 고정한다. 다음 순서의 exit/log/report를 보존하며 root 폴더에서 build하지 않는다. npm은 설치된 pinned CLI로 실행하고 없는 PATH npm을 전제하지 않는다.

```text
node scripts/check-toolchain.mjs
node scripts/check-runtime-inventory.mjs
node node_modules/typescript/bin/tsc -p tsconfig.json
node node_modules/typescript/bin/tsc -p tsconfig.development.json
node scripts/settings-runtime.mjs
node scripts/main-runtime.mjs
node scripts/check-build-proof.mjs
node node_modules/typescript/bin/tsc -p tsconfig.audio-tools.json --pretty false
node --test --test-concurrency=4 tests/*.test.cjs
node scripts/tool-audit.mjs
node scripts/verify-candidate.mjs dt01bCandidate
node scripts/check-installed-extension.mjs
node scripts/check-installed-extension-negative.mjs
```

  실행 전 dt01bCandidate의 목적 경로가 없음을 확인하고, 존재하면 새 영숫자 ID를 선택한다. audit의 exit0 clean/1 findings/2 tool error를 실제 report와 대조하고 기존 ESLint7을0으로 표시하지 않는다. npm/Gitleaks unavailable은 미검증이다. clean tracked clone의 기존 private-evidence-absent skip1은 이유를 기록하고 새 skip/fail은 미완료로 남긴다. P02 원본/역사 hash를 갱신하지 않는다.
- [ ] **6. 합성 CLI를 실행한다.** candidate 결과의 실제 dist로 `node scripts/check-audio-quality.mjs --root <absolute-candidate-dist-in-clone> --label dt01b-candidate`를 실행한다. fresh bundled Chromium/headless·synthetic·silent sink만 사용한다. 14 cases/18 transitions/12 alignments, qualityFailures[], 측정 대상 full-scale count0, sources1, 첫 RMS0.34–0.36, 기본값·stress profile·report 저장을 확인한다. 실측 byte 일치 대신 기존 threshold와 literal 계약을 적용한다. 사용자 Chrome·--chrome·기존 profile은 사용하지 않는다.
- [ ] **7. 비용·증거·보호를 기록하고 커밋한다.** 전후 checker cold1회/warm5회 median·extendedDiagnostics, typedef/국소 주석의 위치·근거, actual graph, raw/negative/전체 suite/도구/합성/installed 결과를 validation에 기록한다. 동기 compiler 자식은30초 timeout, 긴 CLI는 비동기로 yield하여 진행 상황을 전달한다. 새 proof의 정규 compiler 실행은 positive/negative/internal clean/internal mutant의4회다. root dist58files/ZIP/frozen2파일/버전2.13.3·보호 branch/profile을 전후 대조한다. 소유한 정확한 temp/candidate의 절대 목적 경로를 검증한 후에만 정리하고 private output에 증거를 보존한다. 실행자 정리는 기존 runner의 내부 정리와 구분한다. 종료 미확인 시 실행자가 clone/report root를 추가 삭제하지 않는다. 아래 잔여 한계를 승인 범위와 검증 결과에 명시한다.
- [ ] **8. 최종 독립 검토·공개 통합을 진행한다.** Native 구현 후 fresh Astra max whole-branch1회. 제외 항목의 판단을 기록하고 유효한 Critical/Important를 보완한다. 한글 PR을 fork main에 생성/attach하고 최종 head의 Windows/Ubuntu foundation·verify 성공 후 승인 범위에서 병합한다. main 포함·open PR·worktree·URL 의존성·remote SHA를 확인한 뒤 이번 branch만 정리한다. 다음 커서는 B2 정합성 재확인이며 DT01-C·P09/AF05 전체·기능 동결 해제로 확대하지 않는다.

## 자체 대조와 실행 방식

spec §4/5는 Task1 Interfaces/Step4, §6은 Step1/2, §7은 Step3/5/6과 Task2 연결/격리 검사, §8은 Global Constraints와 Task2 Step7/8에 대응한다. internal any control·partial1채널·metadata·getter/coercion·독립 기대값의 효과를 각각 확인한다.

권장은 **Native(주 실행자의2task 순차 구현) + 최종 Astra max 검토**다. 하나의 순수 계약과 실제 CLI 연결이므로 task별 구현 agent를 추가하지 않는다. 계획 검토/보완 후 이 계획·Native 방식·격리 로컬 검증과 아래 기존 runner 한계를 한 번에 승인받는다. 승인 전 source/test/config 변경·clone/browser/도구 점검을 실행하지 않는다. 공개 문서 PR/CI는 구현 승인이나 새 구현의 PASS가 아니다.

### 기존 설치형 runner의 잔여 한계

기존 직접 runner는 context.close 실패를 기억한 후에도 자기 disposable profile/candidate 삭제를 시도한다. harness는 worker discovery 실패 시 close 오류를 보존하지 않을 수 있고, negative는 최초 main-runtime-missing을 수용하므로 negative PASS가 종료/프로필 보존 증거는 아니다. 이번 DT01-B에서 runner나 process framework를 재설계하지 않는다.

새 synthetic 전용 owned profile만 사용하고 실제 시청/native 기준 profile은 접근하지 않는다. 원래 보호 대상의 불변과 runner 내부 disposable profile의 조건부 보존은 서로 다른 주장이다. 종료 이상이 관측되면 남은 clone/report root를 유지하고 추가 phase/실행자 cleanup을 중지하며, 임시 browser의 수동 종료가 필요하면 사용자 개입 단계로 보고한다. 이미 runner가 삭제한 profile의 보존을 주장하지 않는다. 정상/negative 기능 결과와 cleanup/종료 확인 상태를 별도 기록하고 전체 안전 종료 검증으로 합산하지 않는다.

# DT01-A — 오디오 수치·파형 요약 계약 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans after user approval. Steps use checkbox (`- [ ]`) syntax for tracking. 현재는 계획 작성·검토 단계이며 구현 완료 기록이 아니다.

**Goal:** 기존 합성 오디오 수치 함수3개와 실제 Node 요약 소비자의 strict 계약을 확인하고, 기존 API·산술·오류·검증 게이트를 보존한다.

**Architecture:** 순수 `audio-signal.mjs`를 먼저 독립 검증한 뒤 기존 metrics export와 CLI summary를 연결한다. 타입 검사는 그 모듈과 새 contract test로 제한하며 기존 untyped metrics/artifact/raw 검사는 유지한다. report gate·browser capture·owned-files를 강제로 타입화하지 않는다.

**Tech Stack:** Node 24.19.0, TypeScript 7.0.2, Node test runner, 기존 ESLint·Playwright. 신규 의존성·loader·native TS 실행은 없다.

**Spec:** [승인된 DT01 설계](../specs/2026-10-12-dt01-audio-contract-design.md). 사용자가 2026-10-12에 written-spec을 승인했다. 이 계획의 구현 승인은 별도다.

## Global Constraints

- `.mjs`·`.cjs` 실행과 `tests/*.test.cjs` 발견을 유지한다. 제품 TS/생성 JS16개·manifest·권한·버전·root dist·스토어 제출본을 변경하지 않는다.
- strict/noEmit, checkJs, noUncheckedIndexedAccess, exactOptionalPropertyTypes, useUnknownInCatchVariables를 유지한다. 제품·DT00 설정과 검사 명령을 약화하지 않는다.
- 새 순수 모듈은 기존 sample 순서·산술식·기본8ms·harmonic2..10/Nyquist·coherence1e-6·tone1e-9·오류 문자열·field/property 순서를 유지한다. numeric-loop 재작성·값 정밀도 변경·광범위한 cast/ignore·declaration facade는 금지한다.
- 정상 입력은 소유한 number[]/Float32Array/Float64Array다. proxy·mutable accessor 안정성, finite number 보장이나 browser/전체 report 타입 안전성을 주장하지 않는다.
- NUM01의 NaN/Infinity 숫자 입력 한계는 수정하지 않는다. 새 validator·serializer·오류 정책이 필요해지면 작업을 분리하고 중지한다.
- 기존14 steady·18 transition·12 alignment·stress, fresh synthetic profile·silent sink·calibration·JSON/console·quality gate 실패 기록 후 throw·finally cleanup을 유지한다.
- 비교 허용치 absolute1e-7 + relative1e-6, 부분 report 허용과 timing-sensitive diagnostics 제외는 바꾸지 않는다. 보안 감사 rules/exclusions와 private P02 baseline/ledger를 재작성하지 않는다.
- P09·AF05-B/F00–F05 게이트는 유지하며 DT01-B/C/S·DT02는 선행 구현하지 않는다. 신규 문서/공개 PR은 한국어 또는 영어다.

## Review Focus

1. 오디오 transition의 frequency 생략/undefined/null은 현재 spectral 분석을 하지 않는 정상 경로다. Task1의 세 대조와 Task2의 실제 CLI를 확인한다.
2. 채널을 바꾸거나 무음의 null 측정을 0으로 바꾸면 보고서가 조용히 달라진다. Task1의 전체 literal golden·channel order·nullable proof로 보호한다.
3. old export 테스트를 strict 파일에 import하면 deferred gate가 graph에 다시 들어온다. Task1 실제 파일 inventory와 Task2 untyped identity 검사로 분리한다.
4. moved numeric code는 기존 explicit lint 목록에 자동 포함되지 않는다. Task2에서 명시적 목록과 자동 source/snapshot/config를 각각 확인한다.
5. 정상 타입 검사가 finite 숫자·잘못된 runtime 입력 검사를 대체하면 오류 정책이 바뀐다. Task1의 raw NaN/Infinity/empty/sparse boundary·NUM01 현상 보존과 Task2 gate body 불변을 확인한다.

---

## Task 1 — 순수 수치 모듈·요약·checker를 독립 검증

**Files:** Create `scripts/audio-signal.mjs`, `tests/audio-signal-contract.test.cjs`, `tests/fixtures/audio-signal-summary.json`, `tsconfig.audio-tools.json`; Modify `package.json`(script만), `.github/workflows/ci.yml`(foundation 명령 append만). 기존 numeric 본문·CLI는 Task2 연결 전까지 그대로 둔다.

**Interfaces:** 아래 JSDoc typedef와 export를 순수 모듈 안에 정의한다. 의존성 없는 이 모듈만 새 checked test가 literal dynamic import `import('../scripts/audio-signal.mjs')`로 읽는다.

- `Samples = readonly number[] | Float32Array | Float64Array`.
- `SignalMeasurement`: samples/mean/rms/peak/overFullScaleSamples/maxAdjacentStep:number; peakDbfs/rmsDbfs/thdPercent/thdnPercent/fundamentalAmplitude:number|null; spectralReason:`''|'non-coherent-window'|'tone-not-detectable'`.
- `RmsEnvelope = {windowSamples:number,min:number,max:number}`; `ChannelMeasurement = SignalMeasurement & {envelope8ms:RmsEnvelope}`.
- `CaptureWindow = {rate:number,start:number,end:number,channels:readonly[Samples,Samples]}`; `CaptureSummary = {sampleRate:number,windowSeconds:number,channels:readonly[ChannelMeasurement,ChannelMeasurement],channelDifferenceRms:number}`.
- `measureSignal(samples:Samples,sampleRate:number,toneHz?:number|null):SignalMeasurement`, `channelDifferenceRms(left:Samples,right:Samples):number`, `rmsEnvelope(samples:Samples,sampleRate:number,windowMs?:number):RmsEnvelope`, `summarizeCapture(data:CaptureWindow,frequency?:number|null):CaptureSummary`.

- [ ] **1. 실행 계약 실패 검사 작성:** 새 테스트와 고정 fixture를 먼저 작성한다.

  `summary preserves a pinned left-only 8ms window`은 rate1000/start20/end28, left=`[0.5,-0.5,0.5,-0.5,1,-1,1,-1]`, right=zeros8을 요약해 아래 고정 fixture와 `assert.deepEqual`로 대조한다. Object.keys로 outer와 channel의 순서도 확인한다. 기대값을 이동 후 함수로 다시 생성하지 않는다.

```json
{
  "sampleRate": 1000, "windowSeconds": 0.008,
  "channels": [
    {"samples":8,"mean":0,"rms":0.7905694150420949,"peak":1,"peakDbfs":0,"rmsDbfs":-2.041199826559247,"overFullScaleSamples":0,"maxAdjacentStep":2,"thdPercent":null,"thdnPercent":null,"fundamentalAmplitude":null,"spectralReason":"","envelope8ms":{"windowSamples":8,"min":0.7905694150420949,"max":0.7905694150420949}},
    {"samples":8,"mean":0,"rms":0,"peak":0,"peakDbfs":null,"rmsDbfs":null,"overFullScaleSamples":0,"maxAdjacentStep":0,"thdPercent":null,"thdnPercent":null,"fundamentalAmplitude":null,"spectralReason":"","envelope8ms":{"windowSamples":8,"min":0,"max":0}}
  ],
  "channelDifferenceRms": 0.7905694150420949
}
```

  이 값은 왼쪽 에너지5/8·오른쪽0의 손계산과 현재20dda08의 읽기 전용 대조에 근거한다. 구현 중에는 고정 기대값으로 취급한다.

- [ ] **2. 정상·실패 실행 검사 작성:** 같은 새 test 파일에서 아래 literal assertion을 추가한다.
  - `frequency omission undefined and null are equivalent`: 동일 capture에 세 호출을 해 deepEqual, 양쪽 thd/thdn/fundamental null·reason `''`. `measureSignal(Array(8).fill(0),1000,125)`는 정합된 무음 구간이므로 `tone-not-detectable`; 48kHz에서1kHz tone의4801 samples는 `non-coherent-window`와 null THD.
  - `owned sample buffers retain numeric meaning`: number[]·Float32Array·Float64Array의 `[0.5,-0.5]`를 rate1000으로 측정해 rms0.5/peak0.5/mean0·length2. 저장된 원본 배열/typed array가 변하지 않음.
  - `numeric boundaries retain real failure behavior`: measureSignal empty→`samples required`, [0,NaN]/[0,Infinity]/sparse array→`non-finite audio sample`; rate0/NaN→`invalid sample rate`; tone0/Nyquist→`invalid tone frequency`; stereo 길이 불일치→`equal nonempty channels required`; envelope len1/rate1000/window2→`invalid envelope window`.
  - `NUM01 remains a separate policy`: envelope([0.5,-0.5],NaN,2)와 windowMs NaN의 windowSamples가 NaN, min Infinity, max0. JSON stringify로 NaN을 null로 치환한 결과를 검사하지 않는다.
- [ ] **3. RED 관측:** `node --test tests/audio-signal-contract.test.cjs` 실행. 새 모듈/설정 부재로 정상/연결 검사가 실패해야 한다. 없는 import가 negative compiler proof의 성공으로 인정되지 않도록 정상 compile 대조를 먼저 둔다.
- [ ] **4. 최소 모듈 작성:** `audio-metrics.mjs`의 처음 세 함수 본문과 CLI의 local summarize 본문을 신규 순수 모듈로 복사한다. 기존 세 함수는 다음 task까지 남긴다. 명시적 JSDoc·기존 finite 검사의 근거로 작은 좁히기를 추가하되 오류·계산·순서를 바꾸지 않는다. map 결과의 tuple 단언은 입력이 소유한 두-channel tuple이고 map이 순서/길이를 보존한다는 근거를 코드1줄·validation에 기록하거나, 더 작은 무단언 표현으로 같은 동작을 입증한다.
- [ ] **5. 개발 설정·CI 연결:** `tsconfig.audio-tools.json`은 `extends: './tsconfig.development.json'`, `files: ['scripts/audio-signal.mjs','tests/audio-signal-contract.test.cjs']`, `include: []`. `package.json`에 `typecheck:audio-tools: 'tsc -p tsconfig.audio-tools.json'`만 추가한다. foundation의 check:build-proof 뒤에 `&& npm run typecheck:audio-tools`를 append한다. 기존 정확한 DT00 명령 구간은 보존한다. lockfile·기존 npm script·제품 설정은 변경하지 않는다.
- [ ] **6. checker의 범위·오용 증명:** 새 test에서 Node `spawnSync(process.execPath,[local tsc,'-p',config],{encoding:'utf8',timeout:30000,maxBuffer:1048576})`를 사용한다. 정상 compile은 error/signal 없음·status0·진단0. `--listFilesOnly`에서 repository 구현 graph는 순수 모듈+새 검사뿐이고 deferred metrics/gate/CLI/artifacts/owned-files/helpers가 없음을 assert한다. config의 effective strict 옵션·양 OS CI 마지막 명령·새 test glob 포함도 확인한다.
  - ignored `output/audio-types-*`의 고유 mkdtemp 디렉터리에 noEmit 전용 proof.mts를 만들고 정리 hook을 둔다. static import `../../scripts/audio-signal.mjs`, inherited config에 files:[proof]·include:[]만 지정한다. 파일을 실행하지 않는다.
  - 각각 bad Samples `measureSignal(['wrong'],48000)`→TS2322/TS2345, sampleRate 문자열→TS2345, capture1/3 channels→TS2322/TS2345, 없는 summary 필드→TS2339, 좁히지 않은 nullable THD 연산→TS2531/TS18047. 오류는 해당 proof 파일·식의 줄·허용 코드만 인정하고 imported-source/library/error/timeout/missing-module 진단은 실패로 처리한다.
  - 정상 proof에서 readonly number[]/Float32Array/Float64Array, 두 channel tuple, frequency 생략·undefined·null, spectral nullable 값의 assertion 후 연산을 확인한다. any-returning createRequire로 타입을 우회하지 않는다.
- [ ] **7. GREEN·집중 회귀:** `node node_modules/typescript/bin/tsc -p tsconfig.audio-tools.json`과 `node --test tests/audio-signal-contract.test.cjs tests/development-types.test.cjs tests/audio-metrics.test.cjs tests/audio-artifacts.test.cjs` 실행. 모두 통과, 기존19개 유지, imported file graph 제한·compiler 오용 거부·임시 디렉터리 잔여0을 확인한다.
- [ ] **8. 독립 단위 커밋:** 위 create 파일·package script·CI append만 stage해 `test: 순수 오디오 수치·요약 계약 검사 추가`로 기록한다. 제품·DT00·기존 gate를 수정하지 않았는지 diff를 확인한다.

## Task 2 — 구 API·실제 CLI와 기존 검증 게이트 연결

**Files:** Modify `scripts/audio-metrics.mjs`, `scripts/check-audio-quality.mjs`, `tests/audio-metrics.test.cjs`, `tests/tool-warning-remediation.test.cjs`, `tests/tool-audit.test.cjs`; Create `docs/superpowers/validation/2026-10-12-dt01a-audio-signal-contracts.md`; Modify `PLANS.md`/이 계획의 체크리스트.

**Interfaces:** Task1의 measureSignal/channelDifferenceRms/rmsEnvelope/summarizeCapture를 소비한다. 구 `audio-metrics.mjs`의 세 numeric export는 새 모듈의 같은 function 객체를 re-export하고 `audioQualityFailures`는 기존 raw/partial API를 유지한다. CLI는 summarizeCapture의 rate/start/end/두 channel 입력과 기존 summary 출력만 소비한다.

- [ ] **1. 구 경로·감사 연결 실패 검사:** 기존 **untyped** metrics test에 old와new 수치3개 `strictEqual` identity와 old-path `[-1.2,0,1.2]` RMS0.9797958971132712(오차1e-12)/peak1.2/overFullScale2를 검사한다. compiler 대상 새 test에서 old metrics를 import하지 않는다. tool-audit test에 `sourceFiles(real repo)`가 새 mjs를 포함함을 assert하고, `snapshotInput(real repo)`의 해당 file/sha256이 실제 파일의 SHA-256과 일치하는지 확인한다. lint 회귀의 명시적 파일 목록에 새 module을 추가하며 실제 lint 결과를 확인한다. 검사 rules/exclusions는 변경하지 않는다.
- [ ] **2. RED 관측:** old/new identity 검사는 같은 numeric 본문이 두 모듈에 남아 있어 실패해야 한다. source inventory의 새 파일 존재 검사는 Task1 이후 이미 통과할 수 있음을 구분한다. 기존 명시적 lint의 새 module 미포함은 source diff/검사 대상 inventory로 확인하며, 그 자동 포함을 주장하지 않는다.
- [ ] **3. 최소 연결:** `audio-metrics.mjs`에서 세 numeric 본문을 제거하고 `export {measureSignal,channelDifferenceRms,rmsEnvelope} from './audio-signal.mjs'`로 교체한다. CLI는 old module에서 audioQualityFailures만 읽고 new module에서 summarizeCapture를 읽으며 local summarize를 제거한다. steady1·transition before/change/after3·stress1의 기존5개 호출 위치를 이름만 바꾸고 나머지 browser capture/시간/JSON/throw/finally 본문은 유지한다.
- [ ] **4. GREEN·누락 방지:** 집중 명령 `node --test --test-skip-pattern='^P02 warning ledger closes every baseline row and preserves every latest guarded observation$' tests/audio-signal-contract.test.cjs tests/audio-metrics.test.cjs tests/audio-artifacts.test.cjs tests/development-types.test.cjs tests/tool-warning-remediation.test.cjs tests/tool-audit.test.cjs`를 실행한다. 과거 private P02 input-hash assertion은 현재 작업과 일치할 수 없으므로 public-condition 명령에서 그 정확한 이름만 제외하고 원본 두 파일 해시를 전후 기록한다. 새 `.mjs`의 실제 source snapshot·ESLint config 적용·명시적 lint 검사와 old export identity를 모두 확인한다.
- [ ] **5. 소스·결정적 출력 보존:** 승인 기준20dda08의 gate 본문과 연결 후 gate 본문을 EOL만 정규화해 비교한다. audio-artifacts/owned-files/product source·생성 JS16개·manifest·제품/DT00 tsconfig·lockfile diff0, root dist 전후 불변을 기록한다. 고정 summary fixture·오류·순서 검사에서 기대값을 재생성하지 않는다.
- [ ] **6. 실제 CLI 합성 검사:** `node scripts/check-audio-quality.mjs --label dt01a-source`로 기존 fresh synthetic/silent sink 경로를 실행한다. 보고서에14 cases·18 transitions·12 alignments, qualityFailures[]·검사 대상 출력 채널의 full-scale count0, source1·기존 calibration·출력 key/label·stress profile이 유지되어야 한다. 브라우저 측정은 기존 허용치·게이트로 판정하고 timing-sensitive 실측값의 byte equality를 요구하지 않는다. 고정 summary golden은 별도로 정확히 일치해야 한다. `--unknown`은 기존 인자 거부 경로로 browser 시작 전 실패해야 한다. quality gate 실패 report를 남긴 후 throw하고 finally가 browser를 닫는 기존 순서를 source diff와 기존 실행 증거로 대조한다. calibration·인자·capture 오류까지 새 report 정책을 추가하지 않는다. 사용자 방송/profile/speakers를 건드리지 않는다.
- [ ] **7. 전체 게이트:** 제품·DT00·audio-tools strict, runtime inventory/settings/main drift/build proof, 공개조건 전체 테스트(concurrency4), 기존 npm advisory/ESLint/Gitleaks 점검 경로, 격리 candidate/package와 설치형 positive/negative E2E를 실행한다. 현재 scanner의 경고·제외·실패를 PASS로 덮어쓰지 않는다. root dist 대신 격리 candidate만 만들고 새 audit run을 기존 evidence 경로와 구분한다.

```text
node node_modules/typescript/bin/tsc -p tsconfig.json
node node_modules/typescript/bin/tsc -p tsconfig.development.json
node node_modules/typescript/bin/tsc -p tsconfig.audio-tools.json
node scripts/check-toolchain.mjs
node scripts/check-runtime-inventory.mjs
node scripts/settings-runtime.mjs
node scripts/main-runtime.mjs
node scripts/check-build-proof.mjs
node --test --test-concurrency=4 --test-skip-pattern='^P02 warning ledger closes every baseline row and preserves every latest guarded observation$' tests/*.test.cjs
node scripts/tool-audit.mjs
node scripts/verify-candidate.mjs dt01aCandidate
node scripts/check-installed-extension.mjs
node scripts/check-installed-extension-negative.mjs
```

  candidate ID는 실행 전에 미존재 경로임을 확인한다. 이미 존재하면 새 영숫자 ID를 골라 기존 산출물을 보존한다. verifyCandidate가 build와 package 검사를 함께 수행하고 설치형 runner도 자체 고유 candidate를 생성한다. 감사 exit0은 clean, exit1은 실제 findings, exit2는 검사 오류/입력 불안정으로 구분해 기록한다. npm/Gitleaks 실행 환경이 없으면 미검증으로 남기고 완료로 표시하지 않는다.
- [ ] **8. 실효성 기록·커밋:** compile/run 시간·추가 주석/단언·변경/unchanged file graph·모든 회귀 수와 환경 제한·NUM01 미해결을 validation에 기록한다. meaningful compiler rejection과 독립 literal oracle 유지가 확인돼야 완료한다. source/test/validation/PLANS를 한 단위로 커밋한다.
- [ ] **9. 독립 검토·한글 PR:** 주 실행자 순차 구현 뒤 Astra max whole-branch 검토1회, Critical/Important 수정과 실패→성공/전체 회귀를 완료한다. 한글 PR 생성·task 연결 후 마지막 커밋의 Windows·Ubuntu foundation과 전체 verify 통과를 확인하고 기존 승인 범위대로 병합한다. DT01 전체/B/C/NUM01 완료로 표시하지 않는다.

## 자체 대조와 실행 승인

spec의 nullable·tuple·raw·old-path·기본값·명시적 lint·actual import graph·calibration·private 증거·제품 불변 요구를 Task1/2에 각각 연결했다. 두 task는 Task1의 명시적 export 계약으로 연결되며 최종 tree에는 numeric 복제 본문을 남기지 않는다.

Astra max의 read-only 공격적 검토 결과는 Critical0·Important0·Minor1이었다. 무음에 valid tone만 주면 항상 `tone-not-detectable`이라는 모호한 검사 입력을 지적했다. 현재 코드에서8 samples/rate1000/tone100은 `non-coherent-window`, tone125는 `tone-not-detectable`임을 주 실행자도 재확인하고 Task1 입력을 후자로 고정했다.

검토자는 현재 CLI 본문의 고정 golden·outer/channel key 순서·frequency 생략/undefined/null, five call sites·CI assertion 보존·lint/inventory/snapshot 구분·NUM01 현상을 읽기 전용으로 확인했다. 주 실행자의 기준 metrics/artifacts19/19, 문서 링크·언어·diff 검사와 동결 P02 해시 불변도 확인했다. 신규 compiler proof·성능·전체 오디오/설치형 회귀·보안 인증은 아직 검증하지 않았으며, 구현 단계의 체크박스를 미완료로 유지한다.

한 경계의 두 순차 작업이므로 **Native(주 실행자 직접 구현) + 최종 Astra max 독립 검토**를 권장한다. 이번 계획·공격적 검토 요청으로 구현은 시작하지 않는다. 사용자가 이 계획과 실행 방식을 승인하면 확장 새로고침 없이 구현→검증→PR/CI→병합을 이어간다.

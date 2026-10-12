# DT01 — 개발 오디오 계약 강화 상세 설계

작성일: 2026-10-12 / Asia-Seoul. 기준: DT00 병합 `4ed37a3`.

## 1. 목적·선택과 승인 범위

합성 오디오 검사에서 수치 분석·요약의 계약 오용을 checker가 빠르게 거부하도록 한다. 파일 확장자나 GitHub Languages 비율을 목표로 삼지 않는다. 이번 요청은 **세부 설계·공격적 검토·PLANS 반영**이며 구현·설치·제품 변경을 승인한 것은 아니다.

대안은 세 가지다.

- settings fixture/reply: broker callback·지연·clone·Chrome fake 전체가 연결돼 첫 확장 단위가 커진다. 별도 후속으로 보류한다.
- 오디오 CLI·report·artifact 전체: browser realm·worklet 문자열·파일 capability와 imported JS 검사까지 함께 늘어난다. 한 번에 checker 대상에 넣지 않는다.
- **선택: 순수 수치·파형 요약부터 분리하고 실제 연결을 검사한다.** 현재 함수 본문을 이동하는 최소 모듈 한 개를 두고, full report gate와 부분 report 비교는 다음 독립 설계로 남긴다.

이는 기존 호출 경계를 분리하는 architectural 설계다. 상세 구현 계획 작성·사용자 검토 전에는 코드를 바꾸지 않는다. P09·AF05-B 및 F00–F05 선행 조건은 바꾸지 않으며 DT01을 새 출시 게이트로 추가하지 않는다.

## 2. 기존 흐름과 분할 이유

`scripts/check-audio-quality.mjs`의 browser capture → Node 로컬 `summarize` → `audio-metrics.mjs`의 세 수치 함수 → report 조립·quality gate → JSON 저장/CLI 실패 순서를 유지한다.

기존 `audio-metrics.mjs`는 순수 수치 함수와 loose report gate를 함께 담고 있다. `audio-artifacts.mjs`는 부분 report 비교와 파일 읽기를 함께 담고 있으며 `owned-files.mjs`를 import한다. checker의 명시적 `files` 목록이나 `exclude`는 import graph를 차단하지 않으므로, 이들을 일괄 포함하면 작은 실험이 파일 capability·브라우저 fake 이전으로 확대된다. 임의 declaration facade, `@ts-nocheck`, 광범위한 cast로 그 확대를 숨기지 않는다. [공식 TSConfig 설명](https://www.typescriptlang.org/tsconfig/#exclude)

현재 CLI를 strict/noEmit 대상으로 읽기 전용 조회한 결과, repository JS graph에는 metrics·artifacts·owned-files·tests/helpers·CLI가 들어갔고 진단은 각각10/23/42/0/54개였다. 이129개 진단은 현재 미명시 타입 조회이며129개 버그/취약점 발견이 아니다. 검사 설정을 약화해 없애지 않고 작은 순수 graph로 분리하는 근거로 삼는다.

기존 metrics/artifacts 실행 검사는 설계 기준에서 **19/19 통과**했다. 새로운 타입 설계가 검증된 구현이라는 뜻은 아니다.

## 3. DT01-A — 다음 구현 계획의 유일한 범위

### 파일과 연결

| 파일 | 변경 책임 |
| --- | --- |
| `scripts/audio-signal.mjs` 신규 | 기존 measureSignal·channelDifferenceRms·rmsEnvelope 본문과 CLI의 기존 summarize 본문 이동; 명시적 JSDoc 계약 |
| `scripts/audio-metrics.mjs` | 수치3개를 기존 이름으로 re-export; audioQualityFailures 본문·raw/partial 허용·오류는 그대로 |
| `scripts/check-audio-quality.mjs` | 기존 로컬 summarize 대신 summarizeCapture import와 호출 연결만 변경; capture/evaluate/worklet/report/cleanup은 그대로 |
| `tests/audio-signal-contract.test.cjs` 신규 | 실제 수치·요약 소비자, nullable 값·malformed runtime 입력·compiler 오용 검사 |
| `tests/audio-metrics.test.cjs` | 기존 untyped 실행 검사 유지, 구/새 module의 수치 export identity·구 경로 호환성 확인; 새 checker에는 import하지 않음 |
| `tsconfig.audio-tools.json` 신규 | 기존 개발 strict/noEmit 설정 재사용; 위 순수 모듈·새 검사만 명시적 files 대상으로 지정 |
| package script·CI·연결 검사 | 기존 제품/DT00 검사 유지, 별도 `typecheck:audio-tools`를 양 OS foundation에 연결; 실제 compiler graph·테스트 발견·새 mjs 감사 포함 확인 |
| `tests/tool-warning-remediation.test.cjs` | 기존 development report lint의 명시적 파일 목록에 새 audio-signal.mjs 추가; 기존 rules·exclusions·observations 의미는 유지 |

새 loader·패키지·runtime JS 생성 단계·`.mts` 실행을 추가하지 않는다. 기존 tests의 이름과 glob을 유지한다. 불필요한 module wrapper·interface facade·새 report serializer를 만들지 않는다.

새 strict config는 `tsconfig.development.json`을 extends하되 `files`를 **audio-signal.mjs와 새 contract test 두 파일로 override**한다. 새 checked test는 이 순수 모듈만 import하고, 구 경로 identity 확인은 기존 untyped metrics test에서 수행한다. 구 metrics를 checked test에 import해 deferred gate를 graph에 다시 끌어오지 않는다. CI의 새 명령은 기존 foundation의 check:build-proof 뒤에 append하여 `tests/development-types.test.cjs`의 DT00 명령 순서 assertion을 보존하고, 새 검사에서도 마지막 명령 실행을 확인한다.

### 계약

JSDoc typedef는 순수 모듈 안에서 정의하고 type-only로 소비한다. 별도의 거대한 full-report 모델을 앞서 만들지 않는다.

- `Samples = readonly number[] | Float32Array | Float64Array`. 소유한 숫자 배열/typed array가 정상 입력이며 임의 `.at` 구현·mutable accessor·proxy의 안정성을 주장하지 않는다.
- `measureSignal(samples: Samples, sampleRate: number, toneHz?: number | null): SignalMeasurement`.
- `SignalMeasurement`: samples·mean·rms·peak·overFullScaleSamples·maxAdjacentStep는 number. peakDbfs·rmsDbfs·thdPercent·thdnPercent·fundamentalAmplitude는 **number | null**. spectralReason은 `'' | 'non-coherent-window' | 'tone-not-detectable'`.
- `channelDifferenceRms(left: Samples, right: Samples): number`.
- `rmsEnvelope(samples: Samples, sampleRate: number, windowMs?: number): RmsEnvelope`, 필드는 windowSamples·min·max:number.
- `CaptureWindow`: rate·start·end:number, channels:`readonly [Samples, Samples]`는 기존 capture가 만드는 **두 numeric channel의 tuple**. 단순 `number[][]`로 넓혀 shape 오류를 숨기지 않는다.
- `summarizeCapture(data: CaptureWindow, frequency?: number | null): CaptureSummary`. sampleRate·windowSeconds·channelDifferenceRms:number, channels:`readonly [ChannelMeasurement, ChannelMeasurement]`; ChannelMeasurement는 `SignalMeasurement & { envelope8ms: RmsEnvelope }`다. tuple을 만들기 위해 shape 근거 없는 단언을 쓰지 않으며 기존 두 채널의 순서·산술·출력 배열을 보존한다.

summarizeCapture는 기존 Node summarize를 옮긴 **실제 수치 함수 소비자**다. producer/consumer 연결 검사는 이 순수 요약 경계까지이며 browser capture·CLI caller·전체 report envelope가 strict 검사됐다고 주장하지 않는다. raw 수치 실패 입력은 기존 untyped 실행 검사 또는 명시적 raw 호출 경로로 보존한다. 숫자 NaN·Infinity·빈 배열은 타입상 가능하므로 런타임 검사를 제거하지 않는다.

## 4. 의미 보존과 실패 처리

- 샘플 순서·산술식·같은 window·기본8ms·harmonic2..10/Nyquist·coherence1e-6·tone1e-9, 오류 문자열과 반환 field·property 순서를 유지한다.
- `.at()`의 undefined를 없다고 단언하지 않는다. 이미 실행되는 finite 검사와 실제 index 범위가 근거인 작은 좁히기만 허용한다. loop 재작성·정밀도/배열 표현 변경·새 실패 정책은 분리한다.
- 기존 CLI의14 steady·18 transition·12 alignment·stress, pause/재생·silent sink·fresh profile·calibration·catch/finally·JSON/console 출력·quality 실패 시점은 그대로다.
- `audioQualityFailures`의 raw/partial 동작과 artifact의 부분 report 비교를 full model로 강제하지 않는다. 비교 허용치 absolute1e-7 + relative1e-6, timing-sensitive diagnostics 제외도 유지한다.
- 타입 검사 비용 때문에 DT00 설정의 strict·대상 목록이나 제품 tsconfig를 약화하지 않는다. 실제 imported-file 목록을 기록하고 불필요한 의존성 graph 확장이 보이면 중단한다.

### 확인된 숫자 입력 한계 — 타입 이전과 별개

읽기 전용 조회에서 현재 `rmsEnvelope([0.5,-0.5], NaN, 2)`와 windowMs NaN은 `{ windowSamples: NaN, min: Infinity, max: 0 }`를 반환했다. number 타입은 finite를 보장하지 않으며, DT01-A에서 이를 새 예외로 바꾸면 동작 변경이 된다. 정상 CLI가 AudioContext sampleRate와 고정 window를 쓰는 사실과 이 API의 일반 숫자 입력 한계를 구분한다.

이 상태를 “안전한 유한 결과”라고 선언하거나 cast로 숨기지 않는다. 별도 **NUM01 숫자 입력 경계 보완** 후보로 기록한다. 정책은 아직 정하지 않으며 DT01-A·기능 로드맵의 선행 게이트로 자동 추가하지 않는다. 보완이 필요하면 NaN/Infinity/0/음수 window·sampleRate와 명시적 오류의 별도 설계·회귀로 처리한다.

## 5. 공격적 검토·완료 조건

구현 계획에서 다음을 테스트 이름·정확한 값·실패/성공 명령으로 구체화한다.

1. 잘못된 Samples 요소, sampleRate 문자열, capture의 누락된/추가 channel, 없는 summary 필드, nullable spectral 값을 좁히지 않은 산술 접근을 **각각** 실제 compiler 진단으로 거부한다. 정상 number[]/Float32Array/Float64Array와 frequency 생략·명시적 undefined·null 대조는 모두 통과해야 한다. 현재 CLI transition 요약은 frequency를 생략한다.
2. 기존 untyped `tests/audio-metrics.test.cjs`에서 metrics API 구 경로/이름과 새 모듈의 수치 exports identity를 확인하고, 구/새 경로의 hand-derived `[−1.2,0,1.2]` RMS와 stereo/envelope 경계를 보호한다. expected를 이동한 함수로 재계산하지 않는다.
3. 이동 전후 capture summary를 검토 시점에 고정한 literal/golden으로 비교한다. 무음의 null dBFS/spectral, 비정합 window, phase·8ms envelope, left-only channel, NaN/Infinity·empty sample의 기존 실패도 보호한다.
4. compiler proof는 지정 파일·지정 오류만 인정하고 정상 대조를 먼저 확인한다. ESM `.mjs`를 any-returning createRequire/동적 계산 경로로 읽어 type proof를 무력화하지 않는다. 필요하면 ignored 임시 `.mts`를 **noEmit compiler 입력에만** 사용하며 실행하지 않는다.
5. CLI summary 호출 연결을 실제 합성 오디오 실행으로 확인한다. calibration·14/18/12·qualityFailures0·full-scale0와 출력 구조/label·artifact root 선택·잘못된 CLI 인자 거부·failure 기록 후 throw 순서를 유지한다. 실제 방송·사용자 profile을 녹음하지 않는다.
6. 양 OS strict 검사, 기존19개 metrics/artifact 실행 회귀, DT00·공개조건 전체 회귀·격리 candidate/package·설치형 positive/negative를 유지한다. 새 `.mjs`의 sourceFiles/snapshot/ESLint config 자동 포함과 `tests/tool-warning-remediation.test.cjs`의 **명시적 development report lint 파일 목록 추가**를 각각 확인한다. lintFiles는 import를 따라 검사하지 않으므로 숫자 본문을 옮겼다고 기존 목록의 보호가 자동 이전되지는 않는다. 과거 private 증거는 재작성하지 않는다.
7. 제품 JS16개·manifest·버전·root dist·스토어 제출본 불변, compiler/fixture 임시 경로 정리·추가 검사 시간·단언 위치·unchecked 경계를 기록한다.

새 런타임 validator·임의 DTO decoder·무관한 fake 타입화나 파일 capability 수정이 없이는 통과할 수 없다면 멈추고 범위를 다시 설계한다. 의도한 오류 검출 없이 annotation만 늘면 확대하지 않는다.

## 6. 후속 단위와 상태

- **DT01-A:** 이 문서의 순수 수치·요약 계약. 상세 구현 계획 작성과 사용자 승인 전에는 구현하지 않는다.
- **DT01-B:** full measurement/transition kind-value·quality gate의 정상/partial/raw 경계. 별도 상세 설계 전에는 전체 gate를 typed라고 표시하지 않는다.
- **DT01-C:** artifact description과 부분 report projection·comparison 및 owned-files dependency 경계. 기존 partial 허용과 malformed throw/return 정책을 먼저 inventory한 후 별도 설계한다.
- **DT01-S:** settings reply/fixture는 보류. 오디오 단계 완료만으로 자동 착수하지 않는다.
- **NUM01:** 확인된 rmsEnvelope 숫자 입력 한계의 별도 correctness 보완 후보. 취약점 판정이나 현재 정상 방송 재생 결함으로 확대 해석하지 않는다.

DT01 전체는 A만 완료됐다고 완료 처리하지 않는다. 이번 설계 변경의 실제 구현 효과·성능·출력 동일성은 아직 검증하지 않았다.

## 7. 공격적 검토 결과와 반영

Astra max가 연결된 소스·호출자·기존 검사를 기준으로 검토했다. Critical0, Important1: 숫자 본문 이전 후 기존 명시적 lint regression 목록에서 새 모듈이 빠질 수 있다는 지적이었다. 실제 `tests/tool-warning-remediation.test.cjs`의 lintFiles 목록을 대조하고 파일 책임·완료 조건에 새 모듈 추가를 명시하여 보완했다. 기존 해당 회귀의 설계 기준 실행도1/1 통과했다. 자동 source inventory와 명시적 회귀 목록은 서로 다른 게이트로 관리한다.

추가 구현 계획 주의점도 반영했다: old-export 검사는 untyped 기존 파일에 유지, frequency 생략/undefined/null 대조, justified tuple shape와 `.map` 의미 보존, 기존 DT00 CI assertion을 유지하는 append 연결. NUM01 정책·full report/artifact/settings·browser producer typing과 미구현 성능/출력 동일성은 검토의 제외 범위로 남는다. 별도 보안 인증이나 구현 완료 판정이 아니다.

현재 판정: 지적 사항을 문서에 반영했으며 written-spec 사용자 검토 단계다. 다음은 이 설계 승인 후 DT01-A의 정확한 파일·검사·명령을 가진 구현 계획 작성이다. 이번 요청으로 그 구현을 선행하지 않는다.

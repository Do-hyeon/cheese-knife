# DT01-B — 오디오 quality report 계약 상세 설계

작성 시작: 2026-10-12 / 검토·보완: 2026-10-13 / Asia-Seoul. 상태: written-spec 승인 대기. 구현 계획·구현·브라우저 실행은 아직 승인하지 않았다.

## 1. 목적과 순서

DT01-A의 순수 수치·`CaptureSummary` 계약을 기존 quality gate까지 연결한다. 정상 측정 보고서의 transition kind/value 불일치, 누락 필드, 잘못된 채널 수를 컴파일 단계에서 발견하고, 기존 partial/raw 호출의 반환·예외·실패 순서는 그대로 보존한다.

순서는 DT01-B 설계·검토 → written-spec 승인 → 상세 구현 계획·검토·실행 승인 → 구현·검증 → AF05-B2 계획 정합성 재확인이다. DT01-B 우선은 작업 순서 선택이며 B2의 기술적 필수 의존성이나 새로운 출시 게이트가 아니다. DT01-C를 B2 선행 조건으로 추가하지 않는다. F00–F05 동결과 P09/AF05-B의 공개 수용 기준도 유지한다.

개발 도구의 정적 계약만 다룬다. 컴프레서 알고리즘·파라미터·수치 한계·음질 개선, NUM01 입력 정책, 보안 인증과 실제 방송 수용을 대신하지 않는다.

## 2. 대안과 결정

1. **권장: 기존 순수 gate에 JSDoc 계약을 추가하고 정상 경로를 좁은 타입의 alias로 연결한다.** 기존 export와 런타임 의미를 유지한다. wrapper나 변환기는 만들지 않는다.
2. 기존 함수 인자를 정상 report로만 좁힌다. 간단하지만 기존 partial 호출을 없애거나 타입 단언으로 숨기므로 제외한다.
3. runtime schema validator를 추가하거나 전체 browser CLI를 strict graph에 편입한다. 새 오류 정책·브라우저/파일 capability로 범위가 확대되므로 제외한다.

기존 `audio-metrics.mjs`는 순수 수치 export와 gate뿐이다. 새 모듈·schema 패키지·일반 report framework·파일 이동은 필요하지 않다. `.mjs`/`.cjs`와 현재 Node 실행·테스트 발견 경로를 유지한다.

## 3. 연결 범위

| 위치 | 변경 목적 | 보존 조건 |
| --- | --- | --- |
| `scripts/audio-metrics.mjs` | 정상/partial JSDoc, 정상 alias | 기존 export identity·gate 계산/반환/예외/순서 |
| `scripts/check-audio-quality.mjs` | 정상 report 호출의 alias import | capture/calibration/저장/log/throw/finally 순서 |
| `tests/audio-quality-contract.test.cjs` | checked 정상 소비자·compiler proof | 실제 summarizeCapture와 gate, 독립 literal oracle |
| `tests/audio-metrics.test.cjs` | partial/raw 런타임 대조 | raw 입력을 typed fixture로 변환하지 않음 |
| `tests/fixtures/audio-quality-compatibility.json` | 기존 결과/오류 기준 | JSON 불가 값은 태그를 입력으로만 복원 |
| `tsconfig.audio-tools.json` | gate·checked 소비자 추가 | strict/noEmit·npm/CI 순서 |
| `tests/audio-signal-contract.test.cjs` | config/listFiles 기대 graph 갱신 | 기존 수치·요약 proof 유지 |
| 기존 CLI·tool-warning-remediation 검사 | 실제 연결 회귀 | lint inventory·기존 경고·감사 범위 유지 |
| `PLANS.md`, 검증 문서 | 단계별 승인·증거·제외 범위 | 구현·출시 완료를 앞당기지 않음 |

`audio-signal.mjs`의 타입을 재사용한다. `audio-artifacts.mjs`, `owned-files.mjs`, settings fixture, browser runner는 변경 대상이 아니다. CLI는 호출 연결만 바꾸며 전체 파일을 strict 검사했다고 주장하지 않는다.

## 4. 정상 report 타입

`audio-metrics.mjs`에 JSDoc typedef를 둔다. `CaptureSummary`와 측정 타입은 `audio-signal.mjs`에서 import한다.

- `QualityCase`: `CaptureSummary`와 frequency/inputAmplitude/gain의 number, enabled/bursts의 boolean, `stereo:'identical'|'left-only'`.
- `QualityTransition`: 공통 frequency와 before/change/after `CaptureSummary`에 `{kind:'enabled',value:boolean}` 또는 `{kind:'gain',value:number}`를 결합한다. kind/value를 독립 union으로 만들어 상관관계를 잃지 않는다.
- `DelayAlignment`: sampleRate/expectedFrame/dryFirst/dryLast/compressorFirst/compressorLast의 number. 정수·음수·최대1023·동일 frame은 기존 runtime gate가 판정한다.
- `QualityReport`: 위 cases/transitions/alignments의 readonly 배열과 `CaptureSummary & {profile:string}` stress. 정상 측정 채널은 기존 readonly 2채널 tuple이다.

이는 gate 입력의 완전한 계약이지 browser/artifact/nodes/limits까지 포함한 출력 JSON schema가 아니다. 추가 metadata와 qualityFailures가 있는 실제 report 변수도 구조적으로 사용한다. metadata를 지우거나 stringify round-trip을 넣지 않는다. number는 finite·양수·coherent tone을 보장하지 않으며 readonly는 runtime freeze가 아니다.

## 5. 정상 호출과 partial/raw 경계

기존 `audioQualityFailures` export/함수는 partial report gate다. 기본 `{}`를 유지하고 읽는 선택 필드를 `QualityGateInput`으로 설명한다. root 필드의 생략, nullable 배열 항목, 부분 측정 채널·envelope·alignment를 모델링한다. partial transition 채널은 일반 배열이고 현재 첫 채널만 사용하는 의미를 유지한다. 정상 2채널 요구를 partial 경로에 전파하지 않는다.

정상 alias `audioQualityReportFailures`는 `(report:QualityReport)=>string[]` 타입의 변수에 기존 함수를 대입한다. cast가 아니며 동일 함수 identity다. CLI는 새 export를 기존 지역 이름으로 import하여 호출을 유지한다. identity와 동일 정상 입력의 결과를 검사한다.

raw JavaScript는 정적 허용 범위를 벗어날 수 있다. malformed 검사는 unchecked 테스트에 남긴다. null/wrong-container/numeric-string/truthy-number를 정상 타입으로 거짓 단언하지 않는다. 정규화·필터·빈 report 대체·예외의 실패 배열 전환은 하지 않는다. 정상 alias의 unknown overload나 any escape hatch는 금지한다.

`Array.isArray` 뒤에 선언된 partial 배열 원소 타입을 **반드시 복원**한다. cases/transitions/alignments·stress.channels·case.channels의 해당 읽기/반복에 국소 타입 주석을 두며 any[] narrowing을 검사의 대체물로 삼지 않는다. 이는 선언된 인자 타입 복원이지 raw 원소의 런타임 검증이 아니다. 전체 report cast·@ts-nocheck·@ts-ignore·광범위 any는 금지한다.

기존 finite envelope guard가 증명한 local RMS/channel 존재만 국소 narrowing으로 표현한다. 다음 두 곳은 그 guard가 증명하지 않으므로 별도 최소 경계를 명시한다:

1. baselineStep의 기존 Math.max 호출에만 `(number|undefined)[]`를 받는 native callable-signature 주석을 둔다. undefined를 NaN으로 처리하는 호출 의미이며 입력 자체가 number라고 cast하지 않는다. 새 wrapper·Number 변환·기본값은 없다. raw null/string/BigInt 등의 실제 native coercion/예외도 유지한다.
2. 기존 상한 peak 비교가 읽는 바로 그 위치에서 `const peak=channel?.peak`로 읽고 `peak!==undefined && peak>0.9801`로 비교한다. 메시지는 기존 `channel.peak` 읽기를 유지한다. null도 partial 타입에 포함하면 동등한 null guard를 둘 수 있다. 반환·예외·getter 읽기 횟수/순서를 유지하는 국소 수정이며 유한성 filter·정규화·threshold 변경이 아니다.

상세 계획에 각 주석의 위치·근거와 getter/coercion 대조를 명시한다. 전체 annotated gate의 strict 성공은 구현 단계에서 확인하며 조각 proof로 성공을 앞당겨 주장하지 않는다.

## 6. 런타임 호환 oracle

base `7b2be0ec7ffb10b765424bab83128742e7243e27`의 다음 동작을 pin한다. 전체 결과를 deepEqual하며 some/includes만으로 통과시키지 않는다.

| 입력 | 현재 결과 |
| --- | --- |
| 인자 생략·undefined·7·빈 object | `['invalid-quality-report']` |
| root null | destructuring TypeError |
| 최소 partial 정상 입력, transition 1채널 | 빈 배열 |
| cases 빈 배열 | `missing-enabled-signal-case` |
| gain transition만 존재 | `missing-enabled-transitions` |
| null case/transition/stress channel/alignment | 기존 순서의 9개 실패 |
| enabled transition 측정 누락 | `250Hz/on/transition-signal` |
| transition.before.channels가 object | `.at is not a function` TypeError |
| stress peak 문자열 '1' | stress-peak-low 다음 peak=1 |
| baseline step 누락, 다른 값 정상 | `250Hz/on/step` |
| baseline step null 또는 문자열 '0.1' | 기존 빈 배열 |
| change step 문자열 '0.1' | `250Hz/on/step` |
| stress peak 누락·null·정확한 상한·상한 초과 | 기존 전체 실패 순서·문자열; getter 읽기/예외도 대조 |
| raw enabled/value truthy 숫자1 | 기존 빈 배열 |
| raw transition frequency NaN | 기존 빈 배열; 현재 판정 필드 아님 |
| enabled RMS 정확히1e-4 | 기존 빈 배열 |

0.95 envelope 비율, step1e-6, stress peak 하한0.97/상한0.9801, overFullScaleSamples0, alignment 조건을 유지한다. report 키 순서와 입력 object/배열/typed buffer 비변경도 비교한다. 기존 한계를 별도 correctness 설계 없이 해결 완료로 표시하지 않는다.

raw fixture는 compiler proof가 아니다. 입력은 unchecked 테스트의 직접 factory, JSON은 기대 결과만 저장하는 방식을 우선하여 태그 parser를 만들지 않는다. NaN/undefined/hole 태그가 필요하면 테스트에서만 복원하고 직접 검증한다. 오류는 name/message로 관측하며 stack·환경 경로·시간은 golden에 넣지 않는다. baseline은 변경 전에 기록하며 이후 구현으로 기대값을 재생성하지 않는다.

## 7. 검증 설계

### 정적 검출

기존 2파일 graph를 4파일로 확장한다: `scripts/audio-signal.mjs`, `scripts/audio-metrics.mjs`, `tests/audio-signal-contract.test.cjs`, `tests/audio-quality-contract.test.cjs`. Node 타입은 기존 의존성이다. listFilesOnly로 다른 저장소 모듈의 편입이 없는지 확인하고 기존 config/CI/발견 경로 assertion을 갱신한다.

checked 소비자는 실제 summarizeCapture로 before/change/after·steady/stress를 만들고 literal 설정·alignment로 report를 구성한다. 신호 fixture 선택은 명시하며 최종 실패 문자열은 독립 literal로 고정한다. 보장은 정상 API·순수 gate·대표 소비자다. CLI import는 실제 연결이지 browser 생산자의 report 조립을 compiler가 검사한다는 뜻이 아니다. CLI의 enabled/value 조립 오용을 이 checker가 잡는다고 주장하지 않는다.

compiler proof는 기존 임시 output·bounded spawnSync·진단 파일/행/코드 확인 패턴을 재사용한다. 정상 gain/enabled branch와 metadata report는 진단0이어야 한다. 다음 오용은 실제 proof 위치의 목표 진단이어야 하며 crash/import 실패로 대신하지 않는다:

- enabled number value, gain boolean value, 알려지지 않은 kind.
- 누락 before/change/after·측정 필드, 정상 채널1개/3개.
- string sampleRate/frame, 잘못된 stereo/boolean.
- 확인 없이 nullable spectral 산술, 없는 report 필드 접근.
- 정상 alias에 root/stress 누락 또는 undefined/null. partial API의 최소 정상 입력은 컴파일 허용.

alias 오용만으로 완료하지 않는다. 실제 gate의 guarded 배열 반복 내부에 없는 원소 필드 접근을 넣은 최소 negative control에서 해당 source 위치의 TS2339 등 목표 진단을 확인한다. 대표 loop의 any 누수로 오용이 허용되면 실패다. mutation은 owned 임시 source 또는 RAM compiler view에만 적용하고 원본 source/graph는 바꾸지 않는다. import 실패나 전체 cast로 대신하지 않는다. 상세 계획에서 각 배열의 복원 근거와 proof 위치를 정한다.

### 동작과 연결

1. 기존 metrics/artifacts와 신규 checked 소비자·raw golden: 반환/예외·순서·비변경 대조.
2. CLI invalid-argument·export identity·tool inventory/ESLint 유지, 새 alias의 실제 CLI import 확인.
3. 구현 승인 후 격리 tracked clone/candidate에서 전체 verify·strict·빌드·합성 오디오. root dist는 build/cleanup 대상이 아니다.
4. 합성 CLI steady14/transition18/alignment12·qualityFailures와 silent sink/calibration/파일 저장후throw/finally 확인. 수치/출력 기대값을 변경하지 않는다.
5. checker warm/cold 시간·graph 범위·오용 거부 효과를 기록한다. 불필요한 중복 proof는 줄이되 필수 검출은 유지한다.
6. 구현 후 최종 Astra max whole-branch 검토·최종 head 공개 CI·한글 PR/통합. 이번 설계 검토를 구현 최종 검토로 대체하지 않는다.

## 8. 보호와 완료

제품 src/생성 JS/manifest/권한, package/lock 버전2.13.3, 제출 ZIP58파일, root dist, native 기준 프로필, frozen P02 baseline/원장은 보존한다. 데이터 수집·외부 서비스·로그인·스토어 조작·확장 reload를 추가하지 않는다.

설계 완료는 범위/계약/oracle/제외 범위와 검토 반영이다. DT01-B 전체 완료는 승인된 구현·compiler proof·기존 동작/CLI·전체 게이트·최종 검토·CI/통합 확인 뒤만 표시한다. 기존 P02 역사 hash 실패와 ESLint7 경고를 해결했다고 표시하거나 감사 대상을 축소하지 않는다.

직접 확인과 독립 검토는 [검토 기록](../validation/2026-10-12-dt01b-quality-contract-review.md)에 둔다. written-spec 승인 뒤에만 상세 구현 계획을 작성한다.

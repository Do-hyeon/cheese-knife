# DT01-A 오디오 수치·요약 계약 — 검증 기록

작성일: 2026-10-12 / Asia-Seoul. 기준: `36cf380`.
계획: [상세 구현 계획](../plans/2026-10-12-dt01a-audio-signal-contracts.md). 사용자가 계획과 Native 실행을 승인했다.

## 변경과 결과

기존 수치3개와 Node summary를 순수 `audio-signal.mjs`로 이동했다. 구 metrics는 같은 함수 객체를 re-export하고 CLI는 기존5개 호출 위치에서 summarizeCapture를 사용한다. loose quality gate·browser capture·artifact/owned-files는 새 strict graph에 넣지 않았다. 임시로 복사했던 기존 수치 본문은 최종 tree에서 제거했다.

| 검사 | 로컬 결과 |
| --- | --- |
| 변경 전 공개조건 전체 기준 | 815/815, 실패0, 약54.4초 |
| Task1 순수 계약·기존 metrics/artifacts·DT00 | 43/43, 실패0 |
| Task2 구 API·실제 감사 연결 집중 | 77/77, 실패0 |
| 변경 후 공개조건 전체 | 832/832, 실패0, 약54.7초 |
| 제품·DT00·새 audio strict | 진단0; 실제 repository graph는 새 순수 모듈+새 contract test 두 파일 |
| toolchain·runtime inventory·settings/main drift·build proof | 통과; JS16개, settings10+MAIN6, proof4 contexts |
| 실제 합성 CLI | 14 cases·18 transitions·12 alignments, source1·48kHz, qualityFailures0 |
| 합성 출력의 full-scale 초과 | 138개 channel summary 모두0; stress 두 channel도0 |
| 격리 candidate build/package | 통과; resources20, root dist 생성 안 함 |
| 설치형 positive E2E | 통과, 약65.5초 |
| 설치형 negative control | `main-runtime-missing` 관측, 통과 |
| compiler 임시 경로 | 잔여0 |

독립 Astra max whole-branch 검토와 마지막 커밋의 Windows·Ubuntu foundation/전체 verify는 별도 확인한다. 현재 표는 로컬 결과이며 새 보안 인증이나 실제 방송 검증이 아니다.

## 최종 독립 검토

Astra max가 `36cf380..12218c6` 전체를 검토했다. Critical0·Important0·Minor0이며 최종 공개 CI 통과 조건으로 병합 가능 판정이다. 코드 수정 요청은 없다.

검토자는 기준 버전과2,286개 numeric/summary 호출의 결과·오류를 대조하여 일치를 확인했다. 실제 graph2파일·정상/오용 compiler proof·구 export identity·gate 본문 보존을 확인했고 집중77/77을 독립 재실행했다. 최초 sandbox 실행의 filesystem EPERM8개는 동일 명령의 일반 파일 접근 실행에서 해소됐다. 전체832·browser/candidate/E2E는 로그를 검사했으며 재실행하지 않았다.

합성 보고서14/18/12·source1·qualityFailures0·138개 channel full-scale0, 감사 입력47개 해시와 기존 관측 ID7개의 일치, frozen P02와 root dist/HEAD 불변도 독립 확인했다. 실제 공개 CI·병합은 해당 PR의 마지막 커밋 checks·merge 메타데이터를 기준으로 판정한다.

검토의 제외 항목에 대한 주 실행자 판단:

- NUM01·capture 시각/길이 consistency·overflow: 기존 정책을 유지하는 이번 계약 범위로 인정한다. 비용은 잘못된 숫자의 유한/일관 결과를 보장하지 않음이다.
- proxy/accessor/custom method·외부/공유 buffer 변경·Samples 밖 입력: 소유 buffer 계약 밖으로 유지한다. 비용은 해당 입력의 안정성 미보장이다.
- browser/CLI/full report/artifact/filesystem 전체 static safety: 실제 연결·기존 실행 게이트를 유지한 작은 graph로 인정한다. 비용은 나머지 unchecked 경계다.
- 기존 filesystem7 관측의 취약점 판정: 같은 source·ID의 heuristic으로 남긴다. 비용은 보안 인증/해결 판정 부재다.
- 실제 방송·계정·hardware·worker/BFCache·in-place reload: 제품 불변과 합성 증거를 새 실사용 증거로 확대하지 않는다. 비용은 해당 환경 미검증이다.
- 과거 private P02 hash assertion 재검증: 승인된 정확한 한 항목 제외와 원본 해시 보존을 유지한다. 비용은 역사적 입력 일치 assertion의 재검증 부재다.

Deferred minors: 없음. 검토에서 제외된 항목과 보존한 관측을 해결 완료로 표시하지 않는다.

## RED → GREEN과 독립 기대값

- 신규 모듈·설정 부재에서 새15개 검사 모두 실패했다. missing-module/config 진단은 negative proof의 성공으로 인정하지 않았다.
- 순수 계약을 연결한 후 구 numeric API identity 검사는 실패했다. 기존 본문을 제거하고 re-export한 뒤 통과했다. source inventory/snapshot 검사는 Task1 이후 이미 통과할 수 있는 항목으로 구분했다.
- 기존 hand-derived RMS·harmonic THD·phase-independent envelope 실행 회귀19개를 유지한다. 새 left-only8ms golden은 왼쪽 에너지5/8·오른쪽0과 구현 이전의 읽기 전용 대조로 고정했으며 새 함수로 재생성하지 않았다.
- summary의 정확한 값·field 순서·좌/우 순서, frequency 생략/undefined/null, 무음의 nullable 측정, 정합된 무음과 비정합 tone을 검사했다.
- number[]/Float32Array/Float64Array의 값·원본 보존, empty·sparse·NaN/Infinity sample과 기존 rate/tone/channel/window 오류를 실제 실행한다. NUM01 NaN window 결과는 JSON coercion 없이 현재 정책대로 기록한다.
- noEmit `.mts` proof의 정상 대조는 통과한다. 잘못된 Samples 요소·sampleRate·capture1/3 channel은 TS2322/TS2345, 없는 summary 필드는 TS2339, nullable THD 산술은 TS2531/TS18047로 거부한다. 각 파일의 식이 있는2행과 허용 코드만 인정한다.
- TypeScript tuple 진단의 들여쓴 설명 줄은 같은 진단 block의 설명으로 허용하되 추가 error heading·다른 파일/행·stderr·timeout·missing-module은 허용하지 않는다. CJS의 ESM 타입 참조에는 `resolution-mode: import`를 명시했다. 실행 방식이나 strict 옵션은 바꾸지 않았다.

## 비용·단언·미검사 경계

동일 설치에서 noEmit 각3회: 제품532/396/402ms, DT00 482/466/465ms, audio436/447/463ms. 새 audio checker 중앙값은 약447ms이며 compiler proof의 추가 실행 비용은 전체 테스트에 별도 포함된다. 정상 산술 성능이 향상됐다고 주장하지 않는다. 새 의존성·lockfile·loader·JS 생성 단계는 없다.

명시적 단언은 `.at()` 재조회3곳과 summary tuple1곳이다.

- waveform 이전 index: 같은 소유 buffer의 이전 반복에서 finite 검사 완료.
- harmonic pass: 앞선 waveform pass가 모든 index를 finite 검사함.
- envelope trailing index: 앞선 반복에서 finite 검사한 index, rounded window와 기존 비교 분기의 범위를 유지함.
- summary map: 입력이 소유한 두-channel tuple이고 map이 길이와 순서를 유지함. runtime 결과는 기존 map 배열 그대로다.

새 JSDoc은 number가 finite라고 보장하지 않으며 proxy/accessor·공유/외부 변경 buffer를 검증한 것으로 확대하지 않는다. browser producer·CLI caller·full report gate·부분 artifact·owned-files 전체는 여전히 unchecked 범위다. NUM01 입력 정책을 변경하지 않았다.

## 도구 관측과 증거 보존

새 감사 run `run-2026-10-12T05-52-27-459Z-6y52KV`의 입력 전후 snapshot은 동일하다. npm0·Gitleaks dir0/git0, ESLint7이므로 **audit exit1/findings**를 그대로 기록했다. 모두 변경하지 않은 `scripts/owned-files.mjs`의 `security/detect-non-literal-fs-filename` 관측이다. 이전 `run-2026-10-12T02-56-00-593Z-FSukbc`의7개 관측 ID와 정확히 같으며 변경 범위의 새 관측은0이다. 이 heuristic 관측을 취약점 확정이나 전체 clean으로 표시하지 않는다.

새 mjs의 실제 sourceFiles 포함, 실제 내용 SHA-256 snapshot, 적용된 ESLint rule과 명시적 lintFiles 목록을 각각 확인했다. 기존 rules/exclusions·scanner 결과 의미·private 증거는 변경하지 않았다.

로컬 전체 테스트는 과거 private P02 input-hash assertion 한 항목만 정확한 이름으로 제외했다. 변경된 package.json·수치 소스와 과거 보고서의 입력이 일치할 수 없어 원본 증거를 재생성하지 않는다. 공개 checkout에서는 기존 evidence 부재 skip 규칙으로 기록된다.

동결 P02 baseline SHA-256 `f027a9e8a8c7b44df1a0d8104a7354c9c787a8f6b62b4f532131fb7bcd193dd8`, warning-ledger `4c312e3e66bb773470816779ef1868b4356b344f645a0efaf44bc5e49ebc0401` 전후 동일. quality gate 본문은 기준20dda08과 EOL 정규화 후 동일하다. artifact 비교 허용치·partial/raw 허용·report 기록 후 quality throw/finally는 유지했다.

제품 TS·생성 JS16개·manifest·버전·제품/DT00 tsconfig·lockfile·audio-artifacts/owned-files diff0. root dist는 시작 시 없었고 만들지 않았다. 스토어 제출본·사용자 설정·계정/profile/speakers는 건드리지 않았다.

## 실행 환경과 후속 판단

- 초기 집중 실행의 artifact4개 realpath EPERM은 sandbox 제한이었다. 동일 입력을 elevated 실행하여43/43 통과했다.
- 설치형 headless-unpacked in-place reload는 기존처럼 worker 재시작이 관측되지 않았다. 자연 worker idle·실제 BFCache·사용자 계정/방송·실제 하드웨어 음질은 새로 확인하지 않았다.
- 기존 Windows symlink 권한 제한 두 경로는 environment-unverified이며 Ubuntu 전체 CI로 별도 확인한다.
- 별도 보안 scan/인증이나 NUM01 정책 보완, DT01-B/C/S·DT02 구현·기능 동결 해제는 수행하지 않았다.

DT01-A의 작은 실제 계약 검사는 유지한다. 의미 있는 compiler 오용 거부와 독립 실행 기대값을 확보했지만, 이를 전체 개발 도구 타입화의 자동 승인으로 확대하지 않는다. 다음 DT01-B는 별도 상세 설계 대상이다.

주 실행자의 판단: 현재 폴더의 별도 브랜치를 사용했다(사용자 선호; 비용은 공유 작업 폴더). compiler의 들여쓴 설명 줄을 허용했다(고정 compiler의 실제 tuple 진단 형식; 비용은 출력 형식 의존). 과거 입력 hash assertion은 제외하고 원본을 보존했다(승인 범위; 비용은 역사적 한 항목 재검증 부재). 기존 ESLint7은 같은 ID의 heuristic 관측으로 남겼다(범위 불변; 비용은 해당 관측의 해결/보안 인증이 아님).

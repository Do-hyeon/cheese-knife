# F01 T8 Native 사전계측 분리 상세 실행 계획

상태: 2026-10-15 사용자 설계·상세 계획·보완·격리 재검증 승인. 기존 T8 안에서 inline 실행하며 push/PR은 금지한다.

명세: [승인된 후속 설계](../specs/2026-10-15-f01-native-rapid-coverage-follow-up.md). 원래 [F01 계획](2026-10-14-f01-audio-processing.md)의 T8·T9를 대체하지 않는다.

## 1. 원인과 변경 지도

M의 실제 이득/출력5건은 일치했으나 실제 reset 중간 구간이 없었다. native clock으로 요청 지연을 기다리면 불연속 clock 갱신과 호출 비용이 합쳐져 구간을 건너뛸 수 있다. 제품 DSP/시간/수치가 아니라 자극 형성·완전성 판정·실행 순서만 변경한다.

- `scripts/audio-processing-probe.mjs`: 실제 clock 변경 직후의 시작 위상과 wall-clock 지연, 실제 OFF/ON 호출 전후 시각을 기록한다.
- `scripts/audio-processing-metrics.mjs`: 고정12개 목록·실측 세 구간·모든 출력 판정, 별도 사전계측/전체 보고서의 source·환경 결합 검증.
- `scripts/check-audio-processing.mjs`: 기존 prepare/capture/launcher 재사용. 모든 rate의 사전계측 JSON을 먼저 남기고, 통과한 경우에만 같은 clean 입력·동일 환경의 새 자체 프로필에서 긴 행렬을 실행한다.
- `tests/f01-audio-quality-contract.test.cjs`: 누락/중복/출력 불일치/시각 손상/구간 미성립/환경 불일치/오류 기록 보존 회귀.
- strict checkJs·기존 provenance 소비자와 PLANS/검증 원장을 확인한다. 새 모듈·의존성·확장 권한·제품 코드·생성 JS·수치 fixture 변경은 없다.

## 2. 실행 전에 고정하는 자극

각44.1/48/96kHz에서 아래12개를 표 순서로 정확히 한 번 실행한다. 총36개이며 결과를 본 뒤 목록 확대·반복·성공 표본 선택은 금지한다.

| 시작 위상(ms) | OFF 호출 기준 요청 지연(ms), 순서 |
| --- | --- |
| 0 | 0, 10, 15, 25 |
| 2 | 0, 10, 15, 25 |
| 5 | 0, 10, 15, 25 |

1. 실제 controller로 normalizer/EQ/comp/master OFF → stereo1kHz −36dBFS RMS20초 입력 → normalizer ON →6.5초 boost 형성 → 계측 초기화.
2. 실제 `AudioContext.currentTime`의 다음 변경을 최대100ms 관측한다. 실제 audio/wall 시각을 기록하고 `performance.now()`로 위상0/2/5ms를 기다린 뒤 OFF를 호출한다. clock 값에 setter를 두지 않는다.
3. OFF 호출 직전 wall 시각+요청 지연까지 기다린 뒤 실제 controller ON을 호출한다. 각 대기는 최대100ms이다. OFF 처리 자체가 늦으면 그 실제 시각을 그대로 기록한다.
4. 180ms 뒤 실제 gain·마지막50ms 양쪽 출력·source/timer 수·automation을 기록한다. ON 호출 이후 관측된 첫 normalizer 예약을 재진입으로 판별해 OFF의 미래 hold 예약과 구분한다.
5. 실제 예약이 reset 시작 이하이면 hold, 시작 초과/끝 미만이면 reset 중간, 끝 이상이면 unity다. 요청 지연/시작 위상으로 구간을 추정하지 않는다.

## 3. 수용 판정과 증거

- row별 입력·edge/OFF/ON 호출 전후 실제 시각·reset/reentry·raw state·output을 남긴다. 예외도 row에 먼저 기록한다.
- 정확한12개 유일성·실제 reset10ms·유한/시간 순서·source1·timer1·capture 오류0·ON 상태가 필수다. unity만으로 시작하는 빈 자극은 인정하지 않는다.
- 실제 reset 곡선/재진입 시각으로 예상 dB를 독립 계산한다. 실제 gain 오차<0.001dB, 양쪽 RMS 오차<0.05dB, peak≤0.9801/full-scale0을 유지한다.
- 모든 row가 정확하지만 세 구간이 없으면 `stimulus-unformed`, 출력/자료 오류는 `failed`, 모두 정확하고 세 구간이면 `passed`다. 자극 미성립을 제품 결함/정상으로 단정하지 않으며 전체 미완료다.
- 모든 rate의 사전계측 JSON을 긴 행렬 전에 생성한다. source/after5필드 일치·정확한 rate3개·종료3증명·pageErrors0이 필수다. browser 버전/platform/arch/Node 버전을 긴 행렬의 동일 rate와 대조한다. 도구/lock/toolchain은 clean source attestation으로 결합한다. 옛 JSON을 입력받는 옵션은 만들지 않는다.
- 전체 report는 새 schema v2로 구분하고 사전계측을 내장한다. 기존 v1 실패 이력은 유지한다. 사전계측 생략 또는 old boolean만으로 통과할 수 없다.

## 4. 실행 체크리스트

- [x] 누락/중복/실패 표본/NaN/시간·출력 손상/세 구간 미확보/환경 불일치/부분 자료 거부 테스트 RED. 새3개 API의 부재로 실패를 먼저 확인했다.
- [x] 최소 도구 변경 GREEN·strict audio/development·집중 normalizer/객관 계약49/49 통과. 실제 collector의 멈춘 clock 거부도 확인했다.
- [x] 기존 물리 execution 후보의 전체1608개 중1607통과/실패0/기존private1skip(61.602초),9개 기반/build/package 순차 통과. root dist58·제품2.13.3·DSP/기존 fixture pin 불변.
- [ ] 로컬 checkpoint → 기존 Native 물리 후보의 정확한 새 SHA/clean detached 준비.
- [ ] 자기 새 프로필/번들 Chromium/익명 pipe 사전계측36개 실행. 모든 결과 보존. 미성립/실패 시 긴 행렬 전에 중지하고 미검증 수용 방안을 사용자에게 문의한다. 유한 목록을 반복 실행하지 않는다.
- [ ] 통과 시 동일 입력/환경의 EQ108/RMS60/전환72·controls/숨김/두 창 수명 실행. dip0.95·연속성1e−6·peak0.9801·full-scale0·동결14/12/18/stress 유지.
- [ ] 새 후보의 기존 객관/영상24pixel/미리보기/설치 positive-negative 및 원래 T8 마감 뒤 T9 최종 Astra max whole-F01 검토로 이어간다.

## 5. 계획 자체 검토·중지 조건

wall 지연과 실제 결과 판정을 분리한다. 위상 분산은 성공 보장이 아니며12개를 모두 검사해 선택 편향을 막는다. 별도 새 프로필의 source/browser 환경 일치를 같은 AudioContext의 연속성 증거라고 주장하지 않는다. 그래프는 반드시 production controller를 통과한다. capture 누락을0으로 보충하거나 native 시각/전환 길이를 바꾸지 않는다.

유한 목록에서도 실제 중간 구간이 없으면 여기서 중지한다. 새 제품 출력 문제·DSP 변경·허용치 변경·사용자 Chrome/P09/권한 변경도 별도 승인 대상이다. 모든 과거 A..M/로그/프로필과 새 실패를 보존하며 성공만으로 덮어쓰지 않는다.

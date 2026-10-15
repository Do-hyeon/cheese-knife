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
4. 180ms 뒤 실제 gain·마지막50ms 양쪽 출력·source/timer 수·automation을 기록한다. OFF와 ON의 호출 전후 이벤트 인덱스를 각각 기록하고 그 구간에서만 reset/reentry를 선택한다. 호출 전 normalizer tick이 같은 audio 시각에 놓여도 포함하지 않는다.
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
- [x] 로컬 checkpoint → 기존 Native 물리 후보의 정확한 새 SHA/clean detached 준비. 최신2f494f39644fa3901c75930c1305d9b6286f8158.
- [x] O/KOUZd1의 자기 새 프로필/번들 Chromium/익명 pipe 사전계측36개 전체 PASS. 모든 raw row·실제 세 구간/rate·source/after5필드 일치·종료3증명·pageErrors0을 preflight.json에 보존했다. N의 계측기 실패도 그대로 유지한다.
- [ ] 통과 시 동일 입력/환경의 EQ108/RMS60/전환72·controls/숨김/두 창 수명 실행. dip0.95·연속성1e−6·peak0.9801·full-scale0·동결14/12/18/stress 유지.
- [ ] 새 후보의 기존 객관/영상24pixel/미리보기/설치 positive-negative 및 원래 T8 마감 뒤 T9 최종 Astra max whole-F01 검토로 이어간다.

## 5. 계획 자체 검토·중지 조건

wall 지연과 실제 결과 판정을 분리한다. 위상 분산은 성공 보장이 아니며12개를 모두 검사해 선택 편향을 막는다. 별도 새 프로필의 source/browser 환경 일치를 같은 AudioContext의 연속성 증거라고 주장하지 않는다. 그래프는 반드시 production controller를 통과한다. capture 누락을0으로 보충하거나 native 시각/전환 길이를 바꾸지 않는다.

유한 목록에서도 실제 중간 구간이 없으면 여기서 중지한다. 새 제품 출력 문제·DSP 변경·허용치 변경·사용자 Chrome/P09/권한 변경도 별도 승인 대상이다. 모든 과거 A..M/로그/프로필과 새 실패를 보존하며 성공만으로 덮어쓰지 않는다.

계획 보완 판정: 첫 N은36개와 실제 세 구간을 모두 수집했지만96kHz 마지막 row에서 호출 전 tick을 reset으로 잘못 선택했다. 이는 자극 미성립/제품 출력 실패가 아니라 기록 선택 오류임을 원자료와 독립 RED로 확인했다. 승인된 도구 보완 범위에서 호출 인덱스 경계를 고치고 전체/strict 후 새 checkpoint에서 한 번 다시 검증한다. 자극12개·순서·지연·수치와 제품은 변경하지 않으며 N을 소급해 PASS로 재분류하지 않는다. 단순 미성립/제품 실패를 같은 방식으로 반복하지 않는 중지 조건은 유지한다.

O 후속 상태: 사전계측은 통과했으나 긴 검사의44.1kHz 수명 단계에서 응답이 멈췄다. 마지막 정상 진행 로그 이후3분 이상 기다린 뒤 정확한 자기 프로필/부모PID를 확인해 검사용 browser root51264만 종료했다. Node는 unsettled top-level await/exit13으로 끝나 최종 report.json이 없다. preflight.json·EQ raw36개·console 로그·프로필·interruption-note.json은 보존했지만 메모리에만 있던 전환/RMS raw trace는 기록되지 못했다. 단순 retry나 O 전체 PASS로 분류하지 않으며, 수명 관측·중간 증거 저장·닫힘/timeout 경로의 제한된 보완 설계를 사용자와 확인한 뒤 재개한다. 제품 원인인지 도구/브라우저 원인인지는 미확정이다.

## 6. 승인된 수명 관측·실패 기록 보완

O 후속의 조작별 timeout·원자료 즉시 저장·중단/종료 경로를 사용자가 승인했다. 기존 runner/helper에만 구현하며 새 의존성/권한/포트는 없다.

- 브라우저 조작은 이름을 가진15초 제한, probe/준비는30초 제한, 기존 길이가 정해진 기다림은 원래 길이+5초의 응답 제한을 둔다. 실제 숨김/표시 조건의 기존15초·100ms polling·측정/automation 길이·수치 기준은 바꾸지 않는다.
- 수명 조작의 시작/완료/실패, 모든 rapid/EQ/전환/RMS·대조군의 수집 결과를 고유 번호의 별도 JSON에 즉시 저장한다. RMS raw는 평가 전에 저장한다. 파일을 덮어쓰지 않으며 source/run/rate/단계를 결합한다.
- 같은 수명 함수를 사전계측에서 먼저 실행하고 기존12개 조건/두 실제 window ID를 검증한다. 성공한 경우에만 같은 고정 rapid12개/rate 및 긴 행렬로 이어간다. 긴 행렬 뒤의 수명 검증도 유지한다.
- 실패 진단 조회는 각각2초로 제한한다. finally에서 원래 오류를 유지하며 정상 close 실패는 자기 spawn ChildProcess handle만 종료한다. 강제 종료는 정상 종료3증명으로 만들지 않는다. report/snapshot은 실패 상태로 남긴다.
- timeout/예외/평가 실패 전 raw 저장의 RED→GREEN과 실제 자체 child handle 종료 회귀를 확인한다. focused/strict/full/9기반/build/package 후 새 clean Native에서 원래 대기 지점을 확인한다. O 자료를 재구성하거나 최신 PASS로 대체하지 않는다.

로컬 게이트: 신규 timeout/즉시 raw 저장2건 RED→GREEN, 집중50/50·strict·전체1611통과/실패0/기존1skip·9기반/build/package 통과. 새 Native는 별도 clean checkpoint로 수행하며 아직 미완료다.

P의 제한된 실패 경로는 실제 확인했다:48kHz의 원래 탭이hidden이 되지 않아15초 뒤 실패했고120개 JSON·최종 보고서·정상 종료3증명을 보존했다. 같은 창 전제가 없었던 드라이버를 보완해, 실제 링크 클릭으로 연 새 target과 원래 target의 window ID 동일성을 먼저 검증한다. ID가 다르면 실패이며 document.hidden/visibility를 위조하지 않는다. 이 보완은 집중51/51·전체1612통과/실패0/기존1skip·9기반/build/package를 통과했으며 새 Native로 확인한다. 제품 DSP/기존 기준/고정 자극은 불변이다.

Q에서3rate 모두 같은 창 ID/실제 수명과rapid36개를 통과했고270개 중간 JSON·각 정상 종료3증명을 보존했다. 단, 긴 행렬 준비용 새 복사본의 mt.exe 실패로 전체는 미완료다. 제한된 동일입력 R도 준비 실패했으며, 신호 없는 별도 launcher 단기 진단도 두 번째 종료에서 media-close-unconfirmed로 중단됐다. 독립 mt/prepare 호출은 성공했으므로 정확한 원인은 미확정이다. 공통 launcher 준비/종료 단계의 원래 오류/상태를 남기는 후속 진단 설계를 확인하기 전 추가 긴 검사는 중지한다. SDK/브라우저 교체·새 설치는 별도 승인 대상이며 이전 실패를 소급 PASS로 분류하지 않는다.

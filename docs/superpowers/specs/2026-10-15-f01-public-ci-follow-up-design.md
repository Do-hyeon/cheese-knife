# F01 공개 CI 오디오·설치형 검사 보완 설계

초안2026-10-15 / 최종 검토 갱신2026-10-16 / Asia-Seoul. 상태: 사용자 원인 조사·보완 설계·Astra max 검토 승인에 따른 설계 초안. **제품 구현·새 Native 실행·추가 push는 아직 하지 않는다.** 기존 PR #45 하나를 유지하며 병합·버전·릴리즈·스토어 배포는 금지한다.

## 1. 목적과 고정 조건

목적은 CI를 녹색으로 만드는 것 자체가 아니라, F01 전체의 동일한 제품 입력에 대해 기존 오디오 수치와 실제 설정 전달·과거 저장 보존을 검증하는 것이다. 검사 구현의 낡은 전제와 제품 결함을 구분한다.

- 버전2.13.3·root dist58파일·시청 Chrome/P09·기존 private 증거/실패 기록을 보존한다.
- 기존 master 전환 dip0.95·step 기준전후+1e-6·wet peak0.9801·full-scale 초과0과14 steady/12 alignment/18 transition/stress를 유지한다. 측정 창·신호·기본값·delay 보정·limiter·임계값을 변경해 통과시키지 않는다.
- 새 권한·네트워크 endpoint·의존성·실제 방송/사용자 음성 취득·추가 설정/옵션을 만들지 않는다. 조사 자료는 기존 합성 입력만 사용한다.
- 새 제품 source가 생기면 과거 Native 성공을 재사용해 완료 처리하지 않는다. F02는 이 보완이나 F01 PR의 의존성이 아니다.

## 2. 확인된 사실과 아직 확인하지 못한 것

### 오디오

- `69ae557`의 CI38749600904에서250Hz master ON의 maxAdjacentStep0.01922585815191269가 전후0.016357921063899994+1e-6을 초과했다. peak0.5786308646202087, 최소8ms RMS0.2632465749886688이다. full-scale/dip 실패라고 바꾸어 부르지 않는다.
- DSP가 같은 `de082f2`의 CI38750712755에서는 오디오가 통과했다. 이는 실패가 없어졌다는 증거가 아니며 현재는 미해결이다.
- 현재 `controller.ts`의 `ramp()`는 호출마다 `context.currentTime`을 읽는다. master dry/wet와 compressor dry/wet가 각각 별도 호출이므로 같은 전환의 두 예약 시각이 같다는 보장이 없다.
- 로컬 일회성 `output/f01-ci-clock-probe.cjs`는 실제 생성 controller와 기존 fake AudioContext를 실행했다. 초기 handshake/ON 및 실제3개 예약 이벤트를 assert한 뒤 clock 고정과 read당128/48000초 진행을 비교했다. 고정 모델의 dry+wet 합은1, 진행 모델은 OFF에서최대1.2666666666666593, ON에서최소0.7333333333333407이다. **합성 예약 모델의 결함 재현이며 Linux PCM 실패의 원인 확정이 아니다.** 특히 모델 ON은 dip 방향인데 실제 ON 관측은 overshoot이므로 동일 원인으로 단정하면 안 된다.
- 일반 품질 보고서는 요약값을 남기지만 그때의 AudioParam 예약·정확한 실패 PCM은 CI artifact에 포함되지 않았다. 현재 로그로 스케줄링·compressor 상태·샘플 창/브라우저 차이를 구별할 수 없다.

### 설치형 검사

- 최신 CI38750712755는 오디오 이후 기본 E2E `main-setting-missing`에서 실패했다. MAIN readiness가 `ownerProtocol===2`를 요구하지만 현재 제품 계약은3이다.
- base scenario만의 문제가 아니다. `site.js`는 V1/V2 metadata만 관측하고 stale/replayed envelope도 protocol2로 고정한다. 이를 그대로 두면 protocol3 거부 자체를 stale 방어의 성공으로 잘못 셀 수 있다.
- `transition-scenario.mjs`는 new phase를 무조건 protocol2로 간주한다. 그러나 일반 old-new-old의 new는 현 F01(protocol3), F01 cold의 legacy new는 frozen F00(protocol2)다. 모든2를3으로 바꾸면 F00 검사가 깨진다.
- 일반 transition의 기대 `currentNames`는 published58+media-profiles59에 그치는데, 실제 candidate는62개다. `payloadFromDirectory()`는 dist 전체 목록과 exact equality를 검사하므로 기본 경로는 **transition-inventory 준비 실패**로 거부된다. 3파일이 빠진 payload를 설치한 것으로 설명하면 안 된다. 추가3개는 worker의 `gain-authority.js`, popup HTML의 `audio-settings-ui.js`, manifest의 `web/player-gain.js`다. 전체 inventory와 역할별 protocol을 일치시켜야 한다.
- 일반 transition의 runtime 전체 config 독립 기대값도 구 필드에 고정돼 있다. F01 추가 필드를 무시하는 부분 비교로 회피하지 않는다. raw storage 보존과 runtime 기본값 투영은 별개다.
- 일회성 `output/f01-ci-protocol-probe.cjs`는 실제 base readiness callback과 실제 fixture listener를 실행했다. owner3/configReady=true/media.ready/arrowSeek=false라도 기존 scoped readiness는 false이고, V3 metadata는 관측하지 못하지만 V2 control은 관측했다. 실제 설치 재검증을 대체하는 증거는 아니다.

## 3. 대안과 권장안

1. **권장: 실제 원인 계측을 선행하고 두 국소 경계를 별도 보완한다.** 오디오는 실패 시각의 양쪽 PCM·예약·기본 config/source를 보존한 뒤 입증된 문제만 수정한다. E2E는 explicit payload 역할별 protocol과 독립 관측 fixture를 연결한다. 제품 권한/저장 ABI는 불변이다.
2. OS/브라우저 pin 변경이나 전환 시간을 늘리는 방안은 원인 분리를 흐리며 다른 시청 환경을 남긴다. 정당한 플랫폼 호환성 근거가 새로 확인된 경우 별도 설계할 수 있지만 현재 대체안으로 쓰지 않는다.
3. 재시도 통과·허용치 완화·오디오 step 검사 제외·기존 전환 검사 제거는 채택하지 않는다. 성공만 고르는 rerun도 금지한다.

## 4. 오디오 조사·보완 경계

### 4.1 먼저 확보할 근거

기존 합성 품질 runner에 **진단 전용 glue**를 추가하되 신호/호출 순서/측정 창은 유지한다. wrapper는 native 메서드의 this·인자·반환·throw를 그대로 전달하고 값을 다시 쓰거나 추가 automation을 예약하지 않는다. native 호출을 먼저 수행하고 성공 후 사전할당 고정 버퍼에 최소 값만 기록한다. wrapper는 진단 오류/상한 초과로 native 호출을 생략하거나 throw하지 않으며, 별도 incomplete 표시를 남긴다. 직렬화·PCM 복사·검증은 전환 동작 밖에서 수행한다.

`audio-processing-probe.mjs`의 기존 wrapper는 native 호출 전에 `currentTime` 읽기·배열push를 하며 상한에서 native 호출 전 throw하는 경로가 있으므로 그대로 재사용하지 않는다. 후속 계측을 이 helper에 넣는다면 기존 signal path를 바꾸지 않는 회귀가 선행해야 한다. native 인자/반환 보존만으로 타이밍 비간섭이 증명되지는 않는다. 개별 예약 wrapper에서 추가 clock 읽기를 피하고, 최소 버퍼 쓰기 자체의 관측 효과도 아래 uninstrumented 실행과 구분한다.

- source/생성물 해시, OS·Node·browser 실제 버전, sampleRate, runtime config의 합성 오디오 필드, 현재 wanted/state를 기록한다.
- 각 master 전환 호출 전후의 context frame과 dry/wet, compDry/compWet, headroom, Gain·normalizer 예약 이벤트의 node 식별자/종류/값/시각을 구분한다. 측정 frame 원점과 이벤트 시각을 같은 clock에 대응시킨다.
- 기존 master6전환의 before/change/after 창 **양쪽 채널** 원자료와 요약을 보존한다. 누락·NaN·커버리지 구멍은 명시 실패다. 진단을 위해 before/change/after 경계를 이동하지 않는다. Gain12전환의 기존 수치/판정은 유지하며 추가 원자료 보관을 확대하지 않는다.
- 이벤트는 run당4096개, 합성 PCM/진단 JSON은 파일당8MiB 이하·run당진단1개로 제한한다. 잘린 자료는 truncated 표시로 원인 판정에 사용하지 않는다. sampleRate/길이/채널 경계도 검사한다.
- 기존 `output/audio-quality/report*.json` 중 정확히 승인된 합성 보고서/진단 파일만 CI artifact에 포함한다. profile·trace 전체·다른 output·임의 경로는 업로드하지 않는다. retention7일을 유지한다. 실제 방송 소스는 이 runner에 넣지 않는다.
- 기존 frozen CLI/calibration hash 검사는 유지한다. 진단 glue 예외를 추가한다면 정확한 해당 블록만 검토·고정하며 수치 본문 변경을 허용하는 범용 strip/hash 재발급으로 바꾸지 않는다.

같은 신호/설정의 instrumented·uninstrumented 실행을 구분하고 모두 보존한다. **uninstrumented에서도 같은 master6전환 PCM을 보존하고 기존 독립 수치게이트를 그대로 실행**한다. 각각 최소3회 Linux 원래 headless 경로로 실행하되 **한 번이라도 초과하면 실패**다. Windows Native도 별도로 대조한다. 반복 수는 통과를 고르는 retry 횟수가 아니라 지정된 관측 집합이다. 계측 유무에 따른 예약/수치 차이도 비교하며 wrapper 로그 자체를 Linux 인과 증거로 단독 채택하지 않는다. 이 계측도 재현을 보장하지 않으며 미재현은 원인 미확정으로 남는다.

### 4.2 조건부 제품 보완

현재 가장 좁은 후보는 상보 gain pair의 전환 clock 공유다. 추가 계측/결정적 회귀로 인과가 뒷받침되는 경우에만 다음을 구현한다.

- master enable·bypass와 compressor wet/dry 전환 각각에서 `now` 한 번을 잡고 두 `ramp()`에 전달한다. 내부 `ramp(parameter,value,seconds,now)`의 숫자·선형 curve·10ms 시간은 기존과 같다. fallback의 독립 ramp도 같은 도메인 clock을 사용한다.
- 과거 `{from,to,start,end}` 모델에서 **같은 now**의 in-flight 값을 계산하고 두 anchor/end를 일치시킨다. 5/15/25ms·0ms 반복·이미 같은 target·역방향 재전환에도 합1을 검사한다. 이 정책은 sample alignment/limiter 교체가 아니다.
- normalizer OFF의 unity 복귀를 master wet end 이후로 미루는 기존 계약과 재진입 취소·context/source 퇴역을 보존한다. Gain/개별 EQ처럼 상보 pair가 아닌 값을 억지로 합1로 묶지 않는다.
- CPU stall로 예약이 이미 과거가 되는 등 clock 공유만으로 설명되지 않는 경우, 현재안에 임의 지연·curve·lookahead를 덧붙이지 않고 새 근거로 설계를 보완한다.

pair 모델 재현만으로 Linux 수치 실패를 닫지 않는다. clock 공유 후에도 같은 수치가 실패하면 원인 분석으로 돌아가며, 더 큰 제품 변경은 다시 설계한다.

## 5. 설치형 protocol·payload 경계

### 5.1 실제 payload 역할을 명시한다

| 역할 | bridge protocol | fixture 관측 | 사용처 |
| --- | --- | --- | --- |
| published 고정58 | 1 | V1 | 일반 old/rollback, F01 cold published |
| frozen F00 고정59 | 2 | V2 | F01 cold legacy new, F00 전용 과거 근거 |
| current F01 전체62 | 3 | V3 | 기본 E2E, 일반 new, F01 신규 미디어 경로 |

published 고정 source에는 `ownerProtocol` 필드가 없으므로 protocol1에 `ownerProtocol===1`을 새로 요구하면 안 된다. protocol1은 기존 handshake/fixture V1과 실행 source/broker로 확인하고, F00/F01만 소유 숫자2/3을 추가 확인한다.

현재 제품 package62개에 맞게 기대 inventory를 `--media-schema=f01` 여부와 무관하게62개로 갱신한다. `payloadFromDirectory()`의 실제 전체 목록 exact equality를 유지하고 `verifyCandidate()`/`checkPackage()`의 manifest·HTML·worker 참조 존재 검사도 그대로 둔다. 기존 pinned metadata·정확한 해시·2회 build 일치 검사를 유지하며 F00/published 고정 payload는 변경하지 않는다.

호출자가 실제 선택한 역할에서 `expectedProtocol:1|2|3`을 전달한다. base E2E 기본은3, transition shared 함수는 명시 값으로 받는다. 관측된 runtime이 말하는 숫자로 expected를 정하거나 `>=2`로 아무 버전을 통과시키지 않는다. unknown/누락 입력은 실행 전에 거부한다. F01 cold의 frozen F00 전용2는 유지한다.

`--scenario=media-preservation`의 F00 schema1 UI 동작은 이번 일반 CI 수리의 성공으로 주장하지 않는다. 현재 F01을 F00처럼 편집하는 가정이 추가로 필요한 경우 별도 실패/설계로 남긴다. 기존 게이트를 삭제하거나 F01 전환 도구의 PASS로 조용히 대체하지 않는다.

### 5.2 fixture와 거부 검사도 같은 protocol을 사용한다

- `site.js`에 V3 metadata 관측을 추가하되 V1/V2 저장 슬롯을 유지한다. V3는 context4개/version2개·request/sequence/counter·enum·gainOrigin을 독립 검사하고 metadata만 복사한다. base/effective config·프리셋 이름/목록·PCM은 sessionStorage에 보존하지 않는다.
- V3의 gainOrigin 3가지, channel-owned와audioKind의 일관성, unknown protocol·손상 context/version/metadata를 unit으로 검증한다. 제품 decoder를 import해서 fixture oracle을 자기검증시키지 않는다.
- 기본 readiness·stale envelope·퇴역 route replay·새 route handshake·reload 후 관측은 명시 expectedProtocol과 해당 슬롯을 사용한다. V3 stale/replay 메시지에는 gainOrigin을 포함한 **V3 shape의 현재 유효 envelope**를 쓴다.
- fixture의 loads/persisted/routeHistory는 유지하되, **새 문서에서는 V1/V2/V3 envelope 슬롯을 null로 초기화**한다. 관측은 현재 load에서 실제 수신한 metadata만 인정한다. scoped requestId는 현재 `runtime.mediaRequestId`, context4개는 현재 runtime context와 일치해야 하며 V1은 현재 `runtime.requestId`와 연결한다. 슬롯 존재나 sessionStorage에서 복원된 과거 metadata만으로 reload/새 route handshake를 통과시키지 않는다.
- fixture는 제품이 거부한 주입 메시지도 관측할 수 있으므로, 음성 대조 전에 실제 bridge의 현재 metadata를 canonical로 캡처하고 주입 뒤 오염된 마지막 슬롯을 후속 성공 근거로 재사용하지 않는다. 양성/음성 대조는 각 독립 문서에서 수행하고 끝내어, 양성 control의 높은 deliverySequence가 뒤의 정상 bridge 응답을 stale로 만들지 않도록 한다. 후속 일반 시나리오는 새 handshake와 저장된 원래 설정에서 시작한다.
- 음성 대조는 유효 control envelope가 실제 적용됨을 먼저 보이고 sequence 또는 context 한 항목만 잘못해 거부됨을 보인다. shape/protocol 자체가 틀린 메시지의 거부를 sequence/context 방어 증거로 쓰지 않는다. storage 불변도 함께 검사한다.
- 일반 전환의 runtime config 기대값은 published/F00/F01별 독립 literal로 유지한다. F01 새 기본값과 alias는 raw 쓰기를 유발하지 않는 투영 계약으로 확인한다. 제품 normalize 함수를 기대값 산출에 쓰거나 실제 object의 key만 골라 차이를 숨기지 않는다.
- 사전 준비·실제 worker broker/source·버전·seed1회·source/after·원래 탭 reload·정확한 손실 대조·정상 종료 증명은 그대로다. storage 손실이 준비 timeout으로 가려지지 않게 value-independent readiness를 유지한다.

## 6. 파일 영향 지도와 검증 게이트

- 오디오 원본: `src/main/features/audio/controller.ts`; 생성 `web/audio.js`; audio 원본/정규화 executable pin. 변경되는 경우에만 생성·pin을 승인 범위로 갱신한다.
- 오디오 증거: `scripts/check-audio-quality.mjs`, 기존 audio measurement/probe helper, `tests/audio-artifacts.test.cjs`, `tests/audio.test.cjs`, normalizer lifecycle/quality 계약, `.github/workflows/ci.yml`의 정확한 artifact 허용 목록. 새 독립 framework/runner를 복제하지 않는다.
- E2E: `scripts/check-installed-extension.mjs`, `scripts/check-installed-transition.mjs`, `scripts/extension-e2e/transition-scenario.mjs`, `tests/fixtures/installed-extension/site.js`, 해당 fixture/runner/transition unit. `f01-transition.mjs`의 의도된 F00 protocol2를 보존한다.
- 전체 9foundation·전체 tests·후보 build/package62/22·실제 npm/Gitleaks/ESLint 원본 대조를 마지막 source에서 실행한다. 기존55경고/rawexit1과 private1제외를 숨기지 않는다.
- **DSP 수정 여부와 무관하게**, E2E helper/fixture/payload/oracle이 바뀌면 기본 실제 설치 E2E·MAIN 제거 음성·일반 old-new-old 및 storage-loss와 공용 helper에 의존하는 **F01 cold 정상·정확한 손실 대조**를 새 helper source로 필수 실행한다. CI에는 F01 cold 경로가 없으므로 CI 녹색만으로 이 게이트를 대체하지 않는다. F00 역할2 보존/현재역할3/fixture새문서·주입오염 거부도 같은 source의 집중 unit과 실제 설치에서 검증한다.
- 새 제품 DSP source가 있으면 위 공용 E2E/cold 게이트에 더해 기존14/12/18/stress뿐 아니라44.1/48/96kHz EQ108·normalizer60·전환72·rapid36와 Gain/설정 정상·거부·손실의 해당 연계 Native를 재검증한다. profile·실패 이력·정상 종료3증명을 보존한다.
- 최종 Astra max는 당시 고정 범위/현재 승인 문서·실행 증거를 검토한다. 설계 검토 성공을 구현 검토/Native 성공으로 전용하지 않는다.
- 공개 CI는 한 번만 전체 feature PR #45에 반영한 최종 head에서 확인한다. 결과는 실행별로 보존하며 병합/릴리즈/스토어는 하지 않는다. 설계 문서만으로 추가 PR이나 자동 push를 만들지 않는다.

## 7. 순서·승인과 완료 조건

1. 이 설계의 Astra max 공격적 검토·필수 보완·PLANS 최신화.
2. 사용자가 보완 설계/격리 계측 실행 범위를 확인하면 상세 구현 계획을 작성한다. 기존 Native 직접 실행 방식을 유지하고 실제 시청/P09는 제외한다.
3. 명시 실행 승인 후 E2E protocol/payload 연결 보완과 오디오 계측을 수행한다. 단일 계측 결과로 제품 변경을 미리 확정하지 않는다.
4. 오디오 원인 판정 뒤 승인된 국소 수정 또는 추가 설계 STOP. 전체 검증·Astra max 최종 검토를 완료한 뒤 같은 PR에 종합 반영한다.

완료는 E2E protocol별 양성/음성·전체 payload·저장/전환 보존과 기존 오디오 수치 모두의 새 source 증거를 충족해야 한다. 원인 미확정·재현 실패·계측 불완전·CI 후속 미실행은 DONE이 아니다. 현재는 두 실패 모두 해결 전이며 새 구현/Native/CI 성공을 주장하지 않는다.

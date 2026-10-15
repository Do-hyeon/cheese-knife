# F01 순차 구현 검증 기록

2026-10-15. 사용자 승인된 상세 계획·Native 격리 실행 묶음으로 수행한다. 이 문서는 진행 기록이며 F01 전체 완료·실제 음질·무취약성·스토어 적합성 인증이 아니다. push/PR·릴리즈·버전 변경 없음.

T8 추가 승인·진행: master OFF의 normalizer 이득을 기존 wet fade 종료까지 유지한 뒤10ms unity 복귀하는 국소 보완을 승인받았다. 새 회귀에서 기존 코드의 조기 이득 하락·빠른 재진입5/15ms 예약 취소 문제를 재현했고, 보완 후5/15/25ms·반복 전환·소스 교체·오류 예외20개가 통과했다. 새 분석 창은 현재 계산 이득만 이어받고 EMA/buffer를 재사용하지 않는다. 제품 노드/소스/권한/의존성을 추가하지 않았다. 개별 효과의 step/dip 관측은 원본 수치 그대로 진단으로 남기고 명세147절의 출력 상한을 적용하며, master 전환의0.95/1e-6 기준은 그대로다. Native 출력 개선은 새 clean checkpoint의 재검증 전까지 미확인이다.

보완의 로컬 게이트: 격리 후보 최종 전체1600개 중1599통과/실패0/기존private 증거1skip(64.265초), 9개 기반 검사·build·package 통과. 마지막 전체 검사는 build 종료 후 단독으로 실행했다. 실제 소리·전체 F01 완료를 의미하지 않으며 새 Native 출력/수명 검증이 남아 있다.

Native E(`1a2f819`, `audio-processing-F01audio20261015E-khbg9w`): 44.1kHz EQ36·전환24 통과. 기존750Hz master OFF의 최소8ms 비율은0.999999999999999, step 증가분−2.3841858e-6이며 unity 복귀 예약은 관측시각+10ms→+20ms로 확인했다. source/after5필드 동일·pageErrors0·종료3증명true. 그러나 RMS −36/right 속도 경고와 이후 `normalizer-trace-invalid`로 전체 실패다. 속도 경고의 후보인 두 번의 native 시각 읽기로100ms ramp가 짧아지는 경로를 추가 회귀 RED→GREEN으로 보완했다. 후속 실행은 검증 예외 전에 원자료를 보고서에 남기며, trace 예외의 실제 원인은 아직 미확인이다. E의 부분 통과를 F01 완료로 해석하지 않는다.

후속 `70a2b92`는 전체1601통과/실패0/기존1skip·9개 기반/build/package 통과 후 F를 실행했으나 최초 facts부터invalidFrames3으로 첫 EQ 수집이 거부됐다. source/after 동일·pageErrors0·종료3증명true이며 실패를 보존한다. 진단 전용 `2f80e75`의 G는44.1/48/96kHz EQ108·RMS60·전환72·출력/무음/burst/오류/stall/숨김/퇴역/소스/종료 대조가 모두 통과했고invalidFrames0이다. master 최소8ms 비율은각0.994171/0.994050/0.992969로 기존0.95 이상이다. 유일한 실패는 각 rate의 두 창 Gain 관측: 서로 다른 실제 창 ID·첫 창0.5 유지·한쪽 종료 후0.5 유지는 확인했으나, 두 번째 창의10ms ramp 완료 전에1.86848/1/1을 읽었다. 원래 기대값2는 유지하고 관측에50ms 정착 대기만 추가한다. G 보고서는 전체 실패로 보존하며 새 입력의 실제 재검증이 필요하다.

같은 G 제품의 고정 객관 검사 `report-f01-t8-2f80e75.json`은14 steady/12 alignment/18 transition/stress·source1·qualityFailures0으로 통과했다. 영상/미리보기 기존 도구는 각각 owner2 대기·protocol1 주입으로 실패했고, 제품 변경 없이 owner3·완전한 protocol3 합성 config/현재 재요청 응답으로 연결부를 보완했다. 사용자 활성화·픽셀/오디오 허용치·요청 차단은 유지하며 관련45개 검사 통과 후 Native 재검증한다.

`23ac967`의 실제 재검증: Chrome155.0.8059.40 영상24/24·미리보기3/3 통과, 비활성 ko/en은 muted/안내·실제 우클릭 해제, 활성 대조는즉시 해제·volume0.05 유지. 설치 UI는26.682초·source5필드 동일·종료3증명true, MAIN 누락 negative도 예상 `main-runtime-missing`으로 통과했다. 이후 H(`1e8427e`, J1a1Wf)의 첫 빠른 전환 출력은 초기 패킷 집계로 거부됐고, 진단에서 sourceFrame12800보다 이른 빈 패킷12416/12544/12672가12800에 늦게 도착한 원인을 확인했다. 해당 패킷만 원자료에 보존하되 제품 출력 오류 집계와 구분한다. 소스 생성 이후·시각 비정상·비유한 값·출력 누락 거부는 유지하며, 같은 collector의256프레임 성공/현재 오류 실패 회귀 RED→GREEN·엄격31통과, 전체1603개 중1602통과/실패0/기존1skip(61.689초)·9개 기반/build/package 통과다. 새 Native 재검증 전에는 H를 성공으로 바꾸지 않는다.

I(`4b688c9`, qSgiLl)는 초기 패킷 문제 없이 실제5/25ms 전환이 통과했으나,15ms ON 요청의 실제 이득 예약은약20.3ms로 unity 복귀 종료 이후였다. 계산 이득/실제 이득0dB가 일치해도 ‘중간’ 자극을 충족하지 않았으므로 전체 실패로 유지한다. 단위 회귀5/15/25ms는 유지하고 Native는5/10/25ms 요청으로 바꾸되 실제 hold/복귀 중간/복귀 후 시각을 강제한다. J(`9d2e8c9`, CnkqdR)는 생성과 같은 프레임11392의 빈 패킷이 실제 연결 전에 만들어질 수 있음을 확인했다. 따라서 현재 collector는 **최초 2채널 출력 프레임**을 계측 시작점으로 기록하고 그 이전의 안전한 정수 시각·빈 초기 패킷만 원자료와 함께 구분한다. 시작 이후의 빈 패킷·비정상 시각·비유한 값은 실패이며, 유효 프레임이 전혀 없거나 초기 누락을 포함하는 요청창도 여전히 실패한다. 기존3vs0 및 경계1vs0 회귀를 각각 재현했고 보완 후31개 엄격 검사 통과. 제품 DSP·수치 허용치 변경은 없다. I/J 모두source 전후 동일·pageErrors0·종료3증명true이며 성공으로 덮지 않는다.

K(`7141c25`, koWRdR)도 모든 실제 이득/출력은 일치했지만10ms 요청의 실제 예약이약20.3ms로 밀려 중간 자극을 놓쳤다. 현재 Native 계약은 고정0/3/6/10/25ms 자극5개를 전부 기록하고, 모두의 이득/출력이 정확하며 실제 native 시각으로hold/복귀 중간/unity 구간이 모두 확보되어야 통과한다. 부분·한쪽 구간·실패한 자극을 버리거나 반복해 성공만 고르는 방식이 아니다. L(`904161b`, s1deRh)은44.1kHz 모든 대조군·실제 두 창 독립 Gain까지 통과했고48kHz도EQ/RMS/전환/빠른 전환은 통과했지만 숨김/복귀 관측의15초 대기 오류로 종료됐다. source5필드 동일·pageErrors0·각 종료3증명true이며 전체 실패다. 관측은실제 `document.hidden` 조건과15초 제한을 유지하되 기본rAF 대신100ms polling을 사용하고 실패 시 자기 검사 페이지들의 가시성도 남긴다. rAF 의존이 실제 원인이었는지는 새 Native로 확인한다.

추가 경계 회귀: analyser 생성 중 native 시각8ms 전진 시 취소가1.115 대신1.123에 이뤄지는 경로를 재현했다. 생성 전에 현재 이득을 고정·옛 예약을 취소하고 생성 실패 시10ms unity로 복귀하도록 같은 승인 범위에서 보완했다. 두 회귀RED→GREEN, 집중55/55·전체1606개 중1605통과/실패0/기존1skip(60.259초)·9개 기반/build/package 통과. audio 실행 pin만29140a9c로 변경했고 노드/소스/타이머/의존성/권한·기존 허용치는 추가/변경하지 않았다. L은 이전 코드의 결과이며 이 보완의 Native 증거가 아니다. 새 clean checkpoint 검증이 필요하다.

최신 M(`718db57`, `F01audio20261015M-5nbQKt`) 결과:44.1kHz 자극0/3/6/10/25ms 모두 계산 이득·실제 이득·출력이 일치했으나, 실제 예약은hold3건/unity2건으로 reset 중간 구간이 없었다. 사전 gate `audio-processing-rapid-master`에서 전체 실패 처리했고 긴 행렬은 실행하지 않았다. source 전후5필드 동일·pageErrors0·invalidFrames0·source1·각 자극timer1·종료3증명true. 기준을 완화하거나 M을 통과로 바꾸지 않는다. 반복된 고정 타이밍 설계 문제는 추가 조정 없이 중지하고 [후속 설계](../specs/2026-10-15-f01-native-rapid-coverage-follow-up.md) 재승인을 요청한다. 현재 실행 중인 자기 Native/테스트 세션은 없고 T8·T9는 미완료다.

| 단계 | 근거 | 결과 |
| --- | --- | --- |
| 준비 | 물리 후보 `output/f01-execution-20261015/source`, 기존 pinned ZIP 해시 확인 후 복사 | root dist58·제품2.13.3·Chrome/P09 보존 |
| T1 | schema2/전환/alias RED→GREEN, 집중99개, 전체1412개, 9개 기반/build/package | 99통과·전체1411통과/실패0/기존private증거1skip. 후보59/17, 로컬79bf6e2 |
| T2 | protocol3·Gain 역할/epoch/receipt·legacy 읽기·시간 제한·늦은 raw 경쟁·프리셋 조건 RED→GREEN, 집중61개, 전체1434개 | 61통과·전체1433통과/실패0/기존private증거1skip. 9개 기반/build/package 통과, 후보60/18 |
| T3 | 실제 소유 조작부·최소 protocol3/공통 master·Blob fixture·Native qualification | 09f0cdf 실패 후 추가 승인·보완. 새6d5b39b 실제 qualification/별도 negative PASS. 과거 실패는 보존 |
| T4 | 고정 EQ/전체 graph·효과 상태·연속 ramp/퇴역·부분 생성 실패 | 신규 RED→GREEN, 집중141개·전체1465통과/실패0/기존private증거1skip·9개 기반/build/package PASS. Native 출력 미검증 |
| T5 | private stereo RMS·시간 공백/warm-up·bounded dB/exponential automation·수명 | RED→GREEN·집중22/22·전체1482통과/실패0/기존private증거1skip·9개 기반/build/package PASS. Native 속도/출력은 T8 |
| T6–T9 | TAB UI·실제 다중 창/저장 손실·객관 출력·종합/Astra max 최종 검토 | 미착수 |

T2 첫 전체 검사에서 worker/생성 테스트의 새 자산 누락5건을 발견해 원본 source와 소비자를 함께 보완했다. Windows의 임시 테스트 디렉터리 rename EPERM1건은 별도 경계67개와 새 전체 실행에서 재발하지 않았다. 기존 F00 pin·published/f00 fixture·private 감사 원장을 새 성공으로 덮지 않았다.

T1 RED 명령2회가 잘못된 root cwd에서 실행돼 증거에서 제외됐으며 각각 후보에서 재현했다. 이후 후보 cwd를 명시적으로 검사한다. root dist/사용자 프로필 변경은 없다. 원본은 로컬 브랜치에서 수정하며 제품 검사는 물리 후보에서만 실행한다.

저장 전환 ACK 유실은 transport에서 결과 불명이고 재조회 값 일치가 원래 mutation 성공을 증명하지 않는다. 현재 TAB의 폐기/다음 편집·confirm 취소는 T6/T7의 실제 UI와 함께 마감한다. native API의 단위 모사는 실제 Chrome sender/document/gesture 성공을 대신하지 않으며 T3에서 확인한다.

현재 제한: 유료 DVR·과거 플랫폼 업데이트/실제 플랫폼 rollback·실제 방송 청취/출력·실제 actor gesture는 이번 단계에서 확인하지 않았다. 현재 native parser/source actor 준비 결과나 정적 검사만으로 이를 PASS로 표시하지 않는다.

T3 준비에서 기존 MAIN durable Gain 쓰기 제거/owner3/공통 수동 master의 RED→GREEN3, closed-root·재배치·무효화·Navigation 회귀7개를 확인했다. 준비 중 재배치의 병렬 조회는 RED에서 요청2개로 재현하고 기존 pending 요청 뒤 fresh 조회1개로 보완했다. runtime/bridge/audio/player 소비자155개와 새 harness shutdown/dirty/assets 실패 대조를 검증했다. 기존 HLS 검증은 보완 없이 재통과했다. sandbox 디렉터리 rename EPERM은 Native 단독8개와 전체 검사에서 통과했다.

마지막 source의 전체1458개 중1457통과/실패0/기존private증거1skip·9개 기반/build/package 통과를 확인했다. 후보dist61/runtime19. 새로운 F01 실행 pin만 normalized executable 해시로 갱신하며 기존 F00/published pin은 변경하지 않는다. 실제 Chrome qualification과 물리 오디오 증거는 아직 없다. 이 입력의 로컬 checkpoint에서 새 clean 물리 후보를 만든다.

manifest의 Gain 자산은 승인된 별도 top-frame ISOLATED 항목으로 이동했다. 기존 all_frames bridge/MAIN·matches/excludes·권한·WAR는 유지한다. 이전 배치의 계약 실패 RED 후 경계/MAIN 제거 대조4개 GREEN을 확인했다.

## T3 실제 Native 실패 — STOP

- checkpoint: `09f0cdf3682051406bb5ecca6707ed10d20e2d4e`. 전체1458개 중1457통과/실패0/기존private증거1skip·9개 기반/build/package 통과 후 실행했다. 원본 dist58/version2.13.3 보존.
- 새 clean 물리 후보 `output/f01-native-20261015/source`에서 `node scripts/check-installed-player-gain.mjs --run-id=F01qualification --mode=qualification`을 실행했다. 새 자기 Chromium profile만 사용했고 Chrome/P09는 변경하지 않았다.
- 실패: `player-gain-native-keyboard-ack-missing`, 22.246초, exit1. timeout을 성공 대조로 계산하지 않았다. 뒤의 dblclick·재진입·61초 만료·iframe/옛 문서/소유부 제거 대조는 실행되지 않았다.
- trace `call@92/96/98`: 실제 trusted pointer/key를 거쳐 config.audioGain0/gainInheritedfalse/settingsRevision1 저장, owner3/configReady/real Blob decode, audio state ON/gain0/appliedGain0/sources1. mute=true/volume0.5로 fixture 원래 상태 유지. 물리 소리/전체 출력 증거가 아니다.
- trace `call@100`의 실제 ArrowRight 뒤 config.audioGain은0이며 phase=ready였다. 요청·포커스·늦은 알림 중 어디서 소실되는지는 아직 확정하지 않았다. `loading`에서 range.disabled가 포커스를 잃게 만드는 가능성을 우선 조사할 수 있지만 현재는 가설이다.
- `summary.json`의 browserCloseAcknowledged/browserDisconnected/ownedRootClosed 모두true. 전후 sourceCommit/sourceSha256/lock/manifest/toolchain 일치. sourceSha256=`775a8a5a66a69c3848011a10bf5437739fcde85475f42841847a0bbee0ccfdb3`.
- private 증거: `output/f01-native-20261015/source/output/playwright/installed-extension-F01qualification/{summary.json,trace.zip,failure.png}`. candidate와 종료된 profile도 보존했다.
- T3 완료/PASS가 아니므로 T4–T9·Astra max whole-feature 최종 검토는 시작하지 않는다. 후속 방향 승인 전 구현·추가 Native 실행 없음. 권장안은 같은 권한 경계/수치 계약을 유지한 포커스/알림 경쟁 보완 설계와 회귀, 새 checkpoint의 재검증이다. iframe/WAR/추가 권한·임시-only 우회는 제안하지 않는다.

## T3 추가 승인 뒤 원인 조사·보완

사용자가 입력 포커스/저장 알림 경쟁의 조사·같은 권한 경계의 보완 설계/회귀/새 checkpoint 재검증을 승인했다. 이전 STOP은 이 범위에서 해제됐으며 이전 실패/미실행 결과는 그대로 보존한다.

- 읽기 전용 관측만 추가한 c35863c에서 같은 실패를 재현했다. blur는 `phase=saving/disabled=false`였다. 처음의 loading/disabled 가설은 이 재현의 원인이 아니었다.
- 806e83b의 표시 상태 관측에서 544.6ms blur 시 `hidden=true/master=pending/disabled=false`를 확인했다. 이어 `display=none`, 이후 ON 복귀해도 focus=false였다. 두 진단 모두 새 자기 profile에서 실행했고 종료 증명3개true/전후 source 일치를 확인했다. 진단의 실패를 qualification 성공으로 계산하지 않는다.
- 연결 흐름: 저장 알림→bridge의 scoped pending 전달→MAIN의 안전한 audio.suspend→master 상태 pending→ISOLATED render가 on 이외를 숨김→포커스 소실→다음 ArrowRight가 Gain에 도착하지 않음. config 재검증이나 DSP bypass 자체는 안전 경계이므로 바꾸지 않는다.
- 설계/수정: render의 표시 조건만 on 또는 pending으로 바꾼다. off/unavailable/master 없음은 숨김을 유지한다. focus() 강제 복원·임시 저장·새 writer·probe 생략·알림 무시·권한/자산 증가는 없다. 다른 조작부 focus를 빼앗지 않는다.
- 회귀 `wanted master pending keeps the owned Gain visible without refocusing another control`에서 기존 구현은 hidden=true로 RED, 최소 한 줄 수정 뒤 집중27개 GREEN. 생산 authority·MAIN setGain 쓰기0·closed-root·재배치·무효화 테스트도 포함한다. Native runner는 Home 저장 후 포커스, 재클릭 없는 ArrowRight 저장 후 포커스를 각각 읽어서 확인하도록 강화했다.
- 보완 source 전체1459개 중1458통과/실패0/기존private증거1skip·9개 기반/build/package 통과(63.633초). dist61/runtime19 유지. 새 checkpoint Native 재검증을 진행하며, 현재 이 보완의 실제 성공은 아직 미확정이다.

### 새 checkpoint Native 재검증 결과

`6d5b39be799259a7e52bc68952d140f0da3443af`의 새 자기 프로필에서 `F01FocusFixed --mode=qualification` 68.761초/exit0, 별도 새 프로필의 `F01FocusFixedNegative --mode=negative` 6.635초/exit0. 두 summary 모두 ok=true/pageErrors=[]/종료 증명3개true/전후 입력 일치다. sourceSha256=`e61ee8fa732b6c38c40939bc677a77d63f23ed82d72d12b4a9b75ed6dd333da9`.

- qualification: 실제 Blob/source1·trusted pointer/keyboard/native sender frame0/document·Gain0 저장/AudioParam0·포커스 유지/재클릭 없는 ArrowRight 저장·dblclick1/owned·재진입·61초 만료 뒤 첫 실제 조작 저장 PASS.
- qualification과 별도 negative: MAIN/합성 입력·실제 iframe sender·옛 document 실행·소유 조작부 제거 뒤 probe의 정확한 거부/저장 변경0 PASS. negative 모드는 실제 저장 성공을 시험하지 않으므로 보고서의 관련 false 플래그는 정상적인 범위 표시다.
- 자연 worker 교체는 false(미관측)이며 디버거가 붙은 worker의 자연 suspension 증명이 아니다. TTL 만료 첫 조작은 검증했다. 물리 청감/객관 전체 오디오 출력·EQ/normalizer는 T8과 별도다.
- private 증거는 `output/f01-native-20261015/source/output/playwright/installed-extension-F01FocusFixed/summary.json` 및 `installed-extension-F01FocusFixedNegative/summary.json`. 기존 실패·진단 후보/프로필/trace도 보존한다. 원본 dist58/version2.13.3·사용자 Chrome/P09·권한·WAR·외부 전송·push/PR/배포 변경 없음.

## T4 전체 graph·고정 EQ

고정8 peaking/Q1·양수 boost 합의 headroom·EQ20ms·compDry/Wet10ms/matched pre-delay·unity normalizer·기존 master/limiter·전체dry/wet를 source1에 연결했다. wet 입력은 명시 stereo speakers downmix이며 native dry 경로는 유지한다. 새 ramp는 현재 진행값에서 이어지고 현재 video만 audioProcessing/효과별 상태를 발표한다. EQ 미지원 rate는 EQ stage identity/limited이며 다른 효과/eligibility를 우회하지 않는다. normalizer는 T5 전까지 unity이고 요청 ON은 limited/not-ready다.

초기 신규6개 RED, 부분 생성 뒤 Gain 예외 RED를 확인했고 보완 후 집중141개/전체1466개 중1465통과·실패0·기존private증거1skip·9개 기반/build/package 통과(66.548초). 기존 unit의 옛 compressor→master 직접 경로 가정은 새 master→limiter 위치로 맞췄다. 기존 frozen native baseline/허용 오차는 변경하지 않았다. 새 source 파일은 bundle 내부 모듈로만 들어가 dist61/runtime19를 유지한다. T4 결과는 native EQ response/전환 출력/전체 음질 성공이 아니며 T8에 남는다.

## T5 bounded RMS 노멀라이저

좌우 Analyser2개/고정 Float32Array2개·최대256KiB, 최소250ms window·100ms scoped interval, max(좌power,우power)/EMA tau0.75를 사용한다. 순수 helper가 warm-up·무효 시간·공백 hold·무음·목표/보정 제한·현재 dB envelope를 계산하고 현재 graph가 양수 exponential AudioParam automation을 적용한다. 정상 보정은 +1/-12dB/s, 무음2초 뒤 unity 복귀는 양방향1dB/s, OFF/측정 오류는10ms unity 예외다.

초기 계약 RED5개와 source 재판별 전 옛 측정창 혼입 RED를 확인했다. 보완 뒤 집중22개·전체1483개 중1482통과/실패0/기존private증거1skip·9개 기반/build/package PASS(65.225초). pause/ended/muted/volume0/Gain0/context/hidden 재개 새 window·source/video/route 폐기·늦은 callback·오류 제한 상태·범위 밖 rate에서 다른 효과 유지·EMA/양수 boost 상한/무음 양방향 복귀를 고정했다. 측정 버퍼/power는 status·postMessage·storage·로그로 보내지 않는다.

timeout-only shared clock을 interval clock으로 오인한 테스트는 기존 audio fixture의 수동 interval 호출로 수정했다. 이 검사는 결정적 제어/automation 단위 증거이며 실제 wall-clock/연속 출력의 속도 증거는 아니다. 기존 scope의 child cleanup으로 meter/timer를 정리하고 source/route/document를 tick 시작에서도 검사한다. 새 모듈은 기존 audio bundle 내부에만 들어가 dist61/runtime19이며 원본 dist58은 보존한다. 실제 출력·stereo/phase·native 전체 효과 통합은 T7/T8/T9에 남는다.

## T6 설정 TAB·프리셋·현재 방송 연결

기존 TAB client를 protocol3로 전환하고 필드별 직렬 저장을 재사용했다. schema1은 읽기만 하며 명시적 확인 뒤 전환한다. 같은 snapshot에 해석한 유효 Gain과 출처를 포함하되 원시 채널 Gain/상속 쌍은 유지한다. 사이트 Gain 미확인은 100%로 가장하지 않고 `—`로 표시하며, 원래 방송에서 읽어 확인한 값 또는 명시적으로 저장한 값만 구분해 표시한다. 전역/채널 상속 선택과 오디오 전체 전역 사용은 별도다.

렌더·입력 전용 helper 하나로 전체 ON/OFF, 단일 Gain/80px 수치, 분리된 정적 참고 그래프, 5개 상대 다이얼/숫자, 580px 8대역 페이더/숫자, 노멀라이저 목표 숫자 입력을 구성했다. 패널은 약680px이며 오디오·영상·관리 탭, 각 도메인에서만 적용, 관리 상단 목록/이름 변경/분리 삭제와 하단 접힌 생성을 사용한다. 원값을 반올림해 저장하지 않는다. 빈/범위 밖 숫자 초안은 보존하고 확정 복사를 차단하며 명시적 초기화로만 정리한다.

저장 알림을 받았으나 아직 최신 snapshot을 읽지 못한 상태는 별도 freshness로 구분한다. 프리셋/확인은 잠그되 숫자 입력을 disable하거나 focus를 옮기지 않는다. 생성 진입 시 도메인·scope·확정 원본·revision/출처를 캡처하고 후속 변경은 이름을 보존한 채 저장0으로 처리한다. 늦은 native details 알림으로 새 원본을 다시 캡처하는 경쟁도 RED→GREEN으로 보완했다. 이전 protocol1 콜백을 기다리던 테스트 자식만 신원을 확인해 종료하고, protocol3 저장·확정 snapshot 흐름으로 갱신했다. 중단 로그도 보존한다.

현재 방송 master는 own TAB·원래 tab/window/route·native document를 전후 검사하는 고정 MAIN 함수만 호출한다. Chrome documentId를 MAIN에 전달하지 않으며 기존 `PlayerController.setAudioWanted`의 private intent를 공유한다. 문서 교체/route·runtime·window·sender retirement 거부, 설정 저장0을 검사했다. 실제 제품 런타임 연결 회귀에서도 TAB OFF가 설정 변경/같은 영상 재배치 뒤 유지되고 genuine 새 영상에서만 default가 갱신됐다. 이 단위 연결은 실제 Chromium의 gesture 전달·출력 증거가 아니며 pending/제한 시 방송에서 직접 켜도록 안내한다.

최종 전체6차는1509개 중1508통과/실패0/기존 private 감사1skip(65.850초), 9개 기반·build/package PASS, 후보dist62/runtime20이다. 3·5차의 Windows 임시 폴더 rename EPERM 실패도 보존했다. 링크 대상 폴더를 처음부터 별도로 만들고 링크 해제 뒤 동일 바이트를 복사해 정상 복원을 검사하도록 불필요한 이동만 제거했다. 링크 거부·정상 복원·출력 링크 거부 조건은 그대로이며 단독21개/최종 전체가 통과했다. native `step="any"` 문자열의 타입 금지 오탐은 정확한 인용 문자열만 제외하며 실제/generic any 금지 자체와 음성 대조는 유지했다. 새 UI helper도 기존 정적 동적속성 관측 게이트에 포함했으며 억제하지 않았다.

최종 로그는 격리 후보 `output/f01-execution-20261015/source/output/f01-t6-full6.log` 및 `f01-t6-final-*.log`에 보존한다. 생성14개를 바이트 비교 후 원래 작업 폴더에 복사했고 원본 dist58은 빌드하지 않았다. T6 원본/생성물·독립 실행 핀·UI/i18n·회귀·계획 기록을 한 로컬 checkpoint로 묶는다.

T7 실제 설치/두 창/전환·고배율·좁은 화면과 T8 객관 출력·RMS/EQ, T9 종합/최종 Astra max는 아직 미완료다. 원본 dist58·사용자 Chrome/P09·버전2.13.3·권한/WAR/CSP·private 증거는 유지한다. push/PR·릴리즈/스토어 변경은 하지 않았다.

## T7 실제 UI 검사 도구 사전 검증

새 UI runner와 strict checkJs 대상 helper, 독립 저장 손실 기대 값, 실제 입력 횟수·두 창·원래 문서/창·ACK 유실·quota·worker 교체 관측 계약을 작성했다. 가짜/0 입력 관측, 추측한 손실 값, 새 입력의 HEAD 누락, 실패한 종료 증명을 거부하는 대조를 포함한다. 기존 Native executor의 소유 경계와 종료 증명3개를 재사용한다. 기존 executor 전체의 타입 이전이나 실제 브라우저 통과를 뜻하지 않는다.

격리 후보의 `f01-t7-ui-preflight-full.log`는1536개 중1535통과/실패0/기존 private 감사1skip(69.359초)이다. 9개 기반 검사·build·package도 통과했다. 후보dist62/runtime20, 원본dist58/version2.13.3 유지. 이 입력을 로컬 checkpoint로 고정한 뒤 새 Native 프로필에서 검사하며, 아직 T7 실제 UI 성공·Gain full·F01 전환·객관 오디오 출력 성공은 주장하지 않는다.

### T7 worker 시작 실패와 번역 키 회귀

6023626의 `F01Settings20261015A`와 진단 재현B, 읽기 전용 진단581cfdd의C는 모두 `extension-worker-timeout`으로 실제 UI 시나리오 시작 전 실패했다. 프로필/후보/결과는 보존했다. 전후 source는 일치하지만 worker 발견 전에 launcher가 context를 닫아 기존 summary 종료3증명은 null이다. 이를 성공·정상 종료3증명으로 계산하지 않는다. B의 Playwright 시작 로그에는 실제 자식 종료exit0가 있으며 C의 제한된 관리 화면 진단에는 로드된 확장이 없었다.

새 Gain 출처 번역 키5종에 Chrome이 허용하지 않는 하이픈이 포함된 것을 발견했다. 공식 [메시지 이름 규칙](https://developer.chrome.com/docs/extensions/how-to/ui/localization-message-formats#name)과 비교하고, 두 언어 전체 키 검사 RED 및 실제 영문 메시지 조회 RED를 확인했다. 키만 underscore로 바꾸고 bounded 출처 enum의 조회 지점을 맞췄다. 기존 Gain 출처 값·저장 형식은 변경하지 않았다.

회귀10개 GREEN, 전체1539개 중1538통과/실패0/기존 private 감사1skip(62.333초), 9개 기반·build/package PASS. UI helper 생성물과 그 F01 실행 pin만 갱신했으며 root dist58/권한/버전은 그대로다. 새 clean checkpoint에서 실제 로딩 재검증이 필요하다. 실패를 감추는 worker timeout 증가·개발자 모드 우회·권한 추가는 하지 않았다.

### T7 실제 로딩 성공 뒤 원래 방송 relay 보완

514b282의D에서는 worker 로딩과 fixture decode/source1, 실제 toolbar→TAB, Gain0·EQ1.25 저장, 1280/800/360px 배치까지 실행됐다. 따라서 이전 시작 실패는 번역 키 수정 뒤 해소됐다. 다만 master가 제한 상태여서 click timeout으로 실패했다. D와 진단d267285의E는 종료3증명true·전후 source 일치이며, E의 정확한 읽기 거부는 `audio-settings-target-read-audio-target-changed`다. 아직 T7 PASS가 아니다.

Native 경계의 객체 키 순서 변화 회귀에서 같은 context의 읽기가 `audio-target-changed`로 RED였다. 고정 MAIN 함수 내부의 JSON 문자열 비교를 검증된 context4필드의 엄격한 scalar 동등성으로 바꿨다. 같은 값/다른 키 순서는 허용하지만 playerGeneration 등 실제 값 변경·document/runtime/window/route·원래 TAB 폐기는 여전히 거부한다. focused6개 GREEN, 전체1540개 중1539통과/실패0/기존 private 감사1skip(69.809초) 및9기반/build/package PASS. broker 생성물/F01 실행 pin만 갱신했다.

진단 중 zoom 검사의 별도 결함도 발견했다. Chrome `manual` 모드는 페이지 자동 확대를 하지 않으므로 이전D의 reported factor2/동일 캡처를 실제200% 증거로 쓰지 않는다. [공식 ZoomSettingsMode](https://developer.chrome.com/docs/extensions/reference/api/tabs#type-ZoomSettingsMode)에 따라 owned TAB만 automatic/per-tab 확대하고 DPR2배·CSS viewport 절반·80px 출력 폭·명시적100%복원을 함께 측정하도록 강화했다. 실제 확대 없는 보고서를 거부하는 RED→GREEN 및 관련31개/strict development PASS. 강화된 측정과 relay의 실제 Native 성공은 다음 새 checkpoint에서 확인한다.

### T7 연속 입력/저장 알림 기록 보완

1f11bcc의F는 relay·현재 master OFF 유지·프리셋 생성/이름 변경/cancel/recipe/재적용·실제200% 확대를 진행한 뒤 다이얼 바깥 크기에서 실패했다. 기본 content-box의 테두리 포함 크기 불일치를 RED로 확인하고 border-box 한 줄로72px 바깥 크기를 맞췄다(관련26개 GREEN). 55025a5의G에서는 두 실제 창·숫자 초안/focus/소수 표시·owned A/B·상속 전파까지 실행한 뒤 `audio-settings-owned-restore`로 실패했다. 각 실패는 종료3증명true·전후 source 일치이며 그대로 보존한다.

읽기 전용 관측9a81026의H에서 마지막값0.30 초안은 보존됐지만 실제 저장값0.28 뒤 `failed(gain-busy)`로 멈춘 것을 확인했다. 단순 focus 소실/자동 재전송 문제로 가장하지 않는다. own 저장 알림의 receipt가 객체 키 순서 때문에 일치하지 않아 누적64 상한에 도달했다. 순서를 바꾼 실제 저장 이벤트 구조의100회 쓰기 회귀에서 `gain-busy` RED를 확인했다.

보완은 receipt의 객체 키만 정렬하고 배열 순서·실제 값·old/new 및 absent/null 구분을 보존하는 정확한 직렬화다. 미관측 receipt64의 fail-closed 상한, unknown 외부 이벤트와 ABA/세대/권한 거부는 유지한다. absent/null 오인 대조도 별도 RED→GREEN. 집중38개 GREEN, 전체1543개 중1542통과/실패0/기존 private 감사1skip(69.078초)와9기반/build/package PASS. 새 clean Native 재검증은 아직 필요하다.

계획된 Gain `--mode=full`은 qualification/negative를 유지하면서 실제 TAB에서 채널 사용→플레이어의 owned Gain0→같은 video 재배치/source1→수동 OFF 중 다른 효과 저장→재개/새 문서의0 재진입→전역2 보존을 추가하도록 구현했다. CLI RED→GREEN3개 및 위 전체 검사에 포함됐다. 아직 이 새 full mode의 실제 성공을 주장하지 않는다. F01 저장 형식 전환·T8·T9도 남아 있다.

### T7 경쟁/worker 도구 검증 진행

c2e377f의I에서는 owned Gain 복원까지 통과한 뒤, 첫 확인창이 열린 상태에서 두 번째 확인창을 기다리는 도구 전제가 실패했다. 28ae095의J에서는 첫 실제 UI 확인 요청의 전송만 보류하고 두 번째 실제 UI 확인 요청을 먼저 저장한 뒤 원래 첫 요청을 한 번 전달했다. worker에서 실제2개 TAB document/frame0를 관측했고, 저장revision+1·늦은 요청의 정확한conflict/storedfalse·자동 재전송0을 검사했다. 이어 ACK 유실/원래 문서 교체·창 이동 거부/같은 video와 새 video/다른 창 종료/실제 quota 실패 및 자기 padding 제거까지 진행했다.

J는 마지막 worker 단계에서 실패했다. CDP `Target.closeTarget`만으로는 이 환경의 worker close/replacement 이벤트를 확인하지 못했다. 실제 worker 정지 증거 없이 통과시키지 않고 ServiceWorker의 정확한 version/stopWorker/stopped 관측 뒤 실제 설정 조회로 새 target·Worker 객체·저장값 동일을 확인하도록 도구를 수정한다. [공식 stopWorker](https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker/#method-stopWorker)를 사용하며 자연 suspension이나 실제 스토어 업데이트 증명으로 부르지 않는다. 정지 관측이 없는 보고서 RED→GREEN와 strict/관련29개 통과, 실제 새 실행은 남아 있다.

동일 checkpoint의 Gain full K는 실제61초 만료/채널 사용/플레이어의 채널 Gain0 저장까지 진행했으나 재배치 fixture에서 실패했다. 도구가 cloneNode로 확장 소유 컨트롤까지 복제해 정상 사이트 재배치와 달라진 것을 확인했다. 이미 UI 수명 검사에서 쓰는 것처럼 새 사이트 PZP/volume 노드와 같은 실제 video만 이동하도록 수정했다. 제품의 불명확한 소유부 거부 조건은 완화하지 않았다. I/J/K 모두 종료3증명true·전후 source 일치, 실패 증거/프로필 보존. T7 전체 성공은 아직 아니다.

#### Gain full 새 checkpoint 통과

a3403d27d9e34dda55895b249f5accc5ef2910e5의 `F01GainFull20261015M --mode=full`은70.784초/exit0/ok=true다. 실제 Blob/source1·trusted pointer/keyboard/native frame0/document·Gain0/포커스/후속 입력/reset/reentry/61초 만료 첫 입력·MAIN/합성/iframe/옛 문서/소유부 제거 거부에 더해 실제 toolbar/TAB 채널 사용·플레이어의 채널0 저장/재진입·전역2 보존·같은 video 새 PZP/source1·수동 OFF 중 owned EQ 저장/재개를 통과했다. 원래 mute/volume을 보존했고 pageErrors=[]다.

summary의 source/after 전체가 같고 종료3증명true다. private 증거는 `output/f01-native-20261015/source/output/playwright/installed-extension-F01GainFull20261015M/summary.json`에 보존한다. 자연 worker 교체는false(미관측)이며 물리 청감/객관 출력/T8 성공은 아니다. 이와 별개로 설정 UI L은 native stopped 상태 이후 제어 도구의 새 Worker 객체를 찾지 못해 실패했다. 실제 worker 실행 문맥과 제어 객체를 구분하는 읽기 중심 진단89a5955/N을 진행 중이며, 그 성공을 추정하지 않는다.

#### worker 실행 문맥 관측과 검사 보완

89a5955/N의 실패 진단에서 native stopped 이후 원래 worker 전역의 임시 UUID 표식은 없어지고 `performance.timeOrigin`은1792029224077.4→1792029243252로 바뀌었으며 runtime ID는 같았다. Playwright Worker 객체와 CDP target ID는 둘 다 재사용됐다. 따라서 객체 wrapper/target ID 교체를 실제 실행 문맥 교체와 동일시한 도구 조건이 틀렸으며, 실제 제품 동작을 바꿀 근거가 아니다. N도 기존 거부 조건대로 실패/증거 보존했고 종료3증명true·source일치다.

새 수용 증거는 정확한 자체 worker version의 stopped→running, 이전 자체 전역 표식의 실제 부재, 유한하고 증가한 새 timeOrigin, 같은 extension ID·원시 저장값, 명시적 TAB 조회 성공을 모두 요구한다. wrapper/target 재사용 여부는 관측값으로 남기며 성공을 꾸미기 위해 ID를 생성하지 않는다. 기존 marker/같은 시작시각/누락·nonfinite/재실행 미관측을 거부하는 RED→GREEN 및 strict/관련30개 PASS. 이 보완의 실제 전체 성공은 다음 새 checkpoint에서 확인한다. 자연 suspension·스토어 업데이트·플랫폼 rollback 증명과는 구분한다.

#### 실제 UI positive/정확한4손실 통과와 캡처 보완

bc8b2f07cb159a6a2e51432cb5656f07d87cf638의 새 프로필O positive는26.165초/exit0/ok=true/audioSettings.passed=true, 별도 새 프로필P의 `--control=storage-loss`는26.079초/exit0/ok=true/audioSettings.passed=false(의도한 음성 대조)다. 두 sourceSha256은60df70fa949275b9aaa842ce1296d92d91353d3086f255a188f8d2d42d4a401e이며 source/after 전체 일치·종료3증명true·pageErrors=[]다.

실제 두 창의 trusted pointer/key/input은각22/41/46과7/42/45다. 합성10/4는 별도 집계했고 실제 입력으로 계산하지 않았다. CAS는 Native full 요청2개/보류 원본 dispatch1/revision+1/late conflict/storedfalse다. worker는 native stopped→running·이전 marker 부재/새 timeOrigin/원시 저장 동일을 모두 확인했고 wrapper/target 재사용true를 그대로 보고했다. 확대는DPR1→2·viewport1280→640·수치80CSSpx를 확인했다.

P는 Gain0·상속false·EQ125=1.25·실제 preset UUID의 누락을 각각 한 필드 차이/정확한code·phase로 검출하고 매회 원시 전체를 복원했다. timeout/추측 기대 값/다른 변경은 일치로 받지 않는다. private summary는 `installed-extension-F01SettingsRealmProof20261015O` 및 `installed-extension-F01SettingsLoss20261015P`에 보존한다.

O의 실제 캡처 시각 대조에서 zoom 상태의 fullPage 캡처가 페이지 viewport를 조절하며 우측을 자르는 것을 발견했다. 기능/실측DPR 증거와 캡처 한계를 구분한다. 고배율 root overflow0·EQ580px/8개 한 줄을 추가로 측정하고 viewport 캡처3장(상단/조작부/EQ)으로 변경했다. 잘못된 고배율 배치를 거부하는 RED→GREEN·strict/관련27개 통과. 이 도구 보완의 새 Native 재검증과 F01 cold 전환/T8/T9는 미완료다.

#### UI gate 최종 확인과 전환 검증 입력

65774b2에서 전체1549개 중1548통과/실패0/기존 private 감사1skip(79.883초)·9기반/build/package를 확인했다. Q/R·S/T의 기능/geometry/4손실 gate도 통과했으나, 스크롤한 Playwright viewport 캡처가 여전히 잘못된 영역을 저장했다. 이 캡처들은 UI 표시 증거로 채택하지 않았다.

1783812c1cbcaf4a1e7376a259531097cba49543에서 같은 own page의 CDP 원본 surface를 clip/metrics override 없이 캡처하고, 기존 owned 파일 capability를 통해 고정 PNG3종/24byte–8MiB/PNG서명/wx만 저장하게 했다. 경로 탈출·잘못된 형식/초과 크기·writer 누락 RED→GREEN, strict/관련62개 PASS. 실제U는24.947초/exit0/ok=true, 별도 프로필V의4손실 대조는24.967초/exit0/ok=true다. U의 sourceSha256=bcd8cb4257f395f29f8ab391fe846894520c080c156a1dc29189a4f0c6614e08, source/after 일치·종료3증명true·pageErrors=[]다. V 역시 runner의 정확한4손실/source/종료 gate를 통과했다.

실제200% 상단·컴프레서·EQ 원본 viewport PNG를 눈으로 대조해 정상 표시를 확인했다. geometry는DPR1→2/viewport1280→640/수치80CSSpx/root overflow0/EQ580px·8대역 한 줄이다. 좁은 EQ 내부 가로 스크롤은 유지하며 물리 오디오·장기 메모리 증명은 아니다. 실패 캡처·프로필도 삭제하지 않는다.

후속 cold 전환은 기존 published2.13.3의58자산과 별도로 F00 ae9f8e50a22dae9d549f1e476d302549ecc03b4a의59개 Git 객체/765607byte를 고정했다. inventorySha256=9715087af1aa2b36fc54b330e5a879ce384f4c9a4f56faf1c6fd8847436580df이며 현재 root dist나 F01을 옛 입력으로 재사용하지 않는다. helper/metadata 누락·변조·경로·개수 대조 RED→GREEN 및 실제 strict 소비자의 root/binary 오용 음성 대조와 정적 검사를 포함한39개가 통과했다. parser와 literal v1/upgrade/edited 기대 값은 구현 중이며, 아직 F01 전환 CLI 연결/Native 성공은 없다.

#### Cold 전환 runner 구현·사전 검증

기존 `check-installed-transition.mjs`의 감독·child·빌드·보존 경로를 확장해 `--media-schema=f01`을 연결했다. 기존5사례의 함수/seed/손실 판별은 유지하고 F01의6사례를 추가했다. positive37launch, negative19launch를 고정하며 각 launch의 case/occurrence/payload role/정확한 종료3증명을 모두 검사한다. 별도 프로세스 프레임워크·의존성·확장 권한은 추가하지 않았다.

고정 v1 기대 입력과 독립 schema2 기대 값을 사용해 읽기 무쓰기→명시upgrade→실제 TAB의 전역/채널 EQ·Gain0·preset 생성/적용→F00 제한·raw보존→F01 재개→게시본 전역 alias 왕복을 검사한다. 미생성·최대 revision·손상·미래 형식은 별도 새 프로필이다. 손실 대조4종은 실제 저장 뒤 채널 Gain0/상속false/EQ125=1.25/새 preset UUID 중 정확히 하나만 제거하며, 원래 baseline config손실도 그대로 검사한다. 정확한 startup code/role/occurrence/native extension/version/broker와 전체 raw 한 필드 차이가 일치해야 한다.

schedule·손실 판별·Native phase·보고서 누락의 RED→GREEN, occurrence/role/종료 증명의 감독 회귀 및 실제 strict checkJs 소비자를 포함한 집중102개가 통과했다. 후속 최종 보고서에서 숨겨진 별도 failure를 거부하는 RED→GREEN8개도 추가했다. 이 직전 전체는1561/1560통과/0실패/기존1skip(70.831초)였으며 최신 전체 재실행 중이다. 9기반·후보 build/package는 최신 입력에서 모두 exit0. 이 기록 시점의 새 cold Native 실행은 아직 없으며, UI U/V·Gain M 성공을 전환 성공으로 전용하지 않는다.

최신 전체1562/1561통과/0실패/기존1skip(69.777초) 및9기반/build/package exit0를 확인했다. root dist는58파일·version2.13.3 그대로다. 이제 이 소스와 모든 fixture를 로컬 checkpoint로 고정한 뒤 새 owned 프로필에서 Native positive/negative를 실행한다.

첫 Native W는0db8f8a에서 기존5사례의15phase 관측을 통과한 뒤 valid-v1/F00 화면 연결에서 실패했다. sourceSha256=196a2960c77a12d72aeaee4b2136ed3f5d8cb8bf9baa0d0ca1c4fdb113e23ec0 전후 일치·22launch 종료3증명 전부true·cleanup/secondary0이며 실패 프로필/trace/PNG를 보존했다. 전체 전환 PASS가 아니다.

trace상 toolbar openPopup은 정상 반환했지만, 앞서 연 자기 전역 설정 TAB이 툴바와 정확히 같은 popup.html 주소로 남아 대상 선택이 모호해졌다. 대상 선택을 완화하지 않고 완료된 자기 TAB만 먼저 닫는다. 아울러 schema1 전환 전/F00의 schema2 복귀는 의도한 읽기 전용이므로, 기존 helper의 무조건 writable 검사 대신 명시적인 ready/upgrade-required/repair-required UI gate를 추가했다. native sender/frame/document/window/프로토콜 검사는 동일하며, upgrade code/활성 전환 버튼·읽기 전용 disabled 상태를 각각 요구한다. 잘못된 상태/모드와 writable 혼동 RED→GREEN, 집중45개·strict 통과. 새 checkpoint/전체/Native 재검증 전이다.

실제 client/broker의 미디어 counter MAX는 valid/ready 읽기 후 다음 변경을 `failed (revision-exhausted)`/storedfalse/commit0으로 거부한다. 손상 저장소의 repair-required와 구분하는 직접 회귀를 추가해 Native 기대 값을 보완했다. 집중51개·strict·최종 전체1564/1563통과/0실패/기존1skip(70.762초)이 통과했다. 직전9기반/build/package도 exit0이며, frozen F00에 원래 config-loss 삽입이 정확히 준비되는 것을59파일/격리version2.13.4/broker변경으로 확인했다. 제품·권한·timeout·숫자 gate는 변경하지 않았다.

7b4f6dd의 Y/Z는 F00 실제 TAB/v1 −35 읽기를 통과해 이전 대상 모호성 보완을 확인했으나, F01 형식 전환 전 UI gate에서 timeout으로 실패했다. Y23/Z6launch 모두 종료3증명true, sourceSha256=565eda71c608aaac257fc4e287ca3cd431605c75eb5d39f0e90724f86123f48d 전후 일치이며 cleanup/secondary0이다. Z의 원래 config-loss 대조1개는 일치했지만 전체 대조 성공이 아니다.

Y trace/소스에서 snapshot.code와 일반 mediaView.code가 별개임을 확인했다. 형식 전환 가능 코드는 전환 버튼의 표시/활성 조건이며, 일반 상태 문구에는 반복 표시되지 않는다. 실제와 같은 일반 문구로 회귀를 RED 재현한 뒤, 준비 상태+표시·활성 전환 버튼+기존 writable 필드 disabled로 검사한다. 버튼을 결정하는 제품의 정확한 snapshot-code guard는 그대로다. 또한 예상 손실 대조가 이후 예상 밖 실패용 trace 슬롯을 먼저 차지하지 않도록 검사 도구만 보완했다. Native 재검증은 새 checkpoint에서 수행한다.

이 보완의 집중102개·strict·전체1564/1563통과/0실패/기존1skip(73.596초)을 확인했다. 새로운 Native checkpoint를 고정해 정상/손실 대조를 다시 실행하며, 이전 W/Y/Z 실패 기록은 그대로 보존한다.

3d612c1의 AA는 두 번째 기존 사례의 Chrome 시작에서 browser-unavailable로 실패했다. 그 launch는 종료 증명이 없어 결과를 수용하지 않았고 프로필·후보를 보존했다. 해당 자기 root에 한정한 읽기 전용 프로세스 조회에서는 일치 프로세스가 없었으나 이를 종료3증명 PASS로 승격하지 않는다. 시작 실패 원인은 아직 특정하지 않았으며 다음 실행은 순차로 제한한다.

AB는 실제 형식 전환을 성공시킨 뒤 독립 기대 값 대조에서 멈췄다. 승인 설계§67–68과 기존 T1 회귀는 모든 기존 channel/preset revision도1 증가하도록 정했으나, 새 전환 fixture가 이를 빠뜨렸다. 제품을 바꾸지 않고 literal 기대 값을 A전환3/최종6·B2·기존preset2로 바로잡았다. IDs/이름/createdRevision/영상 값·store8/12·global4/9/10/11은 그대로다. 잘못된 literal2≠3의 RED와 관련17개 GREEN을 확인했다. AB6launch 종료3증명true/source9635bb380b8c625bfc039e47a624d9208d1d185e1ab83e33f9cfe5f9bdbc45ba 전후 일치/cleanup·secondary0이며, 원래 config-loss1개만 일치했다. 아직 전체 전환 성공은 아니다.

literal 보완 후 최신 전체1564/1563통과/0실패/기존1skip(71.325초)이 통과했다. 다음 새 checkpoint는 음성 대조를 먼저 실행하고 성공 시 정상 전환을 순차 실행한다. 제품 동작·숫자 gate와 독립 literal 방식은 유지한다.

32a8c5d의 AC 음성 대조는 exit0/ok=true로 통과했다. 기존 config 손실+F01 4손실 모두5개가 정확히 일치했고 실제 성공 phase9/launch19 종료3증명 전부true/cleanup·secondary0이다. sourceSha256=422f9346286bee84735fed2928b912d404a78e413b837855ddd7092f65d3ac74가 전후 일치한다. 실제 UI 저장 후 각 한 필드만 제거한 것이며 timeout은 성공으로 계산하지 않았다.

이어진 AD 정상 전환은 F00 복귀3에서 숨겨진 compressorDefault 입력의 native uncheck가 timeout으로 실패했다. raw는 올바른 schema2/revision12·global9를 유지했고24launch 종료3증명true/같은source 전후일치/cleanup·secondary0이다. F00은 plain popup의 모든 오디오 필드를 숨기고 schema2 TAB도 읽기 전용으로 취급하므로, 그 UI로 전역 OFF를 저장하도록 한 도구 단계가 잘못됐다. 숨긴 입력을 드러내거나 프로토콜/직접 저장으로 우회하지 않는다.

필수 동작을 분리해 정상 valid-v1 순서를9단계로 보완했다: 게시본seed→F00읽기→F01전환/저장→F00제한·raw동일→F01재개ON→게시본OFF→F01재개OFF→게시본ON→F01재개ON. 정상 전체39launch이며 음성19launch/정확한 기존 witness는 변경 없다. 게시본에서는 실제 details summary를 먼저 클릭한 후 해당 checkbox를 조작한다. 이는 관측2개 추가이지 권한·수치 gate 완화가 아니다. schedule/기대 raw/감독의 RED→GREEN80개, 기존 전체1564/1563/0/skip1(72.580초)이 통과했고, summary 클릭까지 포함한 최종 집중45개/strict 통과 후 전체 재실행 중이다. 새 checkpoint의 정상39/손실19 재검증은 아직 남아 있다.

summary 실제 클릭을 포함한 최종 전체1564/1563통과/0실패/기존1skip(72.618초)도 통과했다. 확장 순서와 모든 fixture를 새 로컬 checkpoint에 포함해 순차 Native 재검증한다.

b96b002의 AE는 새 UUID가 기존111…보다 앞에 정렬된 경우를 만나, 도구의 ‘새 preset은 두 번째’ 가정이 깨졌다. trace에서 기존111…을 선택했음을 확인했고 독립 기대 값의 기존 ID 거부가 이를 검출했다. 제품의 정렬/저장은 정상이며, AE6launch 종료3증명true/sourcebc17e724d70723b93b02feadac6424abf29b0b982fc52bc5c348e0c67e6d0cb4 전후 일치/cleanup·secondary0이다. 음성 전체가 실패했으므로 뒤의 AF 정상 실행은 시작하지 않았다.

새 Native preset은 생성 revision11/항목revision1/domain/name으로 유일하게 식별하고 UUID를 확인한다. 독립 literal 기대 값은 Native UUID를 대입한 뒤 별도로 ID순 정렬하며, 선택·손실 주입·손실 판별도 위치가 아닌 동일 신원을 사용한다. 낮은 UUID 정렬 RED→GREEN과 높은/낮은 UUID·기존 ID 오삭제·중복 신원 대조를 포함한 집중81개/strict/최신 전체1565/1564통과/0실패/기존1skip(71.806초)이 통과했다. 제품·권한·숫자 gate 변경 없이 새 checkpoint에서 정상39/음성19를 순차 재검증한다.

ae83176의 AG는 음성19/정확한5손실/성공phase9/종료3증명 전부true/source412a0cb34cf569174bdb0c914767602c711d927bc527f9cce57af69094c742eb 전후 일치/cleanup·secondary0로 통과했다. 이 Native run의 UUID는 모두 기존 ID 뒤였으므로 낮은 UUID에 대한 Native 성공이라고 부르지 않는다. 낮은/높은 정렬과 식별 대조는 독립 회귀로 검증했다.

AH는 F00 복귀3의 UI 검사에서 실패했다. F00은 새 catalogue를 제한하지만 전역 설정은 독립적으로 사용하게 하므로, global brightness는 활성화돼 있는 것이 정상이다. frozen renderFields의 selected 조건과 trace에서 이를 확인했다. AH24launch 종료3증명true/같은source 전후일치/성공phase17/cleanup·secondary0이며 raw schema2/media12/global9는 보존됐다.

반복된 준비 상태 가정을 해결하기 위해 승인된 T7 도구 내부에서 Native sender qualification과 UI readiness를 분리했다. 기존 `openInstalledMediaSettings`는 ready/brightness-enabled/`tabWriterQualified` 계약을 유지한다. cold 전용 `openQualifiedMediaSettings`는 같은 비공개 qualification/15초/정확한 native context·sender/frame/document/window/프로토콜/소유 popup cleanup을 공유하고 `tabSenderQualified`만 반환한다. 새 권한·전송·의존성·제품 변경이나 공개 UI bypass 옵션은 없다.

cold caller는 F00 global 사용 가능/채널·preset 작업 잠금→실제 current 선택 후 필드 잠금, F01 schema1 전환 버튼 활성/미디어 입력 잠금, F01 schema2 쓰기 가능 ready를 각각 검사한다. 연결만 됐는데 UI도 준비됐다고 간주하지 않는다. 새 core 누락 RED→GREEN, 기존 writable helper·core 권한 음성 대조·실제 소비자의 sender/writer 혼동 및 UI bypass 속성 오용 compiler 대조를 포함한129개와 strict가 통과했다. 최종 전체 검사 후 새 checkpoint의 정상39/손실19 재검증으로 이어간다.

분리 후 최신 전체1568/1567통과/0실패/기존1skip(71.870초)을 확인했다. 이를 새 로컬 checkpoint로 고정해 동일 권한 경계의 순차 Native 재검증을 수행한다.

#### Cold 정상·음성 최종 통과 — eb9cfd5

eb9cfd53be450d7aaac8969b996e8d6de97c122b의 AI 음성 대조와 AJ 정상 전환 모두 CLI exit0/ok=true다. sourceSha256=51fbfa55346d7bb3e5d7c260824eb90d54a912e519ebfcac78c88dd3085c1602이며 두 run 모두 source/after5필드 전체가 일치한다.

- AI: 새 profile5개/성공 관측9phase/예상한 config+F01 4필드 손실5개만 검출/launch19 전부 종료3증명true/cleanup·secondary0.
- AJ: 새 profile11개/seed11·관측28phase/launch39 전부 종료3증명true/예상 밖 failure0·cleanup·secondary0.

AJ는 기존5baseline·v1 읽기 무쓰기/명시 전환/실제 전역·채널 Gain0/EQ/preset 저장·F00 global 사용 가능 및 current 채널/preset 제한·raw 보존·F01 재개·게시본 전역 OFF/ON 왕복·absent 첫 저장·최대 revision/손상/미래 형식의 수용기준을 통과했다. AI는 실제 저장 뒤 한 필드 손실만 정확히 검출했다. 모든 profile/candidate 및 과거 실패 증거를 보존한다. 이는 bundled code cold relaunch이며 실제 스토어 업데이트나 플랫폼 rollback 성공이 아니다.

공통 helper의 기존 정상 경로도 같은 checkpoint에서 Gain full(AK)·설정 UI positive(AL)·정확한4손실(AM)로 재확인한 뒤 T7을 마감한다. 이 기록 시점에는 해당 재실행이 진행 중이며 T8/T9는 시작하지 않았다.

AK70.833초/AL25.345초/AM25.604초 모두 exit0/ok=true이며 같은 eb9cfd5/source51fbfa…5필드 전후 일치·종료3증명true·pageErrors=[]다. AK는 fullEvidence4종/61초 idle 뒤 첫 입력/포커스·Gain0·원래 mute/volume 보존을 확인했고, AL은 UI 정상, AM은 정확한4손실을 확인했다. 이는 해당 case들의 통과이며 아래 체크리스트 대조까지 whole T7 완료로 올리지 않는다.

#### T7 완료 전 명시적 잔여 관측 보강

체크리스트와 실제 case를 대조해 별도 Native 증거가 필요한 항목을 구분했다. 기존 단일 CAS와 A→B→A는 같지 않고, EQ만의 외부 merge와 스타일 동시 merge도 같지 않다. 다른 창 종료 때 설정 UI까지 닫힌 결과는 ‘원래 대상만 닫혔지만 UI는 살아 있는’ stale 조작 거부를 대신하지 않는다.

새 ABA는 기존 실제 full-confirm 보류/원본1회 전달 장치를 재사용한다. 다른 실제 TAB에서 EQ 한 필드를 두 번 조작해 값 A를 복원하되 catalogue/record revision만 각각2 증가시키고, 원래 full 요청은 conflict/storedfalse로 거부해야 한다. 원래 CAS의 revision+1 조건은 변경하지 않는다. 스타일 검사는 실제 styles.html의 protocol1 checkbox와 설정 TAB의 protocol3 전역 EQ 입력을 동시 저장해 서로 다른 native document/frame0의 요청2개·전역 revision+2·전체 raw의 정확한 두 변경과 CSS 등록을 요구한다.

대상 종료 검사는 실제 target tab을 먼저 닫고 settings UI를 유지한 상태에서 tabs.get 부재/contexts0와 원래 binding의 거부를 확인한 뒤 창을 닫는다. 현재 broker의 정확한 실패는 read/settings-operation-failed/storedfalse이며, 별도 native 부재·UI disabled·원시 전체 무쓰기·남은 재생/source1과 함께 요구한다. 일반 오류를 단독으로 성공 처리하지 않는다. 실제 document.hidden도 읽으며 강제 visibility 주입은 하지 않는다. 정밀 hidden timer/rate/old-callback 수명 계측은 T8에서도 별도로 완료해야 하고 finite heap은 leak-free 증명이 아니다.

누락/잘못된 ABA·merge·종료 증거를 허용하던 report gate의 RED→GREEN, 집중29개/strict/9기반/build/package와 최신 전체1570/1569통과/0실패/기존1skip(72.427초)이 통과했다. 제품·권한·numeric gate 변경 없이 새 checkpoint의 실제 UI 정상/정확한4손실 검증이 남아 있다.

#### 재시작 후 비활성 탭 관측 원인 확인

2026-10-15 점검에서 root/native는 clean e280e0d였다. AN의 마지막 summary는12:59 실패(`audio-settings-hidden-unobserved`)·종료3증명true이며 시스템 가동 시간으로 추정한13:05 재부팅보다 앞선다. 따라서 재부팅 중 검사가 끊긴 결과로 보지 않는다. 후행 AO는 미실행이며 Windows Update가 재시작 원인인지는 별도로 확인하지 않았다.

별도 일회성 새 프로필에서 headless/화면 표시 모드 모두 두 탭 visible/visible, 별도 session의 focus emulation=false와 실제 창 최소화에도 hidden=false를 재현했다. 설치된 Playwright1.62.1 coreBundle은 페이지 연결 시 focus emulation=true를 전송한다. [공식 noDefaults 설명](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp-option-no-defaults)에 따라 익명 pipe와 noDefaults를 사용한 최소 재현에서는 비활성 탭 hidden=true/state=hidden/focus=false, 복귀 hidden=false/state=visible/focus=true, 자기 자식 프로세스 exit0이었다. diagnostic profile/evidence는 보존한다. 이 재현은 제품의 hidden DSP/timer 성공이 아닌 제어 도구 간섭의 원인 증거다.

F01 설정 Native 검사에만 같은 공식 연결 경로를 적용하고 일반/Gain/전환 launcher는 그대로 둔다. 새로운 transport framing·폐기 테스트와 visible 복귀 report 거부 테스트를 RED→GREEN으로 검증한다. 제품/DSP/수치·설정 권위는 변경하지 않는다. 전체 회귀와 새 clean checkpoint의 실제 정상/정확한4손실·종료3증명·전후 source 확인 전에는 T7 성공으로 올리지 않는다.

transport 신규3개 및 복귀 관측 누락 거부를 RED→GREEN으로 확인했다. 집중31/31·strict development, 격리 후보의 네이티브 전체1573개 중1572통과/실패0/기존1skip(66.116초), 9개 기반/build/package가 통과했다. 별도 샌드박스 root 실행의 링크 권한 실패2건/중단은 성공으로 계산하지 않았고 로그를 보존한다. root dist58/제품2.13.3은 유지했다. 새 clean checkpoint 실제 정상/정확한4손실 재검증이 남아 있다.

648f677의 AP는 startup의 `extension-worker-url-invalid`에서 실패했고 AQ는 시작하지 않았다. 새 raw 실행에 기본 Playwright의 `--disable-component-extensions-with-background-pages`가 빠져 내장 확장의 thunk.js 등도 발견되는 것을 자기 diagnostic에서 확인했다. 원래 worker 선택기를 완화하지 않고 이 기존 제외 flag를 복원했다. 복원한 최소 재현에는 복구판 worker만 있고 실제 hidden/visible·자식 exit0이었다. AP summary의 shutdown=null은 성공 증명이 아니며 그대로 보존한다. startup 실패 경로는 자기 spawn 자식만 종료하고 exit를 기다리며 Native 성공 gate와 구분한다.

복원 뒤 집중32/32·strict·격리 전체1574개 중1573통과/실패0/기존1skip(65.595초)을 확인했다. AP의 정확한 자기 프로필 DeBcON에는 현재 남은 root process가0개였으나 이를 과거 종료3증명으로 바꿔 기록하지 않는다. 후속 AR정상/AS정확한4손실은 새 checkpoint에 고정한다.

27c95b2의 AR은 실제 hidden 관측과 앞선 ABA/스타일/ACK 검사를 지나 두 번째 방송 reload 뒤 클릭에서 중단됐다(40.922초/종료3증명true). 보존한 trace는 call@937의 두 번째 방송 reload, call@947의 같은 page `.knife-comp button` 클릭 대기, 직전 활성화가 다른 설정 TAB임을 보여 준다. 실제 비활성 문서의 클릭 안정화에 강제 focus가 필요하다는 기존 도구 전제가 드러난 것이다. 각 lifecycle 조작 전에 정확한 해당 방송/설정 TAB을 앞으로 가져오도록 순서를 명시한다. 강제 클릭·visibility 위조·제품 변경은 없고 AS는 미실행이다. 새로운 정상/손실 재검증 전 T7 미완료를 유지한다.

301c2e9의 AT는 위 조작을 지나 `audio-settings-new-video-default`로 실패했다(41.361초/종료3증명true). 마지막 Native 관측은 owner3/ready=true/decoded=true/blob=true/effectiveGain0.5/hidden=true이나 wanted=false·audio off·source0이었다. AU는 미실행이다. runtime의 MutationObserver→schedule 경로는 rAF만 사용하고 숨김 상태에서는 route pulse도 중단된다. rAF가 전혀 실행되지 않는 문서에서 video 교체 후 옛 video가 runtime.state에 남는 독립 회귀를 RED로 재현했다. Native 출력과 코드·단위 재현이 같은 지연을 지목하므로 단순 검사 timeout 연장/활성화로 통과시키지 않는다.

현재 제품 변경은 하지 않았고 새 RED 테스트와 한국어 보완 설계만 추가했다. 기존 기본 launcher 아래의 과거 PASS는 숨김 수명을 증명하지 않는다. 기존 T7 정상/손실·cold/Gain 성공은 해당 checkpoint의 범위로 보존하며, 제품 수명 스케줄러를 변경하면 새 입력으로 재검증한다. 반복 보완에서 다른 층의 실행 문제가 드러나 systematic-debugging의 구조 재검토 단계로 전환했고, 계획의 단발 timeout/취소/ticket 설계 승인 전에는 네 번째 수정이나 T8 진행을 하지 않는다.

사용자 추가 승인 뒤 lifecycle 한 곳에만 숨김100ms 단발 예약/표시 rAF·공유 취소 epoch를 구현했다. visibility/BFCache/final dispose에서 예약을 취소하고, 취소되거나 실행된 옛 callback은 새 예약을 소비하지 않는다. frozen visibility 이벤트도 재조정을 실행하지 않는다. 신규4개 RED→GREEN 및 관련 runtime/scoped/normalizer/Gain62개가 통과했다. 기존 MAIN 생성기로 web/runtime.js만 달라졌고 실행 pin은598655ca…로 갱신했다. 다른 DSP/권한/저장 계약은 변경하지 않았다. 9개 기반/build/package는 격리 후보에서 PASS; inventory를 포함한 별도 샌드박스 집중 실행의 symlink EPERM은 성공으로 계산하지 않으며 네이티브 전체 회귀로 확인한다. 새 actual Native 검증은 아직 남아 있다.

빌드 완료 뒤 단독 실행한 격리 전체 회귀1578개 중1577통과/실패0/기존1skip(60.169초)을 확인했다. 앞선 동시 빌드 실행은 hls-verifier의 complete-pass 기대에 incomplete가 나온1건(1576통과/1실패/1skip)으로 실패했으며 별도 로그를 보존했다. HLS 코드·제한·기대 값은 바꾸지 않았고 같은 소스의 빌드 종료 후 전체가 통과했다. 다음 새 checkpoint 실제 설정 정상/4손실·Gain full·cold19/39를 모두 마쳐야 T7 완료다.

7174c9a의 AV는 제품 교체 검사 전 unknownAckProof의 마지막 media-discard 클릭에서 대기 실패했다(42.215초/종료3증명true/source일치). 직전 스타일 TAB 닫기 뒤 다른 설정 TAB이 비활성 상태였고 해당 phase 시작에 활성화가 빠져 있었다. trace의 call@1149와 페이지 ID를 확인한 뒤 검사 시작 시 정확한 other TAB의 bringToFront만 추가했다. 제품 source/수치·ACK 유실1회/무재시도·원시 무쓰기·discard 재조회 조건은 그대로다. 후행 AW/AX/AY/AZ는 미실행이다.

ACK phase 보완은 집중32·strict·격리 전체1577통과/실패0/기존1skip(60.707초)으로 확인했다. 나머지 phase 경계도 대조해 방송을 앞으로 가져온 채 끝나는 lifecycle 다음 quota 검사에서 해당 settings TAB을 먼저 활성화하도록 명시했다. 마지막 두 조작 전제에 대해 도구 집중18·strict를 다시 확인했다. 제품 소스는7174c9a와 같고 새 actual Native 및 Task7 최종 전체 게이트는 아직 남아 있다.

#### T7 로컬 마감 — 2026-10-15

090452a/전체소스65a43c7c… 입력에서 BA설정 정상26.150초·BB정확한4손실26.746초·BCGain full71.443초·BDcold19회/정확한5손실·BFcold39회 정상 모두 통과했다. 각 source/after5필드 일치·성공 실행의 종료3증명true·cold cleanup/secondary0을 확인했다. BA는 실제 숨김/표시 복귀·PZP/새 video·수동 OFF/자동 기본값·ABA revision2/conflict·스타일/전역 EQ 원시 병합·살아 있는 UI의 원래 대상 종료 거부를 포함한다. 모든 성공을 새 단일 checkpoint에 묶었으며 세부 실행 ID/범위는 [완료 단계 아카이브](../archive/2026-10-15-f01-completed-stages.md)에 분리했다.

BE의9번째 launch(legacy-null seed)는 browser-unavailable로 실패했다.8회 종료와1회 미확인/IPC 등 후속 오류는 그대로 보존했고 정확한 실패 프로필의 현재 프로세스0만 따로 확인했다. Windows 내부 원인은 미확정이며, BF는 같은 입력의 새 전체39회 재실행 성공이다. 실패를 소급해 성공으로 고치지 않았다.

마지막 task-done은 격리 후보의 전체1578개 중1577통과/실패0/기존private감사1skip(60.919초)을 실행하고 T7 완료를 원장에 기록했다. T8 정밀 출력/수명 및 T9 종합/독립 최종 검토는 미완료다. root dist58·제품2.13.3·기존 Chrome/P09·ZIP/CRX·모든 실패 증거를 보존하며 공개 작업은 하지 않았다.

#### T8 전환 dip 재현·알고리즘 보완 승인 게이트 — 2026-10-15

입력53103ab1b63b9dfa29fee551dd1a4c45414097d3/전체소스f1891b531293ea70cb4a57f626b26efc5098c65444a1a795088fe99881547477에서 F01audio20261015C(lLASMk)와 동일 입력의 새 프로필 D(KsSoFf)가 각각44.1kHz EQ36 통과 후24개 전환을 수집하고 실패로 종료했다. 두 실행의 source/after5필드 동일·pageErrors0·Browser.close/disconnect/own-root 종료 모두true다. 이어지는48/96kHz·전체 RMS·수명은 실행하지 않았고 기존 객관 runner의 새 입력 재실행도 하지 않았다. 모든 보고서·프로필·raw EQ 캡처를 유지한다.

두 번 모두 복합 EQ/comp/normalizer ON 상태에서750Hz master OFF만 기존 master gate를 위반했다. 최소8ms RMS를 작은 정상 endpoint로 나눈 비율은 C0.9437224358/D0.9438747006으로0.95 기준 미달이다. maxAdjacentStep의 baseline 초과분은 C1.2516975e-6/D1.7881393e-6으로 기존1e-6보다 크다. 수집한 전환의 change-channel peak 최대는 약0.2397, full-scale 초과 sample은0이며 클리핑이나 실제 하드웨어 잡음을 확정한 결과는 아니다.

코드 경로는 setEnabled(false)→bypassEntry의10ms dry/wet 복귀와 announce(off)→syncMeter→stopMeter의 normalizer boost→unity10ms가 동시에 적용된다. wet 비중을 낮추면서 같은 branch gain도 낮추는 두 전환이 중첩되는 경로를 원인 후보로 좁혔다. 독립 EQ 전달함수의750Hz 위상은 약11.28도이며, 단순 정상 endpoint의 선형 합만으로는 관측 dip을 설명하지 못했다. 원인을 EQ 위상 하나로 단정하지 않으며 native normalizer automation/현재값·빠른 재진입 대조를 보완 RED/GREEN에 포함한다.

권장 국소 보완은 분석/timer/buffer·old epoch는 즉시 정리하되 master의 기존10ms dry 복귀 동안 normalizer 현재 gain을 유지하고 wet가0인 뒤 unity를 복귀시키는 것이다. JS timeout 대신 audio clock의 예약과 현재 계산 곡선을 사용하고, 빠른 OFF/ON·다시 설정·source/route 교체 시 옛 예약을 취소/재연결한다. 단독 normalizer OFF/측정 오류의 기존10ms 예외와+1/-12dB/s·warmup·출력 상한·source1·저장/권한 경계는 그대로다. 제품 DSP는 아직 수정하지 않았고 승인 전 여기서 대기한다.

추가 측정기의 개별 EQ/comp/normalizer step 초과도 삭제하지 않고 진단으로 보존한다. 명세147절의 기존 dip/연속성은 master 전환에 대한 기준이고 개별 효과 전환은 출력 상한 검사다. 초기 도구가 개별 효과에도 같은 stationary step 기준을 일괄 적용한 것은 명세보다 과한 분류였다. 후속 보완에서는 이 범위를 바로잡되 실제 master750 실패를 제외하거나 어떤 기존 허용치도 넓혀 성공시키지 않는다. EQ1000Hz 전환의 약5.2% step 증가는 별도 관측이며 그것만으로 클릭/불량을 확정하지 않는다.

root dist58·제품2.13.3·사용자 Chrome/P09·모든 실패 증거와 로컬 checkpoint를 보존했다. push/PR/릴리즈·스토어 변경은 없다. 전체1590통과/실패0/기존1skip은 도구 단위/회귀 증거이지 T8 Native 전체 성공이 아니다.

#### T8 중간 실제 관측과 측정 도구 보완 — 2026-10-15

로컬9e77f03에서 기존 객관 검사의14 steady/12 alignment/18 transition/stress가 실제 bundled151.0.7922.34·source1·qualityFailures0으로 통과했다. 별도 F01audio20261015A는 mt.exe 준비 실패로 브라우저 측정에 진입하지 못했다. Windows 내부 원인은 미확정이며 원본 실패 보고서/복사본을 보존했다. 같은 입력의 새 F01audio20261015B는44.1kHz에서 EQ36·RMS20/역상/한쪽 채널이 모두 통과했으나 후속 수명 검사에서 graph-not-ready로 전체 실패했다. B의 source/after5필드 동일·pageErrors0·종료3증명true를 확인했다. B의 보조 wet/extreme48/silence/noise/burst/stall/error는 통과지만 dry RMS와 전체 수명/나머지 두 rate는 미완료이며 새 입력의 증거로 재사용하지 않는다.

실패와 코드 대조로 표시 복귀의 실제 revalidation을 한 번만 응답하는 합성 드라이버가 처리하지 못한 것을 확인했다. 드라이버에만 같은 origin의 현재 request 응답과 의도한 설정 유지를 보완했다. float DC의 peak1/.99는 보존됐지만 1초 WAV의 decoder loop 경계가 RMS0.99495/0.985로 측정되어, 모든 창이 반복 경계 전에 끝나는20초 입력으로 변경한다. 원래 RMS 허용치는 그대로다. 새 창 선택도 기존 blank tab을 선택하지 않도록 생성 이벤트/실제 CDP targetId/windowId를 교차 검증한다. 별도 RED→GREEN을 남겼고 이 중간 실행을 전체 PASS로 올리지 않았다.

후속 게이트는 각 rate에서 EQ/comp/normalizer/master의250/750/1000Hz 전환24개를 기존 dip0.95·step+1e-6 기준으로 양쪽 채널에서 검사한다. dry/wet는 native scheduling의 전체 구간 합1도 확인한다. 실제 FFT/power 읽기와 warmup·반복 위상 burst·무음 unity 복귀·mute/volume/Gain0/hidden hold를 보강한다. 새 도구 입력 전체를 다시 checkpoint하고 재검증하며 제품 DSP/허용치·사용자 프로필·권한 변경은 하지 않았다.

후속 도구 입력은 격리 전체1591개 중1590통과/실패0/기존private감사1skip(60.961초)·집중11/11·9개 기반/build/package를 확인했다. 실제로 평가하는6개 산출물과 HTML helper도 source attestation의 필수 tracked 입력에 포함했다. 다음 새 Native는 전환 수치 위반을 발견하면 장시간 RMS의 진행 전에 실패로 보존하며, 허용치를 넓히지 않는다. T8/T9는 계속 미완료다.

#### T8 측정 도구 구현·Native 실행 전 게이트 — 2026-10-15

기존 CLI의 parser/정규화된 전체 calibration 본문 hash와14 steady·12 alignment·18 transition·stress 수치/허용치를 유지했다. 변경 허용 부분은 protocol3 완전 기본값 주입, 같은 기존 Windows bundled 준비/익명 pipe/noDefaults/정확한 자기 프로필 종료 경로 재사용뿐이다. `--chrome`의 기존 의미는 유지한다. synthetic MAIN Gain 호출은 영속 저장 권위 검사나 실제 사용자 동작 증명이 아니다.

새 F01 측정기는44.1/48/96kHz에서 EQ108개·RMS/채널 패턴60개와 출력/무음/지연/오류/숨김/두 창 대조군을 실행한다. 독립 RBJ 응답식·양쪽 채널·캡처 완전성·증거 누락/native예외/소스 불일치 거부를 검사하며 원본 신호/오차 fixture와 별도의 F01 fixture 및 엄격 checkJs 그래프를 사용한다. 오디오 graph 변경, 실제 사용자 데이터 수집, 새 확장/권한/원격 포트는 없다. 새 worklet은 합성 측정 도구에만 있고 실제 스피커에는0을 보낸다.

집중35/35·새 계약8/8·strict audio/development 및 격리 전체1588개 중1587통과/실패0/기존private감사1skip(63.712초),9개 기반 검사/build/package를 확인했다. 로그는 자기 execution 후보의 `output/f01-t8-{full-preflight,foundation}.log`에 보존했다. 이는 Native 출력/수명 성공이 아니며 T8은 계속 미완료다. 완전한 입력을 로컬 checkpoint에 묶은 후 clean Native 후보에서 실제 캡처와 전후 attestation·종료3증명을 새로 확인한다.

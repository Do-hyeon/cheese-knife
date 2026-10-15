# F01 순차 구현 검증 기록

2026-10-15. 사용자 승인된 상세 계획·Native 격리 실행 묶음으로 수행한다. 이 문서는 진행 기록이며 F01 전체 완료·실제 음질·무취약성·스토어 적합성 인증이 아니다. push/PR·릴리즈·버전 변경 없음.

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

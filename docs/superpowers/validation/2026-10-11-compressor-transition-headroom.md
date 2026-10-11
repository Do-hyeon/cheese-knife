# 컴프레서 전환·헤드룸 검증

2026-10-11 / Asia-Seoul. 대상은 브랜치 `codex/sidebar-preview-followup`의 미커밋 소스와 격리 후보 `audioheadroomfinal20261011a`다. 이 기록은 컴프레서 ON/OFF 전환과 극단 설정의 출력 경계에 한정하며, 모든 방송 음질이나 설치본 수용을 대신하지 않는다.

## 변경 계약

- dry 경로에 현재 Chromium `DynamicsCompressorNode`의 정수 pre-delay 프레임과 맞춘 `DelayNode`를 둔다. 프레임 수는 `min(floor(float32(0.006) * float32(sampleRate)), 1023)`이다.
- wet 경로의 사용자 Gain 뒤에 4097점 `WaveShaperNode`를 둔다. 곡선은 `|x| <= 0.9`에서 항등이고 0.9~1.0 구간을 단조 cubic Hermite로 ±0.98에 수렴시키며 `oversample = none`이다.
- delay, compressor, Gain, limiter와 dry/wet 노드는 `createMediaElementSource`보다 먼저 만든다. 준비가 실패하면 원래 media 경로를 가로채지 않는다.
- UI, 저장 schema, 권한, 의존성, Gain 0~2 범위, 10ms Gain/ON-OFF 전환 시간은 바꾸지 않는다.

## RED 근거

변경 전 `output/audio-quality/report.json`은 `output/audio-quality/report-pre-transition-headroom-20261011.json`으로 보존했고 SHA-256은 `f40cc6e4a1735bed755465b4716ab976540c44cc8c5dc3b97195db412a29708e`다.

- 컴프레서 ON/OFF 전환에서 250Hz 최소 8ms RMS가 약 0.14로 기준 약 0.263보다 낮았다.
- 750Hz 최소 8ms RMS가 약 0.147로 기준 약 0.284보다 낮았다.
- `threshold=0`, `knee=0`, `ratio=1`, Gain 2.0의 극단 입력은 peak `1.959441065788269`, full-scale 초과 샘플 `16000`이었다.
- 새 unit 계약은 delay/limiter 부재와 생성 실패 시 원래 경로 보존을 각각 실패시킨 뒤 구현으로 전환했다.

## GREEN 근거

실제 Chrome `155.0.8059.39`, sample rate 48000Hz에서 `node scripts/check-audio-quality.mjs --chrome`를 최종 실행했다. 결과 파일 SHA-256은 `956d55a2af50f907a8e528bcf77297148fafcb5ef4ea0d47f4c5bb2a482c0e4c`다.

| 경계 | 최종 측정 | 판정 |
| --- | --- | --- |
| 250Hz OFF | 최소 8ms RMS `0.26324657498866944`, 기준과 동일 | PASS |
| 250Hz ON | 최소 8ms RMS `0.26324657498866905`, 기준 `0.26324657498866944` | PASS |
| 750Hz OFF | 최소 8ms RMS `0.2844031008089024`, 기준과 동일 | PASS |
| 750Hz ON | 최소 8ms RMS `0.28440310080890263`, 기준 `0.2844031008089024` | PASS |
| 극단 headroom | peak `0.9800000190734863`, full-scale 초과 `0` | PASS |

250/750/1000Hz의 양방향 ON/OFF 여섯 전환 모두 최소 RMS와 인접 샘플 변화량 기준을 통과했다. 8/11.025/16/22.05/32/44.1/48/88.2/96/176.4/192/384kHz의 impulse에서 dry와 compressor가 각각 같은 단일 정수 프레임에 도달했다. 0.9 미만 곡선의 항등성, 홀수 대칭, 단조성, 유한값, ±0.98 상한과 생성 실패의 native 경로 보존은 unit test로 고정했다.

첫 Astra max 공격 검토는 초기 고정 `0.006` 구현에서 Important 1건을 찾았다. 44.1kHz에서 분수 프레임 보간으로 OFF 고역이 최대 20kHz `-12.196dB` 감쇠했고, 192kHz에서는 compressor의 1023프레임 상한과 dry 1152프레임이 어긋나 750Hz 전환 RMS가 기준의 약 54.5%로 떨어졌다. 위 정수 프레임 계산과 12개 sample-rate impulse gate로 보완했다. 또한 wet 전체 무음도 통과하던 Minor 측정 허점을 ON 양채널 신호 하한, stress peak 하한, transition baseline 유효성 검사와 음성 대조 unit test로 보완했다. 후속 검토에서 찾은 누락·음수 alignment 레코드 통과 가능성도 양수 sample rate와 비음수 정수 프레임, 1023 상한 및 정확한 일치 검사로 닫았다. 마지막 Astra max 재검토 판정은 Critical 0, Important 0, Minor 0이다.

## 회귀·정적·패키지 결과

- 집중 오디오·메트릭·다중 페이지 검사: 49/49 PASS.
- 최종 전체 회귀: 605/605 PASS, fail/cancelled/skipped 0.
- 최신 tool audit: `output/tool-audit/run-2026-10-11T11-22-30-314Z-g5bgCZ/summary.json`, SHA-256 `5fe6fefcd03996cafd04d2e6b68510c39b319e5d1199843d8eec7b71ab6008ca`. npm 0, Gitleaks 현재/Git 각 0, ESLint의 기존 공용 소유 경계 7행만 유지한다. 전체 종료 1은 이 guarded findings를 숨기지 않기 위한 것이며 clean scan으로 부르지 않는다.
- 경고 원장은 최신 report와 현재 소스 해시를 가리키며 원장 통합 검사 32/32 PASS다.
- 격리 후보 `output/tool-audit/p02-candidate-audioheadroomfinal20261011a/chrome-candidate/dist`: 58파일, Manifest V3 v2.13.3, 20개 진입 자원 package PASS.
- `web/audio.js` 소스와 후보 SHA-256은 모두 `bf919f72bbcf270765a2cfa5425108f033bbb069dd9f79d7833938da5061c7ef`다.
- `scripts/audio-metrics.mjs` SHA-256은 `1be498f2c29888c762ce1e833b9818e319833c553827c36c184728262a6b426b`, `scripts/check-audio-quality.mjs`는 `1bb6b0fb627f35a8bec8d6b64bc7288fa00b1e2a40188fbaad29724e311164b0`, 새 산출물 비교 모듈 `scripts/audio-artifacts.mjs`는 `5a889fd858b095f154cc3381ae3c161209a7548743471af97562bfcf451684f1`이다.

## 판정과 남은 수용

두 합성 결함은 로컬 소스와 격리 후보에서 해결됐다. 컴프레서 파라미터를 OFF 상태처럼 바꾸는 방식은 실제 bypass가 아니므로 적용하지 않았다. AudioWorklet 기반 look-ahead limiter는 새 worker·CPU·지연 계약이 필요한 별도 F01 범위로 남긴다.

기존 root `dist` 58파일은 `output/tool-audit/p06-pre-audio-headroom-dist-20261011a`에 보존했다. 최종 후보를 root `dist`에 반영한 뒤 파일 목록·SHA-256이 58/58 일치하고 package v2.13.3/20개 진입 자원 검사가 통과했다. 소스·후보·root `web/audio.js` SHA-256은 모두 `bf919f72bbcf270765a2cfa5425108f033bbb069dd9f79d7833938da5061c7ef`다.

객관 품질 판정을 설치용 산출물에 직접 결속하기 위해 검사기에 `--root`와 안전한 보고서 label을 추가했다. Chrome 155가 소스, `audioheadroomfinal20261011a` 후보, root `dist`의 `config.js`, `web/runtime.js`, `web/audio.js`, `web/player.js`를 각각 직접 읽어 동일한 합성 검사를 실행했다. 네 파일 SHA-256은 세 대상에서 모두 같고, 각 보고서의 `qualityFailures`와 교차 비교 실패는 0건이다. 비교 절대 오차는 `1e-7`, 상대 오차는 `1e-6`이다. 원시 전환 mean·dB·THD+N처럼 실시간 frame 경계에 민감한 진단값은 삭제하지 않고 개별 보고서에 보존하되 교차 동일성 판정에서는 제외했다.

private 보고서는 소스 `2e14fb89642c3f5db2b9db87788402a4b5a8d7ab7d3cb4658bb97d91c175e59e`, 후보 `c33cb1482587dd15d95d001f3cddaf8c25ba77d192aeffa0693e323465f3bdaf`, root `dist` `b8ea19c841dcc4e84194759c630292221bae8123ffc5a2cd4f856ff890fa0894`, 비교 요약 `3fbef3f9c03263a863447ad6f541b0ff37b4ae5335bdbca400c7ea38099cbda6`이다. root `dist`의 6개 ON/OFF 전환 RMS 비율은 부동소수점 오차 안에서 1이고 step 초과는 0, stress peak는 `0.9800000190734863`, full-scale 초과는 0이다.

사용자가 root `dist` 설치본을 새로고침한 뒤 실제 방송에서 약 45초간 청취했다. 컴프레서 ON→OFF→ON→OFF→ON, Gain 80→100→150→200→100→80%, 음소거·복원과 페이지 재로딩을 순서대로 실행했다. 각 단계에서 영상은 재생 중이고 `readyState=4`였으며, 재로딩 뒤 blob URL이 바뀌고 재생이 복구됐다. 방송 탭의 새 warning/error 로그는 0건이었고 최종 상태를 컴프레서 ON·Gain 80%·음소거 해제로 복원했다. 사용자의 이상 없음 응답은 보조 기록이며 수치 품질 판정을 대신하지 않는다.

따라서 이 산출물의 정의된 P06 오디오 수용은 객관 산출물 계측과 설치 통합 관찰을 근거로 통과했다. 합성 계측은 모든 콘텐츠·운영체제 믹서·출력 장치에서 무왜곡 또는 최적 음질을 보증하지 않는다.

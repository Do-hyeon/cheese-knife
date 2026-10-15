# F01 완료 단계 이력

## T9 — 종합 게이트·고지·전체 검토와 보완

2026-10-15. **최종 task-done 완료: 전체1625중1624통과/실패0/기존private1skip(64.674초)**. 원래 T9 BASE17754dd..제품021a15b 범위로 기록했다. 단계별 사전 마감 근거는 아래에 보존한다.

- README/README-en/PRIVACY의 미공개 F00/F01 저장·분석·일시 buffer/삭제·downmix·RMS/gesture·혼재 schema 한계를 동기화했다. 정책 URL/dashboard/실제 스토어 항목은 변경하지 않았다.
- 전체 branch `ae9f8e5..0b8fbe7`를 fresh `gpt-6-astra/max`가 읽기 전용 검토했다. 최초 Critical0/Important2/Minor2. Gain의 실패 후 재배치 자동 재전송과 clean read 중 알림 유실을 직접 RED→GREEN으로 보완했다.
- 같은 검토자의 `1fe0dcf` targeted에서 복구 중복 클릭의 연결된 Important1이 남아 완료하지 않았다. pending2vs1 RED→single-flight guard/즉시 render GREEN 뒤 `021a15b` targeted가 해소·새 Important0을 확인했다. 최종 잔여 Critical0/Important0/**Minor2 보류**다.
- 최종 보완의 집중22/22, 전체1625중1624통과/실패0/기존private1skip(68.363초), 9기반/build/package62/22. 실행자는 Native U source1fe의 Gain/설정/손실/MAIN누락/cold와 Native V source021의 최종 Gain full을 각각 대조했다. 서로 다른 source를 합쳐 같은 checkpoint의 전체 성공으로 쓰지 않는다.
- U cold seed11/phase28/정상 종료39회와 손실 seed5/phase9/정확한5손실/정상 종료19회 모두 source/after 일치·normalExittrue·cleanup/secondary/내부 오류0. V Gain full72.138초/source5전후 일치/pageErrors0/정상종료3증명 true다.
- 실제 최신 감사 `run-2026-10-15T13-15-19-579Z-f4EiyQ`: npm/Gitleaks dir/git0, ESLint55severity1/rawexit1·분류 catalog 이전과 같음/입력 전후 일치. 55개 정적 분류와 기존 skip1은 전체 보안 인증이 아니다.
- root dist58/공개 해시 `a7a23d74b79132479b53d80b3cac2d71ab89a3cdb15b68cdda81732e6064ddd2`, 제품2.13.3, 사용자 시청 Chrome/P09·원본 ZIP/CRX를 보존한다. 변경은 로컬 checkpoint뿐이며 push/PR/버전/병합/릴리즈/스토어 제출은 없다.
- sandbox 전체 실패27·생성 pin 누락1·중복 read RED 및 이전 A..R/Windows 준비·종료 실패를 모두 보존했다. Windows 간헐 원인은 여전히 미확정이며 이후 PASS로 소급 해결 처리하지 않는다. O의 미기록 raw 제한도 유지한다.

보류 Minor: VOD의 ‘사이트 Gain 읽기’ 무동작/미안내와 프리셋 생성의 자동 focus·빈 목록 첫 펼침 누락. VOD Gain 저장 자체·값 보존 실패는 아니지만 승인 UX와 차이가 있으며 F01 공개/통합 준비 전 별도로 판단한다. 모든 검토/실행 결과와 판단 제외 근거는 [최종 검토 기록](../validation/2026-10-15-f01-final-review.md)에 있다. F02·최종 통합·실제 게시/업데이트 수용은 별도 게이트다.

최종 물리 후보 byte 대조는 비Markdown 추적 입력308개 전부 일치다. 그 대조에서 발견한 라이선스의 기존 CRLF/LF 차이는 내용 동일을 확인한 뒤 root 원본 그대로 후보에 기계적으로 복사했다. 실제 라이선스/제품 원본은 변경하지 않았고9기반·빌드/패키지 및 마지막 전체 회귀를 다시 통과했다. 개인 검토 작업공간·실패 프로필·모든 원자료는 보존하며 브랜치는 로컬 `codex/f01-audio-processing`에 유지한다.

## T8 — 객관 오디오·출력·수명 및 설치 회귀

2026-10-15 로컬 마감. 최신 Native 입력은 `f0fb3a518630a935256e59055f4017b34014a0cd`, 제품 DSP는718db57에서 바뀌지 않았다. 모든 기준과 과거 실패 자료를 유지했으며 SDK/브라우저를 교체하지 않았다.

| 검증 | 실행·기록 | 결과 |
| --- | --- | --- |
| 신호 없는 새 프로필 준비·종료 | launcher-readiness-wZSA25 | 고정4회 전부 정상, 전후source5일치·각종료3증명 |
| 44.1/48/96kHz 사전계측·전체 출력 | F01audio20261015S-WuDbH4 | rapid36/실제세구간·EQ108·RMS60·전환72·모든대조/수명PASS, 중간JSON789개 |
| 기존 컴프레서 동결 회귀 | report-f01-t8-f0fb3a5.json | 14steady/12alignment/18transition/stress PASS |
| 영상·미리보기 정책 | f01-t8-pixels/preview-f0fb3a5.log | 24pixel/3정책 PASS, 별도 Chrome155.0.8059.40 |
| 설치 UI·포커스·저장·두 창·수명 | F01Settings20261015S | PASS, 28.164초 |
| 정확한4저장 손실 대조 | F01SettingsLoss20261015S | owned-gain/inherit-bit/eq-band/preset-id 모두 해당 경로로 감지, 26.868초 |
| MAIN 제거 대조 | F01Negative20261015S | main-runtime-missing 정확 감지 |

오디오 Native는 bundled Chromium151.0.7922.34다. S의 전후source5필드 일치·pageErrors0·정상종료3증명은 사전/긴행렬의6개 프로필 모두 확인했다. UI 정상/손실도 같은 입력과 각각 종료3증명을 확인했다. 기존 컴프레서 runner는 반환/종료코드0과qualityFailures0으로 검증했으며 보고서 자체에3종료필드가 있는 것으로 주장하지 않는다. 모든 원자료/로그는 기존 Native 물리 후보의output 아래에 보존했다.

새 launcher 계측의 신규3회귀 RED→GREEN, 집중45/strict·전체1615통과/실패0/기존private1skip·9기반/build/package PASS. root dist58·제품2.13.3·기존 수치 fixture/실행 pin·사용자 Chrome/P09·ZIP/CRX는 불변이며 push/PR은 없다.

한계와 판단: Q/R의mt 준비 실패·종료 단기 진단 실패는 새4회와S에서 재현되지 않았으며 내부 원인은 미확정이다. 추측성SDK교체/제품수정을 하지 않고, 승인된 준비 게이트4회 성공 뒤 원래T8을 같은clean SHA에서 한 번 재개했다. 이는 과거 실패의 소급PASS/무제한재시도가 아니며 재발 가능성은 남는다. O의 exit13/최종보고서 부재/전환·RMS raw 미기록도 그대로 보존한다. 자세한 승인/도구 보완/실패 이력은 [사전계측 계획](../plans/2026-10-15-f01-native-stimulus-preflight.md)과 [검증 기록](../validation/2026-10-15-f01-implementation.md)에 남긴다.

유한 합성 결과는 보호소스·실제스피커·장기누수·자연worker suspension/실제플랫폼rollback 인증이 아니다. T8 당시 남았던 T9 전체감사/공개고지/Astra max 최종검토는 위 T9 기록으로 이어진다.

이 문서는 단계별 근거를 보존한다. 후속 구현·공개 권한은 현재 PLANS.md와 사용자 승인으로 판단한다. 로컬 마감은 배포 완료나 보류 Minor의 해결이 아니다.

## T1–T6 — 구현 기반 단계별 마감 이력

아래는 각 단계 당시의 기록이다. 당시 후행 미실행 사항은 위 T8과 아래 T7의 실제 완료 근거로 이어지며, 이 문구를 현재 미완료 커서로 사용하지 않는다.

- [x] T1 schema2·읽기 무쓰기·명시 전환/전역 alias·Gain 상속 계약. 격리 집중99/99·전체1411통과/실패0/기존 private 증거1skip·9개 기반/build/package 통과. 기존 F00 pin 보존·새 F01 pin 분리.
- [x] T2 protocol3·기존 broker 한 queue·native probe/legacy import·Gain actor/epoch/receipt. 집중61/61·전체1433통과/실패0/기존private증거1skip·9개 기반/build/package 통과. 후보dist60/runtime18. native 문서/입력의 실제 성공은 T3에서 별도 확인한다.
- [x] T3 최소 production protocol3/공통 수동 master·실제 Blob/volume fixture·제한된 ISOLATED Gain UI. 전체1458통과/실패0/기존private증거1skip·9개 기반/build/package, dist61/runtime19. 포커스 보완 checkpoint6d5b39b의 실제 qualification68.761초/별도 negative6.635초 PASS·page error0·전후 소스 일치/종료 증명3개true. 자연 worker 교체는 미관측이고 TTL61초 첫 조작과 구분한다.
- [x] T4 source1·전체/하위 상태·고정8EQ·headroom·기존 delay/limiter/ramp 보호. 집중141/141·전체1465통과/실패0/기존private증거1skip·9개 기반/build/package PASS. 실제 EQ 응답/출력은 T8에 남는다.
- [x] T5 순수 RMS 제어·좌우 meter·실제 dB automation·window/hold/error·수명 정리. 집중22/22·전체1482통과/실패0/기존private증거1skip·9개 기반/build/package PASS. Native 속도/출력은 T8에 남는다.
- [x] T6 승인 TAB UI·확정 preset snapshot/confirm·legacy/upgrade·공통 수동 master 연결·최종dist62/runtime20. 실제 후행 검증은 아래 단계로 분리한다.

## T7 — 실제 설치·다중 창·저장 전환/손실 검증

2026-10-15 로컬 마감. Native 검증 입력은 `090452ae63f643ae4588062950fc25bca083af3d`, 전체 소스 해시는 `65a43c7c6641f79e0051a902c6e2213397a79fa191d23f1339b5da72e2259d92`다. 각 실행의 source/after 다섯 필드가 모두 일치했다.

| 검증 | 실행 ID | 결과 |
| --- | --- | --- |
| 실제 설정 UI·다중 창·ABA·스타일 병합·대상 종료·숨김/복귀 | F01HiddenFixed20261015BA | PASS, 26.150초 |
| 정확한 설정 손실 대조 | F01HiddenFixedLoss20261015BB | PASS, 정확한4손실, 26.746초 |
| Gain full·61초 idle·문서/iframe 거부·포커스·음소거/volume 보존 | F01HiddenGain20261015BC | PASS, 71.443초 |
| cold 전환 손실 대조 | F01HiddenColdLoss20261015BD | PASS, seed5/성공 phase9/정확한5손실/19회 종료 |
| cold 전환 정상 | F01HiddenCold20261015BF | PASS, seed11/phase28/39회 종료 |

성공한 모든 실행의 종료3증명은 true이며 cold 감독의 cleanup/secondary 오류는0이다. 앞선 BE는 legacy-null seed의 브라우저 시작 실패였다.8회 종료와1회 종료 미확인, 후속 IPC/result-missing 오류를 그대로 보존했고, 정확한 실패 프로필의 현재 프로세스 부재만 별도로 확인했다. 원래 실패를 성공으로 바꾸거나 부분 실행을 합쳐39회로 계산하지 않았다. 변경하지 않은 입력의 BF 전체 재실행이39회를 통과했다. 단발 브라우저 시작 실패의 Windows 내부 원인은 미확정이다.

주요 보완은 기본 Playwright focus emulation과 실제 숨김 관측의 분리, F01 설정 검사 전용 공식 noDefaults/익명 pipe, 내장 확장 제외·정확한 활성 탭 조작 전제, 숨김 문서의 rAF 정지 때 새 video 재연결을 위한 단발100ms 예약이다. 새 권한·의존성·원격 포트·상시 polling·저장/DSP 알고리즘 변경은 없다. source 수/데이터 손실/배치·입력 및 실패 증거의 상세 이력은 [구현 검증 기록](../validation/2026-10-15-f01-implementation.md)에 남겼다.

최종 task-done 전체 회귀는1578개 중1577통과/실패0/기존 private 감사1skip(60.919초)이며9개 기반/build/package도 통과했다. 실행 pin 갱신은 생성된 web/runtime.js의 승인된 스케줄러 변경만 반영했다. root dist58·제품2.13.3·ZIP/CRX·기존 Chrome/P09·실패 프로필은 보존했다. push/PR은 하지 않았다.

한계: 유한 heap 관측은 누수 없음 인증이 아니다. 정밀 hidden timer/rate/old-callback·EQ/normalizer/연속 출력 계측은 T8, 종합 감사/고지/독립 최종 검토는 T9에 남는다. 실제 스토어 업데이트·플랫폼 rollback·자연 BFCache/worker suspension·보호 소스/실제 하드웨어 청감은 이 성공으로 인증하지 않는다.

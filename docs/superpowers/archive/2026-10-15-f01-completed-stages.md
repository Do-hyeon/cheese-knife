# F01 완료 단계 이력

이 문서는 완료된 단계의 근거를 보존한다. 후속 구현·공개 권한은 현재 PLANS.md와 사용자 승인으로 판단한다. F01 전체 완료나 배포 완료 기록이 아니다.

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

# F00 전체 최종 독립 검토와 보완 기록

기준일: 2026-10-14. 기존 Native 실행의 마지막 전체 검토이며 공개·병합 승인이 아니다. 사용자 승인용 문서는 한글로 작성한다.

## 검토 입력과 최초 판정

- 검토자: 새 `gpt-6-astra`, reasoning `max`, 읽기 전용. 후속 별도 검토자나 정식 모델 보안 스캔은 실행하지 않았다.
- 범위: main `45100969200dfb5e33737db60c9a3fa7450f4450` → `559880d4617d10fcab238b99c5721508a498dcc3`. 마지막 코드 입력 `189db36bac2a0c7500fd61bc57e8d66eba385f99` 이후 세 파일은 문서 변경뿐이다.
- 최초 발견: **Critical 0 / Important 3 / Minor 0**. 과거 설계·계획 검토와 합산하거나 보완 후 새 전체 0건으로 바꾸지 않는다.
- 최초 판정: **보완 필요**. 세 발견이 닫히기 전 Task6/F00 완료 처리하지 않는다.
- 검토자의 독립 집중 실행: 239개 중 199 pass / 40 fail / 13.474초. 40개는 후보 경로의 `fs.realpath` EPERM 실행 경계 오류(그 오류에 대한 기대 문자열 차이 포함)이며 기능 결함 40건도 전체 PASS도 아니다.
- 별도 stdin 재현: 5개 / 5 RED / 1.440초. R2의 세 변형은 발견 한 건으로 묶는다. 저자의 전체·실제 설치 결과와 합산하지 않는다.

## 발견과 국소 보완

| ID | 최초 등급 | 재현·영향 | 보완 및 회귀 수용기준 | 상태 |
| --- | --- | --- | --- | --- |
| R1 | Important/P2 | 같은 route의 실제 video A→B→A에서 이전 `requested/manual`이 남아 기본 ON인데 실제 OFF | 실제 video/route 폐기 때 이전 intent 삭제. 같은 video의 PZP-only 교체는 보존. A→B→A의 자동/수동 ON/OFF, 제거→재삽입, 기존 PZP 보존 검사 | 구현 보완, 최종 재검증·targeted 확인 대기 |
| R2 | Important/P2 | ACK 유실 patch7·미전송 draft5 상태에서 읽기 실패가 unknown을 unavailable로 덮고 이후 정상 조회도 고착. draft/폐기 UI 숨김. 최초 읽기만 실패한 경우도 고착 | 읽기 실패가 unresolved mutation 상태를 덮지 않음. pending 없는 오류는 검증된 정상 snapshot으로 ready/repair-required 복구. original preset 확인 유지. 무쓰기 read-back, patch 값 일치 인증 금지, 최신 draft 보존·명시 폐기/재편집 | 구현 보완, 최종 재검증·targeted 확인 대기 |
| R3 | Important/P2 | 같은 video에서 빈 source/emptied→유효 blob/loadedmetadata 후 ON 표시인데 wet gain0 | eligibility 상실은 wanted 보존 suspension. 현재 권한과 유효 source 복귀에서만 재개. 빈 source 중 수동 OFF/ON 보존, source 한 개, dry/wet·aria 표시 일치. 현재 guard/DRM·origin 제한 유지 | 구현 보완, 최종 재검증·targeted 확인 대기 |

저자 독립 회귀의 최초 RED: 110개 / 102 pass / 8 fail / 0 cancelled / 13.233초. 초기 callback 유실 변형을 추가한 media-client 집중 실행도 18개 / 15 pass / 3 fail로 재현했다. 첫 보완 후 111/111, 빈 source 중 수동 ON을 추가해 별도 RED를 확인하고 click 경로도 eligibility를 반영한 뒤 113/113을 확인했다. 최종 추가 경계와 전체 게이트는 아래 입력별 결과로 확정한다.

첫 동기화 명령은 후보 cwd를 원본으로 잘못 잡아 기존 101개만 실행했다. 이 결과는 새 RED 증거가 아니다. 명시적인 원본 절대 경로로 동기화해 위 RED를 재실행했다. 해시 조회 첫 명령의 괄호 오타도 실행 실패이며 이후 기존 정규화 함수로 재계산했다. 실패를 숨기거나 역사 fixture/수치/허용 오차를 수정하지 않았다.

## 판단과 범위 유지

- PZP-only wanted 보존, MAIN pure module bundle/ISOLATED standalone, original creation의 토큰·이름·값·revision 확인, 최신 draft held 유지는 타당하다. R1/R2의 누락 경계만 보완한다.
- helper는 정확한 own popup의 종료·독립 부재 확인과 전체15초/개별8초를 유지한다. borrowed browser/session, 새 TAB, foreign target 종료로 권한을 확대하지 않는다.
- TAB Task3 완료와 원래 Task6 전체 완료를 구분한다. 후속은 동일 검토자의 R1–R3 targeted 확인이며 새 전체 검토로 세지 않는다.
- 제품2.13.3·권한/origin·기존 Chrome/P09·root dist58·보호 자료를 유지한다. 새 의존성/프로필 권한/외부 전송/정식 모델 보안 스캔·push/PR/병합/배포 없음.

## 판단 제외와 미검증

실제 BFCache, 자연 worker suspension, in-place runtime.reload, 실제 Chrome/store 업데이트·rollback은 미관측/미실행이며 PASS가 아니다. 독립 오디오 재현은 production runtime과 기존 DOM/AudioContext fixture를 쓴 경계 검사이고 실제 하드웨어·DSP 수치 평가는 아니다. 객관적인 합성 DSP 게이트는 저자가 새 입력으로 별도 실행한다.

무취약성·정책 준수 인증을 제공하지 않는다. 기존 tool audit raw exit1/경고8을 clean 또는 security PASS로 바꾸지 않는다. 기존 private 자료 부재 skip1도 유지한다.

## 최종 입력 재검증

보완 코드의 clean SHA, 집중/전체·9기반·설치·저장 손실·오디오·픽셀·패키지·audit·보호 및 동일 검토자 targeted 판정은 완료 후 기록한다. 현재는 F00 전체 완료나 공개 준비 완료를 주장하지 않는다.

보완 checkpoint 전 격리 overlay 검증: 9개 기반 PASS, 집중116/116 PASS, 전체1402/1401 pass/0 fail/0 cancelled/기존 skip1,57.861초. 활성 F00 실행 해시만 새 생성 자산 세 개와 맞췄다. 이 결과를 아직 실행하지 않은 새 clean 후보의 실제 설치/DSP/audit 성공으로 대신하지 않는다.

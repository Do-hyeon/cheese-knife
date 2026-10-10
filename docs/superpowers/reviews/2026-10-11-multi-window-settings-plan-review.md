# 다중 창 설정 저장 구현 계획 검토

2026-10-11. 사용자가 승인한 [설계](../specs/2026-10-11-multi-window-settings-design.md)를 바탕으로 [구현 계획](../plans/2026-10-11-multi-window-settings.md)을 작성하고 Astra max가 읽기 전용으로 공격적 검토했다. 첫 검토의 Important 2개와 Minor 1개를 계획에 반영한 뒤, 같은 검토자의 재확인에서 남은 계획 차단 사항은 없었다. 판정은 계획 확인과 실행 방식 선택으로 진행 가능하다는 뜻이다.

## 첫 검토와 반영

Critical은 없었다. 첫 Important는 성공 ack가 미저장 입력 overlay를 지웠을 때 오래된 snapshot 값이 다시 표시될 수 있는 문제였다. Task 3은 확인된 표시값을 미저장 입력과 분리하고 ack revision 이상 snapshot을 받을 때까지 유지한다. no-op도 최신 조회를 요청하며 partial ack로 전체 snapshot revision을 올리지 않는다. 더 새 snapshot과 로컬 입력은 옛 ack가 되돌리지 못한다. 즉시 표시값, no-op, 최신 snapshot 뒤 옛 ack, 같은 revision의 CSS 재적용과 옛 읽기를 각각 검사한다.

두 번째 Important는 부팅 CSS 실패가 초기화 Promise를 실패시키면 config 저장과 명시적 재적용까지 막힐 수 있는 문제였다. Task 2는 migration의 read/write/remove 실패와 CSS 실패를 분리한다. CSS만 실패했으면 초기화는 완료하고 실패 상태를 표시한다. 같은 worker에서 snapshot 확인, config-only 저장, 빈 patch 재적용 성공이 가능해야 한다. legacy 변경 저장과 키 제거 사이에는 사용자 write를 허용하지 않는다.

Minor는 popup이 탭 캡처를 기다리기 전에 스타일 링크로 이동할 수 있는 문제였다. Task 4는 단일 공유 tabs.query가 끝날 때까지 이동을 막고 aria-disabled로 표시한다. 완료 후 최초 캡처한 대상 ID를 링크에 넣으며 캡처 실패는 명시적 대상 없는 화면으로 연결한다. 보류된 query 중 클릭과 완료 뒤 href를 DOM 검사로 확인한다.

## 재검토 판정과 범위

Astra max는 위 Important 2개와 Minor 1개가 모두 해결됐고 남은 계획 차단 사항은 없다고 판정했다. 필드별 최신 병합, 영구 revision, commit/event/callback을 따로 제어하는 fixture, 불명 응답의 자동 재전송 금지와 대상 탭·창 검증은 승인된 설계와 일치한다.

이 검토에서 제품 코드나 Git 상태는 변경하지 않았고 구현 테스트도 실행하지 않았다. 실제 Chrome 121·Firefox 128 동작, BFCache 수용, 설치본 설정 저장, HLS 보안 후보, PR·릴리즈 승인은 이번 판정에 포함하지 않는다. 초기 화질과 실제 두 창 재생 검증은 [별도 기록](../validation/2026-10-11-preview-startup-and-two-windows.md)에 있다.

## 실행 인계

제품 코딩과 배포본 변경은 아직 하지 않았다. 사용자에게 계획 확인과 Native/Subagent-driven 실행 방식 선택을 요청한다. Native는 동일 세션 구현 후 Astra max 독립 검토, Subagent-driven은 작업별 독립 구현·검토와 마지막 전체 변경 검토다. 두 방식 모두 테스트 우선, 정확한 파일만 커밋, 설치본 검증 및 사용자 설정 복원을 요구한다.

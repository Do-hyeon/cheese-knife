# F00 완료 단계 이력

이 문서는 F00의 완료된 설계·계획·개별 구현 단계를 보존한다. F00 전체 완료나 공개 승인이 아니며, 현재 커서와 잔여 작업은 [PLANS.md](../../../PLANS.md)에서 관리한다. 과거 승인을 다른 단계나 공개 권한으로 재사용하지 않는다.

## 설계·계획 및 실행 승인

- [x] 채널별 audio/video만, 나머지 전역으로 범위 확정.
- [x] 설계 작성·현행 소스 대조·Astra max 최초 Critical0/Important3/Minor2와5항목 targeted closure.
- [x] 사용자 written-spec 승인2026-10-14. VOD 불명 전역 fallback·Gain F01·top-frame 이외 전역·incognito 신규 저장 금지·혼재 세대 제한 포함.
- [x] 6task 상세 구현 계획과 root 자체 대조. 새 저장키/동일 broker queue·client ABI·base/scoped readiness·오디오 wanted·filter target·old/new 보존·검사/승인 경계 명시.
- [x] 새 Astra max 계획 최초 Critical0/Important6/Minor1·작성자 보완·같은 검토자7항목 targeted closure/승인 가능 판정. fresh 전체0건·구현/보안 PASS는 아님.
- [x] 사용자 written-plan/Native 실행 승인2026-10-14. 소스/생성물·로컬 커밋·격리 bundled Chromium·기존 승인 점검도구·전체 최종 검토 포함, 실제 시청 Chrome/P09/공개 제외.

근거: [승인 상세 설계](../specs/2026-10-14-f00-channel-media-settings-design.md), [설계 검토](../validation/2026-10-14-f00-design-review.md), [구현 계획](../plans/2026-10-14-f00-channel-media-settings.md), [계획 검토](../validation/2026-10-14-f00-plan-review.md).

## Tasks1–3 로컬 완료

- [x] Task1 순수 미디어 계약·classic load graph·신규 active inventory·기존 frozen 기준 보존. 로컬959fdb3. 최종 F00 수용은 아님.
- [x] Task2 동일 queue의 v2 writer·field merge·삭제/재생성 token·unknown/손실/실패 계약. 로컬5a06b58·추가 경계16/16·전체/9gate 통과.
- [x] Task3 별도 media client 상태·명시 scope/도메인·프리셋 UI·전역 UI 독립. 로컬b3376a5·집중76/76·전체1241/1240pass/0fail/기존skip1·9gate 통과. 실제 설치형 UI는 Task5에서 별도 검증.

## Task4 로컬 구현·수치 검사 완료

- [x] 실제 채널별 projection과 base/scoped readiness 분리, route/player/request 소유권·오래된 응답 거부·제한시간 fallback·읽기 취소를 구현했다. 카탈로그/프리셋 이름은 MAIN으로 전달하지 않는다.
- [x] SVG 소유권을 MAIN 단일 렌더러로 이동하고 전역/채널·메인/미리보기·네이티브 필터의 적용 경계를 검사했다. 실제 픽셀24/24, 기존 수치 기대값 그대로 유지.
- [x] 오디오 suspend/resumeWanted와 자동/수동 의도를 분리했다. 응답 없는 fallback 자동 ON 잔류 RED를 보완했고 합성 WebAudio14 정상 신호·18전환·지연 정렬·극단 설정 검사에 qualityFailures0을 확인했다.
- [x] 현재 전체1280/1279pass/0fail/0cancelled/기존 자료 부재 skip1, 9foundation gate 통과. 실제 게시본 코드의 혼재 부정 대조도 픽셀 검사에 포함한다.

세부 RED/GREEN·실패·한계는 [구현/검증 기록](../validation/2026-10-14-f00-channel-media-settings.md)에 유지한다. Task5–6과 fresh 전체 최종 Astra max는 아직 완료되지 않았다. 실제 설치형 UI·저장 전환·사용자 Chrome·스토어 수용의 PASS가 아니며 push/PR/병합/릴리즈/스토어 배포는 이 이력에 포함하지 않는다.

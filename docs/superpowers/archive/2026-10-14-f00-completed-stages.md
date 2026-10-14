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

## Task5 설정 TAB 보완 설계·목업 승인

- [x] 실제 POPUP sender 문서 식별 부재에서 인증을 완화하지 않는 별도 own TAB 설계 작성. caa2024는 설계/기록 로컬 checkpoint이며 제품 보완 완료 아님.
- [x] Astra max 최초 Critical0/Important5/Minor1·6항목 보완·같은 검토자 targeted closure. 프리셋 값 일치·파괴적 확인·복원 제한·VOD pair·read-back/dirty 전송 분리·legacy 무쓰기 범위 보완 포함.
- [x] 사용자가 요청한 시각 목업 제공 및 목업/UI·written-spec·toolbar→TAB 수용기준 변경 승인2026-10-14. 상세 계획 작성/검토로 진행한다. 별도 구현/실행 승인과 actual TAB qualification은 아직이다.

근거: [보완 설계](../specs/2026-10-14-f00-media-settings-tab-design.md), [검토/미검증 기록](../validation/2026-10-14-f00-settings-tab-design-review.md). 현황과 새 실행 승인은 PLANS.md가 소유한다.

## Task5 TAB 상세 계획 검토 완료

- [x] 승인된 목업/UI·명세를 상세 구현 계획5A(진입/대상)/5B(복구/확인)/5C(수명주기/actual qualification)로 작성하고 원래 Task5/6 잔여 게이트를 유지했다.
- [x] fresh Astra max 최초 Critical0/Important3/Minor1, 표시값/ACK 경합·observer 등록 순서·실제 native caller/session/종료 소유자·timeout 차이를 보완하고4항목 targeted closure 확인. 이전 설계0/5/1과 별개의 검토다.

근거: [상세 계획](../plans/2026-10-14-f00-media-settings-tab.md), [계획 검토](../validation/2026-10-14-f00-settings-tab-plan-review.md). 당시 상세 계획 검토는 구현/실제 검증이 아니며 실제 제품/Chrome/저장/정상 종료 검증은 이 기록에 없다.

## Task5 TAB 상세 계획·Native 실행 승인

- [x] 사용자2026-10-14 상세 계획과 기존 Native 실행 승인. Task5A–C 보완 후 원래 Task5/6 및 whole-F00 최종 Astra max까지 순차 수행한다. 사용자 개입/추가 권한이 필요한 단계에서만 중지하며 공개 승인은 포함하지 않는다.
- [x] 이후 사용자 승인 문서는 한글로 작성하라는 지시를 반영하고 승인 계획의 기술 수치·인터페이스·검증 범위는 유지한 채 한글로 옮겼다. 과거 영문 검토 입력 hash는 이력으로 보존한다.

## Task5A 설정 탭 진입·대상 고정 로컬 검증

- [x] 기존 popup을 재사용하여 툴바 v1/명시 열기와 TAB v2를 분리했다. top-frame·모드/query·정확한 대상 ID/window/origin/channel/incognito 검사를 유지하고 정상 nonCHZZK에서는 targetless 관리만 연다. 중복 클릭/다른 창 fallback/자동 열기 없음.
- [x] 기존 descriptor/입력을 한 번만 만들어 TAB의 scope→두 미디어 카드→preset 배치로 이동했다. 전역 항목은 제거하지 않는다. VOD pair의 styles 링크와 원래 VOD 단일 새로고침을 fixture에서 확인했다.
- [x] 집중51/51, 전체1304건/1303pass/0fail/0cancelled/기존skip1,54.08초;9foundation 통과. 첫 sandbox 전체 실패는 별도 보존하고 동일 후보 제한 없는 로컬 재실행만 결과로 채택했다. 생성 popup/current pin만 갱신, 역사 기준/제품2.13.3/root dist58/보호 자료 불변.

이는 JSDOM/Chrome 경계 fixture·생성/타입/전체 회귀다. 실제 TAB writer·Chrome/BFCache·저장4관측·F00 완료는 아직이며 후행 Task5B/C/원래 Task5/6을 계속한다.

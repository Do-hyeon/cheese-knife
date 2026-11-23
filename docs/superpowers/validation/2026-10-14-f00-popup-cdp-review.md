# F00 팝업 CDP 대안 계획 검토

2026-10-14 / 사용자 승인 범위: 새 F00 격리 프로필의 기존 Playwright CDP 연결만 사용. 기존 시청 Chrome/P09·새 의존성/권한·원격 포트·push/PR 변경 없음.

Astra max read-only 최초 결과: **Critical0 / Important1 / Minor2**. 프로토콜 지원 근거는 실제 팝업 성공이 아니다. [보완 계획](../plans/2026-10-14-f00-popup-cdp-qualification.md).

- Important — Playwright context.close의 성공 반환과 process0만으로 정상 종료를 증명할 수 없다. 설치된 Playwright closeOrKill은 실패 시 kill을 수행한다. 새로운 probe는 public Browser.close 응답·disconnection·정확한 owned process0을 각각 요구한다. 기존 qualification result의 normalClose=true는 이 강화 기준의 PASS로 재사용하지 않는다.
- Minor — Playwright가 관리하지 않는 other popup의 네트워크는 기존 Page routing의 관측 범위 밖이다. attach 후 target-specific 관측/차단을 추가하고, 초기 navigation 구간을 포함한 완전 egress 보호를 주장하지 않는다.
- Minor — 합성 DOM 이벤트의 저장 성공만으로 실제 UI 조작 가능성을 주장하지 않는다. visible/enabled/label/focus를 먼저 확인하고 changed/restored durable 값을 별도로 관측한다.

위 세 항목을 계획에 반영했다. 추가 요구도 nonempty context ID·입력 전 own POPUP sender·send 전 callback 등록·전체 획득/worker/detach deadline에 반영했다. 재검토 fresh0/0/0이나 실행 성공을 주장하지 않는다.

검토자가 판단하지 않은 실제 attachment/transport·F00 제품 동작·설정 보존·사용자 Chrome/P09·공개/보안 인증은 각각 후속 실제 검증 또는 범위 제외로 유지한다. 실패 시 해당 installed-popup gate에서 중지하며 mock/direct storage 성공으로 대체하지 않는다.

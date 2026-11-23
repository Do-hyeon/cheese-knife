# F00 — 구현 계획 공격적 검토·문서 정리 기록

2026-10-14 / Asia-Seoul. 범위: 승인된 [상세 설계](../specs/2026-10-14-f00-channel-media-settings-design.md)의 [구현 계획](../plans/2026-10-14-f00-channel-media-settings.md), PLANS 최신화와 완료 이력 분리. 제품 구현·실제 Chrome/P09·commit/push/PR·버전·배포 변경 없음.

## 입력과 독립성

- 사용자 written-spec 승인2026-10-14. 구현 계획/Native 실행은 별도 승인 대상.
- 소스 HEAD/main `45100969200dfb5e33737db60c9a3fa7450f4450`, 제품2.13.3.
- 독립 검토자 gpt-6-astra / max, 새 context에서 직접 읽기 전용 검토. 추가 subagent·formal security scan·Daybreak·도구 감사·build·실제 브라우저·테스트 실행 없음.
- 최초 구현 계획 SHA-256 `FF4FA908CC4CF999B94A3E4293C77B46E767CE000AB621E9E748FBBF3936DF27`; 검토 전후 동일. 같은 시간의 PLANS/아카이브 수정은 주 실행자의 별도 문서 작업이다.
- 보완 계획 SHA-256 `502421B71C2F791EC55B20E1552CB071EBBFA9AD71C91D5E2B9491E0594C975D`; 아래7항목에 한정해 같은 검토자 targeted 확인 요청. 이 설계의 과거0/3/2 및5항목 closure와 별도다.

## 최초 판정과 작성자 보완

**Critical0·Important6·Minor1 / with corrections.** 미구현 계획의 실행 연결을 검토한 것으로 F00 테스트/보안/정책 인증이 아니다. 주 실행자는 지적된 실제 fixture/writer/runner/witness 코드를 대조해 모두 수용했다.

| ID | 중요도·근거 | 실패 순서와 보완 |
| --- | --- | --- |
| P1 | Important / settings-fixture.cjs51/157, af05-closure.test.cjs11, host-permissions.test.cjs23 | 단일 WorkerFile 목록에 새 모듈을 넣으면 고정 게시4파일을 거부한다. tagged published-four/F00-five의 정확한 집합/순서, 종료 전 검증, 모든 제공 source 호출자·current inventory/permission 경계 분리 검사 명시 |
| P2 | Important / check-installed-transition.mjs176/246 | payloadFromDirectory의 공통58파일 강제는 새59파일 후보를 launch 전에 거부한다. 게시58/F0059의 별도 정확한 이름/해시 기대값·두 build 대조·child RED/누락/추가 negative 명시. 역사58 원장 불변 |
| P3 | Important / transition runner145/256 | 기존 seed/old/new/rollback과 고유 phase launchId로는 두 번째 new를 실행할 수 없다. 명시 media positive selector/명령, seed0+observation0..3의 launchOccurrence0..4, parent/child/ACK/close/result의 순서/중복/종료 검증 명시; config 모드 그대로 |
| P4 | Important / transition runner258 | 첫 new 시작에는 삭제할 channel data가 아직 없다. first-new UI 저장/rollback 보존 뒤 final-new4에서만 A audio 제거, 빈 record도 제거해 유효 schema 유지, readiness 전 raw loss 대조/재생성0/정확한 손실 판정 명시 |
| P5 | Important / fixture site.js38, installed runner94/105–113, transition-scenario.mjs142 | v1 witness만으로 새 v2 응답을 놓치고 stale test는 구 protocol 거부만으로 통과할 수 있다. 실제 fixture 파일·분리 v1/v2 witness·세대별 wait와 v2 정상 대조/stale sequence/옛 context replay 검사 명시 |
| P6 | Important / transition sourceAttestation164 | Task5 수정 후 commit 전 installed gate는 dirty-source로 실패하거나 옛 HEAD를 검사한다. 집중 GREEN 후 source/생성물/tests의 로컬 checkpoint→그 clean SHA의 물리 clone→설치 gate→증거 closeout 순서 명시. 기존 dirty-source 거부 보존 |
| P7 | Minor / popup.ts128 및 계획 UI | 손상 media가 같은 전역 media controls까지 비활성화할 수 있는 문구다. channel/preset만 차단하고 valid global revision의 brightness/compressor v1 저장 성공을 RED 사례로 명시 |

보완은 계획 문구/수용 기준뿐이며 실제 loader/runner/product 코드는 바꾸지 않았다. 새로운 저장 writer·범용 supervision framework·동기화/진단 수집 기능을 추가 승인하지 않는다.

## 판단 제외와 처리

- 실제 popup 발견/제어 및 final-new relaunch: 구현 후 승인된 disposable Chromium qualification이 필요. 실패 시 STOP, fake tabs.query/storage 성공으로 대체하지 않는다.
- 실제 DSP/pixel/race/durability: 미구현이라 실행 PASS 판단 불가. Task4–6의 객관 게이트로 유지한다.
- 실제 Chrome 업데이트/플랫폼 rollback·VOD owner·P09/스토어: 이번 권한/자료 밖. 별도 승인·관측 없이는 PASS가 아니다.
- 보안/개인정보/정책 인증: 수행하지 않았다. 기존 승인 점검도구의 향후 실행과 실제 데이터 고지 검토를 인증으로 확대하지 않는다.

## 완료 이력 분리

[PLANS.md](../../../PLANS.md)를390줄에서119줄로 줄여 현재 F00/F01·AF05 게시 후 수용·DT02 보류와 승인/STOP 조건만 남겼다(EOF 빈 문자열을 줄로 세지 않음). 완료 체크리스트191개는 [완료 아카이브](../archive/2026-10-14-foundation-maintenance-completed.md)에 근거/수치와 함께 옮겼다. HEAD:PLANS의 해당 공개 완료 체크리스트190개는 상대 링크 경로를 바꾼 것 외 모두 보존했으며, working PLANS의 추가 완료 이력1개도 보존했다. 아카이브의 unchecked task0; 실제 미실행/조건부 보류는 현재 PLANS에 남는다.

F00은 아직 진행 중이므로 설계/계획의 완료된 중간 승인 체크는 현재 체크리스트에 유지한다. DT02 조사/보류 결정은 이력이지만 native 구현은 완료가 아니다. AF05-B 준비 통합은 이력이지만 게시 후 실제 수용은 완료가 아니다. 과거 승인 문구가 새 실행 권한으로 재사용되지 않도록 명시했다. 기존 PLANS 기능 로드맵 anchor도 보존했다.

## 다음 게이트

- [x] 사용자 written-spec 승인·구현 계획 자체 대조·새 Astra max 최초 검토.
- [x] 작성자의7항목 계획 보완; 실제 소스 연결 확인.
- [x] 같은 검토자의7항목 targeted 확인: Important6·Minor1 모두 closed, 해당 지적에 미해소 보완 없음, **ready for written-plan approval**. 입력502421B71C2F791EC55B20E1552CB071EBBFA9AD71C91D5E2B9491E0594C975D/HEAD 검토 전후 동일. 최초0/6/1을 fresh 전체0건으로 바꾸지 않는다.
- [x] 문서6개 로컬 링크92개·한국어/영어 문자/UTF-8·trailing whitespace/EOF·현재 WAITING-USER/미승인 구현 체크·기존 roadmap anchor 검사, 실패0. HEAD:PLANS 공개 완료190개 보존·아카이브 완료191개/unchecked0 확인. git diff --check 통과, HEAD4510096/index 불변·tracked 변경 PLANS만/나머지5개 새 문서, 제품 source 수정 없음.
- [ ] 사용자 written-plan/Native 실행 승인. 실제 Chrome/P09/설치·권한/새 의존성/외부 전송·버전·push/PR/배포는 별도 STOP 게이트.

미검사: F00 제품 구현·전체 회귀·build/감사·실제 브라우저/스토어. 남은 위험은 계획상의 실제 popup/설치 경로가 구현 후 성립하는지와 사이트/플랫폼 변동이며, 계획 보완만으로 해결됐다고 주장하지 않는다.

승인 대기 상태/검토 링크/체크박스만 정리한 최종 계획 SHA-256 `81E82D628F70A7D1A1FA4CDD48CE0BF1E4E375A6BBBB596FDB77656286CE32A5`, 사용자 승인 상태를 반영한 spec SHA-256 `2953EF2004B165773C6CCEAC27D925240268790B9380815DE498FE85858059BF`. 위 targeted 입력502421...은 규범적 보완을 검토한 역사 입력이며 최종 메타데이터 정리를 fresh 전체 검토로 세지 않는다.

기존 read-only protection 검사 결과 protectedArtifactsUnchanged=true/originalCrxUnchanged=true, dist58·package/manifest2.13.3·원본 ZIP/CRX·private 감사 원장·보호 브랜치 불변. nativeProfileAccessed=false; 실제 프로필 조작/설치 확인은 수행하지 않았다. 이번 단계에서 commit/push/PR·버전 변경·배포 없음.

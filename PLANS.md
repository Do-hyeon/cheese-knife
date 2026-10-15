# 치즈 나이프 장기 유지보수 실행 계획

> **For agentic workers:** 현재 커서·미완료 체크리스트·승인/중지 조건만 관리한다. 완료 이력은 [복구 작업 이력](docs/superpowers/archive/2026-10-11-recovery-worklog.md), [유지보수 기반·타입 강화·AF05-B 준비 아카이브](docs/superpowers/archive/2026-10-14-foundation-maintenance-completed.md), [F00 완료 단계](docs/superpowers/archive/2026-10-14-f00-completed-stages.md), 결과는 docs/superpowers/validation/에서 확인한다. 아카이브의 과거 승인이나 개별 DONE을 새 단계 실행 권한으로 사용하지 않는다.

최신화: 2026-10-15 / Asia-Seoul. 현재 커서: **F01 T8 수명 관측 보완·3rate 사전검증 완료, 공통 Native launcher 준비/종료 진단 설계 확인 대기**. T1–T7 로컬 게이트를 마쳤으며 T8·T9는 미완료다. T7 완료 이력은 [완료 단계 아카이브](docs/superpowers/archive/2026-10-15-f01-completed-stages.md), 상세 결과는 [구현 검증 기록](docs/superpowers/validation/2026-10-15-f01-implementation.md)에 유지한다. F00 PR #44 통합/브랜치 정리 완료. F01은 로컬 보존만 하며 push/PR·버전·릴리즈·스토어·시청 Chrome/P09·root dist 변경은 없다. 릴리즈 최소 조건은 F00·F01·F02 및 통합 게이트다.

## 1. 고정 결정과 공개 경계

T8 진행: 기존14 steady·12 alignment·18 transition과 모든 수치 허용치는 동결한다. 승인된 master OFF 이득 유지·빠른 재진입 취소·단일 시각 예약의 제품 DSP는718db57 그대로다. Native 사전계측은 rate별 고정12개 전체의 이득/출력 정확성 및 실제 hold/reset 중간/unity를 요구한다. N은36개와 실제 세 구간을 모두 수집했으나96kHz 마지막 row의 호출 전 일반 tick을 reset으로 선택해 전체 실패했다. 원자료/실패는 보존하고 도구에만 호출 전후 인덱스 경계를 추가했다. 실제 구간 미성립/출력 불일치를 반복해 통과시키지 않는다. 초기 빈 패킷은 최초2채널 출력 이전임이 확인된 것만 구분하며 이후 빈 패킷·비유한 값·요청창 누락은 계속 실패다. 숨김/복귀의 실제 document.hidden 조건과100ms polling은 유지한다. 옛 G/L 부분 성공과 입력별 영상/미리보기/설치 결과를 새 후보의 전체 성공으로 전용하지 않으며 T8·T9는 미완료다.

- [x] T7 실제 숨김 player 재발견·저장/다중 창/전환 검증 마감.
- [x] T8 객관 측정 도구·엄격 타입·로컬 전체1590통과/실패0/기존1skip·새 프로필 동일 현상 재현.
- [x] **사용자 승인:** master OFF의 기존10ms dry 복귀 동안 normalizer gain을 유지하고, wet가0이 된 뒤 unity로 복귀하는 국소 전환 보완. 분석/timer/옛 callback은 즉시 정리하고 빠른 OFF/ON은 현재 계산 곡선에서 예약 취소·재연결한다. 단독 normalizer OFF/측정 오류의 기존10ms 예외는 유지한다. 기존 수치 허용치는 변경하지 않으며 구현/검증 완료 표시는 아니다.
- [x] 명세147절에 맞춰 기존 dip/연속성은 master 전환에 유지하고 개별 EQ/comp/normalizer 조작은 출력 상한을 강제한다. 이들의 추가 step 관측은 진단값으로 남기며 master 실패를 이 구분으로 숨기지 않는다.
- [x] **사용자 승인:** [Native 빠른 전환 후속 설계](docs/superpowers/specs/2026-10-15-f01-native-rapid-coverage-follow-up.md)의 사전계측 분리·상세 계획·도구 보완·Native 재검증. [실행 계획](docs/superpowers/plans/2026-10-15-f01-native-stimulus-preflight.md)에 실행 전12개 고정 자극/rate와 중지 기준을 명시한다. 기존 수치·실제 세 구간 확보·모든 측정 보존을 유지하며 통과 보장은 아니다.
- [x] 사전계측 분리 도구 RED→GREEN·집중49/49·전체1607통과/실패0/기존1skip·9개 기반/build/package. 제품 DSP·기존 fixture/pin·root dist58 불변.
- [x] 2f494f3의44.1/48/96kHz 사전계측36개·각 실제 세 구간·모든 gain/양쪽 출력 PASS. source/after5필드 일치·종료3증명·pageErrors0, N 실패와 O 원자료 모두 보존.
- [x] **사용자 승인:** O의 중단 뒤 수명 조작별 timeout·중간 증거 즉시 저장·닫힘/실패 경로의 제한된 보완. O의 exit13·최종 report 부재·긴 전환/RMS raw 미기록은 그대로 보존한다. 원인을 제품/도구로 단정하거나 옛 로그를 전체 PASS로 승격하지 않는다.
- [x] 보완 집중51/strict·전체1612통과/실패0/기존1skip·9기반/build/package. P에서 이름 있는15초 실패·120중간기록·최종 report·정상 종료를 확인했고 Q에서3rate 실제 수명/같은창 ID·전환36개/세 구간·270중간기록·source5일치·각 종료3증명 PASS. 제품 DSP·기존 수치·고정12자극/rate 불변.
- [ ] **설계 확인 필요:** Q는 긴 행렬의 새 browser 준비 mt.exe 실패, 제한한 동일입력 R도 준비 실패로 미완료. 독립 prepare/mt 복사본 진단은 성공했으나 제품을 넣지 않은 launcher 단기 진단의 두 번째 종료가 media-close-unconfirmed였다. 원인은 미확정이며 원본 실패는 보존한다. 공통 준비/종료 단계에 exit code·stderr·close ACK/disconnect/root 조회 상태를 남기는 제한된 진단과 단기 준비/종료 게이트를 먼저 보완한다. 설치·SDK/브라우저 교체·추가 긴 검사/환경 재시도는 현재 승인으로 수행하지 않는다.
- [ ] 수명 관측 보완 뒤 전체 출력/수명과 기존 객관 runner를 새 입력으로 재검증한다. T8·T9는 계속 미완료다.
- [ ] T8 마감 뒤 T9 전체 회귀·도구 점검·fresh Astra max 최종 전체 검토. 공개 작업 금지는 유지.

- 채널별 저장은 **오디오·영상 필터만**, 나머지는 전역. 계정별 분리/계정·쿠키 수집은 하지 않는다.
- F00은 기존 compressor6필드·video5필드와 저장/프리셋 기반, Gain/EQ/노멀라이저는 F01. F00만으로 전체 오디오 채널 저장 완료를 주장하지 않는다.
- 현재 제품2.13.3, 세 자리 major.minor.patch 유지. 격리 시험 T=2.13.4/R=2.13.5는 공개 번호가 아니다. 차기 공개 번호는 배포 준비에서 별도 승인한다.
- 복구판은 Chrome만 지원. Firefox 복구·빌드·배포 없음.
- **차기 릴리즈 최소 조건은 F00·F01·F02 구현/객관 검증과 최종 통합 게이트**다. AF05-B나 F00 병합만으로 새 버전을 공개하지 않는다.
- AF05-B 게시 후 실제 수용은 후행 게이트로 유지하되 F00/F01 설계·구현·PR을 동결하지 않는다. AF05-B에 F00/F01 의존성을 추가하지 않는다.
- 각 F00/F01 전체 기능을 별도 한글 PR로 묶는다. Task별·문서 전용 PR은 만들지 않는다. **명시 지시 전 push/PR 금지**, 병합·버전·릴리즈·스토어 제출/게시도 별도 승인.
- 기존 strict TypeScript 원본과 생성 JavaScript 계약 유지. React/Vue·새 프레임워크·전체 도구 TS 변환을 목표로 추가하지 않는다.
- 권한/origin·데이터 저장·외부 전송·원격 코드·지원 범위 확대는 별도 설계·정책 검토·승인 대상. F00의 승인된 로컬 저장 범위 밖으로 자동 확장하지 않는다.
- 한국어 또는 영어만 작성하며 **사용자 승인용 문서는 한글로 작성**한다. 코드·API·명령 식별자는 원문을 유지할 수 있다. 실제 계정·쿠키·채팅·결제·후원·연령 제한 콘텐츠는 공개 CI fixture/artifact에 넣지 않는다.
- 기존 HLS·오디오·패키지·점검도구 게이트를 새 설치형 E2E나 타입 검사로 대체하지 않는다.

## 2. 현재 기준과 보존할 제한

제품/스토어 기준2.13.3은 [P09 게시·설치 확인 기록](docs/superpowers/validation/2026-10-12-p09-store-publication.md)에 고정한다. 코드 기준 main ae9f8e5(PR #44 F00 통합); [AF05-B 종합 마감](docs/superpowers/validation/2026-10-14-af05b-prepublication-closure.md)과 아카이브가 과거 CI·검증 수치를 소유한다. 이 문서 갱신을 새로운 게시/설치 확인으로 세지 않는다.

- 기존 시청 Chrome은 root dist의 로컬 시험판, P09는 격리 스토어2.13.3 baseline. 기존 설정·dist58파일·원본 ZIP/CRX·private 감사 원장·보호 브랜치를 보존한다.
- 구 스토어2.13.2→2.13.3 업데이트/설정 보존은 **미검증 이력 수용**이지 PASS가 아니다. 실제 플랫폼 롤백도 미실행이며 격리 old→new→old와 구분한다.
- native preflight는 당시 baseline·저장·cold 관측의 성공이다. 자연 worker suspension·F00 신규 실행·실제 스토어 업데이트의 성공으로 전용하지 않는다.
- 기존 경고8·private 자료 부재 skip1과 그 처리는 [준비 범위 종합 기록](docs/superpowers/validation/2026-10-14-af05b-prepublication-closure.md)에 유지. 새 후보는 자기 입력/결과로 다시 평가하고 역사 원장을 덮어 PASS를 만들지 않는다.
- Playwright 합성 persisted 수명주기 검사와 실제 BFCache 복원은 별개다. 실제 back/forward는 비결정적 smoke로만 기록한다.
- root dist/사용자 프로필은 테스트 출력·build·cleanup 대상으로 쓰지 않는다. 새 시험판 교체/복원·실제 Chrome/설치·P09 조작은 별도 승인한다.

## 3. 실행 규칙

상태: PLAN-REVIEW(계획 검토), WAITING-USER(승인/개입 필요), READY(현재 단계 실행 승인), DOING(실행 중), WAITING-DEPENDENCY(후행 조건), BACKLOG-BLOCKED(미승인 후속), DEFERRED(조건부 보류), DONE(해당 범위 완료). 완료 단계의 상세는 아카이브로 옮기고 잔여 제한은 현재 문서에 남긴다.

1. 설계 승인→구현 계획/실행 승인→RED/GREEN→집중/전체 검증→최종 독립 검토 순서. 구현 승인과 공개 승인을 혼동하지 않는다.
2. 사용자 개입이 필요 없는 **현재 승인 범위**는 계속 진행한다. 추가 권한·데이터·의존성·실제 프로필 변경이 필요하면 중지하고 요청한다.
3. private output/**·프로필·trace·screenshot·root dist·실제 세션 자료는 커밋하지 않는다. 검사/빌드는 별도 물리 후보에서만 실행한다.
4. jsdom/소스 주입·실제 설치 산출물·native/site 관측을 별도 증거로 기록한다. 실패·빈 대상·미지원·미실행은 PASS가 아니다.
5. push/PR/병합/정리는 해당 작업의 명시 지시만 사용한다. 브랜치 정리 전 main 포함·열린 PR·worktree·URL 의존성을 확인하고 미병합 고유 커밋·원본 저장소 브랜치는 자동 삭제하지 않는다.
6. 문서만 수정했으면 링크·상태·언어·whitespace·보호 불변을 검사한다. 과거 전체 회귀를 반복하거나 그 결과를 F00 합격으로 재사용하지 않는다.

## 4. 순서와 현재 커서

| ID | 작업 묶음 | 상태 | 다음 게이트 |
| --- | --- | --- | --- |
| F00 | 채널별 미디어 저장·프리셋 | DONE (통합) | PR #44 공개 CI 통과·병합·해당 브랜치 정리 완료; 릴리즈 없음 |
| F01 | Gain 연결·EQ·노멀라이저·오디오 프리셋 | DOING (T8) | T7 마감 → T8 객관 계측 → T9 Astra max 전체 검토; push/PR 금지 |
| AF05-B 실제 수용 / AF05 종료 | 차기 게시본 설치·업데이트 | WAITING-DEPENDENCY | 차기 게시와 실제 검사 별도 승인 후 수행; F00/F01과 독립 |
| DT02 | 선택 파일의 native TS 실행 | DEFERRED | 실제 유지보수 이득과 검사/실행 경계 보존이 증명되면 재설계 |
| F02–F05 | 후속 기능 | BACKLOG-BLOCKED | F00/F01 검증과 각 범위 승인 |

완료된 P/INC/AF 준비/DT 유지보수는 [완료 아카이브](docs/superpowers/archive/2026-10-14-foundation-maintenance-completed.md)로 이동했다. PR #42/#43 통합·해당 브랜치 정리는 완료됐지만 AF05 게시 후 실제 수용은 완료가 아니다.

## 5. F00 — 통합 완료

문서: [승인 상세 설계](docs/superpowers/specs/2026-10-14-f00-channel-media-settings-design.md) · [설계 검토/보완](docs/superpowers/validation/2026-10-14-f00-design-review.md) · [구현 계획](docs/superpowers/plans/2026-10-14-f00-channel-media-settings.md) · [계획 검토/7항목 closure](docs/superpowers/validation/2026-10-14-f00-plan-review.md).

완료된 설계·계획 승인·Tasks1–6/TAB5A–C·전체 검토/보완 및 로컬 마감은 [F00 완료 단계 아카이브](docs/superpowers/archive/2026-10-14-f00-completed-stages.md)와 [최종 검토 기록](docs/superpowers/validation/2026-10-14-f00-final-review.md)으로 이동했다. 2026-10-14 사용자 지시로 F00 전체 PR·병합·해당 브랜치 정리만 추가 승인됐다. F01 공개·버전·릴리즈·스토어·실제 시청 Chrome/P09 변경은 포함하지 않는다.

- [x] F00 전체 범위 push·한글 PR·공개 CI 확인·병합·해당 브랜치 정리 승인.
- [x] [F00 전체 PR #44](https://github.com/Do-hyeon/cheese-knife/pull/44) 공개 CI3작업 통과·main ae9f8e5 병합·해당 로컬/원격 브랜치 정리. F01 7개 파일은 보존본과 Git blob 일치 확인 후 별도 로컬 브랜치에 복원했고 PR에서 제외했다.
- [x] 현재 F00 입력의 격리 전체검사·9기반·빌드/패키지·실제 도구 감사 재실행. [PR 사전검증](docs/superpowers/validation/2026-10-14-f00-pr-preflight.md)에 결과·기존8경고와 root private 원장 불일치 제한을 기록했다.

실제 popup의 Playwright Page capture는 실패했고, 승인된 [격리 CDP 대안](docs/superpowers/plans/2026-10-14-f00-popup-cdp-qualification.md)의 attachment는 성공했다. production client sender의 documentId/frameId 부재 실패는 [관측 기록](docs/superpowers/validation/2026-10-14-f00-popup-cdp-qualification.md)에 유지한다. [별도 TAB 설계](docs/superpowers/specs/2026-10-14-f00-media-settings-tab-design.md)·목업/UI·수용기준·상세 계획과 기존 Native 실행은 승인됐다. 문서 식별자를 위조하거나 직접 storage 저장으로 성공을 대체하지 않는다.

## 6. AF05-B — 게시 후 남은 실제 수용

기준: [수용 설계](docs/superpowers/specs/2026-10-12-af05b-release-acceptance-design.md), [native 최종 기록](docs/superpowers/validation/2026-10-13-af05b-native-preflight.md).

- [ ] 차기 게시본의 실제 신규 설치·기존2.13.3 업데이트·설정 보존·열린 페이지·확장 오류 확인. 게시와 실제 검사 승인이 선행한다.
- [ ] 결과/실패/미실행을 위 과거 업데이트 미검증·플랫폼 롤백 미실행 수용과 대조한다. 준비 PR 병합만으로 실제 업데이트 DONE 처리하지 않는다.
- [ ] AF05-B 최종 수용 및 AF05 종료 판단. 기능 PR·버전 배포 승인과 구분한다.

## 7. DT02 — 조건부 보류

[전체 유지보수 기록](docs/superpowers/validation/2026-10-13-dt-maintenance-whole-area.md)의 승인된 조사/보류는 완료됐지만 native TS 이전 구현은 하지 않았다. 현재 JSDoc/checkJs 유지; 단순 확장자 변경으로 실제 helper graph와 오용 검출을 잃는 경로는 사용하지 않는다.

- [ ] 실제 주석 중복/가독성 문제와 선택 파일 이전의 이득 확인.
- [ ] import 실제 검사·test discovery·lint/parser·snapshot/provenance·strict/runtime 보존을 함께 설계/검토하고 별도 승인. 재개 조건 전에는 작업하지 않는다.

## 8. 기능 로드맵 — 차기 릴리즈는 최소 F00·F01·F02까지

| ID | 기능 단위 | 재개 조건 |
| --- | --- | --- |
| F00 | 전역·프리셋·채널 저장 계약 | 위 승인 범위의 순차 구현/검증 |
| F01 | Gain·EQ·노멀라이저·오디오 프리셋 | F00 연결·객관 오디오 기준·별도 승인 |
| F02 | 영상 필터·프리셋 보강 | F01 뒤 GPU·성능 경계 포함 |
| F03 | 가려진 채팅 보강 | 제공 원문·삭제 종류·행 재사용 계약 |
| F04 | 2–4채널 멀티뷰 | 독립 재생·음량·화질·채팅·부분 교체 |
| F05 | 통나무파워 조회 | 데이터 최소화·계정 분리·새 권한 별도 승인 |

설계·검토·UI 반복 보완 완료 이력은 [F01 설계·목업 아카이브](docs/superpowers/archive/2026-10-14-f01-design-and-mockup-history.md)에 보존한다.

- [x] 2026-10-14 최신 F01 목업 사용자 승인. 기능/저장 계약 승인은 유지하며 제품 구현·실제 렌더링/음성 출력 인증으로 전용하지 않는다.
- [x] 최신 UI의 preset 생성 진입/적용 확정 snapshot·scope 변경 처리 및 Gain trusted 더블클릭 의도를 상세 계획/Astra max 검토에 포함. 과거 검토/목업 성공으로 native 권한 검증을 대체하지 않는다.
- [x] F01 한글 상세9Task 계획·fresh Astra max 최초0/3/0·필수 보완·동일 reviewer targeted0/0/0. [검토 기록](docs/superpowers/validation/2026-10-14-f01-plan-review.md)과 실제 미실행을 구분한다.
- [x] 2026-10-15 사용자 상세 계획·권장 Native/자기 물리 후보·번들 Chromium 격리 실행 묶음 승인. F00 공개 승인과 구분하며 F01 push/PR은 하지 않는다.
- [ ] F01 구현·객관 출력 상한/전환/수명주기/저장·F00 통합 검증. 주관적 청취만으로 완료하지 않는다.
- [ ] F01/F02 기능 전체의 별도 공개 지시·한글 PR·공개 CI·병합 확인. F00 PR #44 통합은 완료했고 Task/문서 PR로 더 쪼개지 않는다.
- [ ] 최종 통합 commit의 전체 회귀·점검도구·패키지·설치/저장 전환·native baseline/제한 대조.
- [ ] 최신 후보의 private P02 감사 보고서/원장 소스 해시 재대조. 이번 목업 보완 중 기존 단위 테스트는1402/1403 PASS이며background.js의HEAD와 같은 현재 해시가 과거 감사 보고서와 달라1건 FAIL이다. 실제 감사 재실행 없이 기록 해시만 수정하지 않는다. 세부 원인/환경 제한은 [목업 구성 점검](docs/superpowers/validation/2026-10-14-f01-mockup-layout-review.md)에 유지한다.
- [ ] F02 상세 설계·검토·계획/실행 승인 및 구현·객관 검증.
- [ ] 최소 F00/F01/F02 및 통합 게이트 후 세 자리 형식의 공개 번호·릴리즈·제출/게시 각각 별도 승인.
- [ ] 게시 후 실제 수용은6절에서 관리. 이 후행 게이트를 준비 PR의 선행 조건으로 바꾸지 않는다.

### F01 구현 체크리스트 — 승인된 순차 실행

세부 파일/ABI·RED/GREEN·실패 대조·명령은 [상세 계획](docs/superpowers/plans/2026-10-14-f01-audio-processing.md)이 소유한다. 아래 순서는 병렬 구현이나 개별 PR 승인으로 바꾸지 않는다.

- [x] T1 schema2·읽기 무쓰기·명시 전환/전역 alias·Gain 상속 계약. 격리 집중99/99·전체1411통과/실패0/기존 private 증거1skip·9개 기반/build/package 통과. 기존 F00 pin 보존·새 F01 pin 분리.
- [x] T2 protocol3·기존 broker 한 queue·native probe/legacy import·Gain actor/epoch/receipt. 집중61/61·전체1433통과/실패0/기존private증거1skip·9개 기반/build/package 통과. 후보dist60/runtime18. native 문서/입력의 실제 성공은 T3에서 별도 확인한다.
- [x] T3 최소 production protocol3/공통 수동 master·실제 Blob/volume fixture·제한된 ISOLATED Gain UI. 전체1458통과/실패0/기존private증거1skip·9개 기반/build/package, dist61/runtime19. 포커스 보완 checkpoint6d5b39b의 실제 qualification68.761초/별도 negative6.635초 PASS·page error0·전후 소스 일치/종료 증명3개true. 자연 worker 교체는 미관측이고 TTL61초 첫 조작과 구분한다.
- [x] T4 source1·전체/하위 상태·고정8EQ·headroom·기존 delay/limiter/ramp 보호. 집중141/141·전체1465통과/실패0/기존private증거1skip·9개 기반/build/package PASS. 실제 EQ 응답/출력은 T8에 남는다.
- [x] T5 순수 RMS 제어·좌우 meter·실제 dB automation·window/hold/error·수명 정리. 집중22/22·전체1482통과/실패0/기존private증거1skip·9개 기반/build/package PASS. Native 속도/출력은 T8에 남는다.
- [x] T6 승인 TAB UI·확정 preset snapshot/confirm·legacy/upgrade·공통 수동 master 연결·최종dist62/runtime20. 실제 후행 검증은 아래 단계로 분리한다.
- [x] T7 실제 설치·다중 창·숨김 재연결·ABA·스타일 병합·대상 종료·설정4손실·Gain full·cold19/39. 090452a의 source/after 일치·성공 실행의 종료3증명/cleanup0; 최종 전체1577통과/실패0/기존1skip. 상세 완료/실패 이력은 [아카이브](docs/superpowers/archive/2026-10-15-f01-completed-stages.md)에 분리했다. 정밀 timer/출력·누수 판정은 T8에 남는다.
- [ ] T8 clean checkpoint·기존14/12/18/stress와 새 EQ/normalizer/전환/수명 객관 출력 검증.
- [ ] T9 종합 타입/생성·전체/패키지/도구·보호/고지·whole-F01 Astra max 최종 검토/보완·로컬 마감. 완료 후에만 별도 공개 지시를 요청한다.

## 9. 검증 진입점

제품 검사 명령은 후보 폴더에서만 실행한다. 기존9foundation/전체 검사 목록과 새 F00 positive/negative 경로는 [F00 구현 계획의 Commands](docs/superpowers/plans/2026-10-14-f00-channel-media-settings.md#commands-execution-selection-and-approval-bundle)에 있다. Node24.19.0/TypeScript7.0.2/esbuild0.28.2/Playwright1.62.1의 현재 계약을 재사용하며 npm이 PATH에 없으면 기존 검증된 bundled CLI를 사용한다.

문서-only 변경은 로컬 링크·UTF-8/언어·체크리스트 상태·git diff --check와 보존 자료를 점검한다. 미래 파일의 존재나 계획에 적힌 명령을 실제 실행 PASS로 표시하지 않는다.

## 10. 현재 사용자 개입 지점

T3 원인 조사/보완/새 checkpoint 재검증은 추가 승인됐다. 별도 개입이 필요하지 않으면 같은 권한·수치 계약 안에서 계속한다. 실패한 checkpoint와 private 증거는 삭제하거나 성공으로 재해석하지 않는다. 새 자격 검사 성공 전에 T4–T9로 넘어가지 않는다. 사용자 Chrome/P09·새 권한/의존성/외부 전송 확대·버전·릴리즈·스토어·push/PR은 제외한다. whole-F01 Astra max 최종 검토는 전체 구현·검증 뒤다. 목업/문서·정적 성공을 실제 음질·저장·Chrome 성공으로 전용하지 않으며 file URL 보안 차단을 우회하지 않는다.

실제 설치/새로고침·P09 변경·새 의존성/권한/외부 전송·버전·공개는 별도 STOP 게이트다. 이전 MCP 연결/종료 승인이나 다른 작업의 공개 승인을 재사용하지 않는다.

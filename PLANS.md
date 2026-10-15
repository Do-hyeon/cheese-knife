# 치즈 나이프 장기 유지보수 실행 계획

> **For agentic workers:** 현재 커서·미완료 체크리스트·승인/중지 조건만 관리한다. 완료 이력은 [복구 작업 이력](docs/superpowers/archive/2026-10-11-recovery-worklog.md), [유지보수 기반·타입 강화·AF05-B 준비 아카이브](docs/superpowers/archive/2026-10-14-foundation-maintenance-completed.md), [F00 완료 단계](docs/superpowers/archive/2026-10-14-f00-completed-stages.md), 결과는 docs/superpowers/validation/에서 확인한다. 아카이브의 과거 승인이나 개별 DONE을 새 단계 실행 권한으로 사용하지 않는다.

최신화: 2026-10-16 / Asia-Seoul. 현재 커서: **추가 관측 분리 계획 Task3 Astra max 구현 검토 중**. 사용자 [상세 계획](docs/superpowers/plans/2026-10-16-f01-observer-isolation.md)의 Native 실행·독립 검토·새 격리 검증·기존PR45 조사push1회/Linux총15오디오 묶음 승인을 받았다. Task1/2와 Task3 보존 전파·복합 실패 거부를 구현했고, 최신 격리 전체1709통과/0실패/기존제외1·집중165/165·9기반·build62/check22가 통과했다. 실제 도구 감사는 입력 전후 일치·의존성/비밀정보 검출0, 정적 경고62(기존55목록 동일+신규파일 경로7)·raw exit1이다. 독립 검토 후 새 Native·추가push/CI는 아직 미실행이다. 기존 [CI 실패/인과 미확정](docs/superpowers/validation/2026-10-16-f01-ci-remediation-progress.md)은 유지하고 DSP는 변경하지 않는다. **조사 승인이지 최종push·병합·릴리즈 승인은 아니다.** 버전2.13.3·root dist·시청Chrome/P09·스토어·기존증거는 보존한다.

## 1. 고정 결정과 공개 경계

완료한 구현·수치·source별 검증·실패 이력은 아카이브/검증 기록이 소유한다. DSP는718db57, 객관 오디오 Native는f0fb3a5, cold는1fe0dcf, Gain은021a15b, Minor 후속 설정UI는4b89ec3의 각 입력으로 구분한다. Windows 준비·종료의 과거 간헐 원인 미확정·정적 경고55/rawexit1·기존private1skip을 숨기거나 전체 인증으로 쓰지 않는다.

- [x] T1–T8와 T9 사전 마감·Astra max 최종/targeted·필수 보완·설치형 재검증. [완료 근거](docs/superpowers/archive/2026-10-15-f01-completed-stages.md).
- [x] T9 최종 task-done 전체1625중1624통과/실패0/기존private1skip, 로컬 마감 확인. push/PR·배포 금지 유지.
- [x] Minor 보완: VOD/채널 미확인 시 legacy 읽기·가져오기 비활성화와 한글/영문 설명·aria 연결. VOD legacy 자동 가져오기는 지원하지 않고 직접 Gain 전역 저장은 유지하며 native sender 계약을 넓히지 않는다.
- [x] Minor 보완: save-as 이름 focus·첫 빈 관리의 신선한 확정값 캡처/펼침·이름/수동 접힘 보존. 지연 toggle과 재조회 중 진입의 RED→GREEN·최종전체1631통과/0실패/기존skip1·설치 정상/정확한4손실 확인.

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
| F01 | Gain 연결·EQ·노멀라이저·오디오 프리셋 | DOING (추가 조사 계획 Task3 검토) | Task1/2 완료·Task3 로컬 종합 검증 통과/Astra max 검토 중. 다음 새 Native; 조사push1회만 조건부 허용. 기존 인과STOP 유지 |
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
| F00 | 전역·프리셋·채널 저장 계약 | 통합 완료, 배포는 후행 게이트 |
| F01 | Gain·EQ·노멀라이저·오디오 프리셋 | Minor2까지 로컬 마감, 전체 PR·공개/통합 준비는 잔여 |
| F02 | 영상 필터·프리셋 보강 | F01 뒤 GPU·성능 경계 포함 |
| F03 | 가려진 채팅 보강 | 제공 원문·삭제 종류·행 재사용 계약 |
| F04 | 2–4채널 멀티뷰 | 독립 재생·음량·화질·채팅·부분 교체 |
| F05 | 통나무파워 조회 | 데이터 최소화·계정 분리·새 권한 별도 승인 |

설계·검토·UI 반복 보완 완료 이력은 [F01 설계·목업 아카이브](docs/superpowers/archive/2026-10-14-f01-design-and-mockup-history.md)에 보존한다.

- [x] 2026-10-14 최신 F01 목업 사용자 승인. 기능/저장 계약 승인은 유지하며 제품 구현·실제 렌더링/음성 출력 인증으로 전용하지 않는다.
- [x] 최신 UI의 preset 생성 진입/적용 확정 snapshot·scope 변경 처리 및 Gain trusted 더블클릭 의도를 상세 계획/Astra max 검토에 포함. 과거 검토/목업 성공으로 native 권한 검증을 대체하지 않는다.
- [x] F01 한글 상세9Task 계획·fresh Astra max 최초0/3/0·필수 보완·동일 reviewer targeted0/0/0. [검토 기록](docs/superpowers/validation/2026-10-14-f01-plan-review.md)과 실제 미실행을 구분한다.
- [x] 2026-10-15 사용자 상세 계획·권장 Native/자기 물리 후보·번들 Chromium 격리 실행 묶음 승인. F00 공개 승인과 구분하며 F01 push/PR은 하지 않는다.
- [x] F01 T1–T9와 Minor 후속 구현·객관 출력 상한/전환/수명주기/저장·로컬 F00 연결 검증과 최종 검토 마감. 실제 플랫폼/통합 후행 범위는 별도이며 주관적 청취만의 완료가 아니다.
- [x] 2026-10-15 F01 전체 범위 push·한글 PR 하나·공개 CI 확인 승인. 병합·릴리즈·스토어 배포는 하지 않는다.
- [x] F01 T1–T9·Minor2까지 포함한 전체 [한글 PR #45](https://github.com/Do-hyeon/cheese-knife/pull/45) 생성. F02 구현 완료를 F01 PR의 의존성으로 묶지 않는다.
- [x] PR #45 공개 CI 확인: 두 OS 기반·전체 테스트·빌드·패키지는 통과, 고정 F00 입력 누락과 Linux 실행기 오선택을 재현·보완했다. 세 번째 실행에서 실제250Hz ON step 게이트가 실패했다. [현재 근거](docs/superpowers/validation/2026-10-15-f01-pr-preflight.md).
- [x] 사용자 공개 CI 후속 원인 조사·보완 설계·Astra max 검토·재검증 방향 승인. 구현되지 않은 상세안이나 새 권한/프로필 변경까지 승인된 것으로 확대하지 않는다.
- [x] 기존 source의 clock 진행 모델·실제 base readiness/fixture를 일회성 probe로 조사하고 한글 [보완 설계](docs/superpowers/specs/2026-10-15-f01-public-ci-follow-up-design.md)를 작성. Linux 실제 PCM 인과는 아직 미확정이다.
- [x] 보완 설계 Astra max 최초0/3/1·계측 비간섭/fixture신선도/비DSP분기cold게이트·inventory사실정정 반영, 동일 reviewer 문서재검토 잔여0/0/0. published1/F00의2/현재F01의3·현재payload62·기존 전체 runtime oracle을 보존한다.
- [x] 사용자 F01 상세계획→보완·재검증→병합·해당브랜치정리→F02 순서 승인. 작성 설계의 후속 [상세 구현 계획](docs/superpowers/plans/2026-10-16-f01-public-ci-follow-up.md)에 Linux환경·계측선택·사전6run/산출물·Native직접실행·보호범위를 구체화하고 자체검토했다. 기존 설계 hash/검토 판정은 그대로 보존한다.
- [x] 작성 계획의 실행 묶음 승인: 검증 전용TRACE환경·기존PR45 중간Linux계측push/최종push·새격리사본/프로필검증. 새 제품옵션/의존성/권한/시청프로필 변경은 제외한다.
- [x] Task1 E2E protocol/신선도/전체inventory·독립runtime oracle 연결 복구 및 집중RED/GREEN. 격리 전체1648중1647통과·실패0·기존private1제외, 9foundation·후보build62/진입자산22 통과. 새source 실제설치/cold는Task4의필수후행게이트다.
- [x] Task2 비계측/계측PCM·native-first진단·원본수치/오류보존·사전6run Linux조사. 중간head65ad9b6/CI38766311444의12파일 독립재평가 complete=true·실패0. CI전체성공이나 과거오디오원인확정을 뜻하지 않는다.
- [ ] Task3 Linux인과판정 뒤 조건부국소DSP·예약회귀·생성/pin. 미확정이면 임의수정하지 않고STOP한다.
- [x] Task3 인과판정: Linux6회 모두미재현·계측18pair clock차이0으로 원인미확정 STOP. DSP/생성/pin 무수정. [실측 판정과 전환 실패](docs/superpowers/validation/2026-10-16-f01-ci-remediation-progress.md)를 보존했다.
- [x] 사용자 추가 원인 조사 **설계 작성** 승인. [한글 추가 설계](docs/superpowers/specs/2026-10-16-f01-observer-isolation-design.md)에 F/U/T 동일제품·위치균형9집합·transport/수치판정 분리·retention 충돌 보완·추가CI비용/공개경계를 작성·자체 검토. 실제 실행/독립검토 완료는 아님.
- [x] 추가 작성 설계 사용자 승인. [상세 계획](docs/superpowers/plans/2026-10-16-f01-observer-isolation.md)의 실제 입력/API·5Task·RED/GREEN·원본F/9집합·전환/보존·새 Native/추가CI 실행 묶음을 작성·자체 검토했다. 실행 승인은 아님.
- [x] 추가 상세 계획 Astra max 최초0Critical/3Important/0Minor·일반전환/verifyCandidate 보존과 음성secondary 수용 보완·첫targeted0/1/1·cold 호출/전달검사/요약 보완·최종targeted잔여0/0/0. [문서 검토 결과](docs/superpowers/validation/2026-10-16-f01-observer-plan-review.md)이며 실제 구현/Native 성공은 아니다. 원본F의raw부재·현재U의추가clock관측·전환예외 미확정은 유지한다.
- [x] 사용자 추가 계획/Native 실행 묶음 승인. 새 도구·보존/실패 보완·격리Windows9회·전환/cold/손실·Astra max 구현 검토 뒤 기존PR45 조사push1회/Linux9회(+기존6회)까지다. 최종push·병합·배포는 제외한다.
- [x] 추가 계획 Task1/2 구현·RED→GREEN·집중57/57·strict·최신 격리 전체1675통과/실패0/기존제외1. 새 F/U/T host와 원본 F/제품/기존6gate는 분리하며 정적 신규 파일 I/O7경고는 기존55와 별도 대조한다.
- [ ] 추가 계획 Task3 보존 전파/복합 오류·전체/9기반/build/check/실제 도구 감사·Astra max 구현 검토. 최초0Critical/3Important/1Minor(보존 표시를 author Important 재등급) 보완 후 최신 전체1725통과/실패0/기존제외1·9기반·build62/check22 통과. [구현 검증 기록](docs/superpowers/validation/2026-10-16-f01-observer-implementation-validation.md); 보완 후 실제 도구 재검사/동일 reviewer targeted 확인은 잔여다.
- [ ] 추가 계획 Task4 새 격리 Native/Windows9회·설치/전환/cold·정확한손실/보존·종료. 자료 불완전이면 조사push도 하지 않는다.
- [ ] 추가 계획 Task5 기존PR45 조사push1회·정확한head 공개CI/원자료 재평가·근거targeted 검토·원인/한계 기록 후STOP. 결과를 최종 수용으로 확대하지 않는다.
- [ ] Task4 새source 전체/점검도구·설치/전환/정확한손실/F01cold·조건부DSP전량Native·Astra max최종검토·최종CI. 기존허용치와실패기록유지.
- [ ] 모든게이트충족한PR45 정확한head병합·F01브랜치만정리. 릴리즈/스토어/버전변경없음. 그뒤F02설계를시작한다.
- [ ] F02도 기능 전체 단위로 별도 공개 지시·한글 PR·공개 CI·병합을 확인한다. F00 PR #44 통합은 완료했고 Task/문서 PR로 더 쪼개지 않는다.
- [ ] 최종 통합 commit의 전체 회귀·점검도구·패키지·설치/저장 전환·native baseline/제한 대조.
- [ ] 최종 통합 후보에서 실제 도구 감사를 다시 실행하고 원본 경고·원장/입력 해시·기존 private 자료 부재 skip1과 대조한다. 과거 목업 단계의1402/1403·감사 해시 불일치는 [당시 기록](docs/superpowers/validation/2026-10-14-f01-mockup-layout-review.md)에 보존하며 현재 회귀 실패로 표시하지 않는다. 원장 해시만 바꿔 PASS를 만들지 않는다.
- [ ] F02 상세 설계·검토·계획/실행 승인 및 구현·객관 검증.
- [ ] 최소 F00/F01/F02 및 통합 게이트 후 세 자리 형식의 공개 번호·릴리즈·제출/게시 각각 별도 승인.
- [ ] 게시 후 실제 수용은6절에서 관리. 이 후행 게이트를 준비 PR의 선행 조건으로 바꾸지 않는다.

### F01 구현 체크리스트 — 승인된 순차 실행

세부 파일/ABI·RED/GREEN·실패 대조·명령은 [상세 계획](docs/superpowers/plans/2026-10-14-f01-audio-processing.md)이 소유한다. 아래 순서는 병렬 구현이나 개별 PR 승인으로 바꾸지 않는다.

- [x] T1–T8 구현·저장/전환·실제 설치·객관 출력 검증 마감. 단계별 수치와 실패/한계는 [완료 단계 아카이브](docs/superpowers/archive/2026-10-15-f01-completed-stages.md)에 보존한다.
- [x] T9 종합 타입/생성·전체/패키지/도구·보호/고지·whole-F01 Astra max 최종 검토/보완·로컬 마감. 당시 보류 Minor2는 별도 후속으로 보완했고 원 검토/실패·검증 한계는 아카이브에 유지한다. 공개 지시는 별도다.

## 9. 검증 진입점

제품 검사 명령은 후보 폴더에서만 실행한다. 기존9foundation/전체 검사 목록과 새 F00 positive/negative 경로는 [F00 구현 계획의 Commands](docs/superpowers/plans/2026-10-14-f00-channel-media-settings.md#commands-execution-selection-and-approval-bundle)에 있다. Node24.19.0/TypeScript7.0.2/esbuild0.28.2/Playwright1.62.1의 현재 계약을 재사용하며 npm이 PATH에 없으면 기존 검증된 bundled CLI를 사용한다.

문서-only 변경은 로컬 링크·UTF-8/언어·체크리스트 상태·git diff --check와 보존 자료를 점검한다. 미래 파일의 존재나 계획에 적힌 명령을 실제 실행 PASS로 표시하지 않는다.

## 10. 현재 사용자 개입 지점

F01 전체 품질/인과 게이트는 미충족이다. 추가 [상세 계획](docs/superpowers/plans/2026-10-16-f01-observer-isolation.md)의 실행 묶음은 승인됐으므로 중간 재승인을 반복하지 않고 순차 진행한다. **새 권한/다운로드·사용자 프로필 변경·설명 안 되는 입력 변화·종료 미확인·새 checkpoint가 필요한 경우만 STOP**한다. Task5 조사 결과 후에는 원인 미확정을 자동 수용하거나 최종push/병합으로 넘어가지 않는다. 기존 허용치·실패증거·시청Chrome/P09를 보존하며 새 PR·버전·릴리즈·스토어 배포는 하지 않는다. F02는 F01 통합 뒤 설계부터다.

실제 설치/새로고침·P09 변경·새 의존성/권한/외부 전송·버전·공개는 별도 STOP 게이트다. 이전 MCP 연결/종료 승인이나 다른 작업의 공개 승인을 재사용하지 않는다.

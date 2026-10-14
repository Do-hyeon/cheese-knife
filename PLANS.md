# 치즈 나이프 장기 유지보수 실행 계획

> **For agentic workers:** 현재 커서·미완료 체크리스트·승인/중지 조건만 관리한다. 완료 이력은 [복구 작업 이력](docs/superpowers/archive/2026-10-11-recovery-worklog.md), [유지보수 기반·타입 강화·AF05-B 준비 아카이브](docs/superpowers/archive/2026-10-14-foundation-maintenance-completed.md), [F00 완료 단계](docs/superpowers/archive/2026-10-14-f00-completed-stages.md), 결과는 docs/superpowers/validation/에서 확인한다. 아카이브의 과거 승인이나 개별 DONE을 새 단계 실행 권한으로 사용하지 않는다.

최신화: 2026-10-14 / Asia-Seoul. 현재 커서: **F00 Task5 WAITING-USER — 실제 팝업 sender의 문서 식별 사실 부재**. 공개 CDP 팝업 연결은 성공했으나 실제 production 요청에도 documentId/frameId가 없어 승인된 인증 게이트에서 입력 전에 중지했다. MAIN 중복 파일 주입 의존성은 실제 실행에서 보완했으며 현재 후속 보완 전체1286/1285pass/0fail/기존skip1·9gate·픽셀24/24·합성 오디오 수치 검사도 통과했다. Tasks5–6·저장4관측·whole-F00 Astra max는 미완료; 기존 Task4 검사 수치는 아카이브의 당시 입력 증거다.

## 1. 고정 결정과 공개 경계

- 채널별 저장은 **오디오·영상 필터만**, 나머지는 전역. 계정별 분리/계정·쿠키 수집은 하지 않는다.
- F00은 기존 compressor6필드·video5필드와 저장/프리셋 기반, Gain/EQ/노멀라이저는 F01. F00만으로 전체 오디오 채널 저장 완료를 주장하지 않는다.
- 현재 제품2.13.3, 세 자리 major.minor.patch 유지. 격리 시험 T=2.13.4/R=2.13.5는 공개 번호가 아니다. 차기 공개 번호는 배포 준비에서 별도 승인한다.
- 복구판은 Chrome만 지원. Firefox 복구·빌드·배포 없음.
- **차기 공개 최소 조건은 F00·F01 구현/객관 검증과 최종 통합 게이트**다. AF05-B 준비 완료만으로 새 버전을 공개하지 않는다.
- AF05-B 게시 후 실제 수용은 후행 게이트로 유지하되 F00/F01 설계·구현·PR을 동결하지 않는다. AF05-B에 F00/F01 의존성을 추가하지 않는다.
- 각 F00/F01 전체 기능을 별도 한글 PR로 묶는다. Task별·문서 전용 PR은 만들지 않는다. **명시 지시 전 push/PR 금지**, 병합·버전·릴리즈·스토어 제출/게시도 별도 승인.
- 기존 strict TypeScript 원본과 생성 JavaScript 계약 유지. React/Vue·새 프레임워크·전체 도구 TS 변환을 목표로 추가하지 않는다.
- 권한/origin·데이터 저장·외부 전송·원격 코드·지원 범위 확대는 별도 설계·정책 검토·승인 대상. F00의 승인된 로컬 저장 범위 밖으로 자동 확장하지 않는다.
- 한국어 또는 영어만 작성한다. 실제 계정·쿠키·채팅·결제·후원·연령 제한 콘텐츠는 공개 CI fixture/artifact에 넣지 않는다.
- 기존 HLS·오디오·패키지·점검도구 게이트를 새 설치형 E2E나 타입 검사로 대체하지 않는다.

## 2. 현재 기준과 보존할 제한

제품/스토어 기준2.13.3은 [P09 게시·설치 확인 기록](docs/superpowers/validation/2026-10-12-p09-store-publication.md)에 고정한다. 코드 기준 main4510096(PR #43 통합); [AF05-B 종합 마감](docs/superpowers/validation/2026-10-14-af05b-prepublication-closure.md)과 아카이브가 과거 CI·검증 수치를 소유한다. 이 문서 갱신을 새로운 게시/설치 확인으로 세지 않는다.

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
| F00 | 채널별 미디어 저장·프리셋 | WAITING-USER | 별도 own 설정 TAB 또는 팝업 세션 인증의 상세 설계/검토·수용기준 승인; 기존 sender 조건 완화 금지 |
| F01 | Gain 연결·EQ·노멀라이저·오디오 프리셋 | WAITING-DEPENDENCY | F00 저장 계약/구현 검증 뒤 별도 상세 설계·계획·승인 |
| AF05-B 실제 수용 / AF05 종료 | 차기 게시본 설치·업데이트 | WAITING-DEPENDENCY | 차기 게시와 실제 검사 별도 승인 후 수행; F00/F01과 독립 |
| DT02 | 선택 파일의 native TS 실행 | DEFERRED | 실제 유지보수 이득과 검사/실행 경계 보존이 증명되면 재설계 |
| F02–F05 | 후속 기능 | BACKLOG-BLOCKED | F00/F01 검증과 각 범위 승인 |

완료된 P/INC/AF 준비/DT 유지보수는 [완료 아카이브](docs/superpowers/archive/2026-10-14-foundation-maintenance-completed.md)로 이동했다. PR #42/#43 통합·해당 브랜치 정리는 완료됐지만 AF05 게시 후 실제 수용은 완료가 아니다.

## 5. F00 — 현재 작업 체크리스트

문서: [승인 상세 설계](docs/superpowers/specs/2026-10-14-f00-channel-media-settings-design.md) · [설계 검토/보완](docs/superpowers/validation/2026-10-14-f00-design-review.md) · [구현 계획](docs/superpowers/plans/2026-10-14-f00-channel-media-settings.md) · [계획 검토/7항목 closure](docs/superpowers/validation/2026-10-14-f00-plan-review.md).

완료된 설계·계획 승인 및 Tasks1–4은 [F00 완료 단계 아카이브](docs/superpowers/archive/2026-10-14-f00-completed-stages.md)로 이동했다. 현재 실행 승인은 Tasks1–6 로컬 구현·격리 검증·최종 Astra max에 한정되며 공개와 실제 시청 Chrome/P09는 제외한다.

- [ ] Task5 실제 popup qualification·격리 old→new→old→new 저장 보존·config/media 손실 negative·개인정보/사용 안내.
- [ ] Task6 fresh 전체 회귀/9foundation·점검도구·패키지/설치·보호 대조·whole-F00 Astra max·로컬 마감. 실제 미실행 경로는 별도 기록.
- [ ] F00 전체 범위 공개 지시를 받은 뒤 한글 PR/CI 확인. 현재 push/PR 금지; 자동 병합/배포 없음.

실제 popup의 Playwright Page capture는 실패했고, 승인된 [격리 CDP 대안](docs/superpowers/plans/2026-10-14-f00-popup-cdp-qualification.md)의 실제 attachment는 성공했다. 다만 production client에도 sender.documentId/frameId가 없어 현재 인증을 통과하지 못한다. [실제 관측과 중지 기록](docs/superpowers/validation/2026-10-14-f00-popup-cdp-qualification.md)을 유지하며 별도 설정 TAB 방식의 설계·Astra max 검토 승인이 필요하다. 문서 식별자를 위조하거나 직접 storage 저장으로 성공을 대체하지 않는다.

## 6. AF05-B — 게시 후 남은 실제 수용

기준: [수용 설계](docs/superpowers/specs/2026-10-12-af05b-release-acceptance-design.md), [native 최종 기록](docs/superpowers/validation/2026-10-13-af05b-native-preflight.md).

- [ ] 차기 게시본의 실제 신규 설치·기존2.13.3 업데이트·설정 보존·열린 페이지·확장 오류 확인. 게시와 실제 검사 승인이 선행한다.
- [ ] 결과/실패/미실행을 위 과거 업데이트 미검증·플랫폼 롤백 미실행 수용과 대조한다. 준비 PR 병합만으로 실제 업데이트 DONE 처리하지 않는다.
- [ ] AF05-B 최종 수용 및 AF05 종료 판단. 기능 PR·버전 배포 승인과 구분한다.

## 7. DT02 — 조건부 보류

[전체 유지보수 기록](docs/superpowers/validation/2026-10-13-dt-maintenance-whole-area.md)의 승인된 조사/보류는 완료됐지만 native TS 이전 구현은 하지 않았다. 현재 JSDoc/checkJs 유지; 단순 확장자 변경으로 실제 helper graph와 오용 검출을 잃는 경로는 사용하지 않는다.

- [ ] 실제 주석 중복/가독성 문제와 선택 파일 이전의 이득 확인.
- [ ] import 실제 검사·test discovery·lint/parser·snapshot/provenance·strict/runtime 보존을 함께 설계/검토하고 별도 승인. 재개 조건 전에는 작업하지 않는다.

## 8. 기능 로드맵 — 차기 공개는 최소 F00·F01까지

| ID | 기능 단위 | 재개 조건 |
| --- | --- | --- |
| F00 | 전역·프리셋·채널 저장 계약 | 위 체크리스트의 계획/실행 승인 |
| F01 | Gain·EQ·노멀라이저·오디오 프리셋 | F00 연결·객관 오디오 기준·별도 승인 |
| F02 | 영상 필터·프리셋 보강 | F01 뒤 GPU·성능 경계 포함 |
| F03 | 가려진 채팅 보강 | 제공 원문·삭제 종류·행 재사용 계약 |
| F04 | 2–4채널 멀티뷰 | 독립 재생·음량·화질·채팅·부분 교체 |
| F05 | 통나무파워 조회 | 데이터 최소화·계정 분리·새 권한 별도 승인 |

- [ ] F00 로컬 구현/회귀·최종 독립 검토 완료.
- [ ] F01 상세 설계·Astra max 검토·계획/실행 승인.
- [ ] F01 구현·객관 출력 상한/전환/수명주기/저장·F00 통합 검증. 주관적 청취만으로 완료하지 않는다.
- [ ] 각 F00/F01 기능 전체의 별도 공개 지시·한글 PR·공개 CI·병합 확인. Task/문서 PR로 더 쪼개지 않는다.
- [ ] 최종 통합 commit의 전체 회귀·점검도구·패키지·설치/저장 전환·native baseline/제한 대조.
- [ ] 최소 F00/F01 및 통합 게이트 후 세 자리 형식의 공개 번호·제출/게시 각각 별도 승인.
- [ ] 게시 후 실제 수용은6절에서 관리. 이 후행 게이트를 준비 PR의 선행 조건으로 바꾸지 않는다.

## 9. 검증 진입점

제품 검사 명령은 후보 폴더에서만 실행한다. 기존9foundation/전체 검사 목록과 새 F00 positive/negative 경로는 [F00 구현 계획의 Commands](docs/superpowers/plans/2026-10-14-f00-channel-media-settings.md#commands-execution-selection-and-approval-bundle)에 있다. Node24.19.0/TypeScript7.0.2/esbuild0.28.2/Playwright1.62.1의 현재 계약을 재사용하며 npm이 PATH에 없으면 기존 검증된 bundled CLI를 사용한다.

문서-only 변경은 로컬 링크·UTF-8/언어·체크리스트 상태·git diff --check와 보존 자료를 점검한다. 미래 파일의 존재나 계획에 적힌 명령을 실제 실행 PASS로 표시하지 않는다.

## 10. 현재 사용자 개입 지점

Tasks1–6 로컬 구현·격리 검증·최종 Astra max의 기존 승인은 유지한다. 현재는 실제 toolbar POPUP이 sender 문서 식별 계약을 충족하지 못해 **인증 경로/UX의 상세 재설계 승인**이 필요하다. 이 승인 전에는 실제 UI 저장/4관측과 전체 마감을 진행하지 않는다. 권장안은 기존 own top-document 검증을 유지하는 별도 설정 TAB이며, 구현 승인 없이 저장 경계를 완화하지 않는다.

실제 설치/새로고침·P09 변경·새 의존성/권한/외부 전송·버전·공개는 별도 STOP 게이트다. 이전 MCP 연결/종료 승인이나 다른 작업의 공개 승인을 재사용하지 않는다.

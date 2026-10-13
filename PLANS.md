# 치즈 나이프 장기 유지보수 실행 계획

> **For agentic workers:** 이 문서는 현재 커서와 미완료 게이트만 관리한다. 완료 과정과 과거 수치는 [복구 작업 이력](docs/superpowers/archive/2026-10-11-recovery-worklog.md), 검증 결과는 `docs/superpowers/validation/`에서 확인한다. 현재 단계의 승인된 구현 계획 없이 다음 단계나 기능 로드맵을 선행 구현하지 않는다.

**Goal:** 게시된 Chrome 커뮤니티 복구판을 유지하면서, 설치된 MV3 산출물 E2E와 명시적 계약·타입·모듈 경계를 먼저 확립한 뒤 기능 로드맵을 재개한다.

**Current stack:** Chrome MV3, JavaScript 제품 런타임, Node 24.19.0, Node test runner, Playwright 1.62.1, ESLint, npm audit, Gitleaks. TypeScript 7.0.2와 esbuild 0.28.2로 설정, MAIN runtime·site adapter·audio·player·preview·inject의 수기 원본을 strict TypeScript에 두고, 저장소 생성 JavaScript를 검증한 뒤 기존 `dist` 파일명으로 복사한다.

**Core references:** [AI 친화적 유지보수 기반 장기 설계](docs/superpowers/specs/2026-10-11-ai-friendly-foundation-design.md), [AF01 타입·빌드 기반 상세 설계](docs/superpowers/specs/2026-10-12-af01-type-build-foundation-design.md), [AF01 구현 계획](docs/superpowers/plans/2026-10-12-af01-type-build-foundation.md), [AF01 검증 기록](docs/superpowers/validation/2026-10-12-af01-type-build-foundation.md), [AF02 계약 우선 TypeScript 전환 상세 설계](docs/superpowers/specs/2026-10-12-af02-contract-first-migration-design.md), [AF02 구현 계획](docs/superpowers/plans/2026-10-12-af02-contract-first-migration.md), [AF03 runtime·site adapter 상세 설계](docs/superpowers/specs/2026-10-12-af03-runtime-site-adapter-design.md), [AF03 구현 계획](docs/superpowers/plans/2026-10-12-af03-runtime-site-adapter.md), [AF03 검증 기록](docs/superpowers/validation/2026-10-12-af03-runtime-site-adapter.md), [AF00 설치형 E2E 구현 계획](docs/superpowers/plans/2026-10-11-af00-installed-extension-e2e.md), [AF00 검증 기록](docs/superpowers/validation/2026-10-11-af00-installed-extension-e2e.md), [최신 출시 게이트](docs/superpowers/validation/2026-10-11-recovery-release-gates.md), [복구 작업 이력](docs/superpowers/archive/2026-10-11-recovery-worklog.md).

**AF04 references:** [기능 모듈 이전 상세 설계](docs/superpowers/specs/2026-10-12-af04-feature-modules-design.md), [AF04-A 오디오 계획](docs/superpowers/plans/2026-10-12-af04a-audio-module.md), [AF04-A 검증 기록](docs/superpowers/validation/2026-10-12-af04a-audio-module.md), [AF04-B 플레이어 계획](docs/superpowers/plans/2026-10-12-af04b-player-module.md), [AF04-C 미리보기 계획](docs/superpowers/plans/2026-10-12-af04c-preview-module.md), [AF04-C 검증 기록](docs/superpowers/validation/2026-10-12-af04c-preview-module.md), [AF04-D inject 계획](docs/superpowers/plans/2026-10-12-af04d-inject-modules.md), [AF04-D 검증 기록](docs/superpowers/validation/2026-10-12-af04d-inject-modules.md).

작성일: 2026-10-11 / Asia-Seoul.

## 1. 고정 결정

- 제품과 private 시험 복사본 모두 기존 세 자리 `major.minor.patch` 버전 형식을 유지한다(사용자2026-10-13 지시). 현재 제품2.13.3은 변경하지 않으며 B2 시험 T=`2.13.4`/R=`2.13.5`를 공개 제품·스토어·릴리즈 번호로 사용하지 않는다. 차기 공개 번호는 배포 단계의 별도 승인 대상이다.
- 복구판은 Google Chrome만 지원한다. Firefox 구현·빌드·배포는 복구하지 않는다.
- AF00–AF05를 완료하기 전에는 F00–F05 기능 로드맵을 구현하지 않는다.
- TypeScript는 장기 목표지만 전면 일괄 변환은 하지 않는다. 설치형 E2E로 현재 동작을 보호한 뒤 계약 경계부터 점진적으로 이전한다.
- 테스트·개발 도구의 전면 TS 이전은 필수 조건이 아니다. 공용 계약과 연결된 호출자부터 타입 검사 효과를 확인하며, DT 후속 작업을 AF05·F00의 새 선행 게이트로 추가하지 않는다.
- React/Vue를 도입하지 않는다. Webpack/Vite 자체를 목표로 삼지 않고 출력 계약에 필요한 최소 도구만 별도 proof 뒤 선택한다.
- 권한, host permission, 사용자 데이터 저장, 외부 전송, 원격 코드와 공개 지원 범위를 몰래 확대하지 않는다. 변경 필요 시 별도 설계·정책 검토·사용자 승인을 받는다.
- 실제 계정·쿠키·채팅·결제·후원·연령 제한 콘텐츠를 결정적 CI fixture나 공개 artifact로 사용하지 않는다.
- HLS·오디오·패키지·보안 점검의 기존 게이트를 설치형 E2E로 대체하지 않는다.
- Playwright는 실제 BFCache 복원을 지원하지 않는다. 설치형 E2E에서는 `persisted` 수명주기 처리를 검사하고, 실제 back/forward 복원은 비결정적 smoke로만 기록한다.
- 신규 문서와 공개 설명은 한국어 또는 영어로만 작성한다.
- **독립 유지보수 후속 — 테스트·개발 도구 타입 강화**는 작업영역 전체를 마무리한 뒤 한글 PR 하나로 묶어 안내한다. 개별 항목·문서 수정만으로 push·PR을 하지 않으며, 이전 공개 지시를 재사용하지 않는다. 보류 결정은 구현 완료와 구분한다.
- **AF05-B**도 카테고리 전체의 잔여 작업·검증을 마무리한 뒤 한글 PR 하나로 묶는다. Task별·B2만의 중간 push·PR이나 문서 전용 PR은 만들지 않는다. 전체 완료 후 공개 승인을 확인하며, 실제 설치·배포·완료 기준 변경 승인은 별도로 유지한다.

## 2. 현재 공개·저장소 상태

- AF04-D 제품 기준 merge commit: `5326ff4b86857c331fa45c25acd9207a1888852e`.
- PR #2 `2.13.3` 복구 변경, PR #3 README 간소화, PR #4 AF00 설치형 E2E 기반, PR #5 AF01 타입·빌드 기반, PR #6 AF02 계약 우선 전환, PR #7 AF02 상태 고정, PR #8 AF03 runtime·site adapter 분리, PR #9 AF03 상태 고정, PR #12 AF04 설계, PR #13 AF04-A audio 이전, PR #14 AF04-A 상태 고정, PR #15 AF04-B player 이전, PR #17 AF04-C preview 이전과 PR #19 AF04-D inject 이전은 `main`에 병합됐다.
- GitHub prerelease `v2.13.3-community.1`이 공개됐다.
- Chrome 웹 스토어 2.13.3 교체본은 게시됐다. 2026-10-12 사용자 보고와 공개 상세 페이지의 `2.13.3 sidebar follow-up preview`·업데이트일2026-10-12 표시를 직접 확인했다. 승인된 격리 프로필의 native 신규 설치 파일/출처/권한·게시본 연결도 확인했다. 기존 설치 업데이트·설정 보존은 아직 확인하지 않았다. [게시 확인 기록](docs/superpowers/validation/2026-10-12-p09-store-publication.md).
- 현재 기준 브랜치: 포크의 `origin/main`. 움직이는 최신 문서 merge SHA나 PR 번호 상한은 기준점으로 기록하지 않는다.
- PR #41은 영역 전체의 마무리 전 공개됐으므로 사용자 지시로 2026-10-13 미병합 상태에서 닫았다. 현재 작업의 공개·통합 수용 근거로 사용하지 않는다. 전체 영역은 별도 PR #42로 병합됐으며 커밋·검증 이력은 보존한다.
- 독립 유지보수 전체 PR #42는 사용자 승인으로 2026-10-13 merge `6b919e1c62661ec49a12ce6df2c02e11273af41d`에 통합됐다. PR 최종 head와 병합 후 main CI 모두 통과했고, main 포함·열린 PR·worktree·링크 확인 후 해당 로컬/원격 `codex/dt01c-artifact-contracts`만 삭제했다. 보호 브랜치 두 개와 원래 dist·프로필·ZIP은 유지하며 릴리즈·스토어 배포는 하지 않았다.
- AF01은 PR #5로 병합됐고 최종 공개 CI run `38157976040`에서 Windows·Ubuntu foundation과 전체 verify가 통과했다. AF02는 PR #6의 공개 CI run `38161802432`와 PR #7의 공개 CI run `38162135577`를 통과해 `main`에 병합됐다. AF03은 검증 코드 `f125daf`를 PR #8의 공개 CI run `38168282370`에서 검증하고 merge commit `275b9a6`으로 병합했으며, PR #9의 공개 CI run `38168743332`로 상태 문서를 고정했다. AF04-A는 PR #13의 공개 CI run `38185697240`에서 검증하고 merge commit `5d28c48`로 병합했다. AF04-B는 PR #15의 공개 CI run `38187819147`을 통과하고 merge commit `5e6e541`로 병합했다. AF04-C는 PR #17의 공개 CI run `38191280752`를 통과하고 merge commit `c526296`으로 병합했다. AF04-D는 PR #19의 공개 CI run `38195194642`를 통과하고 merge commit `5326ff4`로 병합했다.

GitHub 상태는 2026-10-12에 공개 API로 재확인했다. 스토어는 같은 날 사용자의 게시 완료 보고 후 실제 공개 페이지에서2.13.3 표시와 승인된 격리 프로필의 실제 설치 파일을 확인했다. 사용자가 제공한 게시 완료 메일의 표시 시각은14:55이며 실제 게시 처리 시각과 구분한다. 기존 설치 업데이트는 미확인이다.

## 3. 상태와 실행 규칙

상태는 `DONE`, `READY`, `PLAN-REVIEW`, `DOING`, `WAITING-USER`, `WAITING-DEPENDENCY`, `BLOCKED`, `BACKLOG-BLOCKED`를 사용한다.

1. 각 AF 단계는 설계·구현 계획·구현·검증 단위로 진행한다. push·PR은 사용자 명시 지시가 있을 때만 별도로 수행한다.
2. 실패 검사→최소 구현→집중 회귀→전체 게이트 순서를 지킨다.
3. private `output/**`, 브라우저 프로필, trace, screenshot, root `dist`와 실제 사용자 세션 자료를 커밋하지 않는다.
4. 실제 설치 산출물, 소스 주입 검사, jsdom 검사와 실제 사이트 smoke의 증거를 섞지 않는다.
5. 도구 실패·빈 대상·제외 범위·비결정적 환경을 PASS로 바꾸지 않는다.
6. 구현 중 현재 단계의 권한·데이터·제품 동작 범위가 넓어지면 중지하고 설계를 다시 승인받는다.
7. 사용자 개입이 필요하지 않은 승인 범위의 작업은 순차적으로 이어간다. 확장 새로고침, 스토어 심사·게시, 외부 계정 조작처럼 사용자가 해야 하는 단계에서만 최소 행동을 요청한다.
8. 사용자 시험판의 root `dist`는 테스트·감사·회귀의 임시 출력이나 cleanup 대상으로 사용하지 않는다. 명시적인 시험판 업데이트/복원 승인 없이는 이 경로에 `npm run build`를 실행하지 않으며 후보/임시 복제에서 검사한다.
9. 사용자 명시 지시 없이는 push 및 PR 생성을 하지 않는다. 작업·설계·구현·검증 승인이나 완료를 push/PR 지시로 해석하지 않으며 이전의 포괄적 공개 작업 승인을 자동 전용하지 않는다. 작업은 로컬에서 유지하고, 지시가 있을 때 요청된 범위만 공개한다. PR 크기·문서 여부를 별도의 자동 공개 기준으로 삼지 않는다. 병합 후 정리에도 해당 승인 범위와 main 포함·열린 PR·worktree·URL 의존성을 확인하며, 미병합 고유 커밋·원본 PR·원본 저장소 브랜치는 자동 삭제하지 않는다.

## 4. 순서와 현재 커서

| ID | 작업 묶음 | 선행 조건 | 상태 | 다음 게이트 |
| --- | --- | --- | --- | --- |
| P01–P08 | 복구·검증·2.13.3 GitHub 공개 | 기존 승인 | DONE | 상세는 archive/validation 참조 |
| INC01 | 로컬 시험판 로드 폴더 삭제 사고 | 수정39/39·58파일 복원·사용자 수용·PR #30/공개 CI | DONE | 실제 시험판 유지; 테스트 출력/정리에서 root dist 보호 |
| P09 | 스토어 2.13.3 게시·업데이트 기준 고정 | 공개 표시·게시 알림14:55·게시 payload·실제 신규 설치 파일 확인 | WAITING-DEPENDENCY | 과거 업데이트/실제 롤백 미검증 유지; 차기 업데이트 수용 준비 |
| AF00 | 설치된 MV3 산출물 E2E | 설계 승인 | DONE | 검증 기록과 CI 게이트 유지 |
| AF01 | 타입·빌드 전환 기반 | AF00 | DONE | strict/build proof와 공개 CI 유지 |
| AF02 | 계약 우선 TypeScript 전환 | AF01 | DONE | 생성·drift·strict·설치형 E2E 게이트 유지 |
| AF03 | MAIN runtime·site adapter 분리 | AF02 | DONE | 생성·strict·설치형 E2E·공개 CI 유지 |
| AF04 | 기능별 모듈 이전 | AF03 | DONE | 생성·strict·설치형 E2E·공개 CI 유지 |
| AF05 | 이행 종료·공개 게이트 | AF05-A, AF05-B | WAITING-DEPENDENCY | 내부 완료, 공개 설치 수용 대기 |
| AF05-A | 내부 원본 종료·검증 | AF04 | DONE | 생성·strict·전체 회귀·공개 CI 유지 |
| AF05-B | 공개 설치·업데이트·롤백 수용 | P09, 차기 AF 배포 준비 | DOING | B2 설계/Native 구현·격리검증·최종 Astra max 묶음 승인2026-10-13. 전체 카테고리 완료 후 단일 PR, 실제 배포 금지 유지 |
| DT01-B | 오디오 quality report 타입 계약 | DT01-A 완료·설계/실행 승인 | DONE | 구현·격리 검증·Astra max·PR #40 공개 CI 확인; 최종 head checks·병합 상태는 해당 PR 기준 |
| DT-MAINT | 독립 유지보수 후속 — 테스트·개발 도구 타입 강화 전체 | DT00·DT01-A/B/C/S·NUM01·DT02 처리 구분 | DONE | 전체 영역 구현·검토·PR #42/main CI·병합·해당 브랜치 정리 완료; DT02 조건부 보류 유지 |
| DT01-C | artifact description·부분 report 비교 계약 | 설계·계획·Native/격리 실행 승인 | DONE | 전체 영역 PR #42로 통합, 기존 계약·검증 유지 |
| DT01-S | settings fixture·callback/reply 계약 | written-spec·계획·Native/격리 실행 승인 | DONE | 전체 영역 PR #42로 통합, foundation settings-fixture 게이트 유지 |
| NUM01 | rmsEnvelope 숫자 입력 경계 보완 | bounded 설계·보완·검증 승인 | DONE | 개별 구현·검증·Astra max 완료; 전체 영역 종합 수용을 대신하지 않음 |
| DT02 | 선택적 native TS 실행 | 조건부 보류 판단 승인 | DEFERRED | 지금은 JSDoc/checkJs 유지, 실제 유지보수 이득·검사/실행 경계 보존 조건에서 재검토; native 구현 완료 아님 |
| F00–F05 | 저장 기반과 후속 기능 | AF05 | BACKLOG-BLOCKED | 새 typed contract 기준으로 재설계 |

현재 커서: **AF05-B2 Important6 작성자 보완·격리 검증 → 재로드 준비 실패의 진단 재설계 승인 게이트**. [B2 현재 기록](docs/superpowers/validation/2026-10-12-af05b2-installed-transition.md): 집중108/108·기반9·직렬전체1094개 중1093pass/실패0/기존skip1·기존 설치 positive/negative·audio·도구/보존 대조. 기본 병렬 전체의 Windows MAIN rename EPERM 실패는 보존한다. B2 positive/storage-loss 모두 seed/launch 차단으로 미합격, I1 실제 환경 수용/Task3 미완료다. 직전 유지보수 [PR #42](https://github.com/Do-hyeon/cheese-knife/pull/42)는 `6b919e1`에 통합·main CI 통과·해당 브랜치 정리 완료다. AF05-B 전체 카테고리 완료 후 단일 한글 PR, 중간 push·PR·릴리즈·스토어 배포 금지와 DT02 보류/기존 한계는 유지한다.

B1은 PR #36 최종 CI run `38255250513`과 merge `b38ec388`로 완료했다. B2 설계·계획은 PR #37로 병합됐으며 최초 Astra max Critical0·Important3·Minor1 보완 기록과 구현·실행 승인 게이트를 보존한다. 수정 후 독립0건/실제전환PASS/native update 수용은 아니다. P09의 게시2.13.3·격리 신규 설치 기준은 보존하며 과거 업데이트·실제 롤백 수용은 미검증이다. AF05 전체와 기능 로드맵 동결은 유지한다.

## 5. P09 — 스토어 게시 후 고정

**INC01 후속 반영.** 사용자는 어제 작동한 로컬 시험판이 오늘 제거됐다고 보고했다. 기존 로드 경로인 root `dist`가 진단 당시 없었고, AF01 production package test의 실제 dist build/after hook 재귀 삭제가 원인이었다. 2026-10-12 01:06 이후 본 작업 폴더의 실행 기록을 확인했다. 승인 후 테스트를 격리하고 어제 검증본58파일을 복원했으며 사용자가 같은 경로의 재등록과 기존 설정 유지를 확인했다. Chrome 등록 제거의 정확한 시각은 미확인이다. 복원은 현재 AF 개발본 배포나 기존 스토어 버전 업데이트 검증과 구분한다.

- [x] 삭제 가능한 production test 경로·현재 root dist 부재·기존 로드 경로와 실행 이력 대조.
- [x] 승인 후 기존 후보 빌드/정리를 재사용해 테스트 격리 수정; 임시 복제 RED→GREEN과 package38/38 확인.
- [x] 어제 검증된 배포 ZIP의58파일을 원래 root dist 경로로 복원; 원본 해시·58/58 일치·package20자원 확인. 현재 AF 소스로 교체하지 않음.
- [x] 최종 전체835개 중834개 통과·기존 frozen 역사 검사1개 실패를 기록. 그 검사1개만 명시적 제외한834/834와 dist58/58 불변 확인. Astra max Important1의 RED→GREEN 보완 완료. [사고 검증 기록](docs/superpowers/validation/2026-10-12-inc01-installed-dist-preservation.md).
- [x] 기존 Chrome 재등록과 기존 설정 유지 — 2026-10-12 사용자 직접 수행/확인. 자동 UI 검증·모든 방송 기능 회귀로 확대하지 않음.
- [x] 공개 조건 전체835개 중834 passed·0 failed·기존 private 자료 부재 skip1. [PR #30](https://github.com/Do-hyeon/cheese-knife/pull/30)·공개 CI run `38227171266`·merge commit `798e56e`로 재발 방지 수정 반영. 원래 로컬의 private 역사 해시 실패1개는 별도 유지.

- [x] 2.13.3 소스 PR 병합과 GitHub prerelease 공개.
- [x] Chrome 웹 스토어 교체본 제출.
- [x] 개발자 대시보드에서 2.13.3 심사 중 상태 확인.
- [x] 스토어 공개 페이지가2.13.3을 제공하는지 확인(2026-10-12, 사용자 보고+브라우저 직접 확인).
- [x] 게시 CRX·제출 ZIP 내용 연결과 MV3/20자원 검사, 게시 JS 합성14/18/12·qualityFailures0·full-scale0 확인. 서명 컨테이너·외부 metadata·설치형 증거는 구분.
- [x] 별도 로컬 Chrome 프로필 신규 설치 승인과 검사용 프로필 생성(로그인·동기화 없음).
- [x] 새 설치가 게시 산출물을 받는지 확인(native 스토어 설치 파일/출처/권한·내용 대조; 현재 runtime/실제 방송 E2E와 구분).
- [x] 기존 시청 Chrome의 설치 유형 확인: 사용자 보고상 로컬 시험판만 있으며 구 스토어 설치본은 없음.
- [ ] 기존 스토어2.13.2→2.13.3 업데이트·설정 보존 확인 — 검증 대상 부재로 미검증. 로컬 시험판·구 ZIP 재설치·신규 설치 검사로 대체 통과시키지 않는다.
- [ ] 새 격리 프로필의 스토어2.13.3을 차기 실제 스토어 업데이트·설정 보존 검증 기준으로 사용(변경 실행 전 별도 승인).
- [x] 배포 commit·version·제출 ZIP/게시 CRX SHA-256·내용 대조를 validation 문서에 고정.
- [x] 사용자 제공 게시 완료 메일의 표시 시각14:55·항목 ID·버전·공개 상태와 시각 한계를 validation에 고정. 원본 이미지 미공개.
- [ ] 실제 업데이트 검증·롤백 수용을 validation 문서에 고정.

P09는 AF05 내부 작업의 시작 조건이 아니다. AF05 최종 공개 게이트 전에는 반드시 완료한다. 게시 배포 기준은 `fb15f967` 기반2.13.3이며 이후 AF 변경 후보와 구분한다. 원본 파일 byte/manifest 필드 대조와 실제 Chrome 설치·업데이트·설정 보존은 서로 다른 증거다. P09 검증으로 AF 후보의 스토어 업데이트까지 검증했다고 간주하지 않는다.

## 6. AF00 — 설치형 MV3 E2E

설계: [AI 친화적 유지보수 기반 장기 설계](docs/superpowers/specs/2026-10-11-ai-friendly-foundation-design.md)

구현 계획: [AF00 설치형 E2E 구현 계획](docs/superpowers/plans/2026-10-11-af00-installed-extension-e2e.md)

### 계획 게이트

- [x] 설치형 E2E 우선 방향과 장기 단계 설계 승인.
- [x] 정확한 파일·fixture·명령·커밋 단위를 가진 구현 계획 초안 작성.
- [x] 현재 manifest, UI ID, 후보 빌더, 기존 테스트 파일명과 계획 대조.
- [x] 실제 BFCache 복원을 Playwright 합격 조건으로 둔 잘못된 초안을 공식 제약에 맞게 수정.
- [x] clean CI에서 `build`보다 `check`가 먼저 실행되던 잘못된 순서 수정.
- [x] 사용자의 구현 계획 승인.
- [x] 주 실행자 순차 구현 방식 선택.

### 구현 체크리스트

- [x] AF00-1 격리 후보 생성·정리 수명주기.
- [x] AF00-2 외부 네트워크를 닫은 최소 CHZZK fixture 라우터.
- [x] AF00-3 fresh persistent profile과 bundled Chromium 확장 harness.
- [x] AF00-4 popup→background→ISOLATED→MAIN 설정 흐름.
- [x] AF00-5 두 창 설정 병합과 styles 원래 대상만 reload.
- [x] AF00-6 worker wake·설정 보존, 합성 persisted 수명주기, context invalidation 후 fresh startup. 자연 idle 종료와 headless unpacked in-place reload 미관측은 validation에 제한으로 기록.
- [x] AF00-7 MAIN runtime 누락 negative control과 CI 공개 게이트.
- [x] AF00-8 전체 회귀·패키지 경계·validation·README 기록.

완료 조건: fresh profile의 설치형 positive/negative E2E와 기존 게이트가 모두 통과하고, 제품 동작·권한·데이터 계약이 넓어지지 않으며 private 프로필이 성공·실패 뒤 모두 제거된다.

## 7. AF01–AF05 체크리스트

### AF01 — 타입·빌드 기반

- [x] TypeScript + esbuild proof-only 방향과 범위의 대화상 설계 승인.
- [x] 현재 실행 문맥·전역 ABI·스토어 정책을 반영한 상세 설계 문서 작성.
- [x] IIFE 전역 격리, 정적 타입 과신, native binary, 결정성, 형식적 proof와 JS 금지의 역효과 공격 검토 반영.
- [x] 상세 설계 문서 사용자 검토·승인.
- [x] 정확한 파일·테스트·명령·커밋 단위를 가진 구현 계획 작성·자체 검토.
- [x] JSDoc 주석 byte와 실행 코드 불변 조건의 충돌 보완을 포함한 구현 계획 사용자 검토·승인과 실행 방식 선택.
- [x] TypeScript strict와 Chrome API 타입 proof.
- [x] 엔트리별 현재 출력 계약·CSP·비압축 검토 가능성 비교.
- [x] 선택 도구의 결정적 출력·라이선스·원격 접근 여부 로컬 검증.
- [x] 신규 첫 번째 당사자 런타임 JavaScript 금지 게이트.
- [x] source→`dist` 제품 JavaScript byte 동일성과 proof/types/source map 미포함 검사.
- [x] clean archive 전체 회귀·객관 오디오·설치형 positive/negative E2E.
- [x] npm·ESLint·Gitleaks 감사에서 AF01 신규 관측 0 확인.
- [x] pre-merge 검토의 POSIX npm bin·companion native binary, 전체 배포 JS inventory, reply 타입 과신, POSIX 경로와 복합 환경 식별자 누출 지적 보완.
- [x] 한글 PR #5에서 Windows·Ubuntu 공개 CI와 변경 diff 검토.
- [x] AF01 병합 commit `2e2ee90`, PR #5와 최종 공개 CI run `38157976040`으로 상태 고정.

### AF02 — 계약 우선 이전

- [x] TypeScript 원본과 기존 global-script ABI를 함께 유지하는 대화상 방향 승인.
- [x] 생성 JS drift, 타입 과신, module 전환, queue·storage 의미 변화에 대한 공격 검토를 상세 설계에 반영.
- [x] 상세 설계 문서 사용자 검토·승인.
- [x] 정확한 파일·테스트·명령·커밋 단위의 구현 계획 작성·자체 검토.
- [x] 구현 계획 사용자 검토·승인과 주 실행자 순차 실행 방식 선택.
- [x] 설정 schema·validator·message union·revision 계약을 단일 TypeScript 근거로 정리.
- [x] background broker/client와 popup/styles 경계를 기존 전역 ABI 그대로 TypeScript 이전.
- [x] 손상 storage, 오래된 revision, 잘못된 message의 정적·런타임 거부 확인.
- [x] 결정적 생성·drift·build/candidate/package 우회 방지와 LF 계약 확인.
- [x] 공개 checkout 조건 전체 회귀·객관 오디오·설치형 positive/negative E2E 확인.
- [x] npm·Gitleaks 0, AF02 신규 ESLint 관측 0과 기존 guarded observation 보존 확인.
- [x] 전체 branch 독립 검토와 Critical/Important finding 보완.
- [x] 한글 PR #6, Windows·Ubuntu 공개 CI run `38161802432`와 merge commit `15fbfba`로 상태 고정.

### AF03 — runtime·adapter 분리

- [x] architectural 단계로 분류하고 대화 설계·접근 방식 사용자 승인.
- [x] runtime·site adapter 상세 명세 작성과 자체 공격 검토.
- [x] 작성된 상세 명세 사용자 검토·승인.
- [x] 정확한 파일·테스트·명령·커밋 단위의 구현 계획 작성·자체 검토.
- [x] 구현 계획 사용자 검토·승인과 실행 방식 확정.
- [x] route, scope, status, bridge 수명주기 모듈화.
- [x] React fiber·webpack·DOM selector를 site adapter로 제한.
- [x] 사이트 내부 값은 `unknown`에서 validator를 통과하도록 고정.
- [x] 파일 로드 순서 대신 import graph로 의존성 표현.
- [x] 생성 drift·strict·설치형 positive/negative E2E와 전체 공개 gate 검증.
- [x] 독립 코드 검토의 Critical/Important finding 보완.
- [x] 한글 PR #8, 공개 CI run `38168282370`과 merge commit `275b9a6`으로 상태 고정.

### AF04 — 기능 모듈 이전

- [x] architectural 단계로 분류하고 대화 설계·접근 방식 사용자 승인.
- [x] audio → player → preview → inject 순서, 기존 출력 ABI와 별도 PR 경계를 상위 상세 설계로 고정.
- [x] selector 누출, 생성 authority, 수명주기·실패 격리, 데이터·권한 확대 위험 공격 검토 반영.
- [x] 상세 설계 문서 사용자 검토·승인.
- [x] AF04-A 오디오의 정확한 파일·인터페이스·검사·커밋 계획 작성·자체 검토.
- [x] AF04-B 플레이어의 정확한 파일·인터페이스·검사·커밋 계획 작성·자체 검토.
- [x] AF04-C 미리보기의 정확한 파일·인터페이스·검사·커밋 계획 작성·자체 검토.
- [x] AF04-D chat/sidebar/popup/page/coordinator의 정확한 파일·인터페이스·검사·커밋 계획 작성·자체 검토.
- [x] 네 구현 계획 묶음 사용자 승인과 실행 방식 확정.
- [x] AF04-A audio typed source graph 로컬 구현·전체 검증·독립 검토 완료.
- [x] AF04-A audio를 typed source graph로 이전하고 PR #13·공개 CI run `38185697240`·merge commit `5d28c48`로 완료.
- [x] AF04-B player typed source graph 로컬 구현·전체 검증·Astra max 독립 검토 완료.
- [x] AF04-B player를 typed source graph로 이전하고 PR #15·공개 CI run `38187819147`·merge commit `5e6e541`로 완료.
- [x] AF04-C preview typed source graph 로컬 구현·전체 검증·Astra max finding 보완 완료.
- [x] AF04-C preview를 typed source graph로 이전하고 PR #17·공개 CI run `38191280752`·merge commit `c526296`으로 완료.
- [x] AF04-D inject typed source graph 로컬 구현·전체 검증·Astra max finding 보완 완료.
- [x] AF04-D inject를 기능별 module로 이전하고 PR #19·공개 CI run `38195194642`·merge commit `5326ff4`로 완료.
- [x] 각 기능의 mount/dispose/status, 실패 격리, 다중 창과 설치형 positive/negative E2E 확인.
- [x] `web/inject.js` entry에는 순차 의존성 조립과 등록만 남기고 AF04 검증 기록 고정.

### AF05 — 이행 종료

실행 계획: [AF05 내부 종료 계획](docs/superpowers/plans/2026-10-12-af05-internal-closure.md).

검증 기록: [AF05 내부 검증](docs/superpowers/validation/2026-10-12-af05-internal-closure.md).

AF05-A 내부 작업 — P09와 독립:

- [x] 수기 런타임 JS 7개를 TypeScript로 이전. 제품 JS16개 전체 생성 경로와 strict TS-only 검사 확보. 필요한 classic-script 연결은 계약으로 유지.
- [x] explicit `any`·ignore 0, DOM/검증 경계 단언과 필요한 전역 연결 원장 고정.
- [x] source→dist 두 격리 build58/58 해시 일치, CSP·권한·라이선스·현재 기능 설명의 로컬 정합성 확인. 실제 스토어 필드는 공개 수용에서 확인.
- [x] 전체 공개-checkout 회귀800/800, 객관 오디오·pixels·설치형 positive/negative·도구 감사·Astra max 검토.
- [x] 한글 PR #22·공개 CI run `38198182595`·merge commit `39558c469e6276fa6eded7af629dae93822a8106` 완료.

AF05-B 공개 수용 — P09와 차기 AF 배포에 의존:

- [x] **복귀·계획 정합성:** 유지보수 PR #42 통합 후 기준 main `6b919e1`과 B2 계획을 대조했다. 기존 B1의 역사적 strict8 결과는 유지하고, B2 실행 게이트는 현재 foundation9(settings-fixture 추가)에 맞춘다. broker control의 기존 queued initialize 연결점도 유지됨을 확인했다. 새 구현/설치 전환 PASS나 수정 후 독립 검토 판정은 아님.
- [x] **공개 단위 고정:** 사용자2026-10-13 지시로 AF05-B 전체를 마무리한 뒤 단일 한글 PR. 개별 Task/B2/문서만의 중간 공개는 금지하며 최종 push·PR 승인과 병합·배포 승인은 구분한다.
- [x] 차기 배포 수용의 설계·검토 진행 승인. 제품·버전·설치·스토어 변경은 제외.
- [x] [차기 배포 수용 상세 설계](docs/superpowers/specs/2026-10-12-af05b-release-acceptance-design.md) 작성. 기존2.13.3 보존·배포 번호 미정·저장 호환성·동일 ID 격리 전환·실제 스토어 업데이트와 플랫폼 롤백 분리. 잔여 개발·로컬 검증 완료 후 배포 준비 단계에서 번호를 별도 결정/승인.
- [x] Astra max 독립 설계 검토 Critical0·Important3·Minor2와 주 실행자 보완. native baseline 선행·각 phase payload hash·legacy 정리·finally cleanup·P09/AF05-B 소유권 반영. 수정 후 독립0건 판정이나 실제 전환 PASS를 주장하지 않음.
- [ ] written-spec 승인: 과거 native2.13.2 경로의 미검증 수용 및 격리 rollback/미실행 플랫폼 rollback의 완료 기준 분리 포함. 승인 전 P09/AF05 완료 기준은 바꾸지 않음.
- [x] **B1 / 상세 계획:** [게시 설정 계약 호환성 구현 계획](docs/superpowers/plans/2026-10-12-af05b1-settings-compatibility.md). Git/배포 hash를 고정한4파일과 같은fixture 저장 old→new→old·독립golden·fault/negative control. background/구 UI/native/전체58파일은 검증 범위 밖.
- [x] **B1 / 계획 독립 검토:** Astra max Critical0·Important3·Minor0와 주실행자 보완. 예약작업gap의settle epoch·전체게시schema/bounds·저장후completion/response실패oracle 반영. [계획 검토 기록](docs/superpowers/validation/2026-10-12-af05b1-plan-review.md). 당시 계획 검토와 아래 구현 후 최종 검토를 구분한다.
- [x] **B1 / 구현 승인:** 사용자2026-10-12 계획·Native 실행·최종Astra max 검토 승인. 이 승인만으로 과거 미검증 수용·P09/AF05 완료 기준을 바꾸지 않음.
- [x] **B1 / 구현·로컬 검증:** 출처reader6·두세대호환성72,고정schema/golden·동일저장old→new→old·fault/negative control. 새tracked 조건913개/912pass/기존private자료부재skip1/실패0,strict8·후보오디오14/18/12·설치positive/negative 통과. 원래폴더의P02 역사hash실패·기존도구경고7 유지,새경고0. [검증 기록](docs/superpowers/validation/2026-10-12-af05b1-settings-compatibility.md). 제품2.13.3·dist·ZIP·프로필·frozen 원장미변경.
- [x] **B1 / 최종 검토:** Astra max whole-branch Critical0·Important0·Minor0,독립72/72와RAM 반례·출처/로그대조. 최종head 공개CI 후병합권고. native/출시/보안인증은아님.
- [x] **B1 / 공개 CI:** [PR #36](https://github.com/Do-hyeon/cheese-knife/pull/36)의 `8257c113`에서 [run 38254502868](https://github.com/Do-hyeon/cheese-knife/actions/runs/38254502868) 통과. Windows·Ubuntu foundation, 전체913개/912pass/실패0/기존private자료부재skip1, build/package/audio/설치positive·negative 확인. 문서 갱신 이후의 최종 head checks·병합 여부는 PR #36의 최신 상태를 기준으로 확인한다. 병합은 최종 checks PASS일 때만 하며 main 포함·열린 PR·worktree 참조 확인 후 이번 branch만 정리한다. 로컬 검사를 native update 수용으로 표시하지 않음.
- [x] **B2 / 상세 설계·계획 작성:** [설계](docs/superpowers/specs/2026-10-12-af05b2-installed-transition-design.md), [구현 계획](docs/superpowers/plans/2026-10-12-af05b2-installed-transition.md). 고정 공개 ZIP58파일·실제background/구 UI·동일격리프로필/ID의old→new→old·5case literal oracle·설치경계저장손실negative·deadline/cleanup. 제품 version2.13.3·실제시청/native기준프로필 보존.
- [x] **B2 / Astra max 독립 검토·보완:** 최초Critical0·Important3·Minor1. MAIN ready/UI repair 분리·동기background 유지/awaited broker loss·launch/close ACK와종료미확인root 보존·실패관측IPC를보완. [검토 기록](docs/superpowers/validation/2026-10-12-af05b2-design-review.md). 고정ZIP/hash는독립대조했지만수정후독립0건/실제전환PASS/보안인증은아님.
- [x] **B2 / 설계·계획·실행 방식 승인:** 사용자2026-10-13 새bundled fixture프로필·가상T/R복사본·UI저장·실제손실control·owned cleanup·Native 구현/격리검증·최종 Astra max 검토 묶음 승인. 종료미확인시실패/root보존·private시험browser 수동종료필요가능성포함. 상위waiver/플랫폼rollback완료기준변경과실제스토어조작은별도.
- [x] **B2 / Task 1:** 고정58파일reader/cache preparation·provenance/상한/부재negative·CI준비. 집중96/96·새 lint0, 고정 공개 다운로드 검증. 새dependency/일반ZIP처리기없음. 최종 전체/Astra 수용은Task3와분리.
- [x] **B2 / Task 2:** 독립raw/UI/CSS/MAIN oracle·packaged phase·legacy/손상제한·worker출처 대조 구현. 집중99/99, 실제5case 전환 성공은Task3 미완료게이트로유지.
- [ ] **B2 / Task 3:** supervised runner·Astra max Critical0/Important6/Minor0 검토·작성자 보완·집중108/108·직렬전체1093pass/실패0/기존skip1·기반9/기존설치/audio/도구/보존 대조. 새 B2 positive/control은 runtime.reload 뒤 popup 차단, I1 환경 수용 미완료. 독립0건/전체완료 판정 아님. 공개 CI/통합은 전체 카테고리 단일 PR 게이트에서 수행.
- [ ] **B2 / 준비 절차 진단 재설계 승인:** 같은 private fixture에서 reload 전 접근과 단일 reload 전후 worker/navigation 사건만 bounded 관측하는 상세 설계·실행을 승인받는다. cache/profile 초기화·storage repair·CDP/정책 우회·반복 fallback 없음. 실패를 PASS로 바꾸지 않고 승인 전 새 진단 실행하지 않음.
- [ ] **후속 / native preflight·공개 준비:** 관측/설치·제품 버전·스토어 제출·게시 각각 별도 승인. 상세 계획은 앞 단계 근거를 확인한 뒤 작성.
- [ ] 새 설치·기존 설치 업데이트·설정 보존·롤백 설치 수용.
- [ ] **AF05-B 전체 종료·단일 PR:** 위 잔여 작업·검증·승인된 수용 기준을 전체 대조하고 미해결/미승인 항목을 분리한 뒤 공개 승인을 확인해 한글 PR 하나로 묶는다. 현재 배포 금지와 미승인 native/waiver 게이트 때문에 전체 DONE으로 표시하거나 이 게이트를 생략하지 않는다. 공개 후 최종 head CI 확인·병합은 별도 승인 범위로 수행한다.
- [ ] F00–F05 동결 해제 여부 사용자 승인.

## 8. 동결된 기능 로드맵

| ID | 기능 단위 | 재개 조건 |
| --- | --- | --- |
| F00 | 전역·프리셋·채널·계정별 저장 계약 | AF05의 typed broker/validator 기준으로 재설계 |
| F01 | EQ·노멀라이저·오디오 프리셋 | F00와 기존 객관 오디오 게이트 유지 |
| F02 | 영상 필터·프리셋 보강 | F01 뒤 GPU·성능 경계 포함 |
| F03 | 가려진 채팅 보강 | 제공되는 원문·삭제 종류·행 재사용 계약 확인 |
| F04 | 2–4채널 멀티뷰 | 독립 재생·음량·화질·채팅과 부분 교체 보장 |
| F05 | 통나무파워 조회 | 데이터 최소화·계정 분리·새 권한 별도 승인 |

### 독립 유지보수 후속 — 테스트·개발 도구 타입 강화

검토: [테스트·개발 도구 타입 강화 공격적 검토](docs/superpowers/specs/2026-10-12-development-tooling-typescript-review.md).

사용자 지정 순서는 이 작업영역 전체의 마무리 후 AF05-B 복귀다. DT00·DT01-A/B는 기존 main 통합 근거, C/S·NUM01은 개별 로컬 구현/검증 근거, DT02는 승인된 조건부 보류로 구분한다. 개별 DONE이나 NUM01 검토만으로 영역 전체를 종료하지 않는다. 남은 후보·PLAN-REVIEW·검토 보완·보류의 근거를 전체 목록 기준으로 대조하고 종합 수용을 완료한 뒤 한글 PR 하나로 안내한다. 최신 재개 지시에 따라 잔여 작업을 순차 진행하지만 전체 마무리 전 push·PR은 하지 않는다. B2 문서·미승인 게이트와 기존 공개 설치/출시 기준은 보존한다. 언어 비율이나 전체 `.mjs`·`.cjs` 제거를 목표로 범위를 자동 확대하지 않는다.

- [x] 테스트·fixture와 도구·실행 경계 각각의 Astra max 독립 검토 및 주 실행자 교차 검토.
- [x] 전면 이전 대신 명시적 JSDoc + `checkJs` 우선, 효과 확인 후 선택적 TS 이전 방향 고정.
- [x] **DT00 / 계획:** [공용 helper·bridge 계약 검사 상세 계획](docs/superpowers/plans/2026-10-12-dt00-helper-contracts.md) 작성·자체 대조와 사용자 승인 완료.
- [x] **DT00 / 구현·검토:** 의도적 계약 오용5종의 컴파일 거부와 정상/raw 대조, 기존 생성 JS 실행 검사 유지. 집중53/53·공개조건 전체815/815·설치형 positive/negative·Astra max 검토 통과. [검증 기록](docs/superpowers/validation/2026-10-12-dt00-helper-contracts.md)에 의존성·단언·비용·제외 범위 고정. 공개 CI·병합은 [PR #26](https://github.com/Do-hyeon/cheese-knife/pull/26)의 마지막 커밋 기준으로 확인한다.
- [x] **DT00 / 판단:** 제한된 공용 계약 검사는 유지한다. 전체 변환으로 자동 확대하지 않으며 DT01은 별도 작은 설계 단위로 진행한다.
- [x] **DT01 / 설계·검토:** [순수 오디오 수치·파형 요약 상세 설계](docs/superpowers/specs/2026-10-12-dt01-audio-contract-design.md) 작성·Astra max 검토와 Important1 보완. 기존 명시적 lint 목록 이전·old-export 검사 graph·frequency 생략/undefined/null·DT00 CI 순서 보존 반영. 기준 metrics/artifacts19/19·기존 lint1/1 확인이며 새 구현을 검증한 것은 아니다.
- [x] **DT01-A / 설계 승인:** 사용자가 written-spec 승인. 순수 수치3개+실제 Node 요약 소비자 범위와 full report/browser/file capability 제외 유지.
- [x] **DT01-A / 구현 계획·검토:** [상세 구현 계획](docs/superpowers/plans/2026-10-12-dt01a-audio-signal-contracts.md) 작성·자체 대조·Astra max 공격적 검토(Critical0·Important0·Minor1 보완). 무음 tone의 정합 조건을 정확한 입력으로 고정. 순수 모듈 proof와 구 API/CLI/감사 연결의 두 순차 단위·명령·커밋·제외 범위 명시.
- [x] **DT01-A / 구현 승인:** 사용자가 상세 계획과 Native(주 실행자 순차 구현)+최종 Astra max 검토를 승인했다.
- [x] **DT01-A / 구현·로컬 검증:** 순수 수치3개·실제 Node summary strict 계약, 구 export identity·CLI5개 호출·실제 감사 포함 연결. 집중43/43·연결77/77·공개조건 전체832/832, 합성14/18/12·qualityFailures0·full-scale0, 설치형 positive/negative 통과. [검증 기록](docs/superpowers/validation/2026-10-12-dt01a-audio-signal-contracts.md)에 비용·단언·미검사 범위와 기존 ESLint7 관측 유지 기록.
- [x] **DT01-A / 최종 검토:** Astra max whole-branch Critical0·Important0·Minor0. 기준 버전과2,286개 수치·요약 호출의 결과/오류 대조 및 집중77/77 재확인. 공개 CI·병합 이력은 해당 변경 PR의 마지막 커밋 checks·merge 상태를 기준으로 확인한다. 제품·스토어 제출본 불변. 이후 B/C/S·NUM01의 현재 상태는 각 항목을 기준으로 확인한다.
- [x] **DT01-B / 상세 설계 작성:** [quality report 계약 설계](docs/superpowers/specs/2026-10-12-dt01b-quality-report-contract-design.md). 정상 transition 상관 타입·2채널 summary와 partial/raw 호환을 구분하고 기존 gate·alias identity·실제 CLI 연결·4파일 checked graph·독립 oracle를 명시했다. DT01-A 효과 확인은 완료됐으므로 WAITING-DEPENDENCY를 해제한다.
- [x] **DT01-B / Astra max 검토·보완:** 최초 Critical0·Important1·Minor1. 선택 필드의 native Math.max/peak 국소 경계와 guarded 배열 타입 복원·내부 any negative control을 명시했다. [검토 기록](docs/superpowers/validation/2026-10-12-dt01b-quality-contract-review.md). 수정 후 독립0건·전체 strict·구현 PASS는 아니다.
- [x] **DT01-B / written-spec 승인:** 사용자2026-10-13 설계 승인. B2 승인·Native 실행 승인을 자동 전용하지 않는다.
- [x] **DT01-B / 상세 구현 계획 작성:** [계획](docs/superpowers/plans/2026-10-13-dt01b-quality-report-contracts.md). gate·정적/호환 증명과 CLI·감사/격리 회귀의2task, 국소 주석·독립 oracle·내부5곳 any control·실행 경로·비용·보호 범위 명시.
- [x] **DT01-B / 공격적 계획 검토·보완:** fresh Astra max 최초 Critical0·Important1·Minor1. 기존 runner의 disposable profile cleanup 한계를 승인/증거 범위에 명시하고 weak-alias 검사는 구조 대조·정규compiler4회로 구체화했다. [계획 검토 기록](docs/superpowers/validation/2026-10-13-dt01b-plan-review.md). 수정 후 독립0건·구현/신규proof PASS는 아님.
- [x] **DT01-B / 계획·실행 방식 승인:** 사용자2026-10-13 Native2task 순차 구현·격리 후보 검사·최종 Astra max와 기존 설치형 runner의 종료 미확인 시 disposable profile 삭제 가능 한계를 함께 승인. root dist/실제 시청/native 기준 프로필 보존; 기능 negative PASS와 cleanup 증거 분리.
- [x] **DT01-B / 구현·격리 검증·최종 검토:** 정상/partial/raw oracle·20개 정적 오용·내부5곳 any control, 집중132/132·전체990개 중989pass/실패0/기존skip1, 합성14/18/12·설치positive/negative 확인. Astra max 최종 Critical0·Important0·Minor0. [검증 기록](docs/superpowers/validation/2026-10-13-dt01b-quality-report-contracts.md). 제품2.13.3·root dist·ZIP·동결 증거 보존.
- [x] **DT01-B / 공개 CI/통합 게이트:** [PR #40](https://github.com/Do-hyeon/cheese-knife/pull/40)의 최종 `f7231cc`에서 [run 38282936547](https://github.com/Do-hyeon/cheese-knife/actions/runs/38282936547) Windows/Ubuntu foundation·전체 verify 통과 후 merge `9b8640f`로 통합. 현재 사용자 지정 순서는 독립 유지보수 후속 마무리 후 AF05-B 복귀이며, 복귀 시 B2 정합성 재확인·별도 구현 승인.
- [x] **DT01-C / 선행 상태·현행 경계 조사:** DT01-A/B 완료, 사용자 착수 요청. 기존 artifact export·실제 CLI·검사·부분 report 비교·malformed 반환/예외·owned-files import graph 대조. 읽기 전용 strict 조회의 artifact23/owned-files42 진단은 타입 정보 부족이며 버그 수가 아님. 제품·테스트·config는 변경하지 않음.
- [x] **DT01-C / 설계 방향 승인·상세 설계 작성:** 사용자2026-10-13 core/읽기 경계 분리 방향 승인. [설계](docs/superpowers/specs/2026-10-13-dt01c-artifact-contract-design.md)에 기존 공개 API·5파일·허용치·부분 report/오류·실제 reader·6파일 graph·감사 이전·정적/실행 oracle·보호/한계를 명시. 임의 declaration facade·전체 cast 금지, provider/CLI 전체 타입화 미주장.
- [x] **DT01-C / Astra max 독립 검토·보완:** 최초 Critical0·Important1·Minor2. Reader 메서드의 좁은 경로 허용을 함수형 프로퍼티 계약으로 보완, nullable alignment 허용·동일 baseline의 nonfinite 비교 생략을 정확히 명시. TypeScript7 RAM 계약 대조와 원본 API 결과를 확인. [검토 기록](docs/superpowers/validation/2026-10-13-dt01c-design-review.md). 새 core 구현/graph/검사 PASS·수정 후 독립0건은 아님.
- [x] **DT01-C / written-spec 후속 진행:** 보완된 [설계](docs/superpowers/specs/2026-10-13-dt01c-artifact-contract-design.md) 제시 후 사용자가 권장 후속 진행을 요청하여 구현 계획 단계로 이동. 구현·실행 승인은 아님.
- [x] **DT01-C / 상세 구현 계획 작성·자체 검토:** [계획](docs/superpowers/plans/2026-10-13-dt01c-artifact-contracts.md)에 Native 2개 작업·정확한 부분 계약·독립 raw/hash oracle·4회 compiler/9개 내부 목표·실제 owned-root 연결·감사/격리 검증·보호/한계를 반영.
- [x] **DT01-C / Astra max 계획 검토·보완:** fresh 최초 Critical0·Important1·Minor1. legacy 동일성 검사의 unchecked 배치로 6파일 graph 보호, provider ENOENT shape·실제 lint rule 문구 대조/보완. [검토 기록](docs/superpowers/validation/2026-10-13-dt01c-plan-review.md). 설계 검토와 별도이며 수정 후 독립0건/구현 PASS 아님.
- [x] **DT01-C / 구현 계획·Native 실행 승인:** 사용자2026-10-13 승인. Native 2개 작업·격리 candidate·합성·설치 positive/negative·최종 Astra max 실행. 신규 설치/의존성·사용자 Chrome 조작·push/PR은 포함하지 않음.
- [x] **DT01-C / 구현·검증·최종 검토:** core/실제 reader·6파일 strict graph, raw46·외부 오용18·내부9목표/4compiler, 집중151/151·전체재검사1002개 중1001pass/실패0/기존skip1, 후보58/자원20·합성14/18/12·138채널fullscale0·설치positive/negative. 최종 Astra max Critical0·Important0·Minor0. [검증 기록](docs/superpowers/validation/2026-10-13-dt01c-artifact-contracts.md). 해당 개별 로컬 검증의 판정이며 영역 전체 종료/공개 수용은 아님. 보호 산출물·버전2.13.3 유지.
- [x] **DT01-S / 필요성·범위 조사:** 실제 fixture·10개 직접 consumer·제품 classic 계약 대조, 기존55/55·strict조회88진단과 RAM 실제 import/조건부 builder 오용 거부4개 확인. [범위 검토](docs/superpowers/validation/2026-10-13-dt-maintenance-scope-assessment.md). 최종 Astra max Critical0·Important0·Minor0, 핵심 조회 독립 재현; 방향 승인 가능 판단이며 구현 PASS/전체 fixture 실현 가능성 확정은 아님.
- [x] **DT01-S / 설계 방향 승인:** 사용자2026-10-13 기존 fixture 구현+연결 consumer checkJs 방향 승인. raw/unknown·지연/clone/lastError·nullable 상태·생성 JS ABI 보존, 작은 builder 모듈만의 형식적 검사/전체 fake 재작성 금지.
- [x] **DT01-S / 상세 설계 작성:** [설계](docs/superpowers/specs/2026-10-13-dt01s-settings-fixture-contract-design.md). 실제 classic5파일 타입 재사용·별도13파일 checker·Chrome ambient 격리·정상/raw reply 구분·국소 realm/구성 단계 단언·연결 consumer·내부 오용/호환·비용·보호 범위 명시. RAM 후보 조회91진단은 fixture만의 미보완 타입 정보이며 전체 strict/구현 PASS는 아님.
- [x] **DT01-S / Astra max 설계 검토·보완:** 최초 Critical0·Important1·Minor2. callback 예외 시 lastError·반복 호출/수명, 서로 다른 clone 시점, nullable script-src의 통제 페이지 가정을 대조/보완. 작성자 추가 RAM 조회로 full-fake slot TS2352를 확인해 unknown realm slot·broker 입력을 명시하고 client 로컬 API 타입을 보존. [검토 기록](docs/superpowers/validation/2026-10-13-dt01s-design-review.md). 기존214/214·3checker 통과는 기준 증거이며 수정 후 독립0건/전체 fixture 구현 PASS는 아님.
- [x] **DT01-S / written-spec 승인:** 사용자2026-10-13 설계 승인·상세 구현 계획과 Astra max 검토 요청. 구현/Native 실행 승인은 아님.
- [x] **DT01-S / 상세 구현 계획 작성·자체 검토:** [계획](docs/superpowers/plans/2026-10-13-dt01s-settings-fixture-contracts.md). Native 권장2task·실제 메서드/콜백/nullable 계약·13파일 graph·원본 clone/예외/slot/src 호환·18외부 목표·5내부 목표/개별 약화 대조·실제 CI·9gate/격리/비용·보호/cleanup 한계 명시.
- [x] **DT01-S / Astra max 계획 검토·보완:** 최초 Critical0·Important1·Minor1. 실제 CI는051aad1을 가져오지 않으므로 일회성 baseline 조회의 정규화 해시를 고정하고 일반 검사의 Git 이력 의존을 제거했다. jsdom close만으로 늦은 구독 호출이 멈추지 않음을 독립 재현해 dispose→close→gate 해제 순서/관측값을 명시했다. [검토 기록](docs/superpowers/validation/2026-10-13-dt01s-plan-review.md). 작성자 보완이며 수정 후 독립0건/실제 strict0·구현 PASS는 아님.
- [x] **DT01-S / 계획·실행 방식 승인:** 사용자2026-10-13 Native2task 순차 구현·격리 후보/합성/설치 positive/negative·최종 Astra max·기존 close-failure cleanup 한계를 함께 승인. push/PR/병합/사용자 Chrome 조작은 제외.
- [x] **DT01-S / 구현·검증·최종 검토:** 전체 fixture/연결 consumer13파일 strict0·외부18/내부25오용·호환성·실제 CI 연결, 집중35/35·기존214/214·격리 전체1014개 중1013pass/실패0/기존skip1, 후보58/자원20·합성14/18/12·138채널fullscale0·설치positive/negative. 최종 Astra max Critical0·Important0·Minor1. [검증 기록](docs/superpowers/validation/2026-10-13-dt01s-settings-fixture-contracts.md). 해당 개별 로컬 검증의 판정이며 영역 전체 종료/공개 수용은 아님. 원래 dist·프로필·증거·버전2.13.3 보존.
- [x] **DT01-S / 비차단 설명 Minor1:** 사용자 유지보수 마무리 요청에 따라 fixture 주석·spec·판단 문구를 교정. Chrome 타입은 js/css 동시 배열을 허용하며 실제 문제는 explicitundefined partial merge의 exactOptionalPropertyTypes 정합이다. 타입·동작 변경이나 수정 후 독립0건 주장이 아님. 영역 전체 마무리 후 종합 PR에 포함한다.
- [x] **NUM01 / 설계 승인:** 사용자2026-10-13 기존 rmsEnvelope의 유한 양수 sampleRate/windowMs 검사·명시적 오류, 정상 결과/기본값/window 범위 보존을 승인. 기존 함수에 대한 bounded 보완으로 새 모듈·의존성·전면 입력 재작성은 하지 않음. 영역 전체 마무리 후 종합 PR에 포함한다.
- [x] **NUM01 / 구현·검증·Astra max:** RED2실패/정상대조1통과 후 두 guard 보완. 집중125/125·정상 입력225조합 기존 결과/오류 일치·9gate·격리 전체1016개/1015pass/실패0/기존skip1·후보58/자원20·합성14/18/12/138채널fullscale0·설치positive/negative. fresh Astra max Critical0·Important0·Minor0, 독립239오류/270정상oracle·실제checker6/13파일0진단. [NUM01 검증 기록](docs/superpowers/validation/2026-10-13-num01-maintenance-closeout.md). 개별 NUM01/C/S 연결 검토이며 영역 전체 종합 수용·제품 컴프레서 수정/보안 인증으로 확대하지 않음.
- [x] **DT02 / 현행 호환·검사 조사:** Node native stripping과 실제 명령·감사 확장자 범위 대조. 동일 RAM 코드의 cjs→cts rename에서 TS2345/helper graph가 사라지는 반례 확인; 안전한 재설계 전체를 불가능하다고 판단한 것은 아님.
- [x] **DT02 / 조건부 보류 승인:** 사용자2026-10-13 승인. 지금은 JSDoc/checkJs 유지. 해결 안 되는 실제 주석 중복/가독성 문제가 확인되고 import 실제 검사·발견·lint/parser·snapshot/provenance·strict/runtime 보존이 함께 설계됐을 때 선택 파일만 재검토. native 이전 구현 완료/영구 제외는 아님.
- [x] **독립 유지보수 후속 / 전체 목록·잔여 점검:** DT00·DT01-A/B/C/S·NUM01·DT02의 실제 계약·호출자·설계/계획/최종 기록을 대조했다. DT00의 오래된 공개 체크박스는 실제 PR26/run38204671442/merge4ed37a3 근거로 교정했다. 남은 PLAN-REVIEW를 자동 완료한 것이 아니라 후속 구현/검토와 historical caveat를 구분했다. [전체 기록](docs/superpowers/validation/2026-10-13-dt-maintenance-whole-area.md).
- [x] **독립 유지보수 후속 / DT02 최종 처리 구분:** 승인된 조건부 보류·재개 조건·미구현 범위를 확인했다. 같은 source의 CJS는 실제 helper 포함/TS2345 거부, CTS는 helper 빠짐/0진단을 새로 재현했다. blind rename을 하지 않으며 native 구현 완료·영구 제외·전면 이전 승인으로 바꾸지 않는다.
- [x] **독립 유지보수 후속 / 종합 검토·검증:** fresh 전체1016개/1015pass/실패0/기존skip1·9foundation·후보58/자원20·합성14/18/12/138채널fullscale0·설치positive/negative·보호 대조. 전체 영역 fresh Astra max Critical0·Important0·Minor1; 문서 Minor 교정, 독립 owned graph9/6/13·strong/weak controls·artifact46/quality54·수치240정상/25오류 확인. 원래 판정을 수정 후 독립0건으로 바꾸지 않으며 기존 경고7·runner/native 한계 유지.
- [x] **독립 유지보수 후속 / 범위 종료 판단:** 전체 목록·기존 검토 보완·DT02 처리와 fresh 종합 실행/검토·문서 교정을 확인해 이 승인된 전체 영역의 로컬 마무리를 완료한다. 단일 NUM01 완료에 따른 조기 종료 판단과 구분한다. 전체 provider/CLI·기존10consumer·HLS·native 전면 이전이나 공개 CI/통합 완료는 아님.
- [x] **독립 유지보수 후속 / 단일 한글 PR 안내안 준비:** 전체 영역 마무리 후 main의 DT00/A/B 기반과 새 C/S/NUM01·잔여 정정·종합 수용·DT02 보류를 한글 PR 한 건의 안내안으로 묶었다. 로컬 `output/dt-maintenance-whole-20261013/PR.ko.md`. 개별/문서 PR·중간 push는 하지 않았다.
- [x] **독립 유지보수 후속 / 공개 지시:** 사용자2026-10-13 전체 범위 push·fork main 대상 새 한글 PR 한 건·공개 CI 확인을 명시 승인. 병합은 금지했으며 이전 C/S 지시나 닫힌 PR #41을 재사용하지 않음.
- [x] **독립 유지보수 후속 / 실제 push·단일 PR 생성:** 기존 브랜치를 정상 push하고 fork main 대상 [한글 PR #42](https://github.com/Do-hyeon/cheese-knife/pull/42) 한 건을 생성·연결했다. 전체 영역의 main 기반·C/S/NUM01·잔여 정정·종합 근거를 묶었으며 원본 쓰기·force push·브랜치 삭제·배포는 하지 않았다.
- [x] **독립 유지보수 후속 / 공개 CI:** PR #42의 코드 기준 `4db6020`에서 [run 38348126225](https://github.com/Do-hyeon/cheese-knife/actions/runs/38348126225) Windows·Ubuntu foundation·verify SUCCESS. 전체1016개/1015pass/실패0/기존skip1, build/package·합성 오디오·설치positive/negative 통과. 문서 정리 이후의 마지막 head checks는 PR 최신 상태로 확인하며 최종 성공 전 병합하지 않음. 취소된 PR #41 CI를 전용하지 않음.
- [x] **독립 유지보수 후속 / 병합·통합:** 사용자2026-10-13 병합·브랜치 정리 승인 후 PR #42를 merge `6b919e1`로 통합했다. 최종 head CI와 main CI 통과·동일 tree·main 포함·열린 PR/worktree/URL 대조 후 해당 로컬/원격 브랜치만 삭제했다. 릴리즈·스토어 배포 없음.
- [x] **독립 유지보수 후속 / AF05-B 복귀:** 종합 통합 후 B2 계획을 현재 main/foundation9에 정합화하고 별도 구현 승인 단계로 복귀했다. B2 구현·출시를 시작했다는 의미는 아니며 전체 카테고리 단일 PR 원칙을 반영한다.

완료 기준은 계약 오용 검출과 기존 증거의 보존이다. 타입 단언·ignore로 진단만 없애거나 테스트/감사 대상을 줄이면 완료하지 않는다. HLS 자식 프로세스·고정 해시 검증 가족은 첫 실험에서 제외하고, 이후 변경 필요 시 별도 계획으로 다룬다.

## 9. 검증 진입점

현재 제품 기준 게이트다. 아래 명령은 사용자 시험판의 root `dist`가 아닌 격리 후보/임시 복제의 작업 폴더에서 실행한다. 원래 작업 폴더에서 `build`를 실행하지 않는다.

```powershell
node --test tests/*.test.cjs
node scripts/build.mjs
node scripts/check-package.mjs dist
node scripts/check-audio-quality.mjs --chrome
node scripts/tool-audit.mjs
npm run test:e2e
npm run test:e2e:negative
git -c core.safecrlf=false diff --check
```

문서만 바뀌면 전체 제품 회귀를 반복하지 않는다. 링크·경로·상태·`diff --check`를 검증한다.

## 10. 현재 사용자 개입 지점

INC01은 사용자 재등록·설정 유지 확인과 PR #30·공개 CI·main 병합으로 종료했다. 원래 dist의58파일과 현재 시험판·설정은 계속 보존한다. 이 수용을 모든 방송 기능·기존 스토어 버전 업데이트 검사로 확대하지 않는다.

전체 유지보수 영역은 PR #42의 최종 head/병합 후 main CI 통과와 승인된 병합·해당 브랜치 정리까지 완료했다. PR #41은 닫힌 상태로 두고 DT02 조건부 보류·원래 시험판/root dist/P09 profile·보호 브랜치는 유지한다. 승인된 B2 구현/격리 검증을 진행 중이며 카테고리 전체 완료 전 push·PR은 하지 않는다. 실제 native/수용 기준 변경과 릴리즈·스토어 배포 승인은 별개다.

게시 완료 알림의14:55는 표시 시각이고 실제 처리 시각·시간대·초는 미확정이다. 추가 시각 자료 요청은 종료했다. 실제 롤백·차기 설치/업데이트·스토어 제출/게시에는 각각 별도 승인이 필요하다. B2는 새 private bundled 프로필·UI 저장·손실 control·cleanup·Native 구현/격리검증/최종 Astra max 묶음 승인을 받았으며 그 범위에서만 실행한다. 종료 미확인 시 root 보존/수동 종료 필요 가능성은 유지한다. native/공개 실행·과거 미검증 수용·AF05-B 전체 완료 기준 변경은 별도 게이트다.

AF05 내부 작업은 완료됐다. P09의 게시 표시·게시 알림·게시 package 대조·합성 오디오와 승인된 별도 로컬 Chrome 프로필의 native 신규 설치 파일을 확인했다. 기존 시청 Chrome에는 사용자 보고상 로컬 시험판만 있으므로 존재하지 않는 스토어 설치본의 버전 확인·업데이트 조작을 요청하지 않는다. 로컬 시험판은 그대로 유지하고 격리 프로필의 스토어2.13.3을 차기 업데이트 기준으로 보존한다. 구 스토어2.13.2→2.13.3 설정 보존은 미검증으로 분리하고, 필요한 대체 검사와 실제 native 업데이트 증거를 구분해 설계한다. 확장 설치·업데이트·설정 변경이 필요해지면 해당 대상과 영향을 정해 별도 승인받는다. Google 로그인/동기화나 브라우저 접근 정책 우회는 하지 않는다. 롤백 수용과 AF 변경 후보의 차기 버전 공개 수용은 남았다. 완료된 DT01-B 설계를 다시 시작하지 않으며, 현재 AF05-B의 승인된 순서로 복귀했다. 실제 공개 설치·차기 배포·로드맵 동결 해제 조건은 유지한다.

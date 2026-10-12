# 치즈 나이프 장기 유지보수 실행 계획

> **For agentic workers:** 이 문서는 현재 커서와 미완료 게이트만 관리한다. 완료 과정과 과거 수치는 [복구 작업 이력](docs/superpowers/archive/2026-10-11-recovery-worklog.md), 검증 결과는 `docs/superpowers/validation/`에서 확인한다. 현재 단계의 승인된 구현 계획 없이 다음 단계나 기능 로드맵을 선행 구현하지 않는다.

**Goal:** 게시된 Chrome 커뮤니티 복구판을 유지하면서, 설치된 MV3 산출물 E2E와 명시적 계약·타입·모듈 경계를 먼저 확립한 뒤 기능 로드맵을 재개한다.

**Current stack:** Chrome MV3, JavaScript 제품 런타임, Node 24.19.0, Node test runner, Playwright 1.62.1, ESLint, npm audit, Gitleaks. TypeScript 7.0.2와 esbuild 0.28.2로 설정, MAIN runtime·site adapter·audio·player·preview·inject의 수기 원본을 strict TypeScript에 두고, 저장소 생성 JavaScript를 검증한 뒤 기존 `dist` 파일명으로 복사한다.

**Core references:** [AI 친화적 유지보수 기반 장기 설계](docs/superpowers/specs/2026-10-11-ai-friendly-foundation-design.md), [AF01 타입·빌드 기반 상세 설계](docs/superpowers/specs/2026-10-12-af01-type-build-foundation-design.md), [AF01 구현 계획](docs/superpowers/plans/2026-10-12-af01-type-build-foundation.md), [AF01 검증 기록](docs/superpowers/validation/2026-10-12-af01-type-build-foundation.md), [AF02 계약 우선 TypeScript 전환 상세 설계](docs/superpowers/specs/2026-10-12-af02-contract-first-migration-design.md), [AF02 구현 계획](docs/superpowers/plans/2026-10-12-af02-contract-first-migration.md), [AF03 runtime·site adapter 상세 설계](docs/superpowers/specs/2026-10-12-af03-runtime-site-adapter-design.md), [AF03 구현 계획](docs/superpowers/plans/2026-10-12-af03-runtime-site-adapter.md), [AF03 검증 기록](docs/superpowers/validation/2026-10-12-af03-runtime-site-adapter.md), [AF00 설치형 E2E 구현 계획](docs/superpowers/plans/2026-10-11-af00-installed-extension-e2e.md), [AF00 검증 기록](docs/superpowers/validation/2026-10-11-af00-installed-extension-e2e.md), [최신 출시 게이트](docs/superpowers/validation/2026-10-11-recovery-release-gates.md), [복구 작업 이력](docs/superpowers/archive/2026-10-11-recovery-worklog.md).

**AF04 references:** [기능 모듈 이전 상세 설계](docs/superpowers/specs/2026-10-12-af04-feature-modules-design.md), [AF04-A 오디오 계획](docs/superpowers/plans/2026-10-12-af04a-audio-module.md), [AF04-A 검증 기록](docs/superpowers/validation/2026-10-12-af04a-audio-module.md), [AF04-B 플레이어 계획](docs/superpowers/plans/2026-10-12-af04b-player-module.md), [AF04-C 미리보기 계획](docs/superpowers/plans/2026-10-12-af04c-preview-module.md), [AF04-C 검증 기록](docs/superpowers/validation/2026-10-12-af04c-preview-module.md), [AF04-D inject 계획](docs/superpowers/plans/2026-10-12-af04d-inject-modules.md), [AF04-D 검증 기록](docs/superpowers/validation/2026-10-12-af04d-inject-modules.md).

작성일: 2026-10-11 / Asia-Seoul.

## 1. 고정 결정

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

## 2. 현재 공개·저장소 상태

- AF04-D 제품 기준 merge commit: `5326ff4b86857c331fa45c25acd9207a1888852e`.
- PR #2 `2.13.3` 복구 변경, PR #3 README 간소화, PR #4 AF00 설치형 E2E 기반, PR #5 AF01 타입·빌드 기반, PR #6 AF02 계약 우선 전환, PR #7 AF02 상태 고정, PR #8 AF03 runtime·site adapter 분리, PR #9 AF03 상태 고정, PR #12 AF04 설계, PR #13 AF04-A audio 이전, PR #14 AF04-A 상태 고정, PR #15 AF04-B player 이전, PR #17 AF04-C preview 이전과 PR #19 AF04-D inject 이전은 `main`에 병합됐다.
- GitHub prerelease `v2.13.3-community.1`이 공개됐다.
- Chrome 웹 스토어 2.13.3 교체본은 게시됐다. 2026-10-12 사용자 보고와 공개 상세 페이지의 `2.13.3 sidebar follow-up preview`·업데이트일2026-10-12 표시를 직접 확인했다. 승인된 격리 프로필의 native 신규 설치 파일/출처/권한·게시본 연결도 확인했다. 기존 설치 업데이트·설정 보존은 아직 확인하지 않았다. [게시 확인 기록](docs/superpowers/validation/2026-10-12-p09-store-publication.md).
- 현재 기준 브랜치: 포크의 `origin/main`. 움직이는 최신 문서 merge SHA나 PR 번호 상한은 기준점으로 기록하지 않는다.
- AF01은 PR #5로 병합됐고 최종 공개 CI run `38157976040`에서 Windows·Ubuntu foundation과 전체 verify가 통과했다. AF02는 PR #6의 공개 CI run `38161802432`와 PR #7의 공개 CI run `38162135577`를 통과해 `main`에 병합됐다. AF03은 검증 코드 `f125daf`를 PR #8의 공개 CI run `38168282370`에서 검증하고 merge commit `275b9a6`으로 병합했으며, PR #9의 공개 CI run `38168743332`로 상태 문서를 고정했다. AF04-A는 PR #13의 공개 CI run `38185697240`에서 검증하고 merge commit `5d28c48`로 병합했다. AF04-B는 PR #15의 공개 CI run `38187819147`을 통과하고 merge commit `5e6e541`로 병합했다. AF04-C는 PR #17의 공개 CI run `38191280752`를 통과하고 merge commit `c526296`으로 병합했다. AF04-D는 PR #19의 공개 CI run `38195194642`를 통과하고 merge commit `5326ff4`로 병합했다.

GitHub 상태는 2026-10-12에 공개 API로 재확인했다. 스토어는 같은 날 사용자의 게시 완료 보고 후 실제 공개 페이지에서2.13.3 표시와 승인된 격리 프로필의 실제 설치 파일을 확인했다. 사용자가 제공한 게시 완료 메일의 표시 시각은14:55이며 실제 게시 처리 시각과 구분한다. 기존 설치 업데이트는 미확인이다.

## 3. 상태와 실행 규칙

상태는 `DONE`, `READY`, `PLAN-REVIEW`, `DOING`, `WAITING-USER`, `WAITING-DEPENDENCY`, `BLOCKED`, `BACKLOG-BLOCKED`를 사용한다.

1. 각 AF 단계는 설계·구현 계획·구현·검증·한글 PR의 독립 단위로 진행한다.
2. 실패 검사→최소 구현→집중 회귀→전체 게이트 순서를 지킨다.
3. private `output/**`, 브라우저 프로필, trace, screenshot, root `dist`와 실제 사용자 세션 자료를 커밋하지 않는다.
4. 실제 설치 산출물, 소스 주입 검사, jsdom 검사와 실제 사이트 smoke의 증거를 섞지 않는다.
5. 도구 실패·빈 대상·제외 범위·비결정적 환경을 PASS로 바꾸지 않는다.
6. 구현 중 현재 단계의 권한·데이터·제품 동작 범위가 넓어지면 중지하고 설계를 다시 승인받는다.
7. 사용자 개입이 필요하지 않은 승인 범위의 작업은 순차적으로 이어간다. 확장 새로고침, 스토어 심사·게시, 외부 계정 조작처럼 사용자가 해야 하는 단계에서만 최소 행동을 요청한다.
8. 사용자 시험판의 root `dist`는 테스트·감사·회귀의 임시 출력이나 cleanup 대상으로 사용하지 않는다. 명시적인 시험판 업데이트/복원 승인 없이는 이 경로에 `npm run build`를 실행하지 않으며 후보/임시 복제에서 검사한다.

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
| AF05-B | 공개 설치·업데이트·롤백 수용 | P09, 차기 AF 배포 준비 | WAITING-DEPENDENCY | 게시 산출물별 수용과 로드맵 해제 결정 |
| F00–F05 | 저장 기반과 후속 기능 | AF05 | BACKLOG-BLOCKED | 새 typed contract 기준으로 재설계 |

현재 커서: **P09 미검증 범위 고정과 AF05-B 차기 배포 수용 설계**. AF05-A 내부 작업은 PR #22·공개 CI run `38198182595`·merge commit `39558c4`로 완료했다. 게시 CRX는 제출 ZIP의57개 파일 byte 일치와 manifest의 update_url 추가만 확인했고, 패키지·게시 JS 합성 오디오 검사를 통과했다. 승인된 격리 프로필에서 사용자가 native 스토어 설치를 완료했고 설치 파일/출처/권한·실행 JS/CSS46개 byte 일치·JSON/아이콘 내용 대조를 확인했다. 사용자는 기존 시청 Chrome에 로컬 시험판만 있다고 확인했다. 실제 구 스토어 설치본의 업데이트/설정 보존은 검증 대상 부재로 미검증이며 사용자 버전 확인을 반복 요청하지 않는다. 게시 완료 메일의14:55 표시와 실제 처리 시각 미확정을 기록해 시각 자료 대기는 해제했다. 롤백 수용은 남았고 새 격리 프로필의 스토어2.13.3은 차기 업데이트 검증 기준으로 보존한다. 게시된 복구2.13.3과 이후 AF 변경 후보는 서로 다른 산출물이다. AF05 전체와 기능 로드맵 동결은 유지한다.

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

- [ ] 새 설치·기존 설치 업데이트·설정 보존·롤백 설치 수용.
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

P09·AF05-B의 현재 커서는 유지한다. 아래 작업은 기능 로드맵의 새 선행 조건이 아니며, 상세 구현 계획 승인 후 공개 심사와 독립적으로 실행할 수 있다. 언어 비율 개선이나 전체 `.mjs`·`.cjs` 제거를 목표로 삼지 않는다.

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
- [x] **DT01-A / 최종 검토:** Astra max whole-branch Critical0·Important0·Minor0. 기준 버전과2,286개 수치·요약 호출의 결과/오류 대조 및 집중77/77 재확인. 공개 CI·병합 이력은 이 변경 PR의 마지막 커밋 checks·merge 상태를 기준으로 확인한다. 제품·스토어 제출본 불변, DT01-B/C/S·NUM01 미완료 유지.
- [ ] **DT01-B / WAITING-DEPENDENCY:** 정상/partial/raw quality report gate·transition 계약은 DT01-A 효과 확인 뒤 독립 상세 설계. 기존 실패 입력·독립 기대값·오류/측정 의미 보존.
- [ ] **DT01-C / WAITING-DEPENDENCY:** artifact 부분 report projection·comparison과 owned-files 연결은 별도 설계. 기존 부분 report 허용·비교 허용치·감사 대상 보존.
- [ ] **DT01-S / BACKLOG-BLOCKED:** settings fixture/reply는 별도 유지보수 후보로 보류하며 오디오 작업에 함께 끌어오지 않는다.
- [ ] **NUM01 / PLAN-REVIEW:** rmsEnvelope의 NaN sampleRate/windowMs 입력에서 NaN·Infinity 결과가 남는 기존 한계 확인. 타입 이전과 분리한 숫자 입력 오류 정책·회귀 설계 후보이며 제품 결함/보안 취약점으로 확대 해석하지 않는다.
- [ ] **DT02 / WAITING-DEPENDENCY:** JSDoc보다 명확한 이점이 입증된 파일만 native `.mts`/`.cts` 검토. 실행 경로·테스트 발견·기존 감사 대상의 inventory·snapshot·ESLint·provenance 누락 방지와 별도 strict 검사를 함께 확보. 기존 감사 제외 범위를 확대하지 않는다.

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

사용자 제공 메일에서 게시 완료 알림의14:55 표시를 확인했다. 실제 게시 처리 시각·시간대·초는 미확정이지만 기록의 정밀도 한계로 보존하며 추가 시각 자료 요청은 종료한다. 실제 롤백·차기 설치/업데이트·스토어 제출/게시에는 각각 별도 승인이 필요하다. 다음은 AF05-B의 차기 버전·저장 호환성·격리 설치/업데이트·롤백 검증을 한 설계 단위로 제시하고 승인받는 단계다. 대상을 조작하지 않는 증거 정리와 준비는 계속 가능하며 신규 기능과 차기 배포 실행은 선행하지 않는다.

AF05 내부 작업은 완료됐다. P09의 게시 표시·게시 알림·게시 package 대조·합성 오디오와 승인된 별도 로컬 Chrome 프로필의 native 신규 설치 파일을 확인했다. 기존 시청 Chrome에는 사용자 보고상 로컬 시험판만 있으므로 존재하지 않는 스토어 설치본의 버전 확인·업데이트 조작을 요청하지 않는다. 로컬 시험판은 그대로 유지하고 격리 프로필의 스토어2.13.3을 차기 업데이트 기준으로 보존한다. 구 스토어2.13.2→2.13.3 설정 보존은 미검증으로 분리하고, 필요한 대체 검사와 실제 native 업데이트 증거를 구분해 설계한다. 확장 설치·업데이트·설정 변경이 필요해지면 해당 대상과 영향을 정해 별도 승인받는다. Google 로그인/동기화나 브라우저 접근 정책 우회는 하지 않는다. 롤백 수용과 AF 변경 후보의 차기 버전 공개 수용은 남았다. DT01-B는 별도 상세 설계 대상이며 실제 공개 설치·차기 배포·로드맵 동결 해제의 결정 조건은 유지한다.

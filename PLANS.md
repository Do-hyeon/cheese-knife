# 치즈 나이프 장기 유지보수 실행 계획

> **For agentic workers:** 이 문서는 현재 커서와 미완료 게이트만 관리한다. 완료 과정과 과거 수치는 [복구 작업 이력](docs/superpowers/archive/2026-10-11-recovery-worklog.md), 검증 결과는 `docs/superpowers/validation/`에서 확인한다. 현재 단계의 승인된 구현 계획 없이 다음 단계나 기능 로드맵을 선행 구현하지 않는다.

**Goal:** 게시된 Chrome 커뮤니티 복구판을 유지하면서, 설치된 MV3 산출물 E2E와 명시적 계약·타입·모듈 경계를 먼저 확립한 뒤 기능 로드맵을 재개한다.

**Current stack:** Chrome MV3, JavaScript 제품 런타임, Node 24.19.0, Node test runner, Playwright 1.62.1, ESLint, npm audit, Gitleaks. TypeScript 7.0.2와 esbuild 0.28.2로 설정 및 MAIN runtime·site adapter의 수기 원본을 strict TypeScript에 두고, 저장소 생성 JavaScript를 검증한 뒤 기존 `dist` 파일명으로 복사한다.

**Core references:** [AI 친화적 유지보수 기반 장기 설계](docs/superpowers/specs/2026-10-11-ai-friendly-foundation-design.md), [AF01 타입·빌드 기반 상세 설계](docs/superpowers/specs/2026-10-12-af01-type-build-foundation-design.md), [AF01 구현 계획](docs/superpowers/plans/2026-10-12-af01-type-build-foundation.md), [AF01 검증 기록](docs/superpowers/validation/2026-10-12-af01-type-build-foundation.md), [AF02 계약 우선 TypeScript 전환 상세 설계](docs/superpowers/specs/2026-10-12-af02-contract-first-migration-design.md), [AF02 구현 계획](docs/superpowers/plans/2026-10-12-af02-contract-first-migration.md), [AF03 runtime·site adapter 상세 설계](docs/superpowers/specs/2026-10-12-af03-runtime-site-adapter-design.md), [AF03 구현 계획](docs/superpowers/plans/2026-10-12-af03-runtime-site-adapter.md), [AF03 검증 기록](docs/superpowers/validation/2026-10-12-af03-runtime-site-adapter.md), [AF00 설치형 E2E 구현 계획](docs/superpowers/plans/2026-10-11-af00-installed-extension-e2e.md), [AF00 검증 기록](docs/superpowers/validation/2026-10-11-af00-installed-extension-e2e.md), [최신 출시 게이트](docs/superpowers/validation/2026-10-11-recovery-release-gates.md), [복구 작업 이력](docs/superpowers/archive/2026-10-11-recovery-worklog.md).

작성일: 2026-10-11 / Asia-Seoul.

## 1. 고정 결정

- 복구판은 Google Chrome만 지원한다. Firefox 구현·빌드·배포는 복구하지 않는다.
- AF00–AF05를 완료하기 전에는 F00–F05 기능 로드맵을 구현하지 않는다.
- TypeScript는 장기 목표지만 전면 일괄 변환은 하지 않는다. 설치형 E2E로 현재 동작을 보호한 뒤 계약 경계부터 점진적으로 이전한다.
- React/Vue를 도입하지 않는다. Webpack/Vite 자체를 목표로 삼지 않고 출력 계약에 필요한 최소 도구만 별도 proof 뒤 선택한다.
- 권한, host permission, 사용자 데이터 저장, 외부 전송, 원격 코드와 공개 지원 범위를 몰래 확대하지 않는다. 변경 필요 시 별도 설계·정책 검토·사용자 승인을 받는다.
- 실제 계정·쿠키·채팅·결제·후원·연령 제한 콘텐츠를 결정적 CI fixture나 공개 artifact로 사용하지 않는다.
- HLS·오디오·패키지·보안 점검의 기존 게이트를 설치형 E2E로 대체하지 않는다.
- Playwright는 실제 BFCache 복원을 지원하지 않는다. 설치형 E2E에서는 `persisted` 수명주기 처리를 검사하고, 실제 back/forward 복원은 비결정적 smoke로만 기록한다.
- 신규 문서와 공개 설명은 한국어 또는 영어로만 작성한다.

## 2. 현재 공개·저장소 상태

- AF03 제품 기준 merge commit: `275b9a679209949b06673f8e309b7dc13f33b2e1`.
- PR #2 `2.13.3` 복구 변경, PR #3 README 간소화, PR #4 AF00 설치형 E2E 기반, PR #5 AF01 타입·빌드 기반, PR #6 AF02 계약 우선 전환, PR #7 AF02 상태 고정, PR #8 AF03 runtime·site adapter 분리와 PR #9 AF03 상태 고정은 `main`에 병합됐다.
- GitHub prerelease `v2.13.3-community.1`이 공개됐다.
- Chrome 웹 스토어 2.13.3 교체본은 사용자가 게시 완료를 확인했다. 새 설치·기존 설치 자동 업데이트와 설정 보존은 아직 완료로 가정하지 않는다.
- 현재 기준 브랜치: 포크의 `origin/main`. 움직이는 최신 문서 merge SHA나 PR 번호 상한은 기준점으로 기록하지 않는다.
- AF01은 PR #5로 병합됐고 최종 공개 CI run `38157976040`에서 Windows·Ubuntu foundation과 전체 verify가 통과했다. AF02는 PR #6의 공개 CI run `38161802432`와 PR #7의 공개 CI run `38162135577`를 통과해 `main`에 병합됐다. AF03은 검증 코드 `f125daf`를 PR #8의 공개 CI run `38168282370`에서 검증하고 merge commit `275b9a6`으로 병합했으며, PR #9의 공개 CI run `38168743332`로 상태 문서를 고정했다.

GitHub 상태는 2026-10-12에 공개 API로 재확인했다. 스토어 상태는 사용자가 보고한 마지막 상태이며 P09에서 게시 후 다시 확인한다.

## 3. 상태와 실행 규칙

상태는 `DONE`, `READY`, `PLAN-REVIEW`, `DOING`, `WAITING-USER`, `WAITING-DEPENDENCY`, `BLOCKED`, `BACKLOG-BLOCKED`를 사용한다.

1. 각 AF 단계는 설계·구현 계획·구현·검증·한글 PR의 독립 단위로 진행한다.
2. 실패 검사→최소 구현→집중 회귀→전체 게이트 순서를 지킨다.
3. private `output/**`, 브라우저 프로필, trace, screenshot, root `dist`와 실제 사용자 세션 자료를 커밋하지 않는다.
4. 실제 설치 산출물, 소스 주입 검사, jsdom 검사와 실제 사이트 smoke의 증거를 섞지 않는다.
5. 도구 실패·빈 대상·제외 범위·비결정적 환경을 PASS로 바꾸지 않는다.
6. 구현 중 현재 단계의 권한·데이터·제품 동작 범위가 넓어지면 중지하고 설계를 다시 승인받는다.
7. 사용자 개입이 필요하지 않은 승인 범위의 작업은 순차적으로 이어간다. 확장 새로고침, 스토어 심사·게시, 외부 계정 조작처럼 사용자가 해야 하는 단계에서만 최소 행동을 요청한다.

## 4. 순서와 현재 커서

| ID | 작업 묶음 | 선행 조건 | 상태 | 다음 게이트 |
| --- | --- | --- | --- | --- |
| P01–P08 | 복구·검증·2.13.3 GitHub 공개 | 기존 승인 | DONE | 상세는 archive/validation 참조 |
| P09 | 스토어 2.13.3 게시·업데이트 기준 고정 | 외부 심사 통과 | READY | 새 설치·업데이트·설정 보존 확인 |
| AF00 | 설치된 MV3 산출물 E2E | 설계 승인 | DONE | 검증 기록과 CI 게이트 유지 |
| AF01 | 타입·빌드 전환 기반 | AF00 | DONE | strict/build proof와 공개 CI 유지 |
| AF02 | 계약 우선 TypeScript 전환 | AF01 | DONE | 생성·drift·strict·설치형 E2E 게이트 유지 |
| AF03 | MAIN runtime·site adapter 분리 | AF02 | DONE | 생성·strict·설치형 E2E·공개 CI 유지 |
| AF04 | 기능별 모듈 이전 | AF03 | PLAN-REVIEW | 기능 순서·격리 계약을 설계·계획으로 먼저 고정 |
| AF05 | 이행 종료·공개 게이트 | AF04, P09 | BLOCKED | 설치·업데이트·롤백과 정책 정합성 확인 |
| F00–F05 | 저장 기반과 후속 기능 | AF05 | BACKLOG-BLOCKED | 새 typed contract 기준으로 재설계 |

현재 커서: **AF04 설계·계획 검토**. audio/player/preview/chat/sidebar/style을 한 번에 옮기지 않고, 기능 순서와 공통 `mount`/dispose/status 경계를 먼저 설계·승인한 뒤 구현한다.

## 5. P09 — 스토어 게시 후 고정

- [x] 2.13.3 소스 PR 병합과 GitHub prerelease 공개.
- [x] Chrome 웹 스토어 교체본 제출.
- [x] 사용자가 스토어 공개 페이지의 2.13.3 게시 상태를 확인.
- [ ] 새 설치가 게시 산출물을 받는지 확인.
- [ ] 기존 2.13.2 설치가 2.13.3으로 업데이트되고 설정이 보존되는지 확인.
- [ ] 배포 commit, version, ZIP SHA-256, 게시 시각, 검증 범위와 롤백 경로를 validation 문서에 고정.

P09의 게시 뒤 설치·업데이트 수용 검사는 AF02의 내부 계약 전환을 막지 않는다. AF05 공개 게이트 전에는 반드시 완료한다.

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

- [ ] audio, player, preview, chat, sidebar, style을 한 기능씩 이전.
- [ ] 각 기능의 `mount`/dispose/status와 실패 격리 검사.
- [ ] `inject`에는 의존성 조립과 등록만 남김.

### AF05 — 이행 종료

- [ ] 첫 번째 당사자 런타임 JS와 임시 전역 shim 제거.
- [ ] `any`, ignore와 예외 원장을 0건 또는 승인된 근거로 고정.
- [ ] source→dist 재현 가능성, CSP, 권한, 라이선스와 스토어 설명 정합성 확인.
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

## 9. 검증 진입점

현재 제품 기준 게이트:

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

AF04는 상세 설계와 구현 계획을 먼저 작성·공격 검토하고, 기능 이전 순서와 공통 계약을 사용자에게 한 번에 승인받은 뒤 구현한다. 아직 승인되지 않은 기능 분할·동작 변경은 선행하지 않는다. P09 설치 수용은 AF04와 별도로 재개한다.

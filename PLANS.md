# 치즈 나이프 장기 유지보수 실행 계획

> **For agentic workers:** 이 문서는 현재 커서와 미완료 게이트만 관리한다. 완료 과정과 과거 수치는 [복구 작업 이력](docs/superpowers/archive/2026-10-11-recovery-worklog.md), 검증 결과는 `docs/superpowers/validation/`에서 확인한다. 현재 단계의 승인된 구현 계획 없이 다음 단계나 기능 로드맵을 선행 구현하지 않는다.

**Goal:** 게시된 Chrome 커뮤니티 복구판을 유지하면서, 설치된 MV3 산출물 E2E와 명시적 계약·타입·모듈 경계를 먼저 확립한 뒤 기능 로드맵을 재개한다.

**Current stack:** Chrome MV3, JavaScript, Node 24.19.0, Node test runner, Playwright 1.62.1, ESLint, npm audit, Gitleaks. TypeScript는 AF01 이후의 장기 목표이며 아직 제품 빌드에 도입하지 않았다.

**Core references:** [AI 친화적 유지보수 기반 장기 설계](docs/superpowers/specs/2026-10-11-ai-friendly-foundation-design.md), [AF01 타입·빌드 기반 상세 설계](docs/superpowers/specs/2026-10-12-af01-type-build-foundation-design.md), [AF00 설치형 E2E 구현 계획](docs/superpowers/plans/2026-10-11-af00-installed-extension-e2e.md), [AF00 검증 기록](docs/superpowers/validation/2026-10-11-af00-installed-extension-e2e.md), [최신 출시 게이트](docs/superpowers/validation/2026-10-11-recovery-release-gates.md), [복구 작업 이력](docs/superpowers/archive/2026-10-11-recovery-worklog.md).

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

- GitHub `main`: `81b35c97811901acd80e8a4a2d5b4e9be0ceba91`.
- PR #2 `2.13.3` 복구 변경, PR #3 README 간소화와 PR #4 AF00 설치형 E2E 기반은 `main`에 병합됐다.
- GitHub prerelease `v2.13.3-community.1`이 공개됐다.
- Chrome 웹 스토어 2.13.3 교체본은 사용자가 제출했으며 마지막 확인 상태는 **심사 대기**다. 이 문서는 심사 통과나 실제 자동 업데이트를 완료로 가정하지 않는다.
- 현재 계획 브랜치: `codex/af01-type-build-foundation`.
- 현재 브랜치는 AF01 상세 설계와 계획 상태만 다룬다. TypeScript/esbuild 의존성, 확장 제품 동작·권한·사용자 데이터 계약은 아직 변경하지 않았다.

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
| P09 | 스토어 2.13.3 게시·업데이트 기준 고정 | 외부 심사 통과 | WAITING-DEPENDENCY | 실제 게시·새 설치·업데이트·설정 보존 확인 |
| AF00 | 설치된 MV3 산출물 E2E | 설계 승인 | DONE | 검증 기록과 CI 게이트 유지 |
| AF01 | 타입·빌드 전환 기반 | AF00 | PLAN-REVIEW | 상세 설계 검토 후 구현 계획 작성 |
| AF02 | 계약 우선 TypeScript 전환 | AF01 | BLOCKED | 설정·메시지·revision 경계 이전 |
| AF03 | MAIN runtime·site adapter 분리 | AF02 | BLOCKED | 불안정한 치지직 경계 격리 |
| AF04 | 기능별 모듈 이전 | AF03 | BLOCKED | audio/player/preview/chat/sidebar 순차 이전 |
| AF05 | 이행 종료·공개 게이트 | AF04, P09 | BLOCKED | 설치·업데이트·롤백과 정책 정합성 확인 |
| F00–F05 | 저장 기반과 후속 기능 | AF05 | BACKLOG-BLOCKED | 새 typed contract 기준으로 재설계 |

현재 커서: **AF01 타입·빌드 기반 상세 설계 검토**. 세부 설계와 후속 구현 계획이 각각 승인되기 전에는 빌드 도구나 제품 런타임을 변경하지 않는다.

## 5. P09 — 스토어 게시 후 고정

- [x] 2.13.3 소스 PR 병합과 GitHub prerelease 공개.
- [x] Chrome 웹 스토어 교체본 제출.
- [ ] 스토어 공개 페이지에서 2.13.3 게시 상태와 설명·스크린샷·지원 링크 확인.
- [ ] 새 설치가 게시 산출물을 받는지 확인.
- [ ] 기존 2.13.2 설치가 2.13.3으로 업데이트되고 설정이 보존되는지 확인.
- [ ] 배포 commit, version, ZIP SHA-256, 게시 시각, 검증 범위와 롤백 경로를 validation 문서에 고정.

P09는 외부 심사 대기 중이지만 AF00의 격리된 계획·구현을 막지 않는다. AF05 공개 게이트 전에는 반드시 완료한다.

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
- [ ] 상세 설계 문서 사용자 검토·승인.
- [ ] 정확한 파일·테스트·명령·커밋 단위를 가진 구현 계획 작성·검토·승인.
- [ ] TypeScript strict와 Chrome API 타입 proof.
- [ ] 엔트리별 현재 출력 계약·CSP·비압축 검토 가능성 비교.
- [ ] 선택 도구의 결정적 출력·라이선스·원격 접근 여부 검증.
- [ ] 신규 첫 번째 당사자 런타임 JavaScript 금지 게이트.

### AF02 — 계약 우선 이전

- [ ] 설정 schema·validator·message union·revision 계약을 단일 근거로 정리.
- [ ] background broker/client와 popup/styles 경계를 작은 단위로 TypeScript 이전.
- [ ] 손상 storage, 오래된 revision, 잘못된 message의 정적·런타임 거부 확인.

### AF03 — runtime·adapter 분리

- [ ] route, scope, status, bridge 수명주기 모듈화.
- [ ] React fiber·webpack·DOM selector를 site adapter로 제한.
- [ ] 사이트 내부 값은 `unknown`에서 validator를 통과하도록 고정.
- [ ] 파일 로드 순서 대신 import graph로 의존성 표현.

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

AF01 상세 설계 문서를 검토·승인한 뒤 정확한 구현 계획을 작성하고 별도로 승인해야 한다. 그 전에는 TypeScript 의존성, manifest, 제품 런타임과 새 빌드 도구를 변경하지 않는다. 스토어 심사가 끝나면 P09 설치 수용을 별도로 재개한다.

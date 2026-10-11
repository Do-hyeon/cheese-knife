# AF02 계약 우선 TypeScript 전환 검증 기록

- 검증일: 2026-10-12 / Asia-Seoul
- 검증 코드 대상: `181f829f89de0fb724cceeda9116e403d12fa6fc` (`codex/af02-contract-first-migration`)
- 증거 결속: 아래 전체 회귀·Chrome 검사·도구 감사는 이 코드 커밋에서 실행했으며, 이후 커밋은 이 검증 기록과 계획 상태만 갱신한다.
- 기준점: `2e2ee90be0f9ba402fe12bbd6cf1bd556b0a607e` (`main`, PR #5 병합)
- 환경: Windows x64, Node 24.19.0, Playwright 1.62.1, bundled Chromium 155.0.8059.39

## 결론

AF02의 로컬 구현·수용 조건을 충족했다. `settings-contract.js`, `settings-client.js`, `settings-broker.js`의 수기 원본을 세 TypeScript global-script 원본으로 옮겼고, 기존 파일명과 전역 ABI를 결정적으로 생성한다. 일반 검사·빌드·후보 생성은 source tree를 고치지 않고 stale 생성물을 거부하며, 명시적 write 명령만 세 산출물을 갱신한다.

설정 protocol, validator, revision, queue, storage, CSS와 대상 탭 reload 제어 흐름은 바꾸지 않았다. 생성 JavaScript의 byte 표현은 달라졌지만 세 파일의 정규화된 실행 해시는 AF01과 동일하고, 기존 settings·다중 창·설치형 E2E가 통과했다. manifest, 권한, host permission, 외부 통신과 사용자 데이터 계약도 변경하지 않았다.

## 변경 구조

- 유일한 수기 원본: `src/settings/contract.ts`, `src/settings/client.ts`, `src/settings/broker.ts`
- 저장소 포함 생성물: `settings-contract.js`, `settings-client.js`, `settings-broker.js`
- 생성·검사 진입점: `scripts/settings-runtime.mjs`
- read-only gate: 일반 build, candidate 검증, Windows·Ubuntu foundation CI
- 배포 제외: `src/**`, `*.ts`, TypeScript 설정, source map과 개발 도구
- 제거한 중복 원본: `types/knife-settings.d.ts`

## 자동 검증

| 게이트 | 결과 |
| --- | --- |
| 현재 작업 폴더 전체 Node 테스트 | 671 tests, 670 passed, 1 failed; 실패는 코드와 무관한 로컬 비공개 P02 원장의 이전 source hash |
| 공개 checkout 조건 전체 Node 테스트 | 로컬 임시 clone에서 671 tests, 670 passed, 0 failed, 1 skipped |
| private 감사 증거 검사 | 공개 checkout에 없는 비공개 원장은 의도대로 1 skipped |
| TypeScript strict | 통과, `any`/`@ts-ignore`/emit 없음 |
| settings 생성 검사 | 세 파일 결정성·drift·read-only·CI write 거부 통과 |
| build proof | 네 실행 문맥과 논리 graph 기준선 일치 |
| runtime JavaScript inventory | 기존 16개 파일 목록과 실행 hash 기준선 일치 |
| build·package | `dist` build, v2.13.3, manifest 참조 20개 통과; TS·`src`·source map 미포함 |
| source→`dist` | 모든 제품 JavaScript byte 동일 |
| 객관 오디오 | Chromium 155, full-scale 초과 0, 스트레스 peak 0.980000019, 250/750/1000Hz 전환 기준선 일치 |
| positive 설치 E2E | 모든 report section passed, 64,849ms |
| negative 설치 E2E | 예상 오류 `main-runtime-missing`만 관측 |
| 도구 감사 | npm 0, Gitleaks 현재/Git 0, AF02 신규 ESLint 관측 0 |
| whitespace | `git -c core.safecrlf=false diff --check` 통과 |

격리 검증은 `core.autocrlf=false`인 로컬 clone에 현재 `node_modules`를 물리 복사해 실행했다. Git 메타데이터가 없는 archive는 LF 속성 검사를 수행할 수 없으므로 합격 증거로 사용하지 않았다.

## 생성·실행 해시

생성 JavaScript byte SHA-256:

- `settings-contract.js`: `bdd49f4a660dcda6c260cadd9f897a0cd63cffa90291ea81d99cd15500f9ec44`
- `settings-client.js`: `031817db1599f044b87b443ec6d43ef13d8243a8d71545e5622790e8817e4a09`
- `settings-broker.js`: `8a0f3f20c01c6162fa57544e9fed05fdfef3b1187e65c285b105e0302339aa4c`

정규화된 실행 SHA-256은 AF01과 동일하다.

- `settings-contract.js`: `d8e91afdd745967f4a740ebd24789b3f1ce4e1f458df31f9add1bd48b2a2c08c`
- `settings-client.js`: `25ae1391e38782dcff2c58e75e5910df69591ea91b29a7426c07f0e772c23bc8`
- `settings-broker.js`: `fc6924fa615ef7c96aadfd1f019320f62d318cc68b9fee78b52e4b81d6dfe27c`

## 제품·개인정보·스토어 정책 불변성

- `manifest.json`, `popup.html`, `styles.html`, `background.js`는 기준점과 동일하다.
- popup, styles와 `web/**` 제품 런타임도 기준점과 동일하다.
- manifest 권한은 `scripting`, `storage`, host permission은 `https://chzzk.naver.com/*`로 유지된다.
- 새 storage key, protocol/revision 의미, 기본값, 외부 endpoint, telemetry, remote code와 사용자 데이터 수집·전송은 없다.
- 설정 외부 입력은 계속 `unknown`에서 runtime validator를 통과해야 한다. inherited key, malformed request/reply/storage와 stale/exhausted revision 거부 회귀가 통과했다.
- 배포물에는 TypeScript 원본, 설정 파일, proof, source map과 개발 도구가 포함되지 않는다.
- AF02는 공개 기능과 사용법을 바꾸지 않으므로 README와 Chrome 웹 스토어 설명 변경이 필요하지 않다.

## 도구 감사 경계

최신 비공개 감사 보고서는 `output/tool-audit/run-2026-10-11T17-36-56-388Z-kqEdPH`에 있다. npm audit와 Gitleaks의 현재 파일·전체 Git 이력은 0건이다. ESLint 관측 7개는 AF01부터 유지한 `scripts/owned-files.mjs`의 동적 파일 시스템 capability 경계이며, containment·link·type 검사를 한 곳에 모은 설계상 관측이다. 종료 상태 1은 이를 clean으로 위장하지 않는 기존 계약이다.

AF02 계획의 `invalid/exhausted revision` 문구가 generic API key로 오인된 항목은 `regexTarget = "line"`과 정확한 문구 하나로만 제외했다. 파일·경로·규칙 전체를 제외하지 않으며, 변경 뒤 Gitleaks 현재 파일과 전체 Git 이력은 모두 0건이다.

도구 감사 자체는 exploit 재현이나 모델 보안 검사를 하지 않고, locally patched HLS를 dependency advisory로 분석하지 않는다. HLS 경계·vendoring·실제 bundle 검사는 별도 전체 Node 회귀에서 통과했다.

## 설치 E2E와 로컬 증거 제한

- 디버그 세션이 worker를 계속 살려 두어 자연 idle suspension은 관측하지 못했다.
- bundled headless Chromium의 unpacked in-place reload는 worker를 다시 시작하지 않아 fresh context startup으로 context invalidation 경계를 검사했다.
- 실제 계정·쿠키·결제·연령 제한 콘텐츠, Chrome 웹 스토어 자동 업데이트와 장시간 사용은 AF02 proof 범위가 아니다.
- 로컬 비공개 P02 warning ledger는 이전 source hash를 참조한다. 공개 checkout과 CI에는 이 원장이 없으며 제품 테스트 실패가 아니다.
- Windows·Ubuntu 공개 CI와 PR 검토는 아직 실행하지 않았다.

## 재현 명령

```powershell
node --test tests/*.test.cjs
node scripts/check-toolchain.mjs
node scripts/check-runtime-inventory.mjs
node node_modules/typescript/bin/tsc -p tsconfig.json
node scripts/settings-runtime.mjs
node scripts/check-build-proof.mjs
node scripts/build.mjs
node scripts/check-package.mjs dist
node scripts/check-audio-quality.mjs --chrome
node scripts/check-installed-extension.mjs
node scripts/check-installed-extension-negative.mjs
node scripts/tool-audit.mjs
git -c core.safecrlf=false diff --check
```

`tool-audit`의 종료 상태 1은 위 7개 guarded observation을 보존한 결과다. 상세 판정은 종료 코드만 보지 않고 생성된 `summary.json`의 도구별 상태와 catalog를 함께 확인한다.

## 롤백

병합 전에는 기준점 `2e2ee90` 이후 AF02 커밋을 새 revert 커밋으로 역적용하고 검증한다. 병합 뒤에는 AF02 merge commit을 최신 `main` 기반 복구 브랜치에서 `git revert -m 1 <merge-commit>`으로 되돌린다. 강제 reset은 사용하지 않으며 manifest, 사용자 storage와 기존 스토어 배포물을 직접 수정하지 않는다.

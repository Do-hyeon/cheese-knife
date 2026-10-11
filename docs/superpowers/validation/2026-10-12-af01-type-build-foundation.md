# AF01 타입·빌드 기반 검증 기록

- 검증일: 2026-10-12 / Asia-Seoul
- 검증 코드 대상: `a581e03` (`codex/af01-type-build-foundation`)
- 증거 결속: 아래 clean archive 전체 회귀와 최종 도구 감사는 이 코드 커밋에서 실행했으며, 이후 커밋은 이 검증 기록만 갱신한다.
- 기준점: `81b35c97811901acd80e8a4a2d5b4e9be0ceba91` (`main`)
- 병합 결과: PR #5, merge commit `2e2ee90be0f9ba402fe12bbd6cf1bd556b0a607e`
- 환경: Windows x64, Node 24.19.0, Playwright 1.62.1, bundled Chromium 155.0.8059.39

## 결론

AF01의 로컬 구현·수용 조건을 충족했다. TypeScript와 esbuild는 제품 런타임 전환이 아닌 strict 계약 및 Chrome 실행 문맥 proof에만 도입했다. 16개 첫 번째 당사자 런타임 JavaScript는 source에서 `dist`로 byte 그대로 복사되며, pre-merge 검토에서 발견된 외부 reply 타입 과신을 닫기 위해 `settings-client.js`만 malformed-response validator를 추가하고 실행 hash를 명시적으로 전진시켰다. 나머지 15개 실행 hash와 정상 broker 응답 동작은 유지된다.

manifest, HTML, background 등록, 권한, host permission, 외부 통신과 사용자 데이터 계약은 변경하지 않았다. [PR #5](https://github.com/Do-hyeon/cheese-knife/pull/5)의 초기 공개 [GitHub Actions run 38157669495](https://github.com/Do-hyeon/cheese-knife/actions/runs/38157669495)와 최종 공개 [run 38157976040](https://github.com/Do-hyeon/cheese-knife/actions/runs/38157976040)에서 Windows·Ubuntu foundation과 Ubuntu 전체 verify가 모두 통과했고, merge commit `2e2ee90`으로 `main`에 병합됐다.

## 도구 계약

| 도구 | 고정 버전 | 라이선스 | AF01 사용 범위 |
| --- | --- | --- | --- |
| TypeScript | 7.0.2 | Apache-2.0 | `checkJs`, `strict`, `noEmit` 계약 proof |
| `@types/chrome` | 0.2.8 | MIT | Chrome MV3 API 타입 proof |
| esbuild | 0.28.2 | MIT | 네 실행 문맥의 IIFE·CSP·결정성 proof |

버전은 정확히 고정되며 `check:toolchain`이 패키지 메타데이터, 라이선스, package-owned JavaScript launcher와 선택된 optional companion의 실제 native binary를 regular file로 검사한다. 제품 `dist` 생성은 기존 파일 복사를 유지하고 esbuild 출력물을 포함하지 않는다.

## 자동 검증

| 게이트 | 결과 |
| --- | --- |
| clean archive 전체 Node 테스트 | Git archive와 물리적 `node_modules` 복사 환경에서 660 tests, 659 passed, 0 failed, 1 skipped |
| cold-start 회귀 보완 | CLI 인수를 Playwright import 전에 검증하고 병렬 suite의 프로세스 기동 guard만 5초에서 15초로 조정; 독립 실행과 clean archive 전체 suite 모두 통과 |
| private 감사 증거 검사 | 공개 checkout에 없는 비공개 원장 때문에 1 skipped; 공개 CI와 동일한 의도된 동작 |
| 공개 foundation CI | Ubuntu 19초, Windows 38초 모두 통과 |
| 공개 전체 verify CI | Ubuntu 3분 6초, 통과 |
| TypeScript strict proof | passed, `any`/`@ts-ignore`/emit 없음 |
| esbuild 실행 문맥 proof | 네 entry hash와 논리 graph hash 기준선 일치 |
| runtime JavaScript inventory | root·`web`·`styles`·`_locales`의 16개 파일 목록과 실행 토큰 hash 기준선 일치 |
| AF01 집중 계약 회귀 | 일반 로컬 권한에서 84 passed, 0 failed |
| 빌드·패키지 검사 | `dist` 빌드, v2.13.3, manifest 참조 20개 통과 |
| source→`dist` runtime JavaScript | 모든 제품 JavaScript byte 동일 |
| 객관 오디오 검사 | Chromium 155, full-scale 초과 0, 극단 설정 peak 0.980000019, 전환 기준선 일치 |
| positive 설치 E2E | 모든 report section passed, 61,858ms |
| negative 설치 E2E | 예상 오류 `main-runtime-missing`만 관측 |
| 도구 감사 | npm 0, Gitleaks 현재/Git 0, AF01 신규 ESLint 관측 0 |
| whitespace | `git -c core.safecrlf=false diff --check` 통과 |

이전 5초 제한 실패는 제품 오디오나 수치 결함이 아니라 병렬 전체 suite에서 새 Node 프로세스와 Playwright 모듈을 기동하는 시간이었다. CLI가 잘못된 인수를 브라우저 모듈 로드 전에 거부하도록 순서를 고쳤고, hang 검출용 제한만 15초로 늘렸다. 같은 clean archive의 전체 병렬 suite와 독립 CLI 회귀가 모두 통과했으므로 미해결 timing failure로 남기지 않는다.

## proof 기준선

- build entry hashes
  - background: `8a126025f9a99fec4622210abce1fae1d0a2b47297d443c00e284eb6e9451189`
  - extension page: `86d45ad218932418452f675e7a512b3bf149435469f2477fa3ba74498693065f`
  - isolated world: `b0cf050a0a116cdcba474a802ca23b13b0ad2e5a15f04417d96cfd86281bc1b7`
  - main world: `88b57045911eb5e765f72d10bd0c8a1cba7f26a2d693b0a309ab2e57463d8689`
- 논리 import graph: `aff9f9d5ef5dbc47b47c0d2b25ddee7b6ebc4197275b225d300347e91a56cedf`
- 논리 graph는 OS별 경로 구분자와 esbuild의 비계약 byte count를 제외한다.
- proof 출력의 인용 문자열에 환경 식별자가 독립 값이나 복합 문자열로 포함되면 거부한다. 1~2자 식별자는 영숫자·밑줄·하이픈 토큰 경계를 적용해 일반 단어의 부분 문자열 오탐을 제한한다.
- runtime executable 기준선은 `tests/fixtures/runtime-executable-baseline.json`에 파일별로 고정한다.
- `settings-client.js`는 malformed snapshot·patch CSS·reload reply를 거부하도록 `25ae1391e38782dcff2c58e75e5910df69591ea91b29a7426c07f0e772c23bc8`로 전진했다. 이전 baseline은 `ba9469653ace0fb7ee874c24933ce830d68f0efb65150ccb4a68dc4f8cc0f983`다.

## 제품·정책 불변성

- `manifest.json`, `popup.html`, `styles.html`, `permission.html`, `background.js`는 기준점과 동일하다.
- manifest 권한은 `scripting`, `storage`, host permission은 `https://chzzk.naver.com/*`로 유지된다.
- 새 네트워크 endpoint, telemetry, remote code, 저장 필드와 사용자 데이터 수집은 없다.
- Chrome callback은 `unknown`으로 받고 action별 snapshot·patch·reload shape를 검증한다. malformed 응답은 pending intent를 승인한 것으로 처리하지 않는다.
- `scripts/build.mjs`의 제품 영향은 금지 파일·source map·proof/types 누출 검사를 복사 뒤 추가한 것뿐이다.
- proof 결과와 TypeScript 선언은 `dist`에 들어가지 않는다.
- vendor HLS 원본은 `.gitattributes`에서 LF로 고정해 Windows checkout의 byte provenance 차이를 제거했다. vendor 코드는 수정하지 않았다.

## 감사 경계

최신 비공개 감사 보고서는 `output/tool-audit/run-2026-10-11T16-54-11-186Z-US1WOj`에 있다. ESLint 관측 7개는 기존 `scripts/owned-files.mjs`의 동적 파일 시스템 capability 경계이며, 각 호출 앞의 containment·link·type 검사를 유지한다. 감사 종료 상태 1은 이 guarded observation을 clean으로 위장하지 않기 위한 기존 계약이다.

비공개 warning ledger는 이전 source hash를 참조하므로 현재 작업 트리의 선택적 private 테스트에는 맞지 않는다. 공개 checkout과 CI에는 이 원장을 포함하지 않으며, AF01 코드가 새 경고를 추가하지 않았다는 판단은 최신 raw report와 변경 경로 대조에 한정한다.

## 설치 E2E 제한

- 디버그 세션이 worker를 계속 살려 두어 자연 idle suspension은 관측하지 못했다.
- bundled headless Chromium의 unpacked in-place reload는 worker를 다시 시작하지 않아 fresh context startup으로 context invalidation 경계를 검사했다.
- 실제 계정·쿠키·결제·연령 제한 콘텐츠, 스토어 자동 업데이트와 장시간 사용은 이 proof 범위가 아니다.

## 재현 명령

```powershell
pnpm dlx npm@12.2.0 ci
node --test tests/*.test.cjs
node scripts/check-toolchain.mjs
node scripts/check-runtime-inventory.mjs
node_modules/.bin/tsc.cmd -p tsconfig.af01.json
node scripts/check-build-proof.mjs
node scripts/build.mjs
node scripts/check-package.mjs dist
node scripts/check-audio-quality.mjs --chrome
node scripts/check-installed-extension.mjs
node scripts/check-installed-extension-negative.mjs
node scripts/tool-audit.mjs
git -c core.safecrlf=false diff --check
```

Windows에서 현재 shell에 `npm` shim이 없으면 위와 같이 `pnpm dlx npm@12.2.0`으로 lockfile 설치를 재현한다. 정상 `npm`이 있는 CI에서는 `npm ci`를 사용한다.

AF01을 병합 전에 되돌려야 하면 이 브랜치에서 `git revert --no-commit 81b35c9..HEAD`로 전체 AF01 범위를 역적용한 뒤 diff와 기존 게이트를 검토해 커밋한다. 병합 뒤에는 최신 `main` 기반 복구 브랜치에서 AF01 merge commit을 `git revert -m 1 <merge-commit>`으로 되돌린다. 두 경우 모두 강제 reset 대신 검토 가능한 revert 이력을 남긴다. 공개 스토어 항목과 기존 `2.13.3` 배포물은 이 브랜치만으로 변경되지 않는다.

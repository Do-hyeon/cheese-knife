# AF01 타입·빌드 기반 검증 기록

- 검증일: 2026-10-12 / Asia-Seoul
- 검증 대상: `a95d218` (`codex/af01-type-build-foundation`)
- 기준점: `81b35c97811901acd80e8a4a2d5b4e9be0ceba91` (`main`)
- 환경: Windows x64, Node 24.19.0, Playwright 1.62.1, bundled Chromium 155.0.8059.39

## 결론

AF01의 로컬 구현·수용 조건을 충족했다. TypeScript와 esbuild는 제품 런타임 전환이 아닌 strict 계약 및 Chrome 실행 문맥 proof에만 도입했다. 기존 16개 첫 번째 당사자 런타임 JavaScript는 그대로 배포되며, 주석을 제외한 실행 토큰의 기준 해시와 source→`dist` byte 동일성으로 제품 동작 불변을 보호한다.

manifest, HTML, background 등록, 권한, host permission, 외부 통신과 사용자 데이터 계약은 변경하지 않았다. 공개 CI의 Windows·Ubuntu 결과는 pull request에서 별도로 확인해야 하며, 이 문서는 아직 GitHub-hosted 결과를 통과로 간주하지 않는다.

## 도구 계약

| 도구 | 고정 버전 | 라이선스 | AF01 사용 범위 |
| --- | --- | --- | --- |
| TypeScript | 7.0.2 | Apache-2.0 | `checkJs`, `strict`, `noEmit` 계약 proof |
| `@types/chrome` | 0.2.8 | MIT | Chrome MV3 API 타입 proof |
| esbuild | 0.28.2 | MIT | 네 실행 문맥의 IIFE·CSP·결정성 proof |

버전은 정확히 고정되며 `check:toolchain`이 패키지 메타데이터, 라이선스, 설치 스크립트와 native optional package 경계를 검사한다. 제품 `dist` 생성은 기존 파일 복사를 유지하고 esbuild 출력물을 포함하지 않는다.

## 자동 검증

| 게이트 | 결과 |
| --- | --- |
| clean archive 전체 Node 테스트 | 최초 cold-start 실행 1 timing failure; 동일 archive 전체 재실행 651 passed, 0 failed, 1 skipped |
| 최초 실패 분석 | 물리적 `node_modules` 복사 직후 오디오 CLI cold-start가 5초 제한을 한 번 초과; 같은 전체 suite 재실행에서 통과, 제품·수치 실패 없음 |
| private 감사 증거 검사 | 공개 checkout에 없는 비공개 원장 때문에 1 skipped; 공개 CI와 동일한 의도된 동작 |
| TypeScript strict proof | passed, `any`/`@ts-ignore`/emit 없음 |
| esbuild 실행 문맥 proof | 네 entry hash와 논리 graph hash 기준선 일치 |
| runtime JavaScript inventory | 16개 파일의 파일 목록과 실행 토큰 hash 기준선 일치 |
| AF01 집중 계약 회귀 | 일반 로컬 권한에서 52 passed, 0 failed |
| 빌드·패키지 검사 | `dist` 빌드, v2.13.3, manifest 참조 20개 통과 |
| source→`dist` runtime JavaScript | 모든 제품 JavaScript byte 동일 |
| 객관 오디오 검사 | Chromium 155, full-scale 초과 0, 극단 설정 peak 0.980000019, 전환 기준선 일치 |
| positive 설치 E2E | 모든 report section passed, 61,783ms |
| negative 설치 E2E | 예상 오류 `main-runtime-missing`만 관측 |
| 도구 감사 | npm 0, Gitleaks 현재/Git 0, AF01 신규 ESLint 관측 0 |
| whitespace | `git -c core.safecrlf=false diff --check` 통과 |

전체 Node 테스트의 단일 cold-start 시간 초과는 같은 clean archive에서 즉시 재현되지 않았다. 이를 숨겨진 PASS로 바꾸지 않으며, CI에서 반복되면 시간 제한과 프로세스 기동 비용을 별도 결함으로 추적한다.

## proof 기준선

- build entry hashes
  - background: `8a126025f9a99fec4622210abce1fae1d0a2b47297d443c00e284eb6e9451189`
  - extension page: `86d45ad218932418452f675e7a512b3bf149435469f2477fa3ba74498693065f`
  - isolated world: `b0cf050a0a116cdcba474a802ca23b13b0ad2e5a15f04417d96cfd86281bc1b7`
  - main world: `88b57045911eb5e765f72d10bd0c8a1cba7f26a2d693b0a309ab2e57463d8689`
- 논리 import graph: `aff9f9d5ef5dbc47b47c0d2b25ddee7b6ebc4197275b225d300347e91a56cedf`
- 논리 graph는 OS별 경로 구분자와 esbuild의 비계약 byte count를 제외한다.
- runtime executable 기준선은 `tests/fixtures/runtime-executable-baseline.json`에 파일별로 고정한다.

## 제품·정책 불변성

- `manifest.json`, `popup.html`, `styles.html`, `permission.html`, `background.js`는 기준점과 동일하다.
- manifest 권한은 `scripting`, `storage`, host permission은 `https://chzzk.naver.com/*`로 유지된다.
- 새 네트워크 endpoint, telemetry, remote code, 저장 필드와 사용자 데이터 수집은 없다.
- `scripts/build.mjs`의 제품 영향은 금지 파일·source map·proof/types 누출 검사를 복사 뒤 추가한 것뿐이다.
- proof 결과와 TypeScript 선언은 `dist`에 들어가지 않는다.
- vendor HLS 원본은 `.gitattributes`에서 LF로 고정해 Windows checkout의 byte provenance 차이를 제거했다. vendor 코드는 수정하지 않았다.

## 감사 경계

최신 비공개 감사 보고서는 `output/tool-audit/run-2026-10-11T16-09-57-909Z-yLSTBK`에 있다. ESLint 관측 7개는 기존 `scripts/owned-files.mjs`의 동적 파일 시스템 capability 경계이며, 각 호출 앞의 containment·link·type 검사를 유지한다. 감사 종료 상태 1은 이 guarded observation을 clean으로 위장하지 않기 위한 기존 계약이다.

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

AF01을 되돌려야 하면 최신 `main` 기반 복구 브랜치에서 다음 커밋을 역순으로 `git revert`한다: `a95d218`, `e36ef12`, `57a9937`, `e8f3f79`, `907d7bf`, `01f215d`, `15ffb41`, `7a7fa77`. 공개 스토어 항목과 기존 `2.13.3` 배포물은 이 브랜치만으로 변경되지 않는다.

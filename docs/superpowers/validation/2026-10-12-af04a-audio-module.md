# AF04-A 오디오 모듈 이전 검증 기록

- 검증일: 2026-10-12 / Asia-Seoul
- 검증 코드 대상: `5bb3e9ac7c21db484f99a4fde9312a2d665423a0` (`codex/af04a-audio-module`)
- 증거 결속: 아래 전체 회귀·Chrome 검사·도구 감사는 이 제품 커밋에서 실행했으며, 이후 커밋은 이 기록과 계획 상태만 갱신한다.
- 기준점: `dfd5a59` (`origin/main`, AF04 설계 병합)
- 제품 범위: `dfd5a59..5bb3e9a`
- 환경: Windows x64, Node 24.19.0, Playwright 1.62.1, bundled Chromium 155.0.8059.39

## 결론

AF04-A의 로컬 구현·수용 조건을 충족했다. 수기 `web/audio.js`를 `src/main/features/audio/**`의 strict TypeScript graph로 옮기고, 기존 파일명·manifest 순서·classic IIFE·`cheese-knife.runtime.v1.audio` ABI를 결정적으로 생성한다. compressor, Gain, limiter, dry-path delay, media source 소유권과 사용자 동작은 바꾸지 않았다.

되돌릴 수 없는 `createMediaElementSource()` 전에 모든 graph node를 준비한다. pending `AudioContext.resume()` 뒤 OFF·video 교체·최종 pagehide를 다시 확인하며, resolve·reject·timeout 어느 경로에서도 최종 dispose 뒤 source 생성이나 status 재발행이 없다. BFCache persisted pagehide는 기존 요청 상태를 보존한다.

## 변경 구조

- 공개 계약: `src/main/features/audio/contracts.ts`
- 순수 계산: `src/main/features/audio/curve.ts`
- Web Audio 상태·수명주기: `src/main/features/audio/controller.ts`
- 설치 진입점: `src/main/features/audio/entry.ts`
- 저장소 포함 생성물: `web/audio.js`
- 생성·검사 진입점: `scripts/main-runtime.mjs`
- 배포 제외: `src/**`, TypeScript 설정, source map과 개발·감사 artifact

## 자동 검증

| 게이트 | 결과 |
| --- | --- |
| 공개 checkout 조건 전체 Node 테스트 | 단일 동시성에서 743 tests, 742 passed, 0 failed, 1 intentional skip |
| private 감사 증거 검사 | 공개 checkout에 없는 P02 원장은 의도대로 1 skipped; 두 비공개 파일은 `finally`에서 원위치 |
| TypeScript strict | 통과, no-emit |
| MAIN 생성 검사 | 세 파일 결정성·drift·read-only·CI write 거부와 audio graph 격리 통과 |
| settings 생성 검사 | 기존 세 파일 drift 검사 통과 |
| build proof | 네 실행 문맥과 논리 graph 기준선 일치 |
| runtime JavaScript inventory | 승인된 16개 파일과 실행 hash 기준선 일치 |
| build·package | `dist` build, Chrome MV3 v2.13.3, manifest 참조 20개 통과 |
| 객관 오디오 | Chromium 155, source/compressor 각 1, 모든 케이스 full-scale 초과 0, stress peak `0.9800000190734863` |
| sample-rate·전환 | 12 sample-rate 정렬 exact, 250/750/1000Hz Gain·enable 전환 기준선 일치 |
| positive 설치 E2E | run `installedmv4gyjhl0d51b1a8`, 63,536ms, 모든 section passed |
| negative 설치 E2E | run `installedmv4h01ki6e028c30`, 예상 오류 `main-runtime-missing`만 관측 |
| 도구 감사 | npm 0, Gitleaks 현재/Git 0, AF04-A 신규 ESLint 관측 0 |
| 독립 branch 검토 | 최종 `origin/main..5bb3e9a`에서 Critical/Important 0, 124 focused tests 통과 |
| whitespace | `git diff --check` 통과 |

## 생성·실행 해시

- `web/audio.js` byte SHA-256: `2a40978505eb18963c08485106f3c1c17dd7f8cfbc1cf148572d6521031c9ba8`
- `web/audio.js` Chrome 121 정규화 실행 SHA-256: `fdf323af91303c1635e1eb97681c2a0c17326c20c5f56c840e1c1af99d3fe4eb`
- 객관 오디오 보고서 SHA-256: `b18ece6589bd0559a5f3ffe0124afaad036b289193dfbba1e6311d1088d6797d`
- 도구 감사 요약 SHA-256: `01f57b7525ebc62df730d1176876e0fe7dd28483a648ad4a33c3a98bc8dfce65`

`.gitattributes`는 `src/main/features/audio/**/*.ts`와 `web/audio.js`를 LF로 고정한다. 생성물의 실행 hash만 기준선에서 갱신했고 runtime·site adapter를 포함한 다른 제품 계약은 바꾸지 않았다.

## 실패 격리와 수명주기

- delay, compressor, Gain, limiter node 준비가 실패하면 media source를 만들지 않아 native playback을 유지한다.
- 잘못되거나 접근 불가능한 `knifeGain`은 기존 기본값 1로 제한하며 재생을 중단하지 않는다.
- pending resume 중 OFF·선택 video 교체·최종 pagehide는 generation, identity, disposed 상태를 재검사한다.
- 최종 pagehide 중 resume resolve·reject·timeout은 모두 `off`로 조용히 끝나며 추가 source와 status event가 없다.
- persisted pagehide/pageshow는 compressor 요청과 출력 path를 보존한다.
- 같은 video의 player control remount는 graph를 재생성하지 않는다.
- subscriber 하나의 예외는 다른 subscriber 알림을 막지 않는다.
- 기존 foreign `runtime.audio`가 있거나 설치가 부분 실패하면 덮어쓰지 않는다.

## 권한·데이터·스토어 정책 불변성

- `manifest.json`, `package.json`, `package-lock.json`, `config.js`, `background.js`는 기준점과 byte 동일하다.
- permission, host permission, storage key, endpoint, remote code, packaged resource와 버전 변화가 없다.
- telemetry, analytics, 외부 전송, 사용자 데이터 수집·보존을 추가하지 않았다.
- source map과 TypeScript 원본은 Chrome package에 포함되지 않는다.
- 공개 기능과 설정 의미가 바뀌지 않아 개인정보처리방침·Chrome 웹 스토어 설명 변경은 필요하지 않다.

## 도구 감사 경계

최신 비공개 보고서는 `output/tool-audit/run-2026-10-11T23-45-08-490Z-tJLG6n`에 있다. 입력 전후 snapshot은 일치한다. ESLint 관측 7개는 기존 `scripts/owned-files.mjs`의 guarded 동적 파일 시스템 capability 경계 26, 27, 45, 74, 79, 94, 115행이며 AF04-A가 추가한 관측은 없다. 종료 상태 1은 이를 clean으로 위장하지 않는 기존 계약이다.

도구 감사는 보안 인증이 아니다. dependency advisory는 locally patched vendored HLS를 분석하지 않으며, 정적 pattern은 자동으로 실제 취약점 판정이 되지 않는다.

## 독립 검토와 보완

Astra max 독립 검토가 pending resume 도중 final pagehide 뒤 resolve 경로에서 source가 생성될 수 있는 수명주기 결함을 찾았다. `8596aed`에서 성공 경로를 막은 뒤 재검토가 reject·timeout catch의 늦은 `unavailable` 발행을 추가로 지적했다. 최종 `5bb3e9a`는 catch 진입 즉시 disposed 상태를 확인하고, resolve·reject 대조 테스트를 함께 고정했다.

최종 재검토에서 Critical/Important finding은 없었으며 merge-ready 판정이었다. 이는 검토와 정적·결정적 테스트 범위의 결과이며 보안 인증을 뜻하지 않는다.

## 설치 E2E와 제한

- fresh profile에서 팝업, storage, ISOLATED↔MAIN bridge, 손상 저장소 복구, 두 창 동시 설정, 원래 style 대상만 reload, 페이지별 runtime/audio 격리와 합성 persisted lifecycle을 통과했다.
- 디버그 세션이 worker를 살려 두어 자연 idle suspension은 관측하지 못했다.
- bundled headless Chromium의 unpacked in-place reload는 worker를 다시 시작하지 않아 fresh context startup으로 context invalidation 경계를 검사했다.
- 실제 계정·쿠키·결제·연령 제한 방송, 장시간 물리 출력, Chrome 웹 스토어 자동 업데이트는 AF04-A proof 범위가 아니다.

## 공개 PR과 병합

로컬 검증 시점에는 공개 PR·CI·병합 전이다. 한글 PR에서 Windows·Ubuntu foundation과 전체 verify가 모두 통과한 뒤에만 병합하고, 별도 상태 고정 변경에서 PR·CI·merge commit을 기록한다.

## 재현 명령

```powershell
node --test --test-concurrency=1 tests/*.test.cjs
node scripts/check-toolchain.mjs
node scripts/check-runtime-inventory.mjs
node node_modules/typescript/bin/tsc -p tsconfig.json
node scripts/settings-runtime.mjs
node scripts/main-runtime.mjs
node scripts/check-build-proof.mjs
node scripts/build.mjs
node scripts/check-package.mjs
node scripts/check-audio-quality.mjs --chrome
node scripts/check-installed-extension.mjs
node scripts/check-installed-extension-negative.mjs
node scripts/tool-audit.mjs
git diff --check
```

## 롤백

병합 전 제품 범위는 `dfd5a59..5bb3e9a`다. 병합 뒤에는 최신 `main` 기반 복구 브랜치에서 `git revert -m 1 <AF04-A merge commit>`을 실행하고 전체 게이트를 다시 검증한다. 강제 reset은 사용하지 않으며 manifest, 사용자 storage와 기존 스토어 배포물을 직접 수정하지 않는다.

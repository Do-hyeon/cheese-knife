# AF04-B 플레이어 모듈 이전 검증 기록

- 검증일: 2026-10-12 / Asia-Seoul
- 검증 코드 대상: `e1e359b5561c3b33f0322f4f874e9b5b89d44d50` (`codex/af04b-player-module`)
- 증거 결속: 아래 전체 회귀·Chrome 검사·도구 감사는 이 제품 커밋에서 실행했다. 이후 커밋은 이 기록과 계획 상태만 갱신한다.
- 기준점: `cbdc64b` (`origin/main`, AF04-A 상태 고정)
- 제품 범위: `cbdc64b..e1e359b`
- 환경: Windows x64, Node 24.19.0, Playwright 1.62.1, bundled Chromium 155.0.8059.39

## 결론

AF04-B의 로컬 구현·수용 조건을 충족했다. 수기 `web/player.js`를 `src/main/features/player/**`의 strict TypeScript graph로 옮기고, 기존 파일명·manifest 순서·classic IIFE·`cheese-knife.runtime.v1.player` ABI를 결정적으로 생성한다. 라이브 엣지, VOD 방향키 탐색, 길게 눌러 2배속, 통계, 컴프레서·Gain UI의 제품 의미는 바꾸지 않았다.

플레이어 마운트는 하나만 소유한다. 같은 영상의 네이티브 UI 교체는 오디오 graph를 유지하고, 선택 영상 자체가 바뀔 때만 이전 영상을 bypass한다. 최종 `pagehide`는 구독·전역 키·마운트 자원을 한 번만 정리하고, persisted 전환은 기존 상태를 유지한다. 플레이어 콜백의 예외는 `player` 상태로 제한해 다른 runtime subscriber를 막지 않는다.

## 변경 구조

- 공개 계약: `src/main/features/player/contracts.ts`
- seek range와 통계 snapshot: `src/main/features/player/seek.ts`
- 컨트롤·홀드·마운트 수명주기: `src/main/features/player/controls.ts`
- 설치 진입점: `src/main/features/player/entry.ts`
- 저장소 포함 생성물: `web/player.js`
- 생성·검사 진입점: `scripts/main-runtime.mjs`
- 배포 제외: `src/**`, TypeScript 설정, source map과 개발·감사 artifact

## 자동 검증

| 게이트 | 결과 |
| --- | --- |
| 공개 checkout 조건 전체 Node 테스트 | 단일 동시성에서 761 tests, 760 passed, 0 failed, 1 intentional skip |
| private 감사 증거 검사 | 공개 checkout에 없는 P02 원장은 의도대로 1 skipped; 두 비공개 파일은 `finally`에서 원위치, SHA-256 `f027a9e8a8c7b44df1a0d8104a7354c9c787a8f6b62b4f532131fb7bcd193dd8`·`4c312e3e66bb773470816779ef1868b4356b344f645a0efa44bc5e49ebc0401` 확인 |
| TypeScript strict | 통과, no-emit |
| MAIN 생성 검사 | 네 파일 결정성·drift·read-only·CI write 거부와 player graph 격리 통과 |
| settings 생성 검사 | 기존 세 파일 drift 검사 통과 |
| build proof | 네 실행 문맥과 논리 graph 기준선 일치 |
| runtime JavaScript inventory | 승인된 16개 파일과 실행 hash 기준선 일치 |
| build·package | `dist` build, Chrome MV3 v2.13.3, manifest 참조 20개 통과 |
| 객관 오디오 | Chromium 155, source/compressor 각 1, 모든 케이스 full-scale 초과 0, stress peak `0.9800000190734863` |
| AF04-A 오디오 비교 | 의도한 `web/player.js` artifact 해시만 변경, numeric/quality failure 0 |
| positive 설치 E2E | run `installedmv4i2xzld8c3fcc7`, 63,160ms, 모든 section passed |
| negative 설치 E2E | run `installedmv4i4gkd4fa7c108`, 예상 오류 `main-runtime-missing`만 관측 |
| 도구 감사 | npm 0, Gitleaks 현재/Git 0, AF04-B 신규 ESLint 관측 0 |
| Astra max 독립 branch 검토 | Critical/Important·Must/Should 0, 직접 집중 187/187 통과, Ship |
| whitespace | `git diff --check` 통과 |

## 생성·실행 해시

- `web/player.js` byte SHA-256: `14b16e9e5128dae8300e880c9e2cd2c6b10247b039071065d0a4f7d2e17910b8`
- `web/player.js` Chrome 121 정규화 실행 SHA-256: `e1c809db8c90368c3199c20a2ace88f95851d013f383c2ca30e59d9e16ff9835`
- AF04-B 객관 오디오 보고서 SHA-256: `1d9f8d8c16b2b849e8eb5de3f81d202030685ff6ec22c647a68fdaadb09a5882`
- 같은 환경에서 재측정한 AF04-A 보고서 SHA-256: `c942b5d5446f44690edf6e3687656f68a1247f2e9d49a931410fa0db8d9e5be5`
- 도구 감사 요약 SHA-256: `aa625669e1ca4e885618f481f40ac36950f02fe594f468fdd5fc26120628c019`

`.gitattributes`는 `web/player.js`를 LF로 고정한다. 생성물의 player 실행 hash만 기준선에서 갱신했고 runtime·site adapter·audio와 다른 배포 JavaScript hash는 바꾸지 않았다.

## 실패 격리와 수명주기

- 잘못되거나 빈 seekable range를 거부하고 buffered fallback, range gap, 앞·뒤 경계와 0.05초 live-edge reserve를 고정한다.
- 네이티브 컨트롤 자식 교체는 소유 컨트롤 하나를 복원하고 중복 listener를 만들지 않는다.
- 같은 video의 pzp/layout 교체는 compressor graph를 bypass하지 않는다. 선택 video 교체는 이전 video만 bypass한다.
- VOD hold의 옵션 OFF, pointer 교체·취소, route 변경은 원래 재생 속도·정지 상태와 capture를 복원한다.
- 최종 `pagehide`는 키보드 listener와 runtime subscription을 제거하며 반복 호출과 늦은 notify가 inert하다.
- persisted `pagehide`는 컨트롤과 단축키를 유지한다.
- 플레이어 subscriber 하나의 실패는 `runtime` 전체 실패로 승격되지 않고 다른 subscriber가 계속 호출된다.
- 닫힌 통계 overlay의 늦은 metrics promise는 DOM에 쓰지 않는다.

## 권한·데이터·스토어 정책 불변성

- `manifest.json`, `package.json`, `package-lock.json`, `config.js`, `background.js`는 기준점과 byte 동일하다.
- permission, host permission, storage key, endpoint, remote code, packaged resource와 버전 변화가 없다.
- telemetry, analytics, 외부 전송, 사용자 데이터 수집·보존을 추가하지 않았다.
- source map과 TypeScript 원본은 Chrome package에 포함되지 않는다.
- 공개 기능과 설정 의미가 바뀌지 않아 개인정보처리방침·Chrome 웹 스토어 설명 변경은 필요하지 않다.

## 도구 감사 경계

최신 비공개 보고서는 `output/tool-audit/run-2026-10-12T00-16-32-784Z-8Ja0vt`에 있다. 입력 전후 snapshot은 일치한다. ESLint 관측 7개는 기존 `scripts/owned-files.mjs`의 guarded 동적 파일 시스템 capability 경계 26, 27, 45, 74, 79, 94, 115행이며 AF04-B가 추가한 관측은 없다. 종료 상태 1은 이를 clean으로 위장하지 않는 기존 계약이다.

도구 감사는 보안 인증이 아니다. dependency advisory는 locally patched vendored HLS를 분석하지 않으며, 정적 pattern은 자동으로 실제 취약점 판정이 되지 않는다.

## 독립 검토

Astra max는 `origin/main...e1e359b`의 player diff뿐 아니라 runtime·audio 호출자, 생성 graph, 패키징, 권한·데이터 drift와 테스트를 읽기 전용으로 검토했다. 직접 집중 검사 187/187, MAIN 생성·strict typecheck·inventory·build proof·package를 통과했고 새 Critical/Important 또는 Must/Should finding 없이 `Ship`으로 판정했다.

검토자의 전체 재실행에서 비공개 원장의 이전 hash와 Windows junction `EBUSY` 두 건이 실패했다. 첫 항목은 공개 checkout 조건에서 원장을 제외한 이 문서의 761건 실행으로 분리했고, 둘째 항목은 같은 생성 검사를 집중 재실행해 통과했다. 제품 회귀로 합산하지 않는다.

## 설치 E2E와 제한

- fresh profile에서 팝업, storage, ISOLATED↔MAIN bridge, 손상 저장소 복구, 두 창 동시 설정, 원래 style 대상만 reload, 페이지별 runtime/audio 격리와 합성 persisted lifecycle을 통과했다.
- 디버그 세션이 worker를 살려 두어 자연 idle suspension은 관측하지 못했다.
- bundled headless Chromium의 unpacked in-place reload는 worker를 다시 시작하지 않아 fresh context startup으로 context invalidation 경계를 검사했다.
- 실제 계정·쿠키·결제·연령 제한 방송, 실서비스 포인터·실제 BFCache, 장시간 물리 출력과 Chrome 웹 스토어 자동 업데이트는 AF04-B proof 범위가 아니다.

## 공개 PR과 병합

로컬 수용과 독립 검토가 완료됐다. 한글 PR과 공개 Windows·Ubuntu foundation, 전체 verify가 모두 통과하기 전에는 병합하지 않는다. 공개 PR·CI·merge 정보는 상태 고정 커밋에서 이 절에 추가한다.

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
node scripts/check-package.mjs dist
node scripts/check-audio-quality.mjs --chrome
node scripts/check-installed-extension.mjs
node scripts/check-installed-extension-negative.mjs
node scripts/tool-audit.mjs
git -c core.safecrlf=false diff --check
```

## 롤백

제품 범위는 `cbdc64b..e1e359b`다. 공개 병합 뒤에는 최신 `main` 기반 복구 브랜치에서 해당 merge commit을 `git revert -m 1`로 되돌리고 전체 게이트를 다시 검증한다. 강제 reset은 사용하지 않으며 manifest, 사용자 storage와 기존 스토어 배포물을 직접 수정하지 않는다.

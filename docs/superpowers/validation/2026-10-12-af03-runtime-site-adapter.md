# AF03 MAIN runtime·site adapter 분리 검증 기록

- 검증일: 2026-10-12 / Asia-Seoul
- 검증 코드 대상: `f125daf4fc535fa6ce684c23be442d0387bcc593` (`codex/af03-runtime-adapter-design`)
- 증거 결속: 아래 전체 회귀·Chrome 검사·도구 감사는 이 코드 커밋에서 실행했으며, 이후 커밋은 이 검증 기록과 계획 상태만 갱신한다.
- 기준점: `5060fb9e347ef6a5ea5575cfa6ebc073d294e9ae` (`main`, AF02 상태 고정)
- 환경: Windows x64, Node 24.19.0, Playwright 1.62.1, bundled Chromium 155.0.8059.39

## 결론

AF03의 로컬 구현·수용 조건을 충족했다. `web/runtime.js`와 `web/site-adapter.js`의 수기 원본을 `src/main/**`의 strict TypeScript graph로 옮겼고, 기존 파일명·classic script 실행·`cheese-knife.runtime.v1` ABI를 결정적으로 생성한다. 일반 검사·빌드·후보 생성은 source tree를 고치지 않고 stale 생성물을 거부하며, 명시적 write 명령만 두 산출물을 갱신한다.

route, scope, status, config bridge와 수명주기는 runtime graph에 있고, CHZZK DOM selector·React fiber·controller 접근은 site adapter graph에 격리했다. feature caller에는 primitive snapshot과 identity-checked operation만 제공한다. manifest, 권한, host permission, 저장 계약, 외부 통신, 버전과 패키지 리소스 집합은 넓어지지 않았다.

## 변경 구조

- runtime 원본: `src/main/runtime/{route,scope,status,bridge,lifecycle,entry,contracts}.ts`
- site adapter 원본: `src/main/site-adapter/{react,discovery,capabilities,entry,contracts}.ts`
- 저장소 포함 생성물: `web/runtime.js`, `web/site-adapter.js`
- 생성·검사 진입점: `scripts/main-runtime.mjs`, 공통 classic guard `scripts/generated-runtime.mjs`
- read-only gate: 일반 build, candidate 검증, runtime inventory, Windows·Ubuntu foundation CI
- 배포 제외: `src/**`, `*.ts`, TypeScript 설정, source map과 개발 도구

## 자동 검증

| 게이트 | 결과 |
| --- | --- |
| 공개 checkout 조건 전체 Node 테스트 | 단일 동시성에서 724 tests, 723 passed, 0 failed, 1 intentional skip |
| private 감사 증거 검사 | 공개 checkout에 없는 P02 원장은 의도대로 1 skipped; 실행 후 두 비공개 파일 원위치·크기 확인 |
| TypeScript strict | 통과, no-emit |
| MAIN 생성 검사 | 두 파일 결정성·drift·read-only·CI write 거부·runtime/adapter graph 분리 통과 |
| settings 생성 검사 | 기존 세 파일 drift 검사 통과 |
| build proof | 네 실행 문맥과 논리 graph 기준선 일치 |
| runtime JavaScript inventory | 승인된 16개 파일과 실행 hash 기준선 일치 |
| build·package | `dist` build, v2.13.3, manifest 참조 20개 통과 |
| 객관 오디오 | Chromium 155, source/compressor 각 1, full-scale 초과 0, stress peak `0.980000019`, 12 sample-rate 정렬 및 250/750/1000Hz 전환 기준선 일치 |
| positive 설치 E2E | run `installedmv47riypde0b87d0`, 63,258ms, 모든 section passed |
| negative 설치 E2E | run `installedmv47szkj3bda7be1`, 예상 오류 `main-runtime-missing`만 관측 |
| 도구 감사 | npm 0, Gitleaks 현재/Git 0, AF03 신규 ESLint 관측 0 |
| 독립 전체 branch 검토 | 최종 `5060fb9...f125daf`에서 Critical/Important 0, 282 focused tests 통과 |
| whitespace | `git diff --check` 통과 |

전체 병렬 실행에서 HLS 이중 재생성 1건이 aggregate 자원 경합으로 한 번 실패했다. 같은 HLS verifier 단독 실행 6/6과 전체 `--test-concurrency=1` 실행에서는 통과했으므로 제품 회귀로 분류하지 않았다.

## 생성·실행 해시

최종 생성 JavaScript byte SHA-256:

- `web/runtime.js`: `20499809c68c6ff889061b3a1ae17d75ab6a7443de34617d892046326f8634c6`
- `web/site-adapter.js`: `8343c7026ed259b023403055acb25a5d4c50b26380506a1ba2b31ae4fcc1df43`

Chrome 121 정규화 실행 SHA-256:

- `web/runtime.js`: `7d965f3deedf55d9d0b3e7edf6e3922c7774e97402c477499b225bcd5ebd5cd2`
- `web/site-adapter.js`: `766b20895ca8cfe58217afceb6d7cd566ac9407e0398f05aaf847db3ffbf1ae7`

`.gitattributes`는 `src/main/**/*.ts`와 두 생성물을 LF로 고정한다. `core.autocrlf=true` clean checkout에서도 생성 byte 비교가 유지되는지 독립 검토에서 확인했다.

## 제품·개인정보·스토어 정책 불변성

- `manifest.json`은 기준점과 byte 동일하다. 권한은 `scripting`, `storage`, host permission은 `https://chzzk.naver.com/*`로 유지된다.
- `package.json` 변화는 `generate:main`, `check:main-runtime` 두 로컬 스크립트뿐이다. dependency와 lockfile 변화는 없다.
- 새 storage key, 외부 endpoint, telemetry, analytics, remote code, 사용자 데이터 수집·전송은 없다.
- 추가된 `eval`, `new Function`, 원격 dynamic import 문자열은 generator 음성 대조 테스트에만 있고 제품 경로에는 없다.
- packaged resource는 기존 20개이며 TypeScript 원본, source map과 개발·감사 artifact는 포함하지 않는다.
- 공개 기능, 권한, 개인정보처리방침과 Chrome 웹 스토어 설명 변경은 필요하지 않다.

## 사이트 경계와 소유권

- 외부 React/controller 값은 own data descriptor만 읽고 300/300/100 traversal, message 10,000개, event 256개, text/content 길이 상한을 적용한다.
- accessor·Proxy·cycle·thenable·교체된 list/client와 foreign callback은 실패 폐쇄적으로 처리하되 native callback의 receiver·return을 보존한다.
- 삭제 채팅의 status 교체는 exact array slot identity를 확인하고 한 슬롯만 쓰며, native update 실패·thenable에서는 exact replacement만 롤백한다.
- 같은 client의 event array 교체와 copied callback은 재연결 또는 dispose에서 exact identity만 복원하며 foreign handler는 덮어쓰지 않는다.
- 늦게 생성되는 layout/sidebar/player/license 내부 변경은 adapter가 mutation 의미를 판정하고 runtime은 site selector를 알지 않는다.

## 도구 감사 경계

최신 비공개 감사 보고서는 `output/tool-audit/run-2026-10-11T19-27-41-689Z-fylytr`에 있다. npm audit와 Gitleaks 현재 파일·전체 Git 이력은 0건이다. ESLint 관측 7개는 기존 `scripts/owned-files.mjs`의 guarded 동적 파일 시스템 capability 경계 26, 27, 45, 74, 79, 94, 115행이며 AF03 신규 관측은 없다. 종료 상태 1은 이를 clean으로 위장하지 않는 기존 계약이다.

도구 감사는 보안 인증이 아니다. locally patched HLS는 별도의 pinned vendoring·두 번 재생성·parser/MP4/ID3 경계 회귀로 검사했다.

## 독립 branch 검토

전체 `main..AF03` diff를 독립 검토하고 재현된 Important 5건과 Minor 3건을 보완했다.

- 늦은 site root/control mutation, same-client blind listener ownership, accessor/deep thenable, bounded Array Proxy와 Windows LF checkout 회귀를 `6104e3f`에서 보완했다.
- 기존 `#license` 내부 삽입, Proxy one-slot write/rollback, reconnect 전 copied callback dispose 잔여를 `f125daf`에서 보완했다.
- 누락 live timestamp epoch 표시, config retry timer 중복, raw adapter direct/merge publication gate도 함께 고정했다.

최종 불변 커밋 재검토에서 남은 Critical/Important finding은 없었다. 이는 검토와 정적·결정적 테스트 범위의 결과이며 보안 인증을 뜻하지 않는다.

## 설치 E2E와 로컬 증거 제한

- 다중 창, 서로 다른 필드의 동시 설정, styles 원래 대상 탭만 reload, 한 창 종료 뒤 다른 창 격리, BFCache persisted lifecycle을 통과했다.
- 디버그 세션이 worker를 살려 두어 자연 idle suspension은 관측하지 못했다.
- bundled headless Chromium의 unpacked in-place reload는 worker를 다시 시작하지 않아 fresh context startup으로 context invalidation 경계를 검사했다.
- 실제 계정·쿠키·결제·연령 제한 콘텐츠, Chrome 웹 스토어 자동 업데이트, 장시간 실제 사이트 사용과 물리 오디오 출력은 AF03 proof 범위가 아니다.

## 공개 PR과 병합

한글 PR, 공개 Windows/Ubuntu CI와 병합 정보는 아직 없다. 이 문서는 로컬 수용 증거를 먼저 고정하며, 공개 CI 통과·병합 뒤 후속 문서 커밋으로 PR 번호, CI run과 merge commit을 기록한다.

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

`tool-audit`의 종료 상태 1은 위 7개 guarded observation을 보존한 결과다. 상세 판정은 생성된 `summary.json`의 도구별 상태와 catalog를 함께 확인한다.

## 롤백

병합 전에는 기준점 `5060fb9` 이후 AF03 커밋을 새 revert 커밋으로 역적용하고 검증한다. 병합 뒤에는 AF03 merge commit을 최신 `main` 기반 복구 브랜치에서 `git revert -m 1 <merge-commit>`으로 되돌린다. 강제 reset은 사용하지 않으며 manifest, 사용자 storage와 기존 스토어 배포물을 직접 수정하지 않는다.

# AF04-C 미리보기 모듈 이전 검증 기록

- 검증일: 2026-10-12 / Asia-Seoul
- 검증 코드 대상: `0ebc970` (`codex/af04c-preview-module`)
- 기준점: `fa2dd9c` (`origin/main`, AF04-B 상태 고정)
- 제품 범위: `fa2dd9c..0ebc970`
- 환경: Windows x64, Node 24.19.0, Playwright 1.62.1, bundled Chromium 155.0.8059.39

## 결론

AF04-C의 로컬 구현과 수용 조건을 충족했다. 수기 `web/preview.js`를 `src/main/features/preview/**`의 strict TypeScript graph로 옮기고, 기존 파일명·manifest 순서·classic IIFE·`cheese-knife.runtime.v1.preview` ABI를 결정적으로 생성한다.

같은 origin의 32자리 live URL, 기존 live-detail endpoint, `credentials:'include'`, 요청 timeout·cache TTL·상한, hover delay, HLS buffer·복구·startup 상한, 미리보기 볼륨·음소거 정책을 유지했다. 새 권한·endpoint·저장·외부 전송·원격 코드는 추가하지 않았다.

Astra max 독립 검토가 실제 `DOMException('NotAllowedError')`의 prototype `name`을 own-data 검사로 놓치는 Important 회귀를 찾았다. 실제 DOMException 회귀 검사를 RED→GREEN으로 고치고, 무상호작용 자동재생 거부가 한 번의 muted fallback으로 이어지는 것을 Chromium에서 다시 확인했다. 함께 발견한 기존 autoplay proof의 site-adapter 누락도 제품 로드 순서대로 복구했다.

## 변경 구조

- 공개 계약: `src/main/features/preview/contracts.ts`
- 패널 DOM·배치·진단: `src/main/features/preview/panel.ts`
- HLS·media·오디오 정책·복구: `src/main/features/preview/playback.ts`
- URL·응답·cache·intent·수명주기: `src/main/features/preview/entry.ts`
- 저장소 포함 생성물: `web/preview.js`
- 생성·검사 진입점: `scripts/main-runtime.mjs`
- 배포 제외: `src/**`, TypeScript 설정, source map과 개발·감사 artifact

## 자동 검증

| 게이트 | 결과 |
| --- | --- |
| 공개 checkout 조건 전체 Node 테스트 | 단일 동시성에서 777 tests, 776 passed, 0 failed, 1 intentional skip |
| private 감사 증거 검사 | 공개 checkout에 없는 P02 원장은 의도대로 1 skipped; 두 비공개 파일은 `finally`에서 원위치, SHA-256 `f027a9e8a8c7b44df1a0d8104a7354c9c787a8f6b62b4f532131fb7bcd193dd8`·`4c312e3e66bb773470816779ef1868b4356b344f645a0efaf44bc5e49ebc0401` 확인 |
| preview·HLS 집중 검사 | Task 3에서 216/216 통과; 최종 전체 suite에서 실제 DOMException 검사와 동일 HLS provenance·hardening·negative controls 재통과 |
| TypeScript strict | 통과, no-emit |
| MAIN 생성 검사 | 다섯 파일 결정성·drift·read-only·CI write 거부와 preview graph 격리 통과 |
| settings 생성 검사 | 기존 세 파일 drift 검사 통과 |
| build proof | 네 실행 문맥과 논리 graph 기준선 일치 |
| runtime JavaScript inventory | 승인된 16개 파일과 실행 hash 기준선 일치 |
| build·package | `dist` build, Chrome MV3 v2.13.3, manifest 참조 20개 통과 |
| Chromium preview autoplay | 3/3 통과: 한국어·영어 무상호작용 muted fallback/안내/실제 우클릭 해제, 상호작용 비음소거 시작 |
| 객관 오디오 | Chromium 155, source/compressor 각 1, 모든 케이스 full-scale 초과 0, stress peak `0.9800000190734863` |
| positive 설치 E2E | run `installedmv4k515094b2c1d2`, 62,989ms, 모든 section passed |
| negative 설치 E2E | run `installedmv4k6k5a6d011f53`, 예상 오류 `main-runtime-missing`만 관측 |
| 도구 감사 | npm 0, Gitleaks 현재/Git 0, AF04-C 신규 ESLint 관측 0 |
| Astra max 독립 branch 검토 | Critical 0, Important 1; 실제 DOMException muted fallback 회귀를 RED→GREEN으로 보완하고 전체 suite 통과 |
| whitespace | `git -c core.safecrlf=false diff --check` 통과 |

## 생성·실행 해시

- `web/preview.js` byte SHA-256: `64cb42e1e61457e2ae56fa73d866924405ad012a875ea17d51ee9b51a0b4d5b2`
- `web/preview.js` Chrome 121 정규화 실행 SHA-256: `9041cb92052d082a162b6d6d172fa994f1fdedd0d807f34f8d3a0232080aff39`
- 객관 오디오 보고서 SHA-256: `688011f8bda0191168b8f43112b66c4b9fc8bae9943351b2ee5307516007488b`
- 최종 도구 감사 요약 SHA-256: `514344ee4e8c35cb418892f1d13042660aa073832ce4704db12f2ce4a6b26f2f`

`.gitattributes`는 `web/preview.js`를 LF로 고정한다. 생성물의 preview 실행 hash만 기준선에서 갱신했고 runtime·site adapter·audio·player와 다른 배포 JavaScript hash는 바꾸지 않았다.

## 요청·데이터 경계

- 같은 origin의 `/live/<32-hex>`만 live-detail 요청으로 바꾼다.
- 요청은 기존 `https://api.chzzk.naver.com/service/v3.3/channels/<id>/live-detail`과 `credentials:'include'`를 유지한다.
- 응답은 own data descriptor인 code/content/status/adult/openDate/image/playback 필드만 읽고 accessor를 실행하지 않는다.
- playback JSON은 1 MiB 이하, media는 앞 128개만 검사하고 HTTPS path와 이미지 URL만 허용한다.
- OPEN cache 30초, 그 외 5초, 최대 100개와 5초 요청 abort를 유지한다.
- 진단에는 bounded reason·codec·재생 수치만 남기며 stream URL, 응답 payload, cookie와 error object를 기록하지 않는다.
- 401/403, playback 부재와 인증되지 않은 제한 콘텐츠는 우회하지 않고 limited로 종료한다.

## 비동기 소유권과 수명주기

- fetch·play·manifest·복구·progress callback은 generation, intent, session token, anchor, href, route, sidebar owner, config, visibility, panel 연결 상태를 다시 확인한다.
- panel 제거, route·sidebar·href 변경, 옵션 OFF, visibility hidden은 현재 stream만 정리한다.
- persisted pagehide는 stream과 panel을 정리하되 controller를 유지하고, 최종 pagehide 반복은 owner scope와 runtime property를 한 번만 정리한다.
- timer, AbortController, HLS backend와 media element는 session disposer가 소유하며 늦은 completion은 다음 hover 상태를 바꾸지 못한다.
- runtime status sink가 예외를 던져도 preview setup·cleanup과 다른 기능의 수명주기를 막지 않는다.

## 자동재생 정책 보완

초기 TypeScript 이전은 untrusted response용 own-data helper를 `video.play()` 오류에도 재사용해 실제 DOMException의 prototype `name`을 놓쳤다. 그 결과 브라우저가 소리만 거부해도 음소거 재생 대신 stream 전체가 종료됐다.

수정은 같은 window의 `DOMException`에 한해 표준 `name`을 읽고, 그 외 값은 기존 own-data 검사만 유지한다. `NotAllowedError`일 때만 원래 audio revision과 hover의 1회 fallback budget을 소비한다. 다른 오류, 수동 재생, 늦은 거부와 다음 hover에는 fallback을 부여하지 않는다.

`scripts/check-preview-autoplay.mjs`는 production과 같은 runtime → site adapter → config → preview 순서를 사용한다. 새 합성 Chrome context, 로컬 fulfill한 무음 WAV와 실제 media policy·시간 진행·CDP 우클릭만 사용하며 사용자 profile, 계정, 실방송, 녹음과 정책 우회를 사용하지 않는다.

## 권한·스토어 정책 불변성

- `manifest.json`, `package.json`, `package-lock.json`, `config.js`, `background.js`는 기준점과 byte 동일하다.
- permission, host permission, storage key, endpoint, remote code, packaged resource와 버전 변화가 없다.
- telemetry, analytics, 외부 전송, 사용자·채팅·시청 데이터의 새 수집·보존을 추가하지 않았다.
- source map과 TypeScript 원본은 Chrome package에 포함되지 않는다.
- 공개 기능과 설정 의미가 바뀌지 않아 개인정보처리방침·Chrome 웹 스토어 설명 변경은 필요하지 않다.

## 도구 감사 경계

최신 비공개 보고서는 `output/tool-audit/run-2026-10-12T01-14-10-163Z-teKiw2`에 있다. 입력 전후 snapshot은 일치한다. ESLint 관측 7개는 기존 `scripts/owned-files.mjs`의 guarded 동적 파일 시스템 capability 경계 26, 27, 45, 74, 79, 94, 115행이며 AF04-C가 추가한 관측은 없다. 종료 상태 1은 이를 clean으로 위장하지 않는 기존 계약이다.

도구 감사는 보안 인증이 아니다. dependency advisory는 locally patched vendored HLS를 분석하지 않으며, 정적 pattern은 자동으로 실제 취약점 판정이 되지 않는다.

## 독립 검토

Astra max는 `fa2dd9c..5fca47d`의 preview diff, runtime·adapter·inject 호출자, 생성·패키지 경계와 테스트를 읽기 전용으로 검토했다. Critical은 없었고 Important 1건으로 실제 DOMException 자동재생 거부 회귀를 직접 재현했다. 동일 조건의 base는 `[unmuted, muted]` 후 ready였지만 검토 시점 head는 unmuted 한 번 뒤 limited와 HLS destroy로 끝났다.

수정 패스에서 실제 DOMException 검사를 실패시킨 뒤 표준 DOMException만 안전하게 판별하도록 바꿨고, 검사는 `[false, true]`, backend destroy 0, ready로 통과했다. 이어 전체 777건, Chromium preview autoplay 3/3, 생성·strict·package, 설치형 positive/negative E2E와 도구 감사를 재실행했다. Minor finding과 미판정 사용자 영향 항목은 없었다.

## 설치 E2E와 제한

- fresh profile에서 팝업, storage, ISOLATED↔MAIN bridge, 손상 저장소 복구, 두 창 동시 설정, 원래 style 대상만 reload, 페이지별 runtime/audio 격리와 합성 persisted lifecycle을 통과했다.
- Chromium autoplay proof는 실제 media policy와 우클릭을 사용하지만 로컬 무음 WAV와 native backend fixture이며 실제 HLS·계정·청취 출력 검사는 아니다.
- 디버그 세션이 worker를 살려 두어 자연 idle suspension은 관측하지 못했다.
- bundled headless Chromium의 unpacked in-place reload는 worker를 다시 시작하지 않아 fresh context startup으로 context invalidation 경계를 검사했다.
- 실제 계정·쿠키·결제·연령 제한 방송, DRM, 실서비스 HLS 품질, 실제 BFCache, 장시간 물리 출력과 Chrome 웹 스토어 자동 업데이트는 AF04-C proof 범위가 아니다.

## 공개 PR과 병합

- 한글 PR: 대기
- 공개 Windows/Ubuntu foundation·전체 verify: 대기
- 병합·상태 고정: 대기

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
node scripts/check-preview-autoplay.mjs
node scripts/check-audio-quality.mjs --chrome
node scripts/check-installed-extension.mjs
node scripts/check-installed-extension-negative.mjs
node scripts/tool-audit.mjs
git -c core.safecrlf=false diff --check
```

## 롤백

제품 범위는 `fa2dd9c..0ebc970`이다. 병합 전에는 이 branch를 배포하지 않는다. 병합 뒤 문제가 발견되면 최신 `main` 기반 복구 branch에서 AF04-C merge commit 하나를 `git revert -m 1 <AF04-C merge commit>`로 되돌리고 전체 gate를 다시 검증한다. 강제 reset은 사용하지 않으며 manifest, 사용자 storage와 기존 스토어 배포물을 직접 수정하지 않는다. 정확한 merge commit과 공개 CI는 상태 고정 PR에서 이 문서에 추가한다.

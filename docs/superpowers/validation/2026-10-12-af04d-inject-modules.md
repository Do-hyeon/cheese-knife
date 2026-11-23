# AF04-D inject 모듈 이전 검증 기록

- 검증일: 2026-10-12 / Asia-Seoul
- 검증 코드 대상: `09d2b397b85af622bb8266d0ea555c43d408d101` (`codex/af04d-inject-modules`)
- 증거 결속: 아래 전체 회귀·Chromium 검사·도구 감사는 이 제품 커밋에서 실행했다. 이후 커밋은 이 기록과 계획 상태만 갱신한다.
- 기준점: `1e95bc1403b2c38b77aad1a00995336687a8b3b5` (`main`, AF04-C 상태 고정)
- 제품 범위: `1e95bc1..09d2b39`
- 환경: Windows x64, Node 24.19.0, Playwright 1.62.1, bundled Chromium 155.0.8059.39

## 결론

AF04-D의 로컬 구현과 수용 조건을 충족했다. 수기 `web/inject.js`의 chat, sidebar, popup, page decoration과 coordinator 책임을 `src/main/features/inject/**`의 strict TypeScript graph로 나눴다. 기존 파일명·manifest 순서·classic IIFE와 단일 coordinator 배포 계약은 유지한다.

기능별 실패는 다른 기능의 reconcile을 막지 않고, owner 교체·제외 경로·최종 pagehide가 각 자원을 한 번만 정리한다. 권한·endpoint·저장 키·외부 전송·원격 코드·패키지 리소스 수는 바뀌지 않았다.

Astra max 독립 검토가 제외 경로 뒤 팔로잉 자동 펼침 상태와 교체된 VOD 카드의 늦은 metadata 응답에서 Important 회귀 2건을 재현했다. 같은 fixture를 RED로 고정하고, owner 없는 설정·경로 동기화와 무효화된 요청 취소를 최소 보완했다. 후속 검토는 두 finding 해소와 추가 Important/Blocker 없음, `Ship`을 판정했다.

## 변경 구조

- 계약: `src/main/features/inject/contracts.ts`
- 채팅 크기·timestamp·후원 필터·삭제 표시: `src/main/features/inject/chat.ts`
- 사이드바 section·갱신·팔로잉 settlement·미리보기 anchor: `src/main/features/inject/sidebar.ts`
- popup URL 검증·drag·iframe 수명주기: `src/main/features/inject/popup.ts`
- home/channel/banner·방송 시작 시각: `src/main/features/inject/page.ts`
- 순차 reconcile·owner generation·실패 격리: `src/main/features/inject/coordinator.ts`
- 생성 진입점: `src/main/features/inject/entry.ts`
- 저장소 포함 생성물: `web/inject.js`
- 배포 제외: `src/**`, TypeScript 설정, source map과 개발·감사 artifact

## 자동 검증

| 게이트 | 결과 |
| --- | --- |
| 공개 checkout 조건 전체 Node 테스트 | 단일 동시성에서 799 tests, 798 passed, 0 failed, 1 intentional skip |
| private 감사 증거 검사 | 공개 checkout에 없는 P02 원장은 의도대로 1 skipped; 두 비공개 파일은 `finally`에서 원위치, SHA-256 `f027a9e8a8c7b44df1a0d8104a7354c9c787a8f6b62b4f532131fb7bcd193dd8`·`4c312e3e66bb773470816779ef1868b4356b344f645a0efaf44bc5e49ebc0401` 확인 |
| AF04-D 집중 검사 | adapter·inject·통합·팔로잉·삭제 채팅·preview·다중 페이지·생성·package·inventory 321/321 통과 |
| TypeScript strict | 통과, no-emit |
| MAIN 생성 검사 | 여섯 파일 결정성·drift·read-only·CI write 거부와 inject graph 격리 통과 |
| settings 생성 검사 | 기존 세 파일 drift 검사 통과 |
| build proof | 네 실행 문맥과 논리 graph 기준선 일치 |
| runtime JavaScript inventory | 승인된 16개 파일과 실행 hash 기준선 일치 |
| build·package | `dist` build, Chrome MV3 v2.13.3, manifest 참조 20개 통과 |
| 객관 오디오 | Chromium 155, 모든 케이스 full-scale 초과 0, stress peak `0.9800000190734863`, 250/750Hz 전환 지표 baseline 일치 |
| positive 설치 E2E | run `installedmv4mb242df66e5dd`, 63,262ms, 다중 창·설정 병합·style 대상·runtime 격리·합성 BFCache 포함 모든 section 통과 |
| negative 설치 E2E | run `installedmv4mcjqzdefa85a4`, 예상 오류 `main-runtime-missing`만 관측 |
| 도구 감사 | npm 0, Gitleaks 현재/Git 0, AF04-D 신규 ESLint 관측 0 |
| Astra max 독립 branch 검토 | Important 2건 재현·보완, 후속 검토에서 추가 Important/Blocker 0, `Ship` |
| whitespace | `git -c core.safecrlf=false diff --check` 통과 |

## 생성·실행 해시

- `web/inject.js` byte SHA-256: `fa842b35fa272d455510816c57d781388b1d0694074ce88012eeae52536c8f09`
- `web/inject.js` Chrome 121 정규화 실행 SHA-256: `99c08685908ea23202eeed03266723184606664e0d5482e375214bf02837505b`
- 객관 오디오 보고서 SHA-256: `b9061e7b673f45ceee933fbab911c9159985d690cc22c73f062e8b496410178c`
- 최종 도구 감사 요약 SHA-256: `266f388a263e9c3e0ee140f08fc168deb4e0384a7b7de4f22b4f4f2a9532c08c`

`.gitattributes`는 `web/inject.js`를 LF로 고정한다. runtime JavaScript inventory는 16개, Chrome package의 manifest 진입 리소스는 20개로 유지됐다.

## 순서·소유권·실패 격리

- coordinator는 config/i18n snapshot, detached popup 정리, 제외·미준비 상태, owner 교체, page mount, sidebar, channel, chat, banner 순서로 reconcile한다.
- 각 feature 호출은 독립 실패 경계를 가지며 status sink·chat lookup·preview callback·popup 생성·owner dispose 한 곳의 예외가 뒤 기능을 막지 않는다.
- 사이드바 설정과 route epoch는 owner가 없는 제외 화면에서도 갱신된다. 같은 live 복귀와 제외 화면의 OFF→ON 변경은 각각 한 번만 새 settlement를 허용한다.
- chat·sidebar observer, refresh·settlement timer와 popup drag listener는 현재 owner만 소유한다. final pagehide는 구독과 feature 자원을 한 번만 정리하고, persisted pagehide는 복귀 가능한 runtime을 유지한다.
- popup은 같은 origin의 `/live/<32-hex>`만 허용한다. preview와 popup callback은 현재 anchor·href·owner를 다시 확인한다.
- VOD 시작 시각 요청은 기존 endpoint·`credentials:'include'`·5초 timeout·30분/100개 cache를 유지한다. 카드의 trusted link가 교체되면 pending 요청을 취소·제거해 늦은 응답이 새 카드에 쓰이지 못한다.
- deleted chat은 기존 native dispatch, identity, accessor·thenable 거부와 owned marker 복원을 유지한다.

## 권한·데이터·스토어 정책 불변성

- `manifest.json`, `package.json`, `package-lock.json`, `config.js`, `background.js`는 기준점과 byte 동일하다.
- permission, host permission, storage key, endpoint, remote code, packaged resource와 버전 변화가 없다.
- telemetry, analytics, 외부 전송, 사용자·채팅·시청 데이터의 새 수집·보존을 추가하지 않았다.
- source map과 TypeScript 원본은 Chrome package에 포함되지 않는다.
- 공개 기능·설정 의미와 Chrome 지원 범위가 바뀌지 않아 개인정보처리방침·Chrome 웹 스토어 설명 변경은 필요하지 않다.

## 도구 감사 경계

최신 비공개 보고서는 `output/tool-audit/run-2026-10-12T02-14-50-173Z-mV2XDU`에 있다. ESLint 관측 7개는 기존 `scripts/owned-files.mjs`의 guarded 동적 파일 시스템 capability 경계 26, 27, 45, 74, 79, 94, 115행이며 AF04-D가 추가한 관측은 없다. 종료 상태 1은 이를 clean으로 위장하지 않는 기존 계약이다.

도구 감사는 보안 인증이 아니다. dependency advisory는 locally patched vendored HLS를 분석하지 않으며, 정적 pattern은 자동으로 실제 취약점 판정이 되지 않는다.

## 독립 검토와 보완

Astra max는 `main...8535c30`의 전체 inject 이전과 호출자·테스트를 읽기 전용으로 검토했다. 첫 finding은 live에서 자동 펼침 뒤 제외 경로를 거쳐 같은 live로 돌아오면 이전 settlement가 남아 목록이 접힌 채 유지되는 회귀였다. 두 번째 finding은 VOD 카드 link element가 foreign URL element로 교체되면 분리된 옛 anchor를 캡처한 metadata 응답이 새 카드에 tooltip을 쓰는 회귀였다.

첫 보완 뒤 제외 화면에서 설정을 OFF→ON 하는 owner 없는 경계도 다시 재현했다. `SidebarFeature.reconcile`가 nullable owner에서 설정·route만 동기화하고 DOM binding은 건너뛰도록 고쳤다. metadata pending collection은 owner 수명의 `Map`으로 두고 동일 날짜 대상이 신뢰 경계를 잃으면 요청·timeout·record를 함께 취소한다. 세 회귀를 RED→GREEN으로 고정한 뒤 집중 321건과 전체 799건, 생성·strict·package·오디오·설치형 positive/negative E2E를 다시 실행했다.

최종 후속 검토는 following·타입 29/29, metadata 교체 회귀와 MAIN 생성 여섯 파일 일치를 독립 확인했다. observer/timer 증가, 권한·endpoint·저장·데이터 노출 확대와 추가 Important/Blocker는 발견하지 못했다.

## 설치 E2E와 제한

- fresh profile에서 팝업, storage, ISOLATED↔MAIN bridge, 손상 저장소 복구, 두 창 동시 설정, 원래 style 대상만 reload, 페이지별 runtime/audio 격리와 합성 persisted lifecycle을 통과했다.
- 디버그 세션이 worker를 살려 두어 자연 idle suspension은 관측하지 못했다.
- bundled headless Chromium의 unpacked in-place reload는 worker를 다시 시작하지 않아 fresh context startup으로 context invalidation 경계를 검사했다.
- 실제 계정·쿠키·결제·연령 제한 방송, 실서비스 DOM·HLS·삭제 메시지, 실제 BFCache, 장시간 물리 출력과 Chrome 웹 스토어 자동 업데이트는 AF04-D proof 범위가 아니다.

## 공개 PR과 병합

- 한글 PR: [#19 AF04-D: inject 런타임을 기능별 TypeScript 모듈로 이전](https://github.com/Do-hyeon/cheese-knife/pull/19)
- 공개 CI: [run 38195194642](https://github.com/Do-hyeon/cheese-knife/actions/runs/38195194642), 최종 결론 `success`
  - Ubuntu foundation: 17초, 통과
  - Windows foundation: 33초, 통과
  - 전체 verify: 3분 14초, 통과
- 병합: 2026-10-12 11:21:38 KST, merge commit `5326ff4b86857c331fa45c25acd9207a1888852e`

공개 CI는 최초 실행에서 모든 필수 작업을 통과했고, 로컬 수용 결과와 제품·권한·데이터 경계를 변경하지 않았다. AF04-A부터 D까지 모두 병합돼 AF04를 완료한다.

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

제품 범위는 `1e95bc1..09d2b39`이다. AF04-D를 되돌릴 때는 최신 `main` 기반 복구 branch에서 `git revert -m 1 5326ff4b86857c331fa45c25acd9207a1888852e`를 실행하고 전체 gate를 다시 검증한다. 강제 reset은 사용하지 않으며 manifest, 사용자 storage와 기존 스토어 배포물을 직접 수정하지 않는다.

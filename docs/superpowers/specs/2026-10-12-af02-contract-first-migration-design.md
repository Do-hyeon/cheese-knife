# AF02 계약 우선 TypeScript 전환 상세 설계

- 작성일: 2026-10-12 / Asia-Seoul
- 기준점: `2e2ee90be0f9ba402fe12bbd6cf1bd556b0a607e` (`main`, PR #5 병합)
- 대상 브랜치: `codex/af02-contract-first-migration`
- 상태: 사용자 상세 설계 승인

## 1. 목적

AF02는 설정 message, storage snapshot, operation, revision 계약의 타입과 런타임 검증을 한 TypeScript 원본에 모으고, client와 broker를 작은 단위로 TypeScript로 이전한다. 기존 Chrome MV3 실행 구조와 공개 동작은 바꾸지 않는다.

이 단계의 핵심은 새 기능이나 새 빌드 체계가 아니다. 현재 `types/knife-settings.d.ts`와 세 JavaScript 구현에 나뉜 계약을 제거하고, 검토 가능한 TypeScript 원본에서 기존 파일명과 전역 ABI를 결정적으로 생성하는 것이다.

## 2. 범위

### 포함

- `settings-contract.js`의 타입, validator, merge, snapshot, revision 계약
- `settings-client.js`의 Chrome message reply 검증과 pending/confirmed 상태 전이
- `settings-broker.js`의 요청 검증, 직렬 queue, storage commit, CSS 적용, 대상 탭 reload
- 위 세 파일의 TypeScript 원본과 결정적 생성·drift 검사
- 손상 storage, 오래된 revision, exhausted revision, 잘못된 request/reply의 정적·런타임 회귀
- 현재 단위 테스트, package 검사, 설치형 positive/negative E2E와 도구 감사

### 제외

- `config.js`, `style-schema.js`, popup/styles UI 구현의 TypeScript 변환
- manifest, HTML script 순서, background `importScripts` 순서 변경
- ES module service worker, 파일 간 runtime import graph, 하나의 설정 bundle
- 설정 key, protocol, revision 의미, 기본값, 사용자 인터페이스 변경
- 권한, host permission, 외부 통신, telemetry, 개인정보처리방침 변경
- AF03 이후 MAIN runtime·site adapter와 AF04 기능 모듈 이전

## 3. 현재 계약과 변경 전파 범위

현재 실행 순서는 다음과 같다.

- background: `config.js` → `style-schema.js` → `settings-contract.js` → `settings-broker.js` → `background.js`
- popup/styles: `config.js` → `style-schema.js` → `settings-contract.js` → `settings-client.js` → 화면 script

현재 공유 전역은 `KnifeSettingsContract`, `createSettingsClient`, `createSettingsBroker`, `CONFIGS`, `STYLES`, `normalizeConfig`, `KnifeHostPolicy`다. AF02는 앞의 세 전역만 생성 대상으로 바꾸고 이름·로드 시점·호출 형식은 유지한다.

변경이 도달해야 하는 위치는 다음과 같다.

| 분류 | 대상 |
| --- | --- |
| 원본 | `src/settings/contract.ts`, `src/settings/client.ts`, `src/settings/broker.ts` |
| 생성 산출물 | `settings-contract.js`, `settings-client.js`, `settings-broker.js` |
| 타입 설정 | 일반화된 root TypeScript config와 `package.json` script |
| 생성 도구 | 기존 esbuild와 `scripts/owned-files.mjs`를 재사용하는 한 개의 작은 generator/checker |
| build 호출자 | `scripts/build.mjs`, 격리 후보를 만드는 `scripts/verify-candidate.mjs`, CI와 publish workflow |
| 직접 호출자 | `background.js`, `popup.js`, `styles.js` |
| 로드 선언 | `background.js`, `popup.html`, `styles.html` |
| 집중 회귀 | settings contract/client/broker/load-order/style-apply/popup/styles/type foundation 테스트 |
| 제품 회귀 | build, package check, runtime inventory, installed-extension positive/negative E2E |
| 기록 | `PLANS.md`, AF02 구현 계획, validation 문서, 한글 PR |

직접 호출자와 로드 선언은 의미 변경 없이 유지되는지 검사하기 위한 범위다. 필요하지 않으면 수정하지 않는다.

## 4. 선택한 구조

### 4.1 TypeScript global-script 원본

세 TypeScript 원본은 `import`와 `export`가 없는 global-script로 작성한다. `contract.ts`에는 설정 protocol에 필요한 type alias와 런타임 validator 구현을 함께 둔다. 같은 TypeScript project의 `client.ts`와 `broker.ts`는 이 타입과 기존 전역 계약을 참조한다.

이 선택은 장기 최종 구조가 아니다. 현재 `var` 전역 ABI를 module wrapper나 IIFE 내부로 숨기지 않고 AF02에서 계약만 이전하기 위한 과도기다. 파일 간 runtime import graph는 AF03에서 실행 문맥과 adapter를 분리할 때 함께 도입한다.

### 4.2 기존 파일명으로 결정적 생성

이미 고정된 esbuild `transform`을 사용해 세 `.ts` 원본을 각각 기존 root `.js` 파일로 변환한다.

- target: `chrome121`
- source map: 없음
- minification: 없음
- legal comments: 현재 라이선스 계약에 맞게 고정
- bundle: 하지 않음
- 원격 접근: 없음
- 환경 경로, 사용자명, hostname, timestamp 삽입: 없음

생성 JS는 unpacked source checkout과 기존 jsdom 테스트가 계속 동작하도록 저장소에 포함한다. 사람은 생성 JS를 직접 수정하지 않는다.

일반 검사와 `npm run build`는 임시 계산 결과를 커밋된 생성 JS와 byte 단위로 비교할 뿐 source tree를 수정하지 않는다. 명시적인 생성 명령만 정확히 세 파일을 갱신하며 CI에서는 write mode를 거부한다.

### 4.3 타입의 단일 근거

`types/knife-settings.d.ts`에 있는 settings protocol, snapshot, reply, client state, broker job 타입은 `contract.ts`로 이동한다. 별도 수기 선언 사본은 남기지 않는다.

protocol version, namespace와 action 이름의 타입·validator는 같은 파일에 둔다. validator가 만든 성공 결과에서 정확하게 추론할 수 있는 union은 반환 타입에서 얻는다. 추론을 억지로 복잡하게 만드는 경우에는 같은 파일에서 명시 타입과 validator를 나란히 두고 action별 positive/negative 표로 일치 여부를 검사한다. client의 기존 request literal과의 일치는 통합 테스트로 고정하며, 이를 위해 새 공개 helper, 전역, schema DSL이나 dependency를 추가하지 않는다.

`CONFIGS`와 `STYLES`의 실제 필드 목록은 기존 JavaScript schema가 계속 단일 런타임 근거다. contract는 현재처럼 이 값을 읽어 허용 ID와 범위를 구성한다. 이 두 schema 자체의 TypeScript 이전은 AF02에 포함하지 않는다.

## 5. 런타임 계약

### 5.1 신뢰 경계

다음 값은 TypeScript 타입과 무관하게 항상 `unknown`에서 시작한다.

- `chrome.runtime.sendMessage`의 request와 reply
- `chrome.storage.local.get()` 결과
- `chrome.tabs.get()` 결과 중 URL과 window 관계
- extension page URL query의 target tab/window ID

validator를 통과하기 전에는 `KnifeSettingsRequest`, snapshot 또는 action별 reply로 단언하지 않는다. 타입 이동을 이유로 기존 shape·prototype·own-property 검사를 삭제하지 않는다.

### 5.2 message protocol

namespace `cheese-knife-settings`, protocol `1`, action `get-snapshot`/`patch`/`reload-target`, request ID 길이 제한과 정확한 action별 필드 집합을 유지한다.

client는 action별 reply를 검증한다. 잘못된 snapshot, revision, CSS state, reload acknowledgement는 성공으로 승인하지 않고 현재 `response-unknown` 흐름으로 격리한다.

### 5.3 revision과 storage

- 누락된 `settingsRevision`은 기존 설치 호환을 위해 `0`이다.
- 음수, 비정수, 문자열, 비유한 수는 `revision-invalid`다.
- `Number.MAX_SAFE_INTEGER`는 `revision-exhausted`다.
- 변경이 없으면 write와 revision 증가가 없다.
- 한 patch의 여러 operation은 한 번의 storage commit과 최대 한 번의 revision 증가로 처리한다.
- 알려지지 않은 저장 필드는 merge 과정에서 보존하되 snapshot과 UI에는 노출하지 않는다.
- 손상 값을 조용히 덮어쓰거나 복구한 것처럼 표시하지 않는다.

### 5.4 직렬화와 다중 창

broker의 최대 64개 queue, client의 필드별 최신 절대값 병합, confirmed revision 정리, storage change 기반 coalesced refresh를 유지한다. worker 메모리 순번을 durable revision 대신 사용하지 않는다.

popup과 styles는 현재 factory API를 그대로 호출한다. styles reload는 캡처된 tab/window pair를 broker가 실행 직전에 다시 확인한 뒤 해당 탭만 새로고침한다.

## 6. 생성·빌드 계약

생성 도구는 새 dependency를 추가하지 않고 기존 esbuild와 owned-path 경계를 재사용한다. 다음을 강제한다.

1. 입력은 고정된 세 TypeScript regular file이다.
2. 출력은 고정된 세 root JavaScript regular file이다.
3. symlink, junction, 예상 밖 출력명과 source map은 거부한다.
4. check mode는 어떤 파일도 쓰지 않는다.
5. write mode는 CI에서 거부하고 세 출력 외 파일을 수정하지 않는다.
6. 같은 입력을 두 번 변환한 byte가 다르면 실패한다.
7. 생성 결과에 절대 경로, 환경 식별자, timestamp, `eval`, `new Function`, 원격 import가 있으면 실패한다.
8. `npm run build`는 생성 drift를 먼저 거부한 뒤 기존 copy build를 수행한다.
9. `verify-candidate`도 package 파일을 복사하기 전에 원본 checkout의 생성 drift를 거부한다.
10. 세 TypeScript 원본과 세 생성 JavaScript는 `.gitattributes`에서 LF로 고정해 Windows와 Ubuntu의 byte 비교가 checkout 설정에 좌우되지 않게 한다.

기존 runtime JavaScript inventory는 파일 목록을 유지하고 세 생성 파일의 승인된 executable hash만 AF02 기준으로 전진시킨다. source→`dist` JavaScript byte 동일성은 계속 요구한다.

## 7. 테스트 전략

### 7.1 실패 우선 검사

구현 전에 다음 실패 검사를 추가한다.

- TypeScript 원본과 생성 JS가 다르면 drift 실패
- check mode가 source tree를 수정하면 실패
- 예상 밖 entry/output을 생성하려 하면 실패
- generated marker 또는 출력 파일을 수동 변경하면 실패
- source map, wrapper로 숨은 전역, 원격 문자열이나 환경 경로가 포함되면 실패

### 7.2 계약 회귀

기존 테스트를 생성 JS에 그대로 실행하고 필요한 negative case만 보충한다.

- inherited/prototype-reserved key 거부
- 정확하지 않은 operation shape 전체 거부
- malformed storage와 exhausted revision 비변경
- 오래된 snapshot/reply가 최신 UI 상태를 덮지 않음
- malformed action별 reply가 pending intent를 성공 처리하지 않음
- 64개 queue/operation 경계와 overflow 실패
- CSS 실패 뒤 저장 성공 상태와 retry 의미 유지
- 대상 탭 삭제·origin/window 변경 때 reload 거부
- 서로 다른 두 설정 창의 변경 병합과 원래 대상만 reload

### 7.3 전체 게이트

- strict TypeScript 검사, `any`/ignore/skip 예외 없음
- 생성 drift·결정성·runtime inventory 검사
- 전체 Node 테스트
- Chrome build와 package check
- HLS·오디오·정적 경고·도구 감사
- installed-extension positive/negative E2E
- `git diff --check`

실제 계정, 쿠키, 결제, 후원, 연령 제한 콘텐츠와 스토어 자동 업데이트는 AF02 증거에 포함하지 않는다.

## 8. 제품·개인정보·스토어 정책 불변 조건

AF02는 다음 변화를 허용하지 않는다.

- `manifest.json` 권한, host permission, content script/world
- extension page script tag와 background import 순서
- 새 storage key, 설정 기본값, message protocol/revision 의미
- 사용자 데이터 수집·전송·판매·공유·telemetry
- 외부 endpoint, remote code, source map, 동적 코드 실행
- 공개 기능, 지원 브라우저, 스토어 설명이 다뤄야 할 기능 범위

따라서 승인 범위대로 구현되면 개인정보처리방침과 스토어 권한 설명의 변경은 필요하지 않다. 위 항목이 필요해지면 AF02를 중지하고 별도 정책 검토와 사용자 승인을 받는다.

## 9. 공격적 검토

### 9.1 type-only import도 전역 ABI를 바꿀 수 있음

파일에 import/export가 생기면 esbuild가 module로 취급하고 기존 top-level `var`가 전역에서 사라질 수 있다.

**보완:** AF02 원본은 global-script로 제한한다. 출력에서 기존 세 전역이 실제 Chrome classic script와 jsdom load-order fixture 모두에서 접근 가능한지 검사한다. import graph는 AF03으로 미룬다.

### 9.2 생성 JS를 함께 커밋하면 이중 원본이 될 수 있음

사람이 `.ts`와 `.js`를 따로 수정하면 어느 쪽이 진짜인지 불명확해진다.

**보완:** `.ts`만 원본이다. build와 CI가 byte drift를 거부하고 write command를 분리한다. 생성 JS 수동 변경을 negative control로 둔다.

### 9.3 빌드가 자동으로 source tree를 고치면 변경을 숨길 수 있음

일반 build가 생성 파일을 덮어쓰면 review하지 않은 코드가 working tree에 생기거나 CI가 stale artifact를 은폐할 수 있다.

**보완:** 기본은 read-only check다. write는 명시적 명령 하나뿐이며 CI에서 금지한다.

### 9.4 TypeScript 성공이 런타임 안전을 보증하지 않음

Chrome message와 storage는 프로세스·지속성 경계를 지난 값이다. 타입 단언으로 validator를 대체하면 malformed 입력이 내부 상태가 된다.

**보완:** 모든 외부 입력을 `unknown`으로 유지하고 action별 validator 회귀를 필수로 둔다. `as`는 validator 뒤의 좁힘이나 Chrome type 결함 보완 외에는 허용하지 않는다.

### 9.5 transform이 미세한 실행 의미를 바꿀 수 있음

target 변환, class/async helper, strict mode, wrapper가 global binding, stack, timing을 바꿀 수 있다.

**보완:** Chrome 121이 지원하는 현재 문법을 유지하고 bundle/minify/module wrapper를 사용하지 않는다. 기존 unit/load-order/installed E2E를 생성 결과에 실행한다. 출력 변화는 세 파일에만 제한한다.

### 9.6 contract가 schema 사본을 만들 수 있음

config/style ID와 범위를 TypeScript literal union으로 다시 적으면 기존 `CONFIGS`/`STYLES`와 drift한다.

**보완:** 허용 ID와 범위는 계속 런타임 schema에서 계산한다. AF02는 protocol shape와 validator 구현을 한 원본으로 만들 뿐 필드 목록 사본을 추가하지 않는다.

### 9.7 broker queue와 durable commit 의미가 우발적으로 달라질 수 있음

함수를 정리하면서 enqueue 시점, initialization 실패, CSS 적용 실패와 response channel 종료 처리를 바꾸면 다중 창에서 저장 유실이나 거짓 실패가 생길 수 있다.

**보완:** 리팩터링하지 않고 현재 제어 흐름을 먼저 기계적으로 이전한다. 로직 개선은 AF02 완료 뒤 별도 문제와 테스트가 있을 때만 한다.

### 9.8 생성 도구가 공급망·경로 경계를 넓힐 수 있음

새 codegen package나 임시 디렉터리 처리로 원격 다운로드, symlink traversal 또는 환경 정보 누출이 생길 수 있다.

**보완:** 이미 고정된 esbuild와 `openOwnedRoot`만 재사용하고 새 dependency를 추가하지 않는다. 입력·출력 allowlist와 offline CI를 유지한다.

### 9.9 build API 우회와 줄바꿈 차이가 drift 검사를 무력화할 수 있음

`verify-candidate`는 build 함수를 직접 호출하고, Windows의 `core.autocrlf=true` checkout은 생성 파일을 CRLF로 바꿀 수 있다. CLI만 검사하거나 줄바꿈을 고정하지 않으면 후보 검증이 stale JS를 복사하거나 정상 checkout이 거짓 실패할 수 있다.

**보완:** 일반 `npm run build`와 `verify-candidate`가 각각 drift 검사를 호출한다. 임시 package fixture를 위한 순수 copy build 함수는 생성 source를 요구하지 않는다. TypeScript 원본과 생성 JS 여섯 파일은 LF로 고정하고 Windows·Ubuntu CI에서 동일 검사를 실행한다.

## 10. 단계와 중단 조건

AF02는 다음 독립 단위로 구현한다.

1. 생성 drift/결정성 실패 검사와 generator/checker
2. contract 타입·validator·revision의 기계적 이전
3. client의 기계적 이전과 malformed reply 회귀
4. broker의 기계적 이전과 queue/storage/CSS/reload 회귀
5. 전체 회귀, tool audit, validation, 한글 PR과 공개 CI

다음 중 하나가 발생하면 검사를 약화하지 않고 중지한다.

- 기존 전역 이름·로드 순서·factory API 변경이 필요함
- manifest, 권한, storage/message 형식 또는 사용자 데이터 계약 변경이 필요함
- 새 dependency, source map, bundle, remote access가 필요함
- `any`, `@ts-ignore`, `skipLibCheck` 또는 validator 제거 없이는 typecheck가 불가능함
- generated source와 실행 결과의 결정성을 Windows/Ubuntu에서 유지할 수 없음
- 기존 단위 테스트, package gate 또는 installed E2E가 실패함

## 11. 롤백

AF02는 한 PR의 독립 단위다. 병합 전에는 AF02 commit을 revert하고, 병합 뒤에는 merge commit을 새 복구 브랜치에서 `git revert -m 1`로 되돌린다. 강제 reset이나 기존 사용자 storage 수정은 하지 않는다.

롤백하면 세 root JavaScript가 AF01의 수기 원본으로 복원되고 TypeScript source, generator, drift 검사와 AF02 전용 기준선만 제거된다. manifest, 사용자 설정과 스토어 배포물은 AF02 브랜치 작업만으로 바뀌지 않는다.

## 12. 완료 조건

- settings protocol 타입과 validator가 `contract.ts` 한 원본에 존재
- client와 broker TypeScript 원본 및 기존 전역 ABI의 결정적 JS 생성
- 수기 `.d.ts` settings 계약 사본 제거
- 생성 drift·결정성·경로/CSP negative control 통과
- 손상 storage, stale/exhausted revision, malformed request/reply 회귀 통과
- 다중 창 저장 병합, CSS retry, 대상 탭 reload 의미 유지
- 전체 제품·오디오·HLS·보안 도구·설치형 E2E 통과
- 권한·데이터·네트워크·스토어 정책 범위 변화 0건
- validation 문서, 한글 PR, Windows/Ubuntu 공개 CI와 병합 기준 고정

## 13. 승인 게이트

이 상세 설계를 사용자가 검토·승인하기 전에는 구현 계획이나 제품 코드를 작성하지 않는다. 승인 뒤 `superpowers:writing-plans` 절차로 정확한 파일·테스트·명령·커밋 단위를 작성하고 다시 검토한다. 구현 계획 승인 전에는 TypeScript 원본, generator 또는 생성 JavaScript를 변경하지 않는다.

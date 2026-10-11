# AF03 MAIN runtime·site adapter 분리 상세 설계

작성일: 2026-10-12 / Asia-Seoul
기준점: `5060fb9e347ef6a5ea5575cfa6ebc073d294e9ae` (`main`, AF02 상태 고정)
상태: 사용자 승인된 대화 설계를 문서화한 검토 대상

## 1. 목적과 성공 조건

AF03은 치지직 페이지의 MAIN execution world에서 동작하는 runtime과 site adapter를 TypeScript 원본과 명시적 import graph로 옮긴다. 기능을 추가하는 단계가 아니라, 사이트 내부 구조 변화가 route·scope·status·bridge와 기능 코드 전체로 퍼지지 않게 경계를 세우는 단계다.

성공 조건은 다음과 같다.

- `web/runtime.js`와 `web/site-adapter.js`의 유일한 수기 원본은 `src/main/**`의 TypeScript module이다.
- manifest의 두 파일명, MAIN world, 로드 순서와 `Symbol.for('cheese-knife.runtime.v1')` ABI를 유지한다.
- route, resource scope, status, config bridge와 document lifecycle은 서로 import하는 작은 모듈로 표현된다.
- React fiber·props·hook과 webpack 객체는 site adapter 밖으로 노출하지 않는다.
- 사이트 내부 값은 모두 `unknown`에서 descriptor 기반 validator를 통과한 뒤 최소 capability 또는 값 snapshot으로 변환된다.
- 치지직 전용 DOM discovery selector는 site adapter에 모으고, 표준 DOM selector와 `.knife-*` 확장 소유 selector는 기능 코드에 남긴다.
- 기존 audio, player, preview, chat, sidebar와 style의 사용자 동작은 유지한다.
- 권한, host permission, storage key, 외부 endpoint, telemetry와 사용자 데이터 수집·전송은 늘리지 않는다.
- 생성물 drift, build/candidate/package 우회와 Windows·Ubuntu 줄바꿈 차이를 CI가 거부한다.
- 공개 checkout 전체 회귀, 합성 오디오와 설치형 positive/negative E2E가 통과한다.

## 2. 범위

### 2.1 포함

- 현재 `web/runtime.js`의 route, scope, status, config bridge, DOM discovery와 lifecycle 분리
- 현재 `web/site-adapter.js`의 React·webpack 탐색을 bounded validator와 capability로 교체
- `web/inject.js`와 `web/player.js`가 사용하는 raw adapter API를 narrow capability 호출로 변경
- 두 classic JavaScript 산출물의 결정적 생성·검사·배포 gate
- runtime/site adapter source graph와 배포 경계를 위한 tests·CI·validation 갱신

### 2.2 제외

- audio, player, preview, inject 전체의 TypeScript 이전
- 기능 UI, 설정 key/default, CSS와 공개 사용법 변경
- 미리보기·채팅·사이드바·컴프레서 알고리즘 개선
- manifest permission, host permission, CSP, remote code와 새 네트워크 요청
- React/Vue 도입, framework 전환, ES module content script 전환
- Chrome 웹 스토어 제출과 버전 증가
- Firefox 지원 복구

AF03에서 기능 파일의 일부 호출부를 수정하는 이유는 raw site object 누출을 닫기 위해서다. 기능 자체를 모듈로 이전하거나 동작을 재설계하는 일은 AF04에 남긴다.

## 3. 현재 계약과 문제

현재 MAIN 로드 순서는 다음과 같다.

```text
web/runtime.js
vendor/hls.light.private.js
web/site-adapter.js
web/audio.js
web/player.js
web/preview.js
web/inject.js
```

`web/runtime.js`는 route 분류, 주 player와 sidebar discovery, 상태 전송, scope, MutationObserver, config handshake, BFCache와 URL pulse를 한 IIFE에 가진다. `web/site-adapter.js`는 React fiber·props·hook과 webpack require를 찾은 뒤 다음 raw API를 `runtime.adapter`로 공개한다.

- `fiberOf`
- `propsOf`
- `stateOf`
- `contextOf`
- `getWebpackRequire`
- `getCorePlayer`

`web/inject.js`가 `propsOf`, `stateOf`, `fiberOf`의 결과를 직접 읽고 `web/player.js`가 raw core player를 받으므로, TypeScript가 붙어도 사이트 내부 shape가 기능 타입으로 새어 나간다. 현재 traversal은 cycle과 count를 제한하지만 `Object.entries` 접근이 getter를 실행할 수 있고, raw 객체 사용 지점마다 별도 검증이 필요하다. 또한 runtime source의 내부 의존성은 파일 안 선언 순서에만 표현된다.

## 4. 검토한 접근

### 4.1 선택: 두 classic output을 TypeScript module graph에서 생성

runtime과 adapter는 각자 하나의 entry를 갖고, 내부 책임은 TypeScript module import로 연결한다. esbuild가 entry별 classic IIFE를 생성해 기존 `web/runtime.js`, `web/site-adapter.js`를 대체한다.

장점은 manifest와 legacy 기능 ABI를 유지하면서 source 내부 의존성과 타입을 명시할 수 있다는 점이다. 두 파일을 따로 롤백하고 adapter 실패를 runtime 실패와 분리할 수도 있다.

### 4.2 제외: MAIN 전체 단일 bundle

가장 완전한 import graph를 만들 수 있지만 audio/player/preview/inject까지 한 번에 bundle 경계 안으로 들어간다. AF04를 선행하고 회귀·롤백 범위를 키우므로 제외한다.

### 4.3 제외: classic JavaScript 유지와 declaration 보강

제품 byte 변화는 작지만 runtime 내부 선언 순서와 raw adapter 객체 누출을 해결하지 못한다. TypeScript가 사이트 내부 shape를 사실처럼 보이게 만들 위험만 남으므로 제외한다.

## 5. source와 output 구조

### 5.1 runtime source

| 파일 | 단일 책임 |
| --- | --- |
| `src/main/runtime/contracts.ts` | `Route`, `RuntimeState`, `FeatureStatus`, `ResourceScope`, 공개 runtime ABI 타입 |
| `src/main/runtime/route.ts` | `location.pathname`에서 side effect 없이 route 분류 |
| `src/main/runtime/scope.ts` | AbortController, event, observer, timeout, interval과 멱등 dispose |
| `src/main/runtime/status.ts` | feature key/state/reason validation, transition 상한과 status message 생성 |
| `src/main/runtime/bridge.ts` | config envelope를 `unknown`에서 검증하고 own-entry snapshot으로 정규화 |
| `src/main/runtime/lifecycle.ts` | reconcile scheduling, observer, URL pulse, visibility, pageshow/pagehide와 cleanup |
| `src/main/runtime/entry.ts` | 위 모듈 조립, transactional registry 설치와 기존 ABI 공개 |

### 5.2 adapter source

| 파일 | 단일 책임 |
| --- | --- |
| `src/main/site-adapter/contracts.ts` | 기능 코드에 공개할 snapshot·capability 타입 |
| `src/main/site-adapter/react.ts` | descriptor 기반 React fiber·props·hook bounded traversal |
| `src/main/site-adapter/discovery.ts` | 치지직 route root, player, sidebar, chat, banner의 site-owned selector |
| `src/main/site-adapter/capabilities.ts` | chat, banner, player 내부 객체를 최소 operation으로 감싼 facade |
| `src/main/site-adapter/entry.ts` | runtime 존재 확인, adapter 조립과 `runtime.adapter`의 단일 설치 |

### 5.3 생성 도구

AF02의 결정적 생성 방식을 재사용하되 settings entry 목록과 MAIN entry 목록은 섞지 않는다.

- `scripts/generated-runtime.mjs`: owned path, fixed esbuild options, classic-script 구문·금지 토큰·출력 목록 공통 검사
- `scripts/settings-runtime.mjs`: 기존 세 settings entry 정의와 현재 CLI 계약을 유지하는 얇은 진입점
- `scripts/main-runtime.mjs`: runtime과 site-adapter 두 entry 정의, check/write 분리

공통 모듈 추출은 두 생성기가 실제로 공유하는 path·transform·output 검사만 포함한다. entry별 ABI 검사와 의미 검사는 각 진입점에 둔다. 새 dependency는 추가하지 않는다.

### 5.4 생성 계약

- esbuild `0.28.2`, target `chrome121`, bundle true, format `iife`, platform `browser`
- minify false, sourcemap false, legalComments `none`, charset `utf8`
- absolute working directory와 entry/output 목록 고정
- dynamic import, `require`, `eval`, `new Function`, source map URL과 remote import 금지
- 출력은 `new vm.Script`로 classic-script 구문 검사
- source symlink, output symlink, 저장소 밖 경로와 예상하지 않은 산출물 거부
- 일반 check/build/candidate/package/CI는 read-only이고 `--write`는 CI에서 거부
- 두 output은 LF로 Git에 저장하며 `dist`에는 JavaScript만 포함

## 6. runtime ABI와 수명주기

### 6.1 registry 설치

entry는 기존 symbol descriptor를 먼저 확인한다. 이미 호환 runtime이 있으면 아무 listener도 추가하지 않고 종료한다. 새 runtime은 모든 component와 cleanup stack을 먼저 만들고, 공개 객체가 완성된 뒤 registry에 한 번만 설치한다.

설치 뒤 초기 reconcile·observer 등록·config request 중 예외가 발생하면 현재 entry가 설치한 registry만 삭제하고 등록한 listener, observer, timer와 animation frame을 역순으로 정리한다. 다른 instance가 registry를 교체했다면 삭제하지 않는다.

### 6.2 공개 runtime

기존 기능이 사용하는 다음 계약은 유지한다.

- `config`, `i18n`, `configReady`, `state`, `statuses`, `features`, `generation`
- `route()`, `selectPlayer()`, `setStatus()`, `diagnostics()`
- `subscribe()`, `reconcile()`, `schedule()`, `createScope()`
- `adapter`, `audio`, `player`, `preview`, `coordinatorStarted`의 후속 script 등록

공개 이름을 유지하는 것은 AF03의 compatibility 경계다. 내부 구현 타입을 공개 객체에 추가하지 않는다.

### 6.3 route와 DOM discovery

route parser는 현재 excluded/live/vod/channel/explore 결과와 path·id 의미를 그대로 유지한다. player/sidebar discovery는 adapter의 site-owned selector를 사용하되 runtime이 받는 결과는 검증된 DOM node snapshot뿐이다.

adapter가 없거나 discovery가 실패하면 route, bridge, scope와 status는 계속 동작한다. player/sidebar는 `null`이고 해당 기능만 pending 또는 limited 상태가 된다.

### 6.4 scope

scope는 dispose 뒤 새 event·timer·observer 등록을 즉시 정리한다. cleanup은 역순으로 한 번만 실행하고, 하나의 cleanup 예외가 나머지를 막지 않는다. timeout callback은 실행 전 scope와 generation 소유권을 다시 확인할 수 있는 signal을 제공한다.

### 6.5 bridge

config message는 다음을 모두 만족할 때만 적용한다.

- `source === window`, `origin === location.origin`
- namespace `cheese-knife`, protocol `1`, type `config`
- 현재 requestId와 일치
- revision이 safe integer이며 현재 값보다 큼
- config가 array가 아닌 object
- i18n은 string value의 own enumerable entry만 허용

config와 i18n은 own enumerable **data descriptor**만 읽어 새 object를 만들며 accessor와 prototype을 신뢰하지 않는다. runtime은 설정 key 의미를 새로 해석하지 않고 후속 기능에 snapshot을 전달한다. 설정 schema 의미 변경은 AF03 범위 밖이다.

### 6.6 BFCache와 종료

- `pagehide.persisted === true`: 새 schedule과 URL pulse를 멈추되 registry와 복귀 가능한 자원은 유지
- `pageshow`: pulse와 reconcile을 한 번 재개하고 config가 없을 때만 handshake 재시작
- final pagehide: observer, timer, animation frame과 runtime 소유 listener 해제
- dispose와 pageshow가 교차해도 두 번째 observer·pulse를 만들지 않음

## 7. site adapter 계약

### 7.1 금지되는 공개 API

AF03 완료 뒤 `runtime.adapter`는 `fiberOf`, `propsOf`, `stateOf`, `contextOf`, `getWebpackRequire`, raw core player를 공개하지 않는다. feature가 React fiber, hook node, webpack require, chat controller와 player core object의 property를 직접 읽으면 gate 실패다.

제품에서 사용하지 않는 `getWebpackRequire` probe는 제거한다. 알려진 webpack chunk 존재 여부를 나타내는 현재 diagnostics boolean은 descriptor로 array 여부만 확인해 유지한다.

runtime entry가 adapter보다 먼저 실행되므로 최초 state는 adapter 없이 route와 bridge만 초기화될 수 있다. adapter entry는 완성된 capability 객체를 한 번 설치한 직후 `runtime.reconcile()`을 호출한다. 중복 adapter가 이미 있으면 설치·reconcile을 반복하지 않으며, runtime이 없으면 어떤 listener나 timer도 만들지 않고 종료한다.

### 7.2 공개 capability

adapter는 다음 범주의 작은 interface만 공개한다.

- `discover(document, route): SiteSnapshot`: 검증된 body, sidebar, player와 site root
- `chat.readMessage(row): ChatMessageSnapshot | null`: timestamp·type·status·content 식별에 필요한 primitive만 복사
- `chat.connect(container): ChatControllerPort | null`: filter와 blind listener를 identity-aware operation으로 설치·동기화·해제하는 facade
- `banner.closeHandler(node): (() => void) | null`: 검증하고 receiver를 보존한 호출 함수
- `player.readMetrics(layout): Promise<SitePlayerMetrics | null>`: codec 등 검증된 primitive만 반환

`ChatControllerPort`는 원본 controller나 message array를 반환하지 않는다. feature는 다음 operation만 사용한다.

- donation filter 설치와 현재 설치 identity 확인
- blind listener 설치·해제와 현재 message snapshot 조회
- 같은 message identity가 유지될 때의 제한적 replace 요청
- native update callback 호출 요청
- 멱등 dispose

삭제 채팅의 eligibility, retained state와 표시 정책은 기존 `web/inject.js`에 남긴다. adapter는 사이트 객체의 읽기·교체·복원 안전성만 담당한다. 이 분리는 AF04 전에 기능 정책을 옮기지 않으면서 raw controller 누출을 닫는다.

### 7.3 validator 규칙

- property value를 읽기 전에 own descriptor를 확인하며 accessor getter를 실행하지 않음
- fiber return chain 최대 300, hook chain 최대 300, context chain 최대 100
- 각 chain은 `Set`으로 cycle 종료
- 함수는 호출 receiver와 현재 identity를 closure 안에 보존
- array와 object는 매 operation에서 identity와 index descriptor를 다시 확인
- primitive snapshot은 string 길이와 finite number를 제한
- validator 실패, detached node, identity 교체와 thenable 결과는 예외 전파 대신 capability 실패로 처리
- 임의 window key 열거와 알려지지 않은 webpack chunk 탐색 금지

### 7.4 selector 경계

adapter로 이동하는 것은 치지직 구현에 종속된 root/player/sidebar/chat/banner 및 native control selector다. `video`, `a[href]`, ARIA role처럼 표준 의미가 있는 selector와 `.knife-*`, `data-knife-*`처럼 확장이 소유한 selector는 기능 코드에 남긴다.

해시 class prefix selector는 adapter의 이름 있는 함수 한 곳에서만 사용한다. selector가 바뀌면 null을 반환하고 관련 기능 상태를 limited로 표시하며, fallback이라는 이름으로 넓은 `aside`, 모든 `nav`, 모든 window global을 탐색하지 않는다.

## 8. 호출부 이전

`web/inject.js`는 다음 raw 접근을 capability로 치환한다.

- timestamp row props → `adapter.chat.readMessage`
- chat controller hook traversal → `adapter.chat.connect`
- banner fiber close handler → `adapter.banner.closeHandler`

`web/player.js`는 `getCorePlayer`와 `_currentCodecs` 직접 접근을 `adapter.player.readMetrics`로 치환한다. bitrate·latency처럼 현재 검증되지 않은 값은 계속 `알 수 없음`이며 새 수치를 추정하지 않는다.

호출부는 adapter null·capability null을 정상 제한 상태로 처리한다. 기능 UI, 설정과 DOM ownership은 바꾸지 않는다.

## 9. 상태·오류 처리

- runtime 핵심 실패만 `runtime: failed`
- adapter 미설치·shape mismatch는 해당 기능 `limited`이고 다른 기능은 계속 실행
- malformed config는 무시하며 이전 revision/config를 보존
- subscriber 하나의 예외는 다음 subscriber 호출을 막지 않음
- transition history는 현재 최대 20개와 reason 최대 80자를 유지
- 상태 message는 현재 origin으로만 전송하고 사용자 콘텐츠나 raw site object를 포함하지 않음
- console에 raw config, chat, fiber, URL token과 예외 object를 기록하지 않음

## 10. 검증 설계

### 10.1 순수 단위 검사

- 모든 현재 route fixture의 동일 결과와 excluded boundary
- scope reverse cleanup, idempotence, callback exception, dispose 뒤 등록
- status key/state/reason, transition 상한과 prototype-like key 거부
- bridge source/origin/request/revision/config/i18n validation
- React chain cycle, accessor property, depth 상한, malformed descriptor
- capability identity 교체, detached node, thenable과 복원 소유권

### 10.2 생성·정적 검사

- 고정 entry와 esbuild options
- 같은 input의 byte-identical output
- stale output에서 read-only check 실패
- source/output link와 저장소 밖 경로 거부
- classic script 구문, runtime symbol ABI와 adapter raw API 부재
- adapter metafile이 runtime implementation을 중복 bundle하지 않음
- source map, dynamic import, require, eval과 remote import 부재
- runtime JavaScript inventory 기존 16개 유지

### 10.3 통합·설치 검사

- 기존 runtime, adapter, bridge, player, deleted chat, sidebar와 preview 회귀
- config 전후 load order와 adapter unavailable negative control
- route/player/sidebar/video 교체, BFCache synthetic persisted와 context invalidation
- popup→background→ISOLATED→MAIN 설정 전달
- 두 창 동시 설정, 원래 styles 대상 탭만 reload
- 설치형 positive E2E와 MAIN runtime 누락 negative E2E
- 합성 오디오 품질과 source→dist artifact hash 비교

### 10.4 공개 gate

- 공개 checkout `CI=true` 전체 Node test
- TypeScript strict, main/settings 생성 drift, build proof와 package 검사
- Windows·Ubuntu foundation
- 전체 verify
- npm audit, ESLint, Gitleaks current/Git
- 기준점 대비 manifest, 권한, endpoint, storage와 배포 파일 diff

## 11. 공격적 검토와 보완

### 11.1 TypeScript가 site shape를 보장한다는 착각

React와 webpack 객체는 외부 입력이며 선언 type을 붙여도 런타임 보장이 없다.

**보완:** 모든 진입은 `unknown`이고 descriptor 기반 validator가 primitive snapshot 또는 capability를 만든다. type assertion만으로 통과시키는 코드는 금지한다.

### 11.2 adapter가 또 하나의 만능 객체가 될 위험

모든 DOM query와 기능 정책을 adapter로 옮기면 site 변경 영향이 오히려 한 파일에 집중되고 AF04 경계를 잃는다.

**보완:** site-owned discovery와 내부 객체 조작만 adapter가 담당한다. extension-owned DOM과 기능 정책은 기존 기능 모듈에 남긴다.

### 11.3 두 bundle에 runtime 상태가 중복될 위험

adapter entry가 runtime implementation을 import하면 두 observer, 두 requestId와 서로 다른 상태가 생길 수 있다.

**보완:** adapter는 runtime ABI type과 registry lookup만 import한다. metafile과 설치형 E2E에서 runtime implementation 중복과 observer 증가를 거부한다.

### 11.4 초기화 실패가 반쯤 설치된 전역을 남길 위험

registry를 먼저 공개한 뒤 listener 등록이 실패하면 후속 script는 손상 runtime을 정상으로 볼 수 있다.

**보완:** 조립 완료 뒤 설치하고, 이후 startup 실패는 instance identity를 확인해 registry와 소유 자원을 롤백한다.

### 11.5 getter와 proxy가 탐색 중 코드를 실행할 위험

`Object.entries`나 직접 property 접근은 사이트 객체의 accessor를 실행할 수 있다.

**보완:** own data descriptor만 읽고 accessor는 unsupported로 처리한다. Proxy 자체의 trap까지 완전히 막을 수 없으므로 예외를 capability 실패로 격리하고 같은 generation에서 반복 시도하지 않는다.

### 11.6 capability가 raw 객체를 closure 밖으로 누출할 위험

facade가 callback argument나 error에 원본 controller/message를 전달하면 경계가 무효가 된다.

**보완:** callback에는 복사한 primitive snapshot과 결과 enum만 전달한다. error/status/report에는 정해진 reason code만 기록한다.

### 11.7 broad selector fallback이 다른 화면을 오인할 위험

사이트 selector가 깨진 뒤 모든 `aside`나 `nav`를 fallback으로 쓰면 엉뚱한 UI를 조작할 수 있다.

**보완:** 현재 검증한 route·root 안의 bounded selector만 사용한다. 모호하면 null/limited가 정답이다.

### 11.8 생성 gate를 우회한 stale JavaScript가 배포될 위험

TypeScript만 수정하고 generated JS를 갱신하지 않거나 직접 JS를 고칠 수 있다.

**보완:** local build, candidate, package와 CI가 main/settings generator read-only check를 모두 선행한다. write는 명시 command와 비-CI에서만 허용한다.

### 11.9 리팩터링이 사이트 요청이나 사용자 데이터를 늘릴 위험

adapter 편의를 위해 API 요청, telemetry, storage 또는 debugging dump가 추가될 수 있다.

**보완:** AF03 network/storage delta는 0이다. 새 endpoint·permission·storage key·raw diagnostic가 나타나면 구현을 중지하고 별도 설계 승인을 받는다.

### 11.10 실패를 숨기기 위해 validator를 느슨하게 할 위험

실제 사이트 smoke가 실패할 때 optional chaining이나 broad object type으로 합격시킬 수 있다.

**보완:** validator와 selector를 느슨하게 하지 않는다. fixture가 현재 사이트 근거와 다르면 근거를 갱신하고, 근거가 없으면 해당 capability를 limited로 둔다.

## 12. 중단 조건

다음 중 하나가 발생하면 AF03 구현을 중지하고 설계를 다시 승인받는다.

- manifest script 파일명·world·권한 변경이 필요함
- raw React/webpack/core object를 기능 코드에 노출해야만 기존 동작을 유지할 수 있음
- 새 네트워크 endpoint, storage key, telemetry 또는 remote code가 필요함
- 하나의 MAIN bundle로 AF04 기능까지 함께 이전해야 함
- generated output이 classic script CSP 또는 Chrome 121에서 동작하지 않음
- adapter failure를 기능별 limited로 격리할 수 없음
- 공개 CI를 통과시키기 위해 기존 security/build gate를 완화해야 함

## 13. 롤백과 공개 단위

AF03은 설계, 구현 계획, 구현, validation과 한글 PR의 독립 단위다. Chrome 웹 스토어 배포나 version 증가는 포함하지 않는다.

병합 전에는 AF03 구현 커밋을 새 revert commit으로 역적용한다. 병합 뒤에는 최신 `main`에서 AF03 merge commit 하나를 `git revert -m 1`로 되돌려 AF02의 수기 `web/runtime.js`, `web/site-adapter.js`와 기존 호출부로 복귀한다. 강제 reset, 저장 데이터 삭제와 manifest 권한 변경은 롤백에 사용하지 않는다.

## 14. 명세 완료 조건

- 현재 ABI, 선택 구조, source/output 경계와 raw API 제거 기준이 모호하지 않음
- 모든 외부 site value가 `unknown` validator와 capability를 통과함
- AF03과 AF04의 책임 경계가 분리됨
- 생성·CI·보안·개인정보·스토어 정책 불변 조건이 명시됨
- 공격 검토의 실패 모드마다 구현 가능한 보완과 중단 조건이 있음
- 전체 요구를 독립 작업과 검증 명령으로 옮길 수 있음

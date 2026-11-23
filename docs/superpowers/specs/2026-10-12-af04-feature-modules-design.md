# AF04 기능별 TypeScript 모듈 이전 상세 설계

- 작성일: 2026-10-12 / Asia-Seoul
- 기준 브랜치: 포크의 `origin/main`
- 제품 기준점: AF03 merge commit `275b9a679209949b06673f8e309b7dc13f33b2e1`
- 상태: 대화 설계 승인, 문서 검토 대기

## 1. 목적

AF04는 MAIN execution world의 기능 구현을 기능별 TypeScript source graph로 옮긴다. 사용자가 보는 기능을 추가하거나 다시 설계하는 단계가 아니다. 현재 동작·설정·권한·외부 요청을 유지하면서 다음 조건을 만든다.

- audio, player, preview, chat, sidebar와 나머지 page integration의 책임을 독립적으로 읽고 검증할 수 있다.
- 각 기능은 자신의 listener, observer, timer, DOM과 비동기 작업을 소유하고 멱등적으로 정리한다.
- 한 기능의 초기화·콜백·정리 실패가 다른 기능의 초기화와 정리를 막지 않는다.
- `web/inject.js`의 TypeScript entry에는 의존성 조립과 기능 등록만 남는다.
- manifest 파일명·로드 순서와 `cheese-knife.runtime.v1` ABI를 유지한다.

완료 뒤 기능 추가 로드맵은 기능 하나만 읽고 수정할 수 있는 경계를 갖는다. AF04 자체는 F00–F05 기능을 구현하지 않는다.

## 2. 현재 구조와 문제

AF03은 runtime과 site adapter를 TypeScript graph로 옮겼다. 다음 네 제품 파일은 여전히 수기 JavaScript다.

| 출력 파일 | 현재 책임 |
| --- | --- |
| `web/audio.js` | AudioContext, compressor, Gain, limiter, MediaElementSource와 audio 상태 |
| `web/player.js` | 방향키 탐색, 라이브 엣지, 길게 눌러 2배속, 통계, compressor UI |
| `web/preview.js` | 사이드바 hover, live-detail 요청, HLS, 패널, 볼륨·음소거 정책과 복구 |
| `web/inject.js` | popup player, chat, sidebar, 시작 시각, 채널 버튼, banner, home marker와 전체 조립 |

이미 분리된 세 파일도 `runtime.audio`, `runtime.player`, `runtime.preview`를 `unknown` 전역처럼 공유한다. `web/inject.js`는 약 40KB이며 chat·sidebar·popup·metadata·page decoration의 상태와 수명주기가 한 closure에 섞여 있다.

현재 테스트는 기능 행동을 많이 보호하지만 다음 구조적 위험은 남는다.

- TypeScript가 기능 API와 기능 간 의존성을 검사하지 못한다.
- `inject`의 subscriber 하나에서 발생한 예외가 어느 기능의 실패인지 구분하기 어렵다.
- sidebar 재생성, route 전환과 BFCache에서 서로 다른 기능의 정리 순서가 암묵적이다.
- popup·시작 시각·banner는 기존 AF04 목록에서 별도 이름이 없어 이전 때 누락될 수 있다.
- site-owned selector가 기능 코드에 다시 늘어나면 AF03 adapter 경계가 약해질 수 있다.

## 3. 고정 범위

### 포함

- 네 수기 JavaScript 출력의 TypeScript source graph 전환
- `KnifeRuntime`의 audio/player/preview 공개 API 타입 명시
- feature별 installer, scope, status와 dispose 경계
- `inject` 내부를 chat, sidebar, popup, page integration과 coordinator로 분리
- feature가 사용하는 기존 site-owned selector를 좁은 adapter capability로 이동
- 생성·drift·graph·strict·기능 회귀·설치형 E2E 갱신

### 제외

- 새 기능, 새 옵션, 설정 기본값과 UI 변경
- `web/main.js` ISOLATED bridge, 영상 filter와 CSS 등록 구조의 TypeScript 전환
- manifest 파일명·로드 순서·권한·host permission 변경
- storage key, localStorage key와 저장 의미 변경
- CHZZK API endpoint, credentials, cache lifetime와 timeout 변경
- HLS vendor 교체·업데이트와 DRM·연령 제한 우회
- 컴프레서 파라미터·Gain 범위·limiter 곡선 변경
- 새로운 공통 framework, UI library 또는 dependency 도입

`web/main.js`는 ISOLATED execution world의 설정·상태 bridge와 영상 filter를 함께 가진다. AF04에서 이를 건드리면 한 단계가 두 execution world를 동시에 변경하므로 중단 조건에 해당한다. 선언적 CSS와 동적 style 등록도 그대로 유지한다.

## 4. 검토한 접근

### 선택: 기존 출력 파일별 TypeScript graph

각 기존 출력 파일에 하나의 TypeScript entry를 두고 필요한 내부 모듈만 bundle한다. 저장소에 포함되는 출력 이름과 manifest 순서는 유지된다. 이미 쓰는 esbuild classic IIFE 설정과 generated-runtime guard를 재사용한다.

장점은 기능별 롤백, 기존 설치 계약 유지, 작은 import graph와 단계별 공개 CI다. 단점은 서로 다른 출력 파일 사이에서 runtime ABI를 통해 의존해야 한다는 점이다. 이를 `KnifeRuntime`의 좁은 interface로 고정한다.

### 제외: 하나의 MAIN 기능 bundle

모든 기능을 한 entry로 합치면 import는 단순하지만 오디오·HLS·DOM 기능의 parse/startup 실패 범위가 하나가 된다. manifest·패키지 resource와 롤백 단위도 달라진다.

### 제외: JavaScript를 한 파일씩 TypeScript로만 복사

빠르지만 `inject` 책임 혼합, observer 소유권과 failure isolation을 개선하지 못한다. `inject` entry에 조립만 남긴다는 완료 조건을 충족하지 않는다.

### 제외: 기능마다 새 배포 JavaScript 추가

내부 module 수와 배포 script 수를 같게 만들면 manifest 순서와 runtime inventory가 커진다. 내부 TypeScript module은 bundle에만 사용하고 배포 출력은 기존 네 파일로 제한한다.

## 5. 목표 파일 구조

```text
src/main/
  runtime/
    contracts.ts             기존 runtime과 공개 feature API 계약
  site-adapter/
    contracts.ts             기능이 요청하는 좁은 site capability
    capabilities.ts          검증·identity·site operation
  features/
    audio/
      contracts.ts
      curve.ts
      controller.ts
      entry.ts
    player/
      seek.ts
      controls.ts
      entry.ts
    preview/
      contracts.ts
      playback.ts
      panel.ts
      entry.ts
    inject/
      chat.ts
      sidebar.ts
      popup.ts
      page.ts
      coordinator.ts
      entry.ts
```

파일은 실제 책임이 분리될 때만 만든다. 한 번만 호출되는 trivial helper를 별도 파일로 만들지 않는다. 구현 중 두 파일이 항상 함께 변하고 독립 검사가 불가능하면 합친다.

생성 출력은 다음과 같다.

| TypeScript entry | 저장소 출력 |
| --- | --- |
| `src/main/features/audio/entry.ts` | `web/audio.js` |
| `src/main/features/player/entry.ts` | `web/player.js` |
| `src/main/features/preview/entry.ts` | `web/preview.js` |
| `src/main/features/inject/entry.ts` | `web/inject.js` |

`scripts/main-runtime.mjs`가 AF03의 runtime·adapter entry와 위 feature entry를 같은 결정적 생성 계약으로 관리한다. 각 단계에서 실제 전환된 entry만 output set에 추가하며, 수기 파일과 생성 파일을 동시에 authority로 두지 않는다.

## 6. 공통 기능 계약

### 6.1 공개 API

`src/main/runtime/contracts.ts`의 `audio`, `player`, `preview`는 `unknown` 대신 현재 공개 method만 가진 interface가 된다.

- audio: `setEnabled`, `getState`, `setGain`, `configure`, `bypass`, `subscribe`, `eligible`
- player: `seek`, `liveEdge`, `ranges`, `readStats`
- preview: `diagnostics`, `show`, `hide`

이름, 인자 의미, return/Promise 의미와 optional 상태는 현재 JavaScript ABI를 유지한다. AF05 전에는 전역 property를 제거하거나 이름을 바꾸지 않는다.

### 6.2 설치

각 entry는 다음 순서를 따른다.

1. symbol registry에서 현재 runtime을 own data descriptor로 읽는다.
2. runtime이 없거나 해당 공개 API가 이미 있으면 아무 작업도 하지 않는다.
3. 필요한 scope·state·callback을 완성한다.
4. 공개 API를 한 번만 설치한다.
5. subscriber와 lifecycle callback을 연결한다.

부분 생성된 API를 먼저 공개하지 않는다. 초기화 실패는 그 기능의 기존 status key만 `failed` 또는 `limited`로 바꾸고 예외 object·URL·config를 외부로 기록하지 않는다.

공통 generic feature manager는 만들지 않는다. audio의 비가역 media source, preview의 요청·HLS 정리와 DOM 기능의 mount/dispose는 서로 다른 계약이다. 공유하는 것은 runtime scope와 TypeScript interface뿐이다.

### 6.3 수명주기

- listener, observer, timeout과 interval은 해당 기능이 소유한 `ResourceScope`에 등록한다.
- `runtime.subscribe()` 반환 unsubscribe도 owner scope에서 정리한다.
- mount 대상 identity가 바뀌면 이전 mount를 먼저 정리한 뒤 새 mount를 만든다.
- dispose는 여러 번 호출해도 같은 결과여야 한다.
- 다른 writer가 교체한 property, attribute, callback과 DOM node는 정리하지 않는다.
- 비동기 완료는 generation, scope state와 현재 target identity를 다시 확인한다.

기존 pagehide 의미를 기능마다 보존한다.

| 기능 | `persisted:true` | 최종 pagehide |
| --- | --- | --- |
| audio | audible path 유지 | connected entry bypass 후 owner scope 정리 |
| player | 현재 mount 유지·복원 가능 | 현재 mount 정리 |
| preview | stream·panel 즉시 정리 | stream·panel과 owner scope 정리 |
| inject 기능 | owner 유지·재조정 | owner와 popup 정리 |

이 표를 하나의 공통 pagehide handler로 합치지 않는다.

### 6.4 상태와 실패 격리

각 모듈이 쓸 수 있는 status key를 고정한다.

| 모듈 | status key |
| --- | --- |
| audio | `compressor` |
| player | `player`, `statistics` |
| preview | `preview`, `livePreview` |
| chat | `chatResize`, `chatTimestamp`, `donationChat`, `deletedChat` |
| sidebar | `sidebarRefresh`, `expandFollowings` |
| page | `startTime` |

callback 경계는 예외를 잡아 owner status만 실패시킨다. 한 subscriber 실패 뒤에도 runtime은 다음 subscriber를 호출한다. 알 수 없는 reason string, exception stack과 site object는 status payload에 넣지 않는다.

## 7. 단계별 설계

### AF04-A — audio

오디오를 먼저 옮겨 player가 사용할 typed API를 만든다.

- 숫자 clamp, compressor delay, limiter curve와 Gain interpolation을 현재 값 그대로 이전한다.
- `createMediaElementSource()` 호출 전 모든 output node를 준비한다.
- source interception 뒤 실패하면 dry audible path를 우선 복구한다.
- 같은 video는 하나의 entry와 source만 가진다.
- React control remount만으로 video를 bypass하지 않는다.
- detached retirement는 현재 5초·1초 검사 의미를 유지한다.
- `knifeGain` localStorage key, 0–2 범위와 fallback 1을 유지한다.

오디오 전환은 기존 객관 측정 artifact와 브라우저 sample-rate 검사를 반드시 통과해야 한다.

### AF04-B — player

player는 AF04-A의 `AudioController`만 사용한다.

- live seek 범위 계산과 5초 이동, live edge, 키 이벤트 예외를 유지한다.
- 길게 누르기 pointer identity, 이동 취소, click 차단과 playbackRate 복원을 유지한다.
- player·layout·video·route identity 중 하나가 바뀌면 mount를 교체한다.
- compressor 버튼·48px Gain slider·8px 여백과 접근성 label을 유지한다.
- 통계 overlay는 adapter의 primitive metrics만 사용하며 추정 bitrate·latency를 추가하지 않는다.
- controls가 remount돼도 같은 video의 audio graph는 유지한다.

### AF04-C — preview

preview는 panel/intent와 HLS playback을 분리하되 하나의 `web/preview.js`로 생성한다.

- live URL은 같은 origin의 32자리 channel ID만 허용한다.
- 기존 live-detail endpoint, `credentials:'include'`, 5초 요청 timeout과 cache 100개 상한을 유지한다.
- OPEN cache 30초, 그 외 5초와 video metadata가 아닌 live-detail payload 범위를 유지한다.
- HLS worker 비활성, buffer 상한, initial level 선택, recovery 2회와 15초 startup timeout을 유지한다.
- hover delay에는 이미 지난 network 시간이 포함된다.
- 자동 음소거 해제, autoplay 거부 시 1회 muted fallback과 우클릭 toggle 의미를 유지한다.
- 401/403 또는 playback path 없음은 명시적 limited 상태이며 우회하지 않는다.
- stale fetch/HLS/media event는 token·anchor·href·route identity를 통과하지 못하면 아무 작업도 하지 않는다.

### AF04-D — inject 분해

`web/inject.js`는 내부 module을 bundle한 하나의 기존 출력으로 남는다.

#### chat

- chat width drag와 `chatWidth` localStorage 의미
- timestamp row와 live/VOD 시간 형식
- donation type filter
- 삭제 메시지 retention·identity·native callback 순서·re-hide

chat의 React/controller 접근은 site adapter capability만 사용한다. row ordinal이나 DOM text만으로 메시지 identity를 추정하지 않는다.

#### sidebar

- section marker와 기존 CSS 연결
- native refresh 30초 주기
- 사용자 접기 의도, wide/normal 전환과 한 번의 자동 펼침 settlement
- sidebar anchor의 preview show/hide와 popup drag payload

sidebar tree마다 observer 하나와 refresh timer 하나만 허용한다. module 분리 때문에 document 전체 observer를 추가하지 않는다.

#### popup

- 같은 origin live URL만 iframe으로 연다.
- 기존 autoplay/encrypted-media/picture-in-picture allow와 drag·z-index·close 동작을 유지한다.
- scope dispose 시 iframe을 `about:blank`로 바꾸고 소유 DOM만 제거한다.

#### page

- channel chat button
- live/VOD 시작 시각 annotation과 현재 endpoint/cache/timeout
- banner close capability
- home content root의 `data-knife-home` marker

별도 style manager는 만들지 않는다. chat width는 chat, sidebar marker는 sidebar, home marker는 page가 소유한다. 선언적 표현은 기존 `web/main.css`와 등록 CSS에 남긴다.

#### coordinator

coordinator는 runtime state를 받아 feature mount를 호출하고 owner generation을 관리한다. DOM query, fetch, UI 생성과 기능 정책을 직접 구현하지 않는다. route excluded와 최종 pagehide에서 소유 기능을 정리한다.

## 8. site adapter 경계

AF04는 TypeScript 이전을 이유로 raw React, webpack, controller와 core player type을 기능 graph에 노출하지 않는다.

- site-owned hashed class와 native control selector는 adapter가 찾는다.
- adapter는 검증된 primitive snapshot, Element identity 또는 identity-checked operation만 반환한다.
- 표준 의미가 있는 `video`, `a[href]`, ARIA role과 확장 소유 `.knife-*`, `data-knife-*` selector는 기능에 남길 수 있다.
- accessor 실행, unbounded traversal과 raw object 반환은 금지한다.
- adapter capability가 없으면 해당 기능만 pending/limited가 되고 나머지는 계속 동작한다.

adapter가 모든 DOM 정책을 흡수하지는 않는다. 사이트 구조를 찾고 안전하게 조작하는 책임만 가지며 삭제 채팅 표시, sidebar 펼침 의도와 preview 재생 정책은 기능 모듈에 남는다.

## 9. 생성·배포 계약

- esbuild target은 기존 Chrome 121, format은 classic IIFE다.
- source map, TypeScript source와 개발 artifact는 패키지에 포함하지 않는다.
- 생성 marker와 LF 고정, 결정적 두 번 생성, read-only check와 CI write 거부를 유지한다.
- build·candidate·package는 stale feature 출력을 거부한다.
- `manifest.json`과 packaged resource 20개 집합은 변하지 않는다.
- runtime executable baseline은 각 단계의 검증된 생성 출력 hash로만 갱신한다.
- HLS vendor는 feature graph 입력이 아니며 기존 provenance·hardening gate를 그대로 통과해야 한다.

## 10. 데이터·권한·스토어 정책 불변성

AF04는 다음을 추가하지 않는다.

- permission 또는 host permission
- storage/localStorage key
- endpoint, telemetry, analytics, remote code
- 사용자·채팅·시청 기록의 새 수집·보존·전송
- 인증·연령 제한·DRM 우회

preview와 시작 시각 요청은 현재 사용자가 연 CHZZK 페이지에서 현재 endpoint로만 나간다. request path, cookie 전달, cache 상한과 폐기 시간을 바꾸지 않는다. 새 데이터 처리가 필요해지면 AF04를 중지하고 개인정보·스토어 정책 설계를 별도 승인받는다.

## 11. 검증 전략

각 하위 단계는 실패 검사부터 시작하고 다음 순서로 검증한다.

1. 기능 집중 단위·DOM·수명주기 검사
2. generated output 결정성·drift·graph·strict 검사
3. 관련 통합 회귀와 `inject` 조립 검사
4. 전체 Node suite 단일 동시성
5. build, package와 runtime inventory
6. 객관 오디오 Chrome 검사
7. 설치형 positive/negative E2E와 다중 창
8. npm audit, Gitleaks, ESLint 도구 감사
9. 공개 Windows/Ubuntu CI와 한글 PR

집중 검사는 다음 실패 입력을 반드시 포함한다.

- runtime 또는 선행 feature API 누락·중복 설치
- mount 중 target 교체와 dispose 뒤 늦은 callback
- BFCache persisted와 최종 pagehide 반복
- adapter capability 누락·형식 오류·accessor/Proxy
- preview stale fetch/HLS event, autoplay 거부와 401/403
- audio source interception 뒤 node 생성·connect 실패
- sidebar native control 교체, wide/normal 반복과 사용자 접기
- chat row 재사용, message list 교체와 foreign callback

실제 사이트 smoke는 결정적 fixture와 별도 기록한다. 실제 계정·쿠키·채팅 내용을 공개 artifact에 저장하지 않는다.

## 12. 공격적 검토

### 12.1 TypeScript 전환이 동작을 조용히 바꿀 위험

타입을 맞추기 위해 truthy 검사, optional chaining, number 변환과 fallback을 정리하면 기존 경계값이 달라질 수 있다.

**통제:** 현재 값·순서·timeout·범위를 먼저 characterization test로 고정한다. 타입 오류는 runtime cast가 아니라 validator 또는 명시적 기존 fallback으로 해결한다.

### 12.2 공통 abstraction이 기능별 수명주기를 망가뜨릴 위험

하나의 manager나 공통 pagehide 처리로 줄이면 audio의 audible path, preview의 즉시 stream 중단과 DOM owner의 BFCache 의미가 섞인다.

**통제:** 공통 manager를 만들지 않고 scope primitive와 interface만 공유한다. 기능별 pagehide 테스트를 유지한다.

### 12.3 `inject` 분리 뒤 순서가 달라질 위험

현재 한 subscriber 안에서 config 복사, following mode 동기화, owner 재생성, sidebar/chat/page 연결이 고정 순서로 실행된다.

**통제:** coordinator에 이 순서를 명시하고 한 reconcile에서 각 mount 호출 횟수와 정리 순서를 검사한다. 병렬 초기화하지 않는다.

### 12.4 observer·timer가 늘어날 위험

코드를 파일로 나누면서 각 모듈이 document observer를 만들면 성능과 중복 activation이 악화된다.

**통제:** runtime observer는 그대로 하나이며 chat/sidebar는 기존 root 단위 observer 상한을 유지한다. 새 polling과 document-wide scan은 금지한다.

### 12.5 generated file 전환 중 authority가 둘이 될 위험

수기 JS와 TS가 함께 수정되면 어느 쪽이 제품 원본인지 모호해진다.

**통제:** 각 하위 단계에서 failing generation test를 먼저 추가한 뒤 해당 출력의 authority를 한 커밋에서 TS로 전환한다. 생성 이후 수기 수정은 drift로 실패한다.

### 12.6 site adapter가 두 번째 monolith가 될 위험

모든 selector와 정책을 adapter에 넣으면 기능 파일은 작아져도 변경 영향이 adapter에 집중된다.

**통제:** adapter는 discovery와 safe operation만 제공한다. 사용자 정책, cache, 표시와 재생 결정은 feature가 소유한다.

### 12.7 데이터 처리 범위가 확장될 위험

typed cache나 diagnostics를 도입하면서 현재보다 많은 live-detail·chat 정보를 보존할 수 있다.

**통제:** 기존 cache field와 TTL만 표현하며 새 persistent storage와 diagnostic payload를 금지한다. primitive status reason 외의 외부 데이터는 기록하지 않는다.

### 12.8 작은 단계가 실제로는 독립 rollback이 아닐 위험

player가 audio의 새 API, inject가 preview의 새 API에 의존하므로 중간 단계가 불완전할 수 있다.

**통제:** 기존 공개 ABI를 먼저 타입으로 고정하고 각 단계가 병합 시점에 완전한 제품이어야 한다. 다음 단계 source를 미리 연결하지 않는다.

## 13. 단계와 롤백

순서는 AF04-A audio → AF04-B player → AF04-C preview → AF04-D inject다. 각 단계는 별도 한글 PR과 merge commit을 가진다. 이전 단계의 공개 CI와 병합이 끝나기 전 다음 제품 구현을 시작하지 않는다.

이 문서는 네 단계가 공유하는 ABI·생성·수명주기 경계를 정하는 상위 명세다. 구현 계획은 단계별 네 문서로 나눠 각 계획이 독립적으로 실행·검토·롤백 가능하게 한다. 네 계획을 모두 작성·자체 검토한 뒤 구현 전 한 번의 묶음 승인으로 제시한다.

문제가 생기면 최신 `main`에서 해당 단계의 merge commit만 `git revert -m 1`로 되돌리고 그 단계 전 전체 게이트를 재실행한다. 강제 reset, storage 삭제와 manifest 권한 변경은 사용하지 않는다.

## 14. 중단 조건

다음 중 하나가 필요하면 구현을 중지하고 설계를 다시 승인받는다.

- 기존 출력 파일·manifest 순서 또는 packaged resource 집합 변경
- 새 권한, endpoint, storage key 또는 사용자 데이터 처리
- 기존 기능 동작·설정 기본값·지원 범위 변경
- 한 하위 단계에서 두 execution world 동시 변경
- raw React/webpack/controller/core-player가 feature type으로 노출
- 기능별 독립 rollback이 불가능한 공통 bundle 필요
- 테스트를 통과시키기 위한 범위·상한·보안 gate 완화

## 15. 완료 조건

AF04는 다음을 모두 충족해야 완료다.

- 네 기존 출력이 TypeScript source graph에서 결정적으로 생성된다.
- `web/inject.js` entry에는 기능 조립과 등록만 남는다.
- audio/player/preview 공개 API와 feature 간 의존성이 strict typecheck를 통과한다.
- 각 기능의 mount/dispose/status와 실패 격리가 집중 검사로 고정된다.
- popup·시작 시각·banner·home marker를 포함한 기존 `inject` 책임이 누락되지 않는다.
- manifest, 권한, 데이터, endpoint, package resource와 사용자 동작이 넓어지지 않는다.
- 전체 회귀·객관 오디오·다중 창·설치형 positive/negative E2E·도구 감사가 통과한다.
- 네 하위 단계의 공개 CI와 병합 근거가 validation과 `PLANS.md`에 기록된다.

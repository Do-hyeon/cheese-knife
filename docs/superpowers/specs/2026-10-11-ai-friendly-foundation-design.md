# AI 친화적 유지보수 기반 장기 설계

작성일: 2026-10-11 (Asia/Seoul)

## 1. 목적

치즈 나이프 커뮤니티 복구판의 다음 개발 단계는 새 기능 추가가 아니라 장기 유지보수 기반 확립이다. 목표는 사람과 AI 작업자가 변경 범위와 계약을 빠르게 파악하고, 컴파일러와 실제 설치 산출물 검증을 통해 잘못된 변경을 공개 전에 차단할 수 있는 구조다.

이 설계는 다음 결정을 고정한다.

- 설치된 Chrome MV3 확장을 실제 산출물 기준으로 검증하는 E2E를 가장 먼저 구축한다.
- TypeScript를 첫 번째 기능 개발 언어가 아니라 장기 목표 언어로 채택한다.
- 기존 JavaScript의 전면 일괄 변환은 하지 않는다.
- 모듈을 분리할 때 같은 코드를 JavaScript와 TypeScript로 두 번 고치지 않고, 보호된 경계부터 TypeScript로 직접 이전한다.
- React/Vue는 도입하지 않는다.
- Webpack/Vite 도입을 목표로 삼지 않는다. 필요한 출력 계약을 만족하는 최소 빌드 도구만 선택한다.
- 기반 단계가 끝날 때까지 F00 이후의 기능 로드맵을 동결한다.

## 2. 성공 기준

다음 조건을 모두 만족해야 기능 로드맵을 재개할 수 있다.

1. 빌드된 `dist`를 격리된 Chrome 프로필에 설치해 popup, background service worker, ISOLATED world, MAIN world와 페이지 fixture를 한 흐름으로 자동 검증한다.
2. 설정 변경, 메시지 전달, 페이지 적용, 다중 탭·창, worker 재시작, BFCache 수명주기와 확장 컨텍스트 종료의 핵심 계약을 자동 검사로 보호한다. 실제 BFCache 복원은 Playwright가 지원하지 않으므로 설치형 E2E의 합격 조건으로 거짓 주장하지 않는다.
3. 신규 첫 번째 당사자 런타임 코드는 TypeScript로 작성하고 `strict` 타입 검사를 통과한다.
4. MAIN/ISOLATED/background/UI 경계와 치지직 DOM·내부 상태 경계를 명시적인 인터페이스와 런타임 검사로 구분한다.
5. `web/inject.js`의 기능 책임이 테스트 가능한 기능 모듈로 분리되고, 진입점은 조정 역할만 담당한다.
6. 빌드 결과가 재현 가능하고, 배포 패키지에는 원격 코드·개발 자료·승인되지 않은 source map이 포함되지 않는다.
7. 기존 단위·통합·오디오·HLS·패키지 검사가 유지되고 새 설치형 E2E가 공개 게이트에 포함된다.
8. 권한, 사용자 데이터 처리, 외부 전송과 Chrome 웹 스토어 공개 내용이 기존 2.13.3 계약보다 넓어지지 않는다.

## 3. 비목표

- 새 사용자 기능 구현
- UI 프레임워크 교체
- 화면 디자인 개편
- 모든 파일을 한 PR에서 TypeScript로 변환
- 치지직 내부 React/webpack 구조를 정적 타입만으로 신뢰
- 실제 사용자 계정·쿠키·결제·후원·연령 제한 콘텐츠를 CI fixture로 사용
- Firefox 지원 복구
- 보안 도구 결과를 제품 전체의 무취약성 증명으로 확대

기반 작업 중 발견한 기능 결함은 데이터 손실, 재생 불능, 보안·스토어 정책 위반 또는 공개 버전의 중대 회귀일 때만 즉시 수정한다. 그 밖의 개선은 기능 로드맵으로 돌린다.

## 4. 공격적 검토 결론

### 4.1 JavaScript와 JSDoc만 유지하는 안

초기 변경량은 작지만 전역 객체, manifest 파일 순서와 암묵적인 메시지 형태가 계속 계약 역할을 한다. AI가 관련 파일 전체를 읽지 않고 수정하면 잘못된 필드, 누락된 분기와 실행 세계 혼동을 컴파일 전에 차단할 수 없다. 장기 목표로 채택하지 않는다.

### 4.2 즉시 전면 TypeScript로 바꾸는 안

파일 확장자, 빌드, 진입점, 전역 연결과 테스트 fixture가 동시에 바뀐다. 이 저장소의 주요 결함은 DOM 교체, MutationObserver 경쟁, BFCache, 오디오 수명주기와 여러 실행 세계 사이의 시간적 동작이므로 정적 타입만으로 보호되지 않는다. 회귀 원인도 분리하기 어렵다. 채택하지 않는다.

### 4.3 E2E 뒤 경계부터 점진적으로 전환하는 안

현재 동작을 먼저 산출물 수준에서 고정하고, 순수 계약과 새 모듈부터 TypeScript로 옮긴다. 런타임 검증과 E2E를 유지하면서 암묵적 전역을 줄일 수 있다. 이 안을 채택한다.

## 5. 목표 구조

장기 소스 구조는 다음 책임을 기준으로 한다. 실제 파일명은 구현 계획에서 확정하되 책임을 다시 합치지 않는다.

```text
src/
  shared/             설정, 메시지, 상태, 오류와 런타임 validator
  background/         service worker와 저장 broker
  ui/                 popup, styles, permission 화면
  content/isolated/   Chrome API와 페이지 MAIN world 사이의 최소 bridge
  content/main/
    runtime/           route, scope, 수명주기와 상태 진단
    site-adapter/      치지직 DOM·React·webpack 불안정 경계
    features/          audio, player, preview, chat, sidebar 등 기능 단위
    index.ts           의존성 조립과 기능 등록만 수행
```

배포 파일명은 가능한 한 현재 manifest 계약을 유지한다. 구현 소스는 import/export를 사용하고, content script처럼 브라우저가 모듈 진입점을 직접 지원하지 않는 경계만 빌드 단계에서 자체 포함 번들로 만든다.

### 5.1 모듈 계약

- 기능 모듈은 필요한 DOM이나 전역을 직접 탐색하지 않고 `runtime`, `siteAdapter`, 설정과 수명주기 scope를 의존성으로 받는다.
- 기능 초기화는 명시적인 `mount` 또는 동일한 단일 진입 계약을 사용하고 dispose 경로를 항상 제공한다.
- 외부 페이지에서 읽은 값, `window.postMessage`, Chrome runtime message와 storage 값은 모두 `unknown`에서 시작해 런타임 validator를 통과한다.
- 정적 타입은 validator를 대체하지 않는다.
- site adapter만 React fiber, webpack runtime과 불안정한 CSS/DOM 선택자를 소유한다.
- 기능 코드는 site adapter 내부 구현에 직접 접근하지 않는다.

### 5.2 타입 규칙

- 새 첫 번째 당사자 런타임 파일은 기반 도입 이후 `.ts`로 작성한다.
- `strict`, `noUncheckedIndexedAccess`와 실제 Chrome API 타입을 사용한다.
- `any`, `@ts-ignore`, 무검증 이중 단언은 기본적으로 금지한다. 불가피한 예외는 코드 옆에 근거와 제거 조건을 남기고 정적 원장으로 추적한다.
- 기존 JavaScript의 `checkJs`/JSDoc은 이행 수단이며 최종 구조가 아니다.
- vendor HLS 번들, 고정된 외부 코드와 생성 산출물은 TypeScript 변환 대상에서 제외한다.

## 6. 설치형 MV3 E2E

### 6.1 원칙

- E2E는 소스 파일을 DevTools로 주입하지 않고 실제 빌드된 `dist`를 불러온다.
- 매 실행마다 격리된 사용자 데이터 디렉터리를 사용한다.
- 확장 ID를 하드코딩하지 않고 service worker 또는 설치된 extension URL에서 발견한다.
- `https://chzzk.naver.com/*` 요청을 Playwright route fixture로 응답해 manifest match와 실행 origin을 유지한다.
- 실제 계정, 쿠키, 개인 채팅과 외부 방송 상태를 합격 조건으로 사용하지 않는다.
- 실제 치지직 smoke 검사는 사이트 연결점 확인용 별도 검사로 유지하며 결정적 E2E를 대체하지 않는다.

### 6.2 최소 시나리오

1. 확장 설치, service worker 기동과 popup 열기
2. popup 설정 변경과 broker 저장 확인
3. ISOLATED→MAIN 설정 handshake와 페이지 적용
4. styles 화면이 캡처한 원래 탭만 새로고침하는 계약
5. 두 popup/styles 창의 서로 다른 필드 병합과 최신 snapshot 동기화
6. 두 탭·두 창에서 설정 공유와 오디오·미리보기 상태 비간섭
7. service worker 종료·재시작 뒤 설정 보존
8. SPA route 변경, 설치된 content script에 대한 합성 BFCache `pageshow`/`pagehide`, 최종 탭 종료
9. 확장 새로고침 뒤 이전 content script의 context invalidation 정리
10. 잘못된 메시지, 오래된 revision과 손상 storage 값 거부

fixture가 실제 사이트의 모든 DOM을 흉내 내려고 해서는 안 된다. 각 fixture는 검증하려는 계약에 필요한 최소 DOM과 이벤트만 제공하며, 실제 사이트 drift는 별도 adapter 검사와 smoke 검사로 탐지한다.

Playwright는 기본적으로 BFCache를 비활성화하며, 명시적으로 활성화해도 BFCache 복원 검사를 지원하지 않는다. 따라서 AF00은 설치된 확장의 실제 content script에 `persisted: true` 수명주기 이벤트를 전달하는 E2E와 기존 상태 전이 단위·통합 검사를 합격 게이트로 사용한다. 실제 Chrome의 back/forward 복원은 비결정적 수동 smoke로만 기록하며 자동 PASS를 대체하지 않는다. 이 한계를 숨기기 위해 Playwright 기본 인수를 임의로 제거하거나 합격 조건을 완화하지 않는다.

근거: [Playwright BFCache 제한](https://playwright.dev/docs/next/navigations#backforward-cache-bfcache), [Playwright Chrome 확장 검사](https://playwright.dev/docs/next/chrome-extensions).

## 7. 빌드 전략

### 7.1 출력 계약

- background, popup, styles, permission, ISOLATED content와 MAIN content를 독립 엔트리로 관리한다.
- MAIN/ISOLATED content 출력은 각각 자체 포함 로컬 번들이어야 한다.
- production 산출물은 압축하지 않아 검토 가능성을 유지한다.
- 빌드 입력·도구 버전·출력 파일 목록을 lockfile과 검증 보고서로 고정한다.
- 개발 source map은 private 후보에서만 사용하고 스토어 ZIP에는 포함하지 않는다.
- 원격 코드, `eval`, `new Function`과 런타임 CDN 의존성을 추가하지 않는다.
- 기존 `check-package.mjs`가 manifest 참조, 금지 파일, 라이선스와 vendor provenance를 계속 검사한다.

### 7.2 도구 선택 규칙

도구 이름을 목표로 삼지 않는다. 구현 계획 단계에서 작은 proof를 만들고 다음 순서로 결정한다.

1. TypeScript compiler만으로 명시적 모듈과 현재 content entry 계약을 보존할 수 있으면 추가 번들러를 도입하지 않는다.
2. 자체 포함 content entry에 번들이 필요하면 단일 목적의 최소 번들러를 선택한다.
3. HMR, 개발 서버와 UI 프레임워크 기능을 위해 Vite를 도입하지 않는다.
4. 설정 규모가 큰 Webpack은 현재 요구만으로 도입하지 않는다.
5. 후보 도구가 비결정적 출력, 숨은 원격 접근, 검토 곤란한 생성물 또는 라이선스 추적 공백을 만들면 채택하지 않는다.

도구 선택 proof는 제품 파일을 바꾸지 않는 별도 실험 커밋에서 비교하고, 선택되지 않은 설정은 제거한다.

## 8. 단계별 장기 계획

### AF00 — 기준선과 설치형 E2E

- 현재 `main`, 공개 릴리즈, 스토어 버전과 `dist` 해시를 고정한다.
- 기존 Playwright 합성 검사를 재사용할 수 있는 fixture 계층과 설치형 harness를 만든다.
- 최소 시나리오를 자동화하고 실패 artifact를 private `output`에 남긴다.
- CI에서 실행 가능한 결정적 부분과 로컬 Chrome이 필요한 부분을 구분한다.

완료 조건: 제품 코드를 구조적으로 바꾸기 전 핵심 설치 흐름이 자동으로 재현되고, 의도적으로 계약을 깨뜨린 변형을 검출한다.

### AF01 — 타입·빌드 전환 기반

- TypeScript strict 설정과 Chrome 타입을 도입한다.
- 기존 JavaScript에는 동작을 바꾸지 않는 범위에서 `checkJs`를 적용한다.
- 엔트리별 build proof로 출력 계약과 디버깅 가능성을 검증한다.
- 새 첫 번째 당사자 런타임 JavaScript 추가를 정적 검사로 금지한다.

완료 조건: 타입 검사와 build proof가 기존 테스트·설치형 E2E·패키지 검사를 통과하고, production 산출물은 아직 기존 동작과 동일하다.

### AF02 — 계약 우선 TypeScript 전환

- 설정 schema, message discriminated union, revision, route와 상태 타입을 먼저 이전한다.
- validator 결과와 정적 타입이 하나의 계약을 설명하도록 중복 정의를 줄인다.
- background broker/client와 popup/styles 경계를 다음 순서로 이전한다.
- 동의·저장·외부 전송 범위는 변경하지 않는다.

완료 조건: 잘못된 메시지와 설정 형태가 컴파일 단계와 런타임 단계에서 각각 거부되고, 여러 설정 창의 기존 동작이 E2E에서 유지된다.

### AF03 — MAIN runtime과 site adapter 분리

- route, scope, 상태 진단과 bridge를 명시적 모듈로 이전한다.
- 치지직 React/webpack/DOM 접근을 site adapter에 격리한다.
- 불안정한 사이트 값은 `unknown`과 validator로 다룬다.
- manifest 파일 순서가 아닌 import graph가 의존성을 표현하도록 전환한다.

완료 조건: 치지직 내부 객체가 없거나 형식이 바뀐 fixture에서 기능이 제한 상태로 실패하며 다른 기능과 설정 흐름은 유지된다.

### AF04 — 기능별 모듈 이전

- `web/inject.js`의 audio/player/preview/chat/sidebar/style 책임을 한 번에 하나씩 추출한다.
- 이미 분리된 파일은 계약을 정리하면서 TypeScript로 이전한다.
- 각 기능은 수명주기 scope, status와 dispose 계약을 독립적으로 검증한다.
- 한 기능의 실패가 다른 기능의 초기화와 정리를 막지 않도록 한다.

완료 조건: `inject` 진입점에는 의존성 조립과 등록만 남고, 기능 회귀·다중 탭·페이지 수명 검사가 모두 통과한다.

### AF05 — 이행 종료와 공개 게이트

- 수기로 관리하던 첫 번째 당사자 런타임 JavaScript 원본을 TypeScript로 이전하고 임시 전역 shim을 제거한다. TypeScript에서 생성하는 배포용 JavaScript는 유지하며 직접 수정하지 않는다. 생성 JS의 저장소 추적·drift 비교는 AF02에서 확정한 빌드 계약을 따른다.
- 남은 `any`, ignore와 예외 원장을 0건으로 만들거나 사용자 승인된 근거로 고정한다.
- source와 `dist`의 재현 가능성, 라이선스, CSP, 권한과 스토어 설명 정합성을 검사한다.
- 새 설치·기존 설치 업데이트·설정 보존·롤백을 실제 설치본에서 확인한다.

완료 조건: 기반 변경과 무관한 제품 기능 차이가 없고, 기능 로드맵이 사용할 안정된 TypeScript·E2E·빌드 계약이 공개 문서에 고정된다.

### 기능 로드맵 재개

AF00–AF05 완료 뒤 기존 F00 공통 저장 기반을 새 typed contract 위에서 다시 검토한다. 이후 F01–F05를 순서대로 진행한다. 기존 F00 설계에서 유효한 데이터 최소화·동의·삭제·broker 단일 writer 원칙은 보존하되, 구현 파일과 인터페이스는 새 구조에 맞춰 다시 계획한다.

## 9. 단계별 위험과 중단 조건

| 위험 | 통제 | 중단 조건 |
| --- | --- | --- |
| E2E가 실제 사이트 복제품이 됨 | 최소 계약 fixture와 별도 smoke 분리 | fixture 유지가 제품 코드보다 복잡해짐 |
| 타입 단언으로 오류 은폐 | `any`·ignore 정적 원장과 리뷰 게이트 | 예외가 감소하지 않거나 새 코드에 확산 |
| 빌드 결과 추적 불가 | 비압축 출력, 입력·출력 해시, private source map | 소스와 오류 위치 대응이 불가능 |
| 대규모 동시 변환 | 기능·경계별 작은 커밋과 설치 E2E | 한 단계가 여러 실행 세계와 기능을 동시에 변경 |
| 사이트 내부 타입을 사실로 오인 | adapter에서 `unknown`과 런타임 검증 | React/webpack shape가 기능 타입으로 누출 |
| 스토어 정책 범위 확대 | 권한·CSP·원격 코드·패키지 검증 | 새 권한이나 원격 실행이 필요해짐 |
| 혼합 JS/TS 상태가 영구화 | AF01 이후 신규 JS 금지와 AF05 종료 조건 | 전환 예외에 제거 조건이 없음 |

중단 조건이 발생하면 상한이나 검사 규칙을 완화하지 않는다. 해당 단계의 구조를 다시 설계하고 사용자 승인을 받는다.

## 10. 검증 계층

1. 순수 단위 검사: schema, validator, resolver와 상태 전이
2. jsdom 통합 검사: DOM ownership, lifecycle과 site adapter 제한 동작
3. 번들 검사: entry, CSP 금지 패턴, import graph와 source-output 대응
4. 설치형 MV3 E2E: 실제 `dist`, worker, popup, 두 execution world와 fixture
5. 합성 미디어 검사: 기존 오디오·영상·HLS 수치 및 경계
6. 실제 사이트 smoke: 공개 CHZZK 연결점과 adapter drift만 확인
7. 설치 수용: 새 설치·업데이트·설정 보존·오류 로그·롤백

낮은 계층의 PASS를 높은 계층의 PASS로 대체하지 않는다. 실제 사이트 smoke는 계정 상태나 방송 가용성 때문에 실패할 수 있으므로 결정적 CI 합격과 별도 상태로 기록한다.

## 11. 보안·개인정보·스토어 정책

- 이 기반 작업은 새 사용자 데이터를 저장하지 않는다.
- 권한과 host permission을 확대하지 않는다.
- fixture와 실패 artifact에 실제 쿠키, 토큰, 채팅, 채널 계정 상태를 기록하지 않는다.
- 타입·번들 도구는 개발 의존성이며 스토어 패키지에 포함하지 않는다.
- 모든 실행 코드는 확장 패키지에 포함하며 원격 호스팅 코드를 사용하지 않는다.
- runtime validator, 최대 크기·개수 상한과 prototype key 방어를 유지한다.
- 보안 도구 결과, 기능 E2E와 스토어 정책 점검을 서로 다른 증거로 기록한다.

권한, 데이터 처리, 외부 연결이나 공개 설명이 바뀌는 요구가 발견되면 기반 단계에서 몰래 포함하지 않고 별도 설계·정책 검토·사용자 승인을 받는다.

## 12. 예상 작업 규모

아래 범위는 한 명이 기존 검증을 유지하며 순차 수행하는 상대적 추정치다. 사이트 drift나 설치형 Chrome 제약이 발견되면 달라질 수 있다.

| 단계 | 예상 규모 |
| --- | --- |
| AF00 설치형 E2E | 4–7 작업일 |
| AF01 타입·빌드 기반 | 3–5 작업일 |
| AF02 계약 우선 전환 | 3–6 작업일 |
| AF03 runtime·adapter | 4–8 작업일 |
| AF04 기능별 이전 | 8–15 작업일 |
| AF05 종료·설치 수용 | 3–6 작업일 |

전체 예상은 약 5–9주다. 이는 기능 개발을 병행하지 않고 각 단계의 회귀와 설치 검증을 포함한 범위다. 일정 단축을 위해 E2E, validator, 타입 strictness 또는 설치 수용을 생략하지 않는다.

## 13. 기록과 공개 단위

- 각 AF 단계는 독립 브랜치·한글 PR·검증 문서를 가진다.
- 한 PR에서 제품 동작 변경과 대규모 파일 이동을 함께 하지 않는다.
- generated `dist`, private `output`과 실제 사용자 세션 자료는 Git에 커밋하지 않는다.
- `PLANS.md`에는 현재 AF 커서와 미완료 체크리스트만 둔다.
- 완료 수치와 이전 구조 설명은 archive/validation 문서로 이동한다.
- 기능 로드맵은 AF05 완료 전까지 `BACKLOG-BLOCKED`로 표시한다.

## 14. 승인 게이트

이 문서는 구조 방향을 승인하기 위한 설계다. 승인 뒤에만 다음 작업을 수행한다.

1. `PLANS.md`를 AF00–AF05 우선순위와 체크리스트로 갱신한다.
2. AF00의 정확한 파일, fixture, 테스트, 명령과 커밋 단위를 구현 계획으로 작성한다.
3. 구현 계획을 별도 검토하고 사용자 승인을 받는다.
4. 승인된 AF00만 구현한다.

TypeScript 코드, 새 빌드 도구, manifest 변경과 제품 동작 변경은 이 설계 문서 승인만으로 착수하지 않는다.

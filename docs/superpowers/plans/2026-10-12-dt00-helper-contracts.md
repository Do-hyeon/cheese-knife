# DT00 — 공용 테스트 helper 계약 검사 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 사용자가 2026-10-12에 이 계획과 Native 실행을 승인했다. 검증 수치·제외 범위는 [DT00 검증 기록](../validation/2026-10-12-dt00-helper-contracts.md)으로 분리한다.

**Goal:** 공용 helper와 작은 기존 소비자를 strict `checkJs`로 검사하고, 의도적 오용 검출과 기존 실패 입력·실행 검증 보존을 입증한다.

**Architecture:** `.cjs` 실행·생성 제품 JS 로드를 유지하고 JSDoc 계약만 강화한다. 제품 설정과 별도의 개발 타입 설정에서 helper·기존 bridge 테스트·새 집중 검사를 함께 확인한다. 전체 multi-page/settings fixture 이전은 하지 않는다.

**Tech Stack:** Node 24.19.0, TypeScript 7.0.2, jsdom 30.1.2, Node test runner. 개발 선언 패키지 후보는 `@types/node` 24.19.2·`@types/jsdom` 30.0.0(MIT)이며 npm 공식 registry에서 메타데이터만 확인했다.

**Spec:** [테스트·개발 도구 타입 강화 검토](../specs/2026-10-12-development-tooling-typescript-review.md).

## 고정 조건

- 제품 `tsconfig.json`, 런타임 소스·생성 JS16개·manifest·버전·root `dist`·스토어 제출본은 변경하지 않는다.
- 새 loader·JS 생성 단계·테스트 확장자 변경·보안 감사 범위 확대·HLS 검증 가족 변경은 하지 않는다.
- 제품 TS 타입은 type-only JSDoc 참조에만 사용하며 제품 코드를 테스트에 import해 실행하지 않는다.
- helper의 raw 입력은 `unknown`으로 받아 실제 validator까지 보낸다. negative proof는 해당 타입의 오류를 검사하며 광범위한 `any`·ignore·이중 단언을 성공 수단으로 쓰지 않는다.
- DOM registry 조회와 브라우저 타이머 대체처럼 필요한 경계 단언은 위치·근거를 기록한다. runtime 부재를 타입에서 지우지 않는다.
- `load`의 파일 읽기·eval, 30ms flush, 시계의 정렬·microtask·1000회 상한·DOM 이벤트·MutationObserver 의미를 유지한다.
- 기존 P09·AF05-B 커서와 F00 선행 조건을 바꾸지 않는다. DT01·DT02는 DT00 실효성 평가 후 결정한다.

## 범위와 검토 초점

`multi-page-settings.test.cjs`는 대형 settings fixture를 import하므로 첫 checker 대상 대신 **기존 `bridge.test.cjs`**를 선택한다. multi-page·following 검사는 실행 회귀로 유지한다. 승인 전 기준 회귀는 bridge4 + multi-page14 + following20 = **38/38 통과**했다.

1. 초기화 전·최종 종료 후 runtime은 없을 수 있다: 반환 타입과 실제 부재 검사를 유지한다.
2. malformed config/revision은 helper를 통과해야 한다: raw 입력 거부는 제품 validator가 결정한다.
3. 타이머 취소·같은 시각의 순서·microtask 재예약이 달라지면 실제 회귀가 무의미해진다: 집중 검사로 고정한다.
4. `checkJs`가 켜져도 라이브러리 동적 global이나 `any` 추론이 남을 수 있다: helper 오용과 typed 반환의 실제 오류 검출을 확인하고 남은 경계를 기록한다.
5. CI가 새 파일을 발견하지 못하면 로컬 통과가 의미 없다: 명시적 checker 파일 목록과 foundation 명령 연결을 검사한다.

## Task 1 — 하나의 검증 가능한 DT00 실험

**Files:**

- Modify: `tests/helpers.cjs`, `tests/bridge.test.cjs` — JSDoc·필요한 좁히기와 fixture 계약.
- Create: `tests/helper-contracts.test.cjs` — 생성 JS 실행·부재·raw 입력·시계 의미 집중 검사.
- Create: `tests/development-types.test.cjs` — 설정/CI 포함과 의도적 오용의 컴파일 거부 검사.
- Create: `tsconfig.development.json` — 제품 설정과 분리된 명시적 개발 검사 대상.
- Modify: `package.json`, `package-lock.json` — 선언 패키지 고정과 `typecheck:development` 명령.
- Modify: `.github/workflows/ci.yml` — 기존 Windows·Ubuntu foundation에 개발 타입 검사 추가.
- Modify: `tests/package.test.cjs` — CI 명령 순서 assertion에 새 명령 반영.
- Create: `docs/superpowers/validation/2026-10-12-dt00-helper-contracts.md`; Modify: `PLANS.md` — 비용·검출·제외 범위와 결과 기록.

**Interfaces:**

- `page(html?: string, url?: string): JSDOM`, `load(dom: JSDOM, file: string): void`, `flush(): Promise<void>`.
- `runtime(dom: JSDOM): KnifeRuntime | undefined` — `src/main/runtime/contracts.ts`의 제품 인터페이스를 type-only 참조. registry가 생성 제품 JS의 소유라는 경계 근거를 기록하며 부재를 지우지 않는다.
- `deliver(dom: JSDOM, config?: unknown, revision?: unknown): void` — raw payload를 유지한다. runtime이 없는 호출만 Node `assert.ok`으로 실패하며 `{ code: 'ERR_ASSERTION' }` 검사로 입증한다.
- `clock(dom: JSDOM): { advance(ms: number): Promise<void> }` — 함수 callback만 쓰는 기존 fixture 타이머 경계를 좁게 표현한다. Node 타이머 핸들을 브라우저 숫자 ID와 혼동하지 않는다.
- bridge 로컬 fixture는 `TestContext`, `() => Promise<{ config: Record<string, unknown>; styleParameters: Record<string, unknown> }>`와 `(changes: unknown) => void` 계약을 명시한다. 등록·deferred read 완료를 assertion으로 좁히고 기존 4개 assertion 경로를 보존한다.

- [x] **1. 실패 검사 작성:** `tests/development-types.test.cjs`에서 개발 설정 존재와 `files`에 helper·bridge·두 새 검사 포함, `typecheck:development`의 정확한 명령, 양 OS foundation 연결을 assert한다. 존재하지 않는 설정/명령 때문에 실패하는지 `node --test tests/development-types.test.cjs`로 확인한다.
- [x] **2. 집중 실행 검사 작성:** `tests/helper-contracts.test.cjs`에 아래 실제 assertion을 넣는다. 새 assertion 없이 기존 테스트를 타입 편의상 삭제·축소하지 않는다.
  - 생성 `web/runtime.js` 로드 전 `runtime(dom) === undefined`, 로드 후 requestId가 string, pagehide 후 다시 undefined. `assert.throws(() => deliver(dom), { code: 'ERR_ASSERTION' })`로 로드 전 helper 실패 검사.
  - 정상 `deliver(dom, { arrowSeek: false }, 2)` 후 configReady true·arrowSeek false. config `null`, 배열, 문자열과 revision `'3'`, NaN, Infinity를 전달해도 기존 config를 덮어쓰지 않음. 실패 payload는 `unknown`으로 주고 전송 전 교정하지 않음.
  - clock에서 같은 시각 두 callback의 등록 순서 `[1, 2]`, 취소된 callback 미실행, callback의 microtask가 재예약한 타이머도 advance 안에서 관측. 종료 전 예약 시각 미도달이면 실행하지 않음. DOM MutationObserver를 진짜 DOM으로 관측.
- [x] **3. 실행 기준 확인:** `node --test tests/helper-contracts.test.cjs tests/bridge.test.cjs tests/multi-page-settings.test.cjs tests/following-settlement.test.cjs`. 제품 동작 검사는 현재 코드에서 통과해야 하며 새 helper assertion만 실패하는 것을 확인한다.
- [x] **4. 선언 의존성 고정:** 기존 npm CLI 위치를 확인한다(현재 세션 PATH에 npm은 없다). 필요할 때 공식 npm CLI를 작업용 임시 위치에 준비한다. 선언 패키지만 `--save-dev --save-exact --ignore-scripts`로 설치한다. lockfile의 추가 transitive 선언, 두 undici-types 범위, license·integrity·정확한 변경을 확인하고 관계없는 package 갱신을 거부한다. checker를 위해 기존 제품 의존성 버전을 바꾸지 않는다.
- [x] **5. 별도 타입 설정 작성:** `allowJs`, `checkJs`, `noEmit`, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables` 모두 true; target ES2022; lib ES2023+DOM; module/moduleResolution Node16; types node; typeRoots `./node_modules/@types`; `skipLibCheck` 사용 안 함. `files`는 위 helper·bridge·두 새 검사 네 파일만 명시한다. type-only로 연결되는 제품 interface는 검사하지만 runtime entry를 실행/import하지 않는다.
- [x] **6. helper·소비자 계약 강화:** 위 Interfaces대로 JSDoc·좁은 local fixture 타입을 적용한다. runtime 부재는 소비자가 실제 setup 이후 assertion으로 좁힌다. malformed 입력용 경로와 동적 외부 값은 unknown으로 유지한다. 타이머·로드·대기 시간·DOM/fake의 기존 의미는 바꾸지 않는다.
- [x] **7. 실제 컴파일 거부 증명:** `tests/development-types.test.cjs`는 로컬 tsc를 `process.execPath` + `node_modules/typescript/bin/tsc`로 실행한다. 정상 개발 설정은 status0. ignored `output/development-types-*` 임시 디렉터리에 설정을 extends한 **각각의** 오용 파일을 만들어 비zero status와 해당 파일의 기대 진단을 검사하고 `t.after`로 정리한다. 유효한 대조 파일은 status0이어야 한다.
  - `page(42)`와 `load(page(), 42)`는 TS2345.
  - `clock(page()).advance('30')`는 TS2345.
  - `const api = runtime(page()); assert.ok(api); api.nonexistentField`는 TS2339.
  - 부재를 좁히지 않은 `runtime(page()).requestId`는 TS2532/TS18048.
  - config/revision을 `unknown`으로 전달하는 대조 파일은 허용한다. 실패를 무관한 missing-module 진단으로 대신하지 않는다. 임시 설정은 include를 빈 배열로 override해 선택한 파일만 추가하며 공용 helper도 실제 검사한다.
- [x] **8. CI 연결:** npm script `typecheck:development`는 `tsc -p tsconfig.development.json`. foundation의 기존 `npm run typecheck` 직후에 추가하고 package 순서 검사를 반영한다. 기존 runtime/build proof·설치형 E2E·테스트 glob은 유지한다. 기존 보안 감사 설정은 변경하지 않는다.
- [x] **9. 집중·전체 검증:** 개발·제품 타입 검사, 새 두 검사+bridge+multi-page+following+type-foundation+package 회귀, 공개-checkout 전체 테스트, 격리 후보 build/package와 설치형 positive/negative E2E를 수행한다. 생성 JS16개 diff0·root dist 불변·제품 권한 불변을 확인한다. 기존 private P02 evidence를 다시 생성하거나 덮어쓰지 않는다.
- [ ] **10. 실효성 기록·검토:** 전후 checker 소요 시간, 직접·transitive 의존성, 주석/단언 위치·남은 동적 경계, 오용 진단과 유지한 raw 입력·기존38개 결과를 validation에 기록한다. 광범위한 ignore/단언·대형 fake 재작성 없이는 통과 못하면 실험을 멈추고 결과와 작은 대안을 기록한다. 주 실행자 순차 구현 뒤 Astra max 독립 whole-branch 검토 한 번으로 확인한다.
- [ ] **11. 이력·공개 CI:** 집중 검증 후 커밋하고 한글 PR을 생성·연결한다. 최종 Windows·Ubuntu foundation과 전체 verify 통과 후 기존 승인 범위에서 병합한다. DT01 확대 여부는 실효성 근거로 결정하고 언어 비율을 이유로 자동 확대하지 않는다.

## 승인·실행 방식

이 계획은 작은 연결된 변경 한 단위이므로 **주 실행자 순차 구현(Native) + 최종 독립 검토**를 권장한다. 새 dependency/type config·helper의 초기화 assertion·CI 연결·범위 제한을 함께 승인받고 구현한다. 실제 사이트 계정 조작이나 확장 새로고침은 이 실험에 필요하지 않다.

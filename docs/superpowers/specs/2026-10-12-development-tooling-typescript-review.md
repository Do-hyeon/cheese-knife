# 테스트·개발 도구 타입 강화 검토

작성일: 2026-10-12 / Asia-Seoul. 검토 기준: `493f598`.

## 1. 결론과 우선순위

전체 테스트·개발 도구의 TypeScript 이전은 장기 AI 친화적 유지보수의 필수 조건이 아니다. **공용 helper와 연결된 호출자의 계약을 검사하는 작은 실험부터 진행**하고, 효과가 확인된 경계만 확장한다. 명시적 JSDoc + `checkJs`를 먼저 비교하고, 주석 비용이 커지거나 TS가 더 명료한 경계만 선택적으로 이전한다.

제품의 수기 원본은 이미 TypeScript다. 현재 `.mjs`·`.cjs` 개발 코드가 남은 것은 AF05 제품 이전의 누락이 아니다. GitHub Languages 비율이나 JS 파일 수는 이 작업의 합격 기준이 아니다.

P09·AF05-B 공개 수용의 우선순위와 F00–F05 동결은 바꾸지 않는다. 개발 도구 타입 강화는 **F00의 새 선행 게이트가 아니며**, 상세 구현 계획 승인 후 심사 대기 중에도 독립적으로 실험할 수 있다. 효과 없는 전면 변환으로 기능 개발을 더 지연시키지 않는다.

## 2. 공격적 검토 범위와 결과

주 실행자가 실행 명령·타입 설정·감사 대상 경계를 대조하고, Astra max 두 독립 검토가 테스트·fixture와 도구·실행 체계를 각각 확인했다. 두 검토 모두 전면 이전보다 계약 우선의 제한된 실험을 권고했다.

| 근거와 위험 | 설계에 반영할 조건 |
| --- | --- |
| `tests/helpers.cjs`의 DOM·runtime·시계 helper가 여러 테스트에 연결된다. `tests/multi-page-settings.test.cjs`는 초기 runtime이 없는 상태도 검사한다. | 실제로 없는 값을 존재한다고 단언하지 않는다. 원시 관측과 초기화 완료 반환 계약을 구분하고 기존 소비자까지 검사한다. |
| `tests/settings-fixture.cjs`는 읽기·저장·callback 지연, clone과 callback 한정 `lastError`를 모델링한다. | 컴파일 편의를 위해 지연·복사·오류 수명주기를 단순화하지 않는다. DOM 이벤트와 MutationObserver를 포함한 기존 가짜 시계 의미를 유지한다. |
| `tests/settings-contract.test.cjs`, `tests/settings-client.test.cjs`, `tests/adapter-capabilities.test.cjs`에는 잘못된 타입·reply·접근자·proxy 입력이 있다. | 정상 builder와 별도로 `unknown`/raw 입력 경로를 유지한다. 잘못된 입력 테스트를 삭제하거나 광범위한 `any`·이중 단언으로 숨기지 않는다. |
| `KnifeSettingsOperation`의 현재 `id: string`, `value: boolean \| number`만으로는 ID 오타·값 상관관계·범위·race를 검사하지 못한다. | 생산 타입 재사용을 런타임 validator나 독립 assertion의 대체로 취급하지 않는다. 기대값을 생산 알고리즘으로 계산하지 않는다. |
| `scripts/check-audio-quality.mjs` → `audio-metrics.mjs`·`audio-artifacts.mjs`에는 공유 report 경계가 있다. 일부 artifact 테스트는 부분 report를 의도적으로 허용한다. | producer·consumer를 함께 검사하고 nullable spectral 값·transition kind/value를 표현한다. 부분 report의 기존 허용 계약을 full report 타입으로 덮어쓰지 않는다. |
| `scripts/tool-audit.mjs`의 수집·snapshot·lint 선택과 `eslint.security.config.mjs`는 현재 JS 확장자를 대상으로 한다. | `.mts`/`.cts` 도입 시 파일 inventory·snapshot·ESLint parser/설정·제외 범위와 누락 방지 테스트를 함께 수정한다. 타입 검사 통과가 감사 포함의 증거는 아니다. |
| `package.json`의 `tests/*.test.cjs`, package fixture 복사 목록, CLI 경로와 `import.meta.url` 기반 root, HLS 자식 프로세스·고정 해시가 연결돼 있다. | 이름 변경으로 테스트·CLI·provenance가 빠지지 않는지 명시적으로 확인한다. HLS 검증 가족은 첫 실험에서 제외하고 별도 변경 단위로 다룬다. |
| jsdom·Playwright·브라우저 callback·worklet 문자열은 서로 다른 실행 문맥이다. | Node의 타입을 페이지에 존재하는 값으로 착각하지 않는다. 문자열 안의 코드와 callback 캡처는 타입 검사만으로 보장되지 않으므로 실행 검사를 유지한다. |

이는 코드·계약 검토다. 새 런타임 결함 발견이나 보안 인증으로 해석하지 않는다. 도구 검토자가 실행한 순수 audio-metrics 검사는 13/13 통과했고, 임시 strict `checkJs` 조회의 진단 10개는 미명시 타입 진단이지 입증된 런타임 버그가 아니다. 전체 브라우저 검증이나 타입 강화 실험은 이번 검토에서 실행하지 않았다.

## 3. 가장 작은 후속 작업

### DT00 — 연결된 공용 helper 실험

첫 구현 계획은 `tests/helpers.cjs`의 작은 반환·호출 경계와 기존 소비자 하나를 묶는다. 초기 runtime 부재를 검사하는 `tests/multi-page-settings.test.cjs`가 후보이며, 전체 fixture 그래프를 한 번에 변환하지 않는다.

- 제품 `tsconfig.json`과 분리한 개발 전용 `noEmit` strict 검사 범위를 정한다. `allowJs`·`checkJs`와 명시적 JSDoc의 비용을 먼저 측정한다.
- Node/jsdom 타입 패키지는 현재 직접 설치돼 있지 않다. 필요한 최소 타입·버전·라이선스·lockfile 영향을 상세 계획에서 확인하며 이번 문서 작업에서는 설치하지 않는다.
- helper만 검사하지 말고 호출자와 정상·실패 경로까지 포함한다. DOM·Chrome·Playwright fake 전체를 실제 라이브러리 객체로 재작성하지 않고 필요한 좁은 구조 계약을 사용한다.
- 잘못된 helper 인자·없는 반환 필드 등 의도적 오용이 컴파일 실패하는지 작은 negative proof를 둔다. 새 진단을 억제한 결과를 성공으로 취급하지 않는다.
- 생성 제품 JS를 jsdom에 로드하는 기존 검사를 유지한다. TS 원본 import로 바꿔 배포 ABI·로드 순서 검사를 우회하지 않는다.

### DT01 — 효과가 확인된 계약만 확장

DT00에서 실제 오용 검출과 합리적인 유지비가 확인된 경우에만 진행한다. 테스트 측은 settings fixture의 최소 callback/reply 경계와 소비자를, 도구 측은 오디오 report producer·metrics·artifact consumer를 독립 단위로 검토한다. 전체 테스트 파일을 이전하는 것이 목표는 아니다.

변경하는 기능이 이 경계를 사용하는 시점에 해당 단위를 적용할 수 있다. 정상 report 타입, raw 입력과 부분 report 계약을 구분하고 기존 validator·오류·비교 허용치·calibration·artifact 경로·정리 동작을 유지한다.

### DT02 — 선택적 native TypeScript 실행

명시적 JSDoc의 중복·가독성 비용이 TS보다 큰 것으로 확인된 파일에만 검토한다. 기존 Node 24.19.0의 native 실행을 우선 비교하며 새 loader나 개발 도구용 JS 생성 파이프라인은 기본안이 아니다.

Node의 type stripping은 **타입 검사도 `tsconfig.json` 적용도 하지 않는다**. 별도 strict `tsc --noEmit`, erasable syntax 조건, 명시적 확장자와 type-only import를 검사한다. `.mts`의 ESM·`.cts`의 CommonJS 차이를 보존하고 기존 실행·감사·테스트 발견 명령이 실제 파일을 포함하는지 확인한다. 얇은 CLI, embedded script와 악성 형태 fixture는 JS로 유지할 수 있다.

## 4. 완료·중단 기준

완료 판단은 변환 줄 수가 아니라 다음 증거로 한다.

- 의도적 계약 오용이 checker에서 거부되고, 기존 잘못된 입력이 실제 validator까지 도달한다.
- 기존 테스트 목록·assertion·실패 경로·생성 JS 검사·시간 경계가 유지된다. checker 때문에 잘못된 입력이나 독립 oracle을 제거하지 않는다.
- 기존 감사 대상 파일의 inventory·snapshot·lint 적용 범위를 유지하고, 선택한 실험 파일의 타입 검사·회귀가 CI에 포함된다. 기존 감사 제외 범위는 타입 강화만으로 확대하지 않는다. 제품 생성 byte·패키지 내용·권한·데이터 동작도 바뀌지 않는다.
- Windows·Ubuntu에서 타입 검사와 해당 회귀를 통과하며, 연결된 도구를 바꿀 때 기존 객관 측정·설치형 게이트를 유지한다.
- 추가 의존성·주석·검사 시간과 실제 검출 사례를 기록한다. 효과가 약하면 범위를 확대하지 않고 JS 유지 결정을 남긴다.

광범위한 단언·ignore, 기존 테스트 약화, 대형 fake 재작성, 별도 도구 산출물 생성 체계가 필요해지면 해당 실험을 중단하고 더 작은 계약으로 재설계한다. 강한 report 런타임 검증 등 제품/도구의 동작 변경은 단순 타입 이전과 분리한다.

## 5. 공식 근거

- [Node 24 TypeScript 실행](https://nodejs.org/download/release/v24.19.0/docs/api/typescript.html): native type stripping과 별도 타입 검사, module 형식·확장자·type import 조건.
- [Node test runner](https://nodejs.org/download/release/v24.19.0/docs/api/test.html): 테스트 발견과 명시적 실행 목록. 현재 저장소의 `.test.cjs` glob은 이름을 바꾼 파일을 자동 포함하지 않는다.
- [TypeScript JavaScript 검사](https://www.typescriptlang.org/docs/handbook/type-checking-javascript-files.html): JavaScript 추론과 JSDoc 계약. `checkJs`만 켜면 모든 경계가 엄격해진다고 가정하지 않는다.
- [Playwright 실행 문맥](https://playwright.dev/docs/evaluating): Node와 페이지는 별도 실행 환경이다.

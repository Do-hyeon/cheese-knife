# 정적 경고 경계 보완 설계

작성일: 2026-10-11 / Asia-Seoul

상위 계획: [PLANS.md](../../../PLANS.md)의 P02

상태: **문서 승인 — 상세 구현 계획 검토 대기**

## 목적

현재 ESLint 보안 규칙이 보고하는 75개 관찰 항목을 규칙 비활성화나 기대 개수 완화로 숨기지 않고, 동적 객체 접근과 파일시스템 접근을 검증 가능한 소수의 경계로 축소한다. 기존 Chrome 확장 기능과 개발 도구의 입출력 계약을 유지하고, 각 변경은 실패 검사에서 재현한 뒤 보완한다.

이 작업의 성공은 다음을 의미한다.

- 실행 코드에서 외부·동적 키와 배열 위치가 prototype 변경, 예상하지 않은 필드 생성 또는 범위 밖 교체를 일으키지 않는다.
- 개발 도구가 소유한 루트 밖 경로, 경로 이탈, 링크를 통한 우회 또는 예상하지 않은 출력 위치를 거부한다.
- ESLint 결과에서 기존 75개 관찰의 후속 상태와 새 관찰을 위치 변화가 아닌 실제 코드·검사 근거로 추적할 수 있다.
- HLS 전용 범위, 설치된 `dist`, 실제 배포 상태는 바뀌지 않는다.

경고가 없어지는 것만으로 취약점 부재나 전체 보안 완료를 선언하지 않는다.

## 사용자 결정과 제약

- 권장안인 **검증 가능한 경계로 축소** 방식을 사용한다.
- 파일 단위 또는 규칙 전체 ignore, 경고 수를 맞추기 위한 기대값 완화, 이름만 바꾼 우회 호출을 사용하지 않는다.
- GPT나 Astra의 결과를 보안 판정으로 사용하지 않는다. Astra max 검토가 필요하면 기능 정확성과 회귀만 다룬다.
- 보류된 HLS 네 파일과 HLS 전용 테스트를 변경하거나 실행하지 않는다.
- 기존 root `dist`를 덮어쓰지 않는다. 후보 검사는 새 소유 출력 폴더에서만 수행한다.
- Chrome 전용, MV3, 최소 버전 121, 현재 저장·브리지·다중 창 계약을 유지한다.
- 공개, push, PR, 릴리즈 및 스토어 조작은 포함하지 않는다.
- 신규 설명과 문서는 한글 또는 영문으로만 작성한다.

## 현재 근거

최신 완전 실행 보고서는 `output/tool-audit/run-2026-10-11T08-44-26-027Z-WVMEtL/summary.json`이다.

| 검사 | 결과 | 이 설계에서의 의미 |
| --- | --- | --- |
| npm | 0건, exit 0 | 현재 lockfile 의존성 권고 없음. 소유한 vendored HLS 검증을 대신하지 않음 |
| Gitleaks 현재 파일 | 0건, exit 0 | 해당 검사 범위에서 비밀 패턴 없음 |
| Gitleaks Git 이력 | 0건, exit 0 | 해당 검사 범위에서 비밀 패턴 없음 |
| ESLint | 75건, exit 1 | 객체 동적 접근 43건, 비리터럴 파일 경로 32건의 관찰. 확인된 취약점 개수는 아님 |

75건은 실행/UI 20건과 개발 도구 55건, 파일·규칙 조합 20개로 나뉜다. 기존 원장은 `output/tool-audit/recovery-backlog/warning-ledger.json`에 있으며 모든 항목이 open이다.

## 선택한 구조

### 1. 실행 코드의 동적 객체 경계

실행 코드의 공개 자료 형태는 그대로 두되, 동적 키를 사용하는 지점은 다음 세 종류로 제한한다.

1. **허용된 데이터에서 snapshot 생성:** `Map` 또는 검증된 `[key, value]` 쌍을 만든 뒤 `Object.fromEntries`로 직렬화 가능한 일반 객체를 생성한다.
2. **기존 공개 객체에 검증된 키 기록:** 키 형식을 먼저 확인하고 `Object.defineProperty`로 own data property만 만든다. `__proto__`, 빈 문자열, 과도하게 긴 키와 허용 문자 밖 키는 거부한다.
3. **배열의 검증된 위치 처리:** 읽기는 `at()`, 교체는 `splice()`를 사용하며 음수 또는 범위 밖 위치에서 수정하지 않는다.

`Reflect.get`이나 함수 별칭을 ESLint 탐지 회피 목적으로 사용하지 않는다. 검증과 자료 구조 변경 없이 표현만 바꾸는 것은 보완으로 인정하지 않는다.

#### 파일별 책임

| 파일 | 보완 경계 | 보존 계약 |
| --- | --- | --- |
| `popup.js` | content 응답의 status 객체를 own-entry 기반 `Map`으로 읽고 고정된 표시 목록만 조회 | 기존 표시 순서·최대 행 수·번역 유지 |
| `settings-contract.js` | record/array 비교를 entry 기반으로 수행하고 style parameter snapshot을 검증된 entry 목록에서 생성 | 저장 JSON 형태, revision, merge, CSS 파일 선택 유지 |
| `web/audio.js` | compressor 노드와 설정 값을 명시적 필드 표로 연결 | threshold/knee/ratio/attack/release 값과 Gain 동작 유지 |
| `web/inject.js` | controller message 배열 읽기·교체에 검증된 위치와 `at`/`splice` 사용 | native 메시지 순서, 삭제 표시, controller 알림 횟수 유지 |
| `web/main.js` | bridge status를 형식·개수 제한 뒤 entry snapshot으로 만들고 i18n/filter 필드를 명시적으로 구성 | status 최대 30개, reason 80자, 기존 bridge payload 유지 |
| `web/player.js` | label 키를 명시적 사전 또는 own descriptor 경계로 조회 | fallback과 기존 번역 키 유지 |
| `web/runtime.js` | 전역 Symbol 설치는 own descriptor로 처리하고 status 키를 검증한 own property로 기록 | `runtime.statuses.<feature>` 공개 형태와 status 전송 유지 |

실행 코드 보완은 `Object.create(null)`을 외부 응답으로 직접 노출하지 않는다. structured clone, JSON 직렬화, 기존 테스트의 property 접근과 브리지 소비자가 일반 객체를 기대하기 때문이다.

### 2. 개발 도구의 객체 경계

개발 도구의 숫자·채널·측정 결과는 고정 표, `Map`, `at()` 또는 entry snapshot으로 처리한다. 입력으로부터 온 문자열을 그대로 객체 키로 기록하지 않는다. 결과 JSON의 기존 필드명과 배열 순서는 유지한다.

대상은 다음 객체 접근 관찰을 포함한다.

- `scripts/audio-metrics.mjs`
- `scripts/check-audio-quality.mjs`
- `scripts/check-store-popup.mjs`
- `scripts/check-video-filters.mjs`
- `scripts/tool-audit.mjs`

도구 자체의 테스트가 없는 계산은 먼저 작은 순수 함수 또는 기존 export 경계를 통해 검사 가능하게 만든다. 테스트 전용 동작을 제품 코드에 추가하지 않는다.

### 3. 소유 파일 경로 게이트

비리터럴 파일 경로 32건은 공통 경로 정책 모듈로 모은다. 새 모듈은 경로 문자열을 대신 신뢰하지 않고 다음 불변식을 검사한다.

- 기준 루트는 `realpath`로 고정된 절대경로다.
- 입력 경로를 해석한 절대경로가 기준 루트 자체 또는 그 하위에 있어야 한다.
- 드라이브·UNC·대소문자 차이를 포함한 Windows 경로 비교는 `path.relative` 결과로 판정한다.
- `..`, 절대경로 주입 또는 다른 드라이브로 이탈한 결과는 거부한다.
- 각 기존 구성 요소를 `lstat`으로 확인해 내부 symlink/junction을 거부한다.
- 읽기 대상은 일반 파일, 디렉터리 열거 대상은 실제 디렉터리여야 한다.
- 출력은 호출자가 승인한 정확한 하위 디렉터리에서만 생성하며 기존 파일 또는 링크를 예상하지 않게 따라가지 않는다.

공통 모듈의 실제 `fs` 호출에는 검증 직후의 가장 좁은 행 단위 ESLint 예외만 허용한다. 각 예외에는 같은 함수가 수행하는 루트 포함·링크·타입 검사의 이름을 주석으로 기록한다. 다음 형태는 금지한다.

- 파일 전체 `eslint-disable`
- `detect-non-literal-fs-filename` 규칙의 config 비활성화
- import 별칭이나 간접 호출로 탐지만 피하는 방식
- 검사 전에 파일 내용을 읽거나 쓰는 방식
- 테스트·output·vendor 제외 범위를 확대하는 방식

#### 소비자별 정책

| 소비자 | 허용되는 루트·출력 |
| --- | --- |
| `scripts/build.mjs` | 전달받은 실제 package root와 그 정확한 `dist`; root의 검증된 package resource만 복사 |
| `scripts/check-package.mjs` | 검사 대상 package root 내부의 manifest/resource/metadata만 읽음 |
| `scripts/check-audio-quality.mjs` | 저장소 root의 고정된 제품 소스만 읽고 `output/audio-quality`에만 합성 측정 보고서 작성. 외부 URL 또는 사용자 미디어 입력 추가 없음 |
| `scripts/check-preview-autoplay.mjs` | 저장소 root의 고정된 runtime/preview/CSS/locale만 읽고 `output/playwright`에만 합성 정책 증거 작성 |
| `scripts/check-store-popup.mjs` | 저장소 root의 popup HTML/CSS/locale만 읽음 |
| `scripts/check-styles.mjs` | 저장소 root의 style schema/CSS/fixture 자원만 읽음 |
| `scripts/smoke-browser.mjs` | 명시된 package/fixture root의 파일만 읽음 |
| `scripts/tool-audit.mjs` | 저장소 root의 소유 소스와 설정만 읽고 `output/tool-audit/<새 ID>`에만 보고서 작성 |

`scripts/check-package.mjs`의 현재 `resolveFile`·링크 거부 계약은 새 게이트의 기준이다. 이를 약화하거나 단순 문자열 prefix 비교로 대체하지 않는다.

### 4. 실패와 복구

- 경로 검증 실패는 읽기·쓰기 전에 명시적인 오류로 종료한다.
- scanner 실행 실패, timeout, 잘못된 JSON과 비정상 종료는 계속 pass가 아니다.
- 객체 입력에서 잘못된 키나 위치는 기존 기능별 계약에 따라 무시하거나 `invalid-*` 오류를 반환한다. silent prototype mutation은 허용하지 않는다.
- 개발 도구가 중간에 실패해도 입력 소스, lockfile, 기존 root `dist`, 보류 HLS 파일을 바꾸지 않아야 한다.
- 후보 빌드 실패는 소유한 새 후보 폴더 안에만 남고 root 산출물로 승격되지 않는다.

## 검사 설계

### 실행 코드 실패 검사

- `__proto__`, `constructor`, 빈 키, 41자 이상 키, 허용되지 않은 문자가 status 객체나 prototype을 변경하지 못한다.
- bridge status는 own enumerable entry만 최대 30개 보존하고 reason은 80자로 제한한다.
- popup은 고정된 기능 목록만 표시하고 inherited status를 읽지 않는다.
- 잘못된 설정 ID·style parameter가 snapshot/저장 객체에 새 필드를 만들지 않는다.
- 삭제 메시지 배열에서 `findIndex`가 `-1`이거나 controller가 배열을 바꾼 경우 다른 원소를 교체하지 않는다.
- compressor 각 필드는 기존 노드와 동일한 설정 값·fallback을 받는다.
- runtime status 공개 형태와 page/content status bridge가 기존과 동일하다.

### 경로 게이트 실패 검사

- 정상적인 root 내부 일반 파일과 디렉터리는 통과한다.
- `..`, 절대경로, 다른 드라이브/UNC 형태, root와 접두사만 같은 형제 경로는 거부한다.
- 중간·최종 symlink 또는 junction, 깨진 링크, 파일/디렉터리 타입 불일치를 거부한다.
- 출력 root가 링크이거나 기존 예상 타입과 다르면 쓰기 전에 거부한다.
- package root alias 자체를 허용하는 현재 계약과 내부 링크 거부를 구분한다.
- 실패 전후 보호 파일과 root `dist` 해시가 같다.

Windows에서 실제 file symlink 생성 권한이 없으면 그 케이스는 성공으로 꾸미지 않는다. 현재 가능한 junction 검사와 별도 환경 필요성을 기록한다.

### 회귀와 도구 재실행

각 묶음은 RED→GREEN 뒤 관련 집중 검사를 실행한다. 최종적으로 다음을 수행한다.

1. HLS 전용 파일을 제외한 일반 Node 회귀
2. `node scripts/tool-audit.mjs`
3. 새 소유 후보에서 `build(candidateRoot, candidateRoot/dist)`와 `checkPackage`
4. root `dist`, HLS 보호 파일, package/lockfile의 예상 해시 대조
5. 한글/영문 문서와 `git diff --check`
6. 변경 계약에 한정한 Astra max 기능 검토

npm 레지스트리 조회는 이미 사용자가 의존성 이름·버전 전송을 승인한 같은 점검 도구에 한해 재사용한다. 다른 원격 서비스나 소스 업로드로 승인을 확대하지 않는다.

## 원장 판정과 완료 조건

각 기존 finding은 최신 위치와 source hash를 기준으로 predecessor를 연결한다.

- **remediated:** 경고가 사라졌고, 해당 동적 입력 또는 경로 실패 검사가 RED→GREEN으로 보완 원인을 입증함.
- **guarded-boundary:** 실제 시스템 호출에 좁은 예외가 남지만 공통 게이트의 포함·링크·타입 검사가 호출 전에 실행되고 변형 검사가 이를 입증함.
- **open:** 경고가 남거나, 사라졌어도 실제 계약 검사 없이 표현만 바뀜.
- **new:** predecessor가 없는 새 관찰. 위치 이동만으로 new/resolved를 만들지 않음.

P02 로컬 완료에는 다음이 모두 필요하다.

- 기존 75개 행 각각에 predecessor와 위 상태 및 근거가 있다.
- 새 unresolved 경고가 없다.
- 기능·경로 집중 검사와 일반 회귀가 실패/취소/skip 0으로 통과한다.
- 도구 보고서의 npm·ESLint·Gitleaks 결과와 전체 종료 코드를 그대로 기록한다.
- 격리 후보 검사와 보호 해시 대조가 통과한다.
- 독립 기능 검토의 Critical/Important가 없다.

이 조건을 만족해도 P03 HLS 검증, Chrome 121/file symlink 실환경, P06 설치본 수용과 G-SEC 전체 완료는 별도다.

## 구현 결과 — 2026-10-11

이 설계의 P02 범위는 로컬 구현과 검증을 완료했다. 기준선 75행은 각각 정확히 하나의 predecessor를 가진 `remediated` 후속 행으로 연결했고, 새 공용 파일 경계의 실제 시스템 호출 7행은 숨기지 않고 `guarded-boundary`로 유지했다. `open`과 `new`는 0이다.

- 최종 완전 도구 보고서: `output/tool-audit/run-2026-10-11T09-34-10-280Z-El5pRS/summary.json`
- 원장: `output/tool-audit/recovery-backlog/warning-ledger.json`
- 구현 증거: `output/tool-audit/recovery-backlog/p02-static-boundaries-implementation-2026-10-11.json`
- 최종 결과: npm 0, Gitleaks 현재/Git 각 0, ESLint 7 `guarded-boundary`, 입력 전후 해시 일치, 전체 종료 1
- HLS 제외 일반 회귀: 474/474, fail/cancel/skip 0
- 격리 후보: `output/tool-audit/p02-candidate-p02final20261011b/chrome-candidate/dist`, 58파일·20자원, package check 통과
- 보호 경계: HLS 관련 네 파일과 root `dist` 58파일의 기준선 해시 모두 유지

Astra max 독립 기능 검토에서 삭제 채팅 객체 복사·최종 검증 중의 늦은 슬롯 교체 경쟁조건 1건과 장부의 재현 불가능한 ESLint 명령 1건을 찾았다. 네 경쟁조건 반례와 정확한 스캐너 명령 검사를 RED로 추가한 뒤, 모든 잠재적 getter 읽기와 대체 객체 생성을 먼저 끝내고 own data descriptor로 controller/list slot을 확인한 직후에만 `splice`하도록 고쳤다. 최종 검토에서 Critical/Important/Minor 잔여 항목은 0이다.

이 결과는 P02 기능·경계 증거의 로컬 완료다. 7행을 clean으로 부르거나 취약점 없음으로 판정하지 않으며, Windows file symlink 생성은 EPERM으로 환경 미검증이다. P03 HLS, Chrome 121, 최종 출시 metadata, P06 설치본 수용, 스토어 게시, G-SEC와 G-REL은 별도 게이트로 남는다.

## 고려한 대안

### A. 검증 가능한 경계로 축소 — 선택

동적 자료와 파일 경로의 신뢰 경계를 코드와 검사로 드러낸다. 변경량과 회귀 부담은 크지만 경고 제거가 실제 계약 보완과 연결된다.

### B. 경고 위치마다 억제 주석 추가

변경량은 작지만 검증 없이 75건을 숨길 위험이 크다. 공통 경계 내부의 검증된 실제 시스템 호출을 제외하고 사용하지 않는다.

### C. 원장만 유지하고 외부 판정 대기

현재 상태를 정직하게 보존하지만 사용자가 요청한 보완과 배포 준비가 진행되지 않는다. 구조 보완이 불가능한 잔여 항목에만 적용한다.

## 비목표

- 개별 경고를 확인된 취약점 또는 오탐으로 모델이 판정하는 일
- HLS parser·vendor 번들·보호 스크립트 변경 또는 검증
- 원격 모델, Daybreak, Gemma 또는 다른 외부 검토 서비스로 소스 전송
- Chrome 권한, 개인정보 처리, 설정 schema, 기능 UI 또는 지원 브라우저 추가 변경
- 실제 확장 새로고침, 스토어 제출, PR, push, merge, tag, release

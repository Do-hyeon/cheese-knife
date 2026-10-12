# DT00 공용 helper 계약 검사 — 검증 기록

작성일: 2026-10-12 / Asia-Seoul. 구현 기준: 계획 commit `cb994bd`.

계획: [DT00 공용 helper·bridge 계약 검사](../plans/2026-10-12-dt00-helper-contracts.md).

## 결과와 범위

개발 전용 strict `checkJs`는 helper·기존 bridge 소비자·새 검사 두 파일을 대상으로 한다. 제품 타입 설정·제품 TS/JS·manifest·버전·감사 제외 범위는 바꾸지 않았다. `.cjs` 실행과 생성 제품 JS의 실제 로드 검사를 유지했다.

| 검사 | 로컬 결과 |
| --- | --- |
| 제품·개발 strict 타입 검사 | 진단 0 |
| helper·bridge·multi-page·following 집중 회귀 | 53/53 |
| 기존 타입 기반·package 회귀 | 46/46 |
| 공개-checkout 조건 전체 회귀 | 815/815, 실패 0, 약 54.4초 |
| toolchain·runtime inventory·settings/main drift·build proof | 통과; JS16개, settings10 + MAIN6, proof4 contexts |
| 설치형 positive E2E | 통과, 약 66.9초 |
| 설치형 runtime 누락 negative control | `main-runtime-missing` 관측, 통과 |
| npm 설치 시 advisory 조회 | 0; 보안 인증은 아님 |
| compiler 임시 디렉터리 정리 | 잔여 0 |

최종 독립 whole-branch 검토와 Windows·Ubuntu 공개 CI는 PR의 마지막 커밋 기준으로 판정한다. 로컬 수치를 공개 CI나 실제 사이트 계정 검증으로 대체하지 않는다.

## 계약 오용 검출과 RED → GREEN

- 설정/CI 추가 전 45개 중 42개 통과, 3개 실패: 개발 설정·명령 부재와 deliver의 old TypeError/새 ERR_ASSERTION 차이. 기존38과 새 raw 입력·시계 의미 검사는 통과했다.
- 최초 개발 checker는 미명시 fixture 인자·deferred read와 jsdom Window source 차이를 진단했다. 이는 입증된 제품 결함이 아니며 JSDoc·좁히기·외부 메시지 생성 계약으로 해결했다.
- 각 독립 proof 파일에서 HTML/파일 경로/시계의 잘못된 인자는 TS2345, runtime의 없는 필드는 TS2339, 부재를 좁히지 않은 접근은 TS2532로 거부됐다.
- 정상 호출과 `unknown` config/revision의 대조 파일은 통과한다. 무관한 missing-module·library 진단이나 프로세스 오류는 negative proof의 성공으로 인정하지 않는다.
- raw null/배열/문자열 config와 문자열/NaN/Infinity revision은 실제 message payload에 그대로 들어가며, 실제 생성 런타임 validator가 기존 설정 덮어쓰기를 거부한다. 뒤이은 정상 revision3은 수용된다.
- 생성 runtime의 초기 부재·최종 pagehide 후 부재, 같은 시각 timer 순서·취소·deadline·microtask 재예약·실제 DOM MutationObserver·1000회 loop 상한을 보호한다.

## 비용과 경계 단언

선언 패키지 직접 의존성은 `@types/node` 24.19.2, `@types/jsdom` 30.0.0이다. 추가 transitive는 `@types/tough-cookie` 4.0.5와 undici-types 7.24.6/8.11.2 두 범위다. 추가5개 모두 MIT·dev-only·lockfile integrity 고정이며 **기존 package entry 변경은 0**이다. jsdom의 기존 parse5를 재사용한다.

같은 설치 환경에서 각3회 no-emit 검사: 제품 419/398/395ms, 개발 486/454/461ms. 개발 검사 중앙값은 약461ms이며 전체 테스트의 compiler proof는 별도 비용이다. 실제 버그를 발견했다고 주장하지 않고, 기존에 무검사였던 공용 계약 오용5종을 빠르게 거부하는 효과로 평가한다.

명시적 경계 단언은 다음에만 둔다.

- `helpers.cjs` registry 읽기: 생성 JS가 소유한 값을 제품 `KnifeRuntime | undefined`로 관측한다. 실제 부재를 제거하지 않고 로드/종료 실행 검사로 근거를 둔다.
- helper1·bridge2 위치의 MessageEvent constructor: jsdom 자신의 Window를 source로 받는 추가 생성 signature만 표현한다. 전체 jsdom Window를 실제 브라우저 Window로 변환하지 않는다. 기존 source/origin 객체 identity와 생성 호출은 동일하다.
- helper clock1 위치: 함수 callback만 사용하는 fixture의 숫자 타이머 경계를 표현한다. 반환·취소·시간/정렬 의미는 그대로다.

광범위한 `any`·ignore·이중 단언을 추가하지 않았다. 외부 jsdom global의 동적 index signature, JSON/Chrome fake 전체 계약, library 선언의 내부 타입까지 soundness가 입증된 것은 아니다. 해당 경계를 모두 typed로 재작성하지 않는다.

## 제외·환경 제한과 보존

- 로컬 전체 실행은 과거 private P02 최신 보고서 hash assertion **한 항목만 명시적으로 제외**했다. 현재 변경된 package.json과 과거 보고서가 일치할 수 없으므로 증거를 재작성하지 않는다. 공개 CI에서는 private evidence 부재를 기존 skip 규칙으로 기록한다.
- 기존 Windows file-symlink 권한 두 경로는 `environment-unverified`이며 Ubuntu 공개 CI로 별도 확인한다. 최초 샌드박스 package 검사의 realpath EPERM은 동일 입력 재실행에서46/46 통과한 환경 제한으로 기록한다.
- 로컬 positive E2E의 in-place unpacked reload는 기존 제한 그대로 미관측이다. natural worker idle·실제 BFCache·실제 방송/계정 smoke를 새로 검증하지 않았다.
- root `dist`는 시작 시 없었고 생성하지 않았다. 제품 생성 JS16개·소스·manifest·제품 tsconfig diff0이며 사용자 설정·스토어 제출본은 건드리지 않았다.
- 동결된 P02 baseline SHA-256 `f027a9e8a8c7b44df1a0d8104a7354c9c787a8f6b62b4f532131fb7bcd193dd8`, warning-ledger `4c312e3e66bb773470816779ef1868b4356b344f645a0efaf44bc5e49ebc0401` 전후 동일.

## 후속 판단

DT00의 제한된 계약 검사는 유지할 가치가 있다. 그러나 전체 fixture/tests/tools 이전은 정당화하지 않는다. DT01은 settings reply 또는 오디오 report 경계를 **하나씩 별도 설계**하며, DT02 native TS 실행은 아직 필요성이 입증되지 않았다. P09·AF05-B와 기능 동결 조건은 유지한다.

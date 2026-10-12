# AF05 내부 이행 종료 검증

2026-10-12 / Asia-Seoul. 실행 기준은 [PLANS.md](../../../PLANS.md), 범위는 [AF05 내부 종료 계획](../plans/2026-10-12-af05-internal-closure.md)이다. 내부 정리·검증 결과이며 스토어 배포·자동 업데이트·롤백 수용 완료를 선언하지 않는다.

## 대상과 변경

- 기반 `main`: `f8df4227488ea12b90d642c315fa2dead0086fa1`.
- 제품 원본 이전: `691ae40e11fd62b128e362f877f49e7c757ba91b`.
- 생성기 정적 검사 보완: `170071572e7f0f111620ee1d30199d758478c5bf`.
- 현재 후보 manifest/package는 기존 `2.13.3`을 유지한다. 심사 중인 패키지는 `fb15f9675f9ea910e98363635155bc4ff9eb1d2f` 기반 `cheese-knife-community-recovery-2.13.3-fb15f967.zip`이며 이번 후보와 다르다. 같은 버전의 변경 패키지를 업로드하지 않았다.

공용 config/style schema와 worker·popup·styles·permission·ISOLATED bridge의 수기 원본 7개를 `src/settings/`의 strict TypeScript로 이전했다. 기존 settings generator는 3→10 entry, MAIN generator는 기존 6 entry다. 첫 번째 당사자 제품 JS 16개는 모두 생성 원본과 drift 검사를 가진다. `allowJs: false`이며 제품 JS를 수기로 고치는 경로는 종료했다. 생성 JS와 vendor JS는 Chrome 배포 자원으로 유지한다.

## 타입·전역 연결 원장

| 구분 | 판정과 근거 |
| --- | --- |
| explicit `any`, `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error` | 제품 `src/**/*.ts`에서 0건. 전체 원본 graph 검사와 strict typecheck 통과 |
| `skipLibCheck`·strict 완화 | 없음. noUncheckedIndexedAccess, exactOptionalPropertyTypes, useUnknownInCatchVariables 유지 |
| 자체 HTML DOM 단언 | popup/styles/permission의 고정 template ID·button/anchor/input 타입. 실제 문서 초기화·사용자 입력·로컬화 회귀와 설치 E2E로 확인. HTML이 바뀌면 함께 갱신 |
| 설정·저장 값 단언 | normalizeConfig·broker·client의 실제 검증 계약 뒤 사용. bridge 필터의 고정 numeric key, styles의 단일 query value, popup의 boolean leaf 등. 정적 타입을 외부 입력 검증으로 대체하지 않음 |
| bridge의 읽기 job | 자기 참조 비동기 promise를 같은 동기 구간에서 채우는 단언. 늦은 읽기·freeze·pagehide·다중 문서 회귀 유지 |
| bridge의 unknown message/error | 입력을 unknown에서 시작하며 source/origin/protocol·기존 status 검증과 예상 invalidation 오류 비교를 유지. Chrome API 응답은 확장 내부 상태 전달 계약으로 타이핑 |
| `KnifeHostPolicy`, `CONFIGS`, `DEFAULT_CONFIGS`, normalize/getConfig, `STYLES`와 설정 contract/client/broker | worker importScripts·HTML·ISOLATED의 실제 classic-script 계약. 임시 호환 shim이 아니므로 유지. 추후 로드 구조를 바꿀 때 별도 검증 필요 |
| `Symbol.for('cheese-knife.runtime.v1')`와 feature adapter 연결 | MAIN script 사이의 실제 문서별 런타임 계약. AF03–04 typed 연결 유지 |
| 페이지별 지역 변수 | background·permission·popup·styles의 IIFE 안으로 이동. 서로 다른 화면의 동일 이름 선언 충돌 없음 |

첫 번째 당사자 수기 제품 JS 원본과 제거 대상 임시 연결은 남지 않았다. 단언·외부 Chrome/vendor 선언의 사용까지 없다는 뜻은 아니다. Node 개발 도구와 tests/fixtures는 이번 TypeScript 제품 원본 전환 대상이 아니다.

## 검증 결과

| 검사 | 결과 |
| --- | --- |
| RED | 변경 전 생성 entry·원본 커버리지·TS-only 계약 실패 확인 |
| 집중 회귀 | 92/92. 설정·두 화면·bridge·권한·worker·type/generation 포함 |
| package 회귀 | 37/37. 새 생성 source entry를 준비하도록 fixture 보완 |
| 생성기 정적 검사 보완 | 8/8과 byte drift 통과. 새 ESLint 동적 정규식·object indexing 경고 2건을 suppression 없이 제거 |
| 최종 전체 공개-checkout 회귀 | 800/800, fail/cancel 0, 51,376.3531 ms. `node --test --test-concurrency=4 --test-skip-pattern 'P02 warning ledger closes every baseline row' tests/*.test.cjs` |
| offline 기반 | 고정 toolchain, runtime16 실행 해시, strict, settings10, MAIN6, build proof4 통과 |
| 재현 build | 격리 후보 `af05internal20261012a`와 `b`의 일반 파일58/58 SHA-256 일치. 각 package v2.13.3/20 entry resources |
| 설치형 positive | `installedmv4nsbfi67e4123a`, 66,041 ms. worker·popup·저장·두 창·동시 설정·원래 대상만 reload·runtime 격리·수명주기 통과 |
| 설치형 negative | `installedmv4nuj7867170403`, 예상 `main-runtime-missing` 관측 |
| 실제 Chrome SVG pixels | Chrome155.0.8059.39, `check-video-filters.mjs --chrome` 17/17. 중립/개별/조합·reset·native wrapper 경계 포함 |
| 객관 오디오 | 같은 Chrome에서 격리 후보 실행. steady14·transition18·sample-rate alignment12, qualityFailures0. 극단 peak0.9800000190734863, full-scale 초과0 |
| 최신 도구 감사 | npm0, Gitleaks 현재/Git0, ESLint 기존 소유 파일 경계7. inputSnapshot 전후 일치, 전체 exit1 유지 |

최초 전체 실행은 796/800이었다. package fixture가 이전 3개 source만 준비한 3건을 수정했다. HLS verifier는 최초 `incomplete`를 숨기지 않으며 단독12/12와 파일 병렬 수4의 최종 전체 실행에서 통과했다. HLS 입력·번들·제한 시간은 변경하지 않았다. 무제한 파일 병렬 실행의 재현 안정성까지 해결했다고 주장하지 않는다.

private P02 원장은 과거 입력 해시를 고정하므로 현재 source 변경과 직접 대조하는 한 항목을 로컬 전체 실행에서 명시적으로 제외했다. 공개 CI는 private 증거가 없는 checkout에서 기본 `npm test`를 실행한다. 원장·기준선은 수정·이동하지 않았고 각각 SHA-256 `4c312e3e66bb773470816779ef1868b4356b344f645a0efaf44bc5e49ebc0401`, `f027a9e8a8c7b44df1a0d8104a7354c9c787a8f6b62b4f532131fb7bcd193dd8` 유지다.

오디오 raw report SHA-256: `044f42908b154bc18e0aaa169db903c5e74f4684424d08b46cbe9fff2eaf03a4`. private raw evidence는 `output/af05-internal/`, `output/audio-quality/report-af05-internal.json`, `output/tool-audit/run-2026-10-12T02-56-00-593Z-FSukbc/summary.json`에 있다. 실제 계정·방송·채팅 자료를 검사에 사용하지 않았다.

## 로컬 정책·고지 정합성

manifest·HTML·locale·PRIVACY·LICENSE·THIRD_PARTY_NOTICES·vendor는 기반 대비 변경 없음이다. CSP는 기존 MV3 기본 정책을 유지하며 권한은 scripting/storage, host는 HTTPS 치지직 본 사이트 하나다. 새 원격 실행·데이터 저장·외부 전송·지원 기능을 추가하지 않았다. 패키지에 TypeScript 원본·개발 의존성·source map·private 결과를 포함하지 않는다.

공식 [최소 권한 정책](https://developer.chrome.com/docs/webstore/program-policies/permissions), [MV3 코드 요구사항](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements), [업데이트 절차](https://developer.chrome.com/docs/webstore/update)를 2026-10-12 재확인했다. 빌드 시 TypeScript를 로컬 JS로 변환하며 제출되는 기능 코드가 패키지에 포함되는 구조다. 이는 Google 정책 적합성 인증이나 대시보드 readback 완료가 아니다. 실제 스토어 설명·방침 URL은 P09/차기 배포에서 게시 산출물에 맞춰 별도로 확인한다.

## 독립 검토

Astra max가 `f8df422..1700715`를 읽기 전용으로 검토했다. Critical/Important/Minor0. 집중92/92, 기준 대비 설정 경계375개, 10개 generator의 주소 거부30개, 생성10개 exact 대조와 popup/styles 동시 classic parsing을 독립 확인했다. reviewer의 standard checker는 sandbox realpath EPERM으로 중단되어 in-memory transformation으로 대조했고, 주 실행자는 escalated drift 검사도 통과했다.

reviewer가 판정을 보류한 항목은 후속 문서(이 문서에서 보완), 실제 스토어 설치·업데이트·롤백(P09/AF05 공개 단계), private 감사 이력(해시 보존만 확인)이다. 본 검토로 새로운 모델 보안 scan이나 공개 배포 승인을 주장하지 않는다.

## 배포·롤백 준비와 남은 수용

- [x] 내부 원본 종료·타입/전역 계약 원장·재현 build·로컬 정책·설치 E2E 근거 고정.
- [ ] 한글 PR·공개 CI·병합 완료 근거 고정.
- [ ] P09의 심사 패키지2.13.3 새 설치·기존2.13.2 업데이트·설정 보존 확인.
- [ ] AF 변경을 포함한 차기 배포의 더 높은 버전·immutable commit·ZIP hash 고정, 실제 설치·업데이트·롤백 수용.
- [ ] 사용자 승인 후 F00–F05 동결 해제.

차기 배포는 P09 결과를 확인하고 별도 버전을 올려 준비한다. 현재 후보 버전2.13.3을 동일 번호의 새 스토어 패키지로 재사용하지 않는다. 신규 기능 없이 기준fb15f967과 storage key·schema·revision 처리 정합성을 대조한 뒤, 같은 확장 ID에서 실제 update와 설정 보존을 확인한다. 임시 unpacked ID의 수명주기 검사는 스토어 업데이트 증거로 대체하지 않는다.

롤백 기준은 현재 심사본fb15f967과 공개 prerelease ZIP으로 보존한다. 스토어에서는 버전 내림을 전제로 하지 않고, 필요한 경우 기준 코드의 되돌림을 더 높은 버전으로 재패키징·검증·심사한다. 로컬 시험판은 같은 로딩 폴더에 검증한 이전 산출물을 복원하고 확장·페이지를 새로고침하는 별도 절차다. 확장 삭제·ID 교체는 설정 손실을 유발할 수 있어 자동으로 수행하지 않는다. 실제 롤백 설치는 아직 검사하지 않았다.

사용자의 기존 root `dist`와 제출 ZIP은 이 작업에서 바꾸지 않았다. 브라우저 실제 BFCache 복원·worker 자연 idle 종료·unpacked in-place reload의 한계는 AF00–04와 같다. 공개 설치 수용이 남아 있으므로 AF05 전체와 기능 로드맵은 완료·해제로 표시하지 않는다.

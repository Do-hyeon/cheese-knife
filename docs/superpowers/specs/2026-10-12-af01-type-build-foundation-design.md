# AF01 타입·빌드 기반 상세 설계

작성일: 2026-10-12 (Asia/Seoul)

상위 설계: [AI 친화적 유지보수 기반 장기 설계](2026-10-11-ai-friendly-foundation-design.md)

## 1. 목적

AF01은 제품 동작을 바꾸는 빌드 전환 단계가 아니다. 기존 Chrome MV3 산출물을 그대로 유지하면서, 이후 TypeScript 이전을 안전하게 시작할 수 있는 정적 타입 검사와 빌드 도구 검증 기반을 추가하는 단계다.

완료 시 다음 질문에 기계적으로 답할 수 있어야 한다.

1. 기존 설정 계약 파일을 엄격한 JavaScript 타입 검사로 검사할 수 있는가?
2. background, extension page, ISOLATED content script, MAIN content script의 서로 다른 실행 계약을 최소 번들러가 보존할 수 있는가?
3. 같은 입력에서 같은 검토 가능한 출력이 생성되는가?
4. 빌드 도구가 원격 코드, source map, 절대 경로, 시각 값이나 승인되지 않은 의존성을 산출물에 넣지 않는가?
5. AF01 이후 새 첫 번째 당사자 런타임 JavaScript가 TypeScript 이전을 우회하지 않는가?

## 2. 고정 비목표

AF01에서는 다음을 하지 않는다.

- `manifest.json`의 엔트리, 순서, 권한, host permission 또는 CSP 변경
- `background.js`의 `importScripts` 순서 변경
- `popup.html`, `styles.html`, `permission.html`의 `<script>` 순서 변경
- MAIN/ISOLATED content script 구성이나 로드 순서 변경
- 기존 제품 `.js`를 `.ts`로 이름 변경하거나 실제 런타임 번들로 교체
- minify, code splitting, source map, 개발 서버, HMR 또는 UI 프레임워크 도입
- 설정 schema, 저장 형식, 메시지 형식, revision, 사용자 동의 또는 외부 전송 변경
- 새 사용자 기능, 권한, 네트워크 요청, 원격 코드 또는 사용자 데이터 수집 추가
- Firefox 빌드 복구
- vendor HLS 번들의 변환·재번들·동작 변경

실제 제품 엔트리를 TypeScript 출력으로 교체하는 일은 AF02 이후 각 경계의 런타임 계약과 회귀 검사를 갖춘 별도 단계에서만 수행한다.

## 3. 현재 실행 계약

현재 소스는 ES module import graph가 아니라 파일 순서와 전역 식별자로 연결된다. 이 계약은 좋고 나쁨의 평가와 무관하게 AF01에서 보존해야 할 기준선이다.

| 문맥 | 현재 진입 계약 | AF01 불변 조건 |
| --- | --- | --- |
| background service worker | `background.js`가 `config.js`, `style-schema.js`, `settings-contract.js`, `settings-broker.js`를 `importScripts`로 순서대로 로드 | 파일명·순서·classic script 전역을 변경하지 않음 |
| popup extension page | HTML이 config → style schema → contract → client → popup 순서로 classic script 로드 | HTML과 전역 연결을 변경하지 않음 |
| styles extension page | HTML이 config → style schema → contract → client → styles 순서로 classic script 로드 | HTML과 원래 대상 탭 새로고침 계약을 변경하지 않음 |
| permission extension page | HTML이 config → permission 순서로 classic script 로드 | 권한 요청과 스크립트 순서를 변경하지 않음 |
| ISOLATED content script | manifest가 `config.js`, `web/main.js` 순서로 로드 | 실행 세계·순서·페이지 bridge 계약을 변경하지 않음 |
| MAIN content script | manifest가 runtime → vendor HLS → adapter → audio → player → preview → inject 순서로 로드 | `world: MAIN`, 순서, `Symbol.for('cheese-knife.runtime.v1')` 전역 계약을 변경하지 않음 |

`var KnifeSettingsContract`, `var createSettingsClient`, `var createSettingsBroker`, `var STYLES`와 같은 이름은 여러 classic script 사이의 현재 ABI다. 번들러 IIFE는 같은 철자의 전역을 내부 scope로 감출 수 있으므로, 단순히 번들이 실행된다는 사실만으로 기존 계약 보존을 주장하지 않는다.

## 4. 선택 도구와 고정 버전

AF01 구현 계획은 다음 개발 의존성을 정확한 버전으로 고정하는 것을 전제로 한다.

- `typescript`: strict/checkJs 정적 검사와 향후 TypeScript compiler 계약
- `@types/chrome`: 현재 최소 Chrome 버전에 맞춘 확장 API 타입 검사
- `esbuild`: 제품 빌드가 아닌 자체 포함 browser IIFE 출력 가능성 proof

버전 번호는 구현 계획 작성 시 npm registry와 Node 24/Windows/Ubuntu 호환성을 다시 확인한 뒤 exact version과 lockfile integrity로 고정한다. caret·tilde 범위는 사용하지 않는다.

선택 이유는 다음과 같다.

- TypeScript compiler는 JavaScript를 emit하지 않고도 `allowJs`와 `checkJs`로 현재 계약 파일을 점진적으로 검사할 수 있다.
- content script는 manifest에서 module 진입점을 직접 사용하지 않으므로 장기적으로 자체 포함 출력이 필요하다.
- esbuild는 작은 설정으로 browser IIFE와 메타파일을 생성하고 `write: false`로 실제 파일을 쓰지 않는 proof를 만들 수 있다.
- Vite의 개발 서버/HMR이나 Webpack의 광범위한 설정은 AF01 요구가 아니다.

공식 근거:

- [TypeScript checkJs](https://www.typescriptlang.org/tsconfig/checkJs.html)
- [TypeScript allowJs](https://www.typescriptlang.org/tsconfig/allowJs.html)
- [Chrome content script 실행 세계](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome MV3 원격 호스팅 코드 금지](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [esbuild 설치 및 native executable 주의점](https://esbuild.github.io/getting-started/)
- [esbuild API와 출력 제어](https://esbuild.github.io/api/)

## 5. TypeScript strict proof

### 5.1 별도 설정

제품 emit과 혼동하지 않도록 AF01 전용 `tsconfig`를 둔다. 필수 compiler option은 다음과 같다.

```json
{
  "allowJs": true,
  "checkJs": true,
  "noEmit": true,
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "useUnknownInCatchVariables": true,
  "types": ["chrome"]
}
```

구현 계획에서 module/target/lib와 include/exclude의 정확한 값을 고정한다. `skipLibCheck`, `allowUnreachableCode`, blanket `any`, `@ts-ignore` 또는 무검증 이중 단언으로 proof를 통과시키지 않는다.

### 5.2 최초 checkJs 범위

처음부터 전체 저장소를 검사하지 않는다. 현재 계약 중심의 다음 파일만 포함한다.

- `config.js`
- `style-schema.js`
- `settings-contract.js`
- `settings-client.js`
- `settings-broker.js`

필요한 JSDoc 또는 ambient declaration은 런타임 명령·분기·반환값을 바꾸지 않는 범위에서만 추가한다. 기존 validator와 runtime guard는 삭제하거나 정적 타입으로 대체하지 않는다.

다음은 proof 실패로 처리한다.

- Chrome API 타입 오류를 넓은 단언으로 숨김
- storage/message/page 입력을 검증 없이 신뢰
- 기존 전역 이름이나 load order를 타입 도입을 이유로 변경
- 검사 범위를 줄이거나 오류 코드를 무시해 녹색으로 만듦

## 6. 네 실행 문맥 build proof

### 6.1 합성 엔트리

실제 제품 엔트리를 번들하지 않는다. proof 전용 디렉터리에 다음 네 합성 엔트리를 두고, 각 엔트리는 대응 문맥에서 필요한 최소 local module graph만 import한다.

1. background service worker proof
2. extension page proof
3. ISOLATED content script proof
4. MAIN content script proof

합성 엔트리는 실행 가능한 새 제품 코드가 아니며 `dist`와 스토어 ZIP에 포함하지 않는다. 기존 classic-script 전역을 import graph로 자동 변환하는 척하지 않고, 장기 출력 형식과 Chrome 금지 패턴만 검증한다.

### 6.2 esbuild 고정 계약

각 proof는 다음 옵션을 사용한다.

| 항목 | 값 |
| --- | --- |
| `bundle` | `true` |
| `format` | `iife` |
| `platform` | `browser` |
| `target` | `chrome121` |
| `minify` | `false` |
| `sourcemap` | `false` |
| `treeShaking` | `false` |
| `metafile` | `true` |
| `write` | `false` |

`treeShaking: false`는 proof에서 side-effect가 제거되어 성공하는 오판을 막는다. 실제 이전 단계에서 tree shaking을 사용할지는 별도 검토한다.

### 6.3 출력 검사

proof runner는 출력 byte와 metafile을 직접 검사한다.

- 출력 파일 수와 논리 entry 이름이 허용 목록과 정확히 일치
- UTF-8 JavaScript이며 비압축·source map 없음
- `eval`, `new Function`, 동적 원격 import, `http:`/`https:` 실행 URL 없음
- Windows drive 경로, 저장소 절대 경로, 임시 디렉터리 경로 없음
- 현재 시각, 무작위 nonce, 사용자명, host 이름 없음
- 승인되지 않은 `node_modules` runtime code 없음
- manifest나 HTML이 proof 출력을 참조하지 않음

문자열 검사는 우회 가능한 보안 증명이 아니라 스토어 패키지 계약의 회귀 게이트다. 실제 의존성 graph는 metafile과 package 검사를 함께 사용한다.

## 7. 결정적 출력 검증

동일 checkout에서 서로 다른 두 임시 root를 만들고 같은 proof를 각각 실행한다. 각 논리 출력에 대해 byte-level SHA-256을 계산하고 다음을 비교한다.

1. 출력 파일명 집합
2. 각 출력 byte hash
3. 정규화한 metafile의 inputs/outputs graph
4. 라이선스 주석과 third-party runtime 포함 목록

경로만 정규화해서 hash 차이를 숨기지 않는다. 실제 출력 byte가 다르면 실패한다. metafile 비교에만 slash와 proof root를 논리 경로로 정규화한다.

Windows와 GitHub Actions Ubuntu에서 같은 검사를 수행한다. 운영체제별 native esbuild binary가 다르더라도 JavaScript 출력은 같아야 한다. 다르면 원인을 고정하기 전까지 도구를 채택하지 않는다.

## 8. 의존성·네트워크·라이선스 통제

esbuild는 platform-specific native executable 설치가 필요하다. 따라서 `npm ci --ignore-scripts`와 일반 `npm ci`를 각각 검사해 다음을 명확히 한다.

- clean lockfile 설치 뒤 build proof가 Windows와 Ubuntu에서 실행되는가?
- postinstall을 막으면 왜 실패하거나 성공하는가?
- 실행 시점에 binary나 패키지를 내려받지 않는가?
- package tarball integrity와 license가 lockfile/notice 정책에 포함되는가?

빌드·검사 명령은 네트워크를 요구하지 않아야 한다. 의존성 설치 이후 네트워크를 차단한 상태에서도 typecheck와 proof가 동작해야 한다. build script에서 npm, curl, PowerShell WebRequest 또는 임의 downloader를 호출하면 실패한다.

개발 의존성은 스토어 ZIP에 포함하지 않는다. third-party code가 proof output에 포함될 경우 package/version/license/포함 이유를 기계적으로 보고하고 허용 목록 밖 항목은 실패한다.

## 9. 신규 런타임 JavaScript 금지 게이트

AF01 완료 이후 새 첫 번째 당사자 런타임 소스는 `.ts`만 허용한다. 이를 위해 AF01 시작 시점의 제품 `.js` inventory를 명시적 파일 목록으로 고정한다.

게이트는 package-shippable 경로에서 다음을 검사한다.

- inventory에 없는 새 첫 번째 당사자 `.js` 파일은 실패
- 기존 `.js` 이름 변경·복사로 우회해도 실패
- `dist`, `output`, generated proof, tests, `scripts/*.mjs`는 제품 런타임 inventory에서 제외
- `tests/*.cjs`와 개발 검증 도구는 적용 대상이 아님
- `vendor/**`는 별도 provenance·license 검사를 통과해야 하며 첫 번째 당사자 예외로 취급하지 않음

기존 `.js` 파일 수정은 AF02–AF04의 점진 이전 동안 허용되지만, TypeScript 전환을 피하기 위한 신규 기능 파일 추가는 허용하지 않는다. 긴급 복구 때문에 예외가 필요하면 파일·이유·제거 단계·사용자 승인을 원장에 기록한다.

## 10. 제품·개인정보·스토어 정책 불변 조건

AF01 결과는 다음 diff가 0이어야 한다.

- `manifest.json`의 의미와 배열 순서
- production `dist`의 현재 copy-based 파일 집합과 각 runtime byte
- extension page script tag와 content script 순서
- 권한, host permission, 외부 origin, 네트워크 요청
- `chrome.storage` key, 설정 기본값, message/revision 형식
- 사용자 데이터 수집·저장·전송·삭제 계약
- 개인정보처리방침과 스토어 공개 설명이 다루는 제품 기능 범위

따라서 AF01은 추가 사용자 동의나 개인정보처리방침 변경을 요구하지 않는다. 위 항목 중 하나라도 바뀌어야 한다면 기반 proof가 아니라 제품 변경이므로 작업을 중지하고 별도 설계·정책 검토를 받는다.

## 11. 테스트와 CI 게이트

AF01 구현 계획은 실패하는 검사부터 추가한다. 최종 CI 순서는 다음 계층을 모두 포함한다.

1. exact dependency와 runtime JS inventory 검사
2. strict/checkJs typecheck
3. 네 실행 문맥 build proof와 금지 패턴 검사
4. 두 격리 root의 결정적 byte/metafile 비교
5. 기존 `npm test`
6. 기존 copy-based `npm run build`와 `npm run check`
7. 기존 positive/negative 설치형 E2E
8. 기존 HLS·오디오·정적 경고·패키지 게이트

build proof PASS는 production build PASS를 대체하지 않는다. production build가 proof 출력물을 소비하지 않는다는 negative test도 둔다.

필수 negative control은 다음과 같다.

- 합성 entry에 `eval` 추가 시 proof 실패
- source map 활성화 시 proof 실패
- 임시 root 절대 경로 삽입 시 결정성 검사 실패
- 새 product `.js` 추가 시 inventory 실패
- manifest 또는 HTML이 proof 출력을 참조하면 패키지 검사 실패
- runtime dependency 또는 원격 import 추가 시 allowlist 실패

## 12. 단계별 구현 경계

AF01은 작은 커밋으로 나눈다. 정확한 파일명과 테스트명은 후속 구현 계획에서 고정한다.

1. baseline snapshot과 실패하는 inventory/typecheck 테스트
2. TypeScript 설정·Chrome 타입·계약 파일 JSDoc 보완
3. 실패하는 네 문맥 build proof/금지 패턴 테스트
4. esbuild proof runner와 합성 entry
5. 결정적 출력·license·offline/ignore-scripts 검증
6. CI, 문서, validation과 전체 회귀

각 단계에서 production `dist` byte가 기준선과 달라지면 즉시 중지한다.

## 13. 롤백

AF01은 제품 산출물을 바꾸지 않으므로 롤백 단위도 개발 기반에 한정한다.

- TypeScript/esbuild 개발 의존성과 lockfile 변경 제거
- AF01 tsconfig, proof entry, runner와 관련 테스트 제거
- runtime JavaScript inventory 정책 제거
- CI의 AF01 전용 단계 제거

롤백 뒤 기존 `npm ci`, test, build, package check와 설치형 E2E가 AF00 기준으로 통과해야 한다. manifest, 제품 source와 스토어 ZIP을 되돌리는 롤백이 필요하다면 AF01 범위를 위반한 것이다.

## 14. 공격적 검토와 보완 결론

### 14.1 IIFE가 기존 전역 ABI를 깨뜨릴 수 있음

가장 큰 회귀 위험이다. 현재 `var` 전역과 스크립트 순서는 여러 파일 사이의 ABI다. esbuild IIFE로 실제 제품 파일을 개별 번들하면 전역이 bundle scope로 숨거나 중복 runtime이 생길 수 있다.

**보완:** AF01은 합성 entry proof만 만들고 manifest/HTML/production build는 기존 파일을 계속 복사한다. 실제 번들 전환은 파일 경계와 import graph를 함께 이전하는 AF02 이후 별도 승인 대상으로 남긴다.

### 14.2 타입 성공이 런타임 입력 안전을 과장할 수 있음

Chrome message, storage, `window.postMessage`와 치지직 내부 객체는 정적 타입만으로 신뢰할 수 없다.

**보완:** 외부 입력은 계속 `unknown`과 runtime validator를 사용한다. AF01 JSDoc은 validator를 제거하거나 반환값을 과장하지 않는다.

### 14.3 `checkJs` 범위가 너무 좁아 형식적 proof가 될 수 있음

전체 저장소를 즉시 포함하면 대규모 주석 작업으로 제품 변경과 오류 은폐가 발생한다. 반대로 사소한 파일만 포함하면 가치가 없다.

**보완:** 설정 schema, contract, client, broker처럼 UI/background/ISOLATED 경계를 실제로 공유하는 다섯 파일을 첫 범위로 고정한다. 이후 범위 확대는 AF02의 완료 조건으로 추적한다.

### 14.4 native esbuild 설치가 공급망·CI 문제를 만들 수 있음

esbuild는 플랫폼 binary와 설치 동작에 의존한다. `--ignore-scripts` 환경, offline rebuild와 서로 다른 OS에서 예상 밖 실패가 날 수 있다.

**보완:** exact pin, lockfile integrity, 일반/ignore-scripts 설치 실험, 설치 후 offline proof, Windows/Ubuntu byte 결정성 검사를 모두 채택 게이트로 둔다. 어느 환경에서든 숨은 다운로드가 필요하면 채택하지 않는다.

### 14.5 금지 문자열 검사가 보안 보증처럼 오인될 수 있음

문자열 검사만으로 동적 코드나 데이터 유출 부재를 증명할 수 없다.

**보완:** 이 검사는 스토어 패키지 회귀 게이트로만 기록한다. dependency graph, package allowlist, 기존 정적 도구와 설치형 E2E를 별도 증거로 유지한다.

### 14.6 JS 금지가 긴급 복구를 방해할 수 있음

기존 런타임이 대부분 JavaScript인 상태에서 모든 `.js` 수정을 금지하면 현실적 유지보수가 불가능하다.

**보완:** 기존 inventory 파일의 수정은 허용하고 새 first-party runtime 파일만 차단한다. 긴급 예외에는 제거 단계와 사용자 승인을 요구한다.

### 14.7 proof가 production과 분리되어 쓸모없어질 수 있음

합성 entry가 실제 이전 경로와 동떨어지면 녹색 검사만 남을 수 있다.

**보완:** 네 Chrome 실행 문맥, chrome121, browser IIFE, CSP 금지 패턴과 metafile 계약을 고정하고, AF02에서 첫 실제 계약 모듈을 이전할 때 동일 runner를 production 후보 비교에 재사용하도록 완료 조건에 연결한다.

## 15. 중단 조건

다음 중 하나가 발생하면 검사를 약화하지 않고 AF01을 중지해 설계를 다시 승인받는다.

- manifest, script 순서, 실행 세계, 권한 또는 사용자 데이터 계약 변경이 필요함
- production `dist`가 copy-based source 대신 proof bundle을 사용해야 함
- `any`, `@ts-ignore`, `skipLibCheck` 또는 validator 제거 없이는 typecheck가 불가능함
- build 또는 test 실행 중 원격 다운로드가 필요함
- source map, `eval`, `new Function`, WASM 또는 원격 실행 코드가 필요함
- Windows와 Ubuntu 출력 byte가 안정적으로 일치하지 않음
- 기존 positive/negative 설치형 E2E나 package gate가 실패함
- 새로운 스토어 공개 설명이나 개인정보처리방침 변경이 필요함

## 16. 완료 조건

AF01은 다음을 모두 만족할 때만 완료다.

- 다섯 계약 파일이 엄격한 checkJs/typecheck를 예외 은폐 없이 통과
- 네 실행 문맥 build proof와 negative controls 통과
- Windows와 Ubuntu에서 결정적 출력·license·offline 계약 통과
- 신규 first-party runtime JavaScript 금지 게이트 통과
- production manifest, 파일 순서와 `dist` runtime byte가 기준선과 동일
- 기존 전체 회귀와 설치형 E2E 통과
- 권한·사용자 데이터·외부 전송·스토어 정책 범위 변화 0건
- 구현 계획, 검증 기록과 한글 PR이 별도 공개 단위로 남음

## 17. 승인 게이트

이 문서가 승인되기 전에는 구현 계획과 제품 코드를 작성하지 않는다. 승인 뒤에도 먼저 파일·테스트·명령·커밋 단위를 가진 AF01 구현 계획을 작성하고 별도 검토한다. 구현 계획 승인 전에는 TypeScript/esbuild 의존성, tsconfig, proof runner 또는 런타임 소스를 변경하지 않는다.

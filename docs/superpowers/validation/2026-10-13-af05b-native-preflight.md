# AF05-B Native Preflight — Task1 로컬 검증과 native 승인 경계

2026-10-13 실행 / 2026-10-14 기록 마감 / Asia-Seoul. **Task1/Task2 native 범위 로컬 마감 완료.** [현재 계획](../plans/2026-10-13-af05b-native-preflight.md). P09Native20261013B의 실제12개 JSON·저장/cold/마감과 순수 재생은 NATIVE-PREFLIGHT-PASS/complete=true다. fresh Astra max 최종 검토0/0/1의 문서 Minor는 이력 표현으로 교정했다. 독립 재검토0건으로 바꾸지 않는다. 승인된 네 값/revision4·UI/CSS 등록 보존, MCP/P09/endpoint 종료·Developer mode 원상태·설치/권한 불변을 확인했다. 이전 실패는 별도 보존하며 project MCP는 비활성·임시 allowlist 제거 상태다. 실제 업데이트/전체 AF05-B 완료나 공개 승인은 아니다. [현재 실행 기록](#실제-native-관측저장cold마감-결과).

## 승인과 근거

- 사용자 승인: 과거 native2.13.2→2.13.3 미검증 및 격리 코드 복귀/실제 플랫폼 롤백 미실행의 수용 기준 분리, 네이티브 사전검증 **계획 작성·검토**.
- 후속 사용자 승인2026-10-13: 계획 및 Task1 로컬 관측 도구 구현/검증. 실제 Chrome·프로필 변경은 별도 승인, AF05-B 전체 완료 전 push/PR 금지.
- 추가 사용자 승인2026-10-13: Task2는 기존 P09 검사용 프로필에서만 진행, 사용자의 개입이 필요하지 않으면 계속 작업. AF05-B 전체 완료 전 push/PR 금지는 유지.
- [상위 설계](../specs/2026-10-12-af05b-release-acceptance-design.md)와 [P09](2026-10-12-p09-store-publication.md)를 연결해 P09 배포 증거 고정만 종료했다. 과거 업데이트 성공·플랫폼 롤백 실행·native runtime PASS로 변경하지 않았다.
- 최초 계획은 Task1 로컬 관측 도구와 Task2 별도 승인 후 P09의 일반 UI/DevTools·좁은 파일/프로세스 근거를 분리했으며, 당시에는 native 제어 연결이 없었다. 이후 승인된 정상 MCP 관측과 마감 결과는 마지막 실제 실행 기록에 별도로 남겼다.
- 제품2.13.3·root dist·원본 ZIP/CRX·시청 Chrome·native 설치·frozen P02·보호 브랜치·공개 저장소는 변경하지 않는다. AF05-B 전체 완료 전 push/PR 금지와 실제 배포 금지는 유지한다.

## 최초 계획의 독립 Astra max 검토

fresh `gpt-6-astra`, reasoning `max`, 읽기 전용 계획/연결 코드 검토. 기준 HEAD `ced54b2`, 당시 미커밋 계획 초안118줄 및 상위 설계/P09를 검토했다. **Critical0 · Important6 · Minor1, 보완 전 NOT READY FOR PLAN APPROVAL**였다. 수정 후 독립0건/승인 준비 완료 판정이 아니다. 테스트·빌드·브라우저·프로필·설치·네트워크·보안 scan을 실행하지 않았다.

| 원본 초안 지적 | 작성자 근거 대조와 현재 계획 보완 |
| --- | --- |
| I1 ready 상태에서도 CSS 실패 UI 통과 | frozen styles.js와 현재 styles.ts의 retry/failed 렌더 분기를 대조했다. worker CSS 등록뿐 아니라 각 UI의 retry/discard hidden을 요구하고 실제 frozen UI의 failed-ready fixture negative를 Task1에 추가 |
| I2 baseline4개 다음 단계로 갈 checker 없음 | `--check=baseline/seeded/complete`,4→8→12 관측 및 STAGE-ACCEPTED/최종 PASS 분리. 단계 CLI 진행 fixture 추가 |
| I3 첫 오류·중단·마감 실패의 입력 없음 | 고정 실패 envelope·배타적 ordinal outcome journal·사전 요청/응답 연결·명시적 abort/finalize·시각 순서·과거 실패 veto를 정의. 뒤 성공으로 실패를 지우지 않는 negative 추가 |
| I4 profile 및 동일 popup 이중 관측의 오인 | API는 profile 경로를 제공하지 않음을 인정했다. 사람의 정상 UI profile/context 확인을 API 검증과 분리. **불필요한 두 popup 관측/동기화 주장을 제거**하고 실제 업데이트 단계에 남김. 미확인 context는 STOP |
| I5 seed 이후 새 absent-baseline run 재시도 불가 | seed 전 실패만 새 run 허용. seed-start 이후 실패는 상태 보존·별도 재개 계획/승인 대기. 자동 삭제/재주입/재설치/일반 nonempty baseline 완화 없음 |
| I6 HTML/extra runtime이 코드 출처 검사에서 누락 | frozen58개 중 정규화 예외6개를 제외한52개 일반 파일 hashes 및 exact 허용 inventory. HTML3개 변경/추가 runtime negative. P09의 JSON/icon/metadata 예외와 서명/픽셀 재검증 미실행은 유지 |
| M1 잘못된 GREEN 테스트 경로 | 실제 `tests/installed-transition-scenario.test.cjs` 이름을 `rg --files tests`로 확인해 수정 |

이 당시 보완은 **작성자의 문서/소스 대조**이며 probe/CLI 구현 전이었다. 이후 구현/검증 결과는 아래에 분리한다. native 성공/독립 재검토0건/보안 인증으로 해석하지 않는다.

## Task1 구현과 독립 최종 검토

고정 ZIP reader·broker parser·owned-files를 재사용한 probe generator, offline checker, private CLI와 VM/JSDOM/owned fixture를 추가했다. 제품 runtime·manifest·package scripts·CI·의존성·버전은 변경하지 않았다. CLI의 기본 `--inspect-native`는 `native-unavailable`이며 실제 profile/process reader가 없다.

fresh **Astra max**가 불변 범위 `3eca204..527a77d`를 검토했다. **Critical0 · Important3 · Minor1, Task1 NOT READY**. 독립 실행은 새 test2개56/56, 실제 native IO/네트워크/빌드는 없다. 이후 `ccff650`의 **작성자 한 차례 보완**을 RED→GREEN과 전체 suite로 검증했으며 수정 후 독립0건 판정은 아니다.

| 최초 지적 | 작성자 재현·보완 |
| --- | --- |
| I1 실제 popup에서 retry node가 없어 전부 실패 | frozen popup HTML/scripts의 baseline/seeded generated probe RED2→GREEN2. popup `retryHidden:null`, styles는 필수 retry hidden=true, 두 화면 discard hidden=true. 계획의 과도한 공통 DOM 요구를 수정했고 제품은 수정하지 않음 |
| I2 시계 역전·주/추가 기록 실패 후 오류가 사라짐 | clock 회복 및 primary/secondary IO failure RED2→GREEN2. 작업 전 immutable attempt intent, 시각 검사와 독립된 완료/실패 receipt. 실패/미완료 attempt는 나중 정상 입력으로도 PASS 불가 |
| I3 fallible dependency 초기화가 CLI 오류 경계 이전에 실행 | missing/malformed metadata 실제 subprocess RED2→GREEN2. 순수 contract 상수 분리, payload 초기화는 기존 run intent 뒤 guarded dynamic import. 원시 예외/stack/개인 sentinel 없이 고정 JSON 실패만 출력하며 자료 복구 후에도 해당 run 실패 유지 |
| M1 inspector JSON을 크기 검사 전에 씀 | 명시한 쓰기 전 상한을 위반하므로 작성자가 Important로 재분류. per-file/prospective-run budget RED2→GREEN2. 1MiB/16MiB 제한과 고정 journal/receipt4KiB 여유를 먼저 확인하며 거부 시 native facts 미기록 |

### 최종 로컬 검증

- 코드 기준 `ccff65015e6a5de0e2bcf6f7df97902c08732cc1`. 실제 profile을 복사하지 않은 별도 **로컬 검증 clone**에서 변경 없는 `npm test`: **1,171개 /1,170pass /0fail /1skip**, 60.176s. 최초 checkpoint `527a77d`의1,163/1,162/0/1과 구분한다.
- skip은 기존 `P02 warning ledger closes every baseline row and preserves every latest guarded observation`: 공개 clone에 private 감사 자료가 의도적으로 없음. 제외/skip/동결 ledger를 확대·수정하지 않았다.
- 계획의 test5개 연결 검사 **108/108**, 새 test2개 **64/64**, 기존 foundation9 모두 PASS. shared literal fixture는 기대값을 구현 출력에서 만들지 않으며 실제 frozen broker·popup/styles scripts도 실행한다.
- 새 `.mjs`3개 기존 ESLint 규칙: errors0/warnings0. 의존성 변경·network audit·외부 보안 scan 없이 수행. 기존 전체 감사의 과거 warning까지0으로 주장하지 않는다.
- 변경 문서3개/local link72개: 누락0·Korean/English 외 언어0·`git diff --check` 오류0. private 작업 ledger는 AF05-B 전체 마감까지 보존한다.
- 제품 package/manifest **2.13.3**, root dist58개·원본 release ZIP/CRX·frozen P02 파일·보호 브랜치 SHA 불변. 이번 보호 검사는 native profile 접근 항목을 제외했으며 실제 profile/process 접근0이다.
- `output/native-preflight-*`와 `.superpowers/sdd/2026-10-13-af05b-native-preflight/`에 private 자료/RED·GREEN·전체/연결 로그를 보존. 실제 native JSON은 수집하지 않았다. synthetic fixture의 최종 checker PASS 문자열은 실제 native PASS 근거가 아니다.

### 구현 판단과 남긴 한계

- pure `native-preflight-contract.mjs`를 추가해 오류 경계 이전 payload IO를 피하고 allowlist 중복을 없앴다. 고정 source snapshot은 기존7개+contract1개, 총8개 및 Node version이다. 준비 run의 source가 바뀌면 새 run이 필요하다.
- `dependencies.openRun`은 test-owned IO 오류 재현용 경계이며 CLI profile/임의 경로 옵션이 아니다. 기본 동작은 기존 owned-files다. hostile 동시 파일 교체·위조 evidence의 진실성까지 인증하지 않는다.
- intent/result는 기존 run의 fallible 작업에 앞선다. intent 자체를 쓸 수 없으면 작업에 진입하지 않으며 불완전 준비 run을 재사용하지 않는다. 실패 자료는 지우지 않는다. seed-start 뒤 실패 재개는 별도 계획/승인을 기다린다.
- 4KiB 고정 기록 여유 때문에 budget 경계 근처 입력을 보수적으로 거부할 수 있다. 원래 Minor1은 재분류·보완했으므로 이번 구현 검토의 **미처리 Important/보류 Minor는 없다**. 실제 native 실행·공개 수용까지 완료됐다는 의미는 아니다.
- reviewer가 판단하지 않은 profile/key/process/cold·수동 확인 진실성·실제 저장/업데이트/rendered CSS/MAIN/audio·CRX 서명/보안/성능/CI/출시·동시 hostile FS·마감 문서 정확성은 작성자가 아래 기존 게이트로 유지했다. 마지막 문서는 작성자 기록이지 독립 재인증이 아니다.

## Task2 코드 검증과 현재 native 진행

이 절은 최초 Console 관측 경로를 시도하던 당시의 이력이다. 현재 native 결과는 상단 요약과 마지막 실제 관측·마감 기록을 따른다.

코드 범위 `52ad8f5abd23f0a85634a3ea0620a8781013e9a4..d9866c2de074ceb5aeb7b2dc7de90cf39805b5ee`. 고정 native reader를 내부 모듈로 분리하고 기존 CLI의 명시적 `inspect-native`에만 연결했다. prepare/check/record는 profile/process를 조회하지 않는다. source binding은 reader 포함9개 입력이다. 새 경로/launcher/controller/의존성·제품 권한·version 변경은 없다.

- 새 reader14개 RED→GREEN, actual PowerShell provider 경계 RED→GREEN, `..`/구분자 정규화 miss RED→GREEN. 파일 symlink 준비는 Windows 권한 EPERM으로 실패했고, 기존 owned-files의 directory junction 패턴으로 link 거부를 실행했다. skip/권한 변경 없이 테스트를 유지했다.
- 실제 PowerShell은 **synthetic CIM provider**를 넣어 실행했다. 다른 profile의 command line은 반환하지 않고, 불명/조회 오류를 프로세스 없음으로 바꾸지 않으며 target browser root의 정확한 정규화 경로/유일성/PID/start를 요구한다. 실제 launcher PID만으로 닫힘을 판정하지 않는다.
- 전체 unchanged `npm test`는 실제 profile을 복사하지 않은 local clone에서 **1,186개 /1,185pass /0fail /기존skip1**, 63.420s. 연결 test6개 **123/123**, 기존 foundation9 PASS, reader/CLI/공통 checker의 기존 정적 규칙 errors0/warnings0. root dist·제품2.13.3·원본 ZIP/CRX·frozen P02·보호 브랜치 불변.
- fresh **Astra max**의 위 immutable 코드 범위 독립 검토: **Critical0 · Important0 · Minor0**, 실제 관측 단계로 진행 가능한 코드. 허용한 test3개 **79/79**, sandbox realpath EPERM 뒤 동일 명령 escalation. JSDOM canvas 미구현 메시지2건은 fixture 진단이며 브라우저 영상/음질 검증으로 간주하지 않는다. reviewer는 실제 profile/process/browser/build/network/보안 scan을 실행하거나 파일을 수정하지 않았다. native PASS/merge/release 판정이 아니다.
- Developer mode 저장 항목 absent는 [Chromium 공식 기본값 false](https://chromium.googlesource.com/chromium/src/+/HEAD/components/policy/test/data/pref_mapping/ExtensionDeveloperModeSettings.json)에 대응한다. present null/다른 타입은 실패다. 이 기본값 해석으로 정책상 ON 가능 여부나 사용자의 UI 확인까지 합격 처리하지 않는다.

### 실제 before 근거와 사용자 체크포인트

`P09Native20261013A`는 코드 고정 뒤 새 private run으로 prepare했다. 승인된 기존 `output/p09-public-20261012152819/fresh-chrome-profile`만 normal Chrome·disable-sync/no-first-run·새 version-info 창으로 열었다. remote debugging·force flag·다른 profile·재설치·Preferences 편집 없음. worker/설정의 runtime 관측은 아직 하지 않았다.

현재 `--inspect-native=before`는 성공했다. ID `cgfddiiffponlciljlfbiecmlagflbpe`, store **2.13.3**, fromWebstore=true, 공개키 계산ID 일치, 정확한60 inventory/frozen52 일반 파일·정규화 manifest/locale·권한, Developer mode 원상태 **false**, 정확한 profile의 유일한 Chrome root 사실을 private JSON과 journal/attempt에 기록했다. 과거 P09 근거를 현재 값으로 복사하지 않았다. 공개 결과에 원시 Preferences·전체 command line·개인값은 넣지 않는다.

Windows Computer Use 초기화는 됐지만 모든 Chrome 창 제목을 노출하는 inventory 요청은 unrelated session metadata 위험으로 거부됐다. 그 조회를 반복하거나 다른 방법으로 우회하지 않았다. 사용자가 열었다고 한 대상 extension worker URI만으로 좁힌 정상 window 조회는 빈 목록이었으며, docked/아직 미선택 context를 추정하지 않는다. 사용자의 일반 profile/context 확인 및 필요시 수동 JSON 경로를 유지한다.

사용자는 검사창을 열었다고 했으나 profile 경로 확인 방법을 물어, 그때는 confirmed를 기록하지 않았다. `chrome://version`의 Profile Path 항목을 안내한 후 사용자가 **정확한 승인 P09/Default 경로를 반환**해 profile-context confirmed와 첫 baseline worker-before requested를 기록했다. 이는 수동 근거이며 자동 profile 인증이 아니다.

대상 URI/name만의 window 조회가 빈 목록이라 guessed window/다른 profile로 조작하지 않았다. 원래 생성 probe는 바꾸지 않고 private console helper에 DevTools `copy(JSON.stringify(await ...))`만 씌워 사용자가 대상 Console에서 실행하고 실제 JSON을 붙여넣도록 요청했다. 붙여넣기 보호나 오류가 나오면 우회하지 않고 알려달라고 명시했다.

사용자가 첫 probe 전에 Chrome paste 보호(`allow pasting` 필요)를 보고해 **unknown/native-unavailable과 abort failed/native-unavailable을 immutable journal에 기록**했다. `allow pasting` 입력·다른 입력 방식·CDP로 보호를 우회하지 않는다. 사용자가 이후 첨부한9,034byte 텍스트는 helper **코드 자체**이며 actual outcome/capturedAt JSON이 아니었다. 응답이 안 보인다는 보고도 API 성공 근거가 아니다. 정상 실행 시 helper는 화면 대신 clipboard로 복사하지만 실행 여부는 미확인이다. 해당 run은 나중 정상 자료가 와도 실패를 지우고 PASS로 바꾸지 않는다.

네 UI seed 저장·cold 종료/재시작·finalize는 미실행, 원래 Developer modefalse 복원/검사 창 종료는 사용자 확인 대기다. 현재 이 관측 경로는 BLOCKED-CAPABILITY이며 원래 시청 Chrome은 건드리지 않았다. 사용자 제안 [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)의 공식 문서만 읽었다. 이 세션에 그 도구가 연결돼 있지 않으며 설치/설정/CDP/프로필 연결 변경은 하지 않았다. 일반 page automation 지원과 이번 extension worker 관측 확보는 별개이고, 보호 제한을 우회하는 경로로 전환하지 않는다.

## P09 전용 MCP 지원성·설치·권한 검토

사용자2026-10-13 승인은 **검토와 PLANS 반영**이다. 이번에는 공개 문서/소스/배포 메타데이터와 설치 Chrome 실행 파일의 version 정보만 읽었으며 설치·패키지 실행·MCP 설정·Chrome 프로필/실행 상태 조회·CDP 연결은 하지 않았다. 앞선 실패 run과 BLOCKED-CAPABILITY를 유지한다. 아래는 후속 승인 후보이지 실행 승인이나 독립 Astra 재검토 결과가 아니다.

### 확인한 지원 범위

- npm1.10.1의 `gitHead`는 `e52c6b59b476c5e04d8dd9fd4bd017ba3b3d65df`다. 이 고정 commit의 [평가 도구](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/e52c6b59b476c5e04d8dd9fd4bd017ba3b3d65df/src/tools/script.ts)는 `--category-extensions`가 켜지면 `evaluate_script.serviceWorkerId`를 지원한다. pageId와 workerId는 서로 배타적이다. popup/styles는 page 평가 후보, MV3 worker는 worker 평가 후보다. 먼저 읽은 main `830c693fae70aa4780b761bd8ba12c8fe5ad86ee`와 배포 commit은 달라 혼용하지 않는다. 현재 연결/실행 성공은 미검증이다.
- 배포 commit의 [page 목록](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/e52c6b59b476c5e04d8dd9fd4bd017ba3b3d65df/src/tools/pages.ts)은 extensions category에서 worker 목록도 제공한다. [context](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/e52c6b59b476c5e04d8dd9fd4bd017ba3b3d65df/src/McpContext.ts)의 worker ID는 `sw-N` 형식이며 확장 ID로 대신 쓰지 않고 정확한 target URL과 매번 대조해야 한다. worker 평가에도 선택된 page가 필요하므로 대상 popup/styles page를 유지해야 한다. 재시작 뒤 ID 재사용 금지. 배포 evaluator는 function 입력만 지원하므로 main의 sourcePath/format=script를 전제로 하지 않는다. 원래 probe를 반환하는 검토된 function과 그 hash를 대조하는 절차가 필요하다.
- 배포 commit의 [McpContext](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/e52c6b59b476c5e04d8dd9fd4bd017ba3b3d65df/src/McpContext.ts)는 연결된 browser의 extension workers를 추적한다. [로그 수집기](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/e52c6b59b476c5e04d8dd9fd4bd017ba3b3d65df/src/collectors/ServiceWorkerCollector.ts)는 초기화/새 target에서 자동 CDP 구독한다. **특정 worker만 요청해도 내부 수집까지 그 worker 하나로 한정되는 것은 아니다.** client 도구 허용 목록만으로 이 수집을 막았다고 표현하지 않는다.
- [공개 npm 메타데이터](https://registry.npmjs.org/chrome-devtools-mcp/1.10.1)는 `1.10.1`과 Node `^20.19.0 || ^22.12.0 || >=23`을 확인한다. 로컬 Node24.19.0은 범위에 맞는다. 배포 integrity는 `sha512-Klw6HWDqHC/XS1JwZldd2r49aUhbUJN9m9Mvcx4SEueIPXtzuQX+QelxAViobv8YUkDZ7HWDrmViR6LeYK0wAw==`. tarball은 받지 않았으므로 배포 bytes와 gitHead 소스 대응·내장 의존성·실행 호환성은 설치 전 추가 검증 게이트다. metadata의 dependencies/optionalDependencies는 비어 있으나 내장 의존성이 없다는 뜻은 아니다. `@latest` 자동 실행은 제안하지 않는다.
- 연동 관리 검색에는 일치하는 Chrome DevTools MCP 플러그인이 나오지 않았다. 검색은 비포괄적이며 전체 디렉터리에 없다는 판정은 아니다. 다른 무관한 플러그인 설치/제안은 하지 않는다.

### 연결 방식 판단

[공식 연결 안내](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/830c693fae70aa4780b761bd8ba12c8fe5ad86ee/docs/advanced-usage.md)를 기준으로 다음을 구분한다.

| 방식 | P09 판단 |
| --- | --- |
| 기본 MCP Chrome 실행 / `--isolated` | 기본 전용 또는 임시 profile이므로 기존 P09 근거 대체 불가 |
| `--autoConnect` | 여러 profile 실행 시 기본 profile 선택 가능. 현재 시청 profile을 피하는 확실한 고정 경로로 채택하지 않음 |
| 정확한 P09 instance의 `--browser-url` 또는 `--ws-endpoint` | 조건부 후보. 배포1.10.1 문서는 extension 연결에 Chrome149+ 제한을 명시한다. 로컬 Chrome exe는155.0.8059.40이나 실제 P09 실행 버전/연결 가능성은 별도 확인. P09 정상 디버깅 허용·profile/root/endpoint 결합·별도 계획 변경 승인 필요. 원래 시청 Chrome 전체 종료/임의 포트 탐색 금지 |

권장 후보는 **기존 P09에 한시적으로 연결하는 별도 stdio MCP**다. 연결은 읽기 전용 API보다 넓은 브라우저 제어 권한이며, loopback endpoint도 다른 로컬 프로세스가 제어할 위험이 있다. 원격 interface/방화벽 개방·force flag·인증/정책/Console 보호 우회는 허용하지 않는다. 현재 계획의 CDP/원격 디버깅 포트 금지는 아직 변경하지 않았고, 도구 정책상 접근이 거절되면 다른 경로로 같은 행위를 재시도하지 않는다.

### 설치·권한 변경 승인 후보 묶음

1. **준비:** 이전 run의 원래 Developer mode=false 복원/대상 검사 창 종료를 먼저 확인한다. 기존 실패 journal은 보존한다. P09 이외 profile·로그인·동기화·복제·확장 재설치/교체는 제외한다.
2. **설치:** `output/p09-mcp-tools/` 아래에 검증한 고정 버전과 내장/추가 의존성만 설치하는 후보다. npm 외부 다운로드/패키지 코드 실행을 승인받고 배포 integrity·license·지원 schema를 대조한다. 제품 package/lock/manifest/버전에는 추가하지 않는다. 별도 일반 CDP client나 제어 확장은 만들지 않는다.
3. **client 등록:** [OpenAI 공식 MCP 문서](https://developers.openai.com/codex/mcp/)는 trusted project의 `.codex/config.toml`과 `enabled_tools`를 지원한다. 후보 변경 파일은 이 repo의 `.codex/config.toml`, 서버명 `P09Native`, 처음 `enabled=false`다. 기존 설정/다른 서버/관리 정책은 보존하며 global 설정은 변경하지 않는다. 현재 desktop에 설정 적용·도구 제한이 실제로 반영되는지는 미검증이고, 지원하지 않으면 STOP한다. 등록만 해도 지금 연결됐다고 표현하지 않는다.
4. **연결:** 계획의 CDP 금지 예외를 지정 P09에만 승인받은 후 정상 UI 디버깅 허용/필요한 P09 재시작을 진행하는 후보다. 정확한 profile 경로·현재 설치/파일·root PID/start·endpoint를 함께 확인하며 포트 번호만으로 인증하지 않는다. endpoint는 private 자료이고 공개 문서/PR에 넣지 않는다. 연결 전 P09의 개인 tab/계정/추가 확장 여부를 확인한다. upstream의 자동 로그 수집을 대상 하나로 제한할 근거가 없으므로, 다른 데이터가 노출될 수 있는 P09면 연결하지 않는다. P09 내부 자동 수집의 잔여 범위까지 동의받아야 한다.
5. **도구/외부 전송 제한:** [배포 commit 설정](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/e52c6b59b476c5e04d8dd9fd4bd017ba3b3d65df/docs/configuration.md)에 따라 navigation/debugging/extensions만 필요한 범위로 열고 network/performance/memory/emulation/third-party/WebMCP/PWA/DevTools 자동화는 제외한다. 초기 client 허용 목록은 `list_pages`, `select_page`만, `javascriptEvaluation=false`로 둔다. 별도 승인된 관측 단계에서만 `evaluate_script`를 추가하며 사전 검토한 생성 probe만 실행한다. install/reload/uninstall/임의 script·전체 storage·network/console export는 금지한다. 검사 UI의 네 값 변경은 기존 정상 UI 승인 범위로 분리한다.
6. **통신/파일:** usage statistics·CrUX·update checks·source maps를 명시적으로 끈다(`--no-usage-statistics`, `--no-performance-crux`, `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1`, `--no-source-maps`). unrestricted paths=false, 작업 파일 범위는 새 private run과 도구 설치 경로다. file URL 탐색 도구는 client에 노출하지 않으며 main의 `--no-file-navigations`는 배포1.10.1 지원 근거가 없어 넣지 않는다. 이 제한들은 OS sandbox나 무통신 보장이 아니며 Chrome 자체 통신/stdio 응답의 Codex 전달은 별도다. 필요한 정제 API JSON/설정 control 결과만 전달하고 쿠키·계정·채팅·다른 탭/확장 자료를 전달하지 않는다. URL allowlist는 Chrome149+ 조건과 worker 적용 범위가 미검증이므로 강제 격리 근거로 삼지 않는다.
7. **실제 관측/종료:** 허용된 연결과 worker/page schema가 확인돼도 바로 seed하지 않는다. 새 run/nonce·source binding으로 ID/version/권한/broker hash/정확한 worker URL와 두 UI context를 대조한 baseline부터 기록한다. 클립보드 `copy()` helper가 아닌 원래 read-only probe 반환값만 사용한다. 유효한 JSON·checker가 없으면 STOP하며 성공을 추정하지 않는다. cold 전에 MCP 구독/모든 inspector를 닫고 지정 P09 root 종료→새 root를 독립 확인한 뒤 다시 연결한다. 디버깅 재연결은 worker를 깨울 수 있으므로 자연 idle 수명주기까지 검증했다고 주장하지 않는다. 마지막에 MCP 비활성화/분리·디버깅 허용과 Developer mode 원상복원·endpoint 종료를 확인하며, 정리 실패는 미완료다.

**검토 결론:** worker 지원 여부를 문서만의 미확정 상태에서 고정 소스의 조건부 지원으로 구체화했다. 하지만 순수 read-only worker 연결/계정 데이터 무수집/현 desktop 동작을 보장하지 못한다. 위 설치·설정·P09 디버깅·내부 수집 범위를 묶어 별도 승인받기 전에는 설치하거나 연결하지 않는다. Task2/native/AF05-B 공개 게이트는 그대로 미완료다. runtime/controller 신규 코드·새 adapter·제품 권한 변경은 이번 설계에 필요하지 않다.

**자체 반례 검토·문서 검증:** main/배포 commit 차이, page-only 설명과 조건부 worker schema 차이, 도구 allowlist와 내부 수집 범위 차이, 디버깅 observer와 cold 근거 차이를 위 조건/STOP 게이트로 분리했다. 문서3개/local link74개·anchor·Korean/English 언어 검사 누락0, `git diff --check` 오류0. 보호 검사에서 제품2.13.3·root dist58파일·원본 ZIP/CRX·frozen P02·보호 브랜치 불변 확인. 새 runtime/full suite·보안 scan·native 실행은 하지 않았고, 독립 검토0건 판정도 아니다.

## MCP 승인 뒤 로컬 준비 결과

실제 연결 전 준비 단계의 기록이다. 아래 비활성/오프라인 상태와 대기 수치는 당시 값이며 현재 마감 상태를 뜻하지 않는다.

사용자2026-10-13은 위 후보 묶음을 승인했다. 제품/기존 시청 profile/global 설정/push/PR/릴리즈 승인은 아니다. 기존 private ledger와 실패 `P09Native20261013A`를 보존했으며 그 run의 PASS 전환·새 seed 시작은 없다.

- **이전 실행 정리:** 기존 고정 reader로 현재 설치 일치와 Developer modefalse를 확인했다. 사용자 ‘종료 완료’ 답변 뒤 정확한 P09 root 부재/설치 일치도 확인했다. 첫 sandbox realpath EPERM은 동일한 승인된 읽기 전용 명령의 escalation으로 확인했다. 전체 Preferences/Chrome command line은 출력하지 않았다.
- **설치:** 공식 npm1.10.1 tarball **2,632,790byte**와 위 SHA-512가 일치한다. `tar -t/-tv`로 **359개** entry가 package 안의 일반 파일/디렉터리인지 검사한 뒤 새 `output/p09-mcp-tools/chrome-devtools-mcp-1.10.1/`에 해제했다. npm 실행 파일이 PATH에 없고 패키지 dependency fields가 비어 있어 직접 설치했다. 내부 bundle은 포함되지만 추가 설치/prepare/build/lifecycle script 실행은 하지 않았다. 실제 package name/version/Apache-2.0·bin path와 entrypoint `--help`, 배포 JS의 worker evaluator/로그 수집기를 대조했다.
- **project 등록:** 없던 `.codex/config.toml`에 `P09Native`만 추가, `codex mcp get P09Native --json`에서 등록 전 server-not-found→등록 후 인식 확인. **enabled=false, JS=false, 허용 list_pages/select_page**, extension install/reload/uninstall/action 제외, 사용 통계/CrUX/update/source maps OFF, unrestricted paths=false다. port0은 미연결 sentinel이며 실제 endpoint가 아니다. `.gitignore`에 이 local config만 추가해 절대 경로/향후 endpoint의 공개를 막았다. global 설정/다른 MCP는 변경하지 않았다.
- **오프라인 MCP 초기화:** 설치된 공식 SDK의 Client/StdioClientTransport로 initialize/tools-list만 검사했다. 첫 실패의 stderr는 `categoryPwa=false`와 browserUrl의 presence-based parser 충돌이었다. 기본 PWA OFF를 유지하도록 명시 false 옵션만 제거해 RED→GREEN. JS=false는 **17도구/evaluate 없음**, 임시 metadata 검사 JS=true는 **18도구/worker ID와 function schema/readOnlyHint=false**를 확인했다. PWA/performance/heap 도구 없음도 assertion으로 확인했다. 이 임시 검사는 config의 JS=false를 바꾸지 않았고 browser tool call/Chrome 연결을 하지 않았다. 서버1.10.1 확인, 검사별 stderr370byte의 정상 안내. CLI는 sandbox arg0 정리/PATH-alias permission warning을 냈으나 대상 설정 읽기는 성공했다; warning을 해결됐다고 표현하지 않는다.
- **노출 범위 게이트:** P09의 target 제외 기록6개를 이름/ID/내용 대신 집계했다. [Chromium 위치 enum](https://chromium.googlesource.com/chromium/src/+/84fa9085bed1e927afa7c952ee0d8d5d636be37e/extensions/common/mojom/manifest.mojom) 기준 component(location5)4개/external-component(location10)1개/external-pref-download(location6)1개다. non-component1개에 worker 선언과 disable reason 없음이 확인됐다. 실행 중 worker 존재를 관찰한 결과는 아니며, 그 정체/노출 범위가 확인되지 않아 **MCP 연결 전에 중지**했다. 대상 외 이름/ID/log/storage는 출력/보관하지 않았고 다른 확장을 끄거나 삭제하지 않았다.
- **remote attach 지원 게이트:** 실제 설치 `BrowserManager.js`의 `#connect`는 `makeTargetFilter()`를 extensions 인수 없이 호출한다. 실물 함수에 고정 target extension URI를 넣으면 기본값false/명시 true로만true다. 따라서 metadata의 worker schema 지원이 현재 remote attach에서 그 worker를 관찰할 수 있다는 증거는 아니다. native 연결 실패를 재현했다는 주장도 아니다. **정상 지원 경로 확인 전 활성화 보류**, pinned package patch/target filter 해제/pipe의 새 profile/autoConnect 대체는 수행하지 않았다.

현재 Chrome 재시작/원격 디버깅 허용/port·endpoint 연결/실제 API JSON/UI seed/cold/새 최종 checker는 **미실행**이다. 로컬 MCP 등록은 현재 대화에 연결 도구가 로드됐다는 뜻이 아니다. 다음은 추가 non-component 확장의 최소 식별 범위 결정과 정상 remote worker 연결 지원 검토다. 다른 확장 비활성화/제거 또는 설치판 코드 변경은 이번 승인에 포함하지 않는다. 이 범위를 임의로 넓히지 않으며, 기존 Console 보호를 해제하거나 다른 입력 수단으로 반복하지 않는다.

마감 검사: 문서/설정/ignore5개·local link74개·anchor/언어 오류0, 비활성 project 설정 assertion·gitignored 확인, diff whitespace 오류0. 제품2.13.3/root dist58/원본 ZIP·CRX/frozen P02/보호 branch 불변. 전용 MCP child 개수 조회는 최초 CIM 권한 오류의0출력을 채택하지 않고, Stop-on-error로 동일한 좁은 조회를 escalation해 성공/남은 프로세스0을 확인했다. 제품 코드 변경이 없어 전체 제품 suite/build는 재실행하지 않았고 native PASS/push/PR/릴리즈도 없다.

## 추가 확장 식별과 worker 연결 경로 후속 검토

사용자2026-10-13은 추가 확장의 이름/설치 출처 확인·MCP 정상 worker 경로 검토·정상 접근이 확보되면 실제 검증까지 계속 진행하도록 승인했다. 다른 확장 설정 변경/로그/저장값 조회·삭제/비활성화·패키지 patch·보호 우회·push/PR 승인은 아니다.

- **최소 식별:** 지정 P09의 location6 record 한 개에서 이름 **Google Docs 오프라인**, `external-pref-download`, fromWebstore=true, update server origin `https://clients2.google.com`만 출력했다. ID/권한/로그/저장값/계정·cookie는 출력하지 않았고 해당 확장의 설정·실행 상태도 변경하지 않았다. 설치 기록의 이름/출처이며 별도 CRX 서명/게시자 인증 검사를 한 결과는 아니다.
- **앞선 판단 보완:** 이전 검사는 `BrowserManager.makeTargetFilter()`가 extension URI에 false를 반환한다는 사실만 확인했다. 전체 호출 경로의 worker 차단을 증명한 것이 아니며, 그 결과로 원격 worker 연결 불가를 단정하지 않는다. 설치 bundle의 TargetManager는 `service_worker`를 일반 page callback 전에 별도로 처리한다. 이 worker 분기는 `isUrlAllowed()`를 따르고, MCP 수집기의 입력은 그 경로가 내보낸 available targets다. package/runtime 파일은 변경하지 않았다.
- **현재 배포 대조:** 공개 npm latest는 여전히1.10.1/gitHead e52c6b59이며, 공식 고정 main830c693f에도 같은 일반 connect callback 호출이 있다. 무작정 새 버전 설치/소스 patch로 해결하지 않는다. 페이지와 worker 경로는 별개이고, 실제 popup/styles 정상 접근은 여전히 미검증이다.
- **설치 실물 합성 검사:** 설치된 `CdpBrowser`/TargetManager를 실제 그대로 사용하고 CDP connection/session 경계에만 synthetic EventEmitter/응답을 넣었다. 일반 callback=false, 대상 extension만의 allowlist를 설정하고 두 개의 가상 service_worker target-created/attached event를 보냈다. 대상 worker tracked=true, 제외 worker tracked=false, 두 URL의 allowed/denied assertion이 모두 통과했다. 다른 Chrome/실제 확장/계정/포트에 접근한 검사가 아니다. 기대값은 literal이고 구현 결과에서 생성하지 않았다.
- **새 영향 경계:** 위 검사에서 제외 worker session에도 `Network.emulateNetworkConditionsByRule` 호출 **1회**를 관측했다. 이 공식 옵션은 로그 노출을 줄일 뿐 아니라 P09의 대상 외 통신/기능을 일시 제한할 수 있다. 기존 ‘이름·출처만 확인’ 승인을 그 동작 변경 승인으로 해석하지 않으며 실제 MCP 연결 전 중지했다. Docs 확장을 끄거나 삭제하는 우회는 하지 않는다.

### 다음 실행 승인 후보

1. 대상은 **기존 P09만**, 정상 loopback 디버깅과 정확한 profile/root/PID/start/endpoint 결합을 사용한다. 원래 시청 Chrome·다른 프로필·로그인/동기화·기존 설치 payload는 변경하지 않는다.
2. private MCP 설정에 대상 origin allowlist를 적용하고, **검사 중 P09 내 다른 통신/기능도 제한될 수 있음**을 승인받는다. 처음 JS=false/list-select만으로 worker target/페이지 노출을 확인한다. Docs 이름/출처 이상의 자료를 받거나 다른 확장을 설치/삭제/비활성화하지 않는다. Chrome149+ 여부/지원 오류·대상 외 노출·정상 UI 접근 부재는 STOP이다.
3. 정상 접근이 확인되면 새 run/nonce와 현재 source binding으로 baseline→네 값 정상 UI seed→P09 종료/새 root→cold→finalize/checker를 기존 순서로 진행한다. 필요한 profile/context 또는 정상 UI 조작은 미리 안내하고, 사용자 대신 Console 보호를 해제하거나 수동 붙여넣기를 재요구하지 않는다.
4. 모든 observer/디버깅 session을 분리하고 **검사용 P09 Chrome을 종료해 임시 runtime 네트워크 규칙을 해제**한다. Developer mode 이전 상태와 MCP 비활성화·endpoint 종료를 확인한다. 확장/Preferences 설정을 고치거나 새 프로필로 대체하지 않는다. cleanup이 확인되지 않으면 native PASS 금지다.

아직 이 임시 네트워크 영향 묶음은 미승인이다. 새 allowlist flag 추가·Chrome 시작/디버깅·MCP 활성화/실제 연결·API JSON/seed/cold는 미실행이며, 기존 실패 run과 제품2.13.3/push/PR 금지는 유지한다. worker 합성 추적 성공은 실제 native 성공이나 모든 UI 지원을 보장하지 않는다.

후속 마감 검사: 문서/비활성 설정4개·local link74개/anchor·언어·diff 오류0. 현재 등록 enabled=false/JS=false/port0·allowlist 미추가 assertion 통과. 검토한 설치 패키지5파일을 고정 SHA-512의 원본 tar entry와 SHA-256으로 재대조해 bytes 일치 확인, patch 없음. 제품2.13.3·root dist58·원본 ZIP/CRX·frozen P02·보호 브랜치 불변. 추가 native/full product suite·보안 scan·public 작업은 수행하지 않았다.

### Task2 독립 검토의 판단 제외 처리

아래 제외 항목은 실제 API 관측 전의 코드 검토 시점에 대한 판정이다. 이후 runtime/저장/cold/마감 PASS는 마지막 실행 기록과 분리해 읽는다.

- 실제 현재 설치/process 사실은 위 before 기록으로 일부 확인했지만 storage/runtime는 이후 API gate에 유지.
- 실제 DevTools 접근·baseline/seeded/cold는 현재 사용자 준비와 실행 증거 대기. source review0건은 이를 대체하지 않음.
- 사람의 profile/context·inspector 종료/finalize 진실성 및 제출하지 않은 오류·조작 JSON은 자동/암호학적 인증이 아님.
- icon pixels·Chrome metadata 독립 인증·CRX 서명, hostile 동시 파일 교체는 기존 명시적 제외/owned-files 순차 한계에 유지.
- MAIN/rendered CSS/audio·다중 창 경합·실제 update/플랫폼 rollback은 별도 AF05-B 게이트에 유지.
- 전체 suite는 작성자가 위 결과로 확인했고 reviewer의 전체 CI/build/security/performance/release 재인증은 아님.
- 최종 문서 마감은 실제 후속 관측에 따라 작성자가 갱신. 현재 Task2 미완료를 유지.

## 판단 보류 항목의 처리

아래는 최초 계획·로컬 코드 검토 당시의 보류 이력이다. 현재 runtime/seed/cold/finalize는 실제 PASS했으며, 실제 업데이트/방송 MAIN/오디오와 공개 승인은 여전히 별도 게이트다.

- 실제 Chrome/DevTools 연결·profile/설치/프로세스 상태: Task2 실행 승인과 before 출처 조회는 완료. profile/context 수동 확인·runtime/seed/cold/finalize는 capability/실행 gate에 유지. 정상 접근 불가 시 STOP하며 도구/정책 제한을 우회하지 않는다.
- probe/CLI의 Task1 로컬 정확성: 위64/108/전체 suite로 확인했다. 실제 native reader/실행 정확성은 Task2 승인·owned fixture·현재 설치 자료로 따로 확인한다.
- seed 내구성·cold 실행·방송 MAIN·화면 CSS·오디오·실제 업데이트/context 오류: preflight는 worker/설정 UI/CSS 등록까지만, 나머지는 상위 AF05-B 실제 설치 수용에 유지.
- 스토어 심사/게시 버전·플랫폼 롤백 자격: 후속 공개 직전 확인/별도 승인. 검사용 전 사용자 rollback 실행 없음. 작성자는 Chrome 공식 debugging/API 안내를 읽었으나 실행 가능성이 입증된 것은 아니다.
- AF 전체 기능·회귀·CI·성능·보안·CRX 서명 인증: 기존 게이트 또는 별도 미검증 범위로 유지하며 계획 검토로 재인증하지 않는다.
- 병행 PLANS 전체/과거 결과 재인증: 작성자가 현재 P09 소유권·상위 수용 기준·체크리스트를 대조했다. reviewer가 기존 전체 증거를 재검증했다고 표현하지 않는다.
- 공개 순환 경계: ‘전체 AF05-B 완료 전 push/PR 금지’와 공개 후 actual update 수용의 순서는 후속 공개 전에 사용자에게 범위를 확인한다. 이번 검토/문서 보완은 공개 조건 완화 승인이 아니다.

## 체크리스트

- [x] 수용 기준 분리 승인과 P09 배포 증거 고정 종료를 문서에 반영.
- [x] 상세 계획·자체 대조·Astra max 독립 검토 및 I1–I6/M1 작성자 보완.
- [x] 문서5개/local link76개·언어/whitespace 오류0, git diff --check 통과. 보호 snapshot 동일·제품2.13.3·dist58개·원본 CRX hash 일치·native exact52개/HTML3개 분류 대조. 문서 수정만 수행; 전체 실행 suite 재실행 없음.
- [x] 계획과 Task1 로컬 도구 구현 승인; 기존 Native 주 실행자 방식 유지.
- [x] Task1 구현·focused/전체/연결·foundation/보존 검증 및 Astra max 지적 작성자 보완. 로컬 commit만, 실제 native PASS 없음.
- [x] 기존 P09만의 Task2 실행 승인, 로컬 reader 검증·Astra max0/0/0 및 실제 before 출처 기록. 제품/원래 시청 profile 변경·push/PR 없음.
- [x] MCP 묶음 승인·고정 설치/비활성 project 등록·오프라인 handshake/tools metadata RED→GREEN, 이전 P09 Developer modefalse/종료 확인.
- [x] MCP 연결 자격: P09 한정 임시 제한/종료 승인 뒤 정확한 P09 root·Chrome155·loopback listener 소유 PID·browser UUID 확인. 정상 new_page에서 target popup/styles와 worker 추적 확인. 패키지 patch/filter 해제 없음.
- [x] 이번 실행 마감: observer/MCP 서버 child0·P09 정상 종료·두 debug endpoint 폐쇄·Developer modefalse·설치/권한 불변 확인. private config 비활성/JS OFF/port0·임시 allowlist 제거.
- [x] Task2 baseline/seeded/cold API JSON·마감·최종 checker: 사용자 profile/context 확인 뒤12개 JSON·revision4·4 native facts·순차 journal에 NATIVE-PREFLIGHT-PASS. 첫 paste 실패는 별도 보존하며 승인된 seed 유지.
- [x] Task2 전체 native 범위 최종 Astra max0/0/1·문서 Minor 이력 교정·연결123/123·문서/보호 검증·로컬 기록 마감. 실제 업데이트/전체 AF05-B·공개 승인과 별개.
- [ ] AF05-B 전체 잔여 게이트·공개 경계·단일 한글 PR 승인. 현재 push/PR/배포 없음.

## P09 임시 제한 승인 후 실제 MCP 연결

다음 항목은 API 관측을 시작하기 전 capability 준비의 순차 이력이며, 뒤의 실제 관측·마감 결과로 이어진다.

사용자2026-10-13 승인: P09에서만 임시 네트워크 제한을 적용하고 실제 검증까지 진행, 검사 후 MCP 분리/P09 종료로 해제. AF05-B 전체 완료 전 push/PR 금지는 유지한다.

- 실행 전 좁은 read-only reader: 정확한 P09 root 부재·Developer modefalse·현재 스토어 설치2.13.3/파일/권한 일치. sandbox realpath EPERM은 같은 read-only 명령의 승인된 escalation으로 확인했으며 실패를 성공으로 취급하지 않았다.
- 표준 Chrome을 정확한 기존 P09 user-data-dir, loopback remote-debugging-port0, disable-sync/no-first-run, about:blank로 열었다. Chrome155.0.8059.40, 프로토콜1.3, listener127.0.0.1 한 개의 소유 PID가 해당 browser root와 같고 DevToolsActivePort의 browser UUID가 /json/version의 endpoint와 같았다. 다른 Chrome 포트/탭은 조회하지 않았다.
- private project config는 enabled=false/JS=false/port0 sentinel을 유지하며 공식 target-origin allowedUrlPattern만 추가했다. official SDK StdioClientTransport에 현재 검증한 wsEndpoint를 in-memory로 전달해 연결했다. 첫 list_pages는 about:blank만 보였으나 정상 new_page popup/styles 뒤 두 UI와 background service worker(sw-1)가 나타났다. 실제 capability 접근 성공이며 storage/API 결과 성공은 아니다.
- 재연결 후 기존 extension popup의 page ID 탐색은 assertion 실패했다. 초기 page target filter가 기존 extension page를 제외하는 경로와 일치하며 native observation 요청 전에 일어난 capability 오류다. 필터 해제/직접 강제 attach는 하지 않았다. 공식 new_page로 새 popup을 여는 동작은 다시 성공했다. 관측 단계에서 사용할 UI는 정상 new_page 뒤 같은 MCP 연결에서 유지해야 한다.
- 새 private run P09Native20261013B의 source9/nonce/probes 준비와 before facts 기록만 성공했다. profile/context 확인을 요청했고 아직 confirmed event·API probe 요청·JSON·seed-start·저장 변경은 없다. 이전 실패 run은 그대로 보존했다.
- 각 capability SDK client는 finally에서 close했다. P09 창은 사용자 context 확인을 위해 열려 있으므로 임시 Network 규칙의 최종 해제/P09 종료·endpoint 폐쇄를 아직 완료했다고 주장하지 않는다. 최종 마감과 native PASS는 미완료다. Console 붙여넣기·allow-pasting·개발자 모드 변경·다른 확장 변경·제품 변경·push/PR/릴리즈 없음.

## 실제 native 관측·저장·cold·마감 결과

사용자가 Chrome version 화면에서 정확한 P09 Default 경로를 확인했다. 동일 P09 root/listener/browser UUID를 다시 대조해 새 run B의 profile-context confirmed를 기록했다. 관측용 SDK는 private 비활성 등록의 인자를 사용하되 검증한 wsEndpoint와 JS 평가/Input을 승인된 observer process에서만 켰다. 공식 SDK 외 다른 제어 client/패키지 patch/filter 해제는 사용하지 않았다.

| 단계 | 실제 결과 |
| --- | --- |
| baseline / 4 JSON | config/styles/styleParameters/settingsRevision 모두 absent, UI 기본값·ready/enabled·retry/discard 숨김·CSS[]·ID/version/권한/broker hash 일치; STAGE-ACCEPTED |
| 정상 UI seed | seed-start를 먼저 기록. 실제 target snapshot UID의 official fill로 arrowSeekfalse → previewVolume25 → hide-rankingtrue → font8 저장. 다른 값·raw storage 쓰기·대상 reload 없음 |
| seeded / 4 JSON | config/스타일/파라미터 literal·revision4·UI 일치, CSS 등록순서 chat-font-size → hide-ranking; STAGE-ACCEPTED |
| 완전 종료·재시작 | observer 분리·MCP child0 뒤 exact P09 root의 정상 CloseMainWindow 요청. closed facts/root 부재·old endpoint ECONNREFUSED 후 동일 profile 재시작. 새 root/start time·loopback owner/browser UUID와 restarted facts 확인 |
| cold / 4 JSON | 실제 새 worker·새 정상 popup/styles에서 네 값·revision4·UI/CSS 등록 보존. 자연 worker suspension/자동 업데이트 검사는 아님 |
| 마감 | cold observer 종료·MCP child0, exact P09 정상 종료·final endpoint ECONNREFUSED. after facts는 Developer modefalse·원래 설치/권한과 동일·root 부재. 승인된 네 seed 값 유지 |
| 최종 checker | finalize confirmed 뒤 기존 CLI가 source9·nonce·12 JSON·순서·before/closed/restarted/after·안정성·첫 실패·마감을 함께 대조해 NATIVE-PREFLIGHT-PASS/complete=true |

원래 Developer modefalse는 변경하지 않아 toggle 원복이 필요 없었다. private MCP 설정은 처음부터 끝까지 enabled=false이고 현재 JS/Input OFF·port0 sentinel·임시 allowlist 제거 상태다. 새 endpoint를 영구 config에 저장하지 않았다. 모든 MCP observer와 P09가 종료되어 이번 runtime Network 규칙 수명도 끝났다. 기존 시청 Chrome·제품2.13.3·root dist·릴리즈·frozen P02·보호 브랜치·공개 저장소는 변경하지 않았다.

private 결과는 `output/native-preflight-P09Native20261013B/`의12개 observations/4개 native facts/monotonic journal·attempts다. 준비는2026-10-13 23:13:26, before는23:13:27, after는23:36:48(KST)이며 이후 문서 로컬 마감은 다음날에 수행했다. 이전 P09Native20261013A의 실패를 삭제하거나 이번 PASS로 바꾸지 않았다. 서명 인증·실제 방송 MAIN/CSS 표시/오디오·native 스토어 업데이트·두 설정 창 경합·전체 AF05-B 완료/배포 승인은 주장하지 않는다. 독립 최종 품질 검토는 다음 절의 제한된 범위로 완료했고 공개 후 수용은 별도 게이트다.

## native 범위 최종 독립 품질 검토와 마감

fresh gpt-6-astra/max는 ced54b2..ba715cf의 native 전체 변경6커밋과 private 문서 snapshot·실제 run B 결과를 읽기 전용으로 검토했다. **Critical0·Important0·Minor1, native 범위는 문서 보완 후 로컬 마감 가능**이다. Minor는 과거 연결/대기 상태를 현재형으로 적은 문구이며 주 실행자가 요청된 최신 계획 정합화 과정에서 당시 이력으로 교정했다. 원래 독립0/0/1을 수정 후 독립0/0/0으로 바꾸거나 추가 reviewer를 호출하지 않았다.

- 독립 실행: fixture79/79·skip0, evidence inventory118개 hash·source9/current Node24.19.0·generated probes12·완료 attempts34·최종 complete event 확인. 순수 checker의 baseline/seeded와 최종 PASS, revision4·두 root 사이의 closed·Developer modefalse·설치/권한 전후 일치 대조.
- 주 실행자 fresh 연결 회귀:123/123·fail0·skip0. 두 JSDOM canvas 미구현 진단은 fixture 환경의 기존 제한이며 새 Chrome/runtime 오류로 표시하지 않는다. 이 문서 단계에서 canvas 의존성을 설치하거나 전체 제품 suite/build/CI/보안 scan을 반복하지 않았다.
- 주 실행자 순수 재생: 실제 journal을 수정하지 않고 terminal complete event 확인 후 기존 순수 checker로 PASS 재현. source9/Node/probes12·private config 원복·문서6개/상대링크86개/anchors/언어·diff 및 보호 artifact 불변 확인. 제품2.13.3/rootdist58/원본CRX/릴리즈/frozen/보호 브랜치 유지.
- 연결 준비의 popup lookup 오류는 profile-context/probe 요청·seed 전의 capability 점검이고 실제 관측 실패를 숨긴 것이 아님을 독립 reviewer가 대조했다. 정상 new_page 경로만 사용했고 old run A 실패는 별도 보존했다.
- 자동 마감은 정확한 root 검증/normal close 요청 뒤 root 부재·endpoint 연결 거부·MCP child0·after facts를 확인한 executor outcome이다. 사용자가 추가 마감을 수동 확인했다고 주장하지 않으며 최초 profile/context 사람 확인과 구분한다.
- 독립 reviewer는 실제 P09/포트/프로세스를 다시 조회하지 않았다. 저장된 근거의 replay를 주 실행자의 live 실행/종료 관측과 구분한다. CRX 서명·icon pixels/Chrome metadata 독립 인증·자연 worker suspension·실제 방송 MAIN/CSS/오디오·동시 client·실제 update/새 설치·플랫폼 rollback·전체 CI/보안/성능/릴리즈 인증은 별도 owning gate 또는 명시적 한계다. hostile 동시 파일 교체·위조된 수동 증거의 자동 인증도 기존 범위 밖이다.

후속 사용자 지시에 따라 새 버전 공개는 최소 F00·F01 구현·검증과 새 통합 후보의 기존 게이트 뒤에 별도 승인받는다. native PASS만으로 공개하지 않는다. 실제 업데이트 수용은 게시 후 AF05-B에서 마무리한다. 이 단계는 로컬 기록만 고정하며 push/PR·병합·version/릴리즈·스토어 변경은 하지 않는다.

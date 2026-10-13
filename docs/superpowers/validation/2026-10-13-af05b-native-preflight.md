# AF05-B Native Preflight — Task1 로컬 검증과 native 승인 경계

2026-10-13 / Asia-Seoul. **Task1 로컬 완료, Task2 코드/before 출처 확인 뒤 Chrome paste 보호로 BLOCKED-CAPABILITY.** [현재 계획](../plans/2026-10-13-af05b-native-preflight.md). 사용자 profile 경로 확인은 했지만 actual runtime JSON0·seed-start0·baseline/seeded/cold/finalize·전체 native PASS는 없다. 보호 우회 없이 중지, Developer modefalse 복원/검사 창 종료 확인 대기다.

## 승인과 근거

- 사용자 승인: 과거 native2.13.2→2.13.3 미검증 및 격리 코드 복귀/실제 플랫폼 롤백 미실행의 수용 기준 분리, 네이티브 사전검증 **계획 작성·검토**.
- 후속 사용자 승인2026-10-13: 계획 및 Task1 로컬 관측 도구 구현/검증. 실제 Chrome·프로필 변경은 별도 승인, AF05-B 전체 완료 전 push/PR 금지.
- 추가 사용자 승인2026-10-13: Task2는 기존 P09 검사용 프로필에서만 진행, 사용자의 개입이 필요하지 않으면 계속 작업. AF05-B 전체 완료 전 push/PR 금지는 유지.
- [상위 설계](../specs/2026-10-12-af05b-release-acceptance-design.md)와 [P09](2026-10-12-p09-store-publication.md)를 연결해 P09 배포 증거 고정만 종료했다. 과거 업데이트 성공·플랫폼 롤백 실행·native runtime PASS로 변경하지 않았다.
- 현재 계획은 Task1 로컬 관측 도구와 Task2 별도 승인 후 지정 P09 profile의 일반 UI/DevTools·좁은 파일/프로세스 근거를 분리한다. 현재 native 제어 연결은 확보됐다고 주장하지 않는다.
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

### Task2 독립 검토의 판단 제외 처리

- 실제 현재 설치/process 사실은 위 before 기록으로 일부 확인했지만 storage/runtime는 이후 API gate에 유지.
- 실제 DevTools 접근·baseline/seeded/cold는 현재 사용자 준비와 실행 증거 대기. source review0건은 이를 대체하지 않음.
- 사람의 profile/context·inspector 종료/finalize 진실성 및 제출하지 않은 오류·조작 JSON은 자동/암호학적 인증이 아님.
- icon pixels·Chrome metadata 독립 인증·CRX 서명, hostile 동시 파일 교체는 기존 명시적 제외/owned-files 순차 한계에 유지.
- MAIN/rendered CSS/audio·다중 창 경합·실제 update/플랫폼 rollback은 별도 AF05-B 게이트에 유지.
- 전체 suite는 작성자가 위 결과로 확인했고 reviewer의 전체 CI/build/security/performance/release 재인증은 아님.
- 최종 문서 마감은 실제 후속 관측에 따라 작성자가 갱신. 현재 Task2 미완료를 유지.

## 판단 보류 항목의 처리

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
- [ ] Task2 baseline/seeded/cold API JSON·마감·최종 checker. 첫 paste 보호로 BLOCKED-CAPABILITY, actual JSON0/seed-start0/전체 native PASS 없음. 원래 Developer modefalse 복원/대상 종료 정리 확인 대기.
- [ ] AF05-B 전체 잔여 게이트·공개 경계·단일 한글 PR 승인. 현재 push/PR/배포 없음.

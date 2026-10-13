# AF05-B Native Preflight — Task1 로컬 검증과 native 승인 경계

2026-10-13 / Asia-Seoul. **계획·Task1 로컬 구현/검증 승인 및 완료, Task2 실제 Chrome/프로필 실행 승인 대기.** [현재 계획](../plans/2026-10-13-af05b-native-preflight.md). probe·CLI는 구현했으나 실제 native preflight/프로필 조작은 실행하지 않았다. 아래 최초 계획 검토와 구현 후 검토/작성자 보완을 구분한다.

## 승인과 근거

- 사용자 승인: 과거 native2.13.2→2.13.3 미검증 및 격리 코드 복귀/실제 플랫폼 롤백 미실행의 수용 기준 분리, 네이티브 사전검증 **계획 작성·검토**.
- 후속 사용자 승인2026-10-13: 계획 및 Task1 로컬 관측 도구 구현/검증. 실제 Chrome·프로필 변경은 별도 승인, AF05-B 전체 완료 전 push/PR 금지.
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

## 판단 보류 항목의 처리

- 실제 Chrome/DevTools 연결·profile/설치/프로세스 상태: Task2 실행 승인과 capability gate에 유지. 정상 접근 불가 시 STOP하며 도구/정책 제한을 우회하지 않는다.
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
- [ ] Task2 지정 프로필 조작/Inspect/검사용 UI 저장·seed 유지/종료·재시작 승인과 실제 preflight.
- [ ] AF05-B 전체 잔여 게이트·공개 경계·단일 한글 PR 승인. 현재 push/PR/배포 없음.

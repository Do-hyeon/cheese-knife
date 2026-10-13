# AF05-B Native Preflight — 계획 검토와 승인 경계

2026-10-13 / Asia-Seoul. **계획 작성·독립 검토·작성자 보완 완료, 계획/Task1 구현 승인 대기.** [현재 계획](../plans/2026-10-13-af05b-native-preflight.md). 실제 native preflight/프로필 조작/새 probe·CLI 구현은 실행하지 않았다.

## 승인과 근거

- 사용자 승인: 과거 native2.13.2→2.13.3 미검증 및 격리 코드 복귀/실제 플랫폼 롤백 미실행의 수용 기준 분리, 네이티브 사전검증 **계획 작성·검토**.
- [상위 설계](../specs/2026-10-12-af05b-release-acceptance-design.md)와 [P09](2026-10-12-p09-store-publication.md)를 연결해 P09 배포 증거 고정만 종료했다. 과거 업데이트 성공·플랫폼 롤백 실행·native runtime PASS로 변경하지 않았다.
- 현재 계획은 Task1 로컬 관측 도구와 Task2 별도 승인 후 지정 P09 profile의 일반 UI/DevTools·좁은 파일/프로세스 근거를 분리한다. 현재 native 제어 연결은 확보됐다고 주장하지 않는다.
- 제품2.13.3·root dist·원본 ZIP/CRX·시청 Chrome·native 설치·frozen P02·보호 브랜치·공개 저장소는 변경하지 않는다. AF05-B 전체 완료 전 push/PR 금지와 실제 배포 금지는 유지한다.

## 독립 Astra max 검토

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

이 보완은 **작성자의 문서/소스 대조**다. 새 계획의 probe/CLI는 아직 없고 위 negative는 구현 시 RED→GREEN을 요구하는 계획이다. native 성공/독립 재검토0건/보안 인증으로 해석하지 않는다.

## 판단 보류 항목의 처리

- 실제 Chrome/DevTools 연결·profile/설치/프로세스 상태: Task2 실행 승인과 capability gate에 유지. 정상 접근 불가 시 STOP하며 도구/정책 제한을 우회하지 않는다.
- probe/CLI 정확성과 테스트 통과: Task1/2 구현 및 focused tests에 유지. 이번 검토는 정적 계획 검토다.
- seed 내구성·cold 실행·방송 MAIN·화면 CSS·오디오·실제 업데이트/context 오류: preflight는 worker/설정 UI/CSS 등록까지만, 나머지는 상위 AF05-B 실제 설치 수용에 유지.
- 스토어 심사/게시 버전·플랫폼 롤백 자격: 후속 공개 직전 확인/별도 승인. 검사용 전 사용자 rollback 실행 없음. 작성자는 Chrome 공식 debugging/API 안내를 읽었으나 실행 가능성이 입증된 것은 아니다.
- AF 전체 기능·회귀·CI·성능·보안·CRX 서명 인증: 기존 게이트 또는 별도 미검증 범위로 유지하며 계획 검토로 재인증하지 않는다.
- 병행 PLANS 전체/과거 결과 재인증: 작성자가 현재 P09 소유권·상위 수용 기준·체크리스트를 대조했다. reviewer가 기존 전체 증거를 재검증했다고 표현하지 않는다.
- 공개 순환 경계: ‘전체 AF05-B 완료 전 push/PR 금지’와 공개 후 actual update 수용의 순서는 후속 공개 전에 사용자에게 범위를 확인한다. 이번 검토/문서 보완은 공개 조건 완화 승인이 아니다.

## 체크리스트

- [x] 수용 기준 분리 승인과 P09 배포 증거 고정 종료를 문서에 반영.
- [x] 상세 계획·자체 대조·Astra max 독립 검토 및 I1–I6/M1 작성자 보완.
- [x] 문서5개/local link76개·언어/whitespace 오류0, git diff --check 통과. 보호 snapshot 동일·제품2.13.3·dist58개·원본 CRX hash 일치·native exact52개/HTML3개 분류 대조. 문서 수정만 수행; 전체 실행 suite 재실행 없음.
- [ ] 계획과 Task1 로컬 도구 구현 승인; 기존 Native 주 실행자 방식 유지.
- [ ] Task1 구현·focused/연결 검증. native 실제 실행은 별도 승인.
- [ ] Task2 지정 프로필 조작/Inspect/검사용 UI 저장·seed 유지/종료·재시작 승인과 실제 preflight.
- [ ] AF05-B 전체 잔여 게이트·공개 경계·단일 한글 PR 승인. 현재 push/PR/배포 없음.

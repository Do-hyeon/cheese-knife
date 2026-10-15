# F01 관측 분리 구현·검증 기록

2026-10-16 / Asia-Seoul. [승인 계획](../plans/2026-10-16-f01-observer-isolation.md)의 Tasks1–3 구현 기록이다. 새 Native 및 조사 checkpoint 공개 결과는 아직 없다. 이전 [공개 CI 실패와 인과 미확정](2026-10-16-f01-ci-remediation-progress.md)을 대체하지 않는다.

## 입력과 권한

- 구현 범위: `7fc99b7..fcbd7c9` (`6b63cfc` 판정 계약, `e1c4c08` 실행/CI, `fcbd7c9` 보존/복합 실패).
- 제품 DSP·기존 품질 허용치·원본 runner 본문/CLI·버전2.13.3·기존 required CI는 변경하지 않았다.
- 사용자는 Native 직접 구현·Astra max 구현 검토·새 전용 Windows 검증·기존 PR45 조사push1회/Linux9회와 기존6회까지 승인했다. 필수 검토/Native 입력·종료가 불완전하면 공개하지 않는다. 최종push·병합·정리·릴리즈·스토어 변경은 승인 범위가 아니다.
- 원격 읽기 확인: PR45 OPEN, head `65ad9b6f6d94b128bcd111bb16669c482de44ef7`, base `main`. 아직 이번 구현은 공개하지 않았다.

## 실제 로컬 검증

격리 실행 사본은 `output/f01-execution-20261015/source`다. 변경된 추적 입력을 대조하여 복사했으며 이 사본의 과거 `.git`을 최신 source 증명으로 사용하지 않는다. 로그는 sibling 실행 디렉터리에 보존한다.

| 단계 | 실제 결과 | 로그 |
| --- | --- | --- |
| 시작 baseline | 전체1666/통과1665/실패0/기존 private 제외1 | `observer-baseline-a.log` |
| Task1 | 행동 RED 후 집중50/50·strict 통과, 전체1669/통과1668/실패0/제외1 | `observer-task1-red-b.log`, `observer-task1-green-b.log`, `observer-task1-full-a.log` |
| Task2 | 실제 Node 자식·상한/timeout·CI 정확35출력 검사, 집중57/57·strict 통과, 전체1676/통과1675/실패0/제외1 | `observer-task2-focus-final.log`, `observer-task2-full-final.log` |
| Task3 | 후보 부분 실패·복합 음성 대조·보존 확인·IPC 검증 RED 후 집중165/165 | `observer-task3-focus-final.log` 및 보존된 각 RED 로그 |
| 종합 | 전체1710/통과1709/실패0/기존 private 제외1 | `observer-task3-full-a.log` |
| 기반9종 | toolchain/runtime inventory/fixture·제품·개발 타입/settings·MAIN 생성/build proof/audio tools 모두 통과 | `observer-task3-foundation-a.log` |
| 격리 build/package | 파일62·entry resources22·버전2.13.3 통과 | `observer-task3-build.log`, `observer-task3-package.log` |

처음 sandbox의 기존 symlink 검사에서 EPERM이 발생했다. 같은 검사를 권한 경계에 맞춰 다시 실행했고 테스트/허용치를 약화하지 않았다. Task2의 중간 full-a는 최종 소스와 실행 시점이 달라 최신 결과로 채택하지 않으며 full-final을 사용한다. 실패 로그는 삭제하지 않았다.

## 점검 도구

실제 root commit `fcbd7c9`에서 기존 도구를 실행했다. 결과는 private `output/tool-audit/run-2026-10-15T22-45-47-131Z-iAkP1Y`에 보존한다. 실행 사본이 아닌 root를 사용한 이유는 Git 이력 검사가 새 구현 커밋까지 포함해야 하기 때문이다. root build나 사용자 프로필 변경은 하지 않았다.

- 입력 전후 snapshot 일치: `true`.
- npm12.2.0 의존성 경고0, Gitleaks8.30.1 디렉터리0/Git이력0.
- ESLint 정적 경고62, raw exit1. 기존55는 파일/규칙/메시지 기준 대조에서 동일했다. 신규7은 새 host의 `createReadStream`, `lstat`, `mkdir`, `open`2개, `realpath`2개 동적 파일 경로 경고다.
- `--no-inline-config` 결과를 사용해 경고를 숨기지 않는다. 신규 경로의 실제 소유권 검증은 독립 구현 검토 대상이며, 경고0 또는 완전한 보안 인증으로 표현하지 않는다.

## 보호 상태·미실행

- root dist58을 유지했다. 파일별 SHA256 쌍을 기본 문자열 정렬한 JSON의 SHA256은 `b29c25e58e44b792b7814841406fbbfcd5e9ede22f5358dba9d5aca3f59af5be`다. 기존 package inventory의 다른 정렬/경로 표현 hash와 혼동하지 않는다.
- 기존 ZIP의 SHA256은 승인 pin `67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`과 일치했다. 새로 내려받지 않았다.
- 시청 Chrome/P09·과거 source/프로필/실패 자료를 변경하지 않았다. 새 Native 경로는 아직 생성하지 않았다.
- fresh Astra max 최초 구현 검토: **Critical0/Important3/Minor1**. 정렬 수치 실패를 입력 오류로 취급함, 전체 host의20분 상한 누락, transition/negative 최종 writer의 최초 오류 유실을 지적했다. F01 후보 보존 결과의 상수 덮어쓰기도 증거 진실성 때문에 author가 Important로 재등급해 같은 보완 패스에 포함했다.
- 11개 행동 회귀가 수정 전 실패·수정 후 통과했다. 원본 probe의 측정값 `-1`은 신호 없음이므로 유효한 수치 실패로 남기고, 기대 sampleRate/frame과 유한 정수 형식은 따로 검사한다. 품질 허용치는 변경하지 않았다.
- 전체 deadline의 준비/마지막 attestation/자료 수집/결과 저장 경계에서 초과 성공을 거부한다. 취소 가능한 파일 읽기·stream과 Git 호출은 실제 작업 상한을 사용하며, detached Promise 경쟁으로 검사를 끝내지 않는다. 초과 후에는 실패 보고서의 bounded15초 마감만 허용한다. 성공 JSON을 쓰는 동안 상한을 넘겼다면 host가 reject하므로 JSON 단독으로 완료를 인증하지 않는다.
- 두 최종 writer는 원래 실패/보고서를 유지하며 쓰기 실패를 bounded secondary에 남긴다. 기존32개 secondary가 있어도 마지막 writer 오류가 보존되는 RED→GREEN 검사도 통과했다. F01 true 보존 확인 결과가 최종 표시값이 된다.
- 보완 후 최신 입력 전체1726/통과1725/실패0/기존 private 제외1(`observer-review-full-final.log`), 9기반(`observer-review-foundation-final.log`), 격리 build62/check22(`observer-review-build-final.log`, `observer-review-package-final.log`)가 통과했다. root와 실행 사본의 비Markdown 추적 입력315개가 모두 동일하다. 동일 reviewer targeted 확인은 아직 남았다. 위 수정의 실제 Native 효과는 아직 검증하지 않았다.
- Native base/negative·일반 전환/손실·F01 cold/손실·Windows9회, 조사push 및 Linux15회는 미실행이다. 과거250Hz ON 실패는 미해결이며, 앞으로 관측 집합이 모두 통과해도 이번 조건 미재현으로만 판정한다.

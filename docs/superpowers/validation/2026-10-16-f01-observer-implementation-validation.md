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
- 첫 targeted는 I1/최종writer/보존표시 해소와 관련16/16을 확인했지만, I2 후처리 예외가 이미 반환된 자식 종료 기록을 덮는 Important1을 남겼다. 이를 실제 signal/timeout/errors 보존 검사 RED2건으로 재현해 보완했고 시간 상한5/5·strict가 통과했다. 최신 전체는 **1727/통과1726/실패0/기존제외1**(`observer-review-full-corrected.log`), 9기반(`observer-review-foundation-corrected.log`), 격리 build62/check22(`observer-review-build-corrected.log`) 통과다. 남은 동일 reviewer 확인 전에는 Native/push를 하지 않는다.
- `af35413` 도구 재검사도 입력 전후 일치·npm0/Gitleaks0·정적62/raw exit1이며 경고 항목은 이전과 동일했다(`output/tool-audit/run-2026-10-15T23-05-22-341Z-F7Av45`). 종료 기록 보완 후 감사는 별도 갱신한다. 취소 불가능한 OS metadata의 즉시 종료를 보장하지 않으며, 초과한 실행을 통과시키거나 host 종료 없이 JSON만 완료 증거로 사용하지 않는다.
- Native base/negative·일반 전환/손실·F01 cold/손실·Windows9회, 조사push 및 Linux15회는 미실행이다. 과거250Hz ON 실패는 미해결이며, 앞으로 관측 집합이 모두 통과해도 이번 조건 미재현으로만 판정한다.

## Task3 최종 gate

`0e868d0`의 잔여 I2를 동일 Astra max가 다시 확인했다. 실제 자식 종료 정보 보존·만료 후 읽기 금지·후속 STOP을 확인하고 deadline5/5를 직접 실행했다. **검토 범위 잔여 Critical/Important 없음, Task4 준비 가능** 판정이다. Native/OS I/O hang/Linux CI는 이 판정에서 제외됐으며, 해당 미확인 범위는 실제 Task4/5가 소유한다. metadata의 정확한 wall-clock 종료 불보장과 JSON 단독 완료 증명 금지는 수용한 한계로 계속 고지한다.

최신 실제 감사는 `output/tool-audit/run-2026-10-15T23-11-15-146Z-PqkLQY`다. 입력 snapshot 일치·npm0/Gitleaks 디렉터리0/Git0·정적62/raw exit1을 확인했다. root dist58/hash도 이전과 같고315개 비Markdown 추적 입력이 실행 사본과 같다. Task3 최종 집중171/171 및 strict를 계획의 task-done으로 다시 확인했다. 이 문서 단계까지 새 Native/push는 미실행이다.

## Task4 실제 부분 실행과 STOP

이하가 위의 이전 미실행 상태 이후 수행한 최신 사실이다. clean Native 입력 C는 `4eb1d2d98ae7536c066c1796772c007b5d682625`, 원본 F는 고정 `c5d45b8`이며, 새 물리 사본은 `output/f01-observer-native-20261016a/{source,frozen}`이다. 기존 의존성만 junction으로 연결했다. tracked clean·원본 runner의 Git blob bytes 일치·동일 lock·기존 ZIP pin을 확인했고 다운로드하지 않았다.

- Node24.19.0 실행 파일 SHA256: `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237`.
- Playwright1.62.1 번들 browser SHA256: `409805a16d6416087e6b2f778df1cf8f7bbb267d6b99f6b5bb0a618eace234f2`.
- 양 사본 LF lock SHA256: `539785dbfba59012079cfc56e9dda7a335fa1531e8cb699bebecc9ca8a7f14c7`. root working-file의 CRLF hash와 혼동하지 않는다.
- source466개 입력 hash `fcad8c071105e90fe23ed273e2bcc21d64f800705badb7a2476aee01a53b00e0`, F457개 hash `71759b75c7c5445d81bad08366bf3d3c7ebc000d01fbfc7d5e4730885b45c108`.
- 최초 sandbox 사전검사는 격리 AppData의 없는 browser cache 때문에 ENOENT였다. Chrome 실행 전 실패이며 `native-preflight.log`에 보존했다. 승인된 escalated Native 환경의 기존 browser로 동일 사전검사가 통과했다(`native-preflight-escalated.log`). 캐시 override나 설치는 하지 않았다.

| 실제 실행 | 결과 | 보존·종료 확인 |
| --- | --- | --- |
| `F01ObsBase20261016A` | base PASS,최상위 키20개/시나리오16개·65,690ms | profile/candidate 실제 존재, 해당 Chrome root0 |
| `F01ObsNegative20261016A` | 정확한 `main-runtime-missing` 대조 PASS, secondary 없음 | profile/원후보/변형 패키지 실제 존재, 해당 Chrome root0 |
| `F01ObsB2Positive20261016A` | **FAIL**, `transition-child-result-missing`, secondary `transition-child-exit` | result 없음, 부모가 만든5work roots/2candidate roots는 빈 채 보존, 해당 Chrome roots 모두0 |

base의 정상 context 종료와 사후 root0 조회를 media 전용3종료증명으로 표현하지 않는다. negative 내부 base report의 `ok:false/main-runtime-missing`은 예상된 실제 실패이며, 외부 negative-summary의 정확한 대조 성공과 구분한다. 자료는 같은 Native root의 `native-base.log`, `native-negative.log`, `native-base-negative-check.log`, `native-b2-positive.log`, `native-b2-failure-retention-check.log`와 source 아래 각 원본 summary/profile/candidate에 남겼다.

### 실행 방식 원인 조사

author가 programmatic 부모를 `node --input-type=module -e`로 실행했다. 기존 `forkChild`는 `execArgv`를 상속하고 자식 stdout/stderr는 ignore한다. 부작용 없는 기존 `scripts/audio-metrics.mjs`를 fork하는 독립 재현에서 같은 module-eval 방식은 `ERR_INPUT_TYPE_NOT_ALLOWED`/exit1, 일반 `node -e` 방식은 exit0/stderr없음이었다. `launcher-module-diagnostic.log`와 `launcher-commonjs-diagnostic.log`를 보존했다. 최초의 존재하지 않는 CJS 경로 조회는 MODULE_NOT_FOUND일 뿐 인자 상속 가설의 증거로 채택하지 않았다.

이 재현은 launcher의 결함 근거이며, 실제 실패 run 자식의 stderr가 없으므로 그 원래 예외를 직접 회수했다는 뜻은 아니다. 과거 CI의 font8/reload 실패 원인이나 제품 전환 결함을 해결했다는 근거로 사용하지 않는다.

### 최소 정정안 — 사용자 확인 대기

- 제품/검사 source·C/F·DSP·의존성·browser flag는 변경하지 않는다. programmatic 호출만 `node -e`의 동적 import로 실행해 `--input-type` 상속을 피한다. process.execArgv를 임의로 수정하지 않는다.
- 실패한 A 자료를 덮거나 삭제하지 않는다. base/negative는 반복하지 않는다.
- 일반 정상 전환을 **새 ID `F01ObsB2Positive20261016B`로1회** 실행하는 변경을 확인받는다. 이후 아직 실행하지 않은 원래 `F01ObsB2Loss20261016A`, `F01ObsCold20261016A`, `F01ObsColdLoss20261016A`, `f01obs-win-a`를 같은 안전한 launcher로 순차 진행한다.
- 계획의 기존 ID 충돌·누락/불완전 STOP을 준수하여 **현재 Task4 중지, Task5 조사push/CI 미실행**이다. 새 ID 승인과 검토 없이 재시도하지 않는다. 입력·종료가 다시 불완전하면 재실행을 반복하지 않는다.

동일 Astra max가 이 실행 교정안과 실제 자료를 읽고, 추가 소스 변경이 필요한 Important를 확인하지 못했다고 판단했다. `node -e`/동일 C/F/실패 A 보존/base·negative 반복 금지/새 B1회 사용자 확인/실패 시 STOP을 지지했다. 실제 새 launcher 전환·cold·오디오 검증은 수행하지 않았다. 교정 뒤 전환 자체가 실패할 위험과 A의 직접 자식 예외가 복원되지 않는 한계는 남는다.

### 교정안 승인 이후

2026-10-16 사용자가 위 교정안과 후속 순차 작업을 승인했다. Native source C는 `4eb1d2d` clean 그대로이며, 새 B artifact가 없는 것을 확인한 뒤 `node -e` 동적 import로 `F01ObsB2Positive20261016B`1회 실행을 시작했다. A 실패와 base/MAIN 대조 성공은 대체하지 않는다. B 결과와 아직 실행하지 않은 나머지 검사는 이후 실제 근거로 갱신한다.

- 일반 정상 전환 B: **PASS**,5seed/15phase·cleanup/secondary0. 실제5개 보존 root와2후보가 존재하며 각 소유 Chrome root0, source/after C 및 전체 입력 hash 일치다. `native-b2-positive-b.log`, `native-b2-positive-b-check.log`에 보존했다.
- 일반 저장 손실 A: **PASS**, 정확한 `transition-storage-preservation/new/startup/candidate-init`와 config 누락·기존 settingsRevision8을 확인했다. 1seed/1phase·cleanup/secondary0·실제 보존/소유 Chrome0·source/after C를 확인했다(`native-b2-loss.log`, `native-b2-loss-check.log`). readiness 실패를 손실 성공으로 대신하지 않았다.
- F01 cold 정상 A를 이어서 실행 중이며, cold 손실/Windows9회와 공개 CI는 아직 실행하지 않았다. 일반 전환 B 성공이 과거 공개 CI의 직접 인과 증명이나 실패 A의 삭제 근거는 아니다.

## Task4 완료 결과

위 진행 기록 이후 cold와 Windows9회가 완료됐다. 모두 **동일 clean C=`4eb1d2d`**에서 실행했으며 root 제품 코드를 수정하지 않았다.

| 검사 | 최종 결과 | 별도 확인 |
| --- | --- | --- |
| F01 cold 정상 A | PASS,11seed/28phase |39회 모두 정상 exit 및 close ack/disconnect/own root closed,11개 보존 root의 Chrome0 |
| F01 cold 손실 A | PASS,5seed/9phase |5개 정확한 손실 case/phase/startup,19회3종료증명,5개 보존 root의 Chrome0 |
| Windows F/U/T9회 | transportComplete=true / qualityPass=true / failures=[] |9개 exit0·closeConfirmed=true·signal없음·timeout/overflow없음, 정확35개 파일/34해시 재계산 일치 |

cold 손실은 `valid-ui/new`의 config 손실과 `loss-owned-gain`, `loss-inherit-bit`, `loss-eq-band`, `loss-preset-id`의 rollback 보존 실패를 정확히 검출했다. cold 두 검사 모두 cleanup/secondary0, source/after 전체 attestation 일치, 두 후보 실제 보존이다. payload inventory는 published58=`a7a23d74...`, F0059=`9715087a...`, F0162=`5d5784f5...`다. 전환 payload의2.13.4는 검사 내 업데이트 구분용이며 root/공개 버전을 바꾼 것이 아니다.

Windows9회 순서는 F1,U1,T1,U2,T2,F2,T3,F3,U3 그대로다. Node24.19.0/Playwright1.62.1/Chromium151.0.7922.34/48000Hz이며 기존 실행 파일 hash와 C/F 전체 입력 hash가 같다. F는 원래 report/로그만 있고 raw PCM·구조화 진단이 없다. U/T6개 진단은 원 PCM→요약·출처/설정/종료를 재검산했다. F를 U/T와 같은 증거 수준으로 표현하지 않는다.

원 report에서 기존 literal 수치 기준도 별도 재계산했다. 모든 run의 최저 전환 dip ratio는 약1.0(기준0.95), 최소 step 여유는 약1e-6, stress peak는0.9800000190734863(상한0.9801), full-scale 초과 sample0이다. 각 run의14case/18transition/12alignment를 확인했고 실제 오디오9개 보존 profile의 소유 Chrome root도 모두0이었다. 이는 **이번 Windows 조건의 미재현**이지 과거 Linux250Hz ON 원인/해결 또는 모든 설정 조합 인증이 아니다.

추가 원자료는 `native-f01-cold*.log`, `native-observer.log`, `native-observer-check.log`, `native-observer-metrics.log`와 C/F의 원 report/진단/프로필에 보존했다. 실패 A도 그대로다. 원자료를 새로 실행하지 않는 Task4 증거 assertion을 통과했고, 양 source tracked clean 및 root dist58/hash`b29c25e5...` 불변을 확인했다. 공개 CI는 아직 실행하지 않았으며, 다음 승인 범위는 기존 PR45의 조사push1회뿐이다.

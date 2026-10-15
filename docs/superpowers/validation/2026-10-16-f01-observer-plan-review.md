# F01 관측 분리 상세 계획 독립 검토

2026-10-16 / Asia-Seoul. 사용자 작성 설계 승인에 따른 **계획/설계 문서 검토**다. 구현·단위 테스트·Native·새 공개 CI·인과 증명·배포 검토가 아니다.

문서: [상세 계획](../plans/2026-10-16-f01-observer-isolation.md) · [추가 설계](../specs/2026-10-16-f01-observer-isolation-design.md). reviewer는 별도 clean context의 `gpt-6-astra`/`max`, task `/root/f01_observer_plan_astra_max`다. 읽기 전용이며 파일/index/HEAD·브라우저·네트워크·설치를 변경하지 않았다.

## 최초 판정

**Critical 0 / Important 3 / Minor 0. 실행 준비 보류.**

확인한 장점은 동일 제품 root를 쓰는 F/U/T 역할 분리, 원본 F와 현재의 관련 metrics/signal/artifact/launcher/helpers/lockfile 동등성, 수치와 증거 완전성의 분리, 기존6회 gate 유지, 고정9회/정확35파일/로그 상한/STOP 경계다. 이는 실제 실행 통과가 아니다.

| ID | 지적과 코드 근거 | author 확인·문서 보완 |
| --- | --- | --- |
| I1 | 일반 `runInstalledTransition`의 media=false finally는 정상 종료 후 roots/candidates를 삭제한다(`scripts/check-installed-transition.mjs:545`). Native 일반전환 CLI 두 개는 전체 증거 보존 약속을 지킬 수 없다. | source에서 확인. 일반 transition에도 programmatic retainEvidence를 넣고 부모→IPC→자식→후보 준비에 전파하도록 Task3/설계5절 보완. Task4 일반전환은 true를 주는 programmatic 호출로 변경, false cleanup/claim/close 계약은 유지. |
| I2 | `verifyCandidate`는 복사/build/check 실패 시 부분 후보를 자체 삭제한다(`scripts/verify-candidate.mjs:67`). base는 반환 후 candidateBuilt를 세우고 negative는 try 전에 호출하므로 상위 옵션만으로 보존할 수 없다. | source에서 확인. 기존 directory 인자를 보존하는 세 번째 선택 인자와 bool 사전검증·생성 후 부분 실패 보존·기존 경로 비소유를 Task3에 명시. 후보 테스트와 모든 호출부 포함. |
| I3 | base는 첫 오류만 유지하고 negative는 `main-runtime-missing` 코드만 수용한다(`scripts/check-installed-extension.mjs:611`, `scripts/check-installed-extension-negative.mjs:110`). 정확한 기대 오류 뒤 close/summary 쓰기 실패가 있어도 PASS가 될 수 있다. | source에서 확인. 단독 기대 오류만 음성 성공. secondary가 겹치면 `installed-e2e-incomplete`/cause/secondaryErrors로 실패 전달하며 기본 retention 값과 무관하게 조합 검사를 수행하도록 명시. |

위 내용은 **보완할 구현 요구의 확정**이지 현재 코드의 해결 완료가 아니다. 허용치나 오디오 DSP를 바꾸지 않는다. 앞의 두 항목은 보존 경계가 기존 승인 기본안에 누락된 것이므로 설계와 계획 모두 수정했고, 다음 사용자 실행 묶음 확인 대상에 포함한다.

## 판단하지 않은 범위와 author 처리

- 과거250Hz ON의 실제 원인과 reload 보완의 실제 Windows/Linux 효과: browser 미실행이므로 제외. **수용**, 후속 실제 검증/인과 STOP으로 유지.
- 새 host의 실제 timeout·상한·strict 통과: 구현 전이므로 계약만 검토. **수용**, Task1–3 RED/GREEN/전체와 Task4가 소유.
- 현재 원격 PR/CI 상태: 네트워크 없이 저장된 진행 기록을 읽음. **수용**, 기존 기록을 현재 원격 확인으로 재표시하지 않으며 승인된 push/CI 시 재확인.

## 동일 reviewer targeted 재검토

첫 targeted 판정은 **Critical0 / Important1 / Minor1**이었다. I1/I3는 문서상 해소됐고, I2는 F01 cold의 두 Native 명령이 CLI인 채 남아 준비 실패 보존을 놓쳤다. Architecture 요약도 확장 범위와 달랐다.

author는 cold 정상/손실도 `runInstalledTransition({...mediaSchema:'f01',retainEvidence:true})`로 바꾸고, 일반/cold의 정상/손실 전부 두 후보까지 true가 전달되는 RED를 명시했다. Architecture도 후보/base/negative/일반/cold 범위로 정정했다.

**두 번째 targeted 최종 판정: Critical0 / Important0 / Minor0.** 동일 reviewer가 최신 plan/spec hash와 cold 두 호출·일반/cold 두 후보 전달 검사·Architecture를 다시 확인했다. 보완에서 새 모순을 발견하지 못했으며 **사용자에게 실행 묶음 확인을 요청할 준비가 됐다**고 판단했다. 이는 문서상 지적 해소이며 구현 성공·실행 승인은 아니다. 두 잔여만 재확인한 것이지 실제 코드/테스트/Native·CI 효과/과거 실패 원인 검증이 아니다.

- 첫 targeted 요청 시 상세 계획 SHA256: `80f21c9c0caa11e0c26018a5fa88f450caed75bbe5ec2b4809c51bcf2048916b`.
- 두 번째 targeted 요청 시 상세 계획 SHA256: `523d345f76d8f0e9418d7b36241b519f6b004477cb318d12a27e2d24fef3dc68`.
- 요청 시 추가 설계 SHA256: `55123a16e3501363cd3ebcfd45d895d863868b711461f4821eb49fdf20f1393c`.
- 원래10월15일 검토 설계 hash `776947f9dc5f19f78d27776e1bf5bd3bcae32a7b933830fc8d4c459c48b1403a`는 그대로다.

구현/Native/추가push·PR/병합·릴리즈·스토어 변경은 이번 문서 검토 중 수행하지 않는다. 검토가 통과하더라도 작성 계획의 새 실행 묶음을 사용자에게 확인받는다.

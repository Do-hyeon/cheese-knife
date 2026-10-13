# AF05-B2 — 실행·검증 및 미완료 게이트

실행일2026-10-13 / Asia-Seoul. 기반 main `6b919e1c62661ec49a12ce6df2c02e11273af41d`, 로컬 작업 브랜치 `codex/af05b-acceptance`. 사용자 승인 범위는 B2 설계·Native(주 실행자 직접) 구현·새 bundled fixture 프로필/복사본·UI seed/저장 손실 control·owned cleanup·최종 Astra max 검토다. **스토어 native 업데이트 검사가 아니며 B2 전체 완료/PASS도 아직 아니다.** 중간 push·PR·배포는 하지 않는다.

## 현재 구현·독립 기대값

- Task1 commit `21ddb65`: 고정 공개 ZIP58파일 reader/cache preparation·JSON offset metadata·출처/입력/상한/변조/cache/link/redirect/deadline/IO negative·CI prepare. 실제 anonymous 다운로드201802bytes와 SHA를 검사했으며 private 원본 fallback은 없다. 집중96/96 통과, 새 lint 경고0.
- Task2 commit `9b86487`: 5case seed·정확한 revision4→8→11→14·unknown/nonce·legacy/손상 제한·raw/UI/CSS/MAIN/worker oracle와 packaged phase. 집중99/99 통과. 실제 전체 브라우저 전환의 성공과 구분한다.
- Task3 감독 구현 checkpoint `b0096de`, 후속 진단/worker 보정/버전 형식 변경을 포함한 현재 기술 checkpoint `4c774ce9af296498b03c2307584df9e7527c07a3`. parent/child launch/close ACK·600s/phase deadline·owned cleanup·실제 UI seed1회·awaited config 삭제 control·종합 증거 admission을 구현했다. 현재 집중79/79지만 아래 실제 전환은 미완료다.
- 제품/시험값 모두 세 자리 버전 형식 유지(사용자2026-10-13 수정 지시). 원본 제품2.13.3 불변, private T2.13.4/R2.13.5는 TEST ONLY이며 출시 번호 결정이 아니다. 초기 private 실패 보고서의 이전 시험 표기는 역사 기록으로 남긴다.

## 현재 확인한 게이트

검증 복제본 `output/af05b2-validation-20261013`은 로컬 immutable checkpoint의 clean checkout과 고정 의존성의 물리 복사본이다. root dist를 빌드/정리하지 않았다.

| 검사 | 근거/결과 | 한계 |
| --- | --- | --- |
| foundation9 | 기존 명령9개 모두 성공 | 마지막 제품/도구 계약을 유지; 신규 실제 전환 대체 아님 |
| 전체 Node | `4c774ce` idle 실행1075개/1074pass/실패0/기존skip1 | 비공개 P02 자료 부재 제외1, 새 skip 없음 |
| Windows 실패 이력 | 앞선 같은 checkpoint 전체 실행은 MAIN linked-source rename EPERM으로1073pass/실패1/skip1. 해당 파일 그대로 집중8/8 및 idle 전체 통과 | 일시적 동시 실행/파일 잠금 가능성은 있지만 정확한 원인은 확정하지 않음. 실패 로그를 삭제하거나 테스트를 완화하지 않았다 |
| build/package | clone의2.13.3/58파일·entry resource20 확인 | 원래 root dist/제출 ZIP 아님 |
| 합성 audio | 이전 기술 checkpoint `5a0dc76`의 동일 제품 코드, 기존14case/18transition/12alignment·quality gate 성공 | 주관 음질/실제 하드웨어 인증 아님 |
| 기존 설치 positive | 현재 `4c774ce`,67s·실제 packaged 기존 시나리오 성공 | inPlaceReloadObserved=false, 기존 headless unpacked reload 제한 명시 |
| 기존 MAIN-negative | 별도 실행 main-runtime-missing 탐지 성공 | B2 storage-loss control 성공이 아님 |
| 도구 감사 | 현재 `4c774ce`, npm0·ESLint7·Gitleaks dir0/git0·snapshot matched | raw exit1은 기존 findings.7개 모두 unchanged owned-files dynamic-FS 관측26/27/45/74/79/94/115줄. 새 보안 인증/경고0 주장 아님 |
| 보존 | 전후 JSON 동일: root dist58·원본 ZIP·package/lock/manifest2.13.3·frozen 자료·보호 브랜치·P09 profile 생성/수정 시각 | 실제 개인 프로필 내용을 검사하거나 변경하지 않음 |

## 실제 B2 실패·중단 지점

1. `B2positive`/`B2probe1`: old valid-ui 저장/reload 뒤 candidate-init의 `transition-execution`. manifest 시험 T를 읽지만 실제 broker7622자(게시 원본 길이), 후보7970자. EOL 정규화 차이 아님. 실제 실행 출처 대조가 cached old worker를 거부했으며 PASS로 바꾸지 않았다.
2. 주 실행자가 private 시험 확장 runtime.reload 후 새 worker 취득을 준비 절차로 추가했다. `B2positive2`: worker-reacquire timeout. 실제 시청/native 기준 확장은 대상이 아니다.
3. 기존 lifecycle harness의 read-only packaged popup wake를 적용했다. `B2positive3`/`B2probe4`: seed/launch에서 extension popup `net::ERR_BLOCKED_BY_CLIENT`. 마지막 실패의 예외 이름/메시지·stage와 이전 관측을 bounded private report에 보존했다.
4. 모든 위 실행은 context 정상 close와 작업 root/candidate cleanup 완료, retainedRoots0. 종료 미확인 자료를 지우는 fallback이나 storage repair 재주입은 없다.
5. Astra max가 고정 range `6b919e1..4c774ce`를 독립 검토했다. 판정은 **Critical0·Important6·Minor0, 완료 불가**다. 아래 보완은 작성자의 회귀 검사이며 수정 후 독립0건 판정으로 바꾸지 않는다.

## Important 6건 보완 — 작성자 검증

2026-10-13 사용자 후속 승인. 집중 연결 검사108/108, 실패/skip0. 검증 checkpoint `3458ece180827c5c57a887db27427a85fa95ea25`. 아래 실제 실행에서 I1의 환경 성립은 실패했으므로 6건 전체 최종 수용/Task3 완료는 아니다.

| 항목 | 재현·최소 수정 | 현재 근거 |
| --- | --- | --- |
| I1 시험 실행 옵션 충돌 | Playwright 기본 `--disable-extensions`만 제외, 정확한 후보 allowlist와 다른 기본 옵션 유지 | harness 옵션 RED→GREEN. 실제 seed/launch가 여전히 차단되어 **환경 수용 미완료** |
| I2 후속 오류 누락 | 첫 실패 유지, supervisor/child/parent의 secondaryErrors가 합격을 거부. 같은 예외의 중복 재전파만 제외 | 중복 close ACK 및 손실 이후 실제 post-close 파일 변조 RED→GREEN; parent 양성/두 후속 오류 대조 |
| I3 잘못된 실행 출처 | UI/저장 접근 전 version/ID/broker 검사, oracle도 execution 우선. 손실 admission에 seeded ID·T version·broker 일치 요구 | wrong-version+loss, raw-only·다른 ID/broker 반례 RED→GREEN |
| I4 입력 잠금 누락 | 두 popup과 styles의 6개 입력 disabled를 각각 관측 | 손상 상태의 단일 입력 활성화 mutation·6개 literal 기대값 RED→GREEN |
| I5 손상 최종 캐시 | 같은 owned root의 완료 임시 파일을 배타적 hard link로 게시, 기존 파일을 덮거나 삭제하지 않음 | 17bytes 후 ENOSPC 재현 RED→GREEN; 실제 게시/기존 대상/연결 경로/실패·경쟁 캐시 보존 검사 |
| I6 child 수명 검사 부족 | 외부 browser/build/IPC 경계만 주입, 실제58파일 install/inventory 유지 | 준비·2차 build·partial install·launch·trace·close·ID·source 변경·post-close 변조10/10 |

hard link는 새 의존성 없는 Node 기본 기능이다. 새 guarded filesystem 관측1개가 추가되며 스캐너를 완화하거나 frozen 경고 원장을 고치지 않는다. hard link를 지원하지 않는 파일시스템은 준비 FAIL이며 copy/overwrite fallback은 없다.

### 보완 checkpoint 재검증

| 검사 | 결과·실제 근거 | 제한 |
| --- | --- | --- |
| 새 B2 positive | `B2fixedPositive`, `ok:false`, seed/launch의 `transition-failed`, reload 뒤 popup `ERR_BLOCKED_BY_CLIENT`, seeds/phases0 | 5case 전환 미실행·미합격. 옵션 충돌 보완만으로 해결되지 않음 |
| 새 B2 storage-loss | `B2fixedNegative`, `ok:false`, 같은 seed/launch 차단, seeds/phases0 | 저장 손실 탐지 성공으로 인정하지 않음 |
| 위 두 종료·정리 | cleanupErrors/secondaryErrors/retainedRoots 모두 빈 배열 | 각 context 정상 close·작업 root/후보 정리. 개인 Chrome는 대상 아님 |
| foundation9 | 현재9개 모두 성공 | clone에서 실행, toolchain/runtime/typecheck/build-proof 포함 |
| Node 기본 병렬 전체 | 1094개 중1092pass/실패1/기존skip1 | `MAIN runtime rejects linked sources and outputs`의 Windows rename EPERM 재발. 실패 이력 보존 |
| 해당 검사 단독 | 원본 그대로8/8 | 실패 원인이 동시 실행/파일 잠금인지 확정하지 않음 |
| Node 전체 직렬 | **1094개 중1093pass/실패0/기존skip1**, `node --test --test-concurrency=1 tests/*.test.cjs` | 파일 단위 실행 순서만 직렬, 테스트 변경·제외·새skip 없음. 병렬 성공으로 표현하지 않음 |
| build/package/audio | 후보2.13.3·58파일·entry resource20 및 기존 합성 품질 gate 성공 | 제품 코드는 변경하지 않음 |
| 기존 설치 positive | `B2fixExisting`,65.385s, `ok:true` | inPlaceReloadObserved=false, headless unpacked worker 재시작 제한 유지 |
| 기존 MAIN-negative | `B2fixExistingNegative`, `ok:true`, main-runtime-missing | 새 B2 control 수용 대체 아님 |
| 도구 감사 | npm0·ESLint8·Gitleaks dir0/git0·snapshot matched=true, raw exit1 | 기존7개 및 새 `owned-files.mjs:125`의 fs.link guarded 관측1개. 아래 대조를 읽고 판단 |
| 보호 대조 | 시작/종료 JSON 동일, `protectionEqual=True` | root dist·원본 ZIP·package/lock/manifest2.13.3·동결 원장·보호 브랜치·P09 profile 메타데이터 불변 |

도구 보고서 private 경로: `output/af05b2-validation-20261013/output/tool-audit/run-2026-10-13T07-39-50-696Z-F3F8yc/summary.json`. 원래 frozen P02 원장은 변경하지 않았다. 기존26/27/45/74/79/94/115줄7개의 rule/location은 그대로다. 추가125줄은 `publishFile`의 source(file)/destination(missing-or-file)·root operation/overlap·immediate-parent 검사를 통과한 두 경로만 fs.link에 전달한다. 실제 no-overwrite·completed bytes·linked/traversal/overlap 거부 및 ENOSPC/EEXIST 보존 검사가 통과했다. 이를 **검사된 guarded-boundary 관측**으로 남기며 경고0/독립 보안 인증으로 표현하지 않는다.

### 설치 준비 진단 재설계 — 제안·새 실행 미승인

실제 팝업 차단이 반복됐으므로 더 이상의 무작정 재시도·cache/profile 초기화·다른 실행 fallback은 하지 않는다. 다음 단계는 **새 private fixture의 재로드 수명만 제한된 사건 관측으로 진단하는 설계**다.

1. 같은 승인된 bundled Chromium·고정 payload에서 reload 전 packaged popup 접근/ready와 worker ID를 읽기 전용으로 확인한다.
2. 단 한 번의 reload 요청 전후 worker close/new-worker·popup navigation 실패 시점을 bounded record로 기록해 초기 접근 차단, reload 과도기, 재기동 실패를 구분한다. 고정 sleep/반복 재시도나 기대값 채우기는 하지 않는다.
3. 근거로 준비 절차 수정안을 작성하고 사용자 승인 후에만 구현·실행한다. ID/profile/저장/whole58 inventory/oracle/종료 증거 요구는 완화하지 않는다. 새 방법도 성립하지 않으면 환경 미지원으로 명시하고 실제 전환 완료를 주장하지 않는다.

사용자 Chrome·native P09·제품·권한·스토어·storage reset/repair·CDP/브라우저 정책 우회는 제외한다. 이 진단의 **상세 설계·실행 승인**이 다음 의사결정 게이트다. 지금 이 제안을 실제 재실행하거나 Task3을 완료하지 않았다.

검토자가 판정하지 않은 범위의 처리: 실제 스토어 업데이트/서명/스토어 ID/과거2.13.2/P09/native 롤백은 별도 게이트로 보류; 실행 옵션의 실제 환경 성립은 작성자 설치 검사로 확인; broker+inventory를 모든 코드 경로 실행 증명으로 확대하지 않음; 실제 방송/인증/OS 네트워크 격리·보안 인증/Daybreak/HLS 검토는 범위 밖; 보호 파일/빌드/audio는 작성자 별도 검사; 동시 악의적 filesystem 교체/엄격 임시 trace quota·다중 사용자 부하는 owned 로컬/CI 계약 밖으로 남긴다.

설치형 새 positive5case 및 B2 실제 storage-loss negative는 **아직 합격하지 않았다**. 현재 CI의 새 두 명령도 공개에서 검증한 상태가 아니다. 실제 native/CRX/스토어 ID 연속성·열린 old content script 정리·플랫폼 rollback·차기 배포·F00 해제는 별도 미완료/미승인이다.

## 구현 과정의 판단·비용

- 사용자 기존 선호대로 현재 폴더의 로컬 feature branch, 실제 빌드는 immutable clone에서만 실행. 비용: 공유 branch 상태를 정확히 점검해야 함.
- 전체 AF05-B 종료 전 private 원장/log를 보존. 비용: ignored 디스크 사용량.
- Windows cache 링크 거부 시험은 권한이 필요 없는 junction, Unix는 file symlink. skip 없음. 비용: Windows 파일-symlink 생성 권한 자체는 시험하지 않음.
- font0은 네 변수0px, 손상 UI는 snapshot 없는 기본 brightness1/MAIN은 실제 normalized brightness1.25로 대조. 제품을 잘못된 oracle에 맞추지 않음. 비용: 실제 설치 gate의 재확인 필요.
- 전체 fake browser를 만들지 않고 순수 상태 mutation/polling/오류 단위와 실제 packaged phase를 분리. 비용: UI/concurrency 완전 실행은 현재 막힌 Task3에 남음.
- parent는 새 root/candidate 컨테이너를 먼저 소유하고 preparation/build도 supervised child600s 안에서 실행. 비용: build 전 생성한 미사용 root 정리와 비정상 child 종료 시 보수적 보존.
- worker runtime.reload는 private 준비 보정만의 판단이며 native/in-place 성공 증거 아님. 실제 현재 준비 절차도 실패했으므로 독립 검토/수정 후 전환 gate를 다시 통과해야 한다.

원문 실행 원장·RED/GREEN·보고서는 `.superpowers/sdd/2026-10-12-af05b2-installed-transition/` 및 `output/af05b2-execution-20261013/`에 private 보존한다. 보존 경로/개인 자료는 공개 artifact 대상이 아니다.

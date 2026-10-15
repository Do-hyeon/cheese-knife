# F01 관측 효과 분리·전환 재검증 추가 설계

2026-10-16 / Asia-Seoul. **작성·자체 검토 완료, 사용자 문서 승인 전.** 이번 승인은 추가 설계 작성까지다. 아래 구현·Chrome 실행·추가 push는 아직 승인되지 않았다.

## 1. 목적과 현재 사실

목적은 과거 Linux 250Hz ON step 실패를 추측으로 고치지 않고, 제품과 검사 도구의 관측 효과를 분리하는 것이다. 별도로 로컬 reload 보완이 실제 설치 전환과 정확한 저장 손실 검출에 유효한지 확인한다. 두 문제를 서로의 해결 근거로 사용하지 않는다.

- 현재 로컬 `6a60035333a4d875e908095a87767b365255dd9d`, PR #45 공개 head `65ad9b6f6d94b128bcd111bb16669c482de44ef7`. 로컬 reload 보완은 미공개다.
- CI38766311444는 오디오 U/T 6회·기본 설치/MAIN 제거 검사는 통과했지만 일반 전환/손실 2건은 실패했다. 전체 CI는 실패다.
- T의 master anchor 18pair는 시각 차이가 모두0이었다. 과거 실패는 미재현이며, fake clock의 dip과 실제 overshoot의 인과는 입증되지 않았다.
- U는 예약 wrapper만 없는 모드다. 추가 page 평가·전환 후 clock 조회·capture 보관/진단은 여전히 있다. 이를 원본과 같은 ‘무계측’으로 부르지 않는다.
- reload 경쟁은 제어된 경계에서 RED→GREEN, 로컬 전체1665통과/실패0/기존제외1이다. 과거 CI에 원래 예외가 없으므로 실제 실패 원인을 확정하거나 두 공개 실패를 해결 처리하지 않는다.

근거는 [진행 기록](../validation/2026-10-16-f01-ci-remediation-progress.md)이 소유한다. 기존 [검토 완료 설계](2026-10-15-f01-public-ci-follow-up-design.md)와 hash·실패 기록은 수정하지 않는다. 이 문서는 기존 계획 Task3의 STOP을 해제하지 않고 추가 조사 경계만 제안한다.

## 2. 선택지와 권장안

| 안 | 장점 | 한계/판단 |
| --- | --- | --- |
| **F/U/T 동일 산출물의 순서 균형 대조** | 원본과 현재 U의 차이, U와 T의 wrapper 차이를 따로 관측 | 작은 집합으로 간헐 원인의 부재를 증명할 수 없음. 권장 |
| 결정적 clock 모델만으로 DSP 수정 | 구현 범위는 작음 | 실제 Linux 실패와 인과 불일치. 현재 승인 기준에서 제외 |
| 무작위 부하·반복 횟수 확대 | 드문 실패를 만날 수 있음 | 조건·중단 기준을 사후 선택하기 쉬움. 첫 단계에서 제외 |

새 모드/프레임워크를 제품에 추가하지 않는다. 기존 CLI와 원본 source의 물리 사본, 작은 host orchestration/검증 코드만 사용한다. F/U 차이가 나도 clock 조회 하나가 원인이라고 단정하지 않는다. 그때만 더 좁은 후속 실험을 설계한다.

## 3. 대조 입력과 실행 집합

### 3.1 원본과 현재 도구의 분리

- **F:** 계측 추가 직전 `c5d45b8a7abf30450d3f1bbff45afbb8cd020cb5`의 runner와 전이 의존성 전체를 clean 물리 사본에 고정한다. 이 입력에는 이미 Linux launcher 선택 보완이 있다. 더 오래된 실제 실패 당시 입력과 완전히 동일하다고 주장하지 않는다.
- **U/T:** 추가 조사 도구/retention 보완까지 포함한 새 clean checkpoint에 고정한다. U는 TRACE 미설정, T만 기존 `KNIFE_AUDIO_QUALITY_TRACE=1`을 사용한다.
- 세 모드는 기존 `--root`로 **같은 단일 제품 자산 root**를 읽는다. `AUDIO_ARTIFACT_FILES`의6개 파일을 실행 전후 실제 bytes로 대조한다. F의 제품을 따로 build하거나 원본 runner를 옮겨 import 경로를 바꾸지 않는다.
- F의 CLI·runner·사용하는 helpers/metrics/signal/launcher/owned-files 등 전이 입력을 hash로 고정한다. 현재/원본 간 차이를 명시하고 같은 lockfile·기존 설치 의존성·Node 실행 파일·Playwright browser 경로를 사용한다. 현재 확인한 metrics/signal/artifact/launcher/helpers/lockfile의 두 checkpoint 간 차이는 없다. 실행 때 재확인한다.
- 기존 frozen 본문/CLI hash 계약과 stereo 누락 거부를 유지한다. 정상 stereo 입력만 비교하고 F의 과거 누락 처리 약점을 새 허용으로 가져오지 않는다.

### 3.2 고정 순서·예산

각 OS에서 아래9회를 **직렬 1집합, 각 셀 1회**만 실행한다. 명령은 기존 `node scripts/check-audio-quality.mjs --root <고정 제품 root> --label <고유 label>`이다. F/U/T별 cwd와 TRACE만 명시적으로 다르다.

| 블록 | 순서1 | 순서2 | 순서3 |
| --- | --- | --- | --- |
| 1 | F1 | U1 | T1 |
| 2 | U2 | T2 | F2 |
| 3 | T3 | F3 | U3 |

- 순서 위치를 균형화할 뿐 CPU·warm-up 효과를 제거했다거나 통계적 유의성이 있다고 주장하지 않는다. 임의 대기·추가 부하·브라우저 flag·신호 phase·측정 창은 추가하지 않는다.
- Windows는 새 전용 source/자체 프로필에서 위9회다. Linux는 기존 PR의 추가 조사 checkpoint에 전용 job 1개(기존25분 상한)로 위9회다. 원래 verify의 필수 U/T 6회는 대체하지 않으므로 **그 checkpoint의 Linux 오디오는 총15회**다. 두 job 결과를 같은 환경 표본으로 합치지 않는다.
- 기존 required CI 이름·Node 정책·browser pin·timeout을 바꾸지 않는다. 추가 job도 실패 시 nonzero다. 시간 부족은 불완전 종료이며 timeout 연장/자동 재실행으로 닫지 않는다.
- 준비가 실패하면 browser를 시작하지 않는다. 숫자 gate 실패만으로 나머지 셀을 생략하지 않지만, 종료 미확인·자산 변경·경로 소유권 위반이면 후속 실행을 중단하고 미실행 셀을 기록한다. 실패 run을 교체하지 않는다.

### 3.3 관측과 파일 계약

- F runner는 원문 그대로 실행하며 timed browser 내부에 새 수집기를 넣지 않는다. F는 원래 report/exit/stdout/stderr만 있고 raw PCM·예약 이벤트는 **지원하지 않음**으로 기록한다. F에 없는 PCM을 제조하거나 U/T와 동일한 증거 완전성이라고 표시하지 않는다.
- host가 실행 전 manifest를 `wx`로 기록한다: 고정9label/순서·도구 commit과 전이 hash·제품6hash·Node/Playwright/browser 경로 및 실행 환경·CI checkout/head·허용 출력 목록. 실행 후 각 exit/signal/실제 report browser/sampleRate·산출물 hash를 연결한다. 모드별 tool SHA가 다른 것은 계획된 차이이고 제품 hash/환경 차이는 무효다.
- 수집 대상은 **전체 report9 + U/T diagnostic6**이다. 기존 U/T 진단8MiB/run 상한·양 채널18창·예약 상한·raw→요약 exact 대조를 유지한다. F도 원래14/12/18/stress·calibration·수치 gate를 독립 재평가한다. 배열 개수뿐 아니라 주파수/전환 종류/값/양 채널/유한 수치의 전체 기대 조합을 검사한다.
- `transportComplete`(전 셀 실행/파일/입력 유효)와 `qualityPass`(원래 수치 gate)를 분리한다. 수치 실패로 nonzero인 유효 report도 분석 입력으로 보존하지만 최종 job은 실패다. 누락·timeout·close 실패도 PASS가 아니며, nonzero 이유가 불명확하면 수치 실패만으로 설명하지 않는다. F는 정상 종료 기록을 원래 계약 수준으로만 인정한다.
- F 원래 writer의 overwrite 동작은 변경하지 않는다. 새 사본/사전 고정 label·실행 전 전 경로 부재 확인·동시 writer 금지로 보호한다. 기존 output이나 실패 파일이 있으면 시작 전에 거부한다.
- 공개 artifact는 위15개 JSON + manifest1 + 최종 결과1 + 셀별 stdout/stderr18개, **총35개 exact 경로**만7일 보관한다. JSON은 개별8MiB·로그는 개별2MiB 상한이며 초과 시 불완전 실패다. 자식 출력은 파일로 흘려보내고 상한 감시/자기 자식 종료를 사용하며 메모리에 무제한 모으지 않는다. 잘라낸 로그를 완전한 증거로 취급하지 않는다.
- manifest의 공개본은 repo 상대 경로/버전/hash만 포함한다. 환경변수 전체·사용자 경로·프로필·trace·스크린샷·실제 방송/계정/쿠키/채팅을 추가 artifact에 올리지 않는다. 기존 E2E 실패 artifact 정책은 유지한다. 합성 데이터만 생성하고 실제 소리는 silent sink다.

## 4. 결과별 판정과 STOP

| 관측 | 허용하는 결론 | 다음 단계 |
| --- | --- | --- |
| F/U/T 모두 수치 통과 | 이번 조건에서 미재현 | 과거 실패 미해결 유지, 추가 실험 또는 제한 수용을 사용자에게 제시 |
| F 실패, U/T 통과 또는 그 반대 | runner 묶음 차이에 따른 관측 효과 후보 | 추가 clock/PCM 보관 등 개별 원인 분리 설계. DSP 수정 금지 |
| T만 실패 또는 T만 통과 | 예약 wrapper 관측 효과 후보 | 계측 비간섭 가설 재검토. T를 제거해 제품 합격 만들지 않음 |
| 여러 모드에서 같은 실패 | 공통 제품/플랫폼/원본 probe 원인 후보 | 시간·상태·신호와 근거 대조 후 국소 보완 설계. 곧바로 clock 원인으로 확정하지 않음 |
| 누락/환경 불일치/종료 실패 | 불완전 또는 비교 무효 | 자료 보존·STOP, 남은 gate 미충족 |

**어떤 조합도 자동으로 원인 확정·Task3 완료·최종 push·병합 승인이 되지 않는다.** 작은 표본의 반복 통과는 해결 증거가 아니다. 이전 실패와의 인과 대응 및 수정 전후 검증, 또는 미해결 제한에 대한 별도 사용자 수용이 있어야 기존 마감 단계로 복귀한다. 제한 수용을 권장안에 자동 포함하지 않는다.

## 5. 전환 재검증과 증거 보존

로컬 `6a60035`의 navigation wait·bounded 원래 예외 보완을 새 source에서 검증한다. 기존 exact raw/UI/CSS/MAIN·published1/F00의2/current3 oracle을 유지한다. 일반 정상 old→new→old와 정확한 storage-loss, F01 cold 정상과 정확한5손실을 모두 실행한다. readiness timeout이나 과거 font8 단계 실패는 손실 검출 PASS가 아니다.

코드 조사에서 기존 base/negative runner가 정상 종료 시 자체 profile/candidate를 삭제하는 경로를 확인했다. 이전 계획의 ‘모든 profile/후보 보존’과 충돌하므로 실행 전에 아래 국소 보완을 설계에 포함한다.

- `runInstalledExtensionE2E`와 `runInstalledExtensionNegative`의 **programmatic boolean `retainEvidence=false`**를 추가한다. boolean 이외 값은 생성/실행 전 거부한다. CLI parser/qualification 의미와 기존 false 동작은 유지한다.
- 이번 Native host만 true를 전달한다. negative 준비·실패 경로와 base finally까지 전파해 해당 run이 생성한 후보/negative 복사/프로필만 보존한다. 숨겨진 dependency no-op으로 cleanup을 우회하지 않는다.
- browser/trace/session 정상 종료는 보존 여부와 무관하게 수행한다. close 실패는 원래 오류/secondary와 함께 실패로 남기고, profile 보존을 process 종료의 증거로 사용하지 않는다. 일반 base의 context.close를 native3증명으로 부풀리지 않는다.
- report에 실제 소유 경로와 존재 확인/보존 상태를 남긴다. 이미 존재하던 경로는 생성 대상으로 채택하지 않는다. Native 자료는 private output에만 둔다. 원본 F 및 Linux 임시 context의 기존 자동 수명주기는 바꾸지 않고, 디스크에 실제 생성된 관측 자료만 보존한다.
- 기존 `output/f01-ci-follow-up-20261016/source`(65ad9b6 준비본)와 과거 실패를 그대로 두고 새 run root를 만든다. 새 상세 계획에서 source 고정 후 모든 run ID와 exact 명령을 확정한다. 사용자 시청 Chrome/P09·root dist는 건드리지 않는다.

전환 검증은 오디오 원인 미확정 중에도 독립적으로 진행 가능하지만, 통과가 오디오 STOP을 해제하지 않는다. 새 CI의 원래 예외가 다른 원인을 가리키면 추가 무근거 navigation/retry를 넣지 않고 다시 설계한다.

## 6. 변경 도달 범위·검증

아래는 예상 범위이지 이번에 수정한 제품/도구가 아니다.

| 경계 | 예상 변경/검사 |
| --- | --- |
| 오디오 host orchestration/판정 | 기존 `audio-quality-diagnostics.mjs`의 gate/shape/owned helpers 재사용. 원본 실행·9집합/실패 자료 판정만 작은 host 모듈로 분리; 기존6집합 계약을 완화하지 않음 |
| 원본 runner/제품 DSP/생성 pin | **무수정**. 원본 source/hash·같은 제품6파일·본문/CLI frozen mutation 검사 |
| CI | pinned F 사본 준비·전용9run job·exact35artifact. 기본6run/설치형/전환 gate는 유지 |
| base/negative caller·fixture | 위 retainEvidence 전파와 report만 변경. 기존 false cleanup 계약·true 실패/정상 보존·항상 close·잘못된 bool/기존 경로 거부를 실제 실행 경계 테스트 |
| source attestation/도구 타입·목록 | 새 host 모듈의 실제 전이 입력·strict checkJs·검사 fixture 목록을 연결. 새 export 소비자 전부 검색; 목록/hash를 이유 없이 재발급하지 않음 |
| 문서 | PLANS의 승인 상태·source별 결과·실패/미실행·자체/독립 검토를 구분 |

필수 RED→GREEN: 순서/TRACE 혼동, 서로 다른 제품/Node/browser, F 원문 변경, nonzero인데 실패 report 있음, exit0인데 누락, 위조 PASS/잘린 channel/예상외 조합, 상한/덮어쓰기/종료 실패, retention의 모든 cleanup 경로. 문자열 존재 확인만으로 완료하지 않는다. 구현 뒤 격리 전체·9foundation·build62/check22·점검도구를 실행하며 기존55경고/rawexit1·private1skip은 유지 기록한다.

## 7. 승인과 후행 경계

- [x] 기존 실제 근거/도구 호출부/보존 충돌 조사, 대안 비교, 한글 추가 설계와 자체 검토.
- [ ] **사용자 작성 설계 승인:** 다음은 상세 구현 계획 작성·Astra max 공격적 계획 검토다. 현재 문서의 작성이 구현/실행 승인은 아니다.
- [ ] **상세 계획·Native 실행 묶음 승인:** 새 host/retention 보완·격리 Windows9run/설치·전환/cold·기존 PR45 추가 조사 push1회와 Linux9run job(+기존6run)을 구체화해 한번에 확인받는다. 해당 신규 공개 전송은 synthetic exact artifact만이다.
- [ ] 구현/로컬 검증/독립 검토 후 승인된 추가 조사 checkpoint만 push. 새 PR·최종 push·병합은 조사 결과로 자동 진행하지 않는다.
- [ ] 인과/잔여 한계 판정 후 기존 Task4의 source별 종합 Native·Astra max 최종 검토·최종CI·정확한head 병합/F01브랜치정리 게이트 재확인.

버전2.13.3·세 자리 형식·스토어/릴리즈·권한·사용자 설정·HLS·새 의존성/다운로드는 이번 범위에서 바꾸지 않는다. F02는 F01 통합 뒤 설계부터다.

### 자체 검토

F의 raw 부재와 U의 clock 관측을 명시했고, transport/수치 통과를 분리했다. 9집합의 위치 균형을 인과/통계 증명으로 과장하지 않는다. 추가 job의 총15run 비용·25분 상한·실패/종료 중단·exact35파일과 private Native 보존을 구분했다. 기존 source의 cleanup 충돌을 숨기지 않았으며, 작성/계획/실행/push/병합 권한을 분리했다. **Astra max 독립 검토는 아직 미실행**이며 자체 검토를 대체물로 제시하지 않는다.

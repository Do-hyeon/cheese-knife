# F01 공개 CI 보완 상세 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 2026-10-16 사용자 실행 묶음 승인. 기존 Native 직접 실행 방식을 유지한다. 승인된 범위 안에서 순차 실행하며 Task별 로컬 커밋은 가능하지만 PR은 기존 #45 하나만 사용한다.

**Goal:** F01의 실제 오디오 수치 실패를 원인에 맞게 보완하고 설치형 protocol/payload 검사를 복구한 뒤, 공개 CI 통과·병합·해당 브랜치 정리를 마치고 F02 설계로 이동한다.
**Architecture:** 설치형 관측은 실제 payload 역할1/2/3에서 기대 protocol을 정한다. 오디오는 비계측/계측 원자료를 같은 수치 기준으로 비교한 뒤, 인과가 확인된 국소 DSP만 변경한다. 제품 권한/저장 ABI와 과거 근거는 유지한다.
**Tech Stack:** 기존 Node24·strict TypeScript/생성 JS·checkJs·Playwright1.62.1·번들 Chromium·GitHub Actions. 설치/의존성/프레임워크를 추가하지 않는다.
**Spec:** [검토 완료 보완 설계](../specs/2026-10-15-f01-public-ci-follow-up-design.md), [최초0/3/1→문서 잔여0/0/0 기록](../validation/2026-10-15-f01-public-ci-follow-up-review.md). 검토 spec SHA-256 `776947f9dc5f19f78d27776e1bf5bd3bcae32a7b933830fc8d4c459c48b1403a`는 변경하지 않는다.

## 고정 조건과 실행 승인 묶음

- 기준 로컬 `8a7943dc5a4bcd10095495e4c7c642705f864d01`, PR head `de082f2916d48f66e1186676ce172a5212fbb617`. 실행 전 원격 변경·열린 PR·dirty 상태를 다시 확인한다.
- 제품2.13.3·root dist58/inventory `a7a23d74b79132479b53d80b3cac2d71ab89a3cdb15b68cdda81732e6064ddd2`·시청 Chrome/P09·private 원장/모든 실패 기록은 보호한다. 기존 출력 폴더를 초기화/삭제하지 않는다.
- dip0.95·step 전후기준+1e-6·wet peak0.9801·full-scale 초과0·14 steady/12 alignment/18 transition/stress·기존 신호/측정 창/기본값을 유지한다. pass를 고르는 retry·시험 skip·browser pin 변경으로 닫지 않는다.
- 구현/단위/build는 기존 `output/f01-execution-20261015/source`에 변경 추적 입력만 기계적으로 반영하고 root와 byte 대조한다. 새로운 clean Native 사본은 `output/f01-ci-follow-up-20261016/source`에 고정 checkpoint를 로컬 복제해 만든다. 기존 Node/Playwright/SDK/번들 브라우저를 재사용하며 새 다운로드가 필요하면 STOP한다.
- Native는 위 새 사본이 만든 자체 프로필·합성 페이지만 사용한다. 사용자 Chrome/P09·확장 설치·개발자 모드·전체 OS 네트워크 설정·원격 디버깅 포트는 변경하지 않는다. 기존 익명 pipe와 자기 프로세스 정상 종료 증명을 유지한다.
- Linux 기준은 **현재 PR의 GitHub Actions verify / ubuntu-latest / Node24 / 고정 lockfile의 Playwright1.62.1·번들 Chromium headless**다. 실제 runner OS·Node·browser 버전을 보고서에 기록하며 과거 Windows 결과로 대신하지 않는다. 새 WSL/컨테이너/로컬 Linux 브라우저는 설치하지 않는다.
- **계획 확인 시 추가로 묶어 승인받을 실행 경계:** Linux 자료를 얻기 위한 기존 PR #45의 계측용 중간 checkpoint push 1회와, 보완·검증을 마친 최종 checkpoint push. 설계6절의 최종 CI는 최종 수용 게이트이며 이 중간 실행은 별도 조사 증거로 구분한다. 문서만 먼저 push하거나 새 PR을 만들지 않는다. 추가 제품 변경 때문에 다른 checkpoint가 필요하면 근거/범위를 알린다.
- 확장 옵션/CLI parser는 바꾸지 않는다. **검증 프로세스 전용** `KNIFE_AUDIO_QUALITY_TRACE=1`만 추가해 예약 wrapper를 선택한다. 미설정은 wrapper 없는 PCM 보존 모드, 그 밖의 값은 브라우저 실행 전에 거부한다. 사용자 설정·저장소에는 이 선택을 넣지 않는다. 이 검증용 환경 선택도 계획 확인 대상이다.
- 사용자는 순서상 병합·F01 브랜치 정리를 승인했다. 단 CI/로컬/Native·최종 검토 게이트가 모두 만족한 정확한 head에만 적용한다. 릴리즈·스토어 배포·버전 변경은 하지 않는다. F02는 병합 뒤 설계부터 시작한다.

## 검토 집중 대상

| 입력/실패 종류 | 기대 동작 | 담당 검사 |
| --- | --- | --- |
| 과거 문서/거부된 envelope·높은 sequence | 새 handshake로 오인하지 않고 후속 bridge를 오염시키지 않음 | Task1 새 문서·canonical·독립 양/음성 대조 |
| published owner 필드 없음 / F00의2 / F01의3 | 관측값이 아니라 실제 역할과 일치한 계약만 통과 | Task1 역할/잘못된 protocol·전체 literal 비교 |
| wrapper overflow/기록 실패/native throw | native 호출을 생략/변경하지 않고 진단만 incomplete | Task2 native-first·this/반환/throw·상한 음성 대조 |
| read 사이 clock 진행·0/5/15/25ms 재전환 | 인과 근거 없이 DSP를 바꾸지 않으며 수정하면 상보 pair 합1 | Task3 결정적 예약 회귀·Linux PCM 대조 |
| DSP 무수정이지만 shared helper 변경 | 일반 전환뿐 아니라 F01 cold 정상·정확한 손실도 새 source로 실행 | Task1/4 실제 설치 matrix |

## Task 1: 설치형 protocol·신선도·전체 payload 연결 복구

**Files:** `scripts/check-installed-extension.mjs`, `scripts/check-installed-transition.mjs`, `scripts/extension-e2e/transition-scenario.mjs`, `tests/fixtures/installed-extension/site.js`; 필요한 공유 browser 관측 함수만 `scripts/extension-e2e/installed-protocol.mjs`에 둔다. tests는 `installed-extension-fixture`, `installed-extension-runner`, `installed-transition-scenario`, `installed-transition-child`, `f01-installed-transition` 및 새 `installed-protocol.test.cjs`를 갱신한다. `f01-transition.mjs`의 의도된 F00 전용2는 보존한다.

**Interfaces:**
- 새 `observeInstalledProtocol(expectedProtocol:1|2|3)`는 `page.evaluate()`로 실행 가능한 self-contained 함수다. 현재 window의 runtime/fixture를 읽어 신선한 `{metadata,config,load}` 또는 null을 반환한다. 제품 decoder/normalize를 호출하지 않는다. host 호출 경계는 unknown/필수 입력 누락을 scenario의 첫 page/worker 접근 전에 거부한다(base의 문서화된 기본3은 예외).
- `runBaseInstalledScenario({...expectedProtocol=3})`는 현재 F01이 기본이다. `runTransitionPhase({...expectedProtocol})`는 명시 값을 받는다. caller는 실제 `sourcePayload`의 published/F00/current 역할에서1/2/3을 결정한다.
- `expectedTransitionState(...,{reloaded,reloads,expectedProtocol})`는 독립 literal runtime oracle을 선택한다. raw 저장소·UI/CSS·version·source/broker 비교는 유지한다.

- [x] **RED:** 실제 fixture와 browser 관측 함수를 jsdom/VM에서 실행한다. V3는 현재 slot 부재/owner 불일치로 실패하고, V1(owner 없음)/V2 control은 기존대로 관측되는 것을 확인한다. 문자열 grep이나 mock 존재 검사는 사용하지 않는다.
- [x] **신선도 구현:** 문서 시작 시 V1/V2/V3 envelope 슬롯만 null로 초기화하고 loads/persisted/history는 유지한다. metadata와 별도로 현재 load를 연결한다. V1 requestId 또는 scoped mediaRequestId/context4개가 현재 runtime과 같아야 한다. config/프리셋/PCM을 fixture sessionStorage에 넣지 않는다.
- [x] **양성/음성 RED→GREEN:** V3의 실제 현재 shape(gainOrigin 포함)로 양성 control 적용을 보이고, 각 독립 문서에서 sequence 또는 context 한 필드만 틀린 메시지가 거부됨을 검사한다. 주입 전 canonical을 캡처하고 마지막 fixture slot을 주입 후 성공 근거로 쓰지 않는다. 대조 문서는 닫고, 일반 시나리오는 새 문서/실제 bridge/원래 storage에서 계속한다.
- [x] **역할/목록 구현:** 일반 new=current3, F01 cold legacy new=frozen F00의2, published old/rollback=1을 전달한다. `currentNames`는 실제62와 exact 비교한다. 기존2회 build·manifest/HTML/worker 검사·고정 F00/published 해시는 유지한다.
- [x] **독립 oracle:** F01 추가 literal은 audioDefault=false, compressorEnabled=true, audioGain=1, gainInherited=true, eqEnabled=false, eq63/125/250/500/1000/2000/4000/8000=0, normalizerEnabled=false, normalizerTargetDbfs=-20을 포함한다. legacy compressorDefault alias의 전체 runtime 투영과 raw 무쓰기를 구분한다. F00/공개판의 기존 key 집합은 그대로다. 실제 config key를 골라 비교하거나 제품 함수를 기대값에 사용하지 않는다.
- [x] **음성 대조:** unknown protocol·현재 request 불일치·과거 load·잘못된 context·손상 gainOrigin·잘린62목록·누락 참조·추가 예상외 자산을 거부한다. 손실은 readiness timeout이 아니라 원래 exact loss oracle까지 도달해야 한다.
- [x] **집중 검증:** 격리 후보에서 `node --test tests/installed-protocol.test.cjs tests/installed-extension-fixture.test.cjs tests/installed-extension-runner.test.cjs tests/installed-transition-scenario.test.cjs tests/installed-transition-child.test.cjs tests/f01-installed-transition.test.cjs`; 실패0·새 RED 재현/보완·전체 role matrix를 기록하고 로컬 checkpoint를 만든다. 실제 설치/cold는 Task4에서 이 source 또는 후속 전체 source로 필수 실행한다.

## Task 2: frozen 오디오 runner의 비계측/계측 근거 보존

**Files:** 새 `scripts/audio-quality-diagnostics.mjs`, `tests/audio-quality-diagnostics.test.cjs`; `scripts/check-audio-quality.mjs`, `tests/audio-artifacts.test.cjs`, `tsconfig.audio-tools.json`, `.github/workflows/ci.yml`. 큰 `audio-processing-probe.mjs`를 복제하거나 기존 Native 전체를 새 framework로 이전하지 않는다.

**Interfaces:**
- `installQualityTrace()`는 기존 합성 `window.__quality.context`의 createGain/AudioParam 경계에만 선택적으로 설치하는 self-contained browser 함수다. `Symbol.for('cheese-knife.quality-trace')`에 bounded export 상태를 두며 제품 runtime/저장소는 수정하지 않는다.
- `createQualityDiagnostics({label:string,trace:boolean})`는 run별 collector를 만들고 다음 두 메서드를 제공한다. 모듈 전역에 다른 run의 buffer를 공유하지 않는다.
- `collector.retainCapture(capture,transition,phase)`는 기존 before/change/after capture를 **동일 object로 반환**하고 master6전환만 보존한다. capture는 `{rate,start,end,channels:number[][]}`, transition은 `{frequency:250|750|1000,value:boolean,frame:number}`, phase는 `'before'|'change'|'after'`다. Gain12전환의 저장량은 확대하지 않는다.
- `collector.buildReport({artifact,sourceCommit,pullRequestHead,platform,nodeVersion,browserVersion,sampleRate,audioConfig,wanted,state,trace,error})`는 기존 artifact 해시와 명시한 실행 메타데이터·합성 audio config·보관PCM·최대4096개 예약 이벤트·`complete`/`truncated`/오류를 반환한다. pullRequestHead는 로컬 실행이면null이다. browser trace snapshot은 unknown에서 shape/수치/상한을 검사한다. 실제 품질 report schema/수치 gate와 분리하며 불완전이면 최종 exit는 비정상이다.
- `assessQualityRunSet({expectedLabels,records})`는 순서 고정6개와 각 `{label,exitCode,report,diagnostic}`를 검사해 `{complete,failures:string[]}`를 반환한다. 원래 품질 gate를 재평가하고 master PCM에서 기존 summarizeCapture로 수치를 다시 계산해 원 report와 대조한다. 파일 유무나 producer의qualityFailures=[]만 신뢰하지 않는다. 실제 source/artifact 해시·환경·U/T선택도 고정집합과 같아야 한다.

- [x] **RED:** fake native 메서드의 this·인자·반환 identity·원래 throw를 관측한다. native를 호출하기 전 기록/clock을 읽거나 상한에서 호출을 생략하는 wrapper는 실패해야 한다. 슬롯4097번째·진단 기록 오류에서도 native 호출은 수행되고 incomplete만 남아야 한다.
- [x] **wrapper 구현:** run당 사전할당4096개 버퍼를 사용한다. native 성공 후 최소 숫자만 기록하고 wrapper에서 clock을 추가로 읽거나 serialize/PCM복사/throw하지 않는다. dry/wet/Gain/headroom/compDry/compWet/compMix/normalizer의8gain 역할은 graph 생성 순서와 개수를 명시 확인하며, 예상 외 graph는 incomplete다. direct `.value`를 가로채지 않고 단계 밖 snapshot으로 보완한다.
- [x] **PCM/glue 구현:** 원래 frame·windowSamples 호출 순서와 창[-80,-40],[-20,+40],[+100,+140]ms를 유지한다. 기존 capture→summarize 사이의 정확한 glue만 추가하고 원자료 검증/복사/직렬화는 전환 밖에서 한다. nonfinite·빈 채널·hole·잘린 capture·시각/샘플 수 불일치는 incomplete이며0으로 채우지 않는다.
- [x] **파일 경계:** 기존 `--label` 문법을 사용한다. 보고서는 `report-<label>.json`, 진단은 `report-<label>-diagnostic.json`(기본 source는 기존report.json와report-diagnostic.json)이다. 기존 owned-files만 사용하고 덮어쓸 경로가 있으면 실행 전에 거부한다. 진단은 run당1개·8MiB 이하이며 초과를 잘라 PASS로 만들지 않는다. 실패/예외에서도 가능한 원자료와 실패 단계를 남기고 browser close 증명을 별도로 확인한다. 품질검사·write·close가 함께 실패하면 원래 오류를 유지하고 secondary를 구분하며 종료는 비정상이다. Windows 정상 종료3증명과 Linux 기존 browser.close/disconnection 관측은 구분한다.
- [x] **frozen 계약 검증:** CLI parser/기존 신호·calibration·14/12/18/stress 본문은 그대로다. `audio-artifacts`의 기존 원본 hash 역변환에 추가할 예외는 정확한 import/init·단계 밖 진단·capture passthrough·출력 glue 블록만 각각1회다. 범용 정규식 strip/hash 재발급은 금지하며 실제 임계값/측정 창 변경 mutation이 이 계약을 깨는지 확인한다.
- [x] **집중 GREEN:** `node --test tests/audio-quality-diagnostics.test.cjs tests/audio-artifacts.test.cjs tests/audio-quality-contract.test.cjs tests/f01-audio-quality-contract.test.cjs` 및 `typecheck:audio-tools`. 미설정 mode에서는 wrapper가 없고 PCM/원래 독립 gate는 작동하며, TRACE=1/미지원값·파일상한·preexisting 파일 음성 대조를 확인한다.
- [x] **Linux 조사 checkpoint 준비:** 9foundation/전체/build/package를 격리 후보에서 확인하고 Task1·Task2를 같은 기존 PR #45에 중간 push한다. 아직 제품/DSP를 수정하지 않으며 이 CI는 최종 수용이 아니라 원인 조사다. 실제head65ad9b6·CI38766311444의 오디오6회/12파일을 독립 재평가했다. 전환2건 실패와 과거오디오미재현으로 최종수용은 미완료다.

### Linux 관측 집합과 CI 동작

- 실행마다 현재 checkout SHA(자동 merge SHA일 수 있음)와 PR head SHA를 **둘 다** 기록한다. 기존 Node24/Playwright lockfile/browser 선택을 바꾸지 않는다.
- 사전 고정 집합은 비계측U1/U2/U3, 계측T1/T2/T3 총6회다. 기존 CLI label은 `f01ci-<github.run_id>-<github.run_attempt>-u1`부터u3/t1부터t3까지다. run_id/attempt는 숫자이며64자 label 경계를 검사한다. 순서는 U1,T1,U2,T2,U3,T3이고 각 결과/exit를 보존한다.
- Linux의 기존 `Check audio quality` 단계에서 여섯 명령을 모두 실행하고 종료 코드를 합산한다. trace는 각T 명령의 환경에만1을 전달하고 U는 미설정이다. 하나라도 수치/완전성/종료 실패면 해당 단계는 실패다. 합격한 반복만 고르거나 failed job을 자동 rerun하지 않는다.
- `Check package`에 step id를 붙이고, 독립 browser 게이트들은 `!cancelled() && steps.package.outcome == 'success'`일 때 실행한다. 오디오가 실패해도 기본 E2E/MAIN제거/일반전환/손실의 결과는 각각 남긴다. package 이전 준비가 실패하면 이를 실행 성공으로 세지 않는다. 기존25분 timeout을 임의로 늘리지 않는다.
- artifact는 위6개의 정확한 report+diagnostic 경로12개만 `always()`로 업로드한다(총6run의run별8MiB진단 상한, retention7일). profile·다른output·trace를 새 audio artifact에 포함하지 않는다. 기존 E2E 실패 artifact는 유지한다.
- 실행 집합/step 집계/허용 파일 목록은 실제 작은 자식 프로세스 exit fixture·산출물 검사로 회귀를 만들며, workflow 문자열 존재만으로 완료 처리하지 않는다.
- 여섯 명령 이후 기존 owned-files로 정확한12파일을 읽어 `assessQualityRunSet`에 넘긴다. exit0인데 자료 없음·다른source·truncated·raw PCM과 요약 불일치도 집합 실패다. raw 수치가 집계 결과와 다르면 어느 쪽도 PASS로 덮지 않는다.

## Task 3: 원인 판정과 조건부 국소 DSP 보완

**Files:** 필요할 때만 `src/main/features/audio/controller.ts`, 생성 `web/audio.js`, 해당 raw/executable pin; `tests/audio.test.cjs`, `tests/f01-audio-graph.test.cjs`, `tests/f01-normalizer-lifecycle.test.cjs` 및 객관 품질 계약. 계측 보고서 원본은 output에 보존하고 판정은 검증 문서에 쓴다.

**Interfaces:** 기존 `ramp(parameter,value,seconds=0.01)`를 필요한 경우 `ramp(parameter,value,seconds=0.01,now=context.currentTime)`로 확장한다. 상보 pair caller만 clock을 한 번 읽어 같은 now를 전달한다. Gain/개별 EQ·공개 AudioController 인터페이스/저장 계약은 불변이다.

- [ ] **인과 판정:** 여섯 Linux run의 양쪽 PCM·실제 예약·source/clock·계측 유무를 대조한다. clock 모델의 ON dip을 실측 ON overshoot의 원인으로 단정하지 않는다. 계측에만 생긴 실패·자료 누락·미재현은 해결이 아니라 미확정이다. 이 경우 제품을 추측 수정하지 않고 해당 근거와 다음 조사 질문을 제시한다.
- [ ] **조건부 RED:** 인과가 상보 clock 경계와 부합할 때만, 실제 생성 controller에서 currentTime read당128/48k 진행·0/5/15/25ms 역전환·동일target·comp pair·bypass/fallback을 재현한다. 양 anchor/end 일치와 모든 구간의 pair 합1(부동 오차1e-12 이하), normalizer unity 예약이wet end 이후인지를 검사한다.
- [ ] **최소 수정:** master enable/bypass와 compressor pair에 같은 now를 전달하고 기존 in-flight 보간을 사용한다. 10ms/ramp curve·delay/limiter·normalizer 복귀 정책은 바꾸지 않는다. 과거시각 예약/CPU stall처럼 설명 밖 실패에는 지연/lookahead를 덧붙이지 않고 설계로 돌아간다.
- [ ] **집중 GREEN/생성:** `node --test tests/audio.test.cjs tests/f01-audio-graph.test.cjs tests/f01-normalizer-lifecycle.test.cjs tests/f01-audio-quality-contract.test.cjs`, 기존 main 생성·검사 및 audio pin을 실제 새 입력으로 확인한다. pin 변경은 실제 DSP 변경이 있을 때만 하며 다른 자산은 그대로다.
- [ ] **Linux 후행 게이트 연결:** 수정 source의 새 U1/T1/U2/T2/U3/T3는 Task4의 최종 checkpoint CI에서 실행한다. Task3 로컬 GREEN은 Linux 실패의 closure가 아니다. 원인·보완과 기존 실패의 대응을 기록하고, 원인 미확정이면 최종 push/병합 단계로 넘어가지 않는다. 최종 CI에서 같은 실패가 재발하면 중지하고 원인 분석으로 돌아간다.

## Task 4: 종합·최종 검토·PR 통합과 F02 진입

**Files:** PLANS/기존 F01 검증·완료 아카이브와 PR #45 본문. 최종 proof source를 고정한 뒤 source/after·실패·종료를 비교한다. 아래는 실행할 명령이며 이번 계획 작성의 실행 결과가 아니다.

- [ ] **최종 source 로컬 검사:** 격리 후보의 전체 tests·9foundation·build/check62/22·실제 점검도구를 실행한다. npm/Gitleaks/ESLint 원본과 전후 입력을 대조하며 기존55경고/rawexit1·private1제외를 숨기지 않는다. 새 source의 root와 후보 byte 일치·버전/dist 불변도 확인한다.
- [ ] **clean Native checkpoint:** 로컬 커밋을 새 물리 사본에 고정하고 기존 도구/번들 browser를 재사용한다. 실행 전 계획된 run ID를 확정해 모든 결과를 별도 경로에 보존한다. 새 설치/다운로드나 기존 프로필 변경이 필요하면 STOP한다.

| 조건 | 새 Native 사본에서 실행할 명령 | 판정 |
| --- | --- | --- |
| 항상 | `node scripts/check-installed-extension.mjs --run-id=F01FixBase20261016A` | base·다중창·수명주기·페이지오류/설정전달 통과 |
| 항상 | `node scripts/check-installed-extension-negative.mjs --run-id=F01FixNegative20261016A` | 정확히main-runtime-missing을 검출 |
| 항상 | `node scripts/check-installed-transition.mjs --run-id=F01FixB2Positive20261016A` | published→current→published 정확한 전체 보존 |
| 항상 | 같은 runner `--run-id=F01FixB2Loss20261016A --control=storage-loss` | 원래 정확한손실·정상종료를 검출 |
| 항상 | 같은 runner `--run-id=F01FixCold20261016A --media-schema=f01` | published/F00/F01 역할·11seed/28phase/39정상종료 |
| 항상 | 같은 runner `--run-id=F01FixColdLoss20261016A --media-schema=f01 --control=storage-loss` | 정확한5손실·19정상종료·그 외 오류0 |
| DSP 변경 | `node scripts/check-audio-processing.mjs --run-id=F01FixAudio20261016A` | 실제44.1/48/96k·EQ108/RMS60/전환72/rapid36·누락0 |
| DSP 변경 | `node scripts/check-installed-player-gain.mjs --run-id=F01FixGain20261016A --mode=full` | 실제Gain/저장/거부/수명주기 연계 |
| DSP 변경 | `node scripts/check-installed-audio-settings.mjs --run-id=F01FixSettings20261016A` 및 같은runner `--run-id=F01FixSettingsLoss20261016A --control=storage-loss` | 설정정상·정확한4손실·원본설정/페이지오류/종료증명 |
| 항상 | `node scripts/check-audio-quality.mjs --label f01win-<source12>-a-u1` 등U1/T1/U2/T2/U3/T3 | Windows 동일합성입력 대조·기존14/12/18/stress·실패 모두보존 |

위표의 모든 profile/trace·raw와 각 도구의 기존 종료 계약을 유지한다. 기존에 정상 종료3증명을 생성하는 cold/오디오/설정/Gain은 세 항목을 모두 검사한다. 일반 base/negative가 기존 context.close만 관측했다면 그것을3증명으로 부풀리지 않는다. run ID가 이미 존재하면 덮어쓰지 않고 이유와 새 사전 run 목록을 기록한다. source가 바뀌면 영향받은 검증을 새 source에서 반복하며 과거값을 재라벨하지 않는다.

- [ ] **Astra max 최종 코드 검토:** 새 source 전체 변경과 중간Linux근거·위 실제 로컬/Native 결과를 fresh gpt-6-astra/max reviewer에게 넘긴다. 필수 지적은 직접 재현·보완·회귀하고, 검토 판정/판단 제외와 author 보완을 구분한다. 이 계획의 자체 검토나 이전 설계 검토로 대체하지 않는다. 아직 실행 전인 최종Linux CI를 이미 통과했다고 설명하지 않는다.
- [ ] **최종 PR 갱신:** 한글 PR #45에 전체 보완·실패/한계·최종 source 근거를 합쳐 push한다. 정확한 최종 head의 공개 CI 모든 필수 gate를 확인한다. 추가 문서만으로 새 PR을 만들지 않는다. PR 본문/CI 결과만 갱신하는 경우 code head를 불필요하게 바꾸지 않는다.
- [ ] **최종 Linux 근거 대조:** 새6run 모두의 원자료·수치·집계 및 E2E/negative/전환/손실을 확인하고, 같은 최종 reviewer에게 이 실행 근거만 targeted 확인받는다. 코드가 다시 바뀌면 영향받은 source별 검사와 검토를 갱신한다. CI성공만으로 이전 원인 미확정을 숨기지 않는다.
- [ ] **병합:** 충돌 없음·필수 검토 완료·CI성공·로컬미공개 제품 변경 없음·예상 head SHA를 확인하고 merge한다. 가능하면 merge commit으로 이력을 보존하고 exact head 조건을 준다. 자동 병합·admin 우회·실패 무시는 하지 않는다. 허용 merge 방식이 달라 미병합 고유 커밋 보존 문제가 생기면 STOP한다.
- [ ] **브랜치 정리:** 병합된origin/main을 fetch(no prune)하고 전체 F01 커밋 포함·열린 다른PR/worktree·URL 의존성을 확인한다. local main을ff-only로 갱신한 후 해당 F01 원격/로컬 브랜치만 삭제한다. `-D`·reset/clean·출력/프로필/worktree 삭제·다른브랜치 정리는 하지 않는다.
- [ ] **F02 진입:** main에서 별도 `codex/` 브랜치를 만들고 F01 완료와 남은 실제 플랫폼 제한을 아카이브/PLANS에 기록한다. 현 영상필터·목업·영상프리셋·GPU/성능 경계를 조사해 한글 F02 범위/상세 설계부터 제시한다. F02 기능을 설계 없이 구현하거나 릴리즈·스토어 배포를 하지 않는다.

## 자체 검토·다음 확인 지점

- 설계1–7절은 Task1(protocol/payload/oracle), Task2(계측/환경/보존), Task3(조건부DSP), Task4(재검증/최종검토/통합)로 연결한다. 검토 집중5종류의 RED/음성 대조도 각 Task에 있다.
- Native 직접 실행 방식은 기존 결정을 유지한다. 이번에 구현을 subagent별로 쪼개거나 Task별 PR을 만들지 않는다.
- 작성 계획의 확인 시 **검증 전용 TRACE 환경 선택·기존 PR의 중간 Linux 계측 push·새 격리 사본/프로필 검증·최종 검토/CI 통과 뒤 병합과F01브랜치정리**를 한 번에 확정한다. 허용치 변경·새 권한/다운로드/사용자프로필·설명되지 않는 DSP 변경은 묶음 밖 STOP이다.
- Task1 로컬 복구와 Task2 중간push/실제Linux6run까지 수행했다. Task3은 과거오디오실패 미재현·실제18pair시각차이0으로 인과미확정 STOP이다. 전환의 reload 경쟁은 별도 로컬 보완했지만 새 Native/공개CI 재검증 전이다. 전체공개CI성공·Astra최종검토·병합·브랜치정리·F02착수는 미실행이며 [실제 판정](../validation/2026-10-16-f01-ci-remediation-progress.md)을 따른다.

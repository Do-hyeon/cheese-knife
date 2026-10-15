# F01 관측 효과 분리·전환 재검증 상세 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`. Native 방식으로 순차 구현하고, 독립 Astra max 검토를 사용한다. 체크박스는 실제 수행 후에만 완료한다. 문서 작성·검토 승인은 아래 구현/실행 승인이 아니다.

**Goal:** 같은 제품에서 원본 F/현재 U/T의 관측 차이를 고정 집합으로 조사하고, reload 보완·정확한 손실 검출과 Native 증거 보존을 검증한다.
**Architecture:** F는 계측 전 source의 원문 runner를 별도 clean 사본에서 실행한다. 현재 host 모듈만 실행 원장·bounded 출력·9집합 판정을 소유하며 기존6집합/품질 gate를 대체하지 않는다. 후보 준비·base/negative·일반/F01 cold 전환의 programmatic retention과 음성 실패 판정만 보완하고 제품 DSP·저장 ABI는 바꾸지 않는다.
**Tech Stack:** 기존 Node24/strict checkJs/Playwright1.62.1·번들 Chromium·GitHub Actions·owned-files. 새 의존성/프레임워크/확장 권한 없음.
**Spec:** [사용자 승인 추가 설계](../specs/2026-10-16-f01-observer-isolation-design.md). 이전 [보완 계획](2026-10-16-f01-public-ci-follow-up.md)의 Task3 STOP은 유지한다.

## 고정 조건·실행 승인 묶음

- 작성 기준 `3e205c1`, 미공개 reload 보완 `6a60035333a4d875e908095a87767b365255dd9d`, PR #45 공개 head `65ad9b6f6d94b128bcd111bb16669c482de44ef7`. 실행 전 실제 상태를 확인하고 차이가 있으면 원인을 기록한다.
- F source는 `c5d45b8a7abf30450d3f1bbff45afbb8cd020cb5`다. 제품6파일은 모든 모드에서 동일한 현재 source root를 읽는다. 기존 raw 본문 hash `6f8338b5c56b2043c33babea9957c3885c76b4be706ec578d300a849b789eee6`·CLI hash `6a8fb8a811f17bba7a6ffbdd7f841fea21d4e7470231dd0a5f37a45959eb413b`는 그대로다.
- 제품2.13.3/세 자리 버전·root dist58·시청Chrome/P09·고정ZIP·private 감사·기존 output/프로필/실패 원본을 보존한다. root에서 build하지 않고 이전 Native source를 갱신/삭제하지 않는다.
- 기존 dip0.95·step 전후기준+1e-6·wet peak0.9801·full-scale 초과0, 신호/창/calibration·14/12/18/stress는 불변이다. retry-until-green·검사 생략·browser/허용치 변경 없음.
- **계획 확인 시 묶어 요청할 범위:** Tasks1–3 로컬 보완/RED→GREEN/독립 검토, 새 전용 사본/프로필의 Task4 Native, 기존 PR45의 추가 조사 checkpoint push **1회**, Task5 Linux9회와 기존 verify6회/전환 CI 확인. 새 PR·최종push·병합·정리·릴리즈·스토어·버전 변경은 포함하지 않는다.
- Native 구현은 main agent가 직접 진행한다. Task마다 PR/독립 구현 agent를 만들지 않는다. Astra max는 작성 계획 및 구현 후 검토에 사용하며 실제 browser 검증/인과 증명을 대신하지 않는다.
- 새 권한/다운로드/사용자 프로필 조작·설명 안 되는 source 변화·DSP 변경·추가 checkpoint가 필요하면 STOP한다. CI의 기존 의존성/브라우저 설치 방식만 재사용하며 로컬에서는 설치하지 않는다.

## 검토 집중 5종

| 실패/입력 | 기대 동작 | 담당 |
| --- | --- | --- |
| exit1인데 유효 수치 실패 report | 데이터 보존·수치 실패, 종료 실패를 수치로 단정하지 않음 | Task1/2 |
| F/U/T 도구 SHA가 다르지만 제품/환경 동일 | 계획된 차이만 허용, root/byte/browser 차이는 무효 | Task1/2 |
| log overflow·timeout·close 미확인 | owned child만 중단·후속 셀 미실행·불완전 실패 | Task2 |
| 후보 준비/negative/일반전환의 다중 cleanup | verifyCandidate/부모/자식까지 retention 전달·기대오류+secondary 성공 금지 | Task3 |
| reload 전환 실패가 storage-loss보다 먼저 발생 | 원래 실패 보존·정확한 손실 PASS 금지 | Task3/4/5 |

## Task 1: 대조 입력·판정 계약

**Files:** 새 `scripts/audio-observer-isolation.mjs`, `tests/audio-observer-isolation.test.cjs`; `scripts/audio-quality-diagnostics.mjs`의 기존 validator 명시 export; `tsconfig.audio-tools.json`, `tests/audio-signal-contract.test.cjs`의 strict 파일 목록. 테스트가 필요로 하는 고정 유효 report는 테스트 자체의 literal 입력으로 구성하며 private 실패 PCM을 커밋하지 않는다.

**Interfaces:**
- `observerRunPlan(prefix:string): readonly {label:string,mode:'f'|'u'|'t'}[]`: label은 기존64자 문법, 순서는 `f1,u1,t1,u2,t2,f2,t3,f3,u3`다. 공개 JSON/log 경로는 `output/audio-observer/<prefix>/` 아래로 고정한다.
- `assessObserverRunSet({manifest:unknown,records:readonly unknown[]}): {transportComplete:boolean,qualityPass:boolean,failures:string[]}`. 예상9개/순서·명시 provenance와 실제 record를 대조하고 유효 실패 수치는 그대로 남긴다.
- manifest 필수 shape는 `{schema:1,prefix,order,tools:{frozen:{commit,inputSha256},current:{commit,inputSha256}},product:{files},environment:{platform,nodeVersion,nodeExecutableSha256,playwrightVersion,browserExecutableSha256,sampleRate:48000},ci:{checkout,head}}`다. `order`는 위9개 `{label,mode}`, product.files는 고정6개 `{path,sha256}`다. ci.head는 로컬이면null이다. 파일 경로는 각 역할 root 기준 상대 경로와 role 식별자만 쓰고 실행에 필요한 실제 절대 경로는 host 메모리에만 둔다.
- record 필수 shape는 `{label,mode,exitCode:number|null,signal:string|null,timedOut:boolean,overflow:boolean,closeConfirmed:boolean,report:unknown,diagnostic:unknown|null}`다. F diagnostic은null이고 U/T는 유효 JSON이다. 각 report의 실제 browser 문자열은9개가 같고 rate는48000이어야 한다. tool SHA 차이를 허용하는 역할 매핑과 달리 제품 byte/환경 차이는 허용하지 않는다.
- 기존 private `validateEvidence`를 **`validateQualityEvidence` alias로 export**한다. 구현/기존6집합의 성공 조건은 바꾸지 않는다. 새 host는 이 함수와 기존 `audioQualityFailures`·`summarizeCapture`·`AUDIO_ARTIFACT_FILES`를 사용한다. 전체 report 기대 조합은 원본 runner의 literal14/18/12를 별도 기대값으로 검사한다.

- [ ] **RED:** `observerRunPlan`의 순서/label unique/길이 거부와 다음 진리표를 실제 module import에서 검사한다. 기존 메서드 유무 확인만으로 완료하지 않는다.

```js
assert.deepEqual(observerRunPlan('f01obs-win-a').map(x=>x.label.split('-').at(-1)),
  ['f1','u1','t1','u2','t2','f2','t3','f3','u3']);
// 독립 literal 유효 fixture에 대해:
assert.deepEqual(assessObserverRunSet(validNine), {transportComplete:true,qualityPass:true,failures:[]});
assert.equal(assessObserverRunSet(withOriginalNumericFailure).qualityPass, false);
assert.equal(assessObserverRunSet(withMissingReport).transportComplete, false);
```

- [ ] **RED:** 실제 JSON clone에서 주파수/전환/alignments 중복·누락·잘못된 gain/boolean·잘린 채널·NaN/Infinity·위조 qualityFailures를 변경해 거부시킨다. 원래 nullable 비계산 지표는 허용하되 gate 필드는 유한값이어야 한다. 정상 calibration/좌우 채널·stress를 검증한다.
- [ ] **구현:** F report는 raw 진단 없이 지원 수준을 명시한다. U/T는 기존18창 raw→요약 exact 대조·진단 complete/truncated·TRACE 선택·shutdown 계약을 검사한다. 도구 SHA는 역할별 예상값을, 제품6파일은 같은 bytes/root를 요구한다. 각 report의 browser/rate와 manifest의 Node/lock/Playwright 실제 버전·실행 파일 hash를 대조한다. F의 Node는 자식을 spawn하는 동일 `process.execPath`로 고정한다.
- [ ] **실패 판정:** 수치 실패가 있어도 유효 전 셀/증거이면 transportComplete=true 가능하지만 qualityPass=false와 nonzero를 유지한다. close/timeout/자료 누락·원인 불명 nonzero는 불완전이다. producer의 error 문자열을 단독 원인 증명으로 쓰지 않는다. 기존 six-run `assessQualityRunSet`을 느슨하게 만들지 않는다.
- [ ] **GREEN/타입:** `node --test tests/audio-observer-isolation.test.cjs tests/audio-quality-diagnostics.test.cjs tests/audio-artifacts.test.cjs tests/audio-signal-contract.test.cjs` 및 `npm run typecheck:audio-tools`. 새 명시 목록과 실제 import graph가 정확히 같고 strict 옵션을 유지해야 한다.
- [ ] **로컬 checkpoint:** 위 파일만 커밋하고 task 결과를 기록한다. push하지 않는다.

## Task 2: 원본 실행·출력 상한·종료·CI 연결

**Files:** Task1 host/test; `.github/workflows/ci.yml`; 필요하면 현재 strict graph 안의 `visibility-browser.mjs`에 이미 있는 `stopVisibilityChild`를 재사용한다. 원본 F/현재 `check-audio-quality.mjs` 본문·CLI·신호는 수정하지 않는다.

**Interfaces:** `runObserverIsolation({frozenRoot:string,prefix:string}): Promise<{transportComplete:boolean,qualityPass:boolean,failures:string[],paths:string[]}>`는 **현재 module의 repositoryRoot를 U/T 및 제품 root로 고정**한다. 상대 frozenRoot는 이 currentRoot 기준으로 해석하며 별도 clean physical root여야 한다. 실행 전 동일 realpath/하위 overlap·root symlink·dirty tracked 입력·기존 출력·예상 F SHA/lock/전이 입력 불일치면 거부한다. 테스트용 dependency seam은 이 module 내부의 process/files/clock 경계에만 두며 사용자 CLI 옵션은 추가하지 않는다.

- [ ] **RED:** 실제 작은 Node 자식 fixture를 임시 owned 경로에서 실행해 stdout/stderr 분리·exit0/exit1/signal·hang·초과출력·출력 파일 생성 후 에러를 검사한다. 순서가9회 고정이고 TRACE는 T에서만1·F/U에서 삭제됨을 child가 기록하게 한다. 품질 실패 뒤 다음 셀은 실행하되 종료 불명 뒤에는 실행하지 않아야 한다.
- [ ] **준비 구현:** 양 root의 tracked 전체 파일/source SHA·lockfile와 실제 사용 toolchain을 전후 attestation한다. 검증 전에 출력35경로와 양 root의 runner report/diagnostic 원경로 전부 부재를 확인하고 host 원장을 `wx`로 생성한다. 새 run root 소유권은 정해진 source 내부 output으로 한정한다. F source에 진단 glue/새 추적 파일을 넣지 않는다.
- [ ] **child 구현:** `spawn(process.execPath,['scripts/check-audio-quality.mjs','--root',currentRoot,'--label',label],{cwd:roleRoot,env,windowsHide:true,...})`. 각 셀120초·집합20분(host 준비 포함) 상한이다. 로그는 `wx` 파일의 bounded stream으로 즉시 쓰고 각2MiB까지만 허용한다. 초과 부분은 합격 자료로 자르지 않고 overflow 상태/비정상 종료를 기록한다. JSON은 크기 확인 후 읽고8MiB를 초과하면 실패한다. 메모리/로그 누적이나 shell 조합은 사용하지 않는다.
- [ ] **종료 구현:** 원래 runner의 close/exit를 기다린다. timeout/overflow/취소 시 기존 `stopVisibilityChild` 방식으로 **spawn으로 보유한 Node child handle만** 중단하고15초 이내 exit를 기다린다. 정상 종료 proof로 바꾸지 않는다. Windows에서는 각 roleRoot가 만든 새 `output/audio-quality/profile-*`를 전후 목록으로 식별하고 기존 `queryWindowsProcesses`로 그 정확한 profile root 종료만 확인한다. PID 전체/사용자 Chrome kill은 금지한다. root 생존/조회 불가면 후속 셀 STOP·private 원장 보존·사용자 개입 필요로 남긴다. Linux ephemeral context는 원래 close/disconnect 수준이며 Windows3증명으로 부풀리지 않는다.
- [ ] **오류/원장 구현:** 첫 오류와 secondary·exit/signal·미실행 셀을 보존하고 finally에서 가능한 결과를 `wx`로 쓴다. source/hash/환경 전후 차이는 집합 무효다. manifest에는 실행 전 고정 계획, result에는 결과·파일 hash·행동/원인 미확정 상태를 나누며 어느 파일도 재작성하지 않는다. F의 원래 출력은 보존하고 exact 공개 경로로 복사할 때도 `wx`를 사용한다.
- [ ] **CI 구현:** 추가 job ID `observer-isolation`, `needs: foundation`, ubuntu-latest/Node24/25분·contents:read를 사용한다. checkout 전체 history를 과도하게 받지 않고 origin의 고정 F SHA만 추가 fetch해 **현재 checkout 밖** `$RUNNER_TEMP/f01-observer-frozen/source`에 고정 사본을 준비한다(호스트에 절대경로 전달). 현재 root 하위 output에 F source를 만들면 overlap 거부와 모순되므로 사용하지 않는다. 현재/원본 toolchain을 기존 lockfile 설치 1회로 공유하되 런타임/산출물 hash를 확인한다. 원본용 새 dependency install이나 auth/secret 권한은 없다. host는 현재 source에서 실행한다.
- [ ] **CI artifacts:** prefix는 `f01obs-<github.run_id>-<github.run_attempt>`다. 실행 전 manifest1/result1, 고정 suffix9개 report9·U/T diagnostic6·stdout/stderr18의 exact35경로만 `always()`/retention7일로 업로드한다. wildcard로 profile/다른 output을 포함하지 않는다. 공개 manifest는 repo 상대 경로·버전/hash만이며 private 절대 경로/환경 전체를 올리지 않는다. 기존 verify6회·설치형/전환 gate/required 이름과 artifact는 그대로다.
- [ ] **GREEN:** Task1 명령 + 실제 child integration test. 원본 byte/hash 불변·manifest overwrite 거부·child/role/root 바꿔치기·초과/timeout 후 STOP·자료 전송 허용 목록을 검사한다. workflow 문자열만이 아니라 같은 경로 생성/수집 함수를 실행해 정확35개를 확인한다. 로컬 checkpoint, 아직push하지 않는다.

## Task 3: base/negative 자료 보존과 reload 회귀

**Files:** `scripts/check-installed-extension.mjs`, `scripts/check-installed-extension-negative.mjs`, `scripts/check-installed-transition.mjs`, `scripts/verify-candidate.mjs`; `tests/installed-extension-runner.test.cjs`, `tests/installed-extension-negative.test.cjs`, `tests/installed-extension-candidate.test.cjs`, `tests/installed-transition-runner.test.cjs`, `tests/installed-transition-child.test.cjs`, `tests/installed-transition-scenario.test.cjs`; 실제 import consumer의 fixture/입력 attestation 목록만 필요할 때 갱신한다.

**Interfaces:**
- `runInstalledExtensionE2E({headed=false,runId,qualification,retainEvidence=false,dependencies={}}={})`: 생성 전 boolean 검증. 기존 qualification의 기본 보존/close 동작은 유지한다.
- `runInstalledExtensionNegative({runId,headed=false,retainEvidence=false,dependencies={}}={})`, `prepareNegativeCandidate(runId,{retainEvidence=false}={})`: 준비/반환 cleanup/오류 cleanup/base finally/negative finally까지 같은 값을 전달한다. false의 기존 lifecycle은 보존한다.
- `verifyCandidate(id,directory=repositoryRoot,{retainEvidence=false}={})`: 두 번째 directory 인자를 유지한다. base/negative/transition child가 세 번째 인자를 명시 전달한다. bool은 어떤 생성보다 먼저 검증하며 자기 ensureDirectory 이후 복사/build/check의 부분 실패만 보존한다. 기존 목적지 충돌은 소유권 획득이 아니다.
- `runInstalledTransition({runId,headed=false,scenario,mediaSchema,control,retainEvidence=false,dependencies={}}={})`: 부모에서 검증한 bool을 기존 child IPC에 보내고 `executeTransitionChild`가 다시 검증해 두 verifyCandidate 호출에 전달한다. 일반전환의 finally는 true일 때 자기 roots/candidates 삭제만 생략한다. claim lock 해제·실제 close/supervision·기존 F01 media의 보존 정책은 유지한다. CLI는 false 그대로다.
- true report에 `evidence:{profilePath:string|null,candidatePath:string|null,negativePath?:string,retained:boolean}`를 **실제 own 존재 확인 후** 추가한다. false report shape는 유지한다. Native programmatic host만 true를 사용한다. CLI parser를 넓히지 않는다.
- 일반전환은 기존 `retainedRoots`를 실제 own 존재 확인으로 채우고 true에만 `candidatesRetained`/소유 후보 경로를 추가한다. 생성 전에 거부한 외부 경로는 제외한다. 부모/자식 준비 실패에도 최초 오류와 남은 부분 자료를 기록한다.
- base의 최초 오류와 필수 close/보존확인/쓰기 실패가 겹치면 **`installed-e2e-incomplete` 오류(code) + 원래 오류를 cause + bounded secondaryErrors**로 전달한다. 단일 최초 오류일 때는 기존 오류 identity를 유지한다. negative는 `main-runtime-missing`이고 secondary가 없을 때만 성공하며, 자기 준비/cleanup/negative-report 쓰기 실패도 전체 실패다. 정상 false cleanup은 유지하지만 과거의 이중 실패 false-PASS는 유지하지 않는다.

- [ ] **RED:** 실제 runner fixture에 retain true를 넣고 scenario/trace-start/trace-stop/json-write/close 실패 각각에서 close 시도와 파일 보존을 검사한다. false의 기존 삭제 순서·한 번만 cleanup을 그대로 검사한다. invalid bool은 openRepository/prepare 전 거부한다. negative 복사 전후 실패·준비 실패 후 finally·unexpected pass/다른code에서도 보존/최초 오류 유지가 필요하다.
- [ ] **후보/전환 RED:** 후보 디렉터리를 생성한 뒤 실제 복사/build/package 실패 경계를 주입해 true에서는 부분 bytes/최초 오류가 남고 false는 기존 삭제가 됨을 검사한다. 일반 및 `mediaSchema:'f01'` cold의 정상/손실을 모두 돌며 parent→IPC→child→두 후보까지 true가 도달함을 검사한다. 정상/정확한손실/준비실패 보존·false의 기존 cleanup/media 보존·claim 해제를 대조한다. 기존 경로 거부·잘못된 bool/IPC는 생성 전에 실패해야 한다.
- [ ] **음성 대조 조합 RED:** base→negative 연결 경계에서 `main-runtime-missing + close 실패`, `+ summary.json 쓰기 실패`, `+ retention 확인 실패`를 각각 재현한다. 모두 reject/nonzero이고 cause는 원래 MAIN 오류·secondary는 bounded 보존이어야 한다. 단독 MAIN 누락만 성공한다. 두 retain 값 모두 검사해 secondary를 지워도 기대 코드가 남아 PASS가 되는 mutation을 차단한다.
- [ ] **구현:** 소유 root/이미 존재한 경로 거부를 유지하며 retention에서만 삭제를 생략한다. browser·trace·session close는 항상 시도한다. close/retention 확인/JSON 쓰기 실패가 원래 scenario 오류를 덮지 않도록 secondary를 bounded 보존한다. dependency cleanup을 no-op으로 대체하거나 임의 경로를 보고서에서 생성 근거로 쓰지 않는다.
- [ ] **GREEN:** `node --test tests/installed-extension-candidate.test.cjs tests/installed-extension-runner.test.cjs tests/installed-extension-negative.test.cjs tests/installed-transition-runner.test.cjs tests/installed-transition-scenario.test.cjs tests/installed-transition-child.test.cjs tests/f01-installed-transition.test.cjs`. reload 클릭과 navigation wait의 동시 시작·새 문서 관측·bounded 원래 예외·상위 오류 우선순위를 유지한다. storage-loss보다 먼저 터진 readiness/원래예외를 손실 PASS로 수용하는 mutation은 실패해야 한다.
- [ ] **통합 checkpoint:** 격리 `output/f01-execution-20261015/source`에 변경 추적 파일만 byte 대조 후 반영한다. 전체 `node --test tests/*.test.cjs`, 기존9foundation, 후보 build/check62/22, `npm run audit:tools`를 실행한다. npm metadata 전송은 기존 승인 범위만이며 원본55경고/rawexit1/private1skip을 대조한다. 입력 전후 hash·root dist/버전 보호를 확인하고 로컬 구현 checkpoint를 고정한다.
- [ ] **fresh Astra max 구현 검토:** 새 host/CI/retention 전체 diff·집중/전체 결과·실제 미실행 목록을 검토한다. 필수 지적은 재현/보완하고 영향 검사 갱신 후 targeted 확인받는다. 이 단계 완료만으로 Native/push가 실행된 것은 아니다.

## Task 4: 새 Windows Native 조사·전환 검증

**실행 승인 전에는 아래 경로 생성/Chrome 실행을 하지 않는다.** 고정 implementation commit을 C라 하며, root가 아닌 새 물리 clone을 사용한다. 새 의존성/브라우저 설치가 필요하면 중지한다.

- [ ] **clean 준비:** 새 `output/f01-observer-native-20261016a/source`는 C, sibling `output/f01-observer-native-20261016a/frozen`은 고정 F다. `git clone --no-hardlinks --no-checkout`와 detached checkout을 사용하며 기존 node_modules만 연결한다. 양 사본 tracked clean·전체 attestation/동일 lock/실제 Node/browser bytes를 기록한다. 기존 ZIP을 복사해 SHA256 `67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`을 확인한다. 기존 source/프로필/출력은 보존한다.
- [ ] **자료 보존 base/negative:** 현재 source에서 programmatic import로 각각 `runInstalledExtensionE2E({runId:'F01ObsBase20261016A',retainEvidence:true})`, `runInstalledExtensionNegative({runId:'F01ObsNegative20261016A',retainEvidence:true})`. 정상 base 전체 시나리오/정확한 `main-runtime-missing` 검출과 실제 보존·close 계약을 확인한다.
- [ ] **일반 전환:** programmatic import로 `runInstalledTransition({runId:'F01ObsB2Positive20261016A',retainEvidence:true})`와 `runInstalledTransition({runId:'F01ObsB2Loss20261016A',control:'storage-loss',retainEvidence:true})`. 정확한 전체 보존/원래 loss oracle·모든 정상 종료·secondary 없음과 roots/candidates 실제 보존이 필요하다. 기본 CLI는 사용하지 않는다.
- [ ] **F01 cold:** programmatic import로 `runInstalledTransition({runId:'F01ObsCold20261016A',mediaSchema:'f01',retainEvidence:true})`와 `runInstalledTransition({runId:'F01ObsColdLoss20261016A',mediaSchema:'f01',control:'storage-loss',retainEvidence:true})`. 기존11seed/28phase/39종료 및 정확한5손실/19종료를 대조한다. media의 기본 사후 보존만 믿지 않고 후보 준비 실패까지 true를 전달한다. 권한 있는 UI/worker sender 계약을 완화하지 않는다.
- [ ] **Windows 대조:** 현재 source에서 `runObserverIsolation({frozenRoot:'../frozen',prefix:'f01obs-win-a'})`를 programmatic 실행한다. 실제 API는 frozenRoot를 currentRoot 기준 absolute로 해석하고 앞선 root 검증을 한다. F1,U1,T1,U2,T2,F2,T3,F3,U3와 source/provenance/로그/종료를 보존한다. 모두 통과해도 과거 오디오 인과는 미확정이다.
- [ ] **증거 정리:** 새 Native source/after·report/diagnostic/raw/profile/trace와 모든 실패를 private output에 남긴다. 일반 base를3종료증명으로 과장하지 않는다. 사전 run ID가 있으면 덮지 말고 새 목록/이유를 사용자에게 확인한다. 재검사에 성공한 값만 선택하지 않는다.

## Task 5: 조사 checkpoint 1회 공개·Linux 근거와 최종 STOP

- [ ] **push 전 gate:** Task1–4/독립 구현 검토가 끝났고 추가 조사 실행 묶음의 명시 승인이 있는지 확인한다. Windows 수치만 실패했고 자료/종료가 완전하면 실패를 숨기지 않고 Linux 비교를 계속할 수 있다. Windows 입력 무효/미실행/종료 불명·필수 검토 미해결이면 push하지 않는다. 오디오 원인 미확정은 이번 조사 push의 목적이지 최종 마감 승인으로 바뀌지 않는다.
- [ ] **같은 PR #45만 갱신:** 구현 checkpoint/미실행·한계를 한글 본문에 합쳐 해당 branch에 1회 push한다. 정확한 head/자동 merge SHA를 함께 기록한다. 새 PR/문서 전용 push/자동 재실행/최종push/병합을 하지 않는다.
- [ ] **공개 관측:** foundation 두OS·verify 원래6회/설치/정확한전환/손실과 별도 observer9회를 확인한다. observer job은 같은 runner 안의9개만 비교한다. Node/browser/rate 실제값을 확인하며 다른 job/Windows 표본을 같은 환경으로 합치지 않는다.
- [ ] **자료 회수/재평가:** 해당 head의 exact35파일 및 기존12오디오 파일을 새 private 경로에 받는다. artifact missing/timeout/잘린로그/자료 원장 불일치는 실패다. 원 report/PCM으로 독립 판정을 다시 수행하며 초기 CI의 실패를 덮지 않는다. 전환이 또 실패하면 bounded 원래 예외를 확인하고 새 설계로 돌아간다.
- [ ] **판정·문서:** 설계4절의 분기를 적용하고 Astra max에 실제 실행 근거의 targeted 확인을 받는다. 모두 PASS이면 **이번 조건 미재현**, F/U 또는 T 차이면 **관측 효과 후보**, 공통 실패면 **공통 원인 후보**, 불완전이면 **비교 무효**다. 어느 것도 원인 확정/Task3 자동완료가 아니다. PLANS/검증 기록에 실제 수행/실패/미실행·다음 질문을 남기고 **STOP**한다.

## 자체 검토·실행 핸드오프

- 설계3절은 Task1/2/4/5, 4절의 자동마감 금지는 Task5, 5절 retention/reload는 Task3/4/5, 보호/권한은 전역 조건으로 연결한다. Review Focus5개 모두 담당 RED/실제 검증이 있다.
- 현재U의 clock 관측·F raw 부재·실제 과거250Hz ON 인과 미확정은 유지한다. 도구 원문/제품/runner 환경을 분리하고, normal data와 failure transport를 같은 PASS로 합치지 않는다.
- Task2의 bounded child 종료만으로 Chrome 자식 종료를 가정하지 않는다. 불명확한 경우 사용자 개입을 요청하는 STOP을 수용하며 broad process kill/프로필 삭제로 해결하지 않는다. 계획 검토의 보존 경계 누락은 verifyCandidate 및 일반전환 parent/child까지 확장했고, 음성 대조의 기대오류+secondary 거부를 명시했다. 이 보완도 새 실행 묶음 승인에 포함한다.
- 작성 계획 승인 때 **Native 직접 구현·Astra max 구현 검토·새 격리 Native·추가 조사 push1회/Linux 총15오디오**를 한번에 확인받는다. 이번 작성/계획 검토 중에는 실제 실행하지 않는다. 마감/병합/배포 권한은 별도다.

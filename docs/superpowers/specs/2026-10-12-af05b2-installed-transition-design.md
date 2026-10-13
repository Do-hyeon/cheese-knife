# AF05-B2 — 격리 설치본 코드 전환·복귀 상세 설계

2026-10-12 / Asia-Seoul. 상태: **독립 설계 검토·보완 후 사용자2026-10-13 B2 설계/Native 구현·격리검증·최종 Astra max 검토 묶음 승인, 구현 중**. [상위 AF05-B 설계](2026-10-12-af05b-release-acceptance-design.md)의 과거 업데이트 미검증 수용·플랫폼 롤백 완료 기준 변경은 여전히 별도 승인 대상이다.

## 1. 목적·성공 기준·비목표

게시 2.13.3과 AF 후보의 **전체 배포 파일, 실제 background와 구/새 UI, Chrome storage/CSS**를 연결해, 같은 bundled Chromium 프로필·개발용 ID에서 old→new→old 전환 중 값 손실과 혼합 코드가 탐지되는지 검증한다. B1의 모의 저장소 호환성 결과를 설치 검증으로 확대하지 않는다.

- 설계 기준 main: `b38ec388784ec8f32007401d42a8439dddffd0de` / [B1 PR #36](https://github.com/Do-hyeon/cheese-knife/pull/36).
- 2026-10-13 복귀 대조: 유지보수 PR #42 통합 main `6b919e1c62661ec49a12ce6df2c02e11273af41d`를 구현 기준으로 삼는다. 현재 foundation9와 settings fixture 계약을 유지하고 broker control 연결점은 그대로다. 역사적 설계/검토 결과나 게시 payload 기준을 바꾸는 재검증 PASS는 아니다.
- 게시 기준: `fb15f9675f9ea910e98363635155bc4ff9eb1d2f`, 제품 version `2.13.3`, 실제 스토어 ID `cgfddiiffponlciljlfbiecmlagflbpe`.
- 로컬 코드 전환을 실제 CRX 업데이트·서명·스토어 ID·열린 이전 content script 정리·in-place reload·플랫폼 rollback으로 표현하지 않는다. 이번 검사는 정상 종료 후 동일 프로필의 재기동이다.
- 제품 TS/JS·package/lock/manifest·권한·원래 root dist·제출 ZIP/CRX·시청 프로필·P09 native 기준 프로필·frozen P02 자료를 변경하지 않는다. 새 제품 버전·태그·릴리즈·스토어 제출/게시·F00–F05 구현은 없다.
- 원본 UI와 background를 그대로 실행한다. 실제 계정·쿠키·치지직 방송·채팅·후원·연령 제한 콘텐츠·다른 확장 저장소는 사용하지 않는다. 새 의존성·제어 확장·CDP/브라우저 정책 우회는 도입하지 않는다.

## 2. 접근안 비교

| 안 | 얻는 근거 | 한계·판단 |
| --- | --- | --- |
| 권장: 고정 공개 payload + 같은 경로/프로필의 persistent Chromium | 실제 이전/후보 UI·worker·내구 저장·CSS의 코드 전환/복귀 | 스토어 자동 업데이트는 아님. 기존 도구를 재사용하고 B2에 필요한 시나리오만 추가 |
| B1 fixture 확대 | 빠른 fault/계약 대조 | 실제 background/UI·내구 저장을 증명하지 못하므로 B2 대체 불가 |
| 실제 스토어를 지금 업데이트/롤백 | 실제 플랫폼 경로 | 공개 사용자·승인·native preflight에 의존. 이번 로컬 단계에서 실행하지 않음 |

기존 `runBaseInstalledScenario`는 손상 revision 복구를 위해 storage snapshot을 재주입한다. `runInstalledScenarioSequence`도 상태를 바꾸므로 연속 보존 oracle로 재사용하지 않는다. `launchInstalledExtension`, `parseInstalledE2EArgs`, fixture-router, `verifyCandidate`, owned-files·패키지 검사는 재사용한다. 일반 브라우저/배포 엔진은 만들지 않는다.

## 3. 고정 원본과 파일 취득

[공개 ZIP](https://github.com/Do-hyeon/cheese-knife/releases/download/v2.13.3-community.1/cheese-knife-community-recovery-2.13.3-fb15f967.zip): **201802 bytes**, SHA-256 `67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`. GitHub release API의 size/digest를 이번 설계에서 재확인했다. 기존 원본 ZIP을 읽기 전용 대조했으며 해제·설치하지 않았다.

- 일반 파일 58개·해제 합계 599793 bytes·최대 파일 359160 bytes. ASCII 이름, DEFLATE method8, flags0, external attributes0다.
- `[name,sha256]` 배열을 이름의 **ASCII ordinal** 순서로 정렬한 compact JSON의 SHA-256: `a7a23d74b79132479b53d80b3cac2d71ab89a3cdb15b68cdda81732e6064ddd2`. localeCompare 기반 B1 root inventory digest와 별개다.
- 고정 ZIP의 central/local header를 읽기 전용 대조해 얻은 `{name,dataOffset,compressedBytes,rawBytes,sha256,method,flags}` 58행을 같은 ordinal 순서로 compact JSON 직렬화한 hash: `669cc7f64599e748f4d3ec86e45472786cf331e4a0b207914619a03f849a652c`.

구현에서 이 58행을 공개 JSON fixture로 커밋한다. reader는 **ZIP의 정확한 길이·전체 hash를 먼저 검사**하고, 다시 고정 metadata hash와 목록 hash를 확인한 뒤 검증된 offset의 조각만 `node:zlib.inflateRawSync`로 읽는다. ZIP 이름을 실행 중 탐색하거나 일반 archive parser를 만들지 않는다. arbitrary ZIP·ZIP64·암호화·추가 항목을 지원하는 옵션은 없다. 따라서 변경된 ZIP은 경로 해석/압축 해제/쓰기 전에 거부된다.

입력은 Buffer만 허용한다. archive 상한1MiB, 파일별 raw 상한1MiB, raw 합계2MiB, metadata64KiB, entry 수58을 적용한다. 정수 offset/길이·범위/겹침·일반 상대 이름·중복/case alias를 확인하고 각 출력 길이/hash·최종 전체 inventory를 대조한다. 원본 Buffer를 변경하지 않고 호출마다 새 출력 Buffer를 제공한다. Buffer 자체를 불변이라고 주장하지 않는다. 어떤 검증도 생략하는 공개/test 옵션은 만들지 않는다.

`--prepare`만 고정 HTTPS 주소를 anonymous 다운로드한다. 30초 deadline·응답 body1MiB 상한·최종 정확한 길이/hash·최대 redirect4회, `github.com`, `release-assets.githubusercontent.com`, `objects.githubusercontent.com`의 HTTPS만 허용한다. 쿠키/토큰/인증 헤더를 사용하지 않는다. 기존 유효 cache는 읽기 검증 후 재사용하고 다른 파일은 덮지 않는다. partial download는 새 owned 임시 디렉터리에만 두고 실패 시 정리한다. cache 경로는 `output/playwright/published-payload-67ae9c1512fef7e0.zip`으로 고정한다.

검사 reader/시나리오에는 네트워크 fallback이 없다. cache 부재·다운로드 실패·hash 불일치는 FAIL이며 current source·private ZIP·최신 release로 대체하거나 skip하지 않는다. CI는 기존 fixed Git fetch 다음, `npm test` 전에 `--prepare`를 실행한다. offline foundation은 그대로 둔다.

## 4. 후보·소유 경로·실행 provenance

실행 시 clean tracked checkout의 immutable HEAD를 sourceCommit으로 기록하고 `verifyCandidate(runId, repositoryRoot)`로 후보를 만든다. build는 이 owned 후보 안에서만 수행한다. root dist를 build/cleanup 대상으로 삼지 않는다. 원본·후보는 독립 directory다. 두 후보 build의 58개 파일 해시가 같아야 한다. 코드 생성 검사·sourceCommit·lock/toolchain hash·후보 전체 inventory를 연결하고 검사 도중 source input 변경은 FAIL이다.

각 case는 `output/playwright/installed-transition-work-` 아래 새 mkdtemp root 하나를 소유한다. 그 안의 `profile/`, `extension/`, `trace/`는 고정 상대 경로다. `extension/`의 절대 경로와 `profile/`의 정규 경로가 모든 phase에서 같아야 한다. 기존 directory 인수·다른 profile 지정·profile 복사/삭제 후 재생성·uninstall/reinstall은 금지다. Windows bundled Chromium 호환 복사도 이 새 profile 안에만 둔다.

| phase | manifest.version | 나머지 payload |
| --- | --- | --- |
| seed + old | 원본 `2.13.3` | 58개 bytes가 frozen 원본과 동일 |
| new | 가상 T=`2.13.4` | AF 후보 58개, manifest의 version/version_name만 예외 |
| rollback | 가상 R=`2.13.5` | 이전 코드 58개, manifest의 version/version_name만 예외 |

T/R은 **TEST ONLY**이며 제품/출시 번호가 아니다. private 복사본의 version_name은 각각 `AF05-B2 TEST ONLY new`, `AF05-B2 TEST ONLY rollback`이다. manifest는 원본 object를 clone하고 두 값만 바꿔 `JSON.stringify(object,null,2)+'\n'`으로 저장해 기대 hash를 만든다. 다른 key·권한·key/스토어 ID·파일은 바꾸지 않는다. 원본 manifest는 bytes 그대로다. [Chrome version 규칙](https://developer.chrome.com/docs/extensions/reference/manifest/version)에 맞는 로컬 식별값이며 플랫폼 downgrade/rollback을 증명하지 않는다.

각 launch 직전과 context 종료 뒤 전체 파일 목록/hash를 expected phase payload와 비교한다. extra/missing/mixed 파일·link·다른 버전·다른 ID는 해당 phase 결과를 채택하기 전에 FAIL이다. context가 정상 종료된 뒤에만 owned 설치 복사본을 완전히 교체한다. close timeout/failure 후에는 다음 phase를 시작하지 않는다.

새 worker에서 `chrome.runtime.id`, 실제 manifest.version, `createSettingsBroker.toString()`을 관측한다. B1과 같은 고정 `var createSettingsBroker = ` 이후 function expression과 비교하여, 현재 파일을 읽기만 한 것이 아니라 기대 broker 함수가 실행 context에 있음을 확인한다. 임의 실행 sentinel/product 주입은 하지 않는다. 이것만으로 모든58파일의 모든 코드 경로 실행을 주장하지 않는다. 물리 전체 hash + 실제 UI/protocol/storage/CSS/MAIN 동작이 각각 별도 근거다.

## 5. 연속 저장·UI·CSS oracle

사용자2026-10-13 지시에 따라 private 시험값도 기존 세 자리 `major.minor.patch` 형식을 유지한다. T/R은 현재 제품2.13.3의 변경이나 차기 출시 번호 확정이 아니다. 원본 manifest·원래 dist·스토어·릴리즈의 버전 표기는 그대로다.

2026-10-13 실행 보완: 격리 Chromium은 manifest T를 관측하면서도 이전 imported broker worker를 유지했다(실제7622자/후보7970자, EOL 차이 아님). 각 새 context에서 **시험 확장만** `chrome.runtime.reload()`하고 기존 harness로 이전 worker 재사용 없이 새 worker를 취득한 다음 provenance/seed/UI 검사를 시작한다. 같은 profile/extension 경로·ID·raw storage는 유지하고 직접 저장 보정은 하지 않는다. 이는 시험 준비의 worker 갱신이며 스토어/native 자동 업데이트나 열린 이전 content script의 in-place 정리 성공을 증명하지 않는다. launch/정상 close ACK·실패 보존 규칙은 그대로다.

각 case의 seed phase에서 실제 원본 popup의 ready·get-snapshot 응답을 읽기 전용 fence로 기다려 최초 broker boot 완료를 확인하고 **raw storage가 여전히 빈 것을 재확인한 뒤 초기 seed를 한 번만** `chrome.storage.local.set`으로 넣는다. 이 fence는 UI 저장/repair를 하지 않는다. `futureTop.runNonce`에는 run별 random128bit 값을 넣고 이후 모든 phase에 그 값을 기대한다. 즉시 raw 값 확인→페이지 전부 close→context close→old 재기동으로 startup migration을 관찰한다. 이후 writes는 실제 UI 조작뿐이다. storage 재주입·repair·직접 broker 호출로 저장을 대체하지 않는다. popup UI는 packaged `popup.html`/JS/client, styles는 packaged `styles.html`/JS/client다.

공통 초기값: config `{futureFlag:'keep',brightness:1.25}`, styles `['future-style']`, styleParameters `{future:9}`, revision4, futureTop `{runNonce:<nonce>,untouched:true}`. UI range step과 맞는 brightness1.25를 사용한다. B1의 fractional1.225 계약 검사는 별도로 유지한다.

| case | old startup의 독립 기대값 | new·rollback |
| --- | --- | --- |
| valid-ui | seed 그대로에서 아래 UI 저장 수행 | 단계별 literal raw/UI/CSS 비교와 추가 저장 |
| legacy-valid | config.resizeChat=true, own t=0 추가 seed → resizeChat 제거·sharpness0·chat-resize append·revision5·t 제거 | 초기화는 no-op, unknown/nonce 보존·revision5. font0 등 정상 UI 상태 관측 |
| legacy-null | resizeChat=false, own t=null → t만 제거·revision4·resizeChat=false raw 보존 | 초기화 반복 no-op, unknown/nonce 보존 |
| legacy-invalid | resizeChat=false, own t='invalid' → t만 제거·revision4 | 위와 동일. invalid t를 보존한다고 주장하지 않음 |
| damaged-revision | settingsRevision='invalid-b2' → seed raw 전체 불변, popup/styles repair-required·쓰기 control disabled·owned CSS 등록 없음 | 임의 repair/reset하지 않음. MAIN은 별도 getConfig 경계이므로 configReady=true/configuration ready와 정상 normalized known config를 관찰 |

valid-ui의 순차 저장:

1. old popup: arrowSeek OFF→revision5, previewVolume25→6; styles hide-ranking ON→7, chat-font-size8→8. raw styles `['future-style','hide-ranking','chat-font-size']`, parameters `{future:9,'chat-font-size':8}`. 각 작업 후 raw·저장상태 완료를 기다린다.
2. new startup에서 revision8·old raw가 그대로인 것을 **UI 수정 전에** 확인한다. 두 popup에서 arrowSeek ON과 previewVolume35를 동시에 바꾼 후 두 값·revision10·두 UI 동기화를 확인한다. 완료 순서는 강제하지 않는다. styles font0→revision11, raw parameter0은 남고 known style membership만 제거된다.
3. rollback startup에서 revision11과 new raw를 그대로 확인한다. 원본 popup에서 previewVolume26→revision12; 원본 styles에서 font8→13→0→14. unknown/nonce·arrowSeek=true·brightness1.25·font0을 보존한다.

각 단계의 expected raw는 위 literal 값·정확한 revision으로 구성한다. 두 구현의 결과를 비교하는 것만으로 합격시키지 않는다. revision은 storage 전용이며 MAIN bridge의 request/revision 카운터와 같은 수치라고 가정하지 않는다.

각 phase에서 첫 fixture page 하나를 먼저 열어 그 URL의 tab이 한 개일 때 실제 tab/window ID를 취득한 뒤 두 번째 page를 만든다. styles URL의 targetTabId/targetWindowId에는 보존한 첫 page metadata를 지정한다. 두 page를 먼저 열어 같은 URL의 tab을 추정하지 않는다. owned CSS ID `styles`의 files/matches/runAt/js를 API에서 확인한다. matches는 `['https://chzzk.naver.com/*']`, runAt은 `document_start`, js는 absent/빈 배열이다. valid font8에서는 `['styles/chat-font-size.css','styles/hide-ranking.css']`, font0에서는 `['styles/hide-ranking.css']`, legacy-valid에서는 `['styles/chat-resize.css']`, 다른 case에서는 owned registration이 없다. unrelated registration은 수정하지 않는다.

valid-ui에서 styles 저장 후 reload 버튼을 눌러 target의 `window.__knifeFixture.loads`만 +1, 두 번째 page는 불변, ranking display='none'을 확인한다. font8/0의 `--knife-chat-size-1/2/10/20`도 기대 px와 대조한다. MAIN symbol registry의 ready/config가 raw의 알려진 설정과 일치하고 중복 owned control·pageerror가 없어야 한다. 손상 case에서도 MAIN은 revision을 검증하지 않는 `getConfig(true)`로 config/styleParameters를 읽으므로 ready다. brightness1.25·arrowSeek=true·previewVolume5 등 고정 게시 schema의 known default+seed만 전달되고 futureFlag/resizeChat는 MAIN config에서 제외된다. UI repair-required를 MAIN timeout으로 오인하지 않는다. 손상 case의 쓰기 제한 성공은 정상 UI 저장 성공과 구분한다. 실제 방송 기능 전체의 재검증은 기존 E2E/오디오/전체 gate가 소유한다.

startup 순서는 실행 provenance→기본 ready/repair 상태→raw/UI/CSS/MAIN 관측→literal oracle다. **보존해야 할 필드 값과 같아질 때까지 먼저 기다리지 않는다.** 값이 손실되더라도 실제 관측을 얻어 preservation code로 거부해야 하며 단순 timeout으로 바뀌면 control 실패다. Task2 실패는 captured observation·case/phase/step/stage/code를 bounded failure record로 붙여 throw하고, child는 이 record를 parent에 IPC로 전송한 뒤 close를 수행한다. negative의 허용 stage는 case valid-ui/phase new/step startup의 `candidate-init`뿐이다. observation.raw가 없거나 실제 own config 삭제가 관찰되지 않으면 같은 code만으로 합격하지 않는다.

fixture HTTP(S)는 기존3개 고정 URL만 fulfill, 다른 application 요청은 abort·기록한다. WebSocket은 차단한다. context observers를 설치한 뒤에만 검사 page를 연다. phase 종료 전 page를 모두 닫아 이전 fixture page의 다음 launch 자동 복원을 방지한다. 브라우저 내부 네트워크 전체가 OS 수준에서 차단됐다고 주장하지 않는다.

## 6. 설치 경계의 negative control

2026-10-13 후속 실행 승인: 새 owned fixture 프로필에만 정상 Chrome 관리 UI로 Developer mode를 켠다. read-only 진단에서 command-line 등록의 runtime.reload 후 DISABLED/unsupportedDeveloperExtension=true를 관측했다. 직접 profile 편집·force flag·정책 우회는 하지 않으며 UI가 잠겨 있으면 FAIL이다. B2 준비 helper는 old-worker close를 요청 전에 구독하고, 종료 후 새 management 문서에서 같은 ID/기대 version·ENABLED/제한 없음·Developer mode ON을 관측한 뒤 popup wake/새 worker provenance를 진행한다. seed와 모든 completed phase의 preparation 증거를 parent도 재검증한다. 이전 broker가 남은 상태나 실행 환경 실패는 계속 FAIL이다. 실제 환경 성립은 새 설치 전환 검사로 확인할 때까지 미합격이다.

정상 positive와 다른 새 root/profile/extension에서 valid-ui를 실행한다. new 시험 복사본의 **settings-broker.js**에서 initialize의 기존 `boot = enqueue(async () => {` callback 안, 첫 `const raw = await read(true), revision = contract.readRevision(raw.settingsRevision);` 바로 앞에 `await chromeApi.storage.local.remove('config');` 한 줄만 삽입한다. 정확한 insertion point가 한 개임을 먼저 검사하며 0/복수면 control-preparation 실패다. original background의 동기 importScripts/listener 등록은 그대로다. 삭제 완료 뒤 실제 broker boot가 raw를 읽으므로 삭제와 read의 경쟁을 만들지 않는다. remove 실패도 별도 control 실패다. 정상·원본·제품 파일은 바꾸지 않는다. 이 변형 broker hash/function source는 **negative phase의 별도 기대 inventory/provenance**에만 반영한다.

old raw/revision8 저장 성공과 정상 종료 후 new를 실행하고, 같은 preservation oracle가 candidate-init 단계의 **`transition-storage-preservation`**으로 거부해야 한다. 실제 raw에서 config 손실도 확인한다. inventory 실패·MAIN/worker timeout·브라우저 부재·cleanup 실패를 기대 실패로 인정하지 않는다. negative 보고서의 `ok:true`는 control 탐지 합격이지 positive 전환 합격이 아니다. 정상 positive와 기존 MAIN-missing negative도 각각 실행한다.

## 7. 실패·종료·증거 경계

phase 동작은15000ms wait, phase 전체120000ms, 브라우저 close10000ms; 각 positive/negative CLI 전체600000ms. timeout은 FAIL이다. parent CLI가 같은 runner의 child를 실행·감시해 단순 Promise.race 뒤 작업을 계속하는 형태를 피한다. **Playwright의 Unix Chromium은 detached process group이므로 runner 종료가 browser 종료 증거가 아니다.** 새 launch마다 child가 launch-intent(case/phase/launchId/owned relative root)를 보내고 parent의 ACK를 받은 뒤에만 harness를 호출한다. context.close가 정상 완료한 경우에만 같은 launchId의 close-success를 전송한다. 정상 launch 실패·harness 내부에서 close 오류를 삼킨 실패도 close-success 없이는 종료 확인으로 취급하지 않는다.

deadline/예상치 못한 child exit 시 소유한 runner만 종료한다. Windows는 생성한 child PID의 taskkill `/T /F`, Unix는 생성한 runner 전용 process group만 종료하고5초 내 runner 종료를 확인한다. 이 조작으로 detached Chromium까지 종료됐다고 주장하지 않는다. **미확인 launch가 하나라도 있으면 affected work/profile/extension/trace directory를 보존**하고 `cleanup-unconfirmed`를 남기며 nonzero로 끝낸다. 다음 phase/negative PASS/그 directory 삭제는 금지다. 다른 정상 종료가 확인된 root와 browser가 사용하지 않은 후보만 정리한다. OS/private Playwright API의 일반 process 탐색·임의 PID kill은 만들지 않는다. 사용자 Chrome·기존 profile/process는 대상이 아니다. 실패한 private 시험 프로세스의 수동 종료가 필요할 수 있음을 승인 묶음의 한계로 고지한다.

첫 실패 code·phase·stage·관측 record를 유지하고 cleanupErrors는 별도로 남긴다. 성공 후 close/remove/trace/summary 실패도 최종 FAIL이다. 최종 PASS는 모든 launch-intent에 대응하는 close-success, child 정상 종료, 필요한 hash/cleanup/report 완료까지 parent가 확인해야 한다. positive/negative의 정상/종료 확인된 실패 finally는 context→작업 root(profile·설치 복사본·trace·bundled Chrome)→후보 순서다. **종료 미확인 root는 삭제하지 않는 fail-closed 예외**이며 complete cleanup으로 기록하지 않는다. 후보/작업 root 생성 중 일부 실패도 인계된 소유권과 close ACK에 따라 정리한다. 이미 존재한 artifact/cache/후보 경로를 인수하거나 삭제하지 않는다.

보존 artifact는 `output/playwright/installed-extension-transition-<runId>/summary.json`(1MiB 이하), 실패 screenshot1개(8MiB 이하), 실패 trace1개(32MiB 이하)다. tracing은 sources/video/screenshots 없이 고정 fixture에만 수행하며 성공 후 transient trace는 삭제한다. 크기 초과 artifact는 보존하지 않고 artifact-limit로 FAIL한다. 이 상한은 최종 보존 파일 상한이며 기록 중 임시 디스크의 엄격한 quota가 아니다. error 목록은32개×240자, 각 summary는 case/phase·relative 경로·ID·version·hash·검사용 raw/UI/CSS·한계만 포함한다. 소유 profile·브라우저 복사·개인 자료는 upload 대상이 아니다.

## 8. 완료와 승인 경계

- B2 로컬 완료: reader provenance·상한/부재·pure oracle/runner faults·실제5case 전환·실제 저장 손실 negative·현재 foundation9·전체 Node·기존 E2E positive/negative·합성 audio·패키지·현재 도구 감사·보호 파일 전후 hash·최종 독립 품질 검토가 모두 근거를 남김. 공개 CI/통합은 AF05-B 전체 완료 후 단일 한글 PR에서 수행하며 로컬 완료와 구분한다.
- 전체 Node는 clean tracked clone에서 제외 없는 실행. 원래 폴더의 P02 역사 실패와 기존 guarded 도구 경고를 숨기거나 frozen 자료를 변경하지 않음. 새 경고·대상 부재·cleanup/환경 실패는 별도 보완 없이 합격시키지 않음.
- B2 설계/계획 승인 시 새 bundled fixture 프로필·시험용 T/R payload·negative 복사본·owned cleanup이 필요한 로컬 동작임을 함께 제시한다. 종료 미확인 시 실패/프로필 보존과 private 시험 browser의 수동 종료 필요 가능성도 고지한다. Native 또는 subagent 실행 방식과 구현 후 최종 Astra max 검토도 승인 묶음에 포함해 받는다. 이는 실제 시청/native 프로필·제품 버전·스토어 조작 승인이 아니다.
- 전체 AF05-B spec의 waiver/rollback 수용 기준, 성공한 native2.13.3 runtime/seeded storage preflight, 공개 버전, 스토어 upload/심사/게시, 실제 update/new install/플랫폼 rollback은 별도 미완료다. B2만으로 P09/AF05-B DONE·F00 동결 해제를 선언하지 않음.
- 사용자2026-10-13 지시: AF05-B 카테고리 전체 완료 후 한글 PR 하나로 묶고 Task/B2/문서별 중간 push·PR은 하지 않는다. 현재 릴리즈·스토어 배포 금지는 유지하며 이를 이유로 미승인 native/waiver 게이트를 자동 면제하지 않는다.

설계의 플랫폼 근거: [Playwright extension guide](https://playwright.dev/docs/chrome-extensions), [persistent context API](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context). bundled Chromium과 persistent profile을 사용하고 시청 Chrome을 연결하지 않는다. 구현·현재 환경 실행으로 실제 성립 여부를 검증할 때까지 예상 동작을 PASS라고 부르지 않는다.

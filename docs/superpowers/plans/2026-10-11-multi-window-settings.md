# Multi Window Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여러 설정 화면의 변경을 잃지 않고, CSS 등록 완료를 확인한 뒤 원래 치지직 탭에만 적용한다.

**Architecture:** 팝업·스타일 화면은 절대값 필드 연산만 보낸다. 기존 백그라운드에 단일 직렬 저장 담당을 두고 마이그레이션·조회·CSS 조정·대상 reload를 같은 순서로 처리한다. 미디어 자원과 읽기 전용 MAIN 브리지는 페이지별 소유권을 유지한다.

**Tech Stack:** 기존 classic JavaScript, Chrome MV3 service worker, Firefox background scripts, Node test runner와 jsdom. 의존성 추가 없음.

**Spec:** [승인된 다중 탭과 창의 설정 저장 충돌 방지 설계](../specs/2026-10-11-multi-window-settings-design.md)

상태: 사용자 설계 승인과 Astra max 계획 재검토를 반영했다. 남은 계획 차단 사항은 없으며, 사용자 계획 확인과 실행 방식 선택 전이다. 제품 구현은 시작하지 않았다. [검토 이력](../reviews/2026-10-11-multi-window-settings-plan-review.md)을 함께 읽는다.

## Global Constraints

- namespace `cheese-knife-settings`, protocol `1`; action은 `get-snapshot`, `patch`, `reload-target`으로 제한한다.
- 요청 ID는 최대 128자로 제한한다. 한 요청은 최대 64개 연산을 포함한다. 대기 요청은 최대 64개로 제한한다.
- `chat-font-size`는 -6부터 16까지의 유한한 수로 검증하며 같은 저장 안에서 0 여부로 활성화를 결정한다.
- boolean과 범위 설정의 타입·유한성·min/max는 현재 CONFIGS를 기준으로 검사하며 잘못된 값을 clamp해 수용하지 않는다.
- 기존 저장 키 `config`, `styles`, `styleParameters`와 기본값, 한국어·영어 UI를 유지한다. 알 수 없는 저장 필드는 보존하지만 UI 응답에는 노출하지 않는다.
- `settingsRevision`은 로컬에 저장하는 기술적 순번이다. worker가 다시 시작됐다고 0으로 되돌리지 않는다.
- 동적 등록은 현재 소유한 ID `styles`만 관리한다. 다른 등록 ID를 모두 해제하지 않는다.
- callback 응답과 `return true`를 사용하는 방식으로 최소 Chrome 121 및 별도 Firefox 패키지의 호환성을 유지한다.
- 요청을 자동 재전송하지 않고 최신 스냅샷을 다시 조회한다. 저장 여부가 불명인 동안 성공 표시와 적용용 새로고침을 허용하지 않는다.
- 개인정보처리방침을 제공하는 기존 브랜치와 URL도 변경하지 않는다. 새 권한, 네트워크 요청, heartbeat, alarm, keep-alive 우회를 추가하지 않는다.

현재 폴더의 `codex/sidebar-preview-followup`, 기준 HEAD `042ab40858043092349b948cc5f1179b894da458`를 사용한다. 사용자의 기존 폴더·브랜치 선호를 유지하며 새 worktree를 임의 생성하지 않는다. 미완료 HLS 후보 파일은 별도 변경이므로 이 작업의 커밋·완료 판정에 섞지 않는다. 계획 승인과 실행 방식 선택 전에는 제품 코드, 테스트, dist를 변경하지 않는다.

## Review Focus

1. 저장 commit과 callback이 다른 시점에 실패하면 UI가 성공이나 자동 재전송을 하지 않아야 한다. Task 2와 3에서 commit 전·후 종료를 따로 검사한다.
2. 빠른 슬라이더 입력 중 다른 창의 변경과 오래된 조회가 도착해도 새 로컬 값과 다른 필드가 남아야 한다. Task 3과 4에 입력 세대·revision 순서 검사를 넣는다.
3. 마이그레이션 write 성공 뒤 legacy 키 제거가 실패해도 이후 사용자 값을 뒤늦게 덮지 않아야 한다. Task 2에서 부팅 실패와 재시작을 검사한다.
4. config 저장은 CSS 실패 때문에 실패로 바뀌지 않지만, style reload는 실패한 CSS를 적용했다고 표시하면 안 된다. Task 2와 4에서 저장과 적용을 분리한다.
5. BFCache와 타겟 창 이동은 다른 방송의 reload·미디어 중단으로 이어지면 안 된다. Task 4와 5에서 대상 검증과 페이지별 취소를 검사한다.

## 파일과 공통 계약

새 루트 파일은 `style-schema.js`(현재 STYLES 목록), `settings-contract.js`(순수 검증·병합), `settings-broker.js`(백그라운드 큐·Chrome API), `settings-client.js`(설정 화면의 입력·응답 순서)다. `config.js`의 CONFIGS와 normalizeConfig를 재사용한다. 기존 `background.js`는 로드·이벤트 연결·권한 확인만 담당하도록 줄인다. Task 1~3의 새 모듈은 Task 4 전까지 실제 entry point에 연결하지 않는다.

`RawSettings`는 저장된 네 키와 legacy `t`를 담는 내부 객체다. `Snapshot`은 `{revision, config, styles, styleParameters, css}`이고 config는 normalizeConfig 결과, styles/매개변수는 알려진 유효 항목만 포함한다. CSS 상태는 `{state:'pending'|'ready'|'failed', code:string|null}`이다.

요청 공통 속성은 `{namespace,protocol,action,requestId}`다. config 연산은 `{type:'config',id,value}`, 일반 style은 `{type:'style',id,enabled}`, 매개변수는 `{type:'parameter',id,value}`다. 범위 style의 checkbox 연산은 거부하고 parameter 연산으로 활성 여부를 유도한다. 같은 요청에서 같은 필드가 반복되면 마지막 절대값을 채택하되 모든 연산을 먼저 검증한다. 빈 `operations:[]` patch는 명시적 최신 CSS 재적용이며 저장값이나 revision을 증가시키지 않는다.

조회 응답은 `{ok:true,requestId,snapshot}`다. patch 응답은 `{ok,requestId,revision,stored,css,stage,code}`이며 전체 스냅샷을 담지 않는다. `stored:true`는 요청한 값이 최신 저장 상태에서 확인됐다는 뜻이며 no-op에서도 true다. 실제 set 호출 여부와 구분한다. false는 저장 확인을 하지 못했다는 뜻이지 commit 부재의 보장이 아니다. reload 응답은 `{ok,requestId,revision,reloaded,css,stage,code}`다. 실패 단계는 `validation`, `initialization`, `read`, `write`, `css`, `target`, `reload`, `busy`로 제한하고 오류 원문이나 URL을 UI로 넘기지 않는다. 잘못된 요청의 requestId는 유효한 짧은 문자열일 때만 응답에 반영한다.

## Task 1 공통 스키마와 순수 변경 계약

**Files:** Create `style-schema.js`, `settings-contract.js`, `tests/settings-contract.test.cjs`. 아직 styles.js의 목록을 삭제하거나 HTML을 변경하지 않는다.

**Interfaces:** `var STYLES`는 기존 스타일 목록과 동일하다. `var KnifeSettingsContract`는 `validateOperations(operations)` → `{ok:true,operations}` 또는 `{ok:false,code}`, `validateRequest(message,sender,extensionId,getURL)` → `{ok:true,request}` 또는 `{ok:false,code}`, `readRevision(value)` → number, `mergeOperations(raw,operations)` → `{changes,revision,stylesTouched}`, `makeSnapshot(raw,css)` → Snapshot, `cssFiles(styles)` → string[]를 제공한다. getURL은 `(path:string)=>string`이다. readRevision/merge/makeSnapshot의 저장 revision 오류는 code를 가진 Error로 전달한다. 모든 함수는 부작용이 없고 변경이 없으면 changes는 빈 객체다.

- [ ] **Step 1: 실제 순수 모듈을 로드하는 실패 검사를 작성한다.** 아래 assertion과 알려진 모든 CONFIGS min/max, false/0, 잘못된 타입·비유한 값, 64/65 연산, 128/129자 ID, 불필요한 요청 속성 검사를 포함한다.

```js
assert.deepEqual(merge(raw({ config: { futureFlag: 'keep' }, settingsRevision: 4 }), [config('arrowSeek', false)]).changes,
  { config: { futureFlag: 'keep', arrowSeek: false }, settingsRevision: 5 });
assert.deepEqual(merge(raw({ styles: ['left-chat'], settingsRevision: 4 }), [parameter('chat-font-size', 8)]).changes.styles,
  ['left-chat', 'chat-font-size']);
assert.equal(merge(raw({ styleParameters: { 'chat-font-size': 0 }, settingsRevision: 4 }), []).revision, 4);
assert.equal(validateOperations([style('chat-font-size', true)]).ok, false);
```

테스트의 `raw`, `config`, `style`, `parameter`, `merge`는 테스트 내부의 입력 생성·실제 export 호출 별칭이며 생산 알고리즘을 복제하지 않는다. sender는 실제 확장 URL을 사용해 popup/styles의 query·hash 허용, CHZZK·다른 확장·잘못된 pathname·누락 ID/URL·알려진 nonzero frame 거부를 표로 검사한다. 기존 unknown 필드는 저장 병합에 남고 snapshot/CSS 파일에는 나오지 않아야 한다. 없는 revision은 0, 잘못된 값 및 안전 정수 상한은 `revision-invalid`/`revision-exhausted` 실패다.

- [ ] **Step 2:** `node --test tests/settings-contract.test.cjs`로 새 export 또는 규칙 누락에 의한 실패를 확인한다.
- [ ] **Step 3:** 위 이름·연산·응답 계약을 구현한다. 모든 연산을 검증한 다음 병합하고 범위 style의 0과 활성화 상태를 한 변경으로 만든다. UI step에 맞춰 기존 무관한 값을 반올림하지 않는다. `cssFiles()`는 현재 STYLES 순서의 알려진 ID만 사용한다.
- [ ] **Step 4:** 해당 suite와 `tests/config.test.cjs`, 전체 `node --test tests/*.test.cjs`를 실행한다. 새 정상화 규칙이 기존 설정 범위를 바꾸지 않아야 한다.
- [ ] **Step 5:** 새 모듈과 테스트만 커밋한다. 메시지: `feat: 설정 변경 계약과 공통 스타일 스키마 추가`.

## Task 2 직렬 저장 담당과 스타일 적용

**Files:** Create `settings-broker.js`, `tests/settings-broker.test.cjs`, `tests/settings-style-apply.test.cjs`, `tests/settings-fixture.cjs`. Modify `tests/background.test.cjs`의 공통 API fixture만 확장한다. 기존 background의 실제 listener 연결은 Task 4에서 한다.

**Interfaces:** Task 1의 `KnifeSettingsContract`를 소비한다. `var createSettingsBroker = (chromeApi) => ({listener,initialize,invalidateStyles})`를 제공한다. `listener(message,sender,sendResponse): boolean`은 자체 namespace만 처리하며 callback과 true를 사용한다. `initialize(): Promise<void>`는 최초 한 작업이고 `invalidateStyles(): void`는 최신 상태 조정을 한 개로 합친다. factory는 동기로 반환해 listener를 await 전에 등록할 수 있다.

- [ ] **Step 1: 공유 fixture에서 실제 broker를 부르는 실패 검사를 작성한다.** 저장 read 결과, commit, onChanged 전달, callback 완료를 각각 독립적으로 보류·실패시킬 수 있어야 한다. 저장을 callback 전에 무조건 반영하는 단순 mock은 사용하지 않는다. 큐를 보류해 64개의 대기 요청 뒤 추가 요청이 busy이며 저장 호출이 없음을 검사한다.

```js
const a = h.patch('popup', [config('arrowSeek', false)]);
const b = h.patch('styles', [config('previewVolume', 25)]);
await h.finishStorageJobs(); await Promise.all([a, b]);
assert.equal(h.saved.config.arrowSeek, false);
assert.equal(h.saved.config.previewVolume, 25);
assert.equal(h.saved.settingsRevision, 2);
assert.equal(h.maxConcurrentWrites, 1);
```

`h`는 새 fixture의 `settingsHarness(t, stored)` 결과다. `patch(pageName, operations)`는 실제 listener와 유효 sender에 메시지를 전달한다. `finishStorageJobs()`는 보류한 각 단계만 해제하고 결과를 기다린다. 동일 필드 도착 순서, no-op 저장 0회, 요청 전체 거부의 부작용 0회, 실패 작업 뒤 다음 작업, unknown 보존도 검사한다. 종료 검사는 같은 저장 객체를 새 factory에 연결해 revision이 이어지는지 확인한다.

- [ ] **Step 2:** 새 broker/style suite를 실행해 직렬화·CSS 결과·기존 ID 보존의 실패를 확인한다.
- [ ] **Step 3:** 초기화와 모든 요청을 한 큐에 넣는다. 매 작업 차례에 네 키의 최신 값을 읽고 변경 키와 revision을 한 set으로 저장한다. legacy resizeChat true를 chat-resize로 이전하고 `t`는 Number 변환 결과가 sharpness의 유한한 허용 범위일 때만 이전한다. legacy 키 제거는 필요한 변경 저장 성공 뒤에 한다. 마이그레이션의 저장 read/write/remove 실패는 초기화를 실패시키고 사용자 write를 진행하지 않는다. 이후 worker 재시작으로 다시 시도한다. 반면 마이그레이션 성공 후의 초기 CSS 조회·등록 실패는 css.state failed로만 기록하고 initialize Promise는 resolve한다. 같은 worker에서 snapshot 조회·config-only 저장·명시적 빈 patch 재적용이 계속 가능해야 한다.
- [ ] **Step 4:** `getRegisteredContentScripts({ids:['styles']})` 후 소유 ID만 register/update/unregister한다. 실제 등록과 같으면 호출을 생략한다. config-only patch는 CSS 실패와 별개로 stored true를 응답한다. style/빈 patch는 최신 스타일 적용 후 응답하며 CSS 실패이면 stored true와 stage css를 구분한다. 자신의 storage 이벤트와 외부 이벤트는 최신 재조회 신호로만 취급한다. 동일한 최신 CSS 목록에 대한 실패 후 own-event/조회가 update/register를 자동 반복하지 않게 마지막 시도 목록을 기억한다. 명시적 style/빈 patch, 새로운 CSS 목록 또는 worker 재시작만 새 적용 기회를 준다. 실제 등록 조회로 이미 일치함을 확인한 경우는 별도 재등록 없이 ready다.
- [ ] **Step 5:** reload-target도 큐에서 최신 CSS 조정 후 `tabs.get(targetTabId)`로 안전 정수 ID·정확한 HTTPS CHZZK origin·캡처한 windowId를 확인해 `tabs.reload(targetTabId)`만 호출한다. read/등록/get/reload 각각의 오류를 명시적으로 반환한다. 실행 직전 검증 뒤 발생하는 사용자 이동까지 원자적으로 잠근다고 주장하지 않는다.
- [ ] **Step 6:** 부팅 read/write/remove 실패, CSS 지연/실패/소유 ID만 정리, config-only 저장, 빈 patch 재적용, 탭 삭제·사이트/창 이동·다른 창 활성화와 미등록 namespace를 검사한다. 첫 부팅 CSS 등록만 실패시키고 동일 broker에서 css failed snapshot → config-only patch stored true → 빈 patch CSS ready가 되는지 검사한다. legacy write 성공 뒤 remove를 보류·실패시킨 동안 사용자 write는 0회여야 한다. 마지막 실제 API에서 받은 코드와 호출 순서를 assertion으로 확인하고 저장된 값을 이전 객체로 rollback하지 않아야 한다. 해당 suite와 전체 tests를 통과시킨다.

```js
test('startup CSS failure leaves storage and retry available in the same worker', async t => {
  const h = settingsHarness(t, { styles: ['left-chat'] });
  h.failNextRegistration(); await h.initialize();
  assert.equal((await h.snapshot('popup')).snapshot.css.state, 'failed');
  assert.equal((await h.patch('popup', [config('arrowSeek', false)])).stored, true);
  assert.equal((await h.patch('styles', [])).css.state, 'ready');
});
```

fixture의 initialize와 snapshot은 실제 broker 초기화와 get-snapshot 요청을 호출한다. failNextRegistration은 Chrome 등록 경계의 다음 호출 한 번만 실패시킨다.
- [ ] **Step 7:** 새 broker/fixture/검사만 커밋한다. 메시지: `feat: 백그라운드 설정 저장과 적용 작업 직렬화`.

## Task 3 설정 클라이언트의 입력과 응답 순서

**Files:** Create `settings-client.js`, `tests/settings-client.test.cjs`. Task 2의 fixture를 재사용한다.

**Interfaces:** `var createSettingsClient = (chromeApi) => ({subscribe,edit,refresh,retryStyles,reloadTarget,discardPending,dispose})`. `subscribe(fn): unsubscribe`는 즉시 현재 View를 보낸다. `edit(operation): void`, `refresh(): Promise<void>`, `retryStyles(): Promise<Ack>`, `reloadTarget({tabId,windowId}): Promise<ReloadAck>`, `discardPending(): Promise<void>`, `dispose(): void`다. View는 `{snapshot,values,phase,css,pendingKeys,code}`이며 values는 최신 snapshot에 필드별 로컬 입력을 겹친 표시값이다.

- [ ] **Step 1: 실제 두 클라이언트와 broker를 연결해 실패 검사를 작성한다.** phase는 loading/ready/saving/failed/unknown/repair-required로 제한한다. 저장 이벤트 구독이 최초 조회보다 먼저 설치돼야 한다. 늦은 낮은 revision의 조회, 같은 revision 뒤 새로운 입력, 이전 ack, 최신 이벤트 뒤 늦은 조회를 따로 전달한다.

```js
a.edit(config('previewVolume', 10)); await h.holdPatchCallback();
a.edit(config('previewVolume', 20)); a.edit(config('previewVolume', 30));
b.edit(config('arrowSeek', false));
await h.releasePatchCallback(); await h.settle();
assert.equal(a.view().values.config.previewVolume, 30);
assert.equal(h.saved.config.previewVolume, 30);
assert.equal(h.saved.config.arrowSeek, false);
assert.equal(h.maxInflightFor(a), 1);
```

여기서 `a.view()`, `holdPatchCallback`, `releasePatchCallback`, `settle`, `maxInflightFor`는 fixture가 실제 구독 상태·메시지·callback을 관찰하는 API이며 클라이언트의 순서 알고리즘을 대신 구현하지 않는다.

- [ ] **Step 2:** client suite에서 최초 구독·단일 전송·새 입력 보존·응답 소실 검사가 실패하는 것을 확인한다.
- [ ] **Step 3:** 먼저 storage.onChanged local 구독을 설치한다. config/styles/styleParameters/settingsRevision 변경은 coalesced 최신 조회의 신호로 쓰며 옛 payload를 렌더링하지 않는다. revision, 조회 시작 세대와 로컬 필드 입력 세대를 비교한다. patch·빈 patch·reload-target은 하나의 변경 요청 슬롯을 공유하고 그 사이 입력은 필드별 최신 절대값으로 합친다. get-snapshot은 별도의 한 coalesced 조회로 관리한다. 알 수 없는 필드를 client에 노출하지 않는다.
- [ ] **Step 4:** stored true ack는 같은 입력 세대를 미저장 상태에서만 해제한다. 마지막 snapshot의 revision이 ack보다 낮다면 확인된 표시값은 별도 overlay에 유지하고 ack revision 이상 snapshot을 받은 뒤 제거한다. 더 새 로컬 입력은 계속 유지한다. partial ack만으로 snapshot 전체의 revision을 올리지 않는다. 이미 더 최신 snapshot을 적용했다면 오래된 ack로 값이나 CSS 상태를 되돌리지 않는다. no-op을 포함한 stored true마다 최신 조회를 요청한다. ack/retry 뒤 도착한 이전 조회는 응답 세대도 검사해 CSS 상태가 같은 revision에서 옛 실패로 되돌아가지 않게 한다.

확인할 테스트 이름은 `successful ack keeps the confirmed value until its snapshot arrives`, `no-op ack confirms without reverting the input`, `newer snapshot survives an older ack`, `old read cannot undo same-revision CSS retry`다. 첫 검사는 revision 4/volume 5 snapshot에서 10 입력을 저장해 revision 5 ack만 전달하고 이벤트·조회 응답은 보류한다. 즉시 View 값은 10, snapshot.revision은 4여야 하며 이후 revision 5 조회로 수렴한다. 경쟁 쓰기의 revision 6 snapshot을 먼저 준 뒤 revision 5 ack를 보내도 값과 CSS 상태는 revision 6 쪽이어야 한다.

```js
assert.equal(a.view().values.config.previewVolume, 10, 'stored ack cannot reveal old volume 5');
assert.equal(a.view().snapshot.revision, 4, 'partial ack is not a full revision 5 snapshot');
```
- [ ] **Step 5:** callback transport와 runtime.lastError를 처리한다. 응답 제한 10000ms를 두고 늦은 callback은 요청 토큰으로 거부한다. 응답 소실·실패 때 최신 조회는 할 수 있지만 실패 요청이나 보류 입력을 자동 재전송하지 않는다. 미저장 입력은 경고 표시와 함께 보류하고 사용자 새 입력은 해당 필드만 새 의도로 보낸다. `discardPending()`은 미전송 보류 입력만 버리고 최신 값을 다시 읽으며 이미 전송한 저장을 취소·rollback했다고 표시하지 않는다. `retryStyles()`는 빈 patch만 보내 최신 저장 스타일을 적용한다. pending/unknown/CSS 실패 중 reloadTarget을 허용하지 않는다.
- [ ] **Step 6:** commit 전·후 응답 소실, timeout 뒤 늦은 ack, busy/write 실패, 보류 중 재입력·취소, CSS stored true 실패, 폐기 후 callback 및 구독 해제를 검사한다. 에러 뒤 write 수가 자동으로 늘지 않아야 한다. 위 ack 네 가지 순서 검사도 통과해야 한다. client/broker suite와 전체 tests를 통과시킨다.
- [ ] **Step 7:** 모듈과 검사만 커밋한다. 메시지: `feat: 설정 화면의 필드별 입력과 늦은 응답 보호`.

## Task 4 실제 화면과 백그라운드 entry point 연결

**Files:** Modify `background.js`, `popup.js`, `styles.js`, `popup.html`, `styles.html`, `popup.css`, `styles.css`, `manifest.firefox.json`, `_locales/ko/messages.json`, `_locales/en/messages.json`, `scripts/check-package.mjs`, `tests/background.test.cjs`, `tests/settings-ui.test.cjs`, `tests/package.test.cjs`. Create `tests/settings-multi-ui.test.cjs`, `tests/settings-load-order.test.cjs`.

**Interfaces:** Task 2 broker를 background에, Task 3 client를 popup/styles에 연결한다. 기존 capabilities·footer·권한 확인은 유지한다. 스타일 링크 query는 `targetTabId`, `targetWindowId`이며 양쪽 ID가 유효하지 않으면 대상 없음이다.

- [ ] **Step 1: 기존 전체 객체 저장을 쓰는 UI 두 개의 대조 실패를 먼저 확인한다.** 둘이 같은 초기 config를 읽고 a의 arrowSeek false 뒤 b의 previewVolume 25를 저장하면 두 값이 남아야 한다. 스타일 UI 두 개에서 left-chat/hide-studio도 같은 방식으로 검사한다. 이전 UI suite의 필드 보존 assertion을 유지하되 매 write가 25필드 전체를 backfill한다는 구현 의존 assertion은 제거한다.

```js
test('two actual popup documents retain different field changes', async t => {
  const h = settingsHarness(t, {});
  const a = await h.openUi('popup'), b = await h.openUi('popup');
  input(a, 'arrowSeek', false); await h.settle();
  input(b, 'previewVolume', 25); await h.settle();
  assert.equal(h.saved.config.arrowSeek, false);
  assert.equal(h.saved.config.previewVolume, 25);
});
```

fixture의 `openUi(pageName,{locale='ko',target}={})`는 실제 HTML과 entry script를 로드한 `{dom}`을 반환한다. `input(ui,id,value)`는 실제 checkbox/range에 값을 넣고 해당 DOM event를 보내는 로컬 테스트 helper다. 설계 알고리즘이나 저장 병합을 대신 수행하지 않는다.
- [ ] **Step 2:** popup/styles의 실제 HTML과 코드, 실제 client와 broker를 공유 fixture로 연결한다. `chrome.storage.local.set`의 직접 UI 호출이 없고 operation 메시지만 나가는지 검사한다. 늦은 조회·빠른 슬라이더·서로 다른 체크박스·한영 오류 상태·소실된 응답은 실제 input과 status DOM으로 확인한다.
- [ ] **Step 3:** Chrome classic worker는 background 시작에서 `importScripts('config.js','style-schema.js','settings-contract.js','settings-broker.js')`를 수행한다. Firefox scripts는 그 순서 뒤 background.js이며 Firefox에서는 importScripts를 재호출하지 않는다. listener를 동기로 등록하고 즉시 broker.initialize를 시작한다. onInstalled/onStartup은 중복 초기화 없이 현재 등록 조정·권한 확인을 요청한다. 기존 initConfig/registerStyles 직접 쓰기·전체 등록 해제를 제거하고 legacy 회귀 검사를 새 broker 계약으로 옮긴다.
- [ ] **Step 4:** popup HTML은 config→style-schema→settings-contract→settings-client→popup, styles HTML은 config→style-schema→settings-contract→settings-client→styles 순서다. STYLES 중복 목록을 styles.js에서 제거한다. 최초 snapshot 전에는 입력을 비활성화하며 실제 View를 구독해 모든 input을 edit로 보낸다. 슬라이더 표시와 warning은 즉시 갱신한다. 두 화면에 aria-live 저장 상태와 미전송 변경 취소를, styles에 명시적 CSS 재적용과 전역 설정·다른 탭 새로고침 안내를 넣는다. 한국어와 영어의 저장 중/성공/실패/불명/복구 필요·CSS 실패·대상 없음/변경 문구를 모두 제공한다.
- [ ] **Step 5:** popup을 열 때 `tabs.query({active:true,currentWindow:true})`를 한 번 호출해 안전 정수 id/windowId와 origin을 캡처한다. 그 Promise를 capabilities와 스타일 링크가 공유한다. 캡처가 끝나기 전 스타일 링크의 기본 이동을 막고 aria-disabled로 표시한다. 완료 후 캡처한 ID를 href에 넣고 활성화하며, 캡처 실패는 명시적 대상 없는 링크로 활성화한다. styles는 십진 정수 query만 허용하고 대상 없는 단독 화면도 전역 설정 저장은 가능하게 한다. reload 버튼은 전송/불명/CSS 실패 중 비활성화하며 클라이언트 reloadTarget을 통해 명시적 원래 대상에만 적용한다. CSS 목록 변화가 없고 font 값만 nonzero 사이에서 바뀌면 불필요한 reload 요구를 하지 않는다. tabs.query를 보류한 채 링크를 클릭해 이동이 없고, 최초 캡처 응답 뒤 href에 해당 ID만 담기는 DOM 검사를 추가한다.
- [ ] **Step 6:** CSS 등록 보류 중 reload 0회, 저장 후 CSS 실패 표시, 재적용 성공 뒤 reload(id) 1회, 다른 활성 창·삭제·URL/창 이동·단독 화면·잘못된 query, 다른 등록 ID 보존을 DOM/실제 API 호출로 검사한다. 두 설정 UI의 서로 다른 입력 모두 보존돼야 한다. package checker는 classic worker의 프로젝트 소유 literal importScripts 목록도 resolveFile로 확인하고 누락된 settings-broker.js를 거부해야 한다. JavaScript를 checker에서 실행하거나 computed import를 임의 추측하지 않는다. 실제 Chrome worker 로드 fixture와 Firefox 순차 scripts fixture에서 공통 파일 순서와 listener 등록을 확인한다. `node --test tests/*.test.cjs` 뒤 두 브라우저 build와 package check를 실행한다. 등록 직전 target 검사와 실제 reload 사이의 이동 race는 별도 한계로 기록한다.
- [ ] **Step 7:** 위 제품 파일과 해당 검사만 커밋한다. 메시지: `feat: 팝업과 스타일 화면을 직렬 설정 저장 경로로 전환`.

## Task 5 페이지 복원과 최종 설치본 회귀

**Files:** Modify `web/main.js`, `tests/bridge.test.cjs`, `tests/runtime.test.cjs`; Create `tests/multi-page-settings.test.cjs`, `docs/superpowers/validation/2026-10-11-multi-window-settings.md`.

**Interfaces:** 콘텐츠 페이지에는 Task 3의 쓰기 client를 로드하지 않는다. 기존 getConfig(true)를 읽기 경계로 쓰고 MAIN의 `cheese-knife` handshake·페이지별 증가 revision과 공개된 config 모양을 유지한다. 설정 broker namespace는 MAIN 브리지에 연결하지 않는다.

- [ ] **Step 1:** A의 오래된 읽기를 보류하고 B에서 config/font를 바꾼 뒤 persisted pagehide/pageshow와 이벤트 전달 순서를 뒤섞는 실패 검사를 작성한다. A 복원은 최신 값이어야 하며 오래된 Promise의 값은 적용되지 않아야 한다. 실제 새 설정을 받는 독립 두 runtime에서 한쪽 종료·다른 쪽 재생 진행을 검사한다.

```js
test('BFCache restoration rejects the read from before newer settings', async t => {
  const h = await bridgePair(t);
  const oldRead = h.holdReadA();
  h.freezeA(); h.setStored({ config: { preview: false }, styleParameters: { 'chat-font-size': 0 } });
  h.restoreA(); await h.settle();
  oldRead.resolve({ config: { preview: true }, styleParameters: { 'chat-font-size': 8 } });
  await h.settle();
  assert.equal(runtime(h.A).config.preview, false);
  assert.equal(h.A.window.document.documentElement.style.getPropertyValue('--knife-chat-size-1'), '0px');
});
```

`bridgePair(t)`는 이 task의 테스트 helper로 실제 web/main.js와 runtime.js를 두 DOM에 로드한다. holdReadA는 이전 세대의 실제 get 호출 완료를 보류하며 freezeA/restoreA는 persisted PageTransitionEvent를 보낸다. setStored는 공유 저장 경계만 바꾸고 MAIN 전송은 기존 bridge fixture의 같은-window message 경계만 대체한다.
- [ ] **Step 2:** bridge/multi-page suite에서 기존 고정 configPromise로 인한 복원 stale 실패를 확인한다.
- [ ] **Step 3:** 최초 storage 구독 뒤 읽기를 시작하고, 새 설정 이벤트와 BFCache pageshow는 최신 getConfig(true) 조회를 요구한다. 읽기 세대로 늦은 결과를 버리고 필요한 최신 조회만 합친다. persisted pagehide는 진행 중 읽기 토큰을 무효화하고 복원 시 새 조회를 한다. final pagehide는 구독을 정리한다. 새로운 parameter 값이 없거나 잘못됐을 때 기존 `--knife-chat-size-1/2/10/20` 소유 속성도 제거해 이전 offset이 남지 않게 한다. stale 저장 이벤트 payload를 새 진실로 직접 적용하지 않는다.
- [ ] **Step 4:** 초기 ISOLATED/MAIN 순서 두 경우, 복원 중 이벤트, 음소거/오디오 자원 독립성, 전역 preview/livePreview OFF에 대한 각 페이지의 비동기 취소, font reset, late read와 final disposal을 검사한다. bridge·기존 media/lifecycle suite와 전체 tests를 통과시킨다.
- [ ] **Step 5:** 사용 중인 Node 경로로 syntax 검사, 전체 tests, `scripts/build.mjs`, `scripts/build.mjs --firefox`, `scripts/check-package.mjs dist`, `scripts/check-package.mjs dist-firefox --firefox`를 실행한다. Windows realpath/fixture 제한에 따른 재실행은 도구 승인을 사용하고 코드 오류로 숨기지 않는다. 사용자 새로고침이 필요하면 그 단계에서 멈춘다. Chrome MV2 warning이 새 패키지에 없는지 확인하며 기존 과거 로그와 구분한다.
- [ ] **Step 6:** 사용자 원래 설정을 기록한 뒤 두 popup/styles 문서에서 다른 필드와 같은 필드, font 0/8, 빠른 슬라이더, 다른 활성 창의 원래 대상 적용, 두 방송 창·한쪽 종료를 실검사하고 복원한다. 두 창은 포커스 보정을 끄고 실제 visible을 확인한다. 가능한 경우 worker 재시작과 BFCache를 별도 실검사하며 persisted 복원이 관찰되지 않거나 확장 설정 문서/worker 제어가 불가능하면 자동 fixture 통과로 대신 인증하지 않고 미검증으로 남긴다. 크롬 사용자 프로필이나 전체 프로세스를 강제로 종료하지 않는다.
- [ ] **Step 7:** 실제 결과와 실패/미검증 항목을 validation 문서에 남긴다.
- [ ] **Step 8:** 기준 HEAD 이후 이 계획의 설정·브리지 변경만 Astra max의 독립 검토에 보낸다. HLS 후보나 기존 별도 후속 변경의 전체 검토 완료로 확대하지 않는다. Critical/Important를 해결하고 최신 검증을 재실행한다.
- [ ] **Step 9:** bridge·테스트·검증 문서만 커밋한다. 메시지: `fix: 페이지 복원 시 최신 설정과 독립 미디어 상태 유지`.

## 자체 검토와 실행 인계

설계의 요청·순서·수명·CSS·대상 적용 계약은 Task 1~4, 페이지 복원·독립 미디어는 Task 5에 대응한다. Review Focus의 다섯 조건은 각 task의 실패 검사에 포함했다. helper는 실제 생산 모듈·DOM을 실행하고 Chrome 저장·전송·등록의 외부 경계만 보류한다. 전체 객체 저장 대조군의 변경 유실을 해결 후 같은 검사로 반증한다.

단계별 커밋은 지정한 파일만 stage하고 기존 HLS 후보나 사용자 변경을 포함하지 않는다. 중간 Task 1~3은 entry point에 연결하지 않아 기존 UI 직접 쓰기와 새 broker가 혼재한 제품을 배포하지 않는다. 등록 가능한 CSS 상태, 저장 성공, 페이지 적용, 실제 Firefox 설치 확인은 서로 다른 합격 기준이다.

실행 방식은 아직 선택되지 않았다. 계획 검토 후 Native 또는 Subagent-driven을 선택한다. 이 계획은 단계 간 계약이 촘촘한 5개 작업이므로 동일 세션 Native 구현과 마지막 Astra max 독립 검토를 권장한다. 더 촘촘한 단계별 독립 구현·검토가 필요하면 Subagent-driven을 선택할 수 있다. 계획 작성·검토는 실제 구현과 PR·스토어·릴리즈 승인으로 확대하지 않는다.

API 계약은 [runtime](https://developer.chrome.com/docs/extensions/reference/api/runtime)의 sender와 callback, [scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting)의 소유 등록 조회·갱신, [tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs)의 대상 ID 조회·reload를 기준으로 한다. 실제 최소 버전과 Firefox 로드는 위 실행 fixture·패키지 확인 및 가능한 설치본 검사로 구분한다.

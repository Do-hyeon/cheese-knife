# F00 별도 미디어 설정 탭 구현 계획

> **에이전트 실행 규칙:** 기존에 선택한 Native 방식으로 superpowers:executing-plans를 사용한다. 주 작업자가 순차 구현하며 마지막에 새 Astra max 검토자 한 명이 F00 전체를 검토한다. 아래 작업1–3은 원래 Task5A–5C에 대응한다. 원래 Task5/6의 저장 보존·종합 검증도 마무리해야 하며 공개는 하지 않는다.

**목표:** 문서 인증을 약화하거나 사용자 입력·저장 데이터를 잃지 않고 실제 확장 설정 탭에서 채널 설정·프리셋을 편집한다.

**구조:** popup.html/popup.ts와 기존 두 client를 재사용한다. 툴바는 v1 전역 설정과 명시적인 탭 열기 버튼만 제공한다. 미디어 모드에서만 v2를 사용한다. broker/schema/권한은 유지하며 읽기 확인과 미전송 입력의 전송을 분리한다.

**기술:** 기존 strict TypeScript/classic 생성기, Chrome MV3 최소121, Node24.19.0/TypeScript7.0.2/esbuild0.28.2/Playwright1.62.1, JSDOM·폐기 가능한 번들 Chromium. 새 의존성 없음.

**명세:** [승인된 탭 보완 설계](../specs/2026-10-14-f00-media-settings-tab-design.md), 목업/UI·명세·툴바→탭 수용기준 승인2026-10-14. [원래 F00 설계](../specs/2026-10-14-f00-channel-media-settings-design.md)는 명시한 UI 변경 이외에는 유지한다. [설계 검토](../validation/2026-10-14-f00-settings-tab-design-review.md)의 최초0/5/1·6항목 확인은 제품 검증 성공이 아니다.

**상태:** 사용자 상세 계획/기존 Native 실행 승인2026-10-14. 입력 소스870637e, 브랜치 codex/f00-channel-media-settings. [새 계획 검토](../validation/2026-10-14-f00-settings-tab-plan-review.md)의 최초 Critical0/Important3/Minor1·4항목 보완 확인 완료. 사용자의 요청에 따라 영어 서술을 한글로 옮겼으며 승인된 인터페이스·수치·시험·중지 조건은 유지했다. 원래 Tasks1–4 완료는 다시 실행하지 않는다. 이 계획과 원래 Task5/6·설치 보존·F00 전체 최종 검토는 아직 미완료다.

## 공통 제한

- 채널별 범위는 compressorDefault/Threshold/Knee/Ratio/Attack/Release와 brightness/contrast/saturation/gamma/sharpness뿐이다. Gain/EQ/노멀라이저는 F01, 나머지는 전역이다.
- 제품/package/manifest2.13.3, Chrome 최소121·Chrome만 지원. 기존 scripting/storage 및 https://chzzk.naver.com/* 권한 유지. tabs/history/cookies/identity 권한·원격 코드·전송·web_accessible_resources 추가 없음.
- 전역4키와 mediaProfiles schema1 유지. 최대128채널/64프리셋, 이름48 Unicode code points/192 UTF-8 bytes, key+JSON256KiB. 기존 필드 기본값·범위·토큰·revision 상한 유지.
- 실제 sender URL/id/frame·sender.documentId·getContexts의 정확한 문서/origin/incognito·current 대상 id/window/origin/channel 검증을 commit 직전까지 유지한다. 필요한 사실이 없으면 거부한다. query/URL/가짜 active 탭으로 문서 인증을 대신하지 않는다.
- 시크릿 미디어 쓰기 금지, 시크릿에서 일반 창으로 대신 열기 금지. 전역 v1/CSS/legacy 동작은 독립 유지한다.
- query는 표시·선택 의도이지 권한이 아니다. search512자 이하/빈 hash/정확한 key, ID는 canonical 10진수16자리 이하 safe integer, channel은 lowerhex32. 대상 없음·스타일 pair·현재 채널 triple만 허용한다.
- 시청 Chrome/P09/root dist·private 감사·원본 ZIP/CRX·보호 브랜치 변경 금지. 빌드/시험은 물리 격리 후보만 사용한다. 원래 dist/게시 payload58·F00 후보59 유지.
- 승인 요청 문서는 한글, 코드 식별자·명령·시험 이름은 원문 유지. 실제 채널/문서 ID·프리셋 이름·카탈로그를 로그/공개 산출물로 남기지 않는다. 계정/쿠키/콘텐츠/방문 기록 수집 없음.
- push/PR/병합/버전/릴리즈/스토어 작업 금지. 현재 승인 범위의 로컬 체크포인트만 허용하며 Task/문서 전용 PR을 만들지 않는다.

## 파일·인터페이스 책임

| 담당 | 위치 | 책임 |
| --- | --- | --- |
| UI/대상 | src/settings/popup.ts, popup.html, popup.css, ko/en locales | 진입/모드/parser/대상 고정·폼/레이아웃 재사용·확인/복구/수명주기 |
| client 복구 | src/settings/client.ts | 조회가 입력을 자동 전송하지 않게 분리. 불명 patch는 unknown. transport/queue/schema 유지 |
| 단위 시험 | tests/settings-fixture.cjs, media-ui/media-client/settings-ui/settings-multi-ui/settings-style-apply.test.cjs; 새 tests/media-settings-tab.test.cjs | 실제 표면별 Chrome fixture·query·API·부정 경계 |
| 설치 검증 | scripts/extension-e2e/popup-cdp.mjs, harness.mjs, check-installed-extension.mjs, check-installed-transition.mjs; installed-popup-cdp/extension-runner/harness/transition-child/runner 및 새 installed-media-tab.test.cjs | strict helper·실제 호출자/session/종료·production 사실 검증 |
| 생성물 | popup.js, settings-client.js, tests/fixtures/f00-runtime-executable.json | 현재 생성물/pin만 갱신. 역사 기준 유지 |
| 남은 통합 | 원래 Task5/6 파일·명령 | 저장4관측·손실 부정 대조·개인정보·패키지·전체 검토 |

## 검토 초점

1. 열기 전 A→B/창 전환에서도 B로 재지정하지 않으며 VOD 스타일 pair는 탭→styles까지 유지한다. 작업1.
2. query 없는 own 탭/iframe이 툴바를 가장해 다른 방송을 찾지 않는다. 작업1.
3. ACK 유실+새 미전송 입력은 값 일치 인증·읽기 중 전송 없이 보존한다. 작업2.
4. 전역 표시2/v2 이전값1 지연 중 프리셋1을 만들지 않고 정상 v1 편집은 유지한다. 작업2.
5. 확인 중 경합·폐기 문서 복원은 오래된 의도를 실행하거나 편집 가능한 ready로 표시하지 않는다. 작업2/3.

## Task 1: 설정 탭 재사용과 원래 대상 고정 (Task5A)

**파일:** 위 UI/대상·단위 fixture. 새 제품 entry/module/HTML 페이지 없음.

**인터페이스:** popup 내부 `readMediaLocation(url:URL):{mode:'global'|'media';target:{tabId:number;windowId:number;channelId:string|null}|null;code:string|null}`, `validateCapturedTarget(target):Promise<chrome.tabs.Tab|null>`, `openMediaTab():Promise<void>`. 전역 export나 메시지 권한을 만들지 않는다. global 모드의 실제 툴바/일반 own 탭은 tabs.getCurrent로 구분하되 저장 인증 근거로 사용하지 않는다.

대표 RED 시험 이름 `toolbar keeps global edits without media bootstrap`:

```js
const h=settingsHarness(t);
const {dom}=await h.openUi('popup',{surface:'toolbar'});await h.settle();
assert.equal(dom.window.document.getElementById('media-controls').hidden,true);
assert.equal(h.messages.some(entry=>entry.message.protocol===2),false);
assert.equal(Object.hasOwn(h.saved,'mediaProfiles'),false);
```

- [ ] RED: 새 media-settings-tab 시험. 툴바 media UI 숨김/protocol2 요청0/신규 키 없음/자동 탭0이면서 v1 brightness 저장 가능. 일반 own 탭은 tabs.query0/대상 없음. iframe 편집·media 시작0. 비정상/중복 mode는 media 시작0, 정상 mode+비정상 target은 global/saved만 허용·current/styles 대상 제한·오류 안내.
- [ ] RED: 정확한 대상 없음/pair/triple, 중복/부분/음수/leading-zero/overflow/hash/unknown-key/search513. 캡처 A 뒤 B 이동은 current 거부·B 채택0. VOD pair/current 제한/원래 VOD styles reload, 창/origin/닫힘/incognito 사실 부재 거부·다른 창 focus에도 원래 ID 유지.
- [ ] 후보에서 `node --test tests/media-settings-tab.test.cjs tests/media-ui.test.cjs tests/settings-ui.test.cjs tests/settings-style-apply.test.cjs` 실행·예상 실패 확인.
- [ ] 정확한 parser·top-frame 검사 구현. tabs.getCurrent가 정상 undefined일 때만 실제 툴바의 tabs.query({active:true,currentWindow:true})1회. API 오류는 툴바 fallback이 아니다. query 없는 own 탭은 v1만 유지하고 다른 active 탭을 찾지 않는다. media 모드는 기존 v2 broker 인증 그대로 사용한다.
- [ ] 원래 raw tab의 safe id/window/incognito 캡처. CHZZK origin은 style pair, live/canonical은 channel 추가. 캡처 후 버튼 활성화. 클릭 시 chrome.windows.get의 동일 창/nonincognito 확인 후 tabs.create({windowId:capturedWindowId,url:ownURL})1회. 열기 중 버튼 잠금, 자동 재시도/다른 창 fallback 없음. 새 탭에서 원래 tuple 재검증·채널 재추론 금지. 비CHZZK 정상 창의 targetless 열기는 유지.
- [ ] 기존 style 링크 유지. 툴바350px, 미디어 탭만 scope/audio+video/preset·반응형 배치. 목업에서 생략한 기존 전역 항목을 제거하지 않는다. label/status/focus/키보드 보존, UI/registry 중복 없음.
- [ ] fixture에 tabs.getCurrent():Promise<FixtureTab|undefined>, windows.get(id):Promise<{id:number;incognito:boolean}>, create 기록 추가. FixtureUiOptions.surface?:'toolbar'|'tab', apiFor(name,options?:{surface;documentUrl})가 실제 표시 URL/표면 sender를 transport에 연결한다. openUi는 정확한 DOM URL 전달. 툴바 sender.documentId 없음/own TAB 문서 token·query 포함 context. 순수 broker/client fixture의 명시 TAB은 유지하되 툴바를 가짜 인증 TAB으로 기본 처리하지 않는다. media UI 시험만 media TAB을 명시한다.
- [ ] 동일 집중 시험 GREEN·fixture typecheck·생성 drift 확인. 원래 broker 부정/닫힌 큐/게시 fixture 유지.

## Task 2: 조회 전용 복구와 안전한 설정 동작 (Task5B)

**파일:** src/settings/client.ts, popup.ts/HTML/locales, media-client/UI/multi-UI 시험. 기존 생성기로 client/popup 재생성.

**인터페이스:** refresh():Promise<void>, editFields/perform/discardPending/selectScope/dispose 유지. 조회와 dirty 전송을 분리하고 명시 편집/perform·확정 성공 ACK만 정상 전송을 이어간다. UUID/토큰/세대별 미전송 입력 보존. 새 protocol/replay log/session/자동 retry API 없음.

대표 RED 시험 `lost patch ACK read-back holds newer draft without dispatch`:

```js
const {h,c}=await enabled(t),gate=h.holdNext('callback:patch-channel-fields');
c.editFields('audio',{compressorRatio:7});await gate.reached;
c.editFields('audio',{compressorRatio:5});gate.fail();await h.settle();
await c.refresh();await h.settle();
assert.deepEqual(h.messages.filter(e=>e.message.action==='patch-channel-fields').map(e=>e.message.patch.compressorRatio),[7]);
assert.equal(c.view().phase,'unknown');assert.equal(c.view().values.audio.compressorRatio,5);
assert.equal(h.saved.mediaProfiles.channels[0].audio.values.compressorRatio,7);
```

- [ ] RED: 기존 자동[7,5] 기대를 위 계약으로 교체. patch7 ACK 유실/새 입력5 뒤 event+refresh는 요청[7]/저장7/표시draft5·불명 상태/범위 이동 제한. 현재 값7 일치도 과거 patch 인증이 아니다. 무관한 storage event/epoch-stale read에서도 읽기 중 쓰기0.
- [ ] RED: 프리셋 생성 ACK 유실 뒤 UI 조회는 원래 UUID/name/values/token·create1회를 보존. 독립 생성 근거가 있는 경우만 확정, 수정/재생성/값만 같은 patch는 unknown. 생성 확인 뒤 더 새 dirty는 held·자동 전송 없음. 폐기는 표시 의도만 제거하며 재편집은 최신 snapshot/token의 새 요청이다.
- [ ] RED: 표시 brightness2/v2 이전1 지연 시 생성0, 최신값 수용 뒤 preset2. 양쪽 post-write read를 모두 잡고 ACK만 도착시킨 ready/pending0/두 이전 snapshot1/revision 일치 상황도 생성0. 채널 확정값/상속 globalRevision 확인. pending/손상/auth 실패에도 정상 v1 편집 유지.
- [ ] RED: reset-domain/delete-channel/delete-preset 취소는 요청/쓰기0, 확인은 캡처한 의도로1회. 확인 callback 중 revision/수정/reset/재생성/scope/target 경합은 conflict/차단이며 새 토큰 대체·자동 retry 없음. 다른 도메인/전역/복사한 값 보존. confirm stub는 각 시험에서 명시한다.
- [ ] `node --test tests/media-client.test.cjs tests/media-ui.test.cjs tests/settings-multi-ui.test.cjs tests/media-settings-tab.test.cjs`로 RED 확인.
- [ ] refresh의 수용/조회에서 flush 제거. patch-channel-fields의 값 일치 성공 확정 제거. 생성 확인은 원래 UUID/완전한 의도·expectedMediaRevision+1 생성 token/domain binding을 확인하며 근거 없으면 unknown. boot/event/명시 refresh/scope/discard는 쓰기0. 이미 진행 중인 read도 ACK 뒤 dirty를 전송하지 않는다. 정상 명시 편집·확정 ACK는 자기 세대만 전송한다.
- [ ] 생성 확인 뒤 새 dirty가 있으면 확정된 세대만 제거하고 기존 failed/code draft-held로 보존. UI는 pendingRequest 또는 pendingKeys가 있으면 draft를 표시한다. 폐기 뒤 최신 token으로 사용자 재편집/perform이 재적용 경로이며 별도 replay 버튼/엔진 없음.
- [ ] media-refresh는 조회만, media-discard는 독립 폐기. 전역 프리셋은 선택 도메인의 표시 globalView.values.config[id]와 snapshot.config[id] 전부 일치 + ready/pendingKeys0 + v1/v2 globalRevision 일치 후 snapshot 값을 복사/검증한다. ACK overlay도 검사한다. 채널은 표시/확정 scoped 도메인·selection/dirty0, 상속 시 global revision 대조. render와 클릭 handler가 같은 gate를 공유·재검사한다. 기존 mutation gate 유지.
- [ ] native confirm 전에 불변 request 캡처, 이후 현재 scope/readiness 재검사. 대상·도메인·프리셋과 영향 안내, 취소 dispatch0·자동 token 갱신 없음. 최종 권한/대상/token은 worker가 검증한다.
- [ ] 집중·UI/client 부정 시험 GREEN. UI 보완을 위해 broker 권한/schema를 바꾸지 않는다.

## Task 3: 폐기 문서 복원 제한과 실제 탭 검증 (Task5C)

**파일:** popup.ts/HTML/CSS/locales·탭 시험, 위 설치 helper/runner/IPC 시험·현재 생성물 pin. 원래 Task5/6 통합도 이어간다.

**인터페이스:** UI 내부 retireSettingsDocument():void, showReconnectionRequired():void. 제품 lifecycle framework 없음. 이미 strict 검사되는 popup-cdp.mjs에 openInstalledMediaSettings({context:BrowserContext,worker:Worker,fixturePage:Page,extensionId:string,browserSession:PopupBrowserSession,timeoutMs?:number}):Promise<{settingsPage:Page;popupAttached:true;tabWriterQualified:true}>를 JSDoc 타입과 함께 구현하고 harness는 재export만 한다. helper는 빌린 session의 자기 observer/attachment만 제거하며 살아 있는 Page를 반환하고 browser를 닫지 않는다. 전체 기본15초/개별min(8초,남은 deadline), timeout은 positive safe integer≤15000. 기존 attachment8000 제한 유지.

대표 RED 시험 `restored disposed settings document cannot keep ready editors`:

```js
const h=settingsHarness(t),{dom}=await h.openUi('popup',{surface:'tab',query:'?mediaSettings=1'});await h.settle();
dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide',{persisted:true}));
dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow',{persisted:true}));
assert.equal(dom.window.document.getElementById('brightness').disabled,true);
assert.notEqual(dom.window.document.getElementById('settings-status').dataset.phase,'ready');
```

- [ ] RED: persisted pagehide→pageshow는 전체 편집 disabled/ready0·마지막draft/결과 불명 보존·후속 쓰기0. 최초 pageshow는 정상. 명시 reload 취소0/확인은 own location.reload1회·방송 tabs.reload0. 늦은 callback이 편집을 되살리지 않으며 listener/transport는1회 정리. 전역 pending/media unknown 각각 검사.
- [ ] RED helper: 정확한 own toolbar/context·중복 TAB/timeout/필수 문서 사실 부재/숨김·disabled·label 없는 버튼/닫힘·열기 오류/무관한 새 Page/query 불일치/cleanup 오류. Page 발견 전 실제 요청은 buffer로 연결된다. observer는 popup 전, discovery는 클릭 전. 기본15초가 attach≤8초로 동작하고 남은 시간0이면 거부. 이는 경계 단위 시험이지 실제 Chrome 성공이 아니다.
- [ ] RED 상위 소유자: 정확한 qualification 옵션·기본 없음 기존 의미·Browser/session 부재·ACK/disconnection/root0 각각 누락·context.close-only는 실패/프로필 보존. dirty source는 launch 전 거부. media IPC는3개 close 사실 없으면 다음 launch 거부, config IPC 그대로. 준비 worker 누락/observer 정리 실패 포함.
- [ ] `node --test tests/media-settings-tab.test.cjs tests/installed-popup-cdp.test.cjs tests/installed-media-tab.test.cjs tests/installed-extension-harness.test.cjs tests/installed-extension-runner.test.cjs tests/installed-transition-child.test.cjs tests/installed-transition-runner.test.cjs tests/development-types.test.cjs` 실행.
- [ ] pagehide는 마지막 view 보관·dispose·편집 영구 잠금. persisted 복원은 재연결 필요/read-only snapshot·미전송 의도·결과 불명 안내. settings-reconnect는 draft 소멸/이미 commit됐을 가능성을 native confirm으로 알린 뒤 own location.reload만 실행한다. 자동 초기화/재전송/rollback 없음. 모든 renderer/callback에서 잠금 유지.
- [ ] 준비된 실제 worker observer 등록 완료를 popup 열기 전에 기다린다. 진짜 첫 v1/v2 production sender를 관측하되 응답/intercept/변조/probe 요청 없음. worker memory 최대16 metadata 관측, overflow/필수 부재 실패. 문서 URL/ID는 private binding에만 사용. 클릭 전에 bounded Page discovery·fixture routing 등록. 먼저 온 요청도 수용하고 finally 자기 observer/listener 제거.
- [ ] fixturePage를 앞으로 가져오고 실제 own popup/같은 browserContext ID를 worker action.openPopup으로 연다. 툴바 v2 요청0. 실제 v1/POPUP 사실을 읽고 버튼 visible/enabled/label/rect/focus 확인 후 공개 CDP Input mouse event로 클릭한다. 기존 Page를 제외한 새 own query TAB1개/원래 tuple/context 확인. 그 Page의 실제 chrome.tabs.getCurrent id와 buffer sender.documentId의 CURRENT getContexts TAB/frame0/정확한 URL/origin/nonincognito/tabId를 대조한 뒤 입력한다. 같은 URL의 다른 문서를 대신 쓰지 않는다. v1/v2 ready·조작 가능 확인 후 locator.click/fill·저장 변경/복원 관측. 실패는 STOP이며 가짜 tabs.query/direct storage 성공/선생성 TAB/직접 navigation/URL 인증으로 대체하지 않는다.
- [ ] 기존 parseInstalledE2EArgs/runInstalledExtensionE2E에 정확한 선택 옵션 --qualification=media-tab 추가. 중복/미지원 값 거부·없는 경우 return/report/기존 scenario 불변. 전용 media scenario에서 helper 사용. verifyCandidate/checkPackage/owned output/profile/fixture router·refreshTransitionWorker(새 소유 프로필만) 재사용. routed fixturePage 생성 후 context.browser()가 null이면 실패, 공개 browser.newBrowserCDPSession·fixturePage CDPSession을8초 내 획득해 실제 browserContextId 확인. 상위 runner가 session을 소유하고 살아 있는 TAB에서 저장/복원·두 화면 검증. private/dirty 후보 스크립트를 실행 수용 경로로 쓰지 않는다.
- [ ] TAB routing은 클릭 전·POPUP 관측/차단은 attach 뒤. 초기 navigation 간격을 완전 egress 보호로 주장하지 않는다. 상위 qualification owner가 trace/자원 정리·공개 Browser.close ACK·disconnection·native-profile.mjs queryWindowsProcesses의 정확한 owned profile root0를 기록한 다음 잔여 context.close를 호출한다. Windows 로컬 강화 게이트이며 다른 플랫폼은 미지원/실패, 기본 교차 플랫폼 시험은 그대로. 사실 누락/cleanup 오류면 실패·프로필/artifact/candidate 보존, 광역 kill/delete 없음. 공개 report는 boolean/code/hash/count만 기록. helper가 정상 종료를 인증하지 않는다.
- [ ] 원래 media-preservation의 매 occurrence child가 자기 공개 session을 소유하고 media close-success 전 같은3개 close gate 확인. first-new에서 helper에 빌려주며 seed/old/rollback은 원래 UI 유지. media close packet/result에 정확한 proof boolean3개를 넣고 parent가 다음 launch/ACK 전에 확인한다. config 모드 변경 없음. 미지원 플랫폼을 성공 skip하지 않는다. 원래 supervision/선행 종료/손실 control 경계 유지.
- [ ] helper는 기존 tsconfig.development의 popup-cdp 엔트리/JSDoc 타입으로 strict 검사한다. legacy runner/harness 전체가 strict라고 주장하지 않는다. 기존 development-types compiler probe에 잘못된 context/session/timeout/result 소비 부정 사례를 추가하되 원래 config/files/misuse·제품/설정4개 type project 유지. runner/adapter는 위 실행 단위/IPC 부정·Windows 실제 검증으로 확인.
- [ ] GREEN 단위/type/generation. 후보에서 기존 생성기를 실행·현재 active pin만 갱신. 후보59/exact names·역사 fixture/root dist 불변. 실행 승인 후 clean 로컬 source checkpoint와 물리 clean clone으로 실제 qualification. dirty 복사는 attestation이 아니다. 실패는 보완/new checkpoint/재실행이며 이전 HEAD로 대체하지 않는다.
- [ ] 새 owned F00 Chromium 프로필 실제 시험: toolbar→TAB, current 저장/복원·대상 없음/global/saved·VOD 스타일 pair·같은 확장의 두 TAB 독립 필드. 최초 전역·사용자 명시 도메인 활성화. confirm/키보드/좁은 화면은 별도 측정, 합성 BFCache는 실제 extension 복원 증거가 아니다.
- [ ] qualification 성공 후 원래 Task5 media-preservation/seed+관측0..3/control occurrence4·개인정보/안내 재개. 새 코드 편집은 TAB으로 바꾸되 toolbar 열기 수용 유지. old/rollback은 게시 v1 UI 유지. config/media 손실 부정 대조·원래 Task6 전체 게이트·F00 전체 Astra max를 마무리하며 qualification만으로 Task5 완료 처리하지 않는다.

## 명령·실행 인계

집중 명령은 격리 후보의 기존 Node로 실행한다. 새 실제 명령은 `node scripts/check-installed-extension.mjs --run-id=F00TabQualification --qualification=media-tab`(재실행은 고유 ID, Windows 게이트). private output 스크립트가 아니라 수정한 기존 runner다. 생성은 `node scripts/settings-runtime.mjs --write`, 뒤에 check:settings-runtime·기존4 typecheck/9기반. 전체/픽셀/오디오/패키지/설치 positive·negative/저장4관측/점검도구/보호 명령은 [원래 명령 절](2026-10-14-f00-channel-media-settings.md#commands-execution-selection-and-approval-bundle)을 유지한다. 새 탭 시험이나 예전 qualification A–I로 대신하지 않는다.

현재 사용자 승인은 위 작업1–3의 로컬 UI/client/생성/fixture/harness 보완, 원래 남은 Task5/6 격리 검증·로컬 checkpoint·F00 전체 Astra max를 포함한다. Native 방식 유지. 시청 Chrome/P09·새 의존성/권한/전송·버전/push/PR/병합/릴리즈/스토어는 별도 중지/승인 조건이다.

## 계획 승인·완료 체크리스트

- [x] 주 작업자 명세/인터페이스/5초점/분량 자가 검토. 기존 test 파일명·--write 옵션 확인, 미래 시험/명령은 PASS가 아님.
- [x] 새 Astra max 최초0/3/1·4항목 보완 확인. 이전 설계0/5/1과 구분. 검토된 영어 입력 E1C063B0E015BAF91AAADB120FCADFADE31E5C04C26CB805131F23F0421474C7은 역사 원본이며 이후 한글 번역/상태 표시는 새 전체 검토가 아니다.
- [x] 사용자 상세 계획/기존 Native 실행 승인2026-10-14. 앞으로 승인 요청 문서는 한글로 작성.
- [ ] 위 작업1–3·원래 남은 Task5/6 구현/검증·F00 전체 최종 검토. 공개는 하지 않는다.

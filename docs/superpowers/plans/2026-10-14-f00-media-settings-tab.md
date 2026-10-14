# F00 Media Settings TAB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for the already selected Native method. Root implements sequentially; one fresh whole-F00 Astra max review remains at the end. This addendum amends Task5 only after written-plan/execution approval. Steps use checkbox syntax.

**Goal:** Make channel/preset editing usable in a real own settings TAB without weakening document authentication or losing user intent/data.

**Architecture:** Reuse popup.html/popup.ts and both existing clients. Toolbar keeps v1 global settings and an explicit TAB opener; only media-mode TAB runs the v2 client. Keep broker/schema/authority unchanged and separate read-only recovery from dirty transmission.

**Tech Stack:** Existing strict TypeScript/classic generators, Chrome MV3 minimum121, Node24.19.0/TypeScript7.0.2/esbuild0.28.2/Playwright1.62.1, JSDOM and disposable bundled Chromium. No new dependencies.

**Spec:** [Approved TAB addendum](../specs/2026-10-14-f00-media-settings-tab-design.md), user approved mockup/UI·written-spec and toolbar→TAB acceptance2026-10-14. [Original F00 design](../specs/2026-10-14-f00-channel-media-settings-design.md) remains normative except this explicit UI amendment. [Design review](../validation/2026-10-14-f00-settings-tab-design-review.md) retains initial0/5/1 and six-item targeted closure, not product PASS.

**Status:** WAITING-USER written-plan/Native execution confirmation. Source input caa2024 on codex/f00-channel-media-settings. [Fresh Astra max plan review](../validation/2026-10-14-f00-settings-tab-plan-review.md) initial Critical0/Important3/Minor1 and all4 targeted closure completed; not product PASS or fresh whole0. Existing Tasks1–4 checkpoints remain; original Task5/6, installed preservation and whole-F00 review remain incomplete.

## Global Constraints

- F00 compressorDefault/Threshold/Knee/Ratio/Attack/Release and brightness/contrast/saturation/gamma/sharpness only. Gain/EQ/normalizer stay F01; everything else global.
- Product/package/manifest2.13.3, Chrome minimum121 and Chrome-only support; permissions scripting/storage and https://chzzk.naver.com/* unchanged. No tabs/history/cookies/identity permission, remote code, transmission or new web_accessible_resources.
- Keep four global keys and schema1 mediaProfiles;128 channels/64 presets, names48 Unicode code points/192 UTF-8 bytes,256KiB key+JSON; all existing field defaults/ranges/token/revision limits unchanged.
- Keep exact own sender URL/id/frame + actual sender.documentId + getContexts exact document/origin/incognito and current target id/window/origin/channel checks, including immediately before commit. Missing facts fail closed. Never infer document identity from query/URL or a mocked active tab.
- Incognito media writes remain forbidden; no normal-window opener fallback from incognito. Existing global v1/CSS/legacy behavior remains independent.
- query mode is UI intent, not authority. search≤512 chars, empty hash, exact keys; safe canonical decimal IDs≤16 digits; lowerhex32 channel ID. Allow targetless, style-only pair and current triple exactly as spec.
- No user viewing Chrome/P09/root dist writes, private audit/original ZIP/CRX/protected branch changes. Build/run tests only in physically isolated candidates. Existing root dist58 and published payload58 stay preserved; F00 candidate59.
- Korean/English only. Never log user channel/document IDs, preset names or catalogue; synthetic fixtures only. No account/cookie/content/visit history collection.
- No push/PR/merge/version/release/store work. Local checkpoints only after execution approval; no task/doc-only PRs.

## File and interface map

| Owner | Paths | Responsibility |
| --- | --- | --- |
| UI and target | src/settings/popup.ts, popup.html, popup.css, _locales/ko/messages.json, _locales/en/messages.json | explicit opener/mode/parser/target pin, reuse forms/layout, confirmations/recovery/lifecycle |
| Client recovery | src/settings/client.ts | read-back without dirty auto-send; ambiguous patch remains unknown; existing transport/queue/schema untouched |
| Unit fixtures | tests/settings-fixture.cjs, tests/media-ui.test.cjs, tests/media-client.test.cjs, tests/settings-ui.test.cjs, tests/settings-multi-ui.test.cjs, tests/settings-style-apply.test.cjs; new tests/media-settings-tab.test.cjs | truthful toolbar/TAB/query sender contexts, API boundaries, all approved negative paths |
| Installed qualification | scripts/extension-e2e/popup-cdp.mjs, harness.mjs reexports/parser, scripts/check-installed-extension.mjs, scripts/check-installed-transition.mjs; tests/installed-popup-cdp.test.cjs, installed-extension-runner/harness, installed-transition-child/runner tests; new tests/installed-media-tab.test.cjs | strict-checked TAB helper, real callers/session owner/close proof and production facts; no fabricated context |
| Generation | popup.js, settings-client.js, tests/fixtures/f00-runtime-executable.json | current active generated pins only; unchanged historical baselines |
| Remaining integration | original Task5/6 paths/commands | actual storage4 observations/negative controls/privacy/package/whole review, not repeated in this addendum |

## Review Focus

1. Initial target A→B or window switch before async opening must not select B; VOD style-only pair must survive TAB→styles. Task5A.
2. Queryless own TAB or iframe must not impersonate toolbar and query another active broadcast. Task5A.
3. Lost patch ACK plus newer unsent draft must remain recoverable without same-value success claims or read-triggered transmission. Task5B.
4. v1 brightness2 ready/v2 brightness1 delayed must never create preset1; normal v1 edits must still work. Task5B.
5. Confirmation race and disposed persisted document must never execute stale intent or show actionable ready controls. Task5B/5C.

## Task5A: Reused settings TAB and immutable target

**Files:** UI/target files and unit fixture map above. No new product entry/module/HTML page.

**Interfaces:** Private popup helpers: `readMediaLocation(url:URL):{mode:'global'|'media';target:{tabId:number;windowId:number;channelId:string|null}|null;code:string|null}`, `validateCapturedTarget(target):Promise<chrome.tabs.Tab|null>`, `openMediaTab():Promise<void>`. They are UI-local, not new exported globals or message capabilities. `mode='global'` covers toolbar/queryless own TAB; runtime `tabs.getCurrent()` distinguishes those surfaces, not sender auth. Capture raw active tab once only for toolbar.

Core RED assertions in `test('toolbar keeps global edits without media bootstrap',async t=>...)`:

```js
const h=settingsHarness(t);
const {dom}=await h.openUi('popup',{surface:'toolbar'});await h.settle();
assert.equal(dom.window.document.getElementById('media-controls').hidden,true);
assert.equal(h.messages.some(entry=>entry.message.protocol===2),false);
assert.equal(Object.hasOwn(h.saved,'mediaProfiles'),false);
```

- [ ] **RED:** Add media-settings-tab.test.cjs. Toolbar default: media-controls hidden, protocol2 requests0, mediaProfiles absent, automatic tabs.create0; v1 brightness save still succeeds. Own TAB/queryless: `tabs.query`0 and styles/current target absent. Top-frame=false: editing/media bootstrap0. Mode malformed/duplicate: media bootstrap0; valid mode+malformed target: global/saved available, current/styles target disabled, clear error.
- [ ] **RED:** Fixtures cover exact targetless/pair/triple and duplicate/partial/negative/leading-zero/overflow ID/hash/unknown-key/search513 cases. A initial URL changed to B before TAB arrival -> current disabled, no adoption of B. VOD preserves pair/current disabled through styles reload; wrong window/origin/closed/unknown incognito rejected. Window focus elsewhere never changes captured IDs.
- [ ] Run `node --test tests/media-settings-tab.test.cjs tests/media-ui.test.cjs tests/settings-ui.test.cjs tests/settings-style-apply.test.cjs` in candidate; record expected new RED failures before product changes.
- [ ] Implement UI-local parser without coercion and exact three forms. Get own TAB via `chrome.tabs.getCurrent()`; only undefined genuine toolbar result enables initial `tabs.query({active:true,currentWindow:true})`; API error is not toolbar fallback. Require top frame. Own TAB without mode retains v1 and never captures another active tab. Toolbar media bootstrap/catalogue read stays0; media-mode own top document starts v2, whose broker still verifies actual sender.
- [ ] Capture raw tab's safe id/window/incognito; CHZZK origin permits style pair, canonical/live adds channel ID. Enable opener after capture. On explicit click `chrome.windows.get(capturedWindowId)` requires same window/nonincognito facts; then `chrome.tabs.create({windowId:capturedWindowId,url:ownURL})` once. Lock button during async open; no retries/other-window fallback. Revalidate passed target on TAB boot against original tuple; never re-derive channel from moved URL. Targetless opener still works from nonCHZZK normal window if window facts known.
- [ ] Preserve original style-link meaning in toolbar and media TAB. Native CSS/UI uses one existing page with media-only class: compact350px toolbar, TAB scope strip/audio+video/preset groups per approved mockup, responsive stacking. All existing global rows remain (mockup omitted rows are not removals); labels/status/focus/keyboard follow original controls. No duplicate settings page/client registry.
- [ ] Extend FixtureChrome with truthful `tabs.getCurrent():Promise<FixtureTab|undefined>`, `windows.get(id:number):Promise<{id:number;incognito:boolean}>`, create call recording and independent role/context URLs. FixtureUiOptions gains `surface?:'toolbar'|'tab'`; `apiFor(name,options?:{surface:'toolbar'|'tab';documentUrl:string})` passes explicit sender/context to its transport. `openUi('popup',{query,surface})` supplies exact DOM URL. Ordinary toolbar has no sender documentId, own TAB has fixture document token and exact query-bearing documentUrl. Existing pure broker/client fixtures may continue explicit own-TAB contexts. No broad default “popup has valid TAB sender” in new toolbar UI tests. Update media tests to explicitly open media TAB; old global toolbar tests remain.
- [ ] GREEN same focused commands plus settings fixture typecheck and generator drift. Preserve original broker invalid sender/iframe/incognito/queue-close tests and published fixtures.

## Task5B: Read-only recovery and safe actionable UI

**Files:** src/settings/client.ts, popup.ts/HTML/locales and media-client/UI/multi-UI tests. Generates settings-client.js/popup.js later via existing scripts.

**Interfaces:** Keep existing `refresh():Promise<void>`, `editFields`, `perform`, `discardPending`, `selectScope`, `dispose`. refresh becomes genuinely read-only with respect to dispatch; explicit edit/perform and successful live mutation continuation own flush. No new protocol, replay log or session. Unknown request UUID/tokens and generation-tagged newer dirty intent survive reads. No generic auto-retry API.

Core replacement assertions in `test('lost patch ACK read-back holds newer draft without dispatch',async t=>...)`, using existing `enabled(t)` fixture:

```js
const {h,c}=await enabled(t),gate=h.holdNext('callback:patch-channel-fields');
c.editFields('audio',{compressorRatio:7});await gate.reached;
c.editFields('audio',{compressorRatio:5});gate.fail();await h.settle();
await c.refresh();await h.settle();
assert.deepEqual(h.messages.filter(e=>e.message.action==='patch-channel-fields').map(e=>e.message.patch.compressorRatio),[7]);
assert.equal(c.view().phase,'unknown');assert.equal(c.view().values.audio.compressorRatio,5);
assert.equal(h.saved.mediaProfiles.channels[0].audio.values.compressorRatio,7);
```

- [ ] **RED:** Replace existing lost-ACK automatic `[7,5]` expectation: send ratio7, hold ACK, edit5, lose ACK, allow event+refresh -> patch messages exactly[7], raw ratio7, displayed draft5 retained, phase not certified ready, scope switch blocked. Even if raw ratio7 equals old intent, unknown patch is not confirmed. Same test with unrelated storage event and epoch-stale read; each read-triggered mutation0.
- [ ] **RED:** Lost create-preset ACK: explicit UI read-back retains original UUID/name/values/token; exactly one create request. Exact independently justified creation may settle; deleted/recreated/edited/same-value ambiguous patch remains unknown. If newer unsent dirty keys remain after creation confirmation, retain them held, not ready/autoflush. Explicit discard clears local intent only; confirmed raw remains. User re-edit after discard sends a fresh request with current snapshot/token, not stale replay.
- [ ] **RED:** Global brightness2 confirmed while v2 reply1 held -> create disabled/attempt mutation0; release latest matching reply -> preset brightness2. Also hold both post-write v1/v2 reads but release only patch ACK: displayed v1 value2/ready/pending0 while both snapshots value1/revision match -> create mutation0, latest snapshots -> preset2. Channel preset uses displayed confirmed domain values; inherited domain additionally matching globalRevision. Pending/media corrupt/auth failure must not block valid v1 brightness/compressor/preview edits.
- [ ] **RED:** reset-domain/delete-channel/delete-preset cancel -> requests/writes0; confirm -> captured intent1request. Confirmation callback injects concurrent revision/update/reset/recreation/scope/target change -> conflict or blocked, never new token substitution/retry. Other domain/global config/copied preset values survive. Stub native confirm explicitly, don't make all fixture confirmations silently true.
- [ ] Run `node --test tests/media-client.test.cjs tests/media-ui.test.cjs tests/settings-multi-ui.test.cjs tests/media-settings-tab.test.cjs` and record RED.
- [ ] Separate refresh/read acceptance from flush. Remove patch-channel-fields from no-change unknown confirmation. Creation confirmation must retain original UUID/full intent and require original expectedMediaRevision+1 creation token/domain binding identity rather than merely matching current values; uncertain/no-proof creation stays unknown. Every read path (boot/event/explicit refresh/scope/discard) is mutation0; avoid race where an in-flight read acquires a post-ACK dirty flush. Normal explicit edits and confirmed successful ACK can continue their pending generations, never an unknown/held generation.
- [ ] When unknown creation is confirmable but newer dirty keys remain, clear only confirmed generation and hold newer intent using existing failed phase/code `draft-held`; don't add a generic retry engine. renderMedia shows draft if pendingRequest OR pendingKeys exists; read-only confirmation cannot remove displayed unsent intent. Discard then explicit user re-edit/perform with current tokens is the reapplication path; no extra replay button outside approved mockup.
- [ ] Add `media-refresh` button calling refresh only; independent `media-discard` keeps meaning. Global-scope preset uses selected domain descriptors to require every displayed `globalView.values.config[id]` equals `globalView.snapshot.config[id]`, plus ready/pendingKeys0 and matching v1/v2 globalRevision. Only then copy/validate snapshot domain values. This covers ACK-confirmed overlays without changing client ABI. Channel uses displayed/confirmed scoped domain/selection with no media dirty keys and matching global revision where inherited. Render and click handler share/recheck the same selected-domain gate; no CSS-only protection. All media mutation handlers preserve existing gates.
- [ ] Native confirm captures exact immutable request before dialog and checks current selection/readiness after dialog. Never fetch a newer expected token silently. Text identifies channel/domain/preset and consequence; cancel no dispatch. Worker remains final auth/target/token authority.
- [ ] GREEN focused commands and settings/UI/client negative suite. No broker auth/schema edits justified by this UI correction.

## Task5C: Disposed-document policy and actual installed TAB qualification

**Files:** popup.ts/HTML/CSS/locales, new TAB tests, harness/installed tests in map, active generation pin; original Task5/6 integration follows.

**Interfaces:** Private UI `retireSettingsDocument():void` and `showReconnectionRequired():void`; no product lifecycle framework. `popup-cdp.mjs` exports `openInstalledMediaSettings({context:BrowserContext,worker:Worker,fixturePage:Page,extensionId:string,browserSession:PopupBrowserSession,timeoutMs?:number}):Promise<{settingsPage:Page;popupAttached:true;tabWriterQualified:true}>`, with Playwright types in JSDoc. harness only reexports it, avoiding expansion of strict checking to all legacy harness code. The helper borrows browserSession, removes only its observer/attachments and returns a LIVE Page; it never closes the browser. Overall qualification default15000ms, every attach/send/discovery operation capped at min(8000,remainingDeadline); exhausted deadline rejects before calling attachment. Validate optional timeout as positive safe integer≤15000. Existing attachPopupCDP8000 limit remains unchanged.

Core RED assertions in `test('restored disposed settings document cannot keep ready editors',async t=>...)`:

```js
const h=settingsHarness(t),{dom}=await h.openUi('popup',{surface:'tab',query:'?mediaSettings=1'});await h.settle();
dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide',{persisted:true}));
dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow',{persisted:true}));
assert.equal(dom.window.document.getElementById('brightness').disabled,true);
assert.notEqual(dom.window.document.getElementById('settings-status').dataset.phase,'ready');
```

- [ ] **RED:** pagehide persisted true then pageshow persisted true -> all edit controls disabled, status not ready, read-only last draft/result-unknown note survives, subsequent input mutation0. Initial pageshow false doesn't lock. Explicit settings reload cancel0; confirm invokes own location.reload once, no tabs.reload broadcast/no storage request. Late callback cannot reactivate disposed controls. Close listeners/transport once. Test globals pending and media unknown separately.
- [ ] **RED:** helper unit mocks test own exact toolbar target/context selection, no ambiguous target/TAB, discovery timeout, missing actual doc/frame/context facts, hidden/disabled/unlabelled button, popup close/open failure, poisoned unrelated new page, query tuple mismatch, cleanup exception. Earliest production request arrives before Page discovery callback -> buffered/matched correctly; observer exists before popup open, discovery exists before click. Default15000 overall uses attach≤8000 and works; elapsed deadline fails. These tests are transport/boundary proof only, not native success.
- [ ] **RED owner:** installed runner tests cover new exact qualification option, absent option unchanged, missing Browser/null session/ACK absent/disconnection absent/owned root nonzero/context.close-only success -> qualification failure and profile retained. Missing clean source attestation fails before launch. Transition media-mode child refuses close-success/next launch without three close facts; config-mode IPC/close remains unchanged. Add wrong/missing worker preparation case and observer cleanup failure case.
- [ ] Run `node --test tests/media-settings-tab.test.cjs tests/installed-popup-cdp.test.cjs tests/installed-media-tab.test.cjs tests/installed-extension-harness.test.cjs tests/installed-extension-runner.test.cjs tests/installed-transition-child.test.cjs tests/installed-transition-runner.test.cjs tests/development-types.test.cjs`.
- [ ] On pagehide capture last global/media views, dispose and irreversibly lock editors; persisted pageshow shows reconnect-required with snapshot/unsent intent/unknown sent commit note. `settings-reconnect` offers native confirmation warning draft may be lost and sent commit may have completed, then own location.reload only. Never auto-reinitialize/send/claim rollback. Maintain lock in every renderer/callback.
- [ ] Before chrome.action.openPopup, install/await temporary observer in the PREPARED actual worker to capture genuine first production v1 and v2 sender facts. Don't respond/intercept/rewrite request or add probe request. Buffer at most16 metadata observations in worker memory (document URLs/IDs needed only privately for binding, never public report); overflow or missing facts fails. Before opener click register bounded context Page discovery and fixture routing; observe earliest TAB request even if it precedes Page discovery. Helper owns/removes worker observer/Page listener in finally; no browser-close ownership transfer.
- [ ] Bring fixturePage front and open actual exact own popup/same browserContext ID via worker chrome.action.openPopup. Toolbar v2 request absence remains required. Read-only observe production v1/Chrome POPUP facts. Evaluate labelled visible/enabled open button rect/focus then public CDP Input mouse events at that rect. Match exactly one NEW own query-bearing TAB from the gesture (exclude preexisting pages), expected captured tuple and context. Read that Page's actual chrome.tabs.getCurrent id and correlate buffered real sender.documentId with one CURRENT getContexts TAB/frame0/exact Page URL/origin/nonincognito AND that actual Page tabId before field input; old same-URL TAB/document cannot supply this proof. IDs remain private memory. Never URL-only authenticate, invent another request, precreate TAB or direct-navigate instead of opener acceptance. Require v1/v2 ready and actionability; input via Page locator.click/fill and durable changed/restored raw observations. Failure is STOP.
- [ ] Wire executable caller: extend parseInstalledE2EArgs/runInstalledExtensionE2E in existing harness.mjs/check-installed-extension.mjs with exact optional `--qualification=media-tab`; duplicate/unknown values rejected, absent return/report shapes and original default scenario unchanged. New qualification selects explicit media scenario using helper, not generic defaultDependencies.scenario. Runner uses existing verifyCandidate/checkPackage/owned artifact/profile creation/fixture router, starts fresh context then existing refreshTransitionWorker (only owned profile) before observer. Create/navigate routed fixturePage, obtain `const browser=context.browser()`; null fails rather than assuming it exists. Acquire and own `browser.newBrowserCDPSession()` and a fixturePage CDPSession within8000ms; obtain nonempty actual browserContextId. Supply browserSession to helper and run bounded TAB save/restore/two-page assertions while Page alive. No private script/dirty source clone as the runnable acceptance path.
- [ ] Add managed TAB routing BEFORE click and attached POPUP blocking/observation where supported; report initial attach gap honestly, no complete egress claim. All operations bounded. Upper check-installed-extension qualification owner stops trace/removes helper resources, sends public Browser.close and records ACK, observes browser disconnected, then uses existing native-profile.mjs queryWindowsProcesses for exact owned profile root0. This strengthened native qualification is Windows-local; other platforms report unsupported/failure, never PASS (existing default cross-platform tests unchanged). Only then residual context.close. Missing any fact/cleanup error means failure; retain owned profile/artifacts/candidate for investigation rather than existing unconditional profile removal. No broad kill/delete or borrowed session Browser.close in helper. Qualifier report records only booleans/codes/hash/counts, no sender/URL/catalogue data. Add runner injected fake APIs/proofs for these RED paths; helper alone cannot certify close.
- [ ] For original Task5 media-preservation launches in check-installed-transition.mjs, child acquires/owns a public browser session per occurrence and uses the same Browser.close ACK/disconnection/root0 gate before media close-success IPC. Capture fixture routing/Page from that occurrence and borrow session into media helper at first-new; published seed/old/rollback remain original UI. Media close packet/result adds exact three proof booleans, parent validates them before next launch/ACK; config mode stays unchanged. On unsupported platform media native gate fails, not skipped-success. Existing supervision/predecessor ordering/destructive control constraints still apply.
- [ ] Strict-check helper inside existing tsconfig.development.json popup-cdp.mjs entry with explicit Playwright parameter/return JSDoc; don't claim all legacy runner/harness is strict-checked. Add typed consumer/misuse cases in existing development-types.test.cjs compiler probe (wrong context/session/timeout type/result use must reject). Preserve its original config/files/misuse assertions and product/settings four type projects. Runner/adapter changes get the above executable unit/IPC negative tests and actual Windows native execution.
- [ ] GREEN unit/type/generation gates; generate original settings assets in candidate and update only current active f00-runtime-executable pins. Package candidate59/exact names; no root dist change or historical fixture updates. Make a clean local source checkpoint only after execution approval, then physical clean clone for native qualification; dirty copied working tree is not source attestation. Failed probe requires fix/new checkpoint/re-run, never old-HEAD test attestation.
- [ ] Actual qualification in newly owned disposable F00 bundled Chromium profile: toolbar opener→TAB, current/save/restore, targetless/global/saved, VOD style pair and two same-extension TAB independent field edits. Default global first, channel domain only explicit enable. Confirmation UI/dialog and keyboard/narrow layout measured separately; unit synthetic BFCache isn't actual extension URL BFCache.
- [ ] Only after that PASS resume original Task5 media-preservation selector/supervision/seed+observations0..3/control occurrence4 and privacy/user guide steps; substitute TAB editor, retain actual toolbar opener acceptance. Old/rollback use pinned published UI and v1 semantics. Complete existing config loss/media-profile-loss negatives and all original Task6 gates/whole-F00 Astra max. Do not count qualification alone as Task5 done.

## Commands and execution handoff

Focused commands above use existing Node in physical candidate. Native qualification command: `node scripts/check-installed-extension.mjs --run-id=F00TabQualification --qualification=media-tab` (fresh unique ID on rerun, Windows-only gate). This is the revised existing runner, not private output code. Generation: `node scripts/settings-runtime.mjs --write`, then `npm run check:settings-runtime` and original four typechecks/9foundation gates. Full/regression/pixels/audio/package/installed positive/negative/storage4 observations/tool-audit/protection commands remain the [original Commands section](2026-10-14-f00-channel-media-settings.md#commands-execution-selection-and-approval-bundle); don't replace those with new TAB tests. Use fresh unique run IDs/output ownership; don't reuse qualification A–I results as TAB PASS.

Native method retained. One future execution approval may cover these5A–5C in-scope local UI/client/generation/fixture/harness corrections and original pending Task5/6 isolated checks/local checkpoints/final whole-F00 Astra max. Existing viewing Chrome/P09, new dependencies/permissions/transmissions, versions/push/PR/merge/release/store remain separate STOP. This plan's creation/review approval is not execution approval.

## Plan review checklist

- [x] Root spec coverage/interface/five-focus/proportion/self-review. Exact harness test name and generator --write option verified against current repository; new tests/commands are planned, not PASS.
- [x] Fresh Astra max aggressive plan review initial0/3/1·four corrections/targeted closure, separately from earlier design0/5/1. Reviewed corrected input E1C063B0E015BAF91AAADB120FCADFADE31E5C04C26CB805131F23F0421474C7; subsequent status metadata is not another whole review.
- [ ] User written-plan review and confirmation to execute with already selected Native method.
- [ ] Task5A/5B/5C plus original remaining5/6 actual implementation/verification; one whole-F00 final review. No publish.

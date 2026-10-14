# F00 Channel Media Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for the recommended Native method, or superpowers:subagent-driven-development only if the user chooses that method. Execute task-by-task after written-plan/execution approval. Steps use checkbox syntax.

**Goal:** Store explicit channel-specific compressor/video-filter snapshots and user presets without changing global non-media settings or losing existing data.

**Architecture:** Reuse the current broker queue and request transport; keep the four global storage keys and add one mediaProfiles item. Separate global readiness from scoped media readiness, and separate document-owned global filters from player-owned channel filters. Keep Gain/EQ/normalizer work in F01.

**Tech Stack:** Existing TypeScript strict/classic esbuild generation, Chrome MV3 minimum121, Node24, JSDOM and bundled Playwright Chromium. No new dependency/framework/API permission.

**Spec:** [Approved F00 design](../specs/2026-10-14-f00-channel-media-settings-design.md), user approved2026-10-14; normative reviewed body SHA-256 `DEE5028C6E33DFDEC4DA85E96CC2C21F1A1183053D913AD97035381F1789DD91`, pre-user-approval metadata document SHA-256 `B3CF5E61C3F10874F6D5B8FE5F45A1EF4EC16C014D4CDE0E363838C61C375104` (historical input, not current bytes). [Design review](../validation/2026-10-14-f00-design-review.md) retains initial0/3/2 and targeted5-item closure.

**상태:** Native 실행과 [TAB 보완 계획](2026-10-14-f00-media-settings-tab.md) 승인2026-10-14, Task5A 구현/검증 중. 실제 POPUP CDP attachment는 성공했지만 production sender.documentId/frameId 부재로 입력 전에 인증이 실패한 이력은 유지한다. 인증을 완화하지 않고 승인된 별도 TAB 경로로 실제 수용을 진행한다. Tasks1–4·MAIN 보완은 기존 로컬 체크포인트이며 Tasks5–6·whole-F00는 미완료다. [원래 계획 검토](../validation/2026-10-14-f00-plan-review.md)의 최초0/6/1·7항목 targeted closure와 TAB 계획의 최초0/3/1·4항목 targeted closure는 제품 PASS가 아니다. 사용자 승인 문서는 이후 한글로 작성한다. 이 원래 영문 계획의 기술 본문/과거 입력은 유지하고 새 보완 실행은 한글 계획이 소유한다. 시청 Chrome/P09·공개 변경0, 제품2.13.3 유지. push/PR/병합/배포 승인 없음.

## Global Constraints

- Channel-specific fields: audio compressorDefault/Threshold/Knee/Ratio/Attack/Release and video brightness/contrast/saturation/gamma/sharpness only. previewVolume, chat, styles, navigation, sidebar and all remaining config stay global.
- Existing `config`, `styles`, `styleParameters`, `settingsRevision` and legacy t/resizeChat handling remain authoritative. New key `mediaProfiles`, schema1, is absent until explicit media save. Absence reads as revision0 without a new-key write. Existing legacy cleanup is not a new media mutation and must retain its current behavior.
- Limits:128 channels;64 presets across both domains; names48 Unicode code points/192 UTF-8 bytes; key+JSON UTF-8 size256KiB; all revision counters nonnegative safe integers. No coercion, step rounding, eviction, visit tracking, timestamps, sync, export, account/cookie/content collection or telemetry.
- Snapshot domains are complete allowlisted values; presets copy values on apply rather than leaving references. CreatedRevision identifies each creation; record revision starts1. Same-value operations do not increment revisions.
- Preserve exactly the current scalar ranges/defaults, Gain knifeGain0..2, audio graph/limiter/delay formulas and native-filter composition. Do not migrate Gain or add DSP features in F00.
- Only validated own popup.html/styles.html top documents may request media mutations. Site content/MAIN are read-only. Incognito media saves are forbidden; existing v1 global behavior remains. Missing sender/context facts fail closed for new actions.
- Channel overlay is top-frame main-player only. Existing popup-player iframes and preview stay global. Unverified VOD owner means null channelId/global fallback/disabled channel saving; no new network owner lookup.
- Keep minimum Chrome121, current permissions/origins/exclusions/all_frames, version2.13.3 and Chrome-only support. Mixed content-script generations are limited with reload guidance, not auto-migrated or re-injected.
- No root dist build/delete/cleanup, real viewing/P09 profile access, modification of original ZIP/CRX/private audit ledger or historical runtime hash baselines. All tests/builds run from a separate physical candidate clone with its own dependencies and disposable bundled-Chromium profiles.
- Local implementation commits may group meaningful tasks after execution approval; no task/doc-only PR, no push/PR/merge/version/release/store operation without a separate explicit user instruction.

## Review Focus

1. Global default=true and delayed channel default=false must not create a temporary automatic ON; fallback authority changes must preserve manual wanted. Owned by Task4 audio tests.
2. Malformed media data or revision metadata must not disable valid global preview/chat/navigation/CSS/runtime values. Owned by Tasks2/3/4.
3. A preset deleted/recreated with the same UUID and revision must not satisfy an old apply token; lost initial create acknowledgement must not recreate or certify an unrelated record. Owned by Tasks1/2/3.
4. No-player preview/global filters, neutral channel values, reused video/wrapper changes and mixed script generations must keep the specified filter ownership. Owned by Task4 pixel/bridge tests.
5. A write can commit after UI closure or scope-change intent; independent fields from two windows must survive and stale responses must never edit the new scope. Owned by Tasks2/3/5.

## File and interface map

| Unit | Exact paths and responsibility |
| --- | --- |
| Pure schema | Create src/settings/media-profiles.ts. Classic `var KnifeMediaProfiles` plus global TS types; no Chrome/DOM/IO. Own the11 existing media field descriptors, validation, projection and immutable merge |
| Requests/writer | Modify src/settings/contract.ts, broker.ts, background.ts. Exact v2 codecs and the same queue, own sender/context checks, target checks and one-item commits |
| Settings UI | Modify src/settings/client.ts, popup.ts, popup.html, popup.css, _locales/ko/messages.json, _locales/en/messages.json. Shared transport, distinct media state, explicit scope/preset management. styles.ts remains global |
| Reader/runtime | Modify src/settings/config.ts, bridge.ts; src/main/runtime/contracts.ts, bridge.ts, lifecycle.ts, entry.ts. Base/effective projection, per-context epoch, typed v2 envelope, compatible runtime owner |
| Filter/audio owners | Create src/main/features/player/filters.ts; modify player/controls.ts, audio/contracts.ts, audio/controller.ts, site-adapter/contracts.ts/discovery.ts/capabilities.ts, web/main.css. Scope filter targets and suspend audio without erasing manual wanted |
| Generation/proofs | Modify scripts/settings-runtime.mjs, .gitattributes, manifest.json, build-proof/{shared,background,extension-page,isolated,main}.ts and corresponding loader tests. Generated media-profiles.js is never edited manually |
| Active inventory | Create tests/fixtures/f00-runtime-js.json and f00-runtime-executable.json; modify scripts/check-runtime-inventory.mjs default active paths and tests/runtime-inventory.test.cjs. Retain both historical runtime baseline JSON files unchanged |
| Regression/package | Modify tests/settings-fixture.cjs, helpers.cjs, af05-closure.test.cjs, host-permissions.test.cjs, fixtures/installed-extension/site.js and its fixture tests; existing settings/bridge/audio/runtime tests; scripts/check-video-filters.mjs, scripts/check-installed-extension.mjs, scripts/check-installed-transition.mjs and scripts/extension-e2e/transition-scenario.mjs. Add scoped tests described below |
| User guidance | Modify existing PRIVACY.md and README.md. No new website or store-dashboard mutation |

### Shared types and signatures

These names are the task-to-task ABI, not additional storage authorities. Define them in media-profiles.ts (classic global types) and runtime/contracts.ts (runtime-specific types).

```typescript
type KnifeMediaDomain = 'audio' | 'video';
type KnifeAudioValues = { compressorDefault:boolean; compressorThreshold:number; compressorKnee:number;
  compressorRatio:number; compressorAttack:number; compressorRelease:number };
type KnifeVideoValues = { brightness:number; contrast:number; saturation:number; gamma:number; sharpness:number };
type KnifeMediaValues = KnifeAudioValues | KnifeVideoValues;
type KnifeMediaVersion = { globalRevision:number|null; mediaRevision:number|null };
type KnifeChannelToken = { channelId:string; recordCreatedRevision:number; domainCreatedRevision:number };
type KnifePresetToken = { id:string; createdRevision:number; revision:number };
type KnifeMediaSelection = { kind:'global' } | { kind:'current'; tabId:number; windowId:number; channelId:string }
  | { kind:'saved'; channelId:string };
type KnifeMediaPhase = 'loading'|'ready'|'saving'|'unknown'|'failed'|'conflict'|'repair-required'|'unavailable';
type KnifeMediaRead = { state:'valid'; store:KnifeMediaStore } | { state:'absent'; store:KnifeMediaStore }
  | { state:'invalid'|'unsupported'; code:string };
```

`KnifeMediaStore` is exactly the spec's schema1/revision/channels/presets shape, with separately discriminated audio/video presets and complete domain values. `KnifeMediaPatch` is a typed partial of the selected domain only; validate1..6 audio or1..5 video own data fields, not arbitrary record keys. An empty patch is a no-op; UI never uses an empty patch to create a domain.

Task1 also declares the pure `KnifeMediaMutation` discriminated union from Task2's action table, `KnifeValuesResult`, `KnifeMediaResolution` and `KnifeMediaMergeResult`, so Task1 can typecheck independently. The channel token for delete-channel contains record identity/revision only; domain operations additionally require domain identity. Every selection supplied to a channel mutation must identify a channel. No request-level flag can weaken sender/context validation.

`KnifeMediaProfiles` produces these functions:

- `readStore(raw:unknown):KnifeMediaRead`; no normalization/rewrite of invalid/unsupported raw data.
- `validateValues(domain:KnifeMediaDomain, value:unknown):KnifeValuesResult`; branch-specific typed result or `{ok:false,code:string}`.
- `resolveMediaSettings(base:Record<string,KnifeScalar>, read:KnifeMediaRead, context:{channelId:string|null;topFrame:boolean;incognito:boolean}):KnifeMediaResolution`.
- `mergeMediaOperation(store:KnifeMediaStore, request:KnifeMediaMutation, global:{config:Record<string,KnifeScalar>;revision:number}):KnifeMediaMergeResult`.

`KnifeMediaResolution` returns effectiveConfig, profileState, audioBindingKey and selected domain kind; binding keys remain ISOLATED-local and never enter MAIN/status/log. `KnifeMediaMergeResult` is a no-op or nextStore plus known committed record tokens, except apply-preset-global which returns existing global config operations with no mediaProfiles write.

After every TS task, regenerate affected classic outputs before running generated-runtime tests. Refresh only the two new active F00 executable/file inventory pins after inspecting intended generated changes, then run drift/hash/negative controls. Historical baselines are never refreshed. This is part of each task's GREEN gate, not a last-minute waiver of inventory checks.

Source-attested installed gates require a clean Git SHA. Tasks1–4 may commit after their focused GREEN gates. Before Task5/6 installed gates, run focused RED/GREEN tests, generated/type/hash checks, then make a local implementation checkpoint containing the exact source/generated assets/tests (not a completion claim). Create a separate physical clone of that clean SHA with physical dependency copies; never symlink protected source or build in root dist. The runner's sourceAttestation must still reject dirty tracked source. Failed installed gates lead to a defect fix, focused checks and a new local checkpoint/clean candidate; never bypass attestation or test the old HEAD instead. Evidence/docs closeout comes after those gates. Local checkpoints are included in the requested execution approval only; none are created during plan review.

## Task 1: Pure media contract and classic load graph

**Files:** New media-profiles.ts; config.ts; generator/manifest/html/build-proof paths above; tests/media-profiles.test.cjs; tests/settings-fixture.cjs and its contract tests/compatibility/native-preflight callers; tests/settings-runtime-generation.test.cjs; tests/settings-load-order.test.cjs; tests/runtime-inventory.test.cjs; tests/af05-closure.test.cjs; tests/host-permissions.test.cjs and two new F00 inventory files.

**Interfaces:** Produce the shared ABI above and domain descriptors. config.ts consumes `KnifeMediaProfiles.audioFields/videoFields`; both worlds consume the same generated media-profiles.js. No CONFIGS runtime dependency inside media-profiles.js. Existing CONFIGS field semantics remain identical.

Task1 구현/집중·전체·9gate 검증은 [구현 기록](../validation/2026-10-14-f00-channel-media-settings.md)에 고정한다. 실제 F00 UI/적용/설치·최종 검토와 구분한다.

- [ ] **RED:** Add literal tests for audio defaults false/-50/40/12/0/0.25, video neutral1/1/1/1/0, valid decimals, invalid fields/NaN/infinity/duplicates/unsupported schema, bounds128/64/48/192/262144, safe integer exhaustion, no-op revisions and deleted/recreated tokens. Assert absent raw is not mutated. A={audio default false}, B={video brightness2} must leave all non-media config unchanged.
- [ ] **RED run:** `node --test tests/media-profiles.test.cjs tests/settings-load-order.test.cjs`; expected missing module/global/schema entry failure, not a syntax error. Write one domain result assertion:

```javascript
assert.equal(result.effectiveConfig.brightness, 2);
assert.equal(result.effectiveConfig.previewVolume, 5);
assert.equal(result.effectiveConfig.compressorDefault, false);
assert.deepEqual(rawBefore, rawAfter);
```

- [ ] Implement exact schema/types/functions. Move the existing11 descriptors, unchanged, to the new pure module so settings and MAIN do not maintain separate range/default lists. CONFIGS uses those descriptors; tests compare current semantics to approved literal values.
- [ ] Register generated media-profiles.js before config.js in background importScripts and extension pages, and before web/runtime.js in MAIN. Add it before config.js in ISOLATED. Update current F00 fixture loaders, their typed WorkerFile union, generation entry list and build-proof references. Classify every literal config.js evaluator as current runtime, pinned published runtime or hash-only reference before editing: settings/audio/bridge/helpers/current pixel runners need the new graph, pinned published-settings-baseline/native P09 payloads keep their own old graph. Keep helpers.cjs legacy deliver and add a distinct v2 scoped delivery helper; do not silently auto-load dependencies to mask a broken product load order. .gitattributes marks the new generated JS with LF/linguist-generated=true.
- [ ] Make fixture source sets explicit: PublishedWorkerFile remains config/style-schema/settings-contract/settings-broker, F00WorkerFile adds media-profiles.js first. `WorkerSources={generation:'published';sources:Readonly<Record<PublishedWorkerFile,string>>}|{generation:'f00';sources:Readonly<Record<F00WorkerFile,string>>}`. Default harness uses current F00 graph; supplied sources must be tagged, with exact own keys/nonempty values and generation-specific order. Update every supplied-source caller, including native-preflight/old-new-old compatibility; validate before busy/retirement logic and before closing the old worker. RED: published-four and F00-five load successfully; missing F00 dependency/incorrect tag is rejected with the current worker still alive. Historical payload bytes stay frozen.
- [ ] Point af05-closure.test.cjs current generation entry assertions at new F00 active pins. In host-permissions.test.cjs keep permissions/origins/minimum/exclusions/frame/world/run_at/css baseline checks exactly; split js arrays from those boundaries and assert the literal new module order in both worlds. Do not regenerate host-permissions-baseline.json or the historical runtime pins just to make these gates pass.
- [ ] Generate only in the implementation branch, not protected dist. New active F00 inventory files pin sorted file names/executable hashes after reviewed generation; only script default paths change, not the hash/negative-control algorithm. Old baseline files and pinned published payload stay byte-identical. Reject extra JS/hash mismatch and compare vendor executable bytes to old inventory unchanged. Never auto-bless inventory from tests/CI.
- [ ] **GREEN:** Run focused tests, generate/check settings+MAIN, all9 foundation commands and inventory negatives in the disposable candidate. Local commit `feat: add typed media profile contract and load graph` after green.

## Task 2: Same-queue v2 media writer and failure contracts

**Files:** contract.ts/broker.ts/background.ts; new tests/media-broker.test.cjs; existing settings-broker/contract/compatibility tests; settings-fixture.cjs.

**Interfaces:** Consume Task1; define `KnifeMediaRequest` with namespace cheese-knife-settings/protocol2/requestId plus one exact action, and `KnifeMediaReply` with ok/requestId/stored/version/profileState/snapshot or failure stage/code. Existing v1 request/reply ABI unchanged. Broker returns the existing public listener/initialize/invalidateStyles methods.

| Action | Exact additional request fields |
| --- | --- |
| get-media-snapshot | selection |
| enable-channel-domain | selection(current/saved), domain, expectedGlobalRevision, expectedMediaRevision, expectedRecord token or explicit absent state |
| patch-channel-fields | selection, domain, channelToken, patch |
| replace-channel-domain | selection, domain, channelToken, expectedRecordRevision, either values or presetToken |
| reset-channel-domain/delete-channel | selection, record id+createdRevision, expectedRecordRevision; reset also domain+domainCreatedRevision |
| create-preset | id, expectedMediaRevision, domain, name, complete values |
| edit-preset | preset id+createdRevision, name and/or typed field patch; full values replacement also expectedPresetRevision |
| delete-preset | presetToken |
| apply-preset-global | presetToken, expectedGlobalRevision |

- [x] **RED:** Two windows patch different fields of the same domain; both survive, same-field last committed wins. Test source preset(P,created1,revision1) deleted/recreated(P,created3,revision1): both channel and global apply must return conflict, storage writes0. Test domain reset/recreate, raw unknown globals/top-level keys, legacy cleanup, quota/get/set failure, queue saturation64 and closed reply after commit.
- [x] **RED run:** `node --test tests/media-broker.test.cjs tests/settings-broker.test.cjs tests/settings-compatibility.test.cjs`; missing v2 actions fail while existing v1 positive tests still run.
- [x] Add v2 validation to the same listener and queue. Recheck own sender URL/id/frame and runtime.getContexts(documentId) incognito metadata; current selection additionally tabs.get id/window/origin/normalized channel/incognito immediately before commit. Saved selection remains explicit and is never active-tab retargeted. Unsupported context facts are typed failures. Media storage read/validation failures do not turn valid v1 global reads/edits/CSS into media repair failures.
- [x] First create/enable compares expectedMediaRevision so its creation token is the predicted next commit revision. Repeated creation may only confirm the original id/token/initial values without a write; changed current values or a different token stays conflict/unknown. A new create UUID is generated once by UI, never substituted on timeout. No persistent operation history is added. All mutations require valid current global revision; do not bypass existing initialization repair gates.
- [x] A media commit writes only `{mediaProfiles:next}` once. apply-preset-global validates source token in the same queue and calls existing mergeOperations on the six or five media fields, preserving raw unknown/non-media/style values, then writes only its existing global changes once. New media commits do not invalidate/register global CSS; global preset apply preserves existing CSS scheduling semantics without turning CSS failure into channel data loss.
- [x] **GREEN:** Run focused tests and prove first explicit save writes the new key, read/visit never creates it, global/profile conflicts preserve exact pre-write bytes, and broker max concurrent writer count1. Local commit `feat: serialize channel and preset mutations in settings broker`.

## Task 3: Scope-aware popup with independent client state

**Files:** client.ts/popup.ts/popup.html/popup.css/locales; tests/media-client.test.cjs, media-ui.test.cjs; settings-{client,multi-ui,ui,style-apply}.test.cjs; settings-fixture.cjs.

**Interfaces:** Retain createSettingsClient API and its global KnifeSettingsView. Extract the existing10-second callback timeout/cancellation/requestId validation into `createSettingsRequestTransport(chromeApi:typeof chrome)` in client.ts, after the existing generated leading var, shared by both client instances. Produce `createMediaSettingsClient(chromeApi):{subscribe,selectScope,editFields,perform,refresh,discardPending,dispose}`. `perform(request:KnifeMediaMutation):Promise<KnifeMediaReply>` is the sole media mutation entry; selectScope returns a typed blocked result while saving/unknown.

Fix the client ABI in client.ts: `subscribe(callback:(view:KnifeMediaView)=>void):()=>void`, `selectScope(selection:KnifeMediaSelection):Promise<{ok:true}|{ok:false;code:string}>`, two domain-discriminated `editFields(domain:'audio',patch:Partial<KnifeAudioValues>):void` / video equivalent, `refresh():Promise<void>`, `discardPending():void`, `dispose():void`. KnifeMediaView contains selection, validated snapshot|null, domain values, phase, pending field keys and code:string|null; saving/unknown cannot be represented as ready. Global field editing delegates to the existing global client; the media client never creates a second global writer. Shared transport exposes separate typed v1/v2 send overloads returning `{promise,requestSequence,cancel}` and `dispose():void`; both reuse the existing callback/timeout path, with no generic transport framework. Dispose cancels the local waiter, never a broker commit already sent.

- [x] **RED:** Field edits at current/saved channel send only changed audio/video fields with captured tokens; previewVolume/chat/styles continue v1. Two open popups synchronize independent edits. A closed/changed target never silently selects a new tab. Unknown/saving scope changes are blocked; explicit draft discard is display-only, not rollback. Corrupt mediaProfiles disables channel/preset mutations only: with valid global revision, the same global-scope brightness/compressor controls must successfully save through v1. UUID/token stay fixed on unknown-create read-back.
- [x] **RED run:** `node --test tests/media-client.test.cjs tests/media-ui.test.cjs tests/settings-multi-ui.test.cjs tests/settings-style-apply.test.cjs`.
- [x] Reuse one transport implementation with exact per-protocol reply codecs and separate media/global mutation/dirty/snapshot epochs. Subscribe before read. v2 snapshot invalidity cannot poison the v1 global client. An acknowledgement cannot overwrite a newer read at the same version pair; local request sequence and scope generation decide acceptance. Do not merge whole stale snapshots back into storage.
- [x] Render scope selector `media-scope`, domain inheritance controls and preset name/apply/delete management in the existing popup, using plain text and existing labels/forms. Global is the default scope; channel domain must be enabled explicitly before editing. Double-click reset stores neutral/default domain values; ‘전역 사용’ removes only that domain. Show stored/applying/limited separately, preserve keyboard focus and accessible error/status labels. Saved-channel management uses canonical channelId, no name scraping/API lookup.
- [x] Disable current-channel saves for unknown owner/VOD/incognito/no-target; saved management does not imply a current player. Preset/global full apply requires fresh source+target tokens and global ready state; preview, styles and original-tab reload remain untouched. Content script status is never mutation authorization.
- [x] **GREEN:** Run focused UI/client/typed fixture gates; prove no channel reset deletes the other domain, no automatic setting write on render, and labels/record catalogue stay in own UI only. Local commit `feat: add explicit channel and preset settings controls`.

## Task 4: Scoped bridge, filter ownership and audio intent

**Files:** config.ts/bridge.ts; runtime contracts/bridge/lifecycle/entry; player filters.ts/controls.ts; audio contracts/controller; site-adapter contracts/discovery/capabilities; web/main.css; tests/scoped-media-runtime.test.cjs, scoped-media-filter.test.cjs; tests/fixtures/installed-extension/site.js and its fixture tests; existing bridge/runtime/audio/preview/inject tests; scripts/check-video-filters.mjs and check-installed-extension.mjs; extension-e2e/transition-scenario.mjs.

**Interfaces:** `readScopedConfig(context:KnifeScopedContext):Promise<KnifeScopedSnapshot>` bulk reads global keys+mediaProfiles. Snapshot has baseConfig/effectiveConfig/styleParameters/version/profileState and revisionStatus:'ready'|'repair-required'; nullable metadata does not invalidate base scalars. `KnifeScopedContext={documentGeneration:number;routePath:string;channelId:string|null;playerGeneration:number}`; local bridge maps opaque audioBindingGeneration, not raw record tokens. Runtime configReady continues to mean baseReady. Produce `readScopedConfigEnvelope(event:MessageEvent<unknown>,expectation:KnifeScopedContext):ScopedEnvelope|null`, keeping actual event source/origin checks in the caller. `installVideoFilters(target:Window):VideoFilterController|null` exposes `reconcile(base:KnifeVideoValues,channel:KnifeVideoValues|null,filterTarget:Element|null):void` and `dispose():void`; adapter PlayerSnapshot includes filterTarget:Element|null. null channel retires only the channel renderer; valid base always maintains document renderer even without a player.

- [x] **RED:** Delayed A→B→A replies, same video/pzp across channels, video replacement during resume, sidebar generation changes, same-context BFCache/hidden restore, metadata/null revision, corrupted media, global functions ready during scopedPending. Mock only cross-world event source/origin; production parsers/readers/controllers must run.
- [x] **RED filter cases:** Document with no player and preview video retains global filter; main channel brightness2 plus preview global1 separates targets; neutral channel overrides non-neutral extension global filter but preserves native inner video filter. Wrapper-only replacement retires old marker. Foreign SVG/marker/slot changes are not overwritten. base-neutral body without knife-filter still permits a channel filter.
- [x] **RED audio cases:** Global default=true/B default=false: automatic ON requests0 before scoped response; default false→true can request once, true→false does not force current OFF, manual OFF wins over later notify. Limited fallback autoON→confirmedfalse bypasses only auto intent; manual ON/OFF survive. Gain0/volume0/mute/eligibility/current graph alignments retain existing results.
- [x] **RED run:** `node --test tests/scoped-media-runtime.test.cjs tests/scoped-media-filter.test.cjs tests/bridge.test.cjs tests/audio.test.cjs tests/runtime.test.cjs`.
- [x] Extend the content reader without replacing legacy getConfig semantics. Watch mediaProfiles alongside existing keys; invalidate/retire read jobs on context/storage/BFCache changes. Initial/scoped retry uses existing20 attempts/100ms request budget; known base may enter explicit limited global fallback after2seconds, unknown base remains unavailable. Retired/hung reads cannot hold future refreshes or apply stale results. New storage/profile data never enters MAIN as a catalogue.
- [x] Runtime separates base readiness, scoped state and genuine route/pzp/video player generation from existing body/sidebar runtime.generation. Retire old overlay before notify/configure/mount; guard actual location/player/token at every apply and async accept. Global arrowSeek/preview/chat/inject keep base-ready gates; media checks live inside audio/filter paths only. owner protocol marker2 is required before new modules install; reject incompatible old registry and both mixed generations with limited/reload guidance. Preserve type-specific status v1 handling.
- [x] Move SVG construction once into filters.ts; global renderer follows document/base, channel renderer follows adapter filterTarget identity. No arbitrary selector from messages; channel override wins the extension-global rule once, with native inner pipeline intact. Scope-bound cleanup never removes foreign changes. Top-frame only channel overlay; iframe/incognito/VOD-unknown remain explicit global-only.
- [x] Add `suspend(video:HTMLVideoElement):void` to AudioController for same-context pending/revalidation: increment existing entry async generation and bypass wet output without clearing wanted or creating an entry/source/graph. Announce pending if wanted=true, otherwise off, so the current on/pending toggle can still turn manual intent OFF. Add `resumeWanted(video:HTMLVideoElement):Promise<AudioState>` to resume only retained wanted after current scoped acceptance; old `bypass(video)` remains final/old-context retirement and clears wanted. setEnabled/configure and their post-resume/node-creation/apply paths check current context; no new MediaElementSource for an already owned video. controls records manual/default intent per genuine context, separately from audioBinding authority changes; suspend is not a new automatic ON or permission bypass.
- [x] Update pure fixture loading and pixel runner to load both worlds/adapter/runtime/player renderer, not just the former ISOLATED setFilters global. Keep the existing literal pixel oracle and native wrapper tests; add main/preview isolation pixels and absence/mixed-owner negative controls. Stored values are not rewritten by the runner.
- [x] Add separate bounded v1 and v2 metadata witnesses to tests/fixtures/installed-extension/site.js (no settings catalogue/labels). Existing published phase selects v1; current F00 installed/transition phase selects v2. Update runBaseInstalledScenario/transition waits to select expected generation, including their runtime-owner lookup. Replace the current-only stale negative with a valid v2 envelope using the captured context/request identity but stale delivery sequence, and an A-context replay after B switch; valid v2 control must first be accepted. Preserve v1 stale assertions for published paths so blanket protocol rejection cannot masquerade as stale protection. Fixture tests cover both witnesses, malformed metadata and rejected stale deliveries.
- [x] **GREEN:** Focused tests, all generation/type gates, existing and scoped pixel/audio quality runs in the disposable candidate. Local commit `feat: apply channel media settings with guarded player ownership`.

## Task 5: Installed preservation, policy text and final evidence

**Approved UI amendment2026-10-14:** New F00 phases use actual toolbar button→document-authenticated own TAB for media editing, as specified in the [TAB addendum](2026-10-14-f00-media-settings-tab.md). Its5A–5C require separate plan/execution approval before resuming. Below references to popup media editing/qualification mean this amended path; the toolbar still has to open the TAB, but is not itself a v2 writer. Published old/rollback global UI stays original. Storage4 observations, payload/supervision/negative controls/privacy/Task6 gates below are unchanged.

**Files:** scripts/check-installed-extension.mjs, scripts/check-installed-transition.mjs, scripts/extension-e2e/transition-scenario.mjs; tests/fixtures/installed-extension/site.js and its fixture tests; tests/installed-media-settings.test.cjs; existing transition runner/supervisor/scenario tests; scripts/check-video-filters.mjs; README.md/PRIVACY.md/locales; new docs/superpowers/validation/2026-10-14-f00-channel-media-settings.md.

**Interfaces:** Consume Tasks1–4. Reuse existing runner-owned physical candidate/profile, fixtureRouter and worker refresh/normal-close proof. Add explicit `--scenario=media-preservation` for media positive; absent selector retains existing config scenario/schema. `--control=media-profile-loss` is valid only with that selector; storage-loss remains config-only. Parent/child argument, result and verdict codecs reject unknown/duplicate/incompatible selectors. No replaced storage-loss test.

- [ ] **RED:** Installed fixture seed holds unknown global raw field and top-level key; old2.13.3→F00 save A audio/B video/preset→old code sees old global values and keeps mediaProfiles bytes→F00 reads the same records again. Two same-ID profile windows retain independent edits; late closed UI commit is visible after reopen. One-frame-only channel overlay and fixed old/main protocol combinations match the spec.
- [ ] **RED control:** Delete disposable A audio only at final-new startup, after first-new UI creation and rollback raw preservation are witnessed; if A has no video, remove the now-empty A record too to keep the schema valid. Retain global/config tokens and all other profiles/presets. Assert the exact raw loss before readiness/value waits, prove first-new creation is not repeated, and require a media-preservation failure at that occurrence, not timeout/repair/permission/cleanup. Keep existing config loss control independently failing as intended.
- [ ] **RED run:** `node --test tests/installed-media-settings.test.cjs tests/installed-transition-runner.test.cjs tests/installed-transition-scenario.test.cjs`.
- [ ] Extend installed fixture scenario through actual popup controls and real generated bridge/runtime; direct storage writes are limited to fixture seed/destructive negative control, not used to fake successful UI saving. Reuse the pinned published2.13.3 ZIP/key and existing physical same-root extension replacement. Source/root product version stays2.13.3. Preserve the existing disposable phasePayload T=2.13.4/R=2.13.5 and TEST ONLY version_name provenance, including the final new observation; these are test derivatives, not a selected public version. No actual Web Store update/rollback certification.
- [ ] Replace payloadFromDirectory's shared count58 assumption with explicit published and F00 expectations at every candidate/read-back call: published/old/rollback exact pinned58 names, F00 candidate exact published-name-set plus media-profiles.js (59). Validate each expected name/hash against the independently built reviewed candidate inventory and repeat-build hash, not count alone or the just-observed payload as its own oracle. Allow only the existing declared phase manifest/control byte transformations and pin transformed hashes before launch. Child-runner RED cases cover valid added module, missing module and unexpected extra file; never globally replace58 with59.
- [ ] For current-channel popup capture, first qualify actual extension-page observation/automation in a disposable bundled Chromium profile, then bring the fixture broadcast tab forward and call chrome.action.openPopup from its worker. The [official API](https://developer.chrome.com/docs/extensions/reference/api/action#method-openPopup) is generally available from Chrome127; production minimum121 remains unchanged because this call belongs only to the harness. Bound discovery/close of the real popup page; API/capture/control failure is an explicit fixture failure and STOP for this installed gate, not a fallback to mocking tabs.query, falsifying active context or direct storage writes. Qualification is not yet proven; propose a bounded native verification alternative for separate approval if the supported path cannot work.
- [ ] Keep existing config old/new/rollback schema and supervision unchanged. Media dispatch runs seed plus observations0..3 `[old,new,rollback,new]` via runInstalledMediaPreservationScenario. Use launchOccurrence0..4 (seed0, final-new4) in media parent/child intent/ack/close proof/result, media launchId=`caseId:occurrence:phase`; validate exact next occurrence/phase and all prior launches closed before ACK. Do not relax config unique launch IDs. RED: final-new4 accepted, duplicate/skipped/out-of-order occurrence and unclosed predecessor rejected. Seed media via actual UI only in first-new; rollback observes exact bytes through raw read/v1 global UI, final-new reads existing v2 records without re-creation. Control injection applies only occurrence4, with exact raw-loss verdict/result and independent normal config-loss handling. Positive media mode must run all four observations successfully.
- [ ] Update existing privacy/user guidance with explicit locally stored channel preferences/preset names, manual deletion, uninstall loss, no external transmission and the approved VOD/Gain/iframe/incognito/mixed-generation limits. Do not claim no user data, collect diagnostics containing labels/IDs, change policy URL/dashboard or publish documentation now.
- [ ] **GREEN:** After focused/generated/type gates, create the clean local checkpoint `test: add channel data preservation and scoped installed gates`; run installed positive/config-loss/media-preservation positive/media-profile-loss and old/new/old/new assertions from its physically isolated clean SHA. Inspect source/after hashes plus normal-close/cleanup proof. Whole failure/close paths preserve protected root and keep evidence when owned processes cannot be proven closed. Gate failure is not completion and requires a corrected checkpoint/re-run. Record passing evidence in the later closeout commit.

## Task 6: Whole F00 closure, not publication

**Files:** F00 validation record and PLANS.md; repair only discovered in-scope defects before closure. No F01 implementation.

- [ ] From a fresh physical candidate clone, run all9 foundation commands; full `node --test tests/*.test.cjs`; isolated build/check; audio quality; video/scoped pixels; existing installed positive/MAIN negative; old-new-old config positive/loss and new media preservation/loss. Document total/pass/fail/existing skip separately; no invented fixed future test count.
- [ ] Run actual npm/Gitleaks/ESLint tool audit with the already approved dependency-info transmission scope. Preserve raw scanner findings/errors, input-matched flag and historical warning ledger; changes require grounded disposition, not suppression or updating frozen history to pass. No new model security scan or external model transmission is part of this approval.
- [ ] Verify original root dist58/package-lock/manifest version2.13.3/original ZIP+CRX/protected branches and P09 baseline remain unchanged. Product source manifest may register the new script but permissions/origins/exclusions/version must match the protected manifest; compare semantic allowed differences rather than claiming its entire hash is unchanged after implementation.
- [ ] Run one fresh Astra max whole-F00 branch review after implementation. Correct Critical/Important, retain initial counts/declined judgments and use targeted follow-up for corrections. Interpret unexecuted actual Chrome/store paths as unexecuted, not automatically passed from AF05-B.
- [ ] Local closeout commit only after all in-scope gates and evidence pass. Record `F00 local implementation complete`, keep F01/Gain and actual native/store work as their separate gates. Stop before any push/PR/publication, and present the entire F00 scope together when explicitly requested.

## Commands, execution selection and approval bundle

All implementation commands below run in the disposable candidate, not the user's root checkout/dist. `npm` means the existing validated bundled npm CLI when npm is not on PATH; resolve the installed toolchain first rather than install/replace Node.

```text
npm run check:toolchain
npm run check:runtime-js
npm run typecheck:settings-fixture
npm run typecheck
npm run typecheck:development
npm run check:settings-runtime
npm run check:main-runtime
npm run check:build-proof
npm run typecheck:audio-tools
node --test tests/*.test.cjs
node scripts/build.mjs
node scripts/check-package.mjs dist
node scripts/check-audio-quality.mjs
node scripts/check-video-filters.mjs
node scripts/check-installed-extension.mjs --run-id=F00positive
node scripts/check-installed-extension-negative.mjs --run-id=F00negative
node scripts/check-installed-transition.mjs --run-id=F00transition
node scripts/check-installed-transition.mjs --run-id=F00configloss --control=storage-loss
node scripts/check-installed-transition.mjs --run-id=F00mediapositive --scenario=media-preservation
node scripts/check-installed-transition.mjs --run-id=F00medialoss --scenario=media-preservation --control=media-profile-loss
```

Recommended method: **Native** (root implements dependent tasks in sequence, one independent whole-scope Astra max at the end). Existing branch prefix codex/; proposed implementation branch `codex/f00-channel-media-settings` in this checkout after approval, preserving the current local design/plan files. No extra worktree is needed for source edits; physical candidate clones isolate execution. A different method is the user's choice, not silently inferred.

One execution approval may cover: Tasks1–6 local TypeScript/UI/metadata/load-order changes, generated assets/new active inventory pins, fixtures/local commits, disposable bundled-Chromium checks, currently approved tool audit and one final Astra max review. Actual user Chrome installation/reload/options, P09/native profile changes, VOD live owner inspection, new dependency/permission/external transmission, version bump and every push/PR/release/store action remain STOP gates requiring separate approval.

## Plan acceptance checklist

- [x] Root self-review: spec coverage, matching typed interfaces, every review-focus item assigned tests, exact files/commands and historical/current baseline distinction. Actual popup capture remains an explicit qualification risk, not assumed support.
- [x] Astra max aggressive plan review and required corrections/targeted closure: initial0/6/1, all7 closed by the same reviewer, ready for written-plan approval. Historical corrected input SHA-256502421B71C2F791EC55B20E1552CB071EBBFA9AD71C91D5E2B9491E0594C975D; this approval-status metadata change is not another whole review.
- [x] User written-plan and Native execution approval2026-10-14. Actual user Chrome/P09, new dependencies/permissions/transmissions and publication remain separate STOP gates.
- [ ] Tasks1–6 local implementation/verification, then whole-F00 final review.
- [ ] Separate F00 publication instruction, F01 work and future native/store acceptance. No automatic continuation across those gates.

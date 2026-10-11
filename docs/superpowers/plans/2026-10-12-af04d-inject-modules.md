# AF04-D Inject Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the existing chat, sidebar, popup, page decoration, and coordination responsibilities into strict TypeScript modules while preserving the single `web/inject.js` deployment contract and every current user-visible behavior.

**Architecture:** Narrow site-adapter capabilities locate site-owned DOM. Feature-specific modules retain their own policy and lifecycle, while `coordinator.ts` performs only ordered reconciliation and owner generation management. `entry.ts` installs the coordinator once, and `scripts/main-runtime.mjs` deterministically generates the existing classic-IIFE output.

**Tech Stack:** TypeScript 7.0.2 strict mode, esbuild 0.28.2 classic IIFE, Node 24 test runner, jsdom, Playwright installed-extension E2E.

**Spec:** `docs/superpowers/specs/2026-10-12-af04-feature-modules-design.md`

## Global Constraints

- Start only after AF04-C is merged; consume its typed preview contract without broadening it.
- Keep `web/inject.js`, manifest order, package resource count, current endpoint, request credentials, timeouts, cache limits, localStorage key, labels, selectors' meaning, and status reasons.
- Do not add a generic feature manager, style manager, document-wide observer, polling loop, dependency, permission, storage key, endpoint, telemetry, or packaged source.
- Site-owned hashed selectors and native-control lookup belong in narrow adapter capabilities; standard elements, ARIA roles, URLs, and `.knife-*`/`data-knife-*` ownership selectors may remain in feature modules.
- Preserve one sidebar observer and refresh timer per current sidebar root, one chat observer per current chat root, the runtime's one document observer, and current bounded controller retry behavior.
- Preserve the exact coordinator order: copy config/i18n, update following mode, retire detached popups, handle excluded/not-ready state, replace the owner and its mode/home/start-time/popup-drop bindings, then reconcile sidebar, channel, chat, and banner responsibilities.
- A committed generated output is read-only outside `node scripts/main-runtime.mjs --write`.

## Review Focus

- Splitting the subscriber must not reorder reconciliation or let one feature failure prevent later features; Tasks 2 and 4 pin call order and per-feature failure isolation.
- Following auto-expand must preserve manual collapse across owner replacement and wide/normal uncertainty without repeated clicks; Tasks 2 and 3 own the complete settlement matrix.
- Deleted-chat handling must preserve native dispatch, identity checks, hostile accessor/thenable rejection, and exact re-hide ownership; Tasks 2 and 3 retain every existing adversarial test.
- Late popup drag, metadata fetch, observer, and timer callbacks must not mutate replaced or disposed owners; Task 4 adds generation and identity race cases.
- Adapter growth must remain narrow and return only DOM identity, semantic enums, primitives, or identity-checked operations—never raw React/controller values; Task 1 owns graph and capability tests.

---

### Task 1: Move site-owned DOM discovery behind narrow adapter capabilities

**Files:**
- Modify: `src/main/site-adapter/contracts.ts`
- Modify: `src/main/site-adapter/capabilities.ts`
- Modify: `tests/adapter-capabilities.test.cjs`
- Modify: `tests/adapter.test.cjs`
- Modify: `tests/main-runtime-generation.test.cjs`
- Modify: `tests/integration.test.cjs`
- Modify: `tests/fixtures/runtime-executable-baseline.json`
- Generate: `web/site-adapter.js`

**Interfaces:**
- Adds `ChatDomCapabilities` methods to find the live/VOD chat container, log root, message rows, timestamp target, and deleted-text targets. Existing `readMessage` and `connect` remain unchanged.
- Adds `SidebarSectionKind = 'popular' | 'schedule' | 'partner' | 'shortcut'` and `FollowingControls` containing only current `Element`/`HTMLButtonElement` identities.
- Adds sidebar capabilities to enumerate top-level sections, classify one section, locate following controls, and read wide/normal mode as `boolean | null`.
- Adds page capabilities to locate the channel tab list, typed live/VOD start targets and trusted VOD link, and the banner root. Existing `video.openDate` and `banner.closeHandler` remain unchanged.
- Does not expose selector strings, React fibers, controller objects, callbacks other than the existing identity-checked banner operation, or mutable site data.

- [ ] **Step 1: Add failing capability and type tests**

Add exact tests for live and VOD chat roots, reused chat rows, top-level versus nested sidebar sections, compact services, following control replacement, known/unknown view mode, channel-only tab lists, current live/VOD start targets, foreign-origin VOD links, and absent banner controls. Assert capability results contain only DOM elements, semantic enums, primitives, and existing safe operations.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test tests/adapter-capabilities.test.cjs tests/adapter.test.cjs tests/integration.test.cjs tests/main-runtime-generation.test.cjs tests/type-foundation.test.cjs`

Expected: FAIL because the new DOM capabilities do not exist.

- [ ] **Step 3: Implement the smallest selector adapters**

Move only the current site-owned hashed/native selectors and structural lookup into `createSiteCapabilities`. Reuse current URL validation and DOM APIs; do not move chat disclosure policy, section hiding policy, following intent, cache policy, or popup behavior into the adapter. Catch selector or accessor failure at the capability boundary and return the existing unavailable result.

- [ ] **Step 4: Prove graph and behavior compatibility**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json`

Run: `node scripts/main-runtime.mjs --write`

Run: `node --test tests/adapter-capabilities.test.cjs tests/adapter.test.cjs tests/integration.test.cjs tests/sidebar-sections.test.cjs tests/following-settlement.test.cjs tests/deleted-chat.test.cjs tests/main-runtime-generation.test.cjs`

Expected: all pass; generated `web/site-adapter.js` is current, `web/inject.js` still runs from the handwritten authority, and no existing selector behavior changes.

- [ ] **Step 5: Commit**

```bash
git add src/main/site-adapter/contracts.ts src/main/site-adapter/capabilities.ts web/site-adapter.js tests/adapter-capabilities.test.cjs tests/adapter.test.cjs tests/main-runtime-generation.test.cjs tests/integration.test.cjs tests/fixtures/runtime-executable-baseline.json
git commit -m "refactor: add inject DOM adapter capabilities"
```

### Task 2: Characterize the complete inject ownership and ordering contract

**Files:**
- Create: `tests/inject-coordinator.test.cjs`
- Modify: `tests/integration.test.cjs`
- Modify: `tests/following-settlement.test.cjs`
- Modify: `tests/sidebar-sections.test.cjs`
- Modify: `tests/deleted-chat.test.cjs`
- Modify: `tests/multi-page-settings.test.cjs`

**Interfaces:**
- Produces test-only observations for reconcile call order, owner generation, observer/timer count, status ownership, popup registry lifetime, and final versus persisted pagehide.
- Changes no product API or product output.

- [ ] **Step 1: Add passing characterization for the current single subscriber**

Record the exact ordered effects for initial not-ready state, ready live/VOD/channel/home routes, same-generation notifications, owner replacement, excluded navigation, and final pagehide. Count observers, refresh/settlement/controller-retry timers, popup scopes, native callback replacements, and owned DOM nodes before and after disposal.

- [ ] **Step 2: Add route and feature responsibility coverage**

Prove the test matrix covers:

- chat resize, timestamps, donation filter, deleted-message reveal and re-hide;
- sidebar markers, refresh, following settlement, preview/popup anchor binding;
- popup URL validation, drag interruption, z-order, close, and iframe retirement;
- channel chat button, live/VOD start annotations, metadata cache/timeout, banner close, and exact home marker;
- config changes that do not replace the current owner but do resync owned features.

- [ ] **Step 3: Run the characterization suite against handwritten `web/inject.js`**

Run: `node --test tests/inject-coordinator.test.cjs tests/integration.test.cjs tests/following-settlement.test.cjs tests/sidebar-sections.test.cjs tests/deleted-chat.test.cjs tests/multi-page-settings.test.cjs tests/sidebar-preview-followup.test.cjs`

Expected: all pass without editing product code. If a proposed assertion contradicts current verified behavior, correct the assertion or stop for a behavior-change decision; do not silently redefine parity.

- [ ] **Step 4: Commit tests only**

```bash
git add tests/inject-coordinator.test.cjs tests/integration.test.cjs tests/following-settlement.test.cjs tests/sidebar-sections.test.cjs tests/deleted-chat.test.cjs tests/multi-page-settings.test.cjs
git commit -m "test: lock inject module boundaries"
```

### Task 3: Replace the handwritten inject authority with typed feature modules

**Files:**
- Create: `src/main/features/inject/contracts.ts`
- Create: `src/main/features/inject/chat.ts`
- Create: `src/main/features/inject/sidebar.ts`
- Create: `src/main/features/inject/popup.ts`
- Create: `src/main/features/inject/page.ts`
- Create: `src/main/features/inject/coordinator.ts`
- Create: `src/main/features/inject/entry.ts`
- Modify: `src/main/runtime/contracts.ts`
- Modify: `scripts/main-runtime.mjs`
- Modify: `tests/main-runtime-generation.test.cjs`
- Modify: `tests/type-foundation.test.cjs`
- Modify: `tests/fixtures/runtime-executable-baseline.json`
- Modify: `.gitattributes`
- Generate: `web/inject.js`

**Interfaces:**
- `PopupRegistry` exposes only `open(url, left, top, labels)`, `retireDetached()`, and `dispose()`; it validates a same-origin 32-hex live URL before creating an iframe.
- `ChatFeature` owns chat-root records and exposes `reconcile(container, isLive, owner, config)` plus `dispose()`.
- `SidebarFeature` owns cross-generation following intent and exposes `reconcile(root, state, owner, config)` plus `dispose()`; it consumes only typed preview and popup contracts.
- `PageFeature` owns channel/start-time/banner/home/drop bindings and exposes ordered `mountOwner(state, owner, config, labels)`, `reconcileChannel(state, owner)`, `reconcileBanner(state, owner)`, and `dispose()` operations.
- `startCoordinator(target: Window): boolean` installs at most once, subscribes once, records its unsubscribe, and publishes `coordinatorStarted` only after all feature objects are constructed.
- Adds `{source:'src/main/features/inject/entry.ts', output:'web/inject.js', kind:'feature-inject'}` to `MAIN_RUNTIME_ENTRIES`.

- [ ] **Step 1: Make the generation contract fail before moving product logic**

Extend generator tests to expect all four feature outputs, require the inject graph to stay under `src/main/features/inject/**` plus typed runtime/adapter/preview contracts, reject raw React/webpack/controller APIs, require the generated marker and LF, and reject direct output edits.

Run: `node --test tests/main-runtime-generation.test.cjs tests/type-foundation.test.cjs`

Expected: FAIL for the missing inject entry and output authority.

- [ ] **Step 2: Move popup and page responsibilities without policy changes**

Move current same-origin live URL validation, iframe attributes, drag cleanup, z-index, metadata endpoint/cache/timeout, channel button, banner operation, and home marker verbatim in behavior. Keep metadata cache at 100 entries and 30 minutes, request timeout at 5 seconds, and `credentials:'include'`. Do not create new diagnostics or retain response bodies.

- [ ] **Step 3: Move chat responsibilities without weakening hostile-input checks**

Move width persistence, timestamps, bounded controller retries, donation filter, deleted-message retention, native callback order, accessor/thenable rejection, row identity, foreign marker ownership, and re-hide behavior. Use only Task 1 adapter ports for site-owned discovery and controller operations. Keep every current adversarial deleted-chat test unchanged unless only a generated marker line shifts.

- [ ] **Step 4: Move sidebar responsibilities with intent state outside owner scopes**

Move section classification results, owned marker cleanup, 30-second refresh, quiet settlement/deadline, manual collapse/cancellation, wide/normal uncertainty, preview binding, and popup drag payload. Preserve one automatic activation per restoration and never renew the original deadline on control or owner replacement.

- [ ] **Step 5: Implement the coordinator with explicit sequential reconciliation**

Construct feature objects before setting `coordinatorStarted`. In one guarded subscriber, perform the Global Constraints order synchronously; call each feature in its own `try` boundary and map failure only to that feature's existing statuses. On owner-generation change, dispose the old owner once, create the next owner, and call `page.mountOwner` before sidebar reconciliation. Reconcile channel after sidebar, chat after channel, and banner last. On excluded navigation retire owned popups; on persisted pagehide keep resumable state; on final pagehide unsubscribe, dispose owner/features/popups, and ignore late work.

- [ ] **Step 6: Generate once and run all focused parity tests**

Run: `node scripts/main-runtime.mjs --write`

Update only the normalized executable hash for `web/inject.js`; the runtime JavaScript inventory and package resource list must not change.

Run: `node --test tests/main-runtime-generation.test.cjs tests/generated-runtime.test.cjs tests/type-foundation.test.cjs tests/adapter-capabilities.test.cjs tests/inject-coordinator.test.cjs tests/integration.test.cjs tests/following-settlement.test.cjs tests/sidebar-sections.test.cjs tests/deleted-chat.test.cjs tests/sidebar-preview-followup.test.cjs tests/multi-page-settings.test.cjs tests/package.test.cjs tests/runtime-inventory.test.cjs`

Run: `node scripts/main-runtime.mjs`

Expected: all pass, a second render is byte-identical, and the installed output still contains exactly one `web/inject.js`.

- [ ] **Step 7: Commit the single authority switch**

```bash
git add .gitattributes scripts/main-runtime.mjs src/main/features/inject src/main/runtime/contracts.ts web/inject.js tests/main-runtime-generation.test.cjs tests/type-foundation.test.cjs tests/fixtures/runtime-executable-baseline.json
git commit -m "refactor: generate inject runtime from TypeScript"
```

### Task 4: Prove cross-feature failure isolation and late-callback safety

**Files:**
- Modify: `src/main/features/inject/chat.ts`
- Modify: `src/main/features/inject/sidebar.ts`
- Modify: `src/main/features/inject/popup.ts`
- Modify: `src/main/features/inject/page.ts`
- Modify: `src/main/features/inject/coordinator.ts`
- Modify: `tests/inject-coordinator.test.cjs`
- Modify: `tests/integration.test.cjs`
- Modify: `tests/following-settlement.test.cjs`
- Modify: `tests/deleted-chat.test.cjs`
- Modify: `tests/multi-page-settings.test.cjs`
- Modify: `tests/fixtures/runtime-executable-baseline.json`
- Generate: `web/inject.js`

**Interfaces:**
- Keeps Task 3 module interfaces unchanged.
- Produces no new product API; adds explicit tests for failure and disposal boundaries.

- [ ] **Step 1: Add failing per-feature isolation tests**

Inject one failure at a time from chat adapter lookup, sidebar capability lookup, preview attach, popup DOM construction, banner operation, metadata response parsing, status reporting, and one feature `dispose`. Assert later features still reconcile in the documented order, only owned statuses change, and coordinator subscription remains usable unless final disposal occurred.

- [ ] **Step 2: Add stale work and ownership tests**

Cover metadata resolution after route/href/root replacement, popup drag events after close/final pagehide, chat retry after controller/root replacement, following timers after wide/excluded/owner changes, external replacement of every owned marker, repeated final pagehide, persisted pagehide/pageshow, and a foreign pre-existing `coordinatorStarted` owner. Assert zero detached mutation, duplicate click, duplicate listener, or foreign cleanup.

- [ ] **Step 3: Implement only missing guards**

Use existing scope disposal, generation/element identity, request record, and feature-specific state. Do not add a shared manager or new retry loop. If a case requires changing user-visible behavior, stop and return to the AF04 design gate.

- [ ] **Step 4: Regenerate and run focused plus installed multi-page checks**

Run: `node scripts/main-runtime.mjs --write`

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json`

Run: `node --test tests/inject-coordinator.test.cjs tests/integration.test.cjs tests/following-settlement.test.cjs tests/sidebar-sections.test.cjs tests/deleted-chat.test.cjs tests/preview.test.cjs tests/sidebar-preview-followup.test.cjs tests/multi-page-settings.test.cjs tests/tool-warning-remediation.test.cjs`

Run: `node scripts/check-installed-extension.mjs`

Run: `node scripts/check-installed-extension-negative.mjs`

Expected: all pass with page-local settings/media, no cross-window disposal, no stale callback mutation, and no new executable warning.

- [ ] **Step 5: Commit**

```bash
git add src/main/features/inject web/inject.js tests/inject-coordinator.test.cjs tests/integration.test.cjs tests/following-settlement.test.cjs tests/deleted-chat.test.cjs tests/multi-page-settings.test.cjs tests/fixtures/runtime-executable-baseline.json
git commit -m "test: isolate inject feature lifecycles"
```

### Task 5: Close AF04-D and AF04 with full gates and public evidence

**Files:**
- Create: `docs/superpowers/validation/2026-10-12-af04d-inject-modules.md`
- Modify: `PLANS.md`

**Interfaces:**
- Produces the immutable AF04-D product commit, validation record, rollback range, AF04 completion state, and AF05 cursor.

- [ ] **Step 1: Run the complete local gate**

Run in order:

```powershell
node --test --test-concurrency=1 tests/*.test.cjs
node scripts/check-toolchain.mjs
node scripts/check-runtime-inventory.mjs
node node_modules/typescript/bin/tsc -p tsconfig.json
node scripts/settings-runtime.mjs
node scripts/main-runtime.mjs
node scripts/check-build-proof.mjs
node scripts/build.mjs
node scripts/check-package.mjs dist
node scripts/check-audio-quality.mjs --chrome
node scripts/check-installed-extension.mjs
node scripts/check-installed-extension-negative.mjs
node scripts/tool-audit.mjs
git -c core.safecrlf=false diff --check
```

Expected: product gates pass. Inspect and record any known tool observation; a nonzero audit is not clean merely because it predates AF04.

- [ ] **Step 2: Perform branch-wide review and remediate Critical/Important findings**

Review `main...HEAD` for responsibility omissions, coordinator ordering, selector leakage, raw site values, observer/timer growth, async identity, deleted-chat integrity, data/permission drift, generated authority, multi-window isolation, and missing rollback coverage. Add the smallest regression test for every accepted finding.

- [ ] **Step 3: Record validation and roadmap state**

Record exact product SHA, test counts, generated raw/normalized hashes, package inventory, objective audio metrics, installed positive/negative E2E, tool audit, known limitations, and `git revert -m 1 <merge>` rollback. Mark AF04 complete only after A–D merge evidence exists; move the cursor to AF05 without starting F00–F05.

- [ ] **Step 4: Commit documentation, open a Korean PR, and wait for public CI**

```bash
git add docs/superpowers/validation/2026-10-12-af04d-inject-modules.md PLANS.md
git commit -m "docs: validate AF04-D inject migration"
```

Create a Korean PR. Merge only after Windows/Ubuntu foundation and full verify pass, then use the existing status-lock pattern without recording a moving latest-main SHA.

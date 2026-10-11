# AF00 Installed MV3 Extension E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic Playwright harness that loads an isolated verified `dist` as a real Chrome MV3 extension and proves the popup, service worker, ISOLATED bridge, MAIN runtime, settings, styles, multiple windows, BFCache lifecycle handling and extension reload contracts before feature work resumes.

**Architecture:** Reuse `verifyCandidate()` to build an isolated package, launch Playwright's bundled Chromium with a fresh persistent profile, and fulfill an exact allowlist of `https://chzzk.naver.com/*` fixture requests locally. Keep browser/profile data private under ignored `output`, save only bounded fixture traces and JSON reports, and keep real-site smoke checks separate from the deterministic acceptance gate.

**Tech Stack:** Chrome Manifest V3, JavaScript ESM, Node 24.19.0, Node test runner, Playwright 1.62.1 bundled Chromium, existing package verifier and owned-files capability layer.

**Spec:** `docs/superpowers/specs/2026-10-11-ai-friendly-foundation-design.md`

## Global Constraints

- Support Google Chrome semantics only; do not restore Firefox build or test targets.
- Load an isolated candidate `dist`; never overwrite the root `dist` used by the installed development extension.
- Use Playwright bundled Chromium with a persistent context and `channel: 'chromium'`; do not fall back to branded Chrome or a user's profile.
- Do not use real accounts, cookies, broadcasts, chat, payments or age-restricted content.
- Intercept every `http:`/`https:` request and abort it unless its exact URL is present in the fixture allowlist. Do not intercept the candidate's own `chrome-extension:` resources.
- Do not add permissions, host permissions, data storage, remote code, `eval`, `new Function` or CDN dependencies.
- Keep runtime validation and existing tests; E2E supplements rather than replaces them.
- Always close the browser before removing its profile and candidate directories.
- Never commit `dist`, browser profiles, traces, screenshots or `output/**`.
- Product behavior must remain unchanged in AF00.

## Review Focus

- Missing or incompatible bundled Chromium must fail with `browser-unavailable`; it must not silently use installed Chrome or the daily user profile. Task 3 pins this.
- Missing, duplicate or malformed extension service workers must fail within a bounded timeout and still clean the profile/candidate. Tasks 3 and 4 pin this.
- Any non-fixture request, including analytics, media, API or favicon traffic, must be aborted and recorded without sending credentials. Tasks 2 and 4 pin this.
- MV3 idle suspension and `chrome.runtime.reload()` may race with worker discovery; the harness must reacquire a valid worker and never reuse an invalid extension ID. Task 6 pins this.
- Playwright does not support a real BFCache restoration. Task 6 therefore pins installed-script handling with synthetic persisted lifecycle events and keeps real back/forward restoration outside the deterministic pass gate.
- A closed or replaced style target must not reload another CHZZK tab or window; only the exact original `{tabId, windowId}` can be reloaded. Task 5 pins this.

---

### Task 1: Isolated candidate lifecycle

**Files:**
- Modify: `scripts/verify-candidate.mjs`
- Create: `tests/installed-extension-candidate.test.cjs`

**Interfaces:**
- Consumes: existing `verifyCandidate(id: string)` and `openOwnedRoot()`.
- Produces: `removeCandidate(id: string): Promise<boolean>`; it validates the same alphanumeric ID and removes only `output/tool-audit/p02-candidate-${id}`.

- [ ] **Step 1: Write failing lifecycle tests**

Add tests named:

```js
test('removeCandidate rejects every ID rejected by verifyCandidate', async () => { /* same invalid ID table; code === candidate-id-invalid */ });
test('removeCandidate removes only its exact generated candidate root', async t => { /* sibling sentinel survives; first result true, second false */ });
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/installed-extension-candidate.test.cjs`

Expected: FAIL because `removeCandidate` is not exported.

- [ ] **Step 3: Implement the minimal cleanup interface**

Add `removeCandidate(id)` beside `verifyCandidate(id)`. Share one `validateCandidateId(id)` function so creation and cleanup cannot drift. Return the boolean from `repository.removeTree()` and do not accept an absolute path from callers.

- [ ] **Step 4: Run focused and existing package tests**

Run:

```powershell
node --test tests/installed-extension-candidate.test.cjs tests/package.test.cjs tests/owned-files.test.cjs
```

Expected: PASS; the Windows junction tests may require the already-approved non-sandboxed Node execution.

- [ ] **Step 5: Commit**

```powershell
git add scripts/verify-candidate.mjs tests/installed-extension-candidate.test.cjs
git commit -m "test: isolate installed extension candidate lifecycle"
```

### Task 2: Closed-world CHZZK fixture routing

**Files:**
- Create: `scripts/extension-e2e/fixture-router.mjs`
- Create: `tests/fixtures/installed-extension/live.html`
- Create: `tests/fixtures/installed-extension/channel.html`
- Create: `tests/fixtures/installed-extension/site.js`
- Create: `tests/installed-extension-fixture.test.cjs`

**Interfaces:**
- Consumes: repository `openOwnedRoot()` for regular-file reads.
- Produces: `FIXTURE_LIVE_URL`, `FIXTURE_CHANNEL_URL`, `loadFixtureResponses(files)`, and `fixtureDecision(url, responses)` returning exactly `{ action: 'fulfill', status, contentType, body }` or `{ action: 'abort', reason: 'not-allowlisted' }`.

- [ ] **Step 1: Write failing allowlist tests**

Pin these assertions:

```js
assert.equal(FIXTURE_LIVE_URL, 'https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
assert.equal(FIXTURE_CHANNEL_URL, 'https://chzzk.naver.com/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
assert.equal(fixtureDecision(FIXTURE_LIVE_URL, responses).action, 'fulfill');
assert.equal(fixtureDecision('https://api.chzzk.naver.com/service/v1/foo', responses).action, 'abort');
assert.equal(fixtureDecision('https://chzzk.naver.com/favicon.ico', responses).action, 'abort');
assert.equal(fixtureDecision('https://example.com/', responses).action, 'abort');
```

Also assert that duplicate response URLs, query-string variants and non-HTTPS variants are rejected rather than normalized into the allowlist.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/installed-extension-fixture.test.cjs`

Expected: FAIL because the router and fixture files do not exist.

- [ ] **Step 3: Add minimal deterministic fixtures**

`live.html` must contain only the current minimum integration anchors: `#layout-body`, `#live_player_layout`, one `.pzp-pc`, one `<video>`, `#sidebar`, a ranking element matching `live_chatting_ranking_container__fixture`, and links to both fixture routes. `channel.html` provides the second SPA/back-forward destination without a player.

`site.js` must expose `window.__knifeFixture` with `loads`, `pageshowPersisted`, `pagehidePersisted`, route history, and the last observed cheese-knife config envelope metadata `{ requestId, revision }`, stored only in that fixture document/session. It must not retain the config body or perform network requests.

- [ ] **Step 4: Implement the exact response map**

`loadFixtureResponses(files)` reads the three regular fixture files once. `fixtureDecision()` matches exact URL strings only. The Playwright adapter in Task 4 installs routing only for `http:` and `https:` requests, translates `fulfill` to `route.fulfill()`, and translates every other network result to `route.abort('blockedbyclient')`. Candidate-owned `chrome-extension:` resources continue locally and are never sent to the network.

- [ ] **Step 5: Run the test and confirm GREEN**

Run: `node --test tests/installed-extension-fixture.test.cjs`

Expected: PASS with no external request accepted.

- [ ] **Step 6: Commit**

```powershell
git add scripts/extension-e2e/fixture-router.mjs tests/fixtures/installed-extension tests/installed-extension-fixture.test.cjs
git commit -m "test: add closed-world CHZZK extension fixtures"
```

### Task 3: Persistent Chromium extension harness

**Files:**
- Create: `scripts/extension-e2e/harness.mjs`
- Create: `tests/installed-extension-harness.test.cjs`

**Interfaces:**
- Consumes: Playwright `chromium`, an absolute verified candidate `dist`, an absolute fresh profile directory and an absolute artifact directory.
- Produces:
  - `parseInstalledE2EArgs(argv): { headed: boolean, runId: string }`
  - `extensionLaunchOptions(extensionPath, headed): object`
  - `extensionIdFromWorkerURL(url): string`
  - `waitForExtensionWorker(context, timeoutMs = 15000): Promise<Worker>`
  - `launchInstalledExtension({ chromiumApi, extensionPath, profilePath, artifactPath, headed }): Promise<{ context, worker, extensionId }>`

- [ ] **Step 1: Write failing pure-contract tests**

Test exact accepted CLI forms: no flags, `--headed`, and one `--run-id=ASCIIALNUM`. Reject duplicate flags, unknown flags, empty IDs, separators and IDs longer than 64 characters.

Assert launch options include:

```js
{
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
}
```

Assert `extensionIdFromWorkerURL()` accepts only `chrome-extension://` plus exactly 32 lowercase `a`–`p` characters and a `/background.js` path.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/installed-extension-harness.test.cjs`

Expected: FAIL because the harness does not exist.

- [ ] **Step 3: Implement parsing and launch-option functions**

Default `runId` is `installed` plus `Date.now().toString(36)` and eight lowercase hex characters from `randomBytes(4)`, normalized to the alphanumeric validator. Do not add a keep-profile option.

- [ ] **Step 4: Implement bounded worker discovery and launch**

`waitForExtensionWorker()` accepts exactly one worker whose URL passes `extensionIdFromWorkerURL()`. Zero workers wait for the event up to 15 seconds; more than one valid worker fails `extension-worker-ambiguous`. Map executable-not-found or launch failures to `browser-unavailable` while preserving the cause.

- [ ] **Step 5: Add injected fake-context tests**

Use fake context/worker objects to assert timeout, ambiguous worker, malformed URL and launch failure codes. Assert every failure closes a context returned before worker validation completes.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run: `node --test tests/installed-extension-harness.test.cjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add scripts/extension-e2e/harness.mjs tests/installed-extension-harness.test.cjs
git commit -m "test: add persistent MV3 extension harness"
```

### Task 4: Installed popup-to-MAIN settings scenario

**Files:**
- Create: `scripts/check-installed-extension.mjs`
- Create: `tests/installed-extension-runner.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Tasks 1–3, existing `verifyCandidate()`, existing `checkPackage()` and production extension pages.
- Produces: `runInstalledExtensionE2E(options): Promise<InstalledE2EReport>`, report sections `worker`, `popup`, `storage`, `isolatedBridge`, `mainRuntime`, `invalidMessage`, `staleRevision`, `damagedStorage`, and package script `test:e2e` equal to `node scripts/check-installed-extension.mjs`.

- [ ] **Step 1: Write failing runner lifecycle tests**

Inject fake `verifyCandidate`, `launchInstalledExtension`, fixture router and cleanup dependencies. Assert the runner always orders lifecycle as candidate build → profile creation → browser launch → scenarios → context close → profile removal → candidate removal. Assert cleanup still runs after scenario, tracing and JSON-write failures.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/installed-extension-runner.test.cjs`

Expected: FAIL because the runner does not exist.

- [ ] **Step 3: Implement the isolated run wrapper**

Create artifacts under `output/playwright/installed-extension-${runId}` and the temporary profile with `openOwnedRoot().makeTempDirectory('output/playwright/installed-profile-')`. Store `summary.json`, and only on failure store `trace.zip` and a bounded screenshot. Never copy the profile into artifacts.

- [ ] **Step 4: Implement the base real-extension scenario**

The scenario must:

1. install the verified candidate and discover the worker/extension ID;
2. route all browser requests through Task 2;
3. navigate to `FIXTURE_LIVE_URL` and wait for `window[Symbol.for('cheese-knife.runtime.v1')]`;
4. open `chrome-extension://${extensionId}/popup.html`;
5. wait for `#settings-status[data-phase="ready"]`;
6. clear `#arrowSeek` using a real locator action;
7. query `chrome.storage.local` through the worker and assert `config.arrowSeek === false`;
8. assert the fixture MAIN runtime receives `config.arrowSeek === false`;
9. assert page errors, unhandled runner errors and non-allowlisted fulfilled requests are empty.

The scenario restores nothing because the profile and candidate are deleted after the run.

- [ ] **Step 5: Add malformed-boundary scenarios**

From the installed popup page, send one malformed settings message and assert the broker returns `invalid-request` without changing storage or revision. From the fixture page, use the bounded envelope metadata captured by `site.js` to publish an otherwise valid MAIN config envelope whose revision is lower than the accepted revision and assert `runtime.config.arrowSeek` remains false.

Then save the valid storage snapshot, write an invalid string `settingsRevision`, reload the extension, and assert a new popup reaches `data-phase="repair-required"` without changing the malformed value. Restore the saved snapshot through the test page, reload the extension again, and require the popup and MAIN handshake to return to ready before later tasks reuse the context. All direct storage mutation is confined to the fresh test profile.

- [ ] **Step 6: Add the package script and run the real scenario**

Run:

```powershell
npx playwright install chromium
npm run test:e2e
```

Expected: exit 0 and every report section produced by this task is passed. If the browser is already installed, the install command is a no-op.

- [ ] **Step 7: Run focused and existing settings tests**

Run:

```powershell
node --test tests/installed-extension-runner.test.cjs tests/settings-contract.test.cjs tests/settings-client.test.cjs tests/settings-broker.test.cjs tests/settings-ui.test.cjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add scripts/check-installed-extension.mjs tests/installed-extension-runner.test.cjs package.json package-lock.json
git commit -m "test: exercise installed popup settings flow"
```

### Task 5: Multi-window synchronization and exact style target

**Files:**
- Modify: `scripts/check-installed-extension.mjs`
- Modify: `tests/installed-extension-runner.test.cjs`

**Interfaces:**
- Consumes: `runInstalledExtensionE2E()` and the valid worker from Task 4.
- Produces: report sections `multiWindow`, `runtimeIsolation`, `concurrentSettings`, and `styleTargetReload`.

- [ ] **Step 1: Add failing scenario-order and assertion tests**

Pin that `multiWindow` runs only after the base handshake and that failure in one subscenario records its code without skipping browser/profile cleanup.

- [ ] **Step 2: Implement two-window creation through the extension worker**

Use `chrome.windows.create({ url: FIXTURE_LIVE_URL })` through `worker.evaluate()`, wait for the new Playwright page, and obtain both CHZZK `{tabId, windowId}` pairs through `chrome.tabs.query()`. Assert IDs are different and both MAIN runtimes become ready.

- [ ] **Step 3: Test concurrent popup fields**

Open two extension popup pages. In the first set `#arrowSeek` false; in the second set `#previewVolume` to `25` using real input events before the other page is reloaded. Wait until both popup pages render false/25 and worker storage contains both values at one final revision.

- [ ] **Step 4: Test exact styles target**

Open `styles.html?targetTabId=<first>&targetWindowId=<firstWindow>`, enable `#hide-ranking`, wait for ready CSS registration, and click `#reload`. Assert the first fixture load counter increments exactly once, the second does not reload, and the ranking fixture computes `display: none` after the first reload.

Close the first target before a second reload attempt and assert the reply is `target-missing` or `target-changed`; the second tab/window load counter must remain unchanged.

- [ ] **Step 5: Test tab/window runtime isolation**

Before closing the first target, capture both pages' runtime generations, owned-control counts, fixture load counters and second page video properties. Close only the first target and assert the second MAIN runtime remains ready at the same generation, its fixture counter and video properties are unchanged, and a fresh settings update reaches it. Run the existing multi-page, audio and preview isolation tests in the focused gate; do not claim that silent fixture media proves real broadcast audio quality.

- [ ] **Step 6: Run focused and real E2E**

Run:

```powershell
node --test tests/installed-extension-runner.test.cjs tests/settings-style-apply.test.cjs tests/settings-ui.test.cjs tests/multi-page-settings.test.cjs tests/audio.test.cjs tests/preview.test.cjs
npm run test:e2e
```

Expected: PASS; report contains two distinct windows and no cross-target reload.

- [ ] **Step 7: Commit**

```powershell
git add scripts/check-installed-extension.mjs tests/installed-extension-runner.test.cjs
git commit -m "test: cover installed multi-window settings"
```

### Task 6: Worker suspension, BFCache lifecycle and extension reload

**Files:**
- Modify: `scripts/extension-e2e/harness.mjs`
- Modify: `scripts/check-installed-extension.mjs`
- Modify: `tests/installed-extension-harness.test.cjs`
- Modify: `tests/installed-extension-runner.test.cjs`

**Interfaces:**
- Consumes: current `{context, worker, extensionId}`.
- Produces: `reacquireExtensionWorker(context, previousWorker, timeoutMs): Promise<{ worker, extensionId }>` and report sections `workerWake`, `bfcacheLifecycle`, `contextReload`.

- [ ] **Step 1: Write failing worker reacquisition tests**

Assert idle suspension may return the same Playwright Worker object only when its URL still validates. Extension reload must return a new valid worker and recalculate the extension ID. Timeout, malformed replacement and two replacement workers fail with explicit codes.

- [ ] **Step 2: Implement bounded reacquisition**

Do not infer liveness from object identity. Evaluate a harmless `chrome.runtime.id` probe with a 15-second bound, then enumerate/wait for valid workers. Never reuse a previous extension ID after `chrome.runtime.reload()`.

- [ ] **Step 3: Add the real idle wake scenario**

Before the idle period, set a test-only random sentinel on the service worker global through `worker.evaluate()`. Close extension pages, make no extension calls for 35 seconds, reopen the popup, and wait for ready. Assert false/25 settings remain and the sentinel is absent after wake, proving that global worker state did not survive. Record whether the Playwright Worker object was reused, but do not require a new object because Playwright preserves the same object across MV3 idle suspension. The sentinel must never be written to extension storage or product source.

- [ ] **Step 4: Add the installed BFCache lifecycle scenario**

On the first installed fixture page, dispatch a real `PageTransitionEvent('pagehide', { persisted: true })`, then `PageTransitionEvent('pageshow', { persisted: true })`. Require one active runtime generation, preserved false/25 settings, resumed timers and no duplicate `.knife-owned` controls. Follow with a non-persisted `pagehide` on a disposable fixture page and assert final cleanup. Keep existing jsdom BFCache state-transition tests in the focused gate.

Do not call this an actual browser BFCache restoration: Playwright disables BFCache by default and documents real restoration as unsupported even when explicitly enabled. Do not remove Playwright default arguments or use `page.goBack()` as a release gate. A real Chrome back/forward run may be recorded later as non-gating smoke evidence.

- [ ] **Step 5: Add the extension reload/context invalidation scenario**

Call `chrome.runtime.reload()` from a throwaway extension page, accept context destruction only at that trigger boundary, and reacquire a newly started valid worker. Recalculate the extension ID from the new worker URL even when the value is unchanged for the same path. Close the old CHZZK page and assert no page error contains `Extension context invalidated`. Open a new fixture page and assert a fresh settings handshake reaches MAIN.

- [ ] **Step 6: Run focused lifecycle tests and real E2E**

Run:

```powershell
node --test tests/installed-extension-harness.test.cjs tests/installed-extension-runner.test.cjs tests/bridge-cleanup.test.cjs tests/integration.test.cjs
npm run test:e2e
```

Expected: PASS with `workerWake`, `bfcacheLifecycle`, and `contextReload` all passed and bounded runtime below 150 seconds.

- [ ] **Step 7: Commit**

```powershell
git add scripts/extension-e2e/harness.mjs scripts/check-installed-extension.mjs tests/installed-extension-harness.test.cjs tests/installed-extension-runner.test.cjs
git commit -m "test: cover installed MV3 lifecycle boundaries"
```

### Task 7: Negative control and CI gate

**Files:**
- Create: `scripts/check-installed-extension-negative.mjs`
- Create: `tests/installed-extension-negative.test.cjs`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`

**Interfaces:**
- Consumes: verified candidate builder and base installed scenario.
- Produces: package script `test:e2e:negative` and a pull-request CI job that runs unit/package/E2E gates.

- [ ] **Step 1: Write failing negative-control tests**

The negative runner must copy a verified candidate to a new owned private directory, remove only the manifest content-script entry whose `world` is `MAIN`, run the base scenario, and accept success only when the scenario fails with `main-runtime-missing`. Assert all other failure codes make the negative runner fail.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/installed-extension-negative.test.cjs`

Expected: FAIL because the negative runner does not exist.

- [ ] **Step 3: Implement the private mutation control**

Never modify source or root `dist`. Write the mutated manifest only under ignored `output`, run the base handshake with a 15-second bound, write a bounded report, then remove the mutated package and profile in `finally`.

- [ ] **Step 4: Add CI workflow**

Create a pull-request and `main` push workflow with least-privilege `contents: read`. Use `actions/checkout@v6`, `actions/setup-node@v6` with Node 24, `npm ci --ignore-scripts`, `npx playwright install --with-deps chromium`, `npm test`, `npm run build`, `npm run check`, `node scripts/check-audio-quality.mjs`, `npm run test:e2e`, and `npm run test:e2e:negative` in that order. The CI audio check uses the same bundled Chromium and synthetic silent sink, not branded Chrome or real media. Upload only `output/playwright/installed-extension-*/` on failure with seven-day retention; explicitly exclude profile directories.

- [ ] **Step 5: Run both positive and negative gates locally**

Run:

```powershell
npm run test:e2e
npm run test:e2e:negative
```

Expected: both commands exit 0; the negative report proves the positive scenario rejected the missing MAIN runtime.

- [ ] **Step 6: Commit**

```powershell
git add scripts/check-installed-extension-negative.mjs tests/installed-extension-negative.test.cjs .github/workflows/ci.yml package.json package-lock.json
git commit -m "ci: gate changes with installed MV3 E2E"
```

### Task 8: AF00 acceptance and documentation

**Files:**
- Modify: `README.md`
- Modify: `README-en.md`
- Modify: `PLANS.md`
- Create: `docs/superpowers/validation/2026-10-11-af00-installed-extension-e2e.md`

**Interfaces:**
- Consumes: Tasks 1–7 and their private reports.
- Produces: public AF00 commands, reproducible validation boundaries and the AF01 handoff state.

- [ ] **Step 1: Run the complete automated gate**

Run:

```powershell
npm test
npm run build
npm run check
node scripts/check-audio-quality.mjs
npm run test:e2e
npm run test:e2e:negative
node scripts/tool-audit.mjs
git -c core.safecrlf=false diff --check
```

Expected: all functional/package/E2E commands exit 0. Record the audit's actual guarded-boundary status separately rather than calling it a clean scan.

- [ ] **Step 2: Inspect package boundaries**

Assert source and built package manifests retain the same permissions/host permissions, no fixture/profile/trace/test/source-map file appears in `dist`, and `check-package.mjs dist` passes.

- [ ] **Step 3: Write the validation record**

Record commit, Node/Chromium/Playwright versions, candidate/report identifiers, scenario results, negative-control result, runtime, excluded real-site/account scope and rollback command. Do not publish profile contents or raw cookies/storage.

- [ ] **Step 4: Update public commands and roadmap cursor**

Add `npm run test:e2e` as the optional installed-extension developer check in both README files. Mark AF00 complete in `PLANS.md`, move the current cursor to AF01 design, and keep F00–F05 `BACKLOG-BLOCKED`.

- [ ] **Step 5: Review the complete branch**

Review the branch diff for unrelated product changes, weakened tests, network escapes, new permissions, committed artifacts, stale temporary profiles and documentation contradictions. Re-run any affected focused test after fixes.

- [ ] **Step 6: Commit**

```powershell
git add README.md README-en.md PLANS.md docs/superpowers/validation/2026-10-11-af00-installed-extension-e2e.md
git commit -m "docs: record installed MV3 E2E acceptance"
```

## Implementation Completion Gate

AF00 is complete only when all eight tasks are committed, positive and negative installed-extension gates pass from a fresh profile, CI passes on the same branch, private profiles are absent after success and failure, and review finds no product behavior, permission or data-contract expansion. AF01 planning begins only after that evidence is recorded.

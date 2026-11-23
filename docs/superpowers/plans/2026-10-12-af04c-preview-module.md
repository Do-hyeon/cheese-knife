# AF04-C Preview Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move sidebar preview intent, panel, metadata request, HLS playback, audio policy, and recovery into a strict TypeScript graph without changing the existing `web/preview.js` behavior or data scope.

**Architecture:** The entry installs one typed `PreviewController`; `panel.ts` owns hover identity and extension DOM while `playback.ts` owns one bounded request/HLS/media session. Both use a single feature scope and explicit generation tokens, then bundle to the existing classic IIFE output.

**Tech Stack:** TypeScript 7.0.2, esbuild 0.28.2, bundled pinned HLS light build, Node 24, jsdom, Playwright Chromium.

**Spec:** `docs/superpowers/specs/2026-10-12-af04-feature-modules-design.md`

## Global Constraints

- Start only after AF04-B merge; preserve `web/preview.js` name and manifest position.
- Keep same-origin 32-hex live URLs, current live-detail endpoint, `credentials:'include'`, timeout, TTL, cache size, hover delay, HLS options, recovery count, startup deadline, volume, and audio fallback.
- Do not add requests, persisted cache, telemetry, DRM/age bypass, native-card interception, worker code, or remote script.
- Diagnostics may contain bounded playback metrics and reason codes, never stream URLs, response payloads, cookies, or error objects.
- Keep the bundled HLS provenance and hardening gates unchanged.

## Review Focus

- A late response or playback rejection from hover A must never modify hover B; Task 1 and Task 3 pin token/identity races.
- Autoplay rejection may spend one muted fallback for the original audio intent only; Task 2 preserves the revision and fallback budget.
- HLS fatal recovery, initial deadline, and stalled-progress timers must be bounded and cancelled on hide; Task 3 owns timer/recovery tests.
- Authenticated adult playback is allowed only when the current API returns a usable HLS path; 401/403 and absent playback remain limited; Task 2 owns these cases.
- Panel removal, route change, sidebar replacement, visibility loss, and final pagehide must destroy only the current session; Task 3 owns lifecycle cleanup.

---

### Task 1: Type the preview ABI and hover/session identity

**Files:**
- Create: `src/main/features/preview/contracts.ts`
- Modify: `src/main/runtime/contracts.ts`
- Modify: `tests/preview.test.cjs`
- Modify: `tests/type-foundation.test.cjs`

**Interfaces:**
- `PreviewController` exposes the current `diagnostics`, `show(href, anchor, tooltip?)`, and `hide(href?)` API.
- `PreviewIntent` contains validated `id`, `href`, `anchor`, `route`, `live`, and captured `startUnmuted`.
- `PreviewSession` owns `token`, abort, timers, backend, media, and `dispose()`; it is not published on runtime.

- [ ] **Step 1: Add failing contract and identity tests**

Pin duplicate install/foreign controller preservation, invalid URL rejection before fetch, same anchor with changed URL, route change, sidebar ownership, and stale hover A after B. Assert `KnifeRuntime.preview` is a typed optional controller.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `node --test tests/preview.test.cjs tests/type-foundation.test.cjs`

Expected: FAIL for the missing contract/source identity helpers.

- [ ] **Step 3: Define the public types without broad response models**

Represent network JSON as `unknown`; validate only code/content/status/adult/openDate/image/playback fields consumed today. Do not create a type that asserts the whole CHZZK response.

- [ ] **Step 4: Run strict and focused tests**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json`

Run: `node --test tests/preview.test.cjs tests/type-foundation.test.cjs`

Expected: strict types and current runtime identity characterizations pass without changing product wiring.

- [ ] **Step 5: Commit**

```bash
git add src/main/features/preview/contracts.ts src/main/runtime/contracts.ts tests/preview.test.cjs tests/type-foundation.test.cjs
git commit -m "refactor: type preview runtime contract"
```

### Task 2: Move panel, request, and playback into the generated graph

**Files:**
- Create: `src/main/features/preview/panel.ts`
- Create: `src/main/features/preview/playback.ts`
- Create: `src/main/features/preview/entry.ts`
- Modify: `scripts/main-runtime.mjs`
- Modify: `tests/main-runtime-generation.test.cjs`
- Modify: `tests/preview.test.cjs`
- Modify: `tests/preview-audio-start.test.cjs`
- Modify: `tests/sidebar-preview-followup.test.cjs`
- Modify: `tests/fixtures/runtime-executable-baseline.json`
- Modify: `.gitattributes`
- Generate: `web/preview.js`

**Interfaces:**
- `installPreview(target: Window): PreviewController | null` installs a complete controller only once.
- `createPanel(runtime, scope): PreviewPanel` owns panel DOM, placement, thumbnail, uptime and audio notice.
- `createPlayback(runtime, panel, intent, info): PreviewSession` owns one video/HLS attempt and bounded recoveries.
- Adds `kind:'feature-preview'` to `MAIN_RUNTIME_ENTRIES`.

- [ ] **Step 1: Add failing output/graph tests**

Expect a deterministic classic `web/preview.js`, graph limited to preview modules and type-only contracts, LF, no maps/remote imports, no raw HLS URL in diagnostics, and read-only drift behavior.

- [ ] **Step 2: Add response-boundary and privacy tests**

Add malformed/accessor response objects, oversized/invalid playback JSON, non-HTTPS path, missing content, 401/403, adult with returned HLS, adult without HLS, cache eviction at 101, and diagnostics sanitization. Accessors must not be invoked where own data validation is required.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `node --test tests/main-runtime-generation.test.cjs tests/preview.test.cjs tests/preview-audio-start.test.cjs tests/sidebar-preview-followup.test.cjs`

Expected: FAIL for the missing preview entry and new validators.

- [ ] **Step 4: Move behavior without changing timing or policy**

Preserve request timeout 5000ms, cache OPEN 30000ms/other 5000ms, cache limit 100, delay clamp 100–3000ms, HLS buffers 8/16/0, recovery budget 2, network recovery delay 500ms, progress timeout 10000ms, and startup deadline 15000ms. Spend muted fallback before awaiting and bind it to audio revision.

- [ ] **Step 5: Generate and pin the output**

Run: `node scripts/main-runtime.mjs --write`

Update only the normalized preview executable hash after focused tests pass.

- [ ] **Step 6: Verify the generated preview**

Run: `node --test tests/main-runtime-generation.test.cjs tests/preview.test.cjs tests/preview-audio-start.test.cjs tests/sidebar-preview-followup.test.cjs tests/multi-page-settings.test.cjs tests/package.test.cjs`

Run: `node scripts/main-runtime.mjs`

Expected: all pass and second generation is byte-identical.

- [ ] **Step 7: Commit**

```bash
git add .gitattributes scripts/main-runtime.mjs src/main/features/preview web/preview.js tests/main-runtime-generation.test.cjs tests/preview.test.cjs tests/preview-audio-start.test.cjs tests/sidebar-preview-followup.test.cjs tests/fixtures/runtime-executable-baseline.json
git commit -m "refactor: generate preview runtime from TypeScript"
```

### Task 3: Lock asynchronous failure isolation and cleanup

**Files:**
- Modify: `src/main/features/preview/panel.ts`
- Modify: `src/main/features/preview/playback.ts`
- Modify: `tests/preview.test.cjs`
- Modify: `tests/preview-audio-start.test.cjs`
- Modify: `tests/sidebar-preview-followup.test.cjs`
- Modify: `tests/multi-page-settings.test.cjs`
- Modify: `tests/fixtures/runtime-executable-baseline.json`
- Generate: `web/preview.js`

**Interfaces:**
- Keeps Task 2 public API unchanged.
- Every async completion uses `session.active()` to recheck token, anchor, href, route, sidebar ownership, config, visibility, and scope.

- [ ] **Step 1: Add failing late-completion and disposal tests**

Cover abort ignored by fetch, unresolved play after hide, old MANIFEST_PARSED, delayed network recovery, media recovery followed by route replacement, removed panel, sidebar replacement, visibility hidden, config OFF, persisted pagehide, final pagehide twice, and a throwing runtime status callback.

- [ ] **Step 2: Run focused race suites**

Run: `node --test tests/preview.test.cjs tests/preview-audio-start.test.cjs tests/sidebar-preview-followup.test.cjs tests/multi-page-settings.test.cjs`

Expected: failures identify missing active/disposal guards rather than being hidden by longer waits.

- [ ] **Step 3: Apply the smallest session guards**

Use one generation token and one session disposer. Destroy only the current backend/media, clear every owned timer, and never let a stale session set `preview`/`livePreview` status for a newer intent.

- [ ] **Step 4: Run privacy, strict, generation, and HLS gates**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json`

Run: `node scripts/main-runtime.mjs --write`

Run: `node scripts/main-runtime.mjs`

Run: `node --test tests/preview.test.cjs tests/preview-audio-start.test.cjs tests/sidebar-preview-followup.test.cjs tests/hls-compatibility.test.cjs tests/hls-hardening-negative-controls.test.cjs tests/hls-parser-bounds.test.cjs tests/hls-provenance.test.cjs tests/hls-verification.test.cjs tests/hls-verifier.test.cjs`

Expected: all pass with no new network or diagnostic field.

- [ ] **Step 5: Commit**

```bash
git add src/main/features/preview web/preview.js tests/preview.test.cjs tests/preview-audio-start.test.cjs tests/sidebar-preview-followup.test.cjs tests/multi-page-settings.test.cjs tests/fixtures/runtime-executable-baseline.json
git commit -m "test: isolate preview session lifecycle"
```

### Task 4: Close AF04-C with full gates and public evidence

**Files:**
- Create: `docs/superpowers/validation/2026-10-12-af04c-preview-module.md`
- Modify: `PLANS.md`

**Interfaces:**
- Produces immutable AF04-C validation, rollback, and AF04-D cursor.

- [ ] **Step 1: Run the complete gate from AF04-A Task 4**

Additionally confirm pinned HLS regeneration/provenance and preview diagnostic privacy tests. The objective audio gate remains mandatory because preview owns an audible video path.

- [ ] **Step 2: Review the entire AF04-C branch**

Focus on response validation, credentials and endpoint invariants, cache bounds, async token ownership, autoplay policy, HLS recovery, timer convergence, data leakage, generated graph, package drift, and unrelated native audio. Fix Critical/Important findings with regression tests.

- [ ] **Step 3: Record validation and commit**

Record exact tests, HLS checks, audio evidence, request/data invariants, generated hashes, installed E2E, tool audit, limitations, and rollback.

```bash
git add docs/superpowers/validation/2026-10-12-af04c-preview-module.md PLANS.md
git commit -m "docs: validate AF04-C preview migration"
```

- [ ] **Step 4: Open a Korean PR and merge only after all public checks pass**

Advance to AF04-D only after merge and status evidence are fixed.

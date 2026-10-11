# AF04-A Audio Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing compressor and Gain runtime into a strict TypeScript source graph while preserving `web/audio.js`, its public ABI, and its measured audio output.

**Architecture:** `src/main/features/audio/entry.ts` installs one `AudioController` on the existing runtime symbol. Pure curve/delay math is separated from the stateful Web Audio controller, and `scripts/main-runtime.mjs` deterministically generates the existing `web/audio.js` classic IIFE without changing manifest order.

**Tech Stack:** TypeScript 7.0.2 strict mode, esbuild 0.28.2 classic IIFE, Node 24 test runner, jsdom, Playwright Chromium audio measurement.

**Spec:** `docs/superpowers/specs/2026-10-12-af04-feature-modules-design.md`

## Global Constraints

- Keep Chrome MV3 minimum Chrome 121 and the current `web/audio.js` manifest position.
- Do not change permissions, host permissions, storage keys, endpoints, remote code, package resources, or version.
- Preserve `knifeGain`, Gain range 0–2, compressor parameter ranges/fallbacks, limiter curve, crossfade duration, retirement timing, and pagehide behavior exactly.
- Never call `createMediaElementSource()` before all reversible graph nodes have been prepared.
- Do not add dependencies, source maps, packaged TypeScript, telemetry, or a generic feature manager.
- A committed generated output is read-only outside `node scripts/main-runtime.mjs --write`.

## Review Focus

- Delay/limiter node construction failure must leave native media unintercepted; Task 2 adds the pre-interception failure assertions.
- A late `AudioContext.resume()` after OFF or video replacement must not create a source; Task 3 pins generation and identity rechecks.
- Player control remount and BFCache must preserve the same video's requested compressor path; Task 3 owns these lifecycle tests.
- Malformed/inaccessible `knifeGain` storage must fall back to 1 without breaking playback; Task 2 pins storage reads and writes.
- Subscriber errors, repeated disable/dispose, and a foreign pre-existing `runtime.audio` must not corrupt another owner; Tasks 2 and 3 pin installation ownership.

---

### Task 1: Type the current audio ABI and characterize installation

**Files:**
- Create: `src/main/features/audio/contracts.ts`
- Modify: `src/main/runtime/contracts.ts`
- Modify: `tests/type-foundation.test.cjs`

**Interfaces:**
- Produces `AudioState = 'off' | 'pending' | 'on' | 'unavailable'`.
- Produces `AudioController` with current methods: `setEnabled`, `getState`, `setGain`, `configure`, `bypass`, `subscribe`, `eligible`.
- Changes `KnifeRuntime.audio?: unknown` to `KnifeRuntime.audio?: AudioController` through a type-only import.

- [ ] **Step 1: Add a failing type contract test**

Add an assertion named `audio runtime contract is explicit and typechecked` for the current public methods and state union. Runtime ownership belongs to Task 2, where an entry exists to exercise.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `node --test tests/type-foundation.test.cjs tests/audio.test.cjs`

Expected: FAIL because `AudioController` is not defined.

- [ ] **Step 3: Define only the existing public interface**

Use exact DOM types and `Promise<AudioState>` for `setEnabled`. `subscribe(video, callback)` returns `() => boolean` because `Set.delete` is the current observable return. Do not expose internal entry/node types through `KnifeRuntime`.

- [ ] **Step 4: Run strict and focused checks**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json`

Run: `node --test tests/type-foundation.test.cjs tests/audio.test.cjs`

Expected: strict and focused checks pass with no skipped or pending test.

- [ ] **Step 5: Commit**

```bash
git add src/main/features/audio/contracts.ts src/main/runtime/contracts.ts tests/type-foundation.test.cjs
git commit -m "refactor: type audio runtime contract"
```

### Task 2: Generate `web/audio.js` from the TypeScript audio graph

**Files:**
- Create: `src/main/features/audio/curve.ts`
- Create: `src/main/features/audio/controller.ts`
- Create: `src/main/features/audio/entry.ts`
- Modify: `scripts/main-runtime.mjs`
- Modify: `tests/main-runtime-generation.test.cjs`
- Modify: `tests/audio.test.cjs`
- Modify: `tests/fixtures/runtime-executable-baseline.json`
- Modify: `.gitattributes`
- Generate: `web/audio.js`

**Interfaces:**
- `compressorDelay(sampleRate: number): number` preserves current integer-frame and 1023-frame cap behavior.
- `limiterCurve(): Float32Array` preserves the 4097-point shared curve and 0.98 bound.
- `installAudio(target: Window): AudioController | null` returns the installed controller, or `null` when runtime is absent or already owns audio.
- Adds `{source:'src/main/features/audio/entry.ts', output:'web/audio.js', kind:'feature-audio'}` to `MAIN_RUNTIME_ENTRIES`.

- [ ] **Step 1: Extend generation tests before source creation**

Change the expected output set to runtime, site adapter, and audio. Assert the audio graph contains only `src/main/features/audio/**` plus type-erased imports, the output is classic IIFE with the runtime symbol, LF is pinned, stale output is read-only, and direct edits fail drift validation.

- [ ] **Step 2: Add audio trust-boundary tests before moving code**

Keep every existing `tests/audio.test.cjs` assertion and add:

```js
test('audio preparation failure before source creation preserves the native path', ...)
test('invalid or inaccessible gain storage falls back without blocking audio', ...)
test('audio entry does not publish a partial controller after startup failure', ...)
test('audio entry preserves an existing foreign controller', ...)
```

Assert `createMediaElementSource` call count stays zero for every reversible-node construction failure.

- [ ] **Step 3: Run tests and confirm the new generation contract fails**

Run: `node --test tests/main-runtime-generation.test.cjs tests/audio.test.cjs tests/type-foundation.test.cjs`

Expected: FAIL for missing audio entry/output and partial-controller tests.

- [ ] **Step 4: Move math and controller code with no value changes**

Move the current number validation, delay, curve, graph connection, bypass, retirement, Gain transition, entry WeakMap and connected Set into the named source files. Capture browser constructors and timers through `Window & typeof globalThis`; treat caught values as `unknown` and map only existing reason codes.

- [ ] **Step 5: Install only a complete controller and generate the output**

`entry.ts` reads the runtime own descriptor, calls `installAudio`, and does not overwrite a pre-existing controller. Add LF rules for `web/audio.js`. Run `node scripts/main-runtime.mjs --write`, then update only the normalized executable hash for the generated audio output.

- [ ] **Step 6: Verify focused behavior and generated drift**

Run: `node --test tests/main-runtime-generation.test.cjs tests/generated-runtime.test.cjs tests/audio.test.cjs tests/type-foundation.test.cjs tests/runtime-inventory.test.cjs tests/package.test.cjs`

Run: `node scripts/main-runtime.mjs`

Expected: all pass and a second render produces byte-identical `web/audio.js`.

- [ ] **Step 7: Commit**

```bash
git add .gitattributes scripts/main-runtime.mjs src/main/features/audio web/audio.js tests/main-runtime-generation.test.cjs tests/audio.test.cjs tests/fixtures/runtime-executable-baseline.json
git commit -m "refactor: generate audio runtime from TypeScript"
```

### Task 3: Prove lifecycle, failure isolation, and objective parity

**Files:**
- Modify: `src/main/features/audio/controller.ts`
- Modify: `src/main/features/audio/entry.ts`
- Modify: `tests/audio.test.cjs`
- Modify: `tests/multi-page-settings.test.cjs`
- Modify: `tests/tool-warning-remediation.test.cjs`
- Modify: `tests/fixtures/runtime-executable-baseline.json`
- Modify: `scripts/audio-artifacts.mjs` only if the generated artifact description requires no semantic change
- Generate: `web/audio.js`

**Interfaces:**
- Consumes the Task 2 `AudioController` unchanged.
- Produces no new product API; adds lifecycle and measurement evidence.

- [ ] **Step 1: Add failing lifecycle isolation tests**

Add exact cases for OFF during pending resume, final pagehide twice, BFCache persisted, same-video control remount, selected-video replacement, one subscriber throwing while another receives the update, and a late retirement timer after scope disposal. Assert only `compressor` status changes on owned failures.

- [ ] **Step 2: Run focused tests and observe any parity failures**

Run: `node --test tests/audio.test.cjs tests/multi-page-settings.test.cjs tests/tool-warning-remediation.test.cjs`

Expected: PASS only when TypeScript behavior matches all current lifecycle contracts; fix implementation, never weaken assertions.

- [ ] **Step 3: Run objective browser audio checks**

Run: `node scripts/check-audio-quality.mjs --chrome`

Expected: source/compressor node counts remain 1, over-full-scale samples remain 0, stress peak stays at or below the approved bound, all sample-rate alignments pass, and 250/750/1000Hz transitions match the checked baseline.

- [ ] **Step 4: Run strict generation and installed-page isolation checks**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json`

Run: `node scripts/main-runtime.mjs --write`

Run: `node scripts/main-runtime.mjs`

Run: `node --test tests/audio.test.cjs tests/player.test.cjs tests/multi-page-settings.test.cjs tests/integration.test.cjs`

Expected: all pass with no extra audio source, timer, listener, or cross-page mutation.

- [ ] **Step 5: Commit**

```bash
git add src/main/features/audio tests/audio.test.cjs tests/multi-page-settings.test.cjs tests/tool-warning-remediation.test.cjs tests/fixtures/runtime-executable-baseline.json scripts/audio-artifacts.mjs web/audio.js
git commit -m "test: lock audio module lifecycle parity"
```

### Task 4: Close AF04-A with full gates and public evidence

**Files:**
- Create: `docs/superpowers/validation/2026-10-12-af04a-audio-module.md`
- Modify: `PLANS.md`

**Interfaces:**
- Produces the immutable AF04-A product commit, validation record, rollback commit range, and AF04-B cursor.

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

Expected: product gates pass. Preserve any known tool observations explicitly; do not call a nonzero audit clean without inspecting its report.

- [ ] **Step 2: Perform branch-wide review and remediate Critical/Important findings**

Review `main...HEAD` for graph authority, Web Audio irreversibility, lifecycle ownership, data/permission drift, generated-output safety, and test gaps. Add the smallest regression test for each accepted finding.

- [ ] **Step 3: Record validation and roadmap state**

Record exact product SHA, test counts, audio metrics, generated raw/normalized hashes, tool audit, limitations, and `git revert -m 1 <merge>` rollback. Set AF04-A to PR/CI pending and AF04-B blocked until merge.

- [ ] **Step 4: Commit documentation, open a Korean PR, and wait for public CI**

```bash
git add docs/superpowers/validation/2026-10-12-af04a-audio-module.md PLANS.md
git commit -m "docs: validate AF04-A audio migration"
```

Create a Korean PR. Merge only after Windows/Ubuntu foundation and full verify pass; then follow the existing status-lock pattern without recording a moving latest-main SHA.

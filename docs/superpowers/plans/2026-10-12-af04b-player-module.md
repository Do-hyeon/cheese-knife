# AF04-B Player Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move seeking, press-to-2x, statistics, and compressor controls into a strict TypeScript player graph without changing player behavior or the `web/player.js` deployment contract.

**Architecture:** Pure seek/range logic and DOM control ownership are separate modules bundled by `src/main/features/player/entry.ts`. The player consumes only the AF04-A `AudioController` and AF03 primitive adapter metrics; it never receives raw React, webpack, or core-player objects.

**Tech Stack:** TypeScript 7.0.2, esbuild 0.28.2 classic IIFE, Node 24, jsdom, existing installed-extension E2E.

**Spec:** `docs/superpowers/specs/2026-10-12-af04-feature-modules-design.md`

## Global Constraints

- Start only after AF04-A is merged and use its exact `AudioController` interface.
- Keep `web/player.js`, manifest order, UI labels, SVG paths, 48px Gain slider, 8px spacing, keyboard behavior, and status reasons.
- Do not invent bitrate/latency, broaden selectors, change seek step, hold duration, pointer threshold, or click-token timeout.
- Keep site internals behind `SiteAdapter.player.readMetrics` and extension-owned DOM under `.knife-*`.
- Do not add dependencies, permissions, storage, endpoint, packaged files, or user-visible options.

## Review Focus

- Sparse/gapped seek ranges and a finite live duration must clamp exactly as today; Task 1 owns table-driven range tests.
- Pointer cancellation, another pointer, config OFF, route disposal, and delayed native click must restore the user's playback rate; Task 2 owns hold-state tests.
- Player UI remount with the same video must not bypass audio, while a selected-video replacement must; Task 3 pins identity behavior.
- Native control child replacement must restore one owned control without duplicate listeners; Task 3 owns remount tests.
- Missing adapter/audio or a throwing metrics promise must limit only the owning feature and leave other subscribers alive; Task 3 owns failure isolation.

---

### Task 1: Type the player ABI and characterize seek logic

**Files:**
- Create: `src/main/features/player/contracts.ts`
- Modify: `src/main/runtime/contracts.ts`
- Modify: `tests/player.test.cjs`
- Modify: `tests/type-foundation.test.cjs`

**Interfaces:**
- `PlayerStats` has nullable `resolution`, `bitrate`, `latency`, and `codec`.
- `PlayerController` exposes `seek(backward: boolean): boolean`, `liveEdge(): void`, `ranges(video: HTMLVideoElement): readonly [number, number][]`, and `readStats(video, metrics): PlayerStats`.
- The public contract describes only current runtime methods; pure seek helpers remain an implementation detail of Task 2.

- [ ] **Step 1: Add failing contract and range-table tests**

Cover empty seekable/buffered, invalid or reversed ranges, a gap in both directions, first/last edge, 0.05-second end reserve, and finite live duration. Assert the public controller signature replaces `KnifeRuntime.player?: unknown`.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test tests/player.test.cjs tests/type-foundation.test.cjs`

Expected: FAIL because the typed player contract is absent.

- [ ] **Step 3: Define only the current public contract**

Do not add unused runtime helpers. The table-driven tests continue exercising current `web/player.js`; Task 2 moves that already-characterized arithmetic into `seek.ts` when the generated output changes authority.

- [ ] **Step 4: Run strict and focused tests**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json`

Run: `node --test tests/player.test.cjs tests/type-foundation.test.cjs`

Expected: strict types and current runtime range tests pass without changing generated product output.

- [ ] **Step 5: Commit**

```bash
git add src/main/features/player/contracts.ts src/main/runtime/contracts.ts tests/player.test.cjs tests/type-foundation.test.cjs
git commit -m "refactor: type player seek contract"
```

### Task 2: Move player controls and hold state into TypeScript

**Files:**
- Create: `src/main/features/player/seek.ts`
- Create: `src/main/features/player/controls.ts`
- Create: `src/main/features/player/entry.ts`
- Modify: `scripts/main-runtime.mjs`
- Modify: `tests/main-runtime-generation.test.cjs`
- Modify: `tests/player.test.cjs`
- Modify: `tests/stats.test.cjs`
- Modify: `tests/fixtures/runtime-executable-baseline.json`
- Modify: `.gitattributes`
- Generate: `web/player.js`

**Interfaces:**
- `installPlayer(target: Window): PlayerController | null` installs only after runtime exists and no player controller is present.
- `mountPlayer(runtime, snapshot): PlayerMount` returns an owned mount with `dispose()` and current identity.
- `syncControls(mount): void` is idempotent for native child replacement.
- Adds the existing output as `kind:'feature-player'` in `MAIN_RUNTIME_ENTRIES`.

- [ ] **Step 1: Add failing generator graph assertions**

Expect `web/player.js` from the player entry, classic IIFE, LF, no source map, no raw adapter API, and a graph limited to player modules plus type-only contracts.

- [ ] **Step 2: Add hold-state characterization before moving code**

Retain every existing player test and add explicit cases for top-level duplicate install, startup failure before publication, a throwing label getter, and simultaneous pointer IDs. Assert a foreign `runtime.player` remains untouched.

- [ ] **Step 3: Run focused tests and confirm generation failure**

Run: `node --test tests/main-runtime-generation.test.cjs tests/player.test.cjs tests/stats.test.cjs tests/type-foundation.test.cjs`

Expected: FAIL for the missing player entry/output.

- [ ] **Step 4: Move controls with exact ownership and timing**

Move the characterized range arithmetic into `seek.ts`, and move SVG construction, label allowlist, stats overlay, compressor controls, press-to-2x state and global capture listeners into `controls.ts`. Preserve range order, seekable-to-buffered fallback, 0.05-second end reserve, 500ms hold, 10px movement threshold, 1000ms click token, pointer identity, user-selected playbackRate restoration and exact owned-node cleanup.

- [ ] **Step 5: Wire AF04-A audio and adapter metrics narrowly**

Use `runtime.audio?` only through `AudioController`; do not cast to internal audio nodes. Use `runtime.adapter?.player.readMetrics(layout)` and handle rejection as existing unknown metrics without exposing the error.

- [ ] **Step 6: Generate and verify the player output**

Run: `node scripts/main-runtime.mjs --write`

Update the normalized player executable hash only after behavior tests pass.

Run: `node --test tests/main-runtime-generation.test.cjs tests/player.test.cjs tests/stats.test.cjs tests/audio.test.cjs tests/tool-warning-remediation.test.cjs tests/package.test.cjs`

Expected: all pass; second generation is byte-identical.

- [ ] **Step 7: Commit**

```bash
git add .gitattributes scripts/main-runtime.mjs src/main/features/player web/player.js tests/main-runtime-generation.test.cjs tests/player.test.cjs tests/stats.test.cjs tests/fixtures/runtime-executable-baseline.json
git commit -m "refactor: generate player runtime from TypeScript"
```

### Task 3: Isolate mount, subscriber, and lifecycle failures

**Files:**
- Modify: `src/main/features/player/controls.ts`
- Modify: `src/main/features/player/entry.ts`
- Modify: `tests/player.test.cjs`
- Modify: `tests/integration.test.cjs`
- Modify: `tests/multi-page-settings.test.cjs`
- Modify: `tests/fixtures/runtime-executable-baseline.json`
- Generate: `web/player.js`

**Interfaces:**
- Keeps Task 2 public APIs unchanged.
- An internal guarded subscriber maps owned failures to `player` or `statistics` without throwing into unrelated feature callbacks.

- [ ] **Step 1: Add failing identity and failure-isolation tests**

Add exact tests for same-video native control remount, selected-video replacement, route replacement during active hold, repeated final pagehide, persisted pagehide, metrics resolution after overlay disposal, audio unavailable, and one player callback failure followed by a working unrelated subscriber.

- [ ] **Step 2: Run focused tests**

Run: `node --test tests/player.test.cjs tests/audio.test.cjs tests/integration.test.cjs tests/multi-page-settings.test.cjs`

Expected: accepted parity tests pass; new failure paths fail before the minimal guard/identity fix.

- [ ] **Step 3: Apply minimal owner guards**

Keep a single current mount. Dispose only when config is unavailable, route/path changes, or pzp/video/layout identity changes. Late async stats writes must verify both mount and overlay scope. Never bypass audio for same-video UI replacement.

- [ ] **Step 4: Re-run strict, generation, and focused tests**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json`

Run: `node scripts/main-runtime.mjs --write`

Run: `node scripts/main-runtime.mjs`

Run: `node --test tests/player.test.cjs tests/audio.test.cjs tests/stats.test.cjs tests/integration.test.cjs tests/multi-page-settings.test.cjs`

Expected: all pass with one control set and no stale global listener.

- [ ] **Step 5: Commit**

```bash
git add src/main/features/player web/player.js tests/player.test.cjs tests/integration.test.cjs tests/multi-page-settings.test.cjs tests/fixtures/runtime-executable-baseline.json
git commit -m "test: isolate player module lifecycle"
```

### Task 4: Close AF04-B with full gates and public evidence

**Files:**
- Create: `docs/superpowers/validation/2026-10-12-af04b-player-module.md`
- Modify: `PLANS.md`

**Interfaces:**
- Produces immutable AF04-B validation, merge rollback, and AF04-C cursor.

- [ ] **Step 1: Run the complete local gate from AF04-A Task 4**

Also compare the new objective audio report with AF04-A because player owns compressor toggling and Gain UI. Expected: no numeric or artifact failure.

- [ ] **Step 2: Review the whole AF04-B branch**

Focus on pointer/click ordering, selected-video identity, audio API use, async overlay cleanup, global capture listeners, generated graph authority, and manifest/data drift. Fix Critical/Important findings with focused regression tests.

- [ ] **Step 3: Record evidence and commit**

Record exact test counts, audio comparison, generated hashes, installed E2E, tool audit, limitations, and rollback.

```bash
git add docs/superpowers/validation/2026-10-12-af04b-player-module.md PLANS.md
git commit -m "docs: validate AF04-B player migration"
```

- [ ] **Step 4: Open a Korean PR and merge only after all public checks pass**

After merge, advance the cursor to AF04-C without recording a moving latest-main SHA.

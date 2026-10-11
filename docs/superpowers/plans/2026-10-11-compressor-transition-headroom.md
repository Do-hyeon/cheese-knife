# Compressor Transition and Headroom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align dry/wet latency during compressor toggles and bound the enabled path to ±0.98 without changing existing controls or native-before-first-enable behavior.

**Architecture:** Add a dry delay using Chromium's integer compressor pre-delay frames for the active sample rate. Add a zero-oversampling WaveShaper soft ceiling after the user Gain on the wet branch; create every reversible node before media interception.

**Tech Stack:** Chrome MV3, Web Audio API, JavaScript IIFE modules, Node test runner, JSDOM fakes, Playwright system Chrome synthetic audio capture.

**Spec:** `docs/superpowers/specs/2026-10-11-compressor-transition-headroom-design.md`

## Global Constraints

- Work in the current branch and preserve all unrelated dirty-tree changes.
- Do not commit, stage, push, publish, tag, release, merge or change store state.
- Use TDD: every production behavior must first fail for the intended reason.
- No new permission, setting, UI, dependency, remote media, user profile or speaker output.
- Keep Gain range 0~2, 10ms Gain smoothing and 10ms dry/wet transition.
- Dry delay is `min(floor(float32(0.006) * float32(sampleRate)), 1023) / sampleRate`; limiter identity threshold is 0.9 and ceiling is 0.98.
- Build only an isolated candidate; replace root `dist` only after all local gates and review pass.

## Review Focus

- A delay/limiter constructor failure must occur before `createMediaElementSource`, leaving native audio untouched.
- Limiter values must be finite, odd, monotonic and never exceed ±0.98; sub-0.9 samples remain identity within Float32 precision.
- Repeated enable/configuration must not create additional delay/limiter nodes or reconnect parallel outputs.
- Retired paused media must retain one audible source→delay→dry→destination path and no wet output.
- Rapid toggles, BFCache and another window closing must not change the surviving document's state or graph.

---

### Task 1: Latency-matched dry branch

**Files:**
- Modify: `tests/audio.test.cjs`
- Modify: `scripts/check-audio-quality.mjs`
- Modify: `web/audio.js`

**Interfaces:**
- Consumes: existing `runtime.audio.setEnabled(video, enabled)` and graph lifecycle.
- Produces: each connected entry owns `dryDelay` aligned to Chromium's integer pre-delay frame at its context sample rate; source dry output is `source → dryDelay → dry`.

- [x] **Step 1: Add failing graph and failure-boundary tests**

Add tests named `dry bypass matches the Chromium compressor pre-delay at 48kHz`, `dry delay follows Chromium compressor integer frames at fractional and capped rates`, and `delay construction failure leaves native media unintercepted`. Assert 44.1/48/192kHz frame values, exact graph ownership, and source count 0 on failure.

- [x] **Step 2: Add the synthetic transition gate and verify RED**

In `scripts/check-audio-quality.mjs`, require every enabled toggle at 250/750/1000Hz in both directions to have `change.min8msRms >= 0.95 * min(before, after)` and no above-baseline adjacent-sample discontinuity. Preserve the pre-change report separately, then run `node scripts/check-audio-quality.mjs --chrome`.

Expected: nonzero exit naming the 250/750Hz transition threshold; 1kHz remains non-failing evidence.

- [x] **Step 3: Implement the fixed dry delay before media interception**

Create `entry.dryDelay = context.createDelay(0.02)`, set the current Chromium integer-frame delay, connect source→dryDelay→dry, and preserve that path during graph retirement. Do not change wet wiring yet.

- [x] **Step 4: Verify Task 1 GREEN**

Run `node --test tests/audio.test.cjs` and `node scripts/check-audio-quality.mjs --chrome`.

Expected: all audio unit tests pass; all six enabled transitions meet the RMS and discontinuity thresholds. The stress case remains reported but is not yet gated.

### Task 2: Bounded wet-path soft ceiling

**Files:**
- Modify: `tests/audio.test.cjs`
- Modify: `scripts/check-audio-quality.mjs`
- Modify: `web/audio.js`

**Interfaces:**
- Consumes: Task 1 `dryDelay` graph and existing compressor→`gainNode` output.
- Produces: `limiterCurve()` returns the shared 4097-entry Float32 curve; each entry owns `limiter` wired gainNode→limiter→wet.

- [x] **Step 1: Add failing limiter transfer and failure-boundary tests**

Add tests named `wet limiter is identity below point nine and bounded by point nine eight` and `limiter construction failure leaves native media unintercepted`. Assert finite/odd/monotonic curve values, Float32-tolerant identity below 0.9, endpoints ±0.98, `oversample === 'none'`, gain→limiter→wet wiring, and source count 0 on failure.

- [x] **Step 2: Gate extreme headroom and verify RED**

Require the separately labeled stress case to have peak ≤0.98 plus measurement tolerance and `overFullScaleSamples === 0`.

Run `node scripts/check-audio-quality.mjs --chrome`.

Expected: nonzero exit naming the stress peak/full-scale threshold.

- [x] **Step 3: Implement the Hermite soft ceiling before media interception**

Add the exact 0.9→0.98 odd monotonic 4097-point curve, create a WaveShaper with no oversampling, and place it after user Gain. Include limiter cleanup without changing dry ownership.

- [x] **Step 4: Verify Task 2 GREEN**

Run `node --test tests/audio.test.cjs tests/audio-metrics.test.cjs` and `node scripts/check-audio-quality.mjs --chrome`.

Expected: focused Node tests pass; toggle gates stay green; stress peak is ≤0.98 tolerance with zero samples above 1; ordinary sub-0.9 cases remain identity by curve contract.

### Task 3: Integrated regression, audit and independent review

**Files:**
- Modify: `PLANS.md`
- Modify: `docs/superpowers/validation/2026-10-11-recovery-release-gates.md`
- Create: `docs/superpowers/validation/2026-10-11-compressor-transition-headroom.md`
- Update private evidence under: `output/tool-audit/recovery-backlog/`

**Interfaces:**
- Consumes: Tasks 1–2 final graph and acceptance output.
- Produces: reproducible evidence, isolated candidate, and an installed-validation handoff only if local review is clean.

- [x] **Step 1: Run focused and full automated verification**

Run focused audio tests, the Chrome audio harness, then all `tests/*.test.cjs`. Require failure/cancelled/skipped 0.

- [x] **Step 2: Run static audit and package gates**

Run `node scripts/tool-audit.mjs`, preserve guarded boundary observations honestly, create a uniquely named isolated candidate, run package check, compare source/candidate hashes, JSON-parse evidence and run `git -c core.safecrlf=false diff --check`.

- [x] **Step 3: Request one Astra max whole-change review**

Provide the spec, plan, exact dirty diff for the audio files, RED/GREEN output and Review Focus. Re-grade findings by user effect. Fix Critical/Important once with a new RED→GREEN test and full green suite; ledger Minor findings without silently broadening scope.

- [x] **Step 4: Document completion and prepare installation handoff**

Record exact measurements, test counts, hashes, audit exit meaning, rulings and limitations. Do not promote root `dist` or request Chrome refresh until all previous steps pass.

## Execution Ruling

The repository is intentionally dirty and the user selected the current folder. Commit/worktree-oriented helper steps are therefore replaced by `PLANS.md` plus this checklist and private evidence. This costs commit-range isolation but avoids moving or overwriting unrelated user changes; every result is tied to file hashes and command output instead.

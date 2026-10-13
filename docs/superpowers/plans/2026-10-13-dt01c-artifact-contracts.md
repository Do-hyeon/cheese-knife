# DT01-C Artifact Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for the recommended Native execution after user approval. Track steps with checkboxes. No implementation subagents or per-task review dispatches; one fresh Astra max final review covers the local branch.

**Goal:** Type-check the actual artifact hash/comparison consumer while preserving the existing CLI, filesystem guards, raw outcomes and numeric policy.

**Architecture:** Move the fixed list, tolerances, projection/comparison and reader-based hash loop into one core module. Keep the existing artifact entry as the guarded filesystem/CLI boundary and re-export the same objects/functions. Reuse the existing bounded compiler-proof and isolated validation patterns, not a new framework.

**Tech Stack:** Existing Node24.19.0, TypeScript7.0.2 checkJs/JSDoc, node:test, Node crypto; existing pinned Playwright1.62.1, ESLint10.12.0 and audit tools. No dependency installation.

**Spec:** [DT01-C design](../specs/2026-10-13-dt01c-artifact-contract-design.md); [design review/amendments](../validation/2026-10-13-dt01c-design-review.md).

## Global Constraints

- This plan is for review, not execution permission. Obtain plan, Native and isolated execution approval before source/test/config/browser work. Local checkpoints only; **no push or PR without explicit user instruction**.
- Product TS/generated JS16, manifest/permissions, package/lock/npm/CI commands, version2.13.3, root dist58, released ZIP, frozen P02 baseline/ledger and protected branches/profiles remain unchanged. Never build in the root checkout.
- Keep `parseAudioQualityArgs` and `scripts/check-audio-quality.mjs` source unchanged. Label validation precedes the unchanged `openOwnedRoot` call. No new malformed-input policy, dependency, loader, serializer, filesystem implementation or cleanup redesign.
- Five paths remain `config.js`, `web/runtime.js`, `web/site-adapter.js`, `web/audio.js`, `web/player.js`, in this order. Absolute tolerance1e-7 and relative tolerance1e-6 remain unchanged.
- Six checked repository files only: signal, metrics, core and their three checked contract tests. Provider, legacy entry and browser producer remain unchecked; do not claim whole-tool typing or security certification.
- No user Chrome/profile/speaker/store/extension reload, native update/rollback, account or data collection work. Existing runner close-failure cleanup limitations remain explicit. Preserve clone/reports on abnormal termination; do not promise retention of a profile the runner already removed.
- DT01-C completion does not close all maintenance. Resolve DT01-S/DT02 explicitly before AF05-B; NUM01 is separate correctness policy. Keep B2 and F00-F05 acceptance gates unchanged.

## Review Focus

1. Reader method receiver, await order, Buffer subarray and rejection identity must survive the move; Task1 reader tests pin these, Task2 tests the genuine owned-root connection.
2. A reader supporting only config.js must be rejected despite method bivariance; Task1 tests a readonly function property, broad-string/Buffer success and a direct narrow-reader call failure.
3. Nullable alignment items and repeated baseline identity differ from projected case/transition items; Task1 pins typed positives and literal raw exceptions/nonfinite outcomes separately.
4. Array.isArray/Object.entries can erase useful internal types even with strict public signatures; Task1 mutates actual clean core source at nine boundaries and checks each target diagnostic.
5. A core split can silently leave exports, CLI linkage or audit coverage behind; Task1 checks object/function identity, Task2 verifies real delegation, six-file graph and actual source/input-hash/lint coverage.

## Interfaces shared by both tasks

Declare local JSDoc types in `scripts/audio-artifact-core.mjs`. Reuse type-only imports of `RmsEnvelope`, `ChannelMeasurement`, `CaptureSummary` from signal and `QualityCase`, `QualityTransition`, `DelayAlignment` from metrics. These imports stay within the approved graph.

```text
AudioArtifactPath = union of the five literal paths above
AudioArtifactReader = {readonly root:string; readonly readFile:(relative:AudioArtifactPath)=>Promise<Uint8Array>}
AudioArtifactFile = {path:AudioArtifactPath; sha256:string}
AudioArtifactDescription = {label:string; root:string; files:readonly AudioArtifactFile[]}
ComparableValue = number|string|boolean|null|undefined|readonly ComparableValue[]|{readonly[key:string]:ComparableValue}
OptionalFields<T> = {[K in keyof T]?:T[K]|undefined}
ComparisonEnvelope = OptionalFields<RmsEnvelope> & {readonly[key:string]:ComparableValue}
ComparisonChannel = OptionalFields<Pick<ChannelMeasurement,'rms'|'peak'|'overFullScaleSamples'|'maxAdjacentStep'|'thdPercent'>>
  & OptionalFields<{envelope8ms:ComparisonEnvelope|null}>
ComparisonWindow = OptionalFields<Pick<CaptureSummary,'sampleRate'|'windowSeconds'|'channelDifferenceRms'>>
  & OptionalFields<{channels:readonly(ComparisonChannel|null|undefined)[]|null}>
ComparisonCase = ComparisonWindow & OptionalFields<Pick<QualityCase,'frequency'|'inputAmplitude'|'gain'|'enabled'|'stereo'|'bursts'>>
ComparisonTransition = OptionalFields<Pick<QualityTransition,'frequency'|'kind'|'value'>>
  & OptionalFields<{before:ComparisonWindow|null; change:ComparisonWindow|null; after:ComparisonWindow|null}>
ComparisonAlignment = OptionalFields<DelayAlignment> & {readonly[key:string]:ComparableValue}
ComparisonStress = ComparisonWindow & OptionalFields<{profile:string}>
ComparisonFile = OptionalFields<{path:string; sha256:string}>
ComparisonArtifact = OptionalFields<{label:string; root:string; files:readonly ComparisonFile[]|null}>
AudioComparisonReport = OptionalFields<{
  artifact:ComparisonArtifact|null; qualityFailures:readonly string[]|null; nodes:ComparableValue;
  cases:readonly ComparisonCase[]|null; transitions:readonly ComparisonTransition[]|null;
  alignments:readonly(ComparisonAlignment|null|undefined)[]|null; stress:ComparisonStress|null
}>
ComparableMeasurement = {nodes:ComparableValue; cases:ComparableValue; transitions:ComparableValue; alignments:ComparableValue; stress:ComparableValue}
ComparableEntry = [string,ComparableValue]
describeAudioArtifactFiles(reader:AudioArtifactReader,label:string):Promise<AudioArtifactDescription>
compareAudioArtifactReports(reports?:readonly(AudioComparisonReport|null|undefined)[]):string[]
```

`ComparableMeasurement` deliberately has five named keys, not an arbitrary record. Partial transition kind/value remains uncorrelated; full DT01-B producer correlation is unchanged. Arrays are not dishonest five-file/two-channel tuples. Nullable case/transition items remain raw tests, not checked fixtures. Optional fields allow explicit undefined. No whole-report cast, unknown overload, ignore directive or createRequire bridge.

### Task 1: Checked core and independent compatibility proofs

**Files:** Create `scripts/audio-artifact-core.mjs`, `tests/audio-artifact-contract.test.cjs`, `tests/fixtures/audio-artifact-compatibility.json`. Modify `scripts/audio-artifacts.mjs`, `tests/audio-artifacts.test.cjs`, `tsconfig.audio-tools.json`, `tests/audio-signal-contract.test.cjs`.

**Interfaces:** Consume existing signal/metrics contracts and baseline artifact behavior. Produce the interfaces above and legacy re-exports of the identical comparison function, frozen list and tolerance values. During this task alone, the legacy describe function retains its existing hash loop/crypto import; Task2 removes that temporary duplication by real delegation.

- [x] **1. Pin the untouched baseline oracle.** Before production edits, verify `scripts/audio-artifacts.mjs` blob `aac259b58d5a0f370a374e53d9829b4c04093f20`. Add named raw input factories in the existing unchecked test and literal expected result/exception records in the JSON fixture. Record exact arrays, exception name/message and order, not includes-only checks. Do not derive expectations from the candidate helper. Keep undefined/NaN/Infinity/Symbol/sparse/getter inputs as JavaScript factories, not serialized inputs or a new tag parser.

  Cases: missing/non-array/empty/single reports; empty/null pairs; mixed quality/hash/numeric failures with Set dedup; duplicate file keys with last Map value; missing hashes/failures; partial single channel; differing array length/key sets; null/undefined/hole alignment entries; omitted and explicit undefined; numeric tolerance equality and just-excess, nonfinite/signed-zero/raw scalar coercions; wrong file/case/transition containers and null items; stress native behavior. Pin selected getter traces and assert plain input snapshots remain unchanged.

  Exact known results: empty/null pair returns `unknown/quality/missing` then the five `unknown/hash/<path>` entries in list order. Repeated baseline object with five equal hashes, empty failures and nodes.sampleRate Infinity returns `[]`; a structuredClone second report returns `['source/numeric/nodes.sampleRate']`. Matching nullable alignments return `[]`. Wrong file-array shape and null file item preserve TypeError messages from the spec; observe any additional cases against the untouched API before writing their literal expectation.

- [x] **2. Write the core runtime RED.** In the new checked test, import the not-yet-existing core and add the reader fixtures below. Keep all its repository imports limited to core/signal/metrics. Put every legacy/core function, constant and frozen-list identity assertion in the existing unchecked `tests/audio-artifacts.test.cjs`, never the checked consumer: a legacy import follows owned-files into the checker graph. Run `node --test tests/audio-artifact-contract.test.cjs tests/audio-artifacts.test.cjs`; missing-core import is this setup RED, never a successful compiler negative proof.

  `hashes_exact_view_in_sequence`: five independent literal expected paths, alternating read-start/read-end traces across an awaited microtask, actual `this===reader`, and root getter after the final read. Return Buffer `[0x99,0x61,0x62,0x63,0x88].subarray(1,4)`; each hash is literal `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`. Assert label/root/files property order, path/sha256 entry order, count5 and unchanged bytes.

  `reader_rejection_is_not_wrapped`: second read throws one Error instance; assert identical rejection, no later reads or root getter. No Promise.all, detached method, buffer conversion or backing .buffer hashing.

- [x] **3. Move bodies into the core with erased contracts.** Copy the baseline constants, comparator and private projection/recursive comparison, preserving expressions, iteration, optional access and native errors. Add the reader hash helper by moving the existing loop unchanged except the reader parameter name. The caller validates label; do not add another validation. Core runtime import is Node crypto only. Import/re-export constants/comparator in the legacy entry; preserve parse/describe bodies until Task2. Add only guarded local annotations needed to restore arrays/entries, with guard basis documented. Keep .at reads and getter order; no additional runtime coercion/filter/rounding/cycle budget.

- [x] **4. Add the checked genuine consumer.** Use actual summarize captures with rate1000/start0/end8 and identical constant0.25 channels, plus0.98 stress, to construct the complete QualityReport cases, enabled/gain transitions and DelayAlignment already used by the DT01-B test. Add artifact/nodes/qualityFailures/extra metadata through a variable and call the core without a whole-object cast. Include readonly partial single-channel fixtures, explicit undefined and typed nullable/sparse alignments. Assert same report comparisons `[]`; raw malformed tests stay unchecked.

- [x] **5. Add public positive/negative compiler proofs.** Reuse `tests/audio-quality-contract.test.cjs` bounded pattern: fresh `output/audio-artifact-types-*`, node spawning installed tsc, timeout30s/maxBuffer1MiB, extends actual audio-tools config, explicit files/include[], owned cleanup. First positive subprocess must return0; error/signal/null status or setup/import/ambient diagnostics fail. One batched negative subprocess checks every row at its own file/line/diagnostic code; no unrelated diagnostics accepted. Use `--ignoreConfig` if compiling command-line explicit files, or `-p` for proof config.

  Positive: all-five reader, broad string reader returning Buffer, complete description, real complete report plus metadata, partial/nullable report entries, nullable alignment items, explicit undefined and readonly one-channel capture. Negative rows: direct helper call with config.js-only reader (TS2322/TS2345); disjoint path reader (TS2322/TS2345); Promise<string> bytes (TS2322/TS2345); missing root/readFile (TS2741/TS2345); missing description files/root (TS2741); nonexistent description property (TS2339); known numeric field as string, enabled as number, numeric qualityFailures, wrong cases/transitions/alignments containers and alignment frame as string (TS2322/TS2345). Each row changes only its intended premise.

- [x] **6. Prove actual internal boundaries, not only public aliases.** Clean temporary actual core source compiles before its mutant. Copy actual bytes with only relative type-import paths changed from `./audio-{signal,metrics}.mjs` to `../../scripts/audio-{signal,metrics}.mjs`; leave crypto import intact and assert the original source is unchanged. One clean and one batched mutant compiler call: **four new compiler subprocesses total** including Step5, no per-row compiler processes.

  Nine independent targets: returned contents nonexistent property (TS2339); guarded report nonexistent property (TS2339); baselineFiles and per-report files map item nonexistent property (two TS2339); quality failure string nonexistent property (TS2339); expected/actual recursive array selected value assigned to number (two TS2322); expected/actual Object.entries selected value assigned to number (two TS2322).

  Mutations use unique verified source anchors and insert one misuse at each target. In both Map callbacks replace `[item.path,item.sha256]` with `[(item.__missing,item.path),item.sha256]`, preserving two entries. For recursive arrays/entries use .at and a JSDoc-number assignment to the selected value; arbitrary record key access is not a TS2339 promise. Guard possibly undefined entry before its mutation only if the clean type requires it. Count each target once and reject missing/duplicate anchors, missing target diagnostics, imported-file or unrelated diagnostics. An erased type leaking any must make this test fail.

- [x] **7. Verify independent oracle sensitivity in RAM.** Load the actual trusted core source in RAM after removing its one crypto import/export syntax and supplying Node crypto; verify the clean comparator passes the literal oracle first. Independently mutate absolute tolerance1e-7 to0, relative tolerance1e-6 to0, and selected steady thdPercent to undefined, one at a time. Required failures: accepted nodes value0 vs5e-8; accepted1 vs1.0000005; independently pinned steady THD drift. Unchanged transition RMS/THD drift remains ignored. Import/parse/runtime setup failures are not successful controls; no source write, loader or candidate-generated expectations.

- [x] **8. Extend and verify the exact checked graph.** Add only core and new checked consumer to audio-tools files. Update the existing signal-contract graph assertion to the six literal filenames, rename the misleading pure-graph title to bounded graph, preserve every existing A/B check. Run:

  ```powershell
  node node_modules/typescript/bin/tsc -p tsconfig.audio-tools.json --pretty false
  node --test tests/audio-artifact-contract.test.cjs tests/audio-artifacts.test.cjs tests/audio-signal-contract.test.cjs tests/audio-quality-contract.test.cjs tests/audio-metrics.test.cjs
  ```

  Expected: exit0, no focused failures/new skips, six repository files in listFiles; no legacy entry, owned-files or browser import. Verify literal oracle against legacy/core and their export identity in the unchecked artifact test; verify all nine misuse goals, four compiler calls and byte preservation. Record actual counts, not planned PASS.

- [x] **9. Local checkpoint.** Review the diff and commit only the six Task1 changed/new paths plus the fixture (seven paths total); no generated product files, build, push or PR. Checkpoint message `refactor: type audio artifact core contracts`.

### Task 2: Genuine entry integration, audit and isolated branch validation

**Files:** Modify `scripts/audio-artifacts.mjs`, `tests/audio-artifacts.test.cjs`, `tests/tool-warning-remediation.test.cjs`, `PLANS.md`, this plan. Create `docs/superpowers/validation/2026-10-13-dt01c-artifact-contracts.md`. Keep `owned-files.mjs`, CLI, npm/CI, manifest/package/version and product sources unchanged.

**Interfaces:** Consume Task1 reader helper/comparator/types. Produce the existing public `describeAudioArtifact(root,label)` through unchanged label validation and guarded root acquisition, delegating once to `describeAudioArtifactFiles(files,label)`. Legacy export identity remains identical; callers need no change.

- [x] **1. Write entry integration RED.** Retain real-file old fixtures and add an exact source-connection check requiring the helper call after label validation/openOwnedRoot; it must fail before delegation. Pin parse body and whole CLI bytes against the baseline. Add real-five-file abc fixture hashes/count/order/root, invalid label `!` before missing root, middle missing file preserving the existing provider Error name/message/code (`Error`/`ENOENT`/`ENOENT`), and linked web directory rejection. That absent-child error is synthesized by owned-files, not a promise of native path/syscall properties. For the link use the existing owned-files test convention: Windows directory junction, Unix directory symlink to another directory inside the disposable fixture; require `owned-path-link`. Do not replace actual disk reads with the reader fake or add a platform skip. Also run the existing owned-file regressions unchanged.

- [x] **2. Make the single real connection.** Keep label guard/openOwnedRoot order; replace only the legacy hashing body with `return describeAudioArtifactFiles(files,label)`. Remove unused legacy crypto import. Do not modify provider implementation, CLI calls/report/save/throw/finally, failure strings or parse acceptance (including duplicate --chrome and last-label wins). Run the entry/core/owned-focused tests and confirm the RED source-connection test becomes green.

- [x] **3. Check actual lint/audit reach.** Add both legacy artifact and core to `tests/tool-warning-remediation.test.cjs` explicit report-tool lint list; assert the core's actual nonzero `security/detect-object-injection` rule from `eslint.security.config.mjs`, matching the existing regression. Verify new core appears in the real tool-audit source inventory/content hashes; existing glob/rules already cover it, so no scanner exclusions or broad config changes. Run:

  ```powershell
  node --test tests/audio-artifact-contract.test.cjs tests/audio-artifacts.test.cjs tests/audio-signal-contract.test.cjs tests/audio-quality-contract.test.cjs tests/audio-metrics.test.cjs tests/owned-files.test.cjs tests/development-types.test.cjs tests/tool-warning-remediation.test.cjs
  ```

  Expected: exit0/fail0/new skip0. Keep existing Windows file-symlink diagnostic limitations separate from always-required directory-junction test success. Commit the implementation/tests locally before cloning so the validation target is immutable.

- [x] **4. Capture protection and checker cost.** Compare package/lock/manifest2.13.3, root dist58 sorted `[relativePath,sha256]` digest `d01bd672ff9bb9ffab808099432129b9429f5baa2fbf256e612531e358086c60`, released ZIP hash `67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`, frozen P02 hash `f027a9e8a8c7b44df1a0d8104a7354c9c787a8f6b62b4f532131fb7bcd193dd8` and ledger hash `4c312e3e66bb773470816779ef1868b4356b344f645a0efaf44bc5e49ebc0401` before/after. Use existing read-only hashing; protect `codex/chzzk-compatibility-recovery`, `codex/sidebar-preview-followup` and the existing P09 native profile. Do not inspect/change user Chrome settings.

  Measure baseline and candidate checker cold1/warm5 with identical environment/flags and extendedDiagnostics; no parallel heavy workload, or disclose contamination. Record source SHA/tree, runtime/tool versions, elapsed/check time/memory, actual six-file graph and every erased annotation's guard basis. Baseline checkout uses separate owned temporary clone, never reset root or rewrite frozen evidence.

- [x] **5. Prepare a fresh isolated tracked clone.** After execution approval, use a fresh unique ignored `output/dt01c-validation-<run>` clone with `--no-hardlinks` at the local implementation checkpoint; verify HEAD/tree and local fb15f967 baseline object. Physically copy existing pinned node_modules, never junction it. Use existing npm12.2.0 and Gitleaks8.30.1 tool paths/environment, no install/network fetch. Scope all output paths to the resolved clone. Check destination absence before candidate/profile creation; otherwise pick a fresh alphanumeric run ID, not deletion of prior evidence.

- [x] **6. Run the eight foundation gates and full suite in that clone.**

  ```powershell
  node scripts/check-toolchain.mjs
  node scripts/check-runtime-inventory.mjs
  node node_modules/typescript/bin/tsc -p tsconfig.json
  node node_modules/typescript/bin/tsc -p tsconfig.development.json
  node scripts/settings-runtime.mjs
  node scripts/main-runtime.mjs
  node scripts/check-build-proof.mjs
  node node_modules/typescript/bin/tsc -p tsconfig.audio-tools.json --pretty false
  node --test --test-concurrency=4 tests/*.test.cjs
  node scripts/tool-audit.mjs
  ```

  Expected: eight exits0; full failures0 with only the existing absent-private-evidence skip1, no new skips/flags or rewrites of the root historical P02 assertion. Audit exit0 clean/1 findings/2 tool error: record actual classification. Compare existing ESLint7 IDs against baseline, npm/Gitleaks findings and new core source/input hashes/config. Unavailable tools are unverified, not clean. Do not fix unrelated historical owned-files warnings in C.

- [x] **7. Run candidate, silent quality and installed checks in that clone.**

  ```powershell
  node scripts/verify-candidate.mjs dt01cCandidate
  node scripts/check-audio-quality.mjs --root <resolved-candidate-dist> --label dt01c-candidate
  node scripts/check-installed-extension.mjs --run-id=dt01cInstalled
  node scripts/check-installed-extension-negative.mjs --run-id=dt01cNegative
  ```

  Resolve the actual candidate path reported by the existing helper before passing it, not an assumed layout. Candidate must contain58 files/package20 resources. Synthetic expected14 cases/18 transitions/12 alignments, failures[], sources1, calibration RMS0.34-0.36 and all measured overFullScaleSamples0; preserve default compressor policy. No `--chrome`: fresh bundled Chromium/silent synthesis, not user speakers. Installed positive/negative expected functional PASS; explicitly retain the prior limitation that close-failure cleanup may remove disposable profile/candidate and negative main-runtime-missing is not termination/retention proof. On abnormal termination retain clone/reports, stop additional cleanup/phases and report actual already-performed cleanup.

- [ ] **8. Record evidence and run one final Astra max review.** Write actual heads/counts/outcomes/timings/guard annotations/protection/audit limitations in the new validation record; mark checklist steps only after their evidence. Obtain one fresh read-only GPT-6 Astra max whole-branch correctness/type/compatibility review against the spec and this plan, no child reviewers. Verify valid Critical/Important findings locally with targeted RED/GREEN tests, record Minor/declined scope decisions; never infer a security certification. Commit final evidence locally and recheck protected artifacts and clean intended scope.

- [ ] **9. Close the local unit and hand off remaining maintenance.** Report exact verified head and retained evidence. C local completion is separate from public CI/merge and the maintenance-closeout decision. Continue only within existing approval; DT01-S/DT02 require explicit treatment, NUM01 and AF05-B remain separately gated. No push, PR, merge or branch deletion without explicit user direction for the relevant action.

## Plan review and execution handoff

- [x] Author self-review: every spec section maps to Task1 or Task2; all five Review Focus rows have tests; interfaces/nullability/reader variance agree; bounded proof count4 and nine target goals; filesystem integration and unchanged CLI are genuine, not mocked; no product/publication or maintenance-closeout scope expansion.
- [x] Proportion review: two sequential tasks, signatures/assertions/commands rather than implementation bodies; no new proof framework, dependency or per-step PR. Task1's temporary old hash loop is removed by Task2 before unit completion.
- [x] Fresh Astra max adversarial plan review at `a6054f9`: Critical0/Important1/Minor1 plus one author-identified lint wording correction. Confirmed and amended: legacy identity checks stay unchecked, synthesized provider ENOENT shape, actual lint rule. [Review record](../validation/2026-10-13-dt01c-plan-review.md). Author amendments are not a second independent zero-finding review or implementation PASS.
- [x] User approved this plan and Native two-task execution, isolated clone/candidate/synthetic/installed checks, and one final Astra max review on 2026-10-13. No push/PR permission.

Recommendation: Native, because both tasks share one small module boundary and the existing proof/isolation patterns; avoid fresh implementation/review contexts per step. Local checkpoints preserve history without generating more PRs.

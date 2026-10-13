# DT01-C artifact contracts validation

Date: 2026-10-13 Asia/Seoul. Native execution approved by the user.
Base: `9b8640fc004888ebd9e65106046b4b8795d62ca2`.
Task1: `d90af7f54f4159e458596f54ab6f9f7c18ded63c`.
Implementation/isolated target: `a2b68909823a5030ab4d00fe00521ce90836ccdc`.
Implementation tree: `983d3448a8ceee0c9fecacc45b93b3beb64f24fa`.
Final independent review is pending; this record is the pre-review evidence.

## Changes and TDD

One core module contains the fixed five paths/tolerances, byte-reader hash loop,
partial projection and recursive comparator. Legacy entry retains parse args,
label validation followed by openOwnedRoot, and delegates once after acquisition.
Existing CLI/provider source is unchanged. Comparison/list exports keep identity.
No dependency, loader, declaration facade, runtime decoder, whole-report cast,
ignore directive, parallel reads or new coercion/error policy.

The unchanged artifact blob `aac259b58d5a0f370a374e53d9829b4c04093f20` was checked
before edits. **46 named literal raw outcomes** and selected getter traces passed
against the baseline before the move, including malformed TypeErrors, nullable
alignments, repeated/cloned nonfinite identity, Map last-entry wins, failure
ordering/dedup, projection selection and actual floating tolerance equality.
The equality literal is `1.0000010000009999e-7`; it equals the existing computed
tolerance for expected0, unlike the algebraically solved decimal rounded up.
Raw factories retain undefined, NaN, Infinity, Symbol and sparse holes in JS.

Task1 missing-core setup RED: 9pass/3fail with ERR_MODULE_NOT_FOUND, then runtime
GREEN12/12. That setup error was not treated as a compiler negative proof.
Checked complete measurements/metadata and partial positives plus compiler
proofs then passed16/16. Focused Task1 suite **121/121**, failure0/skip0.
Task2 entry delegation RED12pass/1fail became green after the single connection;
real disk bytes/label precedence/provider ENOENT/junction checks already passed.
Expanded focused suite **151/151**, failure0/skip0.

Reader fixtures independently pin five sequential receiver-bound calls, awaited
start/end traces, late root access, exact Buffer subarray abc SHA256, property
order and unchanged bytes. Second-read error propagates by identity and stops
later access. Genuine public fixtures read all five disk files and reject the
linked web directory without platform skips. Existing owned regressions remain.
CLI/parse preservation tests normalize CRLF for cross-platform source hashes;
unchanged Git blobs separately verify no source-content rewrite.

## Static contracts and internal proofs

Strict/noEmit/exact optional/noUncheckedIndex graph has exactly six repository
files: signal, metrics, core and their three checked consumers. Legacy entry,
owned-files and browser producer do not enter it. No npm/CI command change.
Node type libraries are existing dependencies, not extra repository inputs.

Public positive compilation accepts actual summaries/full QualityReport metadata,
all-five and broad-string Buffer readers, readonly partial channels, explicit
undefined, nullable report/alignment items and sparse alignments. **18 public
misuse rows** each require its intended source line/code, including the direct
config.js-only reader rejection, disjoint path and non-byte return. Setup/import/
ambient errors, crashes, signals and absent exit status cannot count as rejection.

Clean copied actual core compiles first; a batched mutant rejects **nine internal
targets**: bytes, report, both file-map items, quality failure, both recursive
array selections and both Object.entries selections. Targets use actual source
expressions, so an erased array/entry type cannot pass by a new proof-only cast.
Positive/negative/internal-clean/internal-mutant are four added compiler calls,
each bounded at30s/1MiB, with owned temporary cleanup. Source bytes are unchanged.
Independent RAM mutations of absolute/relative tolerance and selected steady THD
fail the literal oracle; clean copied source passes it. No mutation is executed
as a replacement for the production API in its integration checks.

### Erased annotation basis

Core has nine local cast sites; no new runtime validation:

| Core line | Basis |
| --- | --- |
| 50 | Existing reports array guard; restore nullable partial item after Array.isArray erasure. |
| 53 | Same guard; restore report iteration, preserving receiver/access order. |
| 56 | Existing qualityFailures array guard; restore string iteration without removing malformed runtime outcomes. |
| 149, twice | Existing two-array/equal-length guards; restore selected recursive values before the same .at reads. |
| 158-159 | Existing non-null object guards after array branch; restore sorted Object.entries values. |
| 165, twice | Existing index bound and equal entry lengths; preserve .at calls while expressing guaranteed entry presence. |

Other JSDoc consists of the readonly fixed path list, partial/exact projected
types and parameter/return contracts. Shape assumptions follow the selected
typed input contract, not an independent validator of unchecked raw inputs.
Readonly does not freeze arbitrary inputs or prove stable getters/acyclic data.

## Isolated validation

Fresh no-hardlinks clones: `output/dt01c-validation-20261013` at a2b6890 and
`output/dt01c-baseline-20261013` at9b8640f. Candidate HEAD/tree matched the root
checkpoint. Pinned node_modules were physically copied, not linked; published
settings baseline fb15f967 exists. Private P02 evidence/user profiles were not
copied. Root dist was never built or cleaned.

All **eight foundation gates** passed. Full suite initial run: **1002total /
1000pass / 1fail / 1existing skip**, 59643.9827ms. Failure was the unchanged
`MAIN runtime rejects linked sources and outputs`, EPERM while renaming its
disposable src/main directory. Source/runner diff is empty. Isolated rerun8/8
passed; identical concurrency4 full rerun passed **1002total / 1001pass / 0fail /
1existing skip**, 55641.7609ms. No retry code, suppression or skip flags added.
Exact external lock cause was not established; both runs remain in clone logs.

The one existing skip is the P02 warning-ledger private-evidence assertion,
absent in a public tracked checkout. Root historical evidence was not rewritten.
Two existing Windows file-symlink checks report privilege unavailable; they are
not verified file symlinks. Required directory-junction artifact/owned checks pass.

### Audit observations

Initial combined npm/candidate command was rejected before execution because
registry-bound dependency metadata lacked explicit egress permission. Unaffected
local modes ran first. The user then explicitly authorized dev-inclusive package/
dependency metadata to `https://registry.npmjs.org`; only then npm audit ran.

- ESLint10.12.0:7 existing IDs, run `run-2026-10-13T00-23-12-729Z-xTwH3W`, exit1.
- Gitleaks8.30.1 dir0/git0: run `run-2026-10-13T00-23-13-992Z-neIEQA`, exit0.
- npm12.2.0:0, run `run-2026-10-13T00-24-50-513Z-M9aACS`, exit0.

All three input snapshots match before/after and each other. Core is included
in source inventory, actual snapshot hash and nonzero object-injection lint
configuration. Its Windows content SHA256 is
`9e699da2cc2a61dae10e30da5ab64110e1c91d65e3a3d1e2e211b57cac5e9041`.
The seven ESLint IDs exactly match DT01-B's retained audit, all in unchanged
owned-files. These are observations, not confirmed vulnerabilities or a complete
security certification. Modes ran separately; no single combined exit is claimed.
Historical exclusions/evidence were not widened or marked resolved.

### Candidate, synthetic and installed checks

Candidate dt01cCandidate: **58 files/20 package resources**. Silent bundled
Chromium synthetic report `output/audio-quality/report-dt01c-candidate.json`:
**14 cases/18 transitions/12 alignments**, qualityFailures[], sources1,
first RMS0.3535495743240478, **all138 measured channels overFullScaleSamples0**.
Defaults remain threshold-50/knee40/ratio12/attack0/release0.25; stress policy
unchanged. No --chrome, broadcast capture, user profile or speaker playback.

Installed positive dt01cInstalled: exit0/oktrue, duration65618ms; bridge/settings,
multi-window/runtime isolation, targeted style reload and lifecycle pass.
Negative dt01cNegative: exit0/oktrue on expected main-runtime-missing.
Natural worker suspension was not observed; headless in-place reload did not
restart the worker and used the existing fallback. Functional success is not
native update/rollback or independent termination/retention proof. Existing
runner close-failure cleanup may remove disposable profile/candidate; no redesign
or stronger retention claim. No termination anomaly was reported this run.

## Checker cost and protection

Same pinned checker, sequential isolated runs after browser checks, cold1/warm5:

| Target | First ms | Five warm ms | Warm median ms |
| --- | --- | --- | --- |
| Baseline9b8640f | 776.5943 | 492.7899,496.2448,481.7039,491.1364,482.7793 | 491.1364 |
| Candidatea2b6890 | 472.1643 | 455.5594,461.3664,476.2434,457.2477,453.4592 | 457.2477 |

Last diagnostics: baseline177 total files/132385K memory/check0.273s;
candidate179/135201K/check0.246s. Repository-owned count grows4 to6. First run
is not an OS-cold-cache guarantee; this small local sample is not a speedup SLA.
Earlier root noEmit samples were preliminary and are not this isolation table.

Protected before/after snapshots are identical: package/lock/manifest2.13.3,
dist58 tuple digest `d01bd672ff9bb9ffab808099432129b9429f5baa2fbf256e612531e358086c60`,
ZIP `67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`,
P02 `f027a9e8a8c7b44df1a0d8104a7354c9c787a8f6b62b4f532131fb7bcd193dd8`,
ledger `4c312e3e66bb773470816779ef1868b4356b344f645a0efaf44bc5e49ebc0401`,
both protected branch SHAs and native P09 profile directory metadata. User Chrome
settings were not accessed. Product source/runtime/permissions/version unchanged.

## Remaining gates

Fresh Astra max final whole-branch review pending. Public CI/merge not run:
**no push/PR without explicit user instruction**. Local C completion does not
close DT01-S/DT02 decisions, implement NUM01 or unfreeze AF05-B/F00-F05.
Unchecked provider/browser producer, malformed/cycle/resource policy and runner
retention/native acceptance limits remain explicit, not type-safety claims.

# DT01-B quality report contract validation

Date: 2026-10-13 Asia/Seoul. Approved Native execution, two sequential tasks,
one final Astra max whole-branch review, and one implementation PR.
Base: `997c5b411f329f24b331c047bb0fe6963980570e`.
Code checkpoints: `8169037` (contracts) and `d37a25a` (CLI connection).
Final review checkpoint: `fea2c52ad51b925783d1b87ec5d3bae4646ff8ea`.
Public integration is pending final-head CI.

## Scope and actual guarantees

The existing pure gate now exposes a complete `QualityReport` contract and a
separate partial `QualityGateInput` contract. `audioQualityReportFailures` is a
typed assignment of the original function, not a cast, wrapper, or validator.
Normal transitions correlate kind/value; normal measurements retain the
readonly two-channel tuple. Additional metadata is accepted structurally.

The checked graph contains exactly `scripts/audio-signal.mjs`,
`scripts/audio-metrics.mjs`, `tests/audio-signal-contract.test.cjs`, and
`tests/audio-quality-contract.test.cjs`. Browser report assembly is not checked.
The CLI changes only its named import, preserving its local call name and the
capture/calibration, report construction, save/log, quality throw and finally
close source. Preserving source does not prove every CLI failure path executed.

## RED to GREEN and compatibility

- Before production changes, baseline gate source matched `b1b7b709` after EOL
  normalization (SHA256 `606fbc713e56d78809c96417780e77b8d8afb731f70d7a5af5a44a101c675c59`).
  Existing metrics/artifact tests: 20/20. The expanded metrics oracle: 86/86.
- The independent JSON pins 54 baseline outcomes, including complete failure
  ordering, raw null/hole/wrong-container exceptions and coercion. Expected
  outcomes were not regenerated from the candidate.
- Twelve fixed peak getters, three changing getters and container traces retain
  the original reads. Plain inputs and checked reports retain their data.
- The 0.95-to-0.90 RAM threshold mutation fails the literal RMS oracle.
- The new alias runtime test initially failed because the alias was absent.
  Adding the identity alias made the runtime contract pass.
- Internal mutation initially compiled successfully because Array.isArray leaked
  any. Erased loop-boundary annotations now make all five actual-source mutation
  sites emit their own TS2339; a clean copied source first compiles successfully.
- Positive and batched negative compiler proofs use the actual alias directly.
  Every one of 20 misuse lines must receive its expected diagnostic; unrelated
  source/import/ambient errors, missing target lines, crashes and timeouts fail.
  Weak-alias sensitivity is inspected structurally, not a fifth compiler run.
- The CLI import test failed on the original import and passed after the
  single-line connection change. Invalid arguments still fail before launching
  a browser. Artifact comparison/projection and numeric exports remain intact.
- Task1 focused: 111/111, fail0/skip0. Task2 focused: 132/132, fail0/skip0.

## Local annotations, not new runtime policies

Locations below refer to `scripts/audio-metrics.mjs`; no whole-report casts,
unknown/any escapes, ignore directives, wrappers or normalization were added.

| Location | Boundary and reason |
| --- | --- |
| cases loop, case channels loop, transitions loop, stress channels loop, alignments loop | Five erased declarations restore the partial element types lost through Array.isArray, without caching accessor reads. |
| case/stress RMS and stress lower peak comparison | Existing short-circuit finite checks establish the selected numeric field/object for the subsequent read. The original repeated field reads remain. |
| envelope predicate and baseline/change RMS | Existing finite-positive envelope guard establishes local RMS numbers and channel existence. |
| baselineStep | Only the native Math.max callable signature allows number-or-undefined. Missing steps remain NaN; raw string/null coercion and BigInt/Symbol exceptions are unchanged. |
| change step check | Channel existence follows the envelope guard; the later selected numeric read follows the existing finite check. |
| upper peak comparison | Capture at the old comparison read position plus an undefined guard; the failure message still rereads channel.peak. No finite filter or threshold change. |
| alignment predicate and field comparisons | Existing finite-positive sampleRate and integer nonnegative frame guards establish only the subsequent selected reads. All repeated frame-property reads remain. |

The scalar assertions are erased descriptions of existing guards, not raw input
validation. Accessors can change between reads, just as before. The types neither
guarantee finite numbers nor freeze runtime arrays. NUM01 policy is unchanged.

## Isolated gates and audit

An immutable no-hardlinks tracked clone at
`output/dt01b-validation-20261013` checks out `d37a25a`; pinned node_modules were
physically copied, not linked. Published settings baseline `fb15f967` exists.
No private historical evidence or user Chrome profile was copied.

All eight offline foundation gates passed. Full suite with concurrency4 and no
skip options: **990 total / 989 pass / 0 fail / 1 existing skip**, 62.633s.
The skip is `P02 warning ledger closes every baseline row and preserves every
latest guarded observation`: private audit evidence is intentionally absent from
a public checkout. The original historical root P02 assertion was not rewritten.
Two Windows symlink checks report unavailable privilege, not verified symlinks.

Audit `run-2026-10-12T16-57-19-482Z-MCb8Uv`: npm12.2.0 count0,
Gitleaks8.30.1 dir0/git0, ESLint10.12.0 count7, overall **exit1/findings**.
The seven IDs exactly match `run-2026-10-12T05-52-27-459Z-6y52KV`, all in unchanged
`scripts/owned-files.mjs`. Zero new observations is not a security certification.
Input snapshots before/after match. Metrics, signal and CLI are included with
their actual content hashes; audit inventory/config/exclusions are unchanged.

Candidate verification produced 58 files and 20 package resources. Installed
positive `dt01bInstalled` passed (63.875s): bridge/settings, concurrent windows,
style-target-only reload, lifecycle and runtime isolation. Negative
`dt01bNegative` passed on the expected `main-runtime-missing` failure.
Both runner commands exited0. No termination anomaly was reported; this is not
an independent process-retention proof. Natural worker suspension was not
observed and headless in-place unpacked reload used the existing restart fallback.

Synthetic audio on the actual candidate dist exited0 and saved
`output/audio-quality/report-dt01b-candidate.json`: 14 cases, 18 transitions,
12 alignments, `qualityFailures:[]`, all measured channels' full-scale count0,
sources1, first-channel RMS0.3535495743240479. Compressor defaults remain
threshold-50/knee40/ratio12/attack0/release0.25; stress profile remains
`threshold0/knee0/ratio1/gain2`. Fresh bundled Chromium and a silent sink were
used; no broadcast, speaker or user profile was captured.
No release claim is made.

## Final independent review

Fresh GPT-6 Astra max reviewed `997c5b4..fea2c52` and connected code:
**Critical0 / Important0 / Minor0; ready to merge after final-head CI**.
No fix pass or repeat review was needed. The reviewer independently established
the identical gate blob at original spec, fixture and branch baselines, inspected
direct-call diagnostic targeting, all five internal mutation sites and the
retained same-code logs/reports. It did not rerun tests/builds/browsers/scans.
All 138 synthetic measured channels have full-scale count0. Subsequent changes
are documentation only; public CI remains the final integration gate.

## Checker cost

Same pinned checker, cold1 and warm5 wall-clock runs in milliseconds:

| | Cold | Warm5 | Median | Extended-diagnostics memory |
| --- | --- | --- | --- | --- |
| Baseline two-file graph | 490.8822 | 443.3908 / 440.7652 / 439.8858 / 458.5544 / 441.3537 | 441.3537 | 130736K |
| Final four-file graph | 688.0635 | 510.7539 / 519.6286 / 496.7851 / 488.9935 / 504.4531 | 504.4531 | 132216K |

The observed warm median increased about63ms (14.3%). This is a local sample,
not a controlled performance benchmark; the final series overlapped synthetic
browser startup. An earlier series during physical dependency copying had
median613.747ms and memory132447K; it is retained as a load-contaminated sample,
not hidden or used for a speed claim. No new compiler/library dependency, loader,
generated JS phase or npm/CI command was added. The new contract proof has four
bounded compiler calls (positive, batched negative, internal clean and mutant).

## Rulings I made

1. Pin the empty-root direct-call diagnostic to TS2739, not the initial TS2345:
   TypeScript7 reports the four missing required fields at that exact proof line.
   Cost if wrong: the focused test fails rather than accepting unrelated errors.
   Missing stress is separately pinned to the observed TS2741 allowed by the plan.
2. Keep the approved unchanged installed-runner cleanup behavior: DT01-B does
   not redesign that runner and its limitation is documented separately from
   functional outcomes. Cost if wrong: an abnormal close may lose its disposable
   profile; the executor retains clone/reports and does not promise retention.
3. Preserve raw-input and NUM01 policies: compatibility is the requirement,
   not a new rejection/normalization policy. Cost if wrong: previously accepted
   malformed values/coercions still remain, pending a separately approved policy.
4. Keep browser producer assembly outside the checked graph: the alias, pure
   gate, checked consumer and actual import are proved without importing browser
   capabilities. Cost if wrong: browser assembly misuse is not statically caught.
5. Do not infer native audio acceptance, security certification or B2/C/S
   completion from these tests: source and synthetic guarantees remain scoped.
   Cost if wrong: those separate acceptance/implementation gates remain open.

## Deferred minors

None. The final reviewer reported no Minor findings.

## Preserved boundaries

Product sources/generated JavaScript, manifest/permissions, package/lock/CI and
version2.13.3 are unchanged. No dependency installation or version bump.
Root dist inventory58 SHA256
`d01bd672ff9bb9ffab808099432129b9429f5baa2fbf256e612531e358086c60`, ZIP
`67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`, P02 baseline
`f027a9e8a8c7b44df1a0d8104a7354c9c787a8f6b62b4f532131fb7bcd193dd8` and ledger
`4c312e3e66bb773470816779ef1868b4356b344f645a0efaf44bc5e49ebc0401` remain unchanged
in the current comparison. Both protected branches remain. Existing watching,
store/native baseline profiles, accounts, settings and speakers were not used.

No Daybreak/model security scan, store submission, native update/rollback,
DT01-C/S, NUM01, AF05-B2 implementation or feature-roadmap unfreeze occurred.
The approved existing installed-runner disposable cleanup limitation remains:
a negative functional PASS alone is not proof of close/profile retention.
Executor-owned clone/reports are retained; no extra cleanup follows an abnormal
termination and no deleted disposable profile is claimed to be preserved.

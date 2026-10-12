# DT01-C — Artifact and partial comparison contracts

Date: 2026-10-13 Asia/Seoul. Base: `9b8640fc004888ebd9e65106046b4b8795d62ca2`.
The user approved the core/read-boundary direction and design review, not an
implementation plan or browser execution. The subsequent user instruction to
continue accepted the amended written spec for implementation planning only.

## 1. Intent and sequencing

Extend the meaningful developer-tool contracts completed in DT01-A/B to artifact
description and partial report comparison. Catch concrete input misuse without
changing existing partial/raw outcomes, native exceptions, filesystem guards,
numeric tolerances, report fields or CLI behavior. This is maintenance, not a
language-ratio exercise, new feature, input policy or security certification.

The user explicitly chose to finish **independent test/developer-tool type
maintenance before returning to AF05-B**. Finish here means implementing and
verifying approved units and explicitly resolving the remaining maintenance
list, not silently marking blocked or unapproved candidates complete. DT01-S and
DT02 remain separate design/decision items; NUM01 remains a separate numeric
correctness policy. No automatic approval of those implementations is implied.
AF05-B2 documentation stays intact; its implementation/acceptance approval is
not consumed here. This sequencing decision does not rewrite the release or
native-acceptance criteria. F00–F05 remain frozen.

DT01-C design, implementation and validation remain local. The user's latest
instruction supersedes the earlier PR-size/document-only rules: **do not push or
create a PR without an explicit user instruction**. Design/implementation/test
approval or completion is not publication permission; previous blanket approvals
are not automatically reused. Publish only the requested scope when instructed.

## 2. Current boundary and selected approach

`scripts/audio-artifacts.mjs` combines CLI arguments, owned-root acquisition,
sequential hashing, projection and recursive comparison. Its CLI caller uses
the existing module path. Comparison is also consumed by the existing artifact
tests. Importing that file into strict checkJs follows `owned-files.mjs` even
with a narrow files list. A read-only pinned TypeScript7 query currently emits
23 artifact and 42 owned-files diagnostics; these are missing-contract/type
diagnostics, not 65 discovered bugs.

Alternatives considered:

- **Selected:** one small typed `audio-artifact-core.mjs` for the fixed artifact
  list/tolerances, hashing over a minimal reader, projection and comparison.
  Existing `audio-artifacts.mjs` remains the real filesystem/CLI entry point.
- Type both the existing artifact module and all shared owned-file operations.
  This changes the contract scope of unrelated tools/copy/cleanup and is not
  justified by this unit. It remains a separately assessed maintenance option.
- A declaration facade, broad cast or ignore directive around the import graph.
  Rejected: it would hide the implementation rather than check it.

The core has no filesystem import or new filesystem implementation. It uses
Node's existing crypto library and the reader's actual method. The minimal
reader is a real parameter contract, not a claim that its unchecked provider
was type-verified. No schema library, loader, serializer or capability framework.

## 3. Files and actual connection

| File | Responsibility |
| --- | --- |
| New `scripts/audio-artifact-core.mjs` | Existing constants and comparison bodies, explicit contracts, existing hashing loop taking a reader. |
| `scripts/audio-artifacts.mjs` | Keep parseAudioQualityArgs unchanged; keep label validation then openOwnedRoot; delegate only the existing hash loop. Import/re-export the same frozen list, tolerance values and comparison function. |
| `scripts/check-audio-quality.mjs` | Keep its current artifact import/calls and report/save/throw/finally source unchanged; runtime regression checks the real delegation. |
| New `tests/audio-artifact-contract.test.cjs` | Checked consumer, positive/misuse proofs and internal any controls; imports only core and existing checked numeric/report modules. |
| `tests/audio-artifacts.test.cjs` | Keep real owned-root fixtures/legacy exports/CLI tests; add literal raw compatibility and real connection checks. |
| New `tests/fixtures/audio-artifact-compatibility.json` | Outcomes pinned from the unchanged baseline, not candidate-generated expectations. |
| `tsconfig.audio-tools.json` and existing signal contract test | Expand the exact four-file graph by core and new checked consumer; preserve strict/noEmit and all A/B proofs. |
| `tests/tool-warning-remediation.test.cjs` | Add both artifact entry and core to the explicit development-report lint regression; verify the core's actual rule configuration. |
| PLANS/spec/plan/validation | Approval, execution evidence, exclusions and maintenance-return gate. |

The repository-owned checker graph is exactly six files: signal, metrics, core,
and the signal/quality/artifact checked tests. Node type libraries are existing
dependencies. No owned-files, legacy artifact entry, browser CLI or browser fake
is pulled into this graph. npm/CI already run audio-tools; no new command needed.
The new mjs must remain in the real audit source inventory, content snapshot and
ESLint coverage. Scanner exclusions and historical evidence are unchanged.

## 4. Contracts

### Artifact reader and description

- `AudioArtifactPath` is the five existing relative strings, in existing order:
  `config.js`, `web/runtime.js`, `web/site-adapter.js`, `web/audio.js`, `web/player.js`.
- `AudioArtifactReader = {readonly root:string; readonly readFile:(relative:AudioArtifactPath)=>Promise<Uint8Array>}`.
  The function-valued property is deliberately not a method signature: strict
  function parameter checking must reject a reader supporting only config.js.
  All-five-path and broader-string readers returning Node Buffer are compatible.
  No wrapper, cast or detached readFile call is required. The actual public
  entry still obtains the existing guarded root.
- `AudioArtifactFile = {path:AudioArtifactPath,sha256:string}`;
  `AudioArtifactDescription = {label:string,root:string,files:readonly AudioArtifactFile[]}`.
  The five-entry/order/hash guarantee is runtime-tested, not a false tuple cast.
- `describeAudioArtifactFiles(reader:AudioArtifactReader,label:string):Promise<AudioArtifactDescription>`
  is the internal module connection. The caller already owns the reader and
  validates the label. It is not a separately guarded root-selection API.

The existing public `describeAudioArtifact(root,label)` must validate its label
before root acquisition, then call the core once. The core does not repeat label
validation, normalize root/label, detach readFile, use Promise.all, catch/replace
reader errors, convert buffers or hash an entire backing .buffer. It performs
five sequential awaited reads, hashes the exact returned bytes, and reads
reader.root at the original return position. Return property order remains
label/root/files; file entries remain path/sha256. Legacy root acquisition/CLI
arguments and provider implementation remain unchecked and are not advertised
as wholly typed. Actual filesystem guards remain unchanged.

### Partial comparison reports

The comparator is not a full QualityReport validator. It accepts readonly
arrays, nullable/undefined report entries and optional root input, including
empty/one-entry arrays which retain the existing count failure.

Use local JSDoc contracts with these exact meanings:

- `ComparableValue`: number/string/boolean/null/undefined, readonly recursive
  value arrays, or string-keyed recursive value records. It describes projected
  values, not JSON serialization or finite/acyclic validation.
- Optional fields allow explicit undefined as well as omission. A local mapped
  optional-fields type may express this without repeating casts or runtime code.
- Comparison channels have optional number rms/peak/overFullScaleSamples/
  maxAdjacentStep, number-or-null thdPercent, and optional nullable envelope.
  Envelope has optional windowSamples/min/max numbers and allows additional
  ComparableValue keys because the current code compares the entire envelope.
  Channel arrays are ordinary readonly arrays of channel/null/undefined, not
  normal-report two-channel tuples.
- Comparison windows have optional sampleRate/windowSeconds/channelDifferenceRms
  numbers and optional nullable channel arrays. Cases add optional frequency/
  inputAmplitude/gain numbers, enabled/bursts booleans and the existing stereo
  union. Transitions add optional frequency, enabled/gain kind, boolean-or-number
  value and optional nullable before/change/after windows. This partial contract
  does not claim the full kind/value correlation guaranteed by DT01-B.
- Alignments have optional DelayAlignment numeric fields and allow additional
  ComparableValue keys: the current code compares alignment objects verbatim.
  Their array items also allow null/undefined and sparse holes; unlike cases
  and transitions, matching nullable alignment entries do not throw.
  Nodes are optional ComparableValue and are also compared verbatim.
- Stress is an optional nullable comparison window plus optional string profile.
- Partial artifact has optional string label/root and nullable file array.
  File records have optional string path/sha256; irrelevant extra paths remain
  representable and ignored by the existing fixed-file comparison.
- Quality failures are an optional nullable readonly string array. Cases and
  transitions are optional nullable readonly arrays with non-null item records
  because their projection can throw on null items. Alignments are an optional
  nullable readonly array of alignment/null/undefined, preserving its distinct
  recursive comparison behavior. Raw malformed inputs stay in unchecked
  compatibility tests, not dishonest typed fixtures.

`compareAudioArtifactReports(reports?:readonly (AudioComparisonReport|null|undefined)[]):string[]`
remains the same runtime function through the legacy re-export. Existing full
QualityReport measurements plus artifact/nodes/qualityFailures are structurally
accepted through a variable, with extra metadata intact. No whole-report cast,
unknown overload, @ts-ignore/@ts-nocheck or createRequire any bridge.

Array.isArray and Object.entries must not erase implementation types. Restore
only guarded report/failure arrays and recursive array/entry values with erased
local annotations whose shape follows the original checks. Preserve .at reads,
sorting, mapping and getter order. Internal checks must demonstrate that an any
leak in array or Object.entries values would fail the test, not merely prove a
strict public signature.

## 5. Compatibility invariants and observed inventory

Baseline is the unchanged artifact file at `9b8640f`. Complete return/exception
observations, not includes-only assertions, are captured before implementation.

| Existing input | Existing result |
| --- | --- |
| omitted/undefined/non-array/empty/one report | `['artifact-report-count']` |
| two empty or two null reports | six deduplicated failures in order: unknown/quality/missing, then unknown/hash/config.js, web/runtime.js, web/site-adapter.js, web/audio.js, web/player.js |
| artifact.files object instead of array | TypeError: `((intermediate value) || []).map is not a function` |
| null file record | TypeError: `Cannot read properties of null (reading 'path')` |
| cases object instead of array | TypeError: `report?.cases?.map is not a function` |
| null case item | TypeError: `Cannot read properties of null (reading 'frequency')` |
| two matching alignment arrays with null/undefined/hole items | empty failure array; items are compared recursively, not projected as cases |
| repeated baseline object with matching hashes/empty qualityFailures and nodes.sampleRate Infinity | empty failure array; its measurement comparison is skipped |
| a cloned second report with that same Infinity | `['source/numeric/nodes.sampleRate']` when the artifact label is source |
| duplicate --chrome and --label options | existing acceptance; last label wins |

Further fixtures pin mixed failures and their order/dedup, repeated baseline
identity, duplicate file paths/last Map entry, missing hashes/failures, differing
array lengths/object key sets, null/undefined/hole values and meaningful scalar
drift. Wrong transition/stress containers preserve their native failures.
Nonfinite values, signed zero and raw coercions are not JSON-normalized. Plain
inputs remain unchanged; selected property/getter traces remain unchanged.

Projection includes only the existing selected fields. Mean, rmsDbfs,
thdnPercent and other timing-sensitive diagnostics are excluded; selected steady
THD is compared, transition RMS/THD is excluded, full envelope/nodes/alignments
are compared. Report/source identity behavior, default unknown label, sorted
Object.entries traversal, failure group order and final Set dedup remain intact.

Numeric tolerance remains **absolute1e-7 + relative1e-6 * max(abs(expected),abs(actual))**;
nonfinite numbers fail when reached by numeric comparison, equality at tolerance
is accepted, excess fails. Repeated baseline identity retains its measurement
comparison skip, including nonfinite values; do not replace identity or add a
new nonfinite pre-validation. No new
filter, key normalization, rounding, recursive budget or cycle policy. Readonly
does not freeze buffers/objects. Cyclic/accessor/proxy safety is not asserted.

## 6. Verification requirements for the implementation plan

1. Pin raw outcomes from unchanged source before edits. Literal expected hashes
   and read-order/error-identity fixtures are independent of the moved helper.
   RAM tolerance/projection mutations must fail an independent oracle.
2. Checked core consumer accepts real numeric/report summaries and partial
   fixtures. Positive compiler proof precedes a batched negative proof. Reject
   non-byte reader return, disjoint reader path parameter and a reader restricted
   to config.js, missing description fields, wrong known numeric/boolean fields
   and invalid failure arrays at the
   target source line/code; crashes/import/ambient errors are not success.
   All-five-path and broader-string/Buffer readers must compile. Matching
   nullable alignment items must have a typed positive example. Repeated and
   cloned baseline nonfinite behavior must both be in the raw literal oracle.
3. Clean temporary actual core source compiles before inserting minimal misuse
   controls at report/file/quality-failure and recursive array/entry boundaries.
   Object.entries arbitrary keys do not have to produce TS2339; a selected
   recursive value incorrectly assigned to a number must be rejected. Each
   goal must have its own target diagnostic. No broad compiler API dependency.
4. Old/new comparison function and frozen-list identity, exact CLI import,
   actual public owned-root fixture, missing/linked-file failure and label-before-
   root precedence are checked. Real reads are required: an in-memory reader
   fixture cannot substitute for filesystem integration. Existing owned-file
   regression suite remains unchanged and runs alongside artifact regressions.
5. New core appears in actual sourceFiles/input hashes/rule configuration and
   explicit lint regression. Historical ESLint7 and P02 evidence are not
   rewritten, excluded or described as newly resolved.
6. After implementation/Native approval, use a fresh immutable tracked clone,
   existing physically copied pinned dependencies, eight foundation gates,
   complete suite without new skips, candidate/package58/resource20, synthetic
   quality14/18/12 with empty failures, and installed positive/negative. Do not
   build in root dist or use user Chrome/profile/speaker data. The approved old
   runner cleanup limitation must remain explicit and separate from functional
   negative success. Preserve clone/reports if termination is abnormal.
7. Record actual six-file graph, all erased annotations and their guard basis,
   compiler subprocess timeout30s/bounded output, checker cold1/warm5 cost and
   original dist/ZIP/frozen/version/branch/profile protection. Planned evidence
   is not implementation PASS; browser producer/provider remain unchecked.
8. Fresh Astra max final whole-branch correctness review of approved local work.
   Only after an explicit push/PR instruction, carry out the requested public
   workflow; a Korean PR, if requested, requires exact final-head Windows/Ubuntu
   CI before separately authorized integration/cleanup.
   This design review does not replace implementation review or security audit.

## 7. Protection, approvals and completion

Product TS/generated JS16, manifest/permissions, package/lock/npm/CI commands,
version2.13.3, root dist58, released ZIP, frozen P02 baseline/ledger and protected
branches/profiles remain unchanged. No new dependency, data collection, account
operation, store submission, extension reload or native update/rollback.

This phase writes/reviews the spec and updates PLANS only. Written-spec approval
permits the implementation plan; plan/Native/isolated execution approval still
precedes code/tests/config/browser work. Design-stage commits stay local in this
branch. Do not push or open any PR without an explicit user instruction.

DT01-C local work completes only after implementation, genuine misuse rejection,
compatibility/integration tests and final review. Public CI/integration is a
separate instruction-gated step, not implicit publication authorization. Afterwards
resolve the remaining maintenance list explicitly; AF05-B resumes only after
that maintenance-closeout decision, not merely after C. Remaining candidates
are neither silently implemented nor silently declared unnecessary/completed.

## 8. Independent design review and amendments

Fresh Astra max reviewed local checkpoint `f52c8ac`: Critical0/Important1/Minor2,
ready for written-spec approval with fixes. The Important reader method-variance
issue and both invariant/nullability clarifications were confirmed against
pinned TypeScript7 and the existing API, then amended above. The reviewer also
checked actual imported QualityReport/CaptureSummary assignability and recursive
array/Object.entries control feasibility in RAM. Those are design-shape checks,
not compilation of a not-yet-written core or implementation PASS.

[Review and scope decisions](../validation/2026-10-13-dt01c-design-review.md).
Amendments are author corrections, not a second independent zero-finding review.
The user subsequently requested the recommended next step: implementation
planning and its review. Plan/Native/isolated execution approval remains separate.

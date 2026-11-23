# Remaining developer-tool type maintenance: scope assessment

Date: 2026-10-13 Asia/Seoul. Local baseline:
`66821c86eb4f644a72498ac50e2e44f5f9e11b3b`.
User approved follow-up assessment after DT01-C, not an unwritten implementation.
This is a recommendation/decision record, not an implementation spec or PASS.
No push/PR/merge, source/test/config changes, install, build or user Chrome work.

## Intent and evidence

Finish useful independent test/developer-tool type maintenance before AF05-B,
without equating completion with converting every JS file or removing every
unchecked boundary. C does not automatically close DT01-S/DT02/NUM01. A deferral
requires explicit reason/approval, not changing an unchecked task to complete.

- Read the actual fixture, product settings types/client and connected settings
  regressions; mapped its ten direct consumers and current development/audio
  checker and audit/CI execution boundaries.
- Existing settings client/broker/contract regressions: **55/55**, fail0/skip0.
  These run generated settings JS in jsdom, not TS source or a user browser.
  This is a scoped baseline, not another complete repository or native test run.
- Strict noEmit query with the installed TypeScript7 and development flags:
  **88 diagnostics in tests/settings-fixture.cjs**, none elsewhere in that query.
  Missing parameters/collections/dynamic fixture contracts are type-information
  gaps, not 88 proven product defects.
- RAM-only actual-import probe with fixture implementation checking disabled:
  config(42,'wrong'), style(42,1), parameter(42,'wrong') compile with0 diagnostics;
  actual fixture/helpers/runtime-contract files were confirmed in the graph.
- Conditional RAM annotations on only the three actual builder parameter
  boundaries reject four isolated caller misuses with TS2345: numeric ID,
  non-scalar config value, non-boolean style value, non-numeric parameter value.
  This proves potential contract value, **not a checked whole fixture**. Other
  fixture bodies remain unchecked in this probe; no edits were kept.
- Used installed TypeScript7 unstable/sync virtual filesystem API; no emit/write
  methods invoked, no new package or proof framework installed. A preliminary TS
  require-only probe did not load the fixture and was not accepted as evidence.

## DT01-S: recommended next direction, approval pending

The fixture is a shared boundary: delayed reads/writes/responses, structured
clones, callback-scoped lastError, one-writer/one-CSS counts, worker replacement,
clock, jsdom UI loading and clients. It is not a four-line builder-only task.
Direct consumers are background, bridge-cleanup, multi-page-settings, settings
broker/client/compatibility/load-order/multi-ui/style-apply/UI tests.

Options considered:

1. **Recommended: check the existing fixture implementation plus one connected
   normal consumer with JSDoc/checkJs**, and retain existing raw regressions.
   No fake rewrite or extension rename. Gains must include actual callback/view/
   gate boundary misuse rejection, not just public aliases. Full precise graph,
   source-type reuse, guarded realm bridges and cost are written in the next spec.
2. Extract only three trivial builders into a new checked module. Reject for
   this unit: little implementation logic, no checked transport/consumer, adds
   a module without resolving the important fixture boundary.
3. Convert the whole fixture/test family to native TS now. Reject as the default:
   combines contract decisions with loader/module/discovery/audit migration and
   cannot use filename counts as evidence of stronger typing.

Direction constraints for the subsequent written spec:

- Existing fixture API, exports, generated-JS load paths, callback scheduling,
  clone-before-await order, lastError lifetime, gate release/teardown and
  counter/settled-epoch behavior remain unchanged. No new queue/retry policy.
- Normal operation builders have literal tags and scalar/boolean/number fields.
  IDs remain strings unless a separate reliable schema-correlated contract is
  explicitly designed; do not promise ID typos or finite/range detection from
  the existing broad KnifeSettingsOperation type.
- Raw storage/request/reply and intentional malformed overrides stay unknown at
  their real validation boundary. Preserve invalid/proxy/accessor/NaN/Infinity
  cases; no broad any, ignore, double-cast facade or test removal for compilation.
- Checked consumer must call actual settingsHarness, generated broker/client and
  exercise normal, delayed commit/ack and callback-failure behavior. Keep snapshot
  nullability, readiness and optional clock honest; never claim all Chrome APIs
  are modeled. Existing synchronous initial subscription can be used as evidence,
  not a blanket promise of a ready snapshot.
- Prefer existing types; classic global settings definitions are not importable
  ES-module exports. The spec must resolve reuse/realm bridges without loading
  TS instead of generated JS or changing product bytes just for convenience.
- Freeze the actual strict graph, genuine positive/negative/internal controls,
  all ten consumer regressions, cloned full validation/protection and checker
  cost. If broad fake rewriting or unsupported casts are needed, reduce/reject
  that design before implementation. No new dependency is currently required.

No implementation-ready interfaces or graph are claimed here. This direction
needs user approval, then a written spec and reviewed implementation plan before
execution. The current BACKLOG-BLOCKED label reflected earlier prioritization,
not an external technical blocker; update it to direction-review pending.

## DT02: defer native migration now, approval pending

Native type stripping works in installed Node24.19.0 (RAM eval output1), but is
not type checking and does not apply tsconfig. `.mts`/`.cts` retain distinct module
systems and require explicit import extensions/type-only syntax. See the pinned
[Node documentation](https://nodejs.org/download/release/v24.19.0/docs/api/typescript.html).
[JSDoc/checkJs](https://www.typescriptlang.org/docs/handbook/type-checking-javascript-files.html)
already supplies checked contracts without a native runtime migration.

Concrete local rename risk, using identical RAM source/config and actual helper:

| Caller | Source | Diagnostics | Actual helper loaded |
| --- | --- | --- | --- |
| .cjs | const {page}=require('./tests/helpers.cjs'); page(42); | TS2345 | yes |
| .cts | same bytes | none | no |

The unchanged require call becomes an any boundary in this pinned TS-file probe.
This does not prove a properly redesigned .cts/.mts module cannot be safe; it
proves a blind rename can lose an existing DT00 check while appearing green.
Typed imports/actual graph and falsifiable negative controls would be required.

Current audit source inventory/snapshot uses js/mjs, ESLint matches JS/mjs, npm
test discovers tests/*.test.cjs, and audio checker pins mjs/cjs inputs. Renaming
requires coherent caller/discovery/CI/lint/parser/provenance migration; no loader,
new generated developer JS or wider exclusions as a shortcut. Typed product
sources already exist; Languages percentages are not a missing implementation.

Recommend retaining JSDoc/checkJs now. Revisit a selected file only when a measured
readability/duplication issue cannot be solved locally and native conversion also
preserves actual import checking, tests, audit inventory/input hashes and runtime
module semantics. Record that as **deferred native migration**, not implemented
or permanently unnecessary. Explicit user acceptance of this disposition is
required before maintenance closeout.

## Gate and protection

Recommended combined decision: proceed to the **DT01-S written-spec stage** under
the constraints above; defer **DT02 native conversion** with the revisit trigger.
NUM01 remains separate correctness policy. DT01-S implementation/validation and
the maintenance-closeout decision still precede AF05-B return; B2's existing
approval/native/release gates remain intact. No new technical release criterion.

PLANS tracks investigation completion separately from direction/disposition
approval. Product/version2.13.3/dist/ZIP/frozen evidence/branches/profile preserved.
No new security certification, public CI, native update or package migration.

## Independent review and final local checks

One fresh Astra max reviewer independently checked the two assessment artifacts
and connected code: **Critical0 / Important0 / Minor0; ready for direction and
disposition approval**. The reviewer reproduced the 88 fixture diagnostics,
unchecked builder0 / conditional parameter-contract4 TS2345 controls, and the
unchanged CJS/CTS require/import-graph counterexample. Ten direct consumers were
confirmed; two use only the shared event helper. This verdict is for the next
design direction, not implementation, merge or maintenance-closeout readiness.

The reviewer explicitly set aside exact interfaces/consumer/strict graph,
product-type reuse/realm bridges and full-fixture annotation feasibility/cost:
these remain next-spec obligations, not silently accepted implementation gaps.
A redesigned native TS solution, implementation correctness and native-update
acceptance were also not judged. No full regression/build/browser/network or
security run was claimed by this review.

Reviewed inputs: PLANS SHA256
`12984d779441e66dffaf018c444b9c85be2d54b2c4789834396f63b9b4f3333a`,
assessment SHA256
`d4ff5be4bc31e8510c73464f188f656d87bb4bb129031890156752f42168e498`.
They and HEAD stayed unchanged during review. This closeout section and the
PLANS review-status note were appended afterward; the recommendation is unchanged.

Main-agent fresh checks:

- `node --test tests/settings-client.test.cjs tests/settings-broker.test.cjs
  tests/settings-contract.test.cjs`: **55pass / fail0 / skip0**.
- `node node_modules/typescript/bin/tsc -p tsconfig.development.json`: **exit0**;
  this existing checker still excludes the settings fixture implementation.
- All six protected-file SHA256 values, product versions2.13.3 and protected P09
  profile-directory birthtime/mtime match the DT01-C final-protection record.
  HEAD and both protected branch SHAs match. This metadata check is not a new
  browser/profile-content or release acceptance test.
- `git diff --check` and Korean/English-only document scan: no findings.

Only PLANS and this assessment changed. No source/test/config edits, root dist
build/delete, dependency installation, user Chrome manipulation or publication.

Subsequent user approval on2026-10-13 accepted the DT01-S written-design direction
and DT02 conditional deferral. [The written spec](../specs/2026-10-13-dt01s-settings-fixture-contract-design.md)
is the next artifact; its approval and implementation-plan/execution approval
are separate. Earlier pending labels describe the assessment-stage state.

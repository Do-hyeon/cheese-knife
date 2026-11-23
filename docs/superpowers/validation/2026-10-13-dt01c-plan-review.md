# DT01-C implementation plan review

Date: 2026-10-13 Asia/Seoul. Reviewer: GPT-6 Astra, max, fresh read-only context.
Plan checkpoint: `a6054f9f0932031c6ddac777a32a1d81a2d25838`.
Runtime base: `9b8640fc004888ebd9e65106046b4b8795d62ca2`.
Unchanged artifact source blob: `aac259b58d5a0f370a374e53d9829b4c04093f20`.

## Verdict and corrections

Initial result: **Critical0 / Important1 / Minor1, with fixes before plan/execution
approval**, plus one separately author-identified lint wording correction.
Reviewed the complete plan/spec/design amendments against connected modules,
callers, tests, checker config, audit coverage and runners. No implementation,
compiler/runtime tests, audit commands, browsers, installs or public actions.
The earlier design review is separate from this fresh plan review.

| Grade | Finding | Verified plan amendment |
| --- | --- | --- |
| Important1 | Putting legacy/core identity assertions in the new checked test follows the legacy owned-files import and breaks the exact six-file graph. | Task1 Step2/8 put every legacy/core function, constant and frozen-list identity assertion in the existing unchecked artifact test. Checked consumer imports only core/signal/metrics; no bridge or hidden import. |
| Minor1 | Middle missing child was described as native ENOENT although the provider synthesizes its own error. | Task2 Step1 preserves Error name/message/code as Error/ENOENT/ENOENT; no native path/syscall promise. |
| Author correction | Plan named no-unused config instead of the actual development-report lint rule. | Task2 Step3 asserts the core's nonzero security/detect-object-injection rule from the existing security ESLint config and keeps real source/input-hash coverage. |

The author verified these against the legacy import, `owned-files.mjs`
missingError/resolve and `tests/tool-warning-remediation.test.cjs` with the actual
ESLint config before amending. The existing API source is unchanged; only docs
were edited. All findings are addressed in the plan; this is **one independent
review followed by author corrections**, not a second independent zero-finding
verdict or implemented PASS. No broader module split or per-task review added.

The reviewer confirmed plan/source consistency for reader function-property
variance, receiver/await/Buffer view/error identity, partial/nullability and
baseline identity, literal oracle sensitivity, four bounded compiler calls/nine
actual-source targets, actual filesystem/CLI/audit integration and isolation.
These are planned checks, not executed acceptance evidence.

## Declined-to-judge decisions

- Provider/browser-producer whole typing stays excluded: the six-file consumer
  graph is bounded; mistakes outside it remain unchecked.
- New malformed/coercion policy stays excluded: existing permissive behavior
  and native comparison exceptions remain; typed aliases are not validators.
- Cycles, hostile accessors/proxies and resource guarantees stay excluded:
  selected getter traces do not prove stable inputs or bounded recursion.
- NUM01 and DT01-S/DT02 remain separate decisions: C alone does not close all
  maintenance or authorize AF05-B implementation.
- Native update/rollback, release acceptance, cleanup redesign and security
  certification stay excluded: runners may remove disposable profiles/candidates
  after close failure; functional negative success is not retention proof.

These limits are retained explicitly in the spec/plan and must appear in the
execution result. No silently dropped requirement or new security claim.

## Current handoff

Plan and recommended **Native two-task execution + isolated candidate/synthetic/
installed validation + one final Astra max whole-branch review** await user
approval. Existing dependencies and disposable local clones only; root dist,
ZIP, frozen evidence, version2.13.3 and user/native profiles remain protected.
Implementation/source/test/config/browser work has not started.

The source blob was rechecked and the released ZIP/frozen evidence hashes were
read-only cross-checked against the plan during planning. These checks do not
replace the required before/after execution protection checks.

Local documentation commits only. **No push or PR without explicit user
instruction**; local completion, execution approval or review verdict is not
publication permission. Public CI/merge is a separate authorized workflow.

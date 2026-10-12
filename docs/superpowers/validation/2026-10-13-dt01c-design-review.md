# DT01-C design review

Date: 2026-10-13 Asia/Seoul. Reviewer: GPT-6 Astra, max, fresh read-only context.
Base: `9b8640fc004888ebd9e65106046b4b8795d62ca2`.
Design checkpoint: `f52c8aca2dbb06d6ce91ddb256542089634e07f0`.
Artifact source blob: `aac259b58d5a0f370a374e53d9829b4c04093f20`, unchanged.

## Verdict and evidence

Initial result: **Critical0 / Important1 / Minor2, with fixes before written-spec
approval**. The selected boundary is viable; no broader provider retype needed.
Review covered the written spec, PLANS and connected implementation/callers/tests.
No source/test/config edits, output-producing tests, browser runs or security
scan were performed. No PR or push; local documentation checkpoints only.

The reviewer used installed TypeScript7 with RAM-only virtual inputs and actual
imported measurement types. Method Reader accepted the config.js-only reader;
the readonly function-property Reader rejected it with TS2322. All-five-path and
broader-string readers, including Buffer returns, compiled. Proposed partial
report shapes accepted actual QualityReport/CaptureSummary through metadata
variables. Restored recursive array/Object.entries values rejected assignment
to number with TS2322; the un-restored array value leaked any.

These checks establish design feasibility, not a checked implementation or
actual six-file graph. The implementation plan must still contain reproducible
positive/negative and actual-source internal proofs. No planned test is PASS.

## Findings and corrections

| Initial grade | Finding | Verified correction |
| --- | --- | --- |
| Important1 | Method parameter bivariance accepts an incomplete reader supporting only config.js. | Use readonly readFile function-valued property; require narrower-reader negative proof and all-five/broad-string Buffer positive proofs. The caller still invokes reader.readFile normally, without an adapter/detachment. |
| Minor1 | Null case/transition projection errors were incorrectly used to exclude nullable alignment items. | Give alignments nullable/undefined items and a typed positive example; cases/transitions retain their distinct non-null item contract. |
| Minor2 | The general nonfinite-failure sentence did not state the repeated-baseline identity skip. | Scope nonfinite rejection to reached numeric branches; pin both repeated identity and cloned report results, without adding a policy check. |

The author independently called the unchanged API in RAM with five matching
64-character hashes and empty qualityFailures. Matching alignment arrays with
null/undefined returned `[]`. A repeated baseline with sampleRate Infinity
returned `[]`; a structuredClone second report returned
`['source/numeric/nodes.sampleRate']`. The reviewer also confirmed sparse holes.
No candidate-generated oracle or new runtime validation was used.

All three findings are addressed in the spec. This is an author amendment after
one independent review, **not a second independent zero-finding verdict**.
The current gate is the user's written-spec review; implementation remains pending.

## Declined-to-judge decisions

- Provider/browser-producer whole typing remains excluded: the actual reader
  consumer and real integration are required, but do not prove the unchecked
  provider implementation. Cost/limit: caller/provider mistakes outside the
  selected graph are not automatically caught.
- Malformed/coercion policies remain unchanged: this unit must preserve the
  existing raw API, not add a decoder. Cost/limit: existing malformed behavior
  and native exceptions remain; raw tests are not compiler proofs.
- Cycles/hostile getters/proxies/resource budgets are not new guarantees:
  selected getter order remains protected, broader correctness work is separate.
  Cost/limit: readonly/recursive types do not enforce stability, acyclicity or
  bounded work at runtime.
- NUM01 and DT01-S/DT02 implementation choices require their own decisions.
  Cost/limit: maintenance cannot be marked fully complete until remaining
  candidates are explicitly handled/resolved with appropriate approval.
- Native transitions/cleanup/security/release acceptance are unchanged scopes.
  Cost/limit: functional negative success is not termination/retention proof,
  and typed contracts are not native or security certification.

## Sequencing and integration

The user approved the architectural direction/design review and explicitly
chose maintenance completion before AF05-B. Preserve the B2 document and its
implementation/acceptance gates. Do not claim C alone closes all maintenance.
The user also reinforced **no documentation-only or tiny per-step PRs**.
Accumulate related approved implementation/tests/verification with these local
documents into a meaningful bundle; do not expand code without approval merely
to make a PR larger. A risk/rollback split needs explicit scope approval.

Source, products, version2.13.3, root dist, ZIP, frozen evidence and profiles were
not changed by this documentation work. Written-spec approval precedes the
implementation plan; plan/Native/isolated execution approval precedes code work.

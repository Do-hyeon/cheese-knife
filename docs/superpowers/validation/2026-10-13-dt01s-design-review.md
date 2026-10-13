# DT01-S design review and scope decisions

Date: 2026-10-13 Asia/Seoul. Baseline HEAD `66821c8`.
User approval accepted the design direction and DT02 conditional deferral, not
this written spec, implementation plan or execution. Docs only; no push/PR.

## Independent reviewer

One fresh Astra max reviewer, read-only, independently read the draft and
connected source. Verdict: **Critical0 / Important1 / Minor2; ready for written
spec approval with fixes**. The reviewer reproduced the thirteen-file isolated
graph and91 diagnostics, all in the unannotated fixture. No fixture annotation,
build, browser, scanner or external transmission was performed by that review.

Frozen draft inputs: spec SHA256
`cd1b54e7819a11f32086ab0fb76399f02a9fedfdd8f8ba394dbc6367f7f812fe`,
PLANS SHA256
`b73e47bc1ab044e91126d1ef7fe9f3828d171576b0f406929f86f39e23b9cc27`.
They and HEAD stayed unchanged during the independent review. The amendments
below are author corrections, not a new independent zero-finding verdict.

## Findings, verification and amendments

### Important: callback exceptions invalidate unconditional lastError cleanup

The draft demanded lastError absence after a failure callback. Actual fixture
lines99–103 delete it only after that callback returns. A success callback throw
enters catch and invokes a failure callback with another mutation decrement;
a failure callback throw skips deletion and rejects the asynchronous chain.
finally still decrements pendingRequests. The direct broker closed-channel
regression does not exercise this distinct fixture path.

Main's bounded actual harness/generated broker probe confirmed:

| Failed callback | Calls | lastError inside | lastError afterward | Observed rejection |
| --- | --- | --- | --- | --- |
| Returns normally | 1 | channel-unavailable | absent | none |
| Throws callback-probe-threw | 1 | channel-unavailable | channel-unavailable | callback-probe-threw |

The diagnostic was a separate Node process with a temporary unhandledRejection
observer, removed after fixture cleanup. No test harness/source behavior was
changed. The amended spec separates normal-return cleanup from exception
outcomes and requires bounded isolated regression observation. Repeat invocation,
metric update order, retained error and rejection are preserved, not repaired by
typing. Private current metrics were not inspected by the runtime probe.

### Minor: clone boundaries have different timing

The shorthand could imply uniform clone-before-wait behavior. Source and an
actual held-gate probe show: commit log captured nested value1, mutation while
held changes the live input to2, storage commits2. A following read captures2
before its gate; changing saved data to3 while held still returns2.

The amended timing table also records initial seed cloning, runtime request
clones before broker delivery, callback reply cloning after its gate, and the
uncloned raw send reply. No extra serialization, eager clone or freeze.

### Minor: nullable script-src boundary was missing from the assertion inventory

openUi's original `script.getAttribute('src')` is string-or-null despite
`script[src]` selection. Add only an erased assertion at that original read,
with the controlled page/load-order assumption. Current settings scripts do not
remove sibling src attributes, but the selector is not a guarantee across
intervening evaluation. No script.src resolution, fallback or new runtime guard;
raw null/path failure remains the original one.

## Additional author static-boundary correction

The small shape probe did not establish the full fake's compatibility with an
ambient Chrome Window property. Using the actual inferred apiFor result in a
RAM checked consumer reproduces **TS2352** for a DOMWindow-to-full-fake slot
assertion. Provider checking was disabled for this query; it establishes the
cast issue, not whole-fixture validity. Do not solve it with a double cast or
global fake declaration.

The corrected architecture uses `{chrome:unknown}` only at the owned assignment/
read slot. The generated client factory receives its typed local API and returns
the real client type. The generated broker factory receives the unknown realm
slot after scripts run and returns its three endpoint contracts. It does not
assert that scripts retained the original API or replace the slot read with a
cached local. The broker constructor remains an explicit runtime ABI assumption;
unknown input is not advertised as a checked Chrome-provider connection.

Corrected RAM shape control: clean0; invalid client style enabled value gives
TS2322, reading `.ok` from the unknown broker response gives TS18046, with no
other diagnostics. Earlier prototype attempts had a self-shadowing typeof api
parameter and an invalid fabricated TestContext; those failures were not accepted
as positives. This shape control still leaves provider bodies unchecked and is
not the planned full-fixture strict proof. The fixture's actual methods and
normal callback arguments must be checked in implementation independently of
the intentionally unknown realm crossing.

## Fresh main-agent baseline and protection checks

- Actual ten direct fixture consumer files, discovered with `rg -l -F
  settings-fixture.cjs tests -g '*.test.cjs'`, plus settings-contract.test.cjs:
  **214pass / fail0 / skip0**. This executes generated JS in jsdom, not TS source
  or user Chrome. No full repository suite or new S tests were claimed.
- Existing product, development and audio-tools tsc projects: **each exit0**.
- Reused the existing read-only DT01-C protection script and compared its entire
  JSON result to final-protection.json: dist58 digest, six protected file hashes,
  two protected branch SHAs, P09 directory birthtime/mtime and versions2.13.3 match.
  This is not a fresh profile-content/browser/native-update acceptance test.
- Diff hygiene and Korean/English-only document scan: no findings.

Rejected mixed-graph experiments are recorded in the spec: default module
detection179 diagnostics; legacy detection still pollutes existing bridge with3
Chrome assignment errors; separate checker13 owned files/91 fixture diagnostics.
The shape prototype's clean0/four misuse results and corrected realm-slot
clean0/two targets are separate, narrowly scoped evidence. No full fake feasibility
or final annotation cost was measured; those remain execution obligations.

## Reviewer exclusions and author disposition

- Full annotation feasibility, final strict0, internal any falsification,
  assertion inventory and checker cost: legitimate implementation-stage work;
  spec requires them and must be revised if whole-body checking needs unsafe
  casts, runtime rewrites or hidden code. No silent builder-only downgrade.
- Generated constructor inputs/outputs: explicit realm ABI assumptions, not
  complete static Chrome API compatibility. Accepted with connected runtime
  tests and exact unknown/typed boundary disclosure.
- Native suspension/update, redesigned DT02, NUM01: not this unit's behavior;
  previous acceptance/deferral and separate-policy gates remain intact.
- Publication, merge readiness and security certification: not judged or
  authorized. Existing protected release/profile/store artifacts remain intact.
- Untouched-source regression/checker results: accepted only as baseline, never
  advertised as DT01-S implementation PASS.

The written spec and PLANS include the confirmed amendments. Next gate is user
review/approval of the written spec, then detailed implementation planning and
its review. No source/test/config implementation or Native browser work yet.

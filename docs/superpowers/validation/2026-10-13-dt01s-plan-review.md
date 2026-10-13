# DT01-S implementation plan review

Date: 2026-10-13 Asia/Seoul. Local baseline HEAD
`051aad1280349e7f332b2a947c6a5578e4f30760`; unchanged fixture blob
`82eb66d6264c6ad59ee703156aa63e0e7f4dabe2`.

The user approved the written spec and requested a detailed plan, Astra max
adversarial review and PLANS update. This is documentation/provenance work, not
implementation, Native execution, publication, merge or branch cleanup.

## Independent review and frozen inputs

One fresh read-only Astra max reviewer read the approved spec, detailed plan,
PLANS and connected source. **Critical0 / Important1 / Minor1; ready for
completed-plan/user execution approval with fixes.** No child reviewers.

- Frozen plan SHA256:
  `042e81f0c799288082a852cd0b6a260874c44a877b02a97f629cc17c3f342ad2`.
- Frozen PLANS SHA256:
  `e890fac7a9cd628dc11464e62a13fa4d472dacc9a554042518b7a55b1ef33b95`.
- HEAD, fixture blob and both document hashes were rechecked before amendment;
  all remained unchanged during review.

The reviewer performed only a bounded disposable jsdom teardown probe. The
amendments below are main-agent corrections, not a fresh post-amendment
independent zero-finding verdict. They do not establish whole-fixture strict0.

## Important: remove ordinary tests' historical Git dependency

The draft instructed the new mandatory compatibility test to compare current
source with `git show 051aad1:tests/settings-fixture.cjs`. Actual verify CI uses
default shallow checkout and fetches only published `fb15f967` before npm test
(.github/workflows/ci.yml45,59–63). It does not fetch051aad1. Full local clones
would hide that absent-object failure.

The amended plan freezes one literal normalized-source SHA256 in the future
test; normal tests transform/hash only current source. Historical Git access
is one-time local provenance evidence, not a new CI fetch requirement.

Main compared untouched baseline and current source after CRLF/LF normalization,
then compared esbuild output using exactly loader js, format cjs, platform node,
target node24, treeShaking false, minifyWhitespace true, minifySyntax false,
legalComments none. Installed esbuild0.28.2 produced equal10330-byte output:

`839420561b9c62c7ca0d66fc65dd5313216b81e6751bed41e3d2073f09ad4713`.

An initial direct text comparison failed solely because git show returned LF
and the working file had CRLF; it did not compute a hash. The corrected
newline-normalized source comparison and normalized-code equality passed.
This is baseline provenance, not the future annotated candidate's acceptance.

## Minor: disposal, not window closure, stops late subscriptions

The draft attributed late-render suppression to a closed jsdom window. Actual
fixture callbacks remain active unless the client is disposed. The reviewer
held callback:patch, closed the window and released the gate: subscription
calls3→5, listeners2→2. Explicit dispose before close gave3→3 and2→1.

Main independently used the actual single-operation client.edit API and own
cleanup callbacks, with an8-second watchdog:

| Sequence | Subscription callbacks | Listeners |
| --- | --- | --- |
| Hold callback → close → release | 4→6 | 2→2 |
| Hold callback → dispose → close → release | 4→4 | 2→1 |

Absolute callback counts depend on subscription timing. The plan pins the
stable transition: no callbacks after disposal and exactly one listener
removed; close is cleanup only. No fixture/product behavior repair.
An earlier diagnostic mistakenly passed an operation array to single-operation
edit and exited with no observations; it was discarded, not counted as PASS.

## Other main-agent evidence and plan refinements

- Success callback throwing only once: actual callback called twice, first
  `{ok:true,error:null}`, then `{ok:null,error:'channel-unavailable'}`;
  lastError afterward absent. Holding two later patch callbacks on that same
  API yields maxInflight1, pinning existing double decrement indirectly.
- Original script getAttribute returning null yields TypeError,
  ERR_INVALID_ARG_TYPE and Node24.19.0's exact path-argument null message.
  No fallback/getter substitution was added.
- Internal weakening instructions specify only storage-write record values
  and only the actual client's subscribe argument; global RawStore/other client
  methods and public proof remain strict. This is a compiler-only control plan,
  not an implemented fixture annotation or observed25-diagnostic result.
- Ten direct fixture consumers discovered by rg plus settings-contract:
  **214pass / fail0 / skip0**, duration10468.4012ms. Generated JS/jsdom, not TS
  runtime or user Chrome. No new S tests/full suite were run.
- Existing product/development/audio-tools tsc projects: each exit0.
- Entire current result of existing read-only DT01-C protection script equals
  its frozen final-protection JSON: dist58/digest, six file hashes, two branch
  SHAs, P09 directory birthtime/mtime and versions2.13.3. No browser/profile
  contents were inspected. This is artifact preservation, not native acceptance.
- Documentation self-check: all65 relative Markdown links in the four changed
  documents exist, two sequential plan tasks, both amendment assertions present,
  no Hiragana/Katakana matches; diff --check exit0. No source/config changes.

## Deferred judgments and execution handoff

Whole-body annotation feasibility, strict0, final13-file inventory, public18
targets/internal25 diagnostics, exact fourth callback-exception oracle,
mutation sensitivity and checker cost remain implementation obligations.
The plan does not accept an unchecked facade or builder-only downgrade.

The reviewer did not perform full regressions/checker runs/builds/clones,
scanners, candidate/audio/installed checks or artifact verification. Main's
baseline checks above are separate evidence. Complete Chrome overload/realm
compatibility is not claimed. Runner retention/termination guarantees, native
update/rollback, DT02 native implementation, NUM01, AF05-B return, release
readiness and security certification remain outside this review.

Recommendation: approve the amended plan and Native two-task implementation,
isolated candidate/audio/installed validation and one final Astra max together.
Existing runner close-failure cleanup may delete its own disposable profile/
candidate; functional PASS is not retention proof. Preserve root dist, existing
profiles, old evidence and remaining clone/reports; stop additional phases on
abnormal termination. No implementation or browser work before this approval,
and no push/PR without separate explicit instruction.

# DT01-S: checked settings fixture and connected consumer

Date: 2026-10-13 Asia/Seoul. Local baseline: `66821c8`.
The user approved the fixture-plus-consumer design direction and DT02 conditional
deferral. The user approved this amended written spec on2026-10-13 and requested
detailed implementation planning plus Astra max review. No implementation,
Native/browser execution or publication is approved here.

## 1. Intent and chosen boundary

Catch real misuse in the existing shared settings test fixture without changing
its behavior or turning malformed-input regressions into trusted data. Keep
JSDoc/checkJs, CommonJS execution and generated product JS. DT01-C is locally
complete; this remaining maintenance precedes the AF05-B return decision. DT02
native migration is deferred with the previously recorded revisit condition.
NUM01 is separate input-error policy, and F00–F05 remain frozen.

The chosen approach checks the **whole existing settings-fixture implementation**
and one new connected normal consumer. It does not extract three builders, rename
files, replace the fake, add a schema/loader/framework, or claim the ten existing
consumer implementations are all typed. Their regressions remain mandatory.

The fixture includes worker recreation, CSS/storage counters, raw request paths,
UI loading and fake Chrome callbacks. Typing only its exports is insufficient.
Every checked function body must participate in the actual compiler graph; no
declaration facade, broad any, unchecked overload or ignore directive may hide it.

## 2. Current evidence and isolation decision

[Scope assessment](../validation/2026-10-13-dt-maintenance-scope-assessment.md)
records the 55/55 client/broker/contract baseline and independently reproduced
88 fixture type-information diagnostics. These are not 88 product defects.

Further RAM-only design queries establish these concrete constraints:

- Adding the five classic settings sources under current Node16 module detection
  isolates their globals as modules. The attempted combined query has179
  diagnostics; it is a rejected graph, not an implementation failure.
- `moduleDetection: legacy` resolves their classic globals, but adding Chrome
  ambient types to the existing DT00 graph gives3 bridge fake/full-Chrome
  assignment errors outside the fixture. Do not rewrite that bridge to fit.
- A **separate checker**, retaining the strict development flags and using
  `moduleDetection: legacy`, `types: [node, chrome]`, isolates those ambients.
  Its actual thirteen-file graph has91 diagnostics, all in the still-unannotated
  fixture; the five product bodies compile in that graph. This is graph/reuse
  evidence, not a checked-fixture PASS or a promised implementation cost.
- A small, throwaway contract-shape query validates generic event tuples,
  construction-state promotion of one installed method, the narrow jsdom Chrome
  assignment slot, and the real client edit return type: clean0, four independent
  shape misuses rejected. It is not an implementation facade or retained code.
  Early inline-comment versions failed to bind their JSDoc declarations; only
  the corrected multiline positive/negative query is accepted as shape evidence.
- The tiny Chrome-slot prototype is not proof for the full fake. A later query
  using the actual inferred apiFor result rejects a direct DOMWindow-to-full-fake
  slot assertion with TS2352. Use the compatible unknown assignment slot below;
  do not work around this by double casting a Window or promising full Chrome.

Do not change the product source into modules or inject global declarations for
convenience. Import the actual classic sources for static checking only.

## 3. Files, graph and CI

| File | Required change |
| --- | --- |
| `tests/settings-fixture.cjs` | Local JSDoc contracts, five type-only reference paths and guarded erased assertions; existing runtime statements preserved. |
| New `tests/settings-fixture-contracts.test.cjs` | Checked normal consumer of the actual harness/generated client and broker; runtime compatibility and compiler controls. |
| New `tsconfig.settings-fixture.json` | Extend development flags; override only types/moduleDetection and exact roots; include empty. |
| `package.json` | Add `typecheck:settings-fixture`: `tsc -p tsconfig.settings-fixture.json`; no version/dependency/test-discovery change. |
| `.github/workflows/ci.yml` | Insert the checker after `check:runtime-js` in the same Windows/Ubuntu offline foundation command. Keep all eight existing gates in order. |
| PLANS/spec/plan/validation | Approval, evidence, exclusions and maintenance-closeout state. |

Checker roots are exactly the fixture and new checked test. Five leading
`reference path` comments in the fixture reach existing config, style-schema,
contract, client and broker TS, with no runtime require of TS. No new type module.

Repository-owned graph is exactly13 files: the two roots, `tests/helpers.cjs`,
the five `src/settings/{config,style-schema,contract,client,broker}.ts` files, and
the existing main runtime/site-adapter/audio/player/preview contracts followed
by helpers. Library types are the installed Node/Chrome/jsdom/DOM dependencies.
No settings UI/bridge/background TS, legacy test family or new product module
enters this graph. Test the complete resolved graph, not only config.files.

Keep allowJs/checkJs/noEmit/strict/noUncheckedIndexedAccess/
exactOptionalPropertyTypes/useUnknownInCatchVariables true, existing target,
libs, module/resolution and typeRoots; no skipLibCheck or compiler suppressions.
DT00's config/roots/types, product config and audio checker stay unchanged. The
existing DT00 CI substring and audio checker end-of-command assertion remain
valid; the chosen insertion does not require weakening either regression.

`npm test` already discovers the new `.test.cjs`. Tests/config are outside the
current JS/mjs tool-audit inventory and tests are excluded from ESLint. Preserve
those pre-existing boundaries without claiming new scanner coverage or adding
exclusions. The new code is covered by the strict checker/runtime tests, not by
a fabricated security audit result. Package script changes legitimately alter
its input hash; frozen evidence must not be rewritten to disguise that delta.

## 4. Contracts and honest raw paths

Use the real classic `KnifeSettingsOperation`, `KnifeSettingsRequest`,
`KnifeSettingsView`, snapshot/CSS types and `ReturnType<typeof createSettingsClient>`.
Reuse broker initialize/invalidate signatures. These names are available through
the actual source references, not copied aliases pretending to export modules.

- Builders return the relevant discriminated operation member: config accepts
  string ID and boolean/number; style string ID/boolean; parameter string
  ID/number. No compile-time schema-ID, finite-value or range guarantee. NaN and
  Infinity still reach the actual runtime validator.
- Initial stored root keeps its existing optional object contract; clone and
  indexed field values are raw `Record<string, unknown>`, not a validated
  snapshot. Future fields, corrupt revisions and malformed nested containers
  remain representable. The unchecked legacy tests retain arbitrary raw calls.
- `send(name, message, override?)` and `request(name, action, payload?)` are raw
  request paths; message/reply/sender overrides remain unknown and raw payload
  is an unknown-valued record. Normal `patch` takes operations; malformed patch
  tests can continue calling the unchanged JS or use raw send. No normalization,
  JSON serialization, pre-validation or changed exception behavior is added.
- snapshot/patch/reload/request/send return `Promise<unknown>`: the fixture
  forwards replies, it does not validate them. Do not label them trusted
  KnifeSettingsReply. Raw sender handling belongs to the generated broker's
  existing validation boundary, not a fixture validator.
- Client methods reuse the actual product return type; `view()` is
  `KnifeSettingsView | undefined`. The initial subscription is synchronous in
  current product code, but callers must narrow the capture, then snapshot
  nullability/readiness. `time` is a present property with clock-or-undefined;
  fakeTime does not create an unproved generic/non-null guarantee.
- WorkerSources remains the existing four-key readonly string record. Its
  validator takes unknown; only the existing own-key/descriptor/string/trim
  checks justify the erased return assertion. Preserve all those checks and
  the object freeze. Worker getter may be undefined until startWorker finishes;
  do not invent an always-initialized realm guarantee.

### Events, gates and collections

`FixtureEvent<Args extends unknown[]>` stores functions `(...args: Args)=>unknown`.
addListener still returns its Set and removeListener still returns boolean.
emit remains void over a snapshot copy of listeners. Use function-valued
properties, not bivariant method signatures. Storage changes use a tuple of an
unknown-valued delta record and string area; runtime-message events use raw
message/sender/response callbacks, installed/permission events their actual
argument slots, startup an empty tuple. Do not erase argument checks with any[].

`holdNext(kind:string)` returns reached `Promise<unknown>`, wait `Promise<void>`,
release with an optional void argument, fail void and entered `(args:unknown)=>void`.
No boundary-kind DSL or typed data claim for raw reached values. Promise
executors assign their resolvers synchronously; only the resolver slots may
receive localized erased definite-initialization assertions, not a new noop
resolver, rejection catch, timeout or deferred helper. Callback ordering remains.

Annotate gates/arrays/Map/Set/WeakMap entries, call logs `{kind:string,args:unknown}`,
raw transport replies, storage changes and numeric metrics. Registration maps
allow partial existing Chrome RegisteredContentScript fields plus required id;
foreign registrations need not have matches. Tabs retain id/windowId and optional
url; get after has may use a local erased assertion, query may include an absent
tab. Restore only array/entry information erased by built-in narrowing and only
with an actual guard or the known normal parameter type as justification.

### Narrow Chrome surface and construction

Model the fixture's actual methods, not `typeof chrome`: runtime id/getURL/events,
normal sendMessage request with `(response:unknown)=>void` callback and optional
lastError; i18n getMessage; storage change events and Promise get/set/remove;
scripting get/register/update/unregister; tabs get/reload/query/sendMessage/create;
permissions contains/onRemoved/onAdded. Normal storage get supports the current
array/default-record/nullish paths, not a promise of all Chrome get overloads.
set accepts an unknown-valued record; remove a string or string array; scripting
and tabs accept their actual selected option fields using existing Chrome types.
Tabs status reply and get/send callbacks stay raw where not validated.

Use explicit per-method parameter/return contracts so their actual bodies are
checked. The initial api literal has only sendMessage optional because it is
installed later. A single construction-state promotion after that assignment
may erase that one optional difference; all other initial members and the
installed method body must already be checked against the final contract. Do
not assert an untyped whole API as complete or return a rebuilt/spread API.
The null sendMessage raw regression keeps its existing synchronous exception.

## 5. Realm boundary and assertion limits

Keep existing generated-JS load order and constructor typeof assertions. Only
the existing `window.chrome` assignment/read slot may be viewed as `{chrome:unknown}`;
do not globally augment Window/DOMWindow or cast the entire Window registry.
This compatible slot erases an ambient full-Chrome fiction, not the checked
apiFor result: client.api remains the typed local API. At the already asserted
generated client constructor, declare `(api:FixtureChrome)` returning the real
client type. The broker factory accepts the **unknown realm slot** and returns
the three broker endpoint methods. The preceding worker scripts may replace
that slot; keep its original read after evaluation rather than passing a cached
local API or asserting the realm value satisfies FixtureChrome.
The broker listener remains a raw ingress signature accepting unknown message,
sender and response callback; its initialize/invalidate signatures are derived
from the actual product constructor. It is not a declaration facade replacing
the checked fixture or product body.

These are explicit generated realm ABI assumptions, **not** static proof that a
partial fake satisfies every Chrome API/overload or every future product use.
Connected runtime tests must use the actual loaded constructors. Keep direct
property read/call order and existing guards; no typed registry wrapper, factory
adapter, TS execution, injected replacement constructor or additional validator.

Other assertions are only local: validated four-source record, synchronous
resolver assignment, map membership/metrics registration and built-in erasure.
The openUi `script[src]` loader also needs an erased string assertion at its
original `getAttribute('src')` result. The assumption is the controlled built-in
page/load order, not a durable guarantee from the selector: earlier evaluated
scripts could remove later attributes. Keep the getter and native null/path
exception; no `script.src`, fallback, filter or extra runtime guard. Locale JSON
can be read as an unknown-valued record with a localized message
field view for the controlled repository catalogue; do not claim JSON.parse
validated external data or change optional-message fallback semantics. Each
assertion must be recorded with its exact property/guard or initialization basis.
No double cast, whole-harness cast, raw-to-trusted reply cast or compiler ignore.

## 6. Compatibility and verification obligations

The new checked test is the connected normal consumer, not a signature-only
mock. It instantiates the real harness, initializes the generated broker, opens
the generated client, narrows view/snapshot and optional clock, edits valid
operations, holds commit and callback acknowledgement separately, verifies
storage/view state, and observes callback-scoped lastError failure/recovery.
Use raw reply assertions without pretending they are trusted. Keep all ten
direct consumer regressions, including the two event-only consumers.

Before annotations, pin independent literal observations for event return/emit
order and listener mutation, the distinct clone timings below, delayed commit/
ack, null send exception, counters/busy guard, worker-source validation/replacement,
storage/registration identity and listener/window cleanup. Keep the existing
published/current worker compatibility goldens; do not generate expectations
from the candidate or promise real Chrome suspension from jsdom.

| Boundary | Existing capture/delivery timing |
| --- | --- |
| Initial storage | Clone the caller's object on harness creation. |
| storage.get | Capture its returned snapshot before the read gate waits. |
| storage.set | Commit log is cloned before the gate; saved values are cloned from the live input after the commit gate releases. Mutating held input changes saved data, not the earlier log. |
| runtime.sendMessage | Clone the request into the message log and broker delivery before asynchronous gates; clone the reply for the callback only after its gate. |
| raw send | Resolve the original reply after the response gate, without a reply clone. |

For a transport-failure callback **returning normally**, lastError is visible
inside it and deleted afterward. Preserve the existing callback-throw behavior:
a throwing success callback enters catch, invokes the failure callback and
decrements the mutation metric again; a throwing failure callback bypasses
lastError deletion and leaves a rejected async chain, while finally still
decrements pendingRequests. Pin these exception outcomes in an isolated process
with a bounded rejection observation, not by muting the main runner. Do not
add finally cleanup, alter counters, suppress rejection or prevent repeat
invocation as part of typing. Any behavior repair needs a separate decision.

Implementation acceptance requires:

1. Actual fixture/checked consumer compile with0 diagnostics, exact13-file graph,
   unchanged DT00/audio/product graph and all existing strict settings.
2. Positive raw/normal compiler controls and batched independent misuse targets:
   builder ID/value, normal operation edit, callback reply unknown, event tuple/
   listener argument, gate kind/reached unknown, view snapshot nullability,
   optional clock, selected Chrome method fields and unknown stored fields.
   Assert each target file/line/code; import/ambient/parser failure is not PASS.
3. A clean temporary copy of the actual annotated fixture compiles before
   inserting internal event-argument, callback-response, gate-data, storage-entry
   and subscriber-view misuses at their real binding sites. Every target must
   be rejected; each corresponding intentional any weakening must remove its
   rejection. Copy only for compiler tests, adjust relative source references
   to actual files and verify the remainder before injecting probes. Four
   bounded compiler subprocess groups suffice; no per-case compiler framework.
4. Runtime literals, all ten direct consumers and complete isolated suite pass
   without new skips or looser expectations. Compare normalized baseline/
   candidate fixture output after comment erasure to expose runtime token
   changes; any difference needs explicit explanation and compatibility proof.
   Only erased annotations/type references and required cast parentheses are
   expected, not control-flow/storage/scheduling edits.
5. After separate execution approval, immutable tracked clone with physically
   copied pinned dependencies: nine offline foundation gates, package candidate,
   synthetic audio and installed positive/negative regressions. Never build or
   remove root dist. Preserve runner cleanup limitations and genuine skips;
   functional negative PASS is not proof of safe profile retention.
6. Record cold1/warm5 baseline versus final checker timings and resulting
   annotation/erased-assertion inventory. If keeping the fixture checked requires
   a runtime rewrite, broad casts or hidden bodies, stop and revise the spec;
   do not silently downgrade to builder-only checking or all tests' TS migration.
7. Fresh Astra max final implementation review; publication/public CI/integration
   remain separate explicitly instructed actions, not completion conditions
   secretly authorizing push/PR. This design review is not a security scan.

## 7. Protection and approval gate

This stage changes docs only. Future implementation changes package scripts and
CI as enumerated, not dependencies/version/permissions/product TS/generated JS.
Manifest, lockfile, original dist58, release ZIP, frozen P02/ledger, protected
branches and P09/user Chrome profiles remain protected. No tool installation,
remote transmission, account/store operation or user extension reload.

Written-spec approval permits detailed implementation planning and its review;
completed-plan/execution approval must precede source/tests/config/Native work.
Current branch is reused; local document commit only, no push/PR/merge/deletion.
Maintenance closeout is still pending DT01-S execution and explicit remaining
candidate dispositions. DT02 accepted deferral is not native implementation
completion. AF05-B/B2 existing approval and release gates remain intact.

## 8. Independent review and amendments

Fresh Astra max reviewed the frozen draft: Critical0 / Important1 / Minor2,
ready for written-spec approval with fixes. The callback exception invariant,
clone timings and nullable script-src assertion were verified against actual
code and corrected above. A subsequent author RAM check also caught the full
fake/Chrome slot incompatibility; the unknown slot and broker input now explicitly
preserve that unchecked realm boundary rather than hide TS2352 with double casts.
[Review and design evidence](../validation/2026-10-13-dt01s-design-review.md).
These are author amendments, not a second independent zero-finding review or
verification of a not-yet-implemented fixture.

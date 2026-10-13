# DT01-S Settings Fixture Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task after execution approval. Steps use checkbox syntax. Native is recommended: two sequential tasks and one fresh Astra max final review, not per-step agents or PRs.

**Goal:** Check the actual shared settings fixture and one connected normal consumer, rejecting meaningful misuse without changing runtime behavior or hiding raw inputs.

**Architecture:** Keep the existing CommonJS fixture, its exports and generated-JS execution. Use local JSDoc, actual classic product types and a separate thirteen-file checker to isolate Chrome ambients. Reuse bounded compiler proofs and disposable clone validation, not a new type facade, loader or framework.

**Tech Stack:** Existing Node24.19.0, TypeScript7.0.2, JSDoc/checkJs, node:test/jsdom30.1.2, esbuild0.28.2; existing Playwright1.62.1/ESLint10.12.0/npm12.2.0/Gitleaks8.30.1. No installation.

**Spec:** [Approved DT01-S design](../specs/2026-10-13-dt01s-settings-fixture-contract-design.md), accepted by the user on2026-10-13; [design review/amendments](../validation/2026-10-13-dt01s-design-review.md). This plan and Native/isolated execution are not yet approved.

## Global Constraints

- Local base `051aad1280349e7f332b2a947c6a5578e4f30760`, fixture blob `82eb66d6264c6ad59ee703156aa63e0e7f4dabe2`. Reuse current branch/checkout; no worktree or branch deletion. **No push or PR without explicit user instruction**, and no implicit merge authority.
- Only fixture/one new test/one new checker, package script, CI and docs change. Product TS/generated JS16, manifest/permissions, lock/dependencies/version2.13.3, root dist58/release ZIP/frozen evidence/old profiles remain protected. package.json changes only its new checker script; its expected hash changes, not its dependencies/version.
- Keep CommonJS, generated-JS load order, guards, property/read/call order, object identities, scheduler/clones/counters/lastError and native exceptions. No callback-error repair, extra serialization, freeze, queue, retry, validation or global Window augmentation.
- Thirteen repository files only in the new checker; all actual fixture bodies checked. Keep existing DT00/product/audio projects and eight foundation gates unchanged, adding one isolated checker between runtime inventory and product typecheck. No skipLibCheck, ignore, broad any, double cast or unchecked replacement declaration.
- Test malformed inputs through existing unchecked regressions/raw send and isolated child scripts, not fabricated trusted replies. Constructor ABI/owned Chrome unknown slot remain explicitly unverified as complete Chrome compatibility.
- No user Chrome/profile/speaker/store/account/extension reload, native update/rollback, new dependency or external model/tool transmission. Browser validation, after separate execution approval, uses bundled Chromium and fresh disposable profiles only. Existing close-failure cleanup can still delete its own profile/candidate; functional negative PASS does not prove retention or termination.
- DT02 deferral is accepted, not native conversion DONE. NUM01 and any callback behavior repair are separate policy decisions. Maintenance closeout/AF05-B return and F00–F05 release gates are not authorized by this unit.

## Review Focus

1. Callback throws can repeat invocation/decrement metrics or retain lastError; Task1's isolated literals preserve actual outcomes rather than silently repairing them.
2. Read snapshots, commit logs/live saved values and callback/raw replies clone at different times; Task1 pins each timing and alias difference.
3. Worker scripts can replace Chrome and script[src] can yield null; Task1 pins the post-eval slot and original getter/native path exception.
4. Public signatures can stay strict while internal event/callback/gate/storage/view values leak any; Task1's actual-body copies and one-at-a-time weakening controls must expose that.
5. Chrome ambients or new command placement can contaminate old checks/discovery; Task1 pins the full graph and Task2 checks actual CI/package integration without changing old assertions.

## Interfaces and local annotations

All types below are local JSDoc in `tests/settings-fixture.cjs`, not a replacement .d.ts/module. Use actual Knife globals via five leading reference paths to config/style-schema/contract/client/broker TS. Type-only references never load TS at runtime.

```text
RawStore = Record<string,unknown>
FixtureFn<Args extends unknown[]> = (...args:Args)=>unknown
FixtureEvent<Args extends unknown[]> = {
 listeners:Set<FixtureFn<Args>>;
 addListener:(fn:FixtureFn<Args>)=>Set<FixtureFn<Args>>;
 removeListener:(fn:FixtureFn<Args>)=>boolean; emit:(...args:Args)=>void
}
FixtureGate = {reached:Promise<unknown>;wait:Promise<void>;
 release:(value?:void)=>void;fail:()=>void;entered:(args:unknown)=>void}
FixtureCall = {kind:string;args:unknown}
FixtureMetric = {current:number;max:number}
FixtureScript = Partial<chrome.scripting.RegisteredContentScript> & {id:string}
FixtureTab = {id:number;windowId:number;url?:string|undefined}
FixtureBroker = Pick<ReturnType<typeof createSettingsBroker>,'initialize'|'invalidateStyles'> & {
 listener:(message:unknown,sender:unknown,respond:(response:unknown)=>void)=>boolean
}
FixtureClient = ReturnType<typeof createSettingsClient>
FixtureSend = (message:KnifeSettingsRequest,callback:(response:unknown)=>void)=>void
FixtureStorageWrite = (value:RawStore)=>Promise<void>
FixtureClientFactory = (value:FixtureChrome)=>FixtureClient
FixtureBrokerFactory = (value:unknown)=>FixtureBroker
FixtureClientOptions = {fakeTime?:boolean|undefined}
FixtureUiOptions = {locale?:string|undefined;query?:string|undefined;
 target?:{tabId:number;windowId:number}|undefined;fakeTime?:boolean|undefined;
 setup?:((api:FixtureChrome,dom:import('jsdom').JSDOM)=>void)|undefined}
WorkerFile/WorkerSources = existing four-key readonly string record
```

FixtureChrome is the following function-valued surface; all implementations are checked against it, not merely returned through a cast:

| Member | Signature/type |
| --- | --- |
| runtime | id:string; getURL:(path:string)=>string; sendMessage:FixtureSend; lastError?:{message:string}\|undefined |
| runtime events | onMessage:FixtureEvent<[unknown,unknown,(reply:unknown)=>void]>; onInstalled:FixtureEvent<[chrome.runtime.InstalledDetails]>; onStartup:FixtureEvent<[]> |
| i18n.getMessage | (key:string)=>string |
| storage.onChanged/local.onChanged | The same FixtureEvent<[RawStore,string]> object |
| storage.local | get:(keys?:string[]\|RawStore\|null)=>Promise<RawStore>; set:FixtureStorageWrite; remove:(key:string\|string[])=>Promise<void> |
| scripting | getRegisteredContentScripts:(options?:{ids?:string[]\|undefined})=>Promise<FixtureScript[]>; register/update:(scripts:FixtureScript[])=>Promise<void>; unregister:(options?:{ids?:string[]\|undefined})=>Promise<void> |
| tabs | get:(id:number)=>Promise<FixtureTab>; reload:(id:number)=>Promise<void>; query:(options:chrome.tabs.QueryInfo)=>Promise<(FixtureTab\|undefined)[]>; sendMessage:(id:number,message:unknown)=>Promise<unknown>; create:(options:chrome.tabs.CreateProperties)=>Promise<void> |
| permissions | contains:(options:chrome.permissions.Permissions)=>Promise<boolean>; onRemoved/onAdded:FixtureEvent<[chrome.permissions.Permissions]> |

Use the actual names registerContentScripts/updateContentScripts/unregisterContentScripts; the table's shortened labels are not new API names. ConstructingChrome differs only by optional runtime.sendMessage. Context-check its initial literal and installed method, then promote that single initialization difference with one erased assertion before return. Messages log `{api:object,message:KnifeSettingsRequest,subscribers:number}`; no recursive API inference or claim of validated arbitrary raw messages.

Function contracts: getURL(string):string; config(string,KnifeScalar):Extract<KnifeSettingsOperation,{type:'config'}>; style(string,boolean):style member; parameter(string,number):parameter member; event<Args>():FixtureEvent<Args>; validatedSources(unknown):WorkerSources. settingsHarness takes existing TestContext/object?/WorkerSources? and returns its actual inferred object, **no whole-harness cast**. Its inner contracts are:

```text
apiFor(name?:string):FixtureChrome
holdNext(kind:string):FixtureGate
boundary/cssBoundary(kind:string,args:unknown):Promise<void>
announce(delta:RawStore):void
startWorker(nextSources?:WorkerSources):void
send(name:string,message:unknown,override?:unknown):Promise<unknown>
request(name:string,action:string,payload?:RawStore):Promise<unknown>
client(name?:string,options?:FixtureClientOptions):FixtureClient & {
 dom:JSDOM;api:FixtureChrome;time:ReturnType<typeof clock>|undefined;
 view:()=>KnifeSettingsView|undefined;maxInflight:()=>number
}
openUi(name:string,options?:FixtureUiOptions):Promise<{dom:JSDOM;api:FixtureChrome;time:ReturnType<typeof clock>|undefined}>
snapshot(name?:string):Promise<unknown>; patch(name:string,operations:KnifeSettingsOperation[]):Promise<unknown>
reload(id?:number,windowId?:number):Promise<unknown>; initialize():Promise<unknown>
invalidate(options?:{retry?:boolean}):void; failNext(string):void; setPermission(boolean):void; settle():Promise<void>
```

Keep worker `JSDOM|undefined`, settledEpoch `number|undefined`, stopInvalidation optional, raw saved fields unknown, typed collection entries and captured view optional. A private broker variable uses the generated-constructor shape after synchronous startWorker for normal calls; it is an initialization/ABI assumption, not a runtime guard on injected worker scripts. Preserve native early-access failure. No always-ready/non-null claim on the exposed worker or client view.

Allowed erased assertions are exactly the spec's boundaries: stored object index view, checked four-source record, Promise resolver slots, map membership/registered metrics, built-in entry/array erasure, one installed-method promotion, owned `{chrome:unknown}` slot and guarded constructor signatures, original script-src getter and controlled locale message field view. Keep every original expression; record exact guard/initialization/catalogue assumption per assertion. A cast requiring runtime rewriting or additional whole-API assertions stops execution for a spec revision.

### Task 1: Whole fixture checking, connected consumer and falsifiable compatibility

**Files:** Modify `tests/settings-fixture.cjs`; create `tests/settings-fixture-contracts.test.cjs`, `tsconfig.settings-fixture.json`. No product/helpers/legacy-test mutation.

**Interfaces:** Consume the actual generated settings JS and existing helpers/product types. Produce the interfaces above, the unchanged runtime exports and the exact checked graph. Task2 consumes this checker/test without changing their public API.

- [ ] **1. Pin the untouched baseline and literal oracle first.** Verify HEAD/fixture blob above; run the ten direct consumer files plus settings-contract (existing214/214 baseline). Add tests prefixed `fixture compatibility:` to the new checked test before changing the fixture; run only that prefix with Node until literals pass on untouched code. Plain JS execution does not require new JSDoc to compile yet. Do not regenerate expected values from the annotated candidate.

  `event snapshot and returns`: listeners A/B, A removes B and adds C; first emit still A,B, second A,C. Assert returned Set identity, remove true then false. `clones and identities`: caller seed mutation cannot change saved; held commit log captures1 while later live-input mutation commits2; held read captures2 while saved becomes3. Assert saved/registration objects remain identical, maxConcurrentWrites/maxConcurrentCss1 in their held normal cases. Runtime request log and broker receive pre-wait clones; callback reply cloned after its gate (request getter count used only if observed on baseline). Raw send response aliases the object received from its response gate; no reply normalization.

  `generated state and teardown`: actual client initial view has loading/null snapshot, then ready snapshot; two valid fields merge. Hold commit and callback acknowledgement separately and assert saved/display state, pending keys and one mutation in flight. For teardown, hold callback:patch, record subscription callbacks/listeners, explicitly dispose the client, then close its own DOM and release the gate. Assert no further subscription callbacks and exactly one removed listener. Disposal prevents late rendering; window closure is cleanup only. Use the actual single-operation `client.edit(config(...))` API. Retain existing worker validation/busy/old-new-old/identity goldens in the unchanged compatibility family.

- [ ] **2. Add bounded callback/native-path cases and oracle sensitivity.** Child scripts are trusted local test strings run via process.execPath `-e`, require the actual fixture by literal absolute path, and use only their own jsdom windows. Timeout15s/maxBuffer1MiB; require status0/signal null/error absent and exact parsed observations. Install/remove an unhandledRejection observer **inside the child only**, then release its gates/close windows; do not mute the main test runner or serialize thrown Error as a trusted reply.

  Failure callback returning normally: calls1, inside `channel-unavailable`, lastError afterward absent, no rejection. Failure callback throwing `callback-probe-threw`: calls1, same inside/after error, rejection list `['callback-probe-threw']`. Success callback throwing only on its first call: calls2 with `{ok:true,error:null}` then `{ok:null,error:'channel-unavailable'}`, no rejection/retained error. With two later patch callbacks held on that same client's API, public maxInflight stays1, pinning the existing double decrement without a new private metric accessor. Two throwing callbacks retain error and reject; preserve pending-drain behavior with a settled versioned worker restart afterward. Baseline diagnostics have confirmed the first three outcomes; observe the fourth before freezing its exact literal.

  `post-eval worker slot`: supplied four-file worker sources keep the actual broker, but config adds a Chrome Proxy counting storage reads; initialize/patch must pass through that replacement (count>0). Do not replace the constructor or pass a cached apiFor value. `nullable original src`: setup overrides one selected script's getAttribute to return null for src; assert TypeError/ERR_INVALID_ARG_TYPE and exact Node24.19.0 message `The "path" argument must be of type string or an instance of Buffer or URL. Received null`. Restore nothing outside the disposable DOM. No script.src, guard or fallback.

  `runtime tokens unchanged`: freeze normalized baseline SHA256 `839420561b9c62c7ca0d66fc65dd5313216b81e6751bed41e3d2073f09ad4713` in the new test. Normal tests transform only the current fixture with installed esbuild.transformSync, loader js/format cjs/platform node/target node24/treeShaking false/minifyWhitespace true/minifySyntax false/legalComments none, and hash its returned code. This literal was obtained once from the untouched base/blob above; normalized output10330 bytes matches the current untouched fixture. Historical `git show` belongs only to one-time local provenance evidence, never the normal test: CI's shallow checkout does not fetch051aad1. No new fetch/history requirement. Verify oracle sensitivity on disposable raw child copies by one changed clone timing and one skipped lastError deletion: clean literals first, then intended assertion failure, not import/parse/setup failure. Source copies stay under a unique owned proof folder, not root fixture edits.

- [ ] **3. Write graph/public contract RED.** New config extends `./tsconfig.development.json`, compilerOptions only `moduleDetection:'legacy'`, `types:['node','chrome']`, files only fixture/new test and include[]. The new test checks flags, exact roots and resolved13 graph. Its initial strict/proof run must fail from unannotated fixture/real misuse gaps; import/ambient/parser errors are setup failures, not accepted negative evidence. Preserve that RED record before adding annotations.

- [ ] **4. Annotate the existing body with the interfaces.** Add the five actual source reference paths and local typedefs. Context-check all fake method bodies and collection values; preserve original function/property/export names and statements. Use property-function event signatures, definite resolver slots without noop initialization, raw return promises, nullable view/clock and guarded source/map assertions. Keep script getter/read order and `.lastError` deletion at its original position. Name local types as above so proof weakening can locate exact single aliases/annotation slots. No new runtime helper or declaration module.

- [ ] **5. Complete the real checked consumer.** Initialize actual harness/broker; create actual generated client with fakeTime true; assert/narrow captured view, snapshot and clock before reads. edit config arrowSeek false and previewVolume25, style left-chat true, parameter chat-font-size8 then0; settle and assert exact values/membership. Hold commit then callback:patch and verify each intermediate state separately. A callback gate failure causes unknown/response-unknown without automatic resend; explicit new input recovers. No whole-object casts, typed replacement client or TS-at-runtime. Keep raw reply values unknown and use literal deepEqual/type guards.

- [ ] **6. Implement public positive and batched negative compiler proofs.** Reuse compile/proof-directory/diagnostic matching from the existing audio contract test **locally**, without importing that test or its graph. Fresh `output/settings-fixture-types-*`; verify real resolved path remains inside workspace output before recursive cleanup. Spawn installed tsc with `-p <proof-config> --pretty false`, timeout30s/maxBuffer1MiB; positive must return0 with no diagnostics, error/signal/null status fail. Proof `.cjs` uses a literal require of the actual fixture, no CTS require-any bridge. Types/flags inherit the actual new config; override files to the one proof/include[] and verify imported fixture/type graph.

  Positive proof uses an async function with a real TestContext **parameter**, not fabricated `{}`. Valid builders/edits/events/gate, narrowed view/snapshot/clock, partial registration, tab query missing item guard, WorkerSources four strings, explicit undefined UI defaults, unknown raw send/sender/payload and raw replies compile. Normal IDs remain strings and nonfinite numbers remain representable. Each negative row is isolated from prior narrowing and has its own source line:

  | Misuse | Expected diagnostic |
  | --- | --- |
  | config ID42; string config value; style enabled1; parameter value'8' | four TS2345 targets |
  | client.edit style enabled1 | TS2322 |
  | normal sendMessage callback reads reply.ok | TS18046 |
  | sendMessage callback parameter declared number | TS2345 |
  | storage event area42; listener reads string area.__missing | TS2345; TS2339 |
  | holdNext42; reached callback reads raw value.__missing | TS2345; TS18046 |
  | fresh optional view.phase; narrowed view with unchecked null snapshot.revision | TS2532/TS18048; TS18047 |
  | fresh client.time.advance without guard | TS2532/TS18048 |
  | raw saved.config.preview; awaited raw snapshot().ok | two TS18046 targets |
  | tabs.create url42; registered script id42 | two TS2322 targets |

  Require all18 target rows and no unrelated/imported-file diagnostics; controlled multiline continuation text is not another finding. Narrowed positive variables must not accidentally make later negatives valid. No any casts inserted in the public proof.

- [ ] **7. Check actual internal bindings and their weakening controls in two compiler calls.** Copy the actual annotated fixture into six temporary CJS files: strong plus one weakened copy per target below. Rewrite only the unique helper require and five reference paths to literal actual absolute paths; assert the remainder equals actual source after newline normalization, and hash-check root unchanged. Source alias/annotation replacements are unique and count-checked. One clean call includes all six files with **no injected misuses**, must have0 diagnostics; one mutant call inserts all five targets into each copy. No fixture copy is executed.

  | Real binding target | Compiler-only misuse | Weakening of actual annotation in its one copy |
  | --- | --- | --- |
  | fn in event emit loop | fn(...args,'__dt01s_extra') | listeners Set element becomes any |
  | reply in broker callback delivery | reply.__dt01s_missing | FixtureBroker response callback unknown becomes any |
  | reached promise in holdNext | reached.then(value=>value.__dt01s_missing) | only reached local Promise<unknown> becomes Promise<any> |
  | v in Object.entries(value) storage set map | v.__dt01s_missing | only FixtureStorageWrite record value unknown becomes any |
  | v in actual instance.subscribe | v.__dt01s_missing | only FixtureClientFactory subscribe argument becomes any; retain every other real client method |

  Expected strong diagnostics5; each weak copy lacks **only its own** target and retains other4, total25 target locations. Accept TS2345 at extra event argument, TS18046 at unknown reply/gate/storage and TS2339 at view. Check exact file/line/code and zero diagnostic at each weakened own target; any other error fails. Weak copies are test-only controls, not production types. This proves internal any falsifiability even when public aliases remain strict. Four diagnostic-proof tsc calls total (two public/two internal); one additional --listFilesOnly call is inventory, not a negative proof. No per-row processes or installed compiler API framework.

  Keep the storage weakening local: change only FixtureStorageWrite's parameter from RawStore to Record<string,any>. For the client weakening, replace only FixtureClientFactory's return with Omit<FixtureClient,'subscribe'> & {subscribe:(fn:(view:any)=>void)=>ReturnType<FixtureClient['subscribe']>}; preserve every other actual method. These controls do not weaken global RawStore or the public proof.

- [ ] **8. Run focused green and record the exact graph.**

  ```powershell
  node node_modules/typescript/bin/tsc -p tsconfig.settings-fixture.json --pretty false
  node node_modules/typescript/bin/tsc -p tsconfig.settings-fixture.json --listFilesOnly
  node --test tests/settings-fixture-contracts.test.cjs
  ```

  Also run the ten existing direct fixture consumers plus settings-contract, preserving all214 existing cases, and development-types/audio-signal contract tests. Expected exit0/fail0/new skip0; four proof calls plus one inventory call, actual13 graph. List is fixture/new test/helpers, five settings sources, and runtime/site-adapter/audio/player/preview contracts. Do not import published-baseline/owned-files/tools into the checked test; legacy compatibility tests own that boundary. Token equivalence/literal oracle/internal controls must all pass, not just public typing. If body checking requires an unsupported cast/runtime rewrite, stop for a spec revision.

- [ ] **9. Local implementation checkpoint.** Stage only fixture/new test/new config and approved execution docs; commit `test: type settings fixture and consumer contracts`. Keep the token/oracle RED→GREEN evidence. No generated files, push, PR or per-task review in recommended Native execution.

### Task 2: Real CI connection and isolated whole-branch validation

**Files:** Modify `package.json`, `.github/workflows/ci.yml`, `tests/settings-fixture-contracts.test.cjs` (connection checks), PLANS/this plan. Create `docs/superpowers/validation/2026-10-13-dt01s-settings-fixture-contracts.md` for actual implementation evidence, distinct from plan-review record.

**Interfaces:** Consume Task1 checker/consumer. Produce `typecheck:settings-fixture` package command and the nine-gate offline foundation sequence, with unchanged product behavior and explicitly measured additional maintenance cost.

- [ ] **1. Write real connection RED.** In the checked test, assert package script equals `tsc -p tsconfig.settings-fixture.json`; CI has the new command exactly once immediately after runtime inventory and before product typecheck, on both foundation platforms under existing offline env. Assert old development substring/audio tail and existing npm-test discovery remain unchanged. Run only this new connection test; before integration its missing script/CI assertions must fail. Do not rewrite old regex/tests to pass.

- [ ] **2. Add only the script and CI invocation.** Preserve dependencies/lock/version and every old command/order/timeout/env. Run actual new checker command through existing npm CLI, plus package/development/audio contract connection regressions. Commit implementation before clone validation so its target is immutable.

- [ ] **3. Capture protected baseline and build fresh isolated clones.** Preserve exact original dist58 digest `d01bd672ff9bb9ffab808099432129b9429f5baa2fbf256e612531e358086c60`, release ZIP SHA `67ae9c1512fef7e0ca651c150e3b4e3052a73e7d96b7ed988adc85114cdb1d51`, frozen P02 `f027a9e8a8c7b44df1a0d8104a7354c9c787a8f6b62b4f532131fb7bcd193dd8`, ledger `4c312e3e66bb773470816779ef1868b4356b344f645a0efaf44bc5e49ebc0401`, manifest/lock, protected branches and P09 profile metadata. Verify package delta is only the script; original package hash is not expected after that approved edit. Do not rewrite old final-protection JSON.

  After execution approval, unique ignored `output/dt01s-validation-<run>` clone at implementation SHA and `output/dt01s-baseline-<run>` at051aad1, --no-hardlinks, existing physical pinned node_modules/tool copies, no junction/install/fetch. Confirm local published fb15f967 object and absent destinations; resolve every candidate/profile/output target inside the new clone, not original checkout or prior C folders.

- [ ] **4. Run actual foundation/full tests/tools in the candidate clone.**

  ```powershell
  node scripts/check-toolchain.mjs
  node scripts/check-runtime-inventory.mjs
  node node_modules/typescript/bin/tsc -p tsconfig.settings-fixture.json
  node node_modules/typescript/bin/tsc -p tsconfig.json
  node node_modules/typescript/bin/tsc -p tsconfig.development.json
  node scripts/settings-runtime.mjs
  node scripts/main-runtime.mjs
  node scripts/check-build-proof.mjs
  node node_modules/typescript/bin/tsc -p tsconfig.audio-tools.json
  node --test --test-concurrency=4 tests/*.test.cjs
  node scripts/tool-audit.mjs --only=eslint
  node scripts/tool-audit.mjs --only=gitleaks
  ```

  Expected nine gates0, full failures0 with only existing missing-private-P02 skip1, no new skip or modified frozen assertion. Report existing ESLint7 IDs/severity unchanged, Gitleaks actual observations and available npm evidence separately; tool failure is unverified, not clean. No npm registry transmission is necessary for unchanged dependencies; if a new audit is needed, follow its existing explicit authorization gate, not a fabricated fresh clean result. Tests/config remain outside the old static inventory; no exclusions broadened or scanner coverage claimed for the typed fake.

- [ ] **5. Run silent candidate/installed regressions only inside that clone.**

  ```powershell
  node scripts/verify-candidate.mjs dt01sCandidate
  node scripts/check-audio-quality.mjs --root <actual-reported-candidate-dist> --label dt01s-candidate
  node scripts/check-installed-extension.mjs --run-id=dt01sInstalled
  node scripts/check-installed-extension-negative.mjs --run-id=dt01sNegative
  ```

  Fresh alphanumeric IDs/no --chrome or --headed. Candidate58/package20, synthetic14/18/12 with failures[], sources1, calibration RMS0.34–0.36 and all measured full-scale excess0. Positive/negative functional PASS must be separate from runner lifecycle/cleanup limitations; negative main-runtime-missing is not retention proof. Existing runner can delete disposable profile/candidate after close failure. Preserve clone/reports and stop additional cleanup/phases on abnormal termination; describe anything already deleted by the runner honestly. Root dist/ZIP/user profiles unchanged.

- [ ] **6. Measure cost and record assertion/source evidence.** Cold1/warm5 in matched baseline/candidate environments, no parallel heavy workload: compare the old eight-gate versus new nine-gate workflow and unchanged development/audio/product checks, recording elapsed/check time/memory where provided. Time the candidate's additional S checker separately with extendedDiagnostics. There was no baseline S checker: do not compare a failed91-diagnostic prototype to final strict0 or claim faster typing across unequal graphs. Label first invocation, not a promise of purged OS cache. Record actual13 graph, source/tree SHAs, four proof-call results/25 internal targets/18 public targets and localized annotation/ABI assumptions.

- [ ] **7. One fresh Astra max final review and local evidence closeout.** Whole local branch/spec/plan, read-only, no child reviewers. Confirm findings against original code/evidence; fix valid Critical/Important scope defects with targeted RED/GREEN, preserve unapproved callback-policy changes as separate decisions. Commit actual evidence/checklists only when verified; repeat protection after any authorized own-output cleanup. No public CI/merge or security certification claim.

- [ ] **8. Hand off remaining maintenance.** DT01-S local completion requires whole-body checking, independent oracles/controls and final review, not just exit0. DT02 remains accepted deferral; NUM01/maintenance-closeout/AF05-B and existing B2 execution gates remain distinct. Stop at any new authority/user action requirement; do not silently implement or declare backlog complete.

## Plan self-review and execution handoff

- [x] Author coverage: spec1–5 map to Task1 interfaces/steps1–8; spec6–7 to Task2. All five Review Focus items have named tests; callback exception/clone/slot/native-src differences are explicit.
- [x] Proportion/interfaces: two sequential deliverables, local types/assertions/commands rather than copied implementation; exact13 graph, eighteen public goals, five strong plus twenty weakened internal goals, four proof calls plus metadata inventory. No new library/helper module/loader or PR fragmentation.
- [x] Fresh Astra max adversarial plan review: Critical0 / Important1 / Minor1, with fixes. [Record](../validation/2026-10-13-dt01s-plan-review.md). Author verified/amended shallow-CI history dependency and explicit disposal order. This is not a post-amendment independent zero-finding verdict or implementation PASS.
- [ ] User approval of completed plan and execution method, isolated clone/candidate/installed checks and known disposable-profile cleanup limitation. Design approval is not execution approval.

Recommendation: **Native**, because both tasks share one fixture/consumer boundary and the established proof/validation path. Two local checkpoints and one final Astra max review suffice; no implementation subagents or per-task PRs. Await completed-plan review and execution selection before code/test/config/browser work.

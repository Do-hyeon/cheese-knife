# F00 isolated popup CDP qualification

> Native: root implements; Astra max reviews this bounded plan before execution. This is a Task5 support qualification, not a second per-task product review.

**Goal:** Observe and control the real toolbar popup in the already approved disposable bundled Chromium fixture profile when Playwright does not expose it as a Page.

**Architecture:** Reuse the existing Playwright browser connection and its public newBrowserCDPSession API. Select exactly one real popup target by extension URL plus browserContextId, attach with the public CDP Target API, and run bounded Runtime evaluations against that target only. No remote debugging port, new dependency, replacement of tabs.query, or storage writes.

**Spec:** Existing F00 Task5 actual-popup STOP gate; user approval of the isolated CDP alternative. Original failed qualification evidence remains unchanged.

## Boundaries and failure behavior

- Only a newly created F00 profile and candidate built from the approved local source; never viewing Chrome, P09, global MCP settings or extension permissions.
- Keep fixture page routing and existing developer-mode preparation. Select by exact own extension popup URL and the broadcast Page's nonempty browserContextId obtained from that Page's own CDP session. Refuse zero/multiple targets, mismatched contexts, unrelated targets or unsupported Target/Runtime APIs. Confirm own top-frame POPUP sender facts before input.
- Use Target.attachToTarget with flatten:false and Target.sendMessageToTarget only if supported. One bounded callback map, numeric command ids and matching session id for Target.receivedMessageFromTarget; no browser-wide auto-attach, private Playwright internals or unbounded evaluation.
- Discovery6seconds, session acquisition/outer send/command/evaluation/worker probe/detach8seconds, graceful-close20seconds. Register a pending callback before sending. Closed/detached target rejects pending commands and clears timers/listeners. Failure stays failure, never a Page/status/storage mock fallback.
- Qualification probes only sender fact booleans/frame/context type, an existing control's rendered value and accessibility, and actual active tab id equality to the synthetic broadcast. Do not store document/channel identifiers, labels, cookies or chat in output.
- Exercise real input by DOM focus/input/change on an own popup control only in the disposable profile. First require a visible, enabled, labelled control and successful focus; independently observe changed and restored committed values through the worker. No direct storage write. A qualification without actual UI actionability and storage proof is insufficient for Task5.
- Playwright routing does not cover the raw other-type popup. After target attachment, enable target-specific Fetch blocking/Network observation for external requests; local extension assets remain permitted. Initial navigation before attachment is not covered: do not claim whole-popup egress isolation from zero routed requests. Unexpected external request fails the probe; no added remote payload.
- Remove temporary worker listener and detach the popup CDP session. Before residual context.close cleanup, require bounded public Browser.close acknowledgement, observed browser disconnection and exact profile-owned root process0. Record these affirmative facts separately from contextCloseResolved: Playwright can silently kill on graceful-close failure. Missing acknowledgement remains failed qualification even if cleanup later removes the process. Preserve primary and cleanup errors separately; no broad process kills or recursive profile deletion.

## Steps

- [x] Astra max read-only plan review: Critical0/Important1/Minor2. Static support is feasible, not actual-popup PASS. Important normal-close evidence and both minor boundary/actionability points are incorporated above; runtime proof remains required.
- [ ] RED: pure target selector rejects foreign URL/context, duplicates and missing target. Command routing rejects wrong session, handles target close, timeout and protocol error; deterministic fake event transport at this boundary only.
- [ ] Implement the small qualification support in the existing extension-e2e harness area, with the selected public APIs. Do not create a generic browser transport library. Unit tests and strict development types pass before actual browser use.
- [ ] Execute a fresh occurrence: original Page capture observation remains false if absent; separate CDP capture flag, actual POPUP sender facts, current synthetic tab equality, control initial→changed→restored durable values, normal close and owned process0 must all be true. Unsupported attach/evaluation fails explicitly and stops the installed-popup gate.
- [ ] Record result/provenance and Task5 adapter interface in the main F00 plan only after actual success. No installed preservation PASS, public update/rollback PASS or F00 completion claim from this probe.

## Review focus

Identity collision across same extension URL contexts; popup closure while commands are pending; input event that does not reach the real settings client; fixture network leakage; cleanup errors masking primary failure. Tests/real probe must distinguish each from success.

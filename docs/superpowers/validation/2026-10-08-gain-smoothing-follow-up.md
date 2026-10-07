# Gain smoothing follow-up and preview diagnosis

User authorized continued work while away, then preview diagnosis and a Korean contribution PR only after verification. Explicit stop condition: if extension refresh cannot be performed autonomously, stop at the required stage. Base: `2b7a67e`.

## Bounded design and implementation

Continue the previously recommended Gain smoothing within `web/audio.js`. Preserve Gain range, immediately reflected/stored UI target, compressor parameters and dry/wet behavior. Initialize a new disconnected wet graph directly; later Gain changes linearly reach their target in 10ms. Retarget an active transition at its analytically interpolated current value, not its old target. Unchanged values on configuration/re-enable do not restart the ramp. No delay compensation or limiter was added; those require separate design and acceptance.

Three production-module regressions failed against the base (missing scheduling), then passed after implementation. One strict timestamp assertion required a floating-point tolerance (2.005+0.01); that test failure was arithmetic comparison, not a production change. Native output was also measured in the silent synthetic harness, not merely inferred from test doubles.

After smoothing, all 12 Gain transitions at 250/750/1000Hz had maximum adjacent-sample steps equal to the maximum of their settled endpoints in that run. Representative 250Hz 100→150%: 0.018248 instead of prior 0.186250; 1kHz 200→0%: 0.096639 instead of prior 0.535117. Phase/timing vary between runs. Default steady output, THD and the 14 ordinary cases' zero >1 samples were unchanged within displayed precision. The toggle dip and custom-profile headroom risk remain; this change does not claim to fix them or guarantee subjective click-free sound.

Reproduce: `node scripts/check-audio-quality.mjs --chrome` and compare Gain transition maximum adjacent-sample steps with their pre/post settled endpoints in the generated report. This is a regression probe for these signals, not universal audio quality certification.

## Preview investigation, not a declared fix

Read the installed homepage DOM: configuration ready, valid 32-character channel links in `#sidebar`, native homepage thumbnail video present. The user's wide live layout had no sidebar links, which alone is not a preview bug. Existing hidden panel / stale stream-loading status on that live page is not sufficient evidence of the failure cause.

In a fresh system Chrome 155.0.8059.39 profile on the public homepage, loaded the actual manifest MAIN modules and default normalized configuration, added production CSS, and hovered the first real sidebar link (not a fabricated anchor or a direct `preview.show` call). At 7 seconds, preview/livePreview ready, panel visible, media readyState4, time5.926324, decodedFrames294. This shows actual hover/API/stream playback for that public case, but does not load the extension or establish the user's failed case. No login or age/security gate was bypassed. No speculative preview fix was made.

## Required pause before installed acceptance / PR

User-browser diagnostics subsequently returned browser unavailable. Native app automation is disabled; no supported interface is available for the local extension's refresh button. A normal page reload does not refresh the extension. Do not use filesystem edits, settings/security changes, synthetic extension API calls or a new browser profile as substitutes for the required installed-extension refresh.

Prepared candidate: full suite64/64 passed, dist build succeeded. Prepare and preserve the candidate, then STOP before installed acceptance. User must refresh the local extension at `chrome://extensions`; afterwards resume actual live Gain acceptance and reproduce the particular preview failure (sidebar tooltip versus main thumbnail, settings, network/playback state). Do not open a contribution PR yet: the user's all-verifications condition is unmet. Preserve the branch and upstream/main; no store deployment.

Focused read-only review found no Critical/Important issue and reran audio tests10/10. One Minor remains for resumption: if native source creation throws after initializing Gain, a retry creates a new gain node but retains entry-scoped transition tracking; an unchanged target may then skip initialization and leave the new node at unity. Add a failure/retry regression and associate/reset transition tracking for new nodes before PR readiness. Product work was stopped at the user-mandated refresh boundary rather than silently treating this edge or installed acceptance as complete.

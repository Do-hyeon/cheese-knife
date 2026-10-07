# CHZZK compatibility validation — 2026-10-08

Baseline: v2.13.1 (`5ccb2bf`). Implementation: codex/chzzk-compatibility-recovery.

PASS means the named check ran; it does not imply other features are verified.

| Check | Environment | Result | Evidence / limit |
| --- | --- | --- | --- |
| Settings partial/malformed objects and finite ranges | Node 24.19.0 | PASS | tests/config.test.cjs: 4 tests |
| Portable package/vendor inclusion and missing reference rejection | Node 24.19.0, Windows | PASS | tests/package.test.cjs: 3 tests; source check and dist build succeed |
| Actual MAIN framework availability | Playwright Headless Shell 151.0.7922.34, fresh unauthenticated public CHZZK live page | PASS | Known webpack chunk absent; Vue absent; React on player/chat present; core player, chat filter and blind listener accessible |
| Public preview API and HLS playlist | Same page | PASS | live-detail HTTP/code 200; HLS and LLHLS paths present; master HLS playlist HTTP 200 / #EXTM3U |
| Actual playing live audio/video | Same page | UNVERIFIED | Probe saw readyState=0 and no buffered ranges; API accessibility is not playback proof |
| Installed user Chrome extension / authenticated streams | User's Chrome | UNVERIFIED | Not changed/installed by this work |
| Firefox | Not run | UNVERIFIED | No compatibility claim |

The full Chrome-for-Testing executable returned `spawn UNKNOWN` in this environment. The signed Playwright Headless Shell launched successfully and was used for read-only D0 inspection. No security settings or user profile were altered.

Dependencies: npm install reported 16 advisories in development dependencies inherited from publishing/test tooling. `npm audit --omit=dev` returned 0. These tools are not copied into the extension package; no automatic major-version audit fix was applied. Vendored runtime libraries require their own audit/provenance check.

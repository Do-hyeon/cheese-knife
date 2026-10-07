# CHZZK compatibility validation — 2026-10-08

Baseline: v2.13.1 (`5ccb2bf`). Implementation: codex/chzzk-compatibility-recovery.

PASS means the named check ran; it does not imply other features are verified.

| Check | Environment | Result | Evidence / limit |
| --- | --- | --- | --- |
| Settings partial/malformed objects and finite ranges | Node 24.19.0 | PASS | tests/config.test.cjs: 4 tests |
| Full production-module regression suite | Node 24.19.0 / jsdom, Windows | PASS | `node --test tests/*.test.cjs`: 47 passed, 0 failed; 14 review regressions first demonstrated RED |
| Portable package/vendor inclusion and missing reference rejection | Node 24.19.0, Windows | PASS | tests/package.test.cjs: 3 tests; source check and dist build succeed |
| Actual MAIN framework availability | Playwright Headless Shell 151.0.7922.34, fresh unauthenticated public CHZZK live page | PASS | Known webpack chunk absent; Vue absent; React on player/chat present; core player, chat filter and blind listener accessible |
| Public preview API and HLS playlist | Same page | PASS | live-detail HTTP/code 200; HLS and LLHLS paths present; master HLS playlist HTTP 200 / #EXTM3U |
| Actual playing live audio/video | Same page | UNVERIFIED | Probe saw readyState=0 and no buffered ranges; API accessibility is not playback proof |
| Controlled actual Web Audio output | Headless Shell 151.0.7922.34, synthetic same-origin WAV blob | PASS | Source 1; context running; compressor on RMS 0.2423407 / bypass RMS 0.3441080; page errors 0. Not authenticated/live listening proof |
| Independent public native-HLS preview video | Separate system Chrome 155.0.8059.39, fresh public CHZZK page | PASS | 2s sample: time 0→1.898459; decoded frames 0→60; readyState 4. Native page refused high-quality playback in headless mode; no primary player/control claim |
| Independent public HLS.js/MSE preview | Same browser/page, `--hls-js` suppresses only native HLS support response | PASS | 480p AVC/AAC; time 0.511785→2.486229; frames 4→64. This selects the actual fallback, not a Chrome 121 compatibility test |
| Preview hide cleanup | Both public preview runs | PASS | Media removed and panel hidden. After 500ms settling, next 2s: 0 additional m3u8/ts/m4s requests. Does not prove all network types or 30s stability |
| Independent branch review | Immutable original→346ce95 | PASS (performed) | 6 Important and 3 Minor findings; [fix record](../reviews/2026-10-08-implementation-review.md). Not an approval of all features or a second review of the fixed commit |
| Installed user Chrome extension / authenticated streams | User's Chrome | UNVERIFIED | Not changed/installed by this work |
| Firefox | Not run | UNVERIFIED | No compatibility claim |

The full Chrome-for-Testing executable returned `spawn UNKNOWN` in this environment. Headless Shell launched for D0/controlled audio. System Chrome subsequently launched with a separate temporary profile. CHZZK showed “이 브라우저는 고화질 라이브를 감상할 수 없습니다” and no native player on that headless page; independent public previews still decoded frames through native HLS and HLS.js. No notice, authentication, age gate or security setting was bypassed. No user profile was altered.

Browser probes evaluate the real manifest MAIN scripts through DevTools and send the config message themselves. They do **not** load the installed extension, verify the real extension API/ISOLATED bridge, or prove its CSP bootstrap. jsdom bridge tests separately exercise both script orders at a substituted postMessage boundary.

Reproduce: `node scripts/smoke-browser.mjs` (controlled audio); `node scripts/smoke-browser.mjs --public --chrome` (public native HLS); add `--hls-js` for MSE fallback. Public content and runtime vary; no token, playback URL or chat transcript is stored in this record.

## Installed-Chrome acceptance still required

Load `dist` or source using the README instructions. Temporarily disable the original extension without deleting its settings. Verify live/VOD buttons, one 5-second seek per key press, text-input arrows, held/cancelled 2x speed, compressor on/off/gain and audible output, SPA switching, native miniplayer/PIP/fullscreen, preview hover/unmute/hide, and enabled style/chat options. Repeat with source and dist. Record PASS/FAIL separately; remaining limited original features prevent a full-restoration declaration.

Dependencies: npm install reported 16 advisories in development dependencies inherited from publishing/test tooling. `npm audit --omit=dev` returned 0. These tools are not copied into the extension package; no automatic major-version audit fix was applied. Vendored runtime libraries require their own audit/provenance check.

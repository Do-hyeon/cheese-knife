# ![Logo](./icon48.png) Cheese Knife

> CHZZK Toolkit

## Compatibility recovery preview

Branch `codex/chzzk-compatibility-recovery` contains a 2.13.2 recovery preview based on upstream v2.13.1. It adds Vue-free controls/compression, cancelable HLS previews, scoped page lifecycles, and per-tab feature readiness. It is not the upstream store release.

101 automated tests, controlled real audio output and separate-browser public preview frame progression passed. See the [independent implementation review](docs/superpowers/reviews/2026-10-08-implementation-review.md), [installed-Chrome VOD hold fix review](docs/superpowers/reviews/2026-10-08-vod-hold-review.md), and [whole-branch review and follow-up](docs/superpowers/reviews/2026-10-08-whole-branch-review.md). Scoped installed-Chrome checks passed; full acceptance and release approval remain pending.

The Gain slider is now 48px with an 8px end gap, checked in installed Chrome. [Synthetic audio-quality diagnostics](docs/superpowers/validation/2026-10-08-audio-quality-and-gain-spacing.md) document defaults and transition improvement candidates, not a subjective sound-quality guarantee. DSP is unchanged. Reproduce with `node scripts/check-audio-quality.mjs --chrome`; a fresh profile captures synthetic floating output while sending zeros to speakers, without recording broadcasts.

The [follow-up Gain smoothing and preview-delay fix](docs/superpowers/validation/2026-10-08-gain-smoothing-follow-up.md) ramps updates over 10ms and overlaps loading with the hover delay. The user confirmed preview works normally. After the [full-feature audit](docs/superpowers/validation/2026-10-08-full-feature-audit.md), the left-chat live player collapse was fixed and installed live/VOD layout and chat resizing were checked. The latest review fixes settings races, preview cancellation, popup dragging and feature status updates; installed acceptance requires another extension refresh. [Full-feature acceptance](docs/superpowers/plans/2026-10-08-full-feature-acceptance.md) is incomplete and no contribution PR has been opened.

Check out this branch, load the repository root or built `dist` at `chrome://extensions`, temporarily disable the old Cheese Knife extension to avoid duplicate injection, and reload CHZZK tabs. A local extension with a different ID does not automatically share store-extension settings. Do not delete the old extension or its settings.

Deleted-message display remains limited. Native-button sidebar refresh/expansion candidates await installed acceptance. Stats show resolution/measured FPS; unverified bitrate/latency are unknown. Compression requires an eligible same-origin blob source and may require a user gesture. Age-restricted previews are not played. Full installed-Chrome/Firefox verification is pending. See [validation](docs/superpowers/validation/2026-10-08-chzzk-compatibility.md), [design](docs/superpowers/specs/2026-10-08-chzzk-compatibility-design.md), and [third-party notices](THIRD_PARTY_NOTICES.md).

Develop with Node 24: `npm ci`, `npm test`, `npm run check`, `npm run build`. The package excludes dependencies, tests and backup files.

Run explicit native CSS checks with `node scripts/check-styles.mjs --chrome`; these do not add a browser requirement to the Node test suite. [Installed preview timing and style audit](docs/superpowers/validation/2026-10-08-preview-timing-and-style-audit.md) records the configured one-second wait, temporary 100ms comparison, four scoped style candidates and remaining acceptance.

The [toolbar layout follow-up](docs/superpowers/validation/2026-10-08-installed-follow-up-and-toolbar-design.md) records 33 native CSS cases and 7 actual viewport/sidebar combinations. Top navigation uses the toolbar at 1800px or wider with search separated from menus; narrower views retain the native sidebar. Auto-hide now handles the current sticky header and keyboard focus. Installed-Chrome checks passed for both enabled options, focus recovery and five viewports; full style acceptance remains incomplete.

Run synthetic video filter diagnostics with `node scripts/check-video-filters.mjs --chrome`. Eleven cases check pixels from actual CSS-filtered video, filter composition and reset, but do not guarantee the user's GPU behavior or sharpening edge quality. Results and remaining acceptance are recorded in the [whole-branch review](docs/superpowers/reviews/2026-10-08-whole-branch-review.md).

The [home recommendation hiding candidate](docs/superpowers/validation/2026-10-08-home-recommendation-recovery.md) hides only the ordinary home recommendation grid, preserving editorial promotions, following and recent VODs. Route ownership cleans up its home marker. Node 101 cases and native CSS 36 cases passed; stored-option and real route acceptance of the new dist requires an extension refresh.

[Website](https://www.chz.app/) | [Discord](https://discord.gg/9kq3UNKAkz) | [Chrome Web Store (compatible with Chromium, Edge, Whale)](https://chromewebstore.google.com/detail/nfkfgkkhgglkgnlppncolmpekidapkjh) | [Firefox Add-ons](https://addons.mozilla.org/addon/cheese-knife/) | [Korean](./README-en.md)

![Screenshot](./images/en.png)

## Features

### Explore

- **Live Preview:** Preview live by hovering over the channel.
- **Refresh Sidebar:** Refresh the sidebar every 30 seconds.
- **Popup Player:** View multiple lives in one window.

### Player

- **Stats Menu:** Select Stats from the right-click menu to view resolution, bitrate, FPS, latency, and codec.
- **Seek with Arrow Keys:** Use the arrow keys to rewind a short amount of time.
- **Video Filters:** Adjust video brightness, contrast, and gamma, and apply a sharpen filter.
- **Audio Compressor:** Reduce loud sounds to adjust the dynamic range to make the sound more comfortable.

### Chat

- **Hide Donation Messages:** Hide Cheese messages in the chat.
- Adjust chat panel and font size

It also adds many other useful features and allows to customize styles.

> This extension is not affiliated with CHZZK, and related trademarks are the property of their respective owners. This extension is provided "as-is" without any warranties, and the developer assumes no responsibility for any issues, damages, or data loss resulting from its use.

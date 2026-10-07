# ![Logo](./icon48.png) Cheese Knife

> CHZZK Toolkit

## Compatibility recovery preview

Branch `codex/chzzk-compatibility-recovery` contains a 2.13.2 recovery preview based on upstream v2.13.1. It adds Vue-free controls/compression, cancelable HLS previews, scoped page lifecycles, and per-tab feature readiness. It is not the upstream store release.

70 automated tests, controlled real audio output and separate-browser public preview frame progression passed. See the [independent implementation review](docs/superpowers/reviews/2026-10-08-implementation-review.md) and [installed-Chrome VOD hold fix review](docs/superpowers/reviews/2026-10-08-vod-hold-review.md). Scoped installed-Chrome checks passed; full acceptance and release approval remain pending.

The Gain slider is now 48px with an 8px end gap, checked in installed Chrome. [Synthetic audio-quality diagnostics](docs/superpowers/validation/2026-10-08-audio-quality-and-gain-spacing.md) document defaults and transition improvement candidates, not a subjective sound-quality guarantee. DSP is unchanged. Reproduce with `node scripts/check-audio-quality.mjs --chrome`; a fresh profile captures synthetic floating output while sending zeros to speakers, without recording broadcasts.

The [follow-up Gain smoothing and preview-delay candidate](docs/superpowers/validation/2026-10-08-gain-smoothing-follow-up.md) ramps updates over 10ms and overlaps metadata/stream loading with the hover delay. Existing installed sidebar preview playback passed; the new timing candidate needs user extension refresh. [Full-feature acceptance](docs/superpowers/plans/2026-10-08-full-feature-acceptance.md) is incomplete and no contribution PR has been opened.

Check out this branch, load the repository root or built `dist` at `chrome://extensions`, temporarily disable the old Cheese Knife extension to avoid duplicate injection, and reload CHZZK tabs. A local extension with a different ID does not automatically share store-extension settings. Do not delete the old extension or its settings.

Deleted-message display and automatic sidebar refresh are currently limited. Stats show resolution/measured FPS; unverified bitrate/latency are unknown. Compression requires an eligible same-origin blob source and may require a user gesture. Age-restricted previews are not played. Full installed-Chrome/Firefox verification is pending. See [validation](docs/superpowers/validation/2026-10-08-chzzk-compatibility.md), [design](docs/superpowers/specs/2026-10-08-chzzk-compatibility-design.md), and [third-party notices](THIRD_PARTY_NOTICES.md).

Develop with Node 24: `npm ci`, `npm test`, `npm run check`, `npm run build`. The package excludes dependencies, tests and backup files.

Run explicit native CSS checks with `node scripts/check-styles.mjs --chrome`; these do not add a browser requirement to the Node test suite. [Installed preview timing and style audit](docs/superpowers/validation/2026-10-08-preview-timing-and-style-audit.md) records the configured one-second wait, temporary 100ms comparison, four scoped style candidates and remaining acceptance.

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

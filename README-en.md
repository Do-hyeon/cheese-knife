# ![Logo](./icon48.png) Cheese Knife — Community Recovery

This is an unofficial community recovery of [Cheese Knife](https://github.com/jebibot/cheese-knife), a toolkit for watching CHZZK. It restores integration points that no longer matched the current CHZZK interface and is maintained for Chrome only. It is not an official successor approved by the original author, and Chrome Web Store distribution is intended to stop if the original author returns.

[Chrome Web Store](https://chromewebstore.google.com/detail/cgfddiiffponlciljlfbiecmlagflbpe) · [GitHub releases](https://github.com/Do-hyeon/cheese-knife/releases) · [Report an issue](https://github.com/Do-hyeon/cheese-knife/issues) · [Privacy Policy](PRIVACY.md) · [한국어](README.md)

![Screenshot](./images/en.png)

## Features

- Sidebar live previews, periodic refresh and automatic expansion of followed channels
- Floating popup players for watching multiple streams
- Arrow-key seeking and press-and-hold 2× playback for VODs
- Available playback information such as resolution, measured FPS and codec
- Brightness, contrast, saturation, gamma and sharpening video filters
- Audio compressor and Gain controls
- Donation-message hiding and chat timestamp, width, font and left-side layout controls
- Style options for recommendations, rankings, mission/party panels and other page elements

Use the extension toolbar icon to enable or disable features. Open Style Settings from the CHZZK tab where the styles should be applied.

## Installation

Most users should install the extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/cgfddiiffponlciljlfbiecmlagflbpe). The latest GitHub release and the reviewed store version may differ while a store review is in progress.

To test local changes, use Node.js 24.15.0 or newer in the Node 24 line:

```powershell
npm ci --ignore-scripts
npm test
npm run build
npm run check
```

To optionally exercise the installed artifact's settings, multi-window and lifecycle paths in bundled Chromium, run the following gates. External CHZZK requests are replaced by closed fixtures and temporary profiles are removed afterward.

```powershell
npm run test:e2e
npm run test:e2e:negative
```

Enable Developer mode at `chrome://extensions`, load the generated `dist` directory as an unpacked extension, and reload open CHZZK tabs. Do not enable the original extension and this recovery at the same time. Settings are not assumed to transfer or synchronize between different extension IDs.

## Known limitations

- Google Chrome 121 or newer is supported. Firefox builds, signing and distribution are outside the recovery scope.
- Live arrow-key seeking requires time-machine/DVR access for the stream and account.
- The extension does not bypass age restrictions, authentication, viewing entitlements or DRM. A preview stays thumbnail-only or limited when the preview API does not provide a playable HLS URL.
- Deleted-chat display is limited to new ordinary messages in supported live connections. It does not restore earlier hidden messages, Cleanbot messages or VOD deletion history.
- Audio, previews and video filters depend on browser autoplay policy, media format, GPU and network conditions.
- Correct operation is not guaranteed for every stream, advertisement, layout mode and setting combination. Report reproducible problems through [Issues](https://github.com/Do-hyeon/cheese-knife/issues).

## Privacy and security

The extension may process settings and CHZZK page, API and media data inside the browser to provide its features. User data is not sent to a maintainer-operated server, but local processing still counts as data handling. See the [Privacy Policy](PRIVACY.md) for storage, connections, retention and deletion details.

Security checks cover specific tools and scopes and are not proof that the product has no vulnerabilities.

## Development direction

The installed MV3 E2E foundation is in place. Explicit module boundaries and an incremental TypeScript transition are next, while the feature roadmap resumes on top of that safety net.

[Execution plan](PLANS.md) (Korean) · [AF00 validation record](docs/superpowers/validation/2026-10-11-af00-installed-extension-e2e.md) (Korean) · [Third-party notices](THIRD_PARTY_NOTICES.md)

Before proposing a change, open an [Issue](https://github.com/Do-hyeon/cheese-knife/issues) with its scope and reproduction steps.

## Upstream and license

This repository is based on [jebibot/cheese-knife](https://github.com/jebibot/cheese-knife) and retains its copyright and MIT license. Bundled HLS.js and other third-party components are covered by [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

This extension is not affiliated with CHZZK. CHZZK and related trademarks are property of NAVER Corporation. The software is provided without warranty.

# Third-party notices

Cheese Knife is based on [jebibot/cheese-knife](https://github.com/jebibot/cheese-knife), MIT, Copyright (c) 2023- jebibot. The original [LICENSE](LICENSE) is retained. Compatibility work consulted [scweeny commit 4930117](https://github.com/scweeny/cheese-knife/commit/493011729f9e49486254c34c1f6395b9626893ee) and [upstream PR #70](https://github.com/jebibot/cheese-knife/pull/70); their commits were not imported wholesale.

## HLS.js

- Upstream: [video-dev/hls.js](https://github.com/video-dev/hls.js)
- Package/version: `hls.js@1.6.16` from the official npm distribution, pinned by package-lock.json.
- Original file: `dist/hls.light.min.js`.
- Original SHA-256: `947b45be1392e39569d4aefc2cff9ff6ecbe6cc246cf67ab12ece0c41c24b793`.
- Included file: `vendor/hls.light.private.js`.
- Changes: capture the UMD CommonJS export in a local closure, register it on the Cheese Knife runtime, remove the source-map comment; apply reproducible local parser bounds from `scripts/hls-hardening.mjs`. The private bundle does not overwrite the website's global Hls. This is a modified upstream implementation, not an unmodified or upstream-certified security release.
- Local hardening: reject invalid/oversized LL-HLS SKIP values before allocation; contain MP4 emsg strings; validate aggregate trun work and record fields in both consumers, and bound optional NAL/SEI extraction to supported NAL codecs and contained sample bytes; contain ID3 tags/frames in the shared parser. Budgets per parser input: 10,000 SKIP placeholders, 100,000 selected-track samples and NAL units, 4,096-byte emsg strings, 1 MiB ID3 tag payload and 4,096 ID3 frames. Optional caption scanning has an aggregate byte budget of at most 16 MiB and four times the actual input extent. Unsupported or over-budget optional metadata is dropped without aborting pass-through media; invalid required run records are rejected rather than truncated.
- The vendoring command verifies the exact original distribution hash and each transform anchor. Both original and hardened hashes are retained in the bundle header; the original license remains unchanged.
- License: Apache-2.0; full original license at [vendor/hls.js.LICENSE](vendor/hls.js.LICENSE), including its copyright notices.
- Reproduce vendoring after dependency installation: `node scripts/vendor-hls.mjs`.

The extension contains this library locally. No executable script is fetched from a CDN at runtime.

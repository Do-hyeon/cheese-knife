// Generated from src/settings/config.ts by scripts/settings-runtime.mjs. Do not edit.
var KnifeHostPolicy = Object.freeze({
  origins: Object.freeze(["https://chzzk.naver.com/*"])
});
var CONFIGS = [
  {
    id: "preview",
    configs: [
      {
        id: "preview",
        defaultValue: true
      },
      {
        id: "livePreview",
        defaultValue: true
      },
      {
        id: "previewStartUnmuted",
        defaultValue: false
      },
      {
        id: "previewWidth",
        type: "range",
        min: 300,
        max: 1e3,
        step: 50,
        unit: "px",
        defaultValue: 400
      },
      {
        id: "previewDelay",
        type: "range",
        min: 0.1,
        max: 3,
        step: 0.1,
        digits: 1,
        unit: "s",
        defaultValue: 1
      },
      {
        id: "previewVolume",
        type: "range",
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        defaultValue: 5
      },
      {
        id: "rightClickToUnmute",
        defaultValue: true
      }
    ]
  },
  {
    id: "explore",
    configs: [
      {
        id: "updateSidebar",
        defaultValue: true
      },
      {
        id: "expandFollowings",
        defaultValue: false
      },
      {
        id: "popupPlayer",
        defaultValue: true
      }
    ]
  },
  {
    id: "player",
    configs: [
      {
        id: "arrowSeek",
        defaultValue: true
      },
      {
        id: "pressToFastForward",
        defaultValue: true
      },
      {
        id: "videoFilter",
        type: "details",
        configs: [...KnifeMediaProfiles.videoFields]
      },
      {
        id: "compressor",
        type: "details",
        configs: [...KnifeMediaProfiles.audioFields]
      }
    ]
  },
  {
    id: "chat",
    configs: [
      {
        id: "hideDonation",
        defaultValue: false
      },
      {
        id: "showDeleted",
        defaultValue: false
      }
    ]
  }
];
const DEFAULT_CONFIGS = {};
for (const { configs } of CONFIGS) {
  for (const c of configs) {
    if (c.type === "details") {
      for (const cc of c.configs) {
        DEFAULT_CONFIGS[cc.id] = cc.defaultValue;
      }
    } else {
      DEFAULT_CONFIGS[c.id] = c.defaultValue;
    }
  }
}
function normalizeConfig(value) {
  const result = { ...DEFAULT_CONFIGS };
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return result;
  }
  for (const category of CONFIGS) {
    for (const item of category.configs) {
      for (const field of item.type === "details" ? item.configs : [item]) {
        const stored = value[field.id];
        if (field.type === "range") {
          if (typeof stored === "number" && Number.isFinite(stored) && stored >= field.min && stored <= field.max) {
            result[field.id] = stored;
          }
        } else if (typeof stored === "boolean") {
          result[field.id] = stored;
        }
      }
    }
  }
  return result;
}
async function getConfig(includeStyleParameters) {
  const stored = await chrome.storage.local.get({
    config: DEFAULT_CONFIGS,
    ...includeStyleParameters ? { styleParameters: {} } : {}
  });
  const result = { config: normalizeConfig(stored.config) };
  if (includeStyleParameters) {
    result.styleParameters = stored.styleParameters != null && typeof stored.styleParameters === "object" && !Array.isArray(stored.styleParameters) ? stored.styleParameters : {};
  }
  return result;
}
async function readScopedConfig(context) {
  const stored = await chrome.storage.local.get(["config", "styles", "styleParameters", "settingsRevision", "mediaProfiles"]);
  const baseConfig = normalizeConfig(stored.config), read = KnifeMediaProfiles.readLegacyStore(stored.mediaProfiles);
  const resolved = KnifeMediaProfiles.resolveLegacyMediaSettings(baseConfig, read, {
    channelId: context.channelId,
    topFrame: window.top === window,
    incognito: chrome.extension?.inIncognitoContext !== false
  });
  const revision = stored.settingsRevision === void 0 ? 0 : stored.settingsRevision;
  const globalRevision = KnifeMediaProfiles.isCounter(revision) && revision < Number.MAX_SAFE_INTEGER ? revision : null;
  return {
    baseConfig,
    effectiveConfig: resolved.effectiveConfig,
    styleParameters: stored.styleParameters && typeof stored.styleParameters === "object" && !Array.isArray(stored.styleParameters) ? stored.styleParameters : {},
    version: { globalRevision, mediaRevision: read.state === "valid" || read.state === "absent" ? read.store.revision : null },
    revisionStatus: globalRevision === null ? "repair-required" : "ready",
    profileState: resolved.profileState,
    audioBindingKey: resolved.audioBindingKey,
    audioKind: resolved.audioKind,
    videoKind: resolved.videoKind
  };
}

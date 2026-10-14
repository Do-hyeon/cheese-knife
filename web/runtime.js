// Generated from src/main/runtime/entry.ts by scripts/main-runtime.mjs. Do not edit.
"use strict";
(() => {
  // src/settings/media-profiles.ts
  var KnifeMediaProfiles2 = (() => {
    const audioFields = Object.freeze([
      { id: "compressorDefault", defaultValue: false },
      { id: "compressorThreshold", type: "range", min: -100, max: 0, step: 1, unit: "dB", defaultValue: -50 },
      { id: "compressorKnee", type: "range", min: 0, max: 40, step: 1, unit: "dB", defaultValue: 40 },
      { id: "compressorRatio", type: "range", min: 1, max: 20, step: 0.5, digits: 1, defaultValue: 12 },
      { id: "compressorAttack", type: "range", min: 0, max: 1, step: 0.01, digits: 2, unit: "s", defaultValue: 0 },
      { id: "compressorRelease", type: "range", min: 0, max: 1, step: 0.01, digits: 2, unit: "s", defaultValue: 0.25 }
    ]);
    const videoFields = Object.freeze([
      { id: "brightness", type: "range", min: 0, max: 3, step: 0.05, digits: 2, defaultValue: 1 },
      { id: "contrast", type: "range", min: 0, max: 3, step: 0.05, digits: 2, defaultValue: 1 },
      { id: "saturation", type: "range", min: 0, max: 3, step: 0.05, digits: 2, defaultValue: 1 },
      { id: "gamma", type: "range", min: 0, max: 3, step: 0.05, digits: 2, defaultValue: 1 },
      { id: "sharpness", type: "range", min: 0, max: 10, step: 0.1, digits: 1, defaultValue: 0 }
    ]);
    const audioFieldsV2 = Object.freeze([
      { id: "audioDefault", defaultValue: false },
      { id: "compressorEnabled", defaultValue: true },
      ...audioFields.filter((field) => field.id !== "compressorDefault"),
      { id: "audioGain", type: "range", min: 0, max: 2, step: 0.05, defaultValue: 1 },
      { id: "gainInherited", defaultValue: true },
      { id: "eqEnabled", defaultValue: false },
      ...[63, 125, 250, 500, 1e3, 2e3, 4e3, 8e3].map((hz) => ({ id: `eq${hz}`, type: "range", min: -6, max: 6, step: 0.1, defaultValue: 0 })),
      { id: "normalizerEnabled", defaultValue: false },
      { id: "normalizerTargetDbfs", type: "range", min: -30, max: -12, step: 1, defaultValue: -20 }
    ]);
    const encoder = new TextEncoder();
    const channelId = (value) => typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
    const presetId = (value) => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
    const counter = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    const creation = (value, revision) => counter(value) && value > 0 && value <= revision;
    const label = (value) => typeof value === "string" && value.length <= 96 && value.trim().length > 0 && Array.from(value).length <= 48 && encoder.encode(value).byteLength <= 192 && !/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ud800-\udfff]/u.test(value);
    const fields = (domain) => domain === "audio" ? audioFields : domain === "video" ? videoFields : null;
    const failure = (code) => ({ ok: false, code });
    const empty = () => ({ schema: 1, revision: 0, channels: [], presets: [] });
    function ownRecord(value, allowed, required = allowed) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const keys = Reflect.ownKeys(value);
      if (keys.length > allowed.length || keys.some((key) => typeof key !== "string" || !allowed.includes(key))) return null;
      const entries = [];
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (typeof key !== "string" || !descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
        entries.push([key, descriptor.value]);
      }
      const record = Object.fromEntries(entries);
      return required.every((key) => Object.hasOwn(record, key)) ? record : null;
    }
    function ownArray(value, max) {
      if (!Array.isArray(value) || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) return null;
      const result = [];
      for (let i = 0; i < value.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
        result.push(descriptor.value);
      }
      return result;
    }
    function scalar(value, field) {
      return field.type === "range" ? typeof value === "number" && Number.isFinite(value) && value >= field.min && value <= field.max : typeof value === "boolean";
    }
    function validateValues(domain, value) {
      const descriptors = fields(domain);
      if (!descriptors) return failure("invalid-domain");
      const values = ownRecord(value, descriptors.map((field) => field.id));
      if (!values || descriptors.some((field) => !scalar(values[field.id], field))) return failure("invalid-values");
      return domain === "audio" ? { ok: true, domain, values } : { ok: true, domain, values };
    }
    function project(domain, config) {
      const descriptors = fields(domain);
      const values = Object.fromEntries(descriptors.map((field) => {
        const value = Object.getOwnPropertyDescriptor(config, field.id)?.value;
        return [field.id, scalar(value, field) ? value : field.defaultValue];
      }));
      const checked = validateValues(domain, values);
      if (!checked.ok) throw new Error("media-descriptor-contract");
      return checked.values;
    }
    function readLegacyStore(raw) {
      if (raw === void 0) return { state: "absent", store: empty() };
      const record = ownRecord(raw, ["schema", "revision", "channels", "presets"]);
      const invalid = () => ({ state: "invalid", code: "invalid-media-store" });
      if (!record) return invalid();
      if (record.schema !== 1) return counter(record.schema) && record.schema > 1 ? { state: "unsupported", code: "unsupported-media-schema" } : invalid();
      if (!counter(record.revision)) return invalid();
      const channelRows = ownArray(record.channels, 128), presetRows = ownArray(record.presets, 64);
      if (!channelRows || !presetRows) return invalid();
      const store = { schema: 1, revision: record.revision, channels: [], presets: [] };
      const channelIds = /* @__PURE__ */ new Set(), presetIds = /* @__PURE__ */ new Set();
      for (const row of channelRows) {
        const item = ownRecord(row, ["channelId", "createdRevision", "revision", "audio", "video"], ["channelId", "createdRevision", "revision"]);
        if (!item || !channelId(item.channelId) || channelIds.has(item.channelId) || !creation(item.createdRevision, store.revision) || !creation(item.revision, store.revision)) return invalid();
        const channel = { channelId: item.channelId, createdRevision: item.createdRevision, revision: item.revision };
        for (const domain of ["audio", "video"]) {
          if (!Object.hasOwn(item, domain)) continue;
          const binding = ownRecord(domain === "audio" ? item.audio : item.video, ["createdRevision", "values"]);
          if (!binding || !creation(binding.createdRevision, store.revision) || binding.createdRevision < channel.createdRevision) return invalid();
          const values = validateValues(domain, binding.values);
          if (!values.ok) return invalid();
          if (values.domain === "audio") channel.audio = { createdRevision: binding.createdRevision, values: values.values };
          else channel.video = { createdRevision: binding.createdRevision, values: values.values };
        }
        if (!channel.audio && !channel.video) return invalid();
        channelIds.add(channel.channelId);
        store.channels.push(channel);
      }
      for (const row of presetRows) {
        const item = ownRecord(row, ["id", "createdRevision", "revision", "domain", "name", "values"]);
        if (!item || !presetId(item.id) || presetIds.has(item.id) || !label(item.name) || !creation(item.createdRevision, store.revision) || !creation(item.revision, store.revision) || item.domain !== "audio" && item.domain !== "video") return invalid();
        const values = validateValues(item.domain, item.values);
        if (!values.ok) return invalid();
        store.presets.push({
          id: item.id,
          createdRevision: item.createdRevision,
          revision: item.revision,
          name: item.name,
          ...{ domain: values.domain, values: values.values }
        });
        presetIds.add(item.id);
      }
      if (encoder.encode("mediaProfiles").byteLength + encoder.encode(JSON.stringify(store)).byteLength > 262144) return invalid();
      return { state: "valid", store };
    }
    function resolveLegacyMediaSettings(base, read, context) {
      const effectiveConfig = { ...base, ...project("audio", base), ...project("video", base) };
      const result = { effectiveConfig, profileState: "global", audioBindingKey: "global", audioKind: "global", videoKind: "global" };
      if (read.state === "invalid" || read.state === "unsupported") {
        result.profileState = "repair-required";
        return result;
      }
      if (!context.topFrame || context.incognito || !channelId(context.channelId)) return result;
      const channel = read.store.channels.find((item) => item.channelId === context.channelId);
      if (channel?.audio) {
        Object.assign(effectiveConfig, channel.audio.values);
        result.audioKind = "channel";
        result.audioBindingKey = `${channel.channelId}:${channel.createdRevision}:${channel.audio.createdRevision}`;
      }
      if (channel?.video) {
        Object.assign(effectiveConfig, channel.video.values);
        result.videoKind = "channel";
      }
      if (channel) result.profileState = "scoped";
      return result;
    }
    function patchValues(domain, values, patch) {
      const descriptors = fields(domain);
      if (!descriptors) return failure("invalid-domain");
      const checked = ownRecord(patch, descriptors.map((field) => field.id), []);
      return checked ? validateValues(domain, { ...values, ...checked }) : failure("invalid-patch");
    }
    const equalValues = (a, b) => Object.keys(a).every((key) => Object.getOwnPropertyDescriptor(a, key)?.value === Object.getOwnPropertyDescriptor(b, key)?.value);
    function mergeMediaOperation(input, request, global) {
      const read = readLegacyStore(input);
      if (read.state !== "valid" && read.state !== "absent") return failure(read.code);
      if (!counter(global.revision)) return failure("invalid-global-revision");
      const store = read.store;
      const nextRevision = store.revision + 1;
      const success = (changed, extra = {}) => {
        if (changed) {
          if (!counter(nextRevision)) return failure("revision-exhausted");
          store.revision = nextRevision;
          store.channels.sort((a, b) => a.channelId.localeCompare(b.channelId));
          store.presets.sort((a, b) => a.id.localeCompare(b.id));
          if (readLegacyStore(store).state !== "valid") return failure("media-limit");
        }
        return { ok: true, changed, nextStore: store, ...extra };
      };
      const bump = (record) => {
        if (!counter(record.revision + 1)) return false;
        record.revision++;
        return true;
      };
      const sourcePreset = (token) => store.presets.find((preset) => preset.id === token.id && preset.createdRevision === token.createdRevision && preset.revision === token.revision);
      if (request.action === "apply-preset-global") {
        const preset = sourcePreset(request.presetToken);
        if (!preset || request.expectedGlobalRevision !== global.revision) return failure("conflict");
        const globalOperations = Object.entries(preset.values).map(([id2, value]) => ({ type: "config", id: id2, value }));
        return success(false, { globalOperations });
      }
      if (request.action === "create-preset") {
        const values2 = validateValues(request.domain, request.values);
        if (!presetId(request.id) || !label(request.name) || !values2.ok) return failure("invalid-preset");
        const existing = store.presets.find((preset2) => preset2.id === request.id);
        if (existing) return existing.createdRevision === request.expectedMediaRevision + 1 && existing.revision === 1 && existing.domain === values2.domain && existing.name === request.name && equalValues(existing.values, values2.values) ? success(false, { presetToken: { id: existing.id, createdRevision: existing.createdRevision, revision: 1 } }) : failure("conflict");
        if (request.expectedMediaRevision !== store.revision) return failure("conflict");
        if (store.presets.length >= 64) return failure("media-limit");
        const preset = {
          id: request.id,
          createdRevision: nextRevision,
          revision: 1,
          name: request.name,
          domain: values2.domain,
          values: values2.values
        };
        store.presets.push(preset);
        return success(true, { presetToken: { id: preset.id, createdRevision: nextRevision, revision: 1 } });
      }
      if (request.action === "edit-preset" || request.action === "delete-preset") {
        const preset = request.action === "delete-preset" ? sourcePreset(request.presetToken) : store.presets.find((item) => item.id === request.id && item.createdRevision === request.createdRevision);
        if (!preset) return failure("conflict");
        if (request.action === "delete-preset") {
          store.presets = store.presets.filter((item) => item !== preset);
          return success(true);
        }
        if (request.name !== void 0 && !label(request.name)) return failure("invalid-name");
        const name = request.name ?? preset.name;
        let values2 = { ok: true, ...{ domain: preset.domain, values: preset.values } };
        if ("values" in request && request.values !== void 0) {
          if (request.expectedPresetRevision !== preset.revision || request.domain !== preset.domain) return failure("conflict");
          values2 = validateValues(preset.domain, request.values);
        } else if ("patch" in request && request.patch !== void 0) {
          if (request.domain !== preset.domain) return failure("conflict");
          values2 = patchValues(preset.domain, preset.values, request.patch);
        }
        if (!values2.ok) return failure(values2.code);
        if (preset.name === name && equalValues(preset.values, values2.values)) return success(false);
        if (!bump(preset)) return failure("revision-exhausted");
        const updated = { ...preset, name, domain: values2.domain, values: values2.values };
        store.presets[store.presets.indexOf(preset)] = updated;
        return success(true, { presetToken: { id: preset.id, createdRevision: preset.createdRevision, revision: updated.revision } });
      }
      const id = request.selection.channelId;
      if (!channelId(id)) return failure("invalid-channel");
      let channel = store.channels.find((item) => item.channelId === id);
      if (request.action === "enable-channel-domain") {
        if (request.expectedGlobalRevision !== global.revision) return failure("conflict");
        const values2 = validateValues(request.domain, project(request.domain, global.config));
        if (!values2.ok) return values2;
        if (request.expectedMediaRevision !== store.revision) {
          const existing = channel?.[request.domain];
          const originalRecord = channel && (request.expectedRecord === null ? channel.createdRevision === request.expectedMediaRevision + 1 && channel.revision === 1 : channel.createdRevision === request.expectedRecord.createdRevision && channel.revision === request.expectedRecord.revision + 1);
          return channel && existing && originalRecord && existing.createdRevision === request.expectedMediaRevision + 1 && equalValues(existing.values, values2.values) ? success(false, { channelToken: { channelId: id, recordCreatedRevision: channel.createdRevision, domainCreatedRevision: existing.createdRevision }, recordRevision: channel.revision }) : failure("conflict");
        }
        if (channel) {
          if (!request.expectedRecord || request.expectedRecord.createdRevision !== channel.createdRevision || request.expectedRecord.revision !== channel.revision) return failure("conflict");
          if (channel[request.domain]) return success(false);
          if (!bump(channel)) return failure("revision-exhausted");
        } else {
          if (request.expectedRecord !== null) return failure("conflict");
          if (store.channels.length >= 128) return failure("media-limit");
          channel = { channelId: id, createdRevision: nextRevision, revision: 1 };
          store.channels.push(channel);
        }
        if (values2.domain === "audio") channel.audio = { createdRevision: nextRevision, values: values2.values };
        else channel.video = { createdRevision: nextRevision, values: values2.values };
        return success(true, { channelToken: { channelId: id, recordCreatedRevision: channel.createdRevision, domainCreatedRevision: nextRevision }, recordRevision: channel.revision });
      }
      if (!channel) return failure("conflict");
      if (request.action === "reset-channel-domain" || request.action === "delete-channel") {
        if (request.recordCreatedRevision !== channel.createdRevision || request.expectedRecordRevision !== channel.revision) return failure("conflict");
        if (request.action === "delete-channel") {
          store.channels = store.channels.filter((item) => item !== channel);
          return success(true);
        }
        if (channel[request.domain]?.createdRevision !== request.domainCreatedRevision) return failure("conflict");
        if (!bump(channel)) return failure("revision-exhausted");
        delete channel[request.domain];
        if (!channel.audio && !channel.video) store.channels = store.channels.filter((item) => item !== channel);
        return success(true);
      }
      const binding = channel[request.domain];
      if (!binding || request.channelToken.channelId !== id || request.channelToken.recordCreatedRevision !== channel.createdRevision || request.channelToken.domainCreatedRevision !== binding.createdRevision) return failure("conflict");
      let values;
      if (request.action === "patch-channel-fields") values = patchValues(request.domain, binding.values, request.patch);
      else {
        if (request.expectedRecordRevision !== channel.revision) return failure("conflict");
        if ("presetToken" in request) {
          const preset = sourcePreset(request.presetToken);
          if (!preset || preset.domain !== request.domain) return failure("conflict");
          values = validateValues(request.domain, preset.values);
        } else values = validateValues(request.domain, request.values);
      }
      if (!values.ok) return values;
      if (equalValues(binding.values, values.values)) return success(false);
      if (!bump(channel)) return failure("revision-exhausted");
      if (values.domain === "audio") channel.audio = { createdRevision: binding.createdRevision, values: values.values };
      else channel.video = { createdRevision: binding.createdRevision, values: values.values };
      return success(true, { channelToken: { channelId: id, recordCreatedRevision: channel.createdRevision, domainCreatedRevision: binding.createdRevision }, recordRevision: channel.revision });
    }
    function validateAudioV2(raw) {
      const values = ownRecord(raw, audioFieldsV2.map((field) => field.id));
      if (!values || audioFieldsV2.some((field) => !scalar(values[field.id], field))) return failure("invalid-values");
      return { ok: true, values };
    }
    function projectAudioV2(legacy) {
      const checked = validateValues("audio", legacy);
      if (!checked.ok || checked.domain !== "audio") throw new Error("invalid-legacy-audio");
      const values = Object.fromEntries(audioFieldsV2.map((field) => [
        field.id,
        field.id === "audioDefault" ? checked.values.compressorDefault : Object.getOwnPropertyDescriptor(checked.values, field.id)?.value ?? field.defaultValue
      ]));
      const result = validateAudioV2(values);
      if (!result.ok) throw new Error("media-descriptor-contract");
      return result.values;
    }
    function projectGlobalAudio(config) {
      const values = Object.fromEntries(audioFieldsV2.map((field) => {
        const raw = Object.getOwnPropertyDescriptor(config, field.id === "audioDefault" ? "compressorDefault" : field.id)?.value;
        return [field.id, scalar(raw, field) ? raw : field.defaultValue];
      }));
      const checked = validateAudioV2(values);
      if (!checked.ok) throw new Error("media-descriptor-contract");
      return checked.values;
    }
    function readStore(raw) {
      if (raw === void 0) return { state: "absent", store: { schema: 2, revision: 0, channels: [], presets: [] } };
      const record = ownRecord(raw, ["schema", "revision", "channels", "presets"]);
      const invalid = () => ({ state: "invalid", code: "invalid-media-store" });
      if (!record) return invalid();
      if (record.schema === 1) {
        const legacy = readLegacyStore(raw);
        return legacy.state === "absent" ? invalid() : legacy;
      }
      if (record.schema !== 2) return counter(record.schema) && record.schema > 2 ? { state: "unsupported", code: "unsupported-media-schema" } : invalid();
      if (!counter(record.revision)) return invalid();
      const channels = ownArray(record.channels, 128), presets = ownArray(record.presets, 64);
      if (!channels || !presets) return invalid();
      const store = { schema: 2, revision: record.revision, channels: [], presets: [] };
      const ids = /* @__PURE__ */ new Set();
      for (const row of channels) {
        const item = ownRecord(row, ["channelId", "createdRevision", "revision", "audio", "video"], ["channelId", "createdRevision", "revision"]);
        if (!item || !channelId(item.channelId) || ids.has(item.channelId) || !creation(item.createdRevision, store.revision) || !creation(item.revision, store.revision)) return invalid();
        const channel = { channelId: item.channelId, createdRevision: item.createdRevision, revision: item.revision };
        for (const domain of ["audio", "video"]) {
          if (!Object.hasOwn(item, domain)) continue;
          const binding = ownRecord(domain === "audio" ? item.audio : item.video, ["createdRevision", "values"]);
          if (!binding || !creation(binding.createdRevision, store.revision) || binding.createdRevision < channel.createdRevision) return invalid();
          if (domain === "audio") {
            const checked = validateAudioV2(binding.values);
            if (!checked.ok) return invalid();
            channel.audio = { createdRevision: binding.createdRevision, values: checked.values };
          } else {
            const checked = validateValues("video", binding.values);
            if (!checked.ok || checked.domain !== "video") return invalid();
            channel.video = { createdRevision: binding.createdRevision, values: checked.values };
          }
        }
        if (!channel.audio && !channel.video) return invalid();
        ids.add(channel.channelId);
        store.channels.push(channel);
      }
      ids.clear();
      for (const row of presets) {
        const item = ownRecord(row, ["id", "createdRevision", "revision", "domain", "name", "values"]);
        if (!item || !presetId(item.id) || ids.has(item.id) || !label(item.name) || !creation(item.createdRevision, store.revision) || !creation(item.revision, store.revision)) return invalid();
        const common = { id: item.id, name: item.name, createdRevision: item.createdRevision, revision: item.revision };
        if (item.domain === "audio") {
          const checked = validateAudioV2(item.values);
          if (!checked.ok) return invalid();
          store.presets.push({ ...common, domain: "audio", values: checked.values });
        } else if (item.domain === "video") {
          const checked = validateValues("video", item.values);
          if (!checked.ok || checked.domain !== "video") return invalid();
          store.presets.push({ ...common, domain: "video", values: checked.values });
        } else return invalid();
        ids.add(item.id);
      }
      if (encoder.encode("mediaProfiles").byteLength + encoder.encode(JSON.stringify(store)).byteLength > 262144) return invalid();
      return { state: "valid", store };
    }
    function upgradeMediaStore(raw, expectedRevision) {
      const read = readLegacyStore(raw);
      if (read.state !== "valid" || !counter(expectedRevision) || read.store.revision !== expectedRevision) return failure("conflict");
      if (!counter(read.store.revision + 1) || read.store.channels.some((item) => !counter(item.revision + 1)) || read.store.presets.some((item) => !counter(item.revision + 1))) return failure("revision-exhausted");
      const channels = read.store.channels.map((item) => {
        const { audio, ...rest } = item;
        return {
          ...rest,
          revision: item.revision + 1,
          ...audio ? { audio: { createdRevision: audio.createdRevision, values: projectAudioV2(audio.values) } } : {}
        };
      });
      const presets = read.store.presets.map((item) => ({
        ...item,
        revision: item.revision + 1,
        ...item.domain === "audio" ? { domain: "audio", values: projectAudioV2(item.values) } : { domain: "video", values: item.values }
      }));
      const nextStore = { schema: 2, revision: read.store.revision + 1, channels, presets };
      if (readStore(nextStore).state !== "valid") return failure("media-limit");
      return { ok: true, changed: true, nextStore };
    }
    function copyAudioPreset(preset, destination) {
      const a = validateAudioV2(preset), b = validateAudioV2(destination);
      if (!a.ok || !b.ok) throw new Error("invalid-values");
      return { ...a.values, ...a.values.gainInherited ? { audioGain: b.values.audioGain, gainInherited: b.values.gainInherited } : {} };
    }
    function resolveMediaSettings(base, read, context) {
      const global = projectGlobalAudio(base), effectiveConfig = { ...base, ...global, ...project("video", base) };
      const result = {
        effectiveConfig,
        profileState: "global",
        audioBindingKey: "global",
        audioKind: "global",
        videoKind: "global",
        gainOrigin: global.gainInherited ? "site-legacy" : "global-owned"
      };
      if (read.state === "invalid" || read.state === "unsupported") {
        result.profileState = "repair-required";
        return result;
      }
      if (!context.topFrame || context.incognito || !channelId(context.channelId)) return result;
      const channel = read.store.channels.find((item) => item.channelId === context.channelId);
      if (channel?.audio) {
        const values = read.store.schema === 1 ? projectAudioV2(channel.audio.values) : channel.audio.values;
        Object.assign(effectiveConfig, values);
        if (values.gainInherited) {
          effectiveConfig.audioGain = global.audioGain;
          effectiveConfig.gainInherited = global.gainInherited;
        } else result.gainOrigin = "channel-owned";
        result.audioKind = "channel";
        result.audioBindingKey = `${channel.channelId}:${channel.createdRevision}:${channel.audio.createdRevision}`;
      }
      if (channel?.video) {
        Object.assign(effectiveConfig, channel.video.values);
        result.videoKind = "channel";
      }
      if (channel) result.profileState = "scoped";
      return result;
    }
    return Object.freeze({
      audioFields,
      audioFieldsV2,
      videoFields,
      readStore,
      readLegacyStore,
      validateValues,
      validateAudioV2,
      projectAudioV2,
      projectGlobalAudio,
      upgradeMediaStore,
      copyAudioPreset,
      resolveMediaSettings,
      resolveLegacyMediaSettings,
      mergeMediaOperation,
      isChannelId: channelId,
      isPresetId: presetId,
      isPresetName: label,
      isCounter: counter
    });
  })();
  globalThis.KnifeMediaProfiles = KnifeMediaProfiles2;

  // src/main/runtime/bridge.ts
  function ordinaryRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    try {
      const prototype = Object.getPrototypeOf(value);
      if (prototype === null) return true;
      const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor");
      return Object.getPrototypeOf(prototype) === null && constructor !== void 0 && "value" in constructor && typeof constructor.value === "function" && Object.getOwnPropertyDescriptor(constructor.value, "name")?.value === "Object";
    } catch {
      return false;
    }
  }
  function ownValue(record, key) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && "value" in descriptor ? descriptor.value : void 0;
  }
  function copyRecord(value, stringsOnly) {
    if (!ordinaryRecord(value)) return null;
    const output = {};
    try {
      for (const key of Object.keys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor)) return null;
        if (!stringsOnly || typeof descriptor.value === "string") {
          Object.defineProperty(output, key, { enumerable: true, configurable: true, writable: true, value: descriptor.value });
        }
      }
    } catch {
      return null;
    }
    return output;
  }
  function readScopedConfigEnvelope(event, expected) {
    const exact = (value, keys) => {
      if (!ordinaryRecord(value) || Reflect.ownKeys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) return null;
      return copyRecord(value, false);
    };
    try {
      const data = exact(event.data, [
        "namespace",
        "protocol",
        "type",
        "requestId",
        "context",
        "deliverySequence",
        "baseConfig",
        "effectiveConfig",
        "i18n",
        "version",
        "profileState",
        "revisionStatus",
        "mediaPhase",
        "audioBindingGeneration",
        "audioKind",
        "videoKind"
      ]);
      if (!data || data.namespace !== "cheese-knife" || data.protocol !== 2 || data.type !== "config" || typeof data.requestId !== "string" || !data.requestId.length || data.requestId.length > 128 || !KnifeMediaProfiles.isCounter(data.deliverySequence) || !KnifeMediaProfiles.isCounter(data.audioBindingGeneration)) return null;
      const context = exact(data.context, ["documentGeneration", "routePath", "channelId", "playerGeneration"]);
      if (!context || !KnifeMediaProfiles.isCounter(context.documentGeneration) || context.documentGeneration < 1 || !KnifeMediaProfiles.isCounter(context.playerGeneration) || typeof context.routePath !== "string" || context.routePath.charCodeAt(0) !== 47 || context.routePath.length > 2048 || context.channelId !== null && !KnifeMediaProfiles.isChannelId(context.channelId) || context.documentGeneration !== expected.documentGeneration || context.routePath !== expected.routePath || context.channelId !== expected.channelId || context.playerGeneration !== expected.playerGeneration) return null;
      const baseConfig = copyRecord(data.baseConfig, false), effectiveConfig = copyRecord(data.effectiveConfig, false);
      const scalars = (record) => !!record && Reflect.ownKeys(record).length <= 128 && Object.values(record).every((value) => typeof value === "boolean" || typeof value === "number" && Number.isFinite(value));
      if (!scalars(baseConfig) || !scalars(effectiveConfig)) return null;
      const mediaFields = new Set([...KnifeMediaProfiles.audioFields, ...KnifeMediaProfiles.videoFields].map((field) => field.id));
      for (const config of [baseConfig, effectiveConfig]) for (const domain of ["audio", "video"]) {
        const fields = domain === "audio" ? KnifeMediaProfiles.audioFields : KnifeMediaProfiles.videoFields;
        if (!KnifeMediaProfiles.validateValues(domain, Object.fromEntries(fields.map((field) => [field.id, ownValue(config, field.id)]))).ok) return null;
      }
      if (Object.keys(baseConfig).length !== Object.keys(effectiveConfig).length || !Object.entries(baseConfig).every(([key, value]) => Object.hasOwn(effectiveConfig, key) && (mediaFields.has(key) || Object.is(value, ownValue(effectiveConfig, key))))) return null;
      const version = exact(data.version, ["globalRevision", "mediaRevision"]);
      if (!version || version.globalRevision !== null && !(KnifeMediaProfiles.isCounter(version.globalRevision) && version.globalRevision < Number.MAX_SAFE_INTEGER) || version.mediaRevision !== null && !KnifeMediaProfiles.isCounter(version.mediaRevision) || !["ready", "repair-required"].includes(data.revisionStatus) || version.globalRevision === null !== (data.revisionStatus === "repair-required") || !["global", "scoped", "repair-required"].includes(data.profileState) || !["pending", "ready", "limited"].includes(data.mediaPhase) || !["global", "channel"].includes(data.audioKind) || !["global", "channel"].includes(data.videoKind)) return null;
      const scoped = data.audioKind === "channel" || data.videoKind === "channel";
      if (scoped && !context.channelId || data.profileState === "scoped" !== scoped || data.profileState === "repair-required" && data.mediaPhase !== "limited" || data.mediaPhase === "ready" && version.mediaRevision === null || data.mediaPhase === "pending" && (scoped || !Object.entries(baseConfig).every(([key, value]) => Object.is(value, ownValue(effectiveConfig, key))))) return null;
      const i18n = copyRecord(data.i18n, true);
      if (!i18n || Object.keys(i18n).length > 64) return null;
      return {
        requestId: data.requestId,
        context,
        deliverySequence: data.deliverySequence,
        baseConfig,
        effectiveConfig,
        i18n,
        version,
        profileState: data.profileState,
        revisionStatus: data.revisionStatus,
        mediaPhase: data.mediaPhase,
        audioBindingGeneration: data.audioBindingGeneration,
        audioKind: data.audioKind,
        videoKind: data.videoKind
      };
    } catch {
      return null;
    }
  }

  // src/main/runtime/lifecycle.ts
  var interesting = 'video, button, section, aside, [role="tablist"]';
  function createLifecycle(runtime, environment) {
    const cleanups = [];
    let observer = null;
    let revision = -1, attempts = 0, frame = null, pulse = null, requestTimer = null;
    let started = false, suspended = false, disposed = false;
    const clearRequest = () => {
      if (requestTimer !== null) environment.clearTimeout(requestTimer);
      requestTimer = null;
    };
    const clearPulse = () => {
      if (pulse !== null) environment.clearInterval(pulse);
      pulse = null;
    };
    const clearFrame = () => {
      if (frame !== null) environment.cancelAnimationFrame(frame);
      frame = null;
    };
    const on = (target, type, listener) => {
      target.addEventListener(type, listener);
      cleanups.push(() => target.removeEventListener(type, listener));
    };
    const requestConfig = () => {
      if (disposed || suspended || runtime.media.phase !== "pending" || requestTimer !== null) return;
      if (runtime.media.context.routePath !== environment.location.pathname) {
        runtime.reconcile();
        return;
      }
      if (attempts++ >= 20) {
        runtime.setStatus("configuration", runtime.configReady ? "ready" : "limited", runtime.configReady ? "" : "config-unavailable");
        runtime.setStatus("mediaSettings", "limited", runtime.configReady ? "scoped-config-unavailable" : "reload-required");
        if (runtime.configReady) {
          runtime.media = {
            ...runtime.media,
            phase: "limited",
            version: { globalRevision: null, mediaRevision: null },
            profileState: "global",
            revisionStatus: "repair-required",
            audioBindingGeneration: 0,
            audioKind: "global",
            videoKind: "global"
          };
          runtime.config = { ...runtime.baseConfig };
          runtime.notify();
        }
        return;
      }
      environment.window.postMessage({
        namespace: "cheese-knife",
        protocol: 2,
        type: "config-request",
        requestId: runtime.mediaRequestId,
        context: { ...runtime.media.context }
      }, environment.location.origin);
      requestTimer = environment.setTimeout(() => {
        requestTimer = null;
        requestConfig();
      }, 100);
    };
    const startPulse = () => {
      clearPulse();
      if (!disposed && !suspended && !environment.document.hidden) pulse = environment.setInterval(() => {
        if (runtime.state.route?.path !== environment.location.pathname) runtime.reconcile();
      }, 1e3);
    };
    const freeze = () => {
      suspended = true;
      clearPulse();
      clearRequest();
      clearFrame();
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      freeze();
      for (const cleanup of cleanups.reverse()) {
        try {
          cleanup();
        } catch {
        }
      }
      cleanups.length = 0;
      observer = null;
    };
    const schedule = () => {
      if (disposed || suspended || frame !== null) return;
      frame = environment.requestAnimationFrame(() => {
        frame = null;
        if (!disposed && !suspended) runtime.reconcile();
      });
    };
    const onMessage = (event) => {
      const message = event;
      if (disposed || suspended || message.source !== environment.window || message.origin !== environment.location.origin) return;
      try {
        if (!message.data || typeof message.data !== "object" || Object.getOwnPropertyDescriptor(message.data, "protocol")?.value !== 2 || Object.getOwnPropertyDescriptor(message.data, "type")?.value !== "config") return;
      } catch {
        return;
      }
      runtime.reconcile();
      const envelope = readScopedConfigEnvelope(message, runtime.media.context);
      if (!envelope || envelope.requestId !== runtime.mediaRequestId || envelope.deliverySequence <= revision) return;
      revision = envelope.deliverySequence;
      runtime.baseConfig = envelope.baseConfig;
      runtime.config = envelope.effectiveConfig;
      runtime.media = {
        context: envelope.context,
        phase: envelope.mediaPhase,
        version: envelope.version,
        profileState: envelope.profileState,
        revisionStatus: envelope.revisionStatus,
        audioBindingGeneration: envelope.audioBindingGeneration,
        audioKind: envelope.audioKind,
        videoKind: envelope.videoKind
      };
      runtime.i18n = envelope.i18n;
      runtime.configReady = true;
      if (runtime.media.phase !== "pending") clearRequest();
      runtime.setStatus("configuration", "ready");
      runtime.setStatus(
        "mediaSettings",
        runtime.media.phase === "ready" ? "ready" : runtime.media.phase === "pending" ? "pending" : "limited",
        runtime.media.phase === "ready" ? "" : runtime.media.phase === "pending" ? "scoped-config-pending" : "profile-limited"
      );
      runtime.reconcile();
    };
    const onMutations = (mutations) => {
      if (runtime.state.player && !runtime.state.player.pzp.isConnected) {
        schedule();
        return;
      }
      for (const mutation of mutations) {
        const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
        if (target?.closest?.(".knife-owned")) continue;
        const changed = [...mutation.addedNodes, ...mutation.removedNodes];
        for (const node of changed) {
          if (node.nodeType !== 1) continue;
          const element = node;
          if (element.classList?.contains("knife-owned") || element.closest?.(".knife-owned")) continue;
          let siteChange = false;
          try {
            siteChange = runtime.adapter?.affectsDiscovery(element, target || void 0) === true;
          } catch {
          }
          if (siteChange || element.matches?.(interesting) || element.querySelector?.(interesting)) {
            schedule();
            return;
          }
        }
      }
    };
    return {
      start() {
        if (started || disposed) return;
        started = true;
        observer = new environment.MutationObserver(onMutations);
        cleanups.push(() => observer?.disconnect());
        on(environment.window, "message", onMessage);
        on(environment.document, "visibilitychange", () => {
          startPulse();
          runtime.reconcile();
          if (!environment.document.hidden) {
            runtime.revalidateMedia();
            runtime.notify();
          }
        });
        on(environment.window, "popstate", () => runtime.reconcile());
        on(environment.window, "pageshow", () => {
          if (disposed) return;
          suspended = false;
          startPulse();
          runtime.reconcile();
          runtime.revalidateMedia();
          runtime.notify();
        });
        on(environment.window, "pagehide", (event) => {
          if (event.persisted) {
            const video = runtime.state.player?.video;
            if (video) runtime.audio?.suspend(video);
            freeze();
            return;
          }
          dispose();
          environment.onFinal();
        });
        observer.observe(environment.document.documentElement, { childList: true, subtree: true });
        runtime.reconcile();
        startPulse();
        requestConfig();
      },
      schedule,
      dispose,
      requestMedia() {
        clearRequest();
        attempts = 0;
        revision = -1;
        requestConfig();
      }
    };
  }

  // src/main/runtime/route.ts
  var excluded = /^\/(?:chat|donation|video-donation|mission-donation|party-donation|gift-effect|product-purchase|embed|error|subs_integration|event|partner|clip-editor|account-interlock|watchparty-source|prime|settings|broadcast-information|close)(?:\/|$)/;
  function parseRoute(pathname) {
    if (excluded.test(pathname) || /\/profile\//.test(pathname)) return { kind: "excluded", path: pathname };
    const live = pathname.match(/^\/live\/([a-f0-9]{32})(?:\/chat)?\/?$/i);
    if (live?.[1]) return { kind: "live", id: live[1], path: pathname };
    const vod = pathname.match(/^\/video\/(\d+)\/?$/);
    if (vod?.[1]) return { kind: "vod", id: vod[1], path: pathname };
    const channel = pathname.match(/^\/([a-f0-9]{32})(?:\/(?:videos|clips|community))?\/?$/i);
    return channel?.[1] ? { kind: "channel", id: channel[1], path: pathname } : { kind: "explore", path: pathname };
  }

  // src/main/runtime/scope.ts
  function createResourceScope(environment) {
    const cleanups = /* @__PURE__ */ new Set();
    const controller = new environment.AbortController();
    const scope = {
      signal: controller.signal,
      disposed: false,
      add(cleanup) {
        if (scope.disposed) {
          try {
            cleanup();
          } catch {
          }
        } else cleanups.add(cleanup);
        return cleanup;
      },
      on(target, type, listener, options) {
        if (scope.disposed) return;
        target.addEventListener(type, listener, options);
        scope.add(() => target.removeEventListener(type, listener, options));
      },
      timeout(callback, delay) {
        if (scope.disposed) return 0;
        let id = 0;
        const clear = () => environment.clearTimeout(id);
        id = environment.setTimeout(() => {
          cleanups.delete(clear);
          if (!scope.disposed) callback();
        }, delay);
        scope.add(clear);
        return id;
      },
      interval(callback, delay) {
        if (scope.disposed) return 0;
        const id = environment.setInterval(() => {
          if (!scope.disposed) callback();
        }, delay);
        scope.add(() => environment.clearInterval(id));
        return id;
      },
      observe(observer, target, options) {
        if (scope.disposed) {
          observer.disconnect();
          return;
        }
        observer.observe(target, options);
        scope.add(() => observer.disconnect());
      },
      dispose() {
        if (scope.disposed) return;
        scope.disposed = true;
        try {
          controller.abort();
        } catch {
        }
        for (const cleanup of [...cleanups].reverse()) {
          try {
            cleanup();
          } catch {
          }
        }
        cleanups.clear();
      }
    };
    return scope;
  }

  // src/main/runtime/status.ts
  var reserved = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
  function createStatusStore(post, diagnostics) {
    const statuses = {};
    const transitions = [];
    return {
      statuses,
      transitions,
      setStatus(feature, state, reason = "") {
        if (!/^[a-zA-Z][a-zA-Z0-9-]{0,39}$/.test(feature) || reserved.has(feature) || !["pending", "ready", "limited", "failed", "disabled"].includes(state)) return;
        const normalizedReason = typeof reason === "string" ? reason.slice(0, 80) : "";
        const current = Object.getOwnPropertyDescriptor(statuses, feature)?.value;
        if (current?.state === state && current.reason === normalizedReason) return;
        const value = { state, reason: normalizedReason };
        Object.defineProperty(statuses, feature, { configurable: true, enumerable: true, writable: true, value });
        transitions.push({ feature, ...value });
        if (transitions.length > 20) transitions.shift();
        post({ namespace: "cheese-knife", protocol: 1, type: "status", statuses: { ...statuses }, diagnostics: diagnostics() });
      }
    };
  }

  // src/main/runtime/entry.ts
  var registryName = "cheese-knife.runtime.v1";
  function installRuntime(target) {
    const browser = target;
    const key = browser.Symbol.for(registryName);
    if (Object.getOwnPropertyDescriptor(target, key)?.value) return null;
    const subscribers = /* @__PURE__ */ new Set();
    let lifecycle;
    let runtime;
    let playerGeneration = 0, requestGeneration = 0;
    const channelId = (route) => target.top === target && route.kind === "live" && route.id && /^\/live\/[a-f0-9]{32}\/?$/i.test(route.path) ? route.id.toLowerCase() : null;
    const initialRoute = parseRoute(target.location.pathname);
    const status = createStatusStore(
      (payload) => target.postMessage(payload, target.location.origin),
      () => runtime.diagnostics()
    );
    runtime = {
      ownerProtocol: 2,
      requestId: `knife-${Date.now().toString(36)}`,
      config: {},
      baseConfig: {},
      mediaRequestId: "",
      media: {
        context: { documentGeneration: 1, routePath: initialRoute.path, channelId: channelId(initialRoute), playerGeneration },
        phase: "pending",
        version: { globalRevision: null, mediaRevision: null },
        profileState: "global",
        revisionStatus: "repair-required",
        audioBindingGeneration: 0,
        audioKind: "global",
        videoKind: "global"
      },
      i18n: {},
      configReady: false,
      state: {},
      statuses: status.statuses,
      features: {},
      generation: 0,
      route: () => parseRoute(target.location.pathname),
      selectPlayer() {
        try {
          return runtime.adapter?.discover(target.document, runtime.route()).player || null;
        } catch {
          return null;
        }
      },
      setStatus: (feature, state, reason = "") => status.setStatus(feature, state, reason),
      diagnostics() {
        const player = runtime.state.player;
        const webpack = Object.getOwnPropertyDescriptor(target, "webpackChunkglive_fe_pc")?.value;
        return {
          world: "MAIN",
          route: runtime.route().kind,
          player: !!player,
          vue: player?.vue === true,
          webpackKnown: Array.isArray(webpack),
          reactOnLayout: player?.reactOnLayout === true,
          mediaBlob: !!player?.video?.currentSrc?.startsWith("blob:")
        };
      },
      subscribe(callback) {
        subscribers.add(callback);
        callback(runtime.state);
        return () => subscribers.delete(callback);
      },
      notify() {
        for (const callback of subscribers) {
          try {
            callback(runtime.state);
          } catch {
            runtime.setStatus("runtime", "failed", "feature-initialization");
          }
        }
      },
      mediaCurrent() {
        const actual = runtime.selectPlayer(), previous = runtime.state.player;
        return runtime.configReady && runtime.media.phase !== "pending" && runtime.media.context.routePath === target.location.pathname && actual?.pzp === previous?.pzp && actual?.video === previous?.video;
      },
      revalidateMedia() {
        runtime.media.phase = "pending";
        runtime.mediaRequestId = `${runtime.requestId}-media-${++requestGeneration}`;
        runtime.config = { ...runtime.baseConfig };
        const video = runtime.state.player?.video;
        if (video) runtime.audio?.suspend(video);
        if (runtime.configReady) {
          const values = Object.fromEntries(KnifeMediaProfiles.videoFields.map((field) => [field.id, Object.getOwnPropertyDescriptor(runtime.baseConfig, field.id)?.value]));
          const checked = KnifeMediaProfiles.validateValues("video", values);
          if (checked.ok && checked.domain === "video") runtime.filters?.reconcile(checked.values, null, null);
        }
        runtime.setStatus("mediaSettings", "pending", "scoped-config-pending");
        lifecycle.requestMedia();
      },
      reconcile() {
        const route = runtime.route();
        let site;
        try {
          site = runtime.adapter?.discover(target.document, route);
        } catch {
        }
        const body = site?.body || null, player = site?.player || null, sidebar = site?.sidebar || null;
        const previous = runtime.state;
        if (previous.route?.path === route.path && previous.body === body && previous.sidebar === sidebar && previous.player?.pzp === player?.pzp && previous.player?.video === player?.video && previous.player?.filterTarget === player?.filterTarget) {
          runtime.notify();
          return;
        }
        const mediaChanged = previous.route?.path !== route.path || previous.player?.pzp !== player?.pzp || previous.player?.video !== player?.video;
        if (mediaChanged) {
          if (previous.player?.video) {
            if (previous.player.video === player?.video && previous.route?.path === route.path) runtime.audio?.suspend(previous.player.video);
            else runtime.audio?.bypass(previous.player.video);
          }
          runtime.media.context = { documentGeneration: runtime.media.context.documentGeneration, routePath: route.path, channelId: channelId(route), playerGeneration: ++playerGeneration };
        }
        runtime.generation++;
        runtime.state = { route, body, player, sidebar, generation: runtime.generation };
        if (mediaChanged) runtime.revalidateMedia();
        runtime.notify();
      },
      schedule: () => lifecycle.schedule(),
      createScope: () => createResourceScope({
        AbortController: browser.AbortController,
        setTimeout: (callback, delay) => target.setTimeout(callback, delay),
        clearTimeout: (id) => target.clearTimeout(id),
        setInterval: (callback, delay) => target.setInterval(callback, delay),
        clearInterval: (id) => target.clearInterval(id)
      })
    };
    const removeRegistry = () => {
      if (Object.getOwnPropertyDescriptor(target, key)?.value === runtime) Reflect.deleteProperty(target, key);
    };
    lifecycle = createLifecycle(runtime, {
      window: target,
      document: target.document,
      location: target.location,
      MutationObserver: browser.MutationObserver,
      requestAnimationFrame: (callback) => target.requestAnimationFrame(callback),
      cancelAnimationFrame: (id) => target.cancelAnimationFrame(id),
      setTimeout: (callback, delay) => target.setTimeout(callback, delay),
      clearTimeout: (id) => target.clearTimeout(id),
      setInterval: (callback, delay) => target.setInterval(callback, delay),
      clearInterval: (id) => target.clearInterval(id),
      onFinal: removeRegistry
    });
    Object.defineProperty(target, key, { configurable: true, value: runtime });
    try {
      lifecycle.start();
      return runtime;
    } catch (error) {
      lifecycle.dispose();
      removeRegistry();
      throw error;
    }
  }
  installRuntime(window);
})();

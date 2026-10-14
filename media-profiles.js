// Generated from src/settings/media-profiles.ts by scripts/settings-runtime.mjs. Do not edit.
var KnifeMediaProfiles = (() => {
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
  function readStore(raw) {
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
        const binding = ownRecord(item[domain], ["createdRevision", "values"]);
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
  function resolveMediaSettings(base, read, context) {
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
    const read = readStore(input);
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
        if (readStore(store).state !== "valid") return failure("media-limit");
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
  return Object.freeze({
    audioFields,
    videoFields,
    readStore,
    validateValues,
    resolveMediaSettings,
    mergeMediaOperation,
    isChannelId: channelId,
    isPresetId: presetId,
    isPresetName: label,
    isCounter: counter
  });
})();

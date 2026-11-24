// Generated from src/settings/contract.ts by scripts/settings-runtime.mjs. Do not edit.
var KnifeSettingsContract = (() => {
  const configFields = new Map(CONFIGS.flatMap((c) => c.configs.flatMap((f) => f.configs || [f])).map((f) => [f.id, f]));
  const styleFields = new Map(STYLES.flatMap((c) => c.styles).map((f) => [f.id, f]));
  const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const shape = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((k) => Object.hasOwn(value, k));
  const fail = (code) => ({ ok: false, code });
  const error = (code) => Object.assign(new Error(code), { code });
  const numeric = (value, field) => typeof value === "number" && Number.isFinite(value) && value >= field.min && value <= field.max;
  function validateOperations(operations) {
    if (!Array.isArray(operations) || operations.length > 64) return fail("invalid-operations");
    const aliases = operations.filter((op) => op?.type === "config" && ["audioDefault", "compressorDefault"].includes(op?.id));
    const mixedNames = aliases.some((op) => op.id === "audioDefault") && aliases.some((op) => op.id === "compressorDefault");
    if (aliases.some((op) => typeof op.value !== "boolean") || mixedNames && aliases.some((op) => op.value !== aliases[0]?.value)) return fail("invalid-operations");
    const normalized = operations.map((op) => op?.type === "config" && op.id === "audioDefault" ? { ...op, id: "compressorDefault" } : op);
    for (const op of normalized) {
      if (!op || typeof op.id !== "string") return fail("invalid-operation");
      if (op.type === "config") {
        const field = configFields.get(op.id);
        if (!shape(op, ["type", "id", "value"]) || !field || !(field.type === "range" ? numeric(op.value, field) : typeof op.value === "boolean")) return fail("invalid-operation");
      } else if (op.type === "style") {
        const field = styleFields.get(op.id);
        if (!shape(op, ["type", "id", "enabled"]) || !field || field.type || typeof op.enabled !== "boolean") return fail("invalid-operation");
      } else if (op.type === "parameter") {
        const field = styleFields.get(op.id);
        if (!shape(op, ["type", "id", "value"]) || field?.type !== "range" || !numeric(op.value, field)) return fail("invalid-operation");
      } else return fail("invalid-operation");
    }
    return { ok: true, operations: normalized.map((op) => ({ ...op })) };
  }
  function validateRequest(message, sender, extensionId, getURL) {
    if (!sender || typeof extensionId !== "string" || !extensionId || sender.id !== extensionId || typeof sender.url !== "string" || sender.frameId !== void 0 && sender.frameId !== 0) return fail("invalid-sender");
    try {
      const url = new URL(sender.url);
      const allowed = ["popup.html", "styles.html"].some((path) => {
        const own = new URL(getURL(path));
        return url.protocol === own.protocol && url.host === own.host && url.pathname === own.pathname;
      });
      if (!allowed) return fail("invalid-sender");
    } catch {
      return fail("invalid-sender");
    }
    if (!message || message.namespace !== "cheese-knife-settings" || message.protocol !== 1 || typeof message.requestId !== "string" || !message.requestId.length || message.requestId.length > 128) return fail("invalid-request");
    const keys = ["namespace", "protocol", "action", "requestId"];
    if (message.action === "patch") {
      if (!shape(message, [...keys, "operations"])) return fail("invalid-request");
      const result = validateOperations(message.operations);
      if (!result.ok) return result;
      return { ok: true, request: { ...message, operations: result.operations } };
    }
    if (message.action === "reload-target") {
      if (!shape(message, [...keys, "targetTabId", "targetWindowId"]) || ![message.targetTabId, message.targetWindowId].every((v) => Number.isSafeInteger(v) && v >= 0)) return fail("invalid-request");
    } else if (message.action !== "get-snapshot" || !shape(message, keys)) return fail("invalid-request");
    return { ok: true, request: { ...message } };
  }
  function readRevision(value) {
    if (value === void 0) return 0;
    if (!Number.isSafeInteger(value) || value < 0) throw error("revision-invalid");
    if (value === Number.MAX_SAFE_INTEGER) throw error("revision-exhausted");
    return value;
  }
  function mediaRecord(value, required, optional = []) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const allowed = [...required, ...optional], keys = Reflect.ownKeys(value);
    if (keys.length > allowed.length || keys.some((key) => typeof key !== "string" || !allowed.includes(key))) return null;
    const entries = [];
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== "string" || !descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      entries.push([key, descriptor.value]);
    }
    const record2 = Object.fromEntries(entries);
    return required.every((key) => Object.hasOwn(record2, key)) ? record2 : null;
  }
  function validateMediaRequest(message, sender, extensionId, getURL) {
    return validateMediaContract(message, sender, extensionId, getURL, 2);
  }
  function validateMediaRequestV3(message, sender, extensionId, getURL) {
    return validateMediaContract(message, sender, extensionId, getURL, 3);
  }
  function audioState(value) {
    const state = mediaRecord(value, ["tabId", "windowId", "documentId", "url", "runtimeRequestId", "mediaRequestId", "context", "wanted", "state"]);
    const context = state && mediaRecord(state.context, ["documentGeneration", "routePath", "channelId", "playerGeneration"]);
    return !!state && !!context && KnifeMediaProfiles.isCounter(state.tabId) && KnifeMediaProfiles.isCounter(state.windowId) && [state.documentId, state.runtimeRequestId, state.mediaRequestId].every((id) => typeof id === "string" && id.length > 0 && id.length <= 128) && typeof state.url === "string" && state.url.length <= 2048 && typeof state.wanted === "boolean" && ["off", "pending", "on", "unavailable"].includes(state.state) && KnifeMediaProfiles.isCounter(context.documentGeneration) && KnifeMediaProfiles.isCounter(context.playerGeneration) && typeof context.routePath === "string" && context.routePath.length <= 512 && (context.channelId === null || KnifeMediaProfiles.isChannelId(context.channelId));
  }
  function validateMediaContract(message, sender, extensionId, getURL, protocol) {
    const own = validateRequest({ namespace: "cheese-knife-settings", protocol: 1, action: "get-snapshot", requestId: "sender-check" }, sender, extensionId, getURL);
    if (!own.ok) return fail("invalid-sender");
    if (typeof sender?.documentId !== "string" || !sender.documentId.length || sender.documentId.length > 128) return fail("sender-context-unavailable");
    const header = ["namespace", "protocol", "action", "requestId"];
    const value = mediaRecord(message, header, [
      "selection",
      "domain",
      "expectedGlobalRevision",
      "expectedMediaRevision",
      "expectedRecord",
      "channelToken",
      "patch",
      "expectedRecordRevision",
      "values",
      "presetToken",
      "recordCreatedRevision",
      "domainCreatedRevision",
      "id",
      "name",
      "createdRevision",
      "expectedPresetRevision",
      ...protocol === 3 ? ["storeSchema", "documentId", "value", "target", "binding", "wanted"] : []
    ]);
    if (!value || value.namespace !== "cheese-knife-settings" || value.protocol !== protocol || typeof value.requestId !== "string" || !value.requestId.length || value.requestId.length > 128) return fail("invalid-request");
    const modern = protocol === 3;
    const readOnly = ["get-media-snapshot", "read-legacy-gain", "get-audio-state", "set-audio-wanted"].includes(value.action);
    if (modern && !readOnly) {
      if (value.storeSchema !== 1 && value.storeSchema !== 2) return fail("invalid-request");
      header.push("storeSchema");
    }
    const media = KnifeMediaProfiles;
    const domain = (entry) => entry === "audio" || entry === "video";
    const positive = (entry) => media.isCounter(entry) && entry > 0;
    const recordToken = (entry) => {
      const token = mediaRecord(entry, ["createdRevision", "revision"]);
      return !!token && positive(token.createdRevision) && positive(token.revision);
    };
    const presetToken = (entry) => {
      const token = mediaRecord(entry, ["id", "createdRevision", "revision"]);
      return !!token && media.isPresetId(token.id) && positive(token.createdRevision) && positive(token.revision);
    };
    const channelToken = (entry) => {
      const token = mediaRecord(entry, ["channelId", "recordCreatedRevision", "domainCreatedRevision"]);
      return !!token && media.isChannelId(token.channelId) && positive(token.recordCreatedRevision) && positive(token.domainCreatedRevision);
    };
    const selected = (entry, allowGlobal) => {
      const kind = Object.getOwnPropertyDescriptor(entry || {}, "kind")?.value;
      const fields = kind === "global" ? ["kind"] : kind === "saved" ? ["kind", "channelId"] : kind === "current" ? ["kind", "channelId", "tabId", "windowId"] : null;
      const selection = fields ? mediaRecord(entry, fields) : null;
      return !!selection && (kind === "global" ? allowGlobal : media.isChannelId(selection.channelId) && (kind !== "current" || media.isCounter(selection.tabId) && media.isCounter(selection.windowId)));
    };
    const patch = (selectedDomain, entry) => {
      if (!domain(selectedDomain)) return false;
      const fields = selectedDomain === "audio" ? modern ? media.audioFieldsV2 : media.audioFields : media.videoFields;
      const partial = mediaRecord(entry, [], fields.map((field) => field.id));
      return !!partial && Object.entries(partial).every(([id, current]) => {
        const field = fields.find((item) => item.id === id);
        return !!field && (field.type === "range" ? numeric(current, field) : typeof current === "boolean");
      });
    };
    const exact = (required, optional = []) => !!mediaRecord(value, [...header, ...required], optional);
    const full = () => domain(value.domain) && (modern && value.domain === "audio" ? media.validateAudioV2(value.values) : media.validateValues(value.domain, value.values)).ok;
    let valid = false;
    switch (value.action) {
      case "get-audio-state":
      case "set-audio-wanted": {
        const target = mediaRecord(value.target, ["tabId", "windowId", "routePath"]);
        valid = modern && !!target && media.isCounter(target.tabId) && media.isCounter(target.windowId) && typeof target.routePath === "string" && target.routePath.length <= 512 && /^\/(?:live\/[a-f0-9]{32}|[a-f0-9]{32}|video\/\d+)\/?$/i.test(target.routePath) && (value.action === "get-audio-state" ? exact(["target"]) : exact(["target", "binding", "wanted"]) && typeof value.wanted === "boolean" && audioState(value.binding) && value.binding.tabId === target.tabId && value.binding.windowId === target.windowId && value.binding.context.routePath === target.routePath);
        break;
      }
      case "get-media-snapshot":
        valid = exact(["selection"]) && selected(value.selection, true);
        break;
      case "upgrade-media-store":
        valid = modern && exact(["expectedMediaRevision"]) && value.storeSchema === 1 && media.isCounter(value.expectedMediaRevision);
        break;
      case "patch-global-fields":
        valid = modern && exact(["domain", "expectedGlobalRevision", "patch"]) && media.isCounter(value.expectedGlobalRevision) && patch(value.domain, value.patch);
        break;
      case "read-legacy-gain":
        valid = modern && exact(["selection"]) && selected(value.selection, false) && value.selection.kind === "current";
        break;
      case "import-legacy-gain":
        valid = modern && exact(["selection", "expectedGlobalRevision", "documentId", "value"]) && selected(value.selection, false) && value.selection.kind === "current" && media.isCounter(value.expectedGlobalRevision) && typeof value.documentId === "string" && value.documentId.length > 0 && value.documentId.length <= 128 && typeof value.value === "number" && Number.isFinite(value.value) && value.value >= 0 && value.value <= 2;
        break;
      case "enable-channel-domain":
        valid = exact(["selection", "domain", "expectedGlobalRevision", "expectedMediaRevision", "expectedRecord"]) && selected(value.selection, false) && domain(value.domain) && media.isCounter(value.expectedGlobalRevision) && media.isCounter(value.expectedMediaRevision) && (value.expectedRecord === null || recordToken(value.expectedRecord));
        break;
      case "patch-channel-fields":
        valid = exact(["selection", "domain", "channelToken", "patch"]) && selected(value.selection, false) && channelToken(value.channelToken) && patch(value.domain, value.patch);
        break;
      case "replace-channel-domain":
        valid = selected(value.selection, false) && channelToken(value.channelToken) && positive(value.expectedRecordRevision) && domain(value.domain) && (exact(["selection", "domain", "channelToken", "expectedRecordRevision", "values"]) && full() || exact(["selection", "domain", "channelToken", "expectedRecordRevision", "presetToken"]) && presetToken(value.presetToken));
        break;
      case "reset-channel-domain":
        valid = exact(["selection", "domain", "recordCreatedRevision", "domainCreatedRevision", "expectedRecordRevision"]) && selected(value.selection, false) && domain(value.domain) && positive(value.recordCreatedRevision) && positive(value.domainCreatedRevision) && positive(value.expectedRecordRevision);
        break;
      case "delete-channel":
        valid = exact(["selection", "recordCreatedRevision", "expectedRecordRevision"]) && selected(value.selection, false) && positive(value.recordCreatedRevision) && positive(value.expectedRecordRevision);
        break;
      case "create-preset":
        valid = exact(["id", "expectedMediaRevision", "domain", "name", "values"]) && media.isPresetId(value.id) && media.isCounter(value.expectedMediaRevision) && media.isPresetName(value.name) && full();
        break;
      case "edit-preset":
        valid = media.isPresetId(value.id) && positive(value.createdRevision) && (value.name === void 0 || media.isPresetName(value.name)) && (exact(["id", "createdRevision", "name"]) && media.isPresetName(value.name) || exact(["id", "createdRevision", "domain", "patch"], ["name"]) && patch(value.domain, value.patch) || exact(["id", "createdRevision", "domain", "values", "expectedPresetRevision"], ["name"]) && full() && positive(value.expectedPresetRevision));
        break;
      case "delete-preset":
        valid = exact(["presetToken"]) && presetToken(value.presetToken);
        break;
      case "apply-preset-global":
        valid = exact(["presetToken", "expectedGlobalRevision"]) && presetToken(value.presetToken) && media.isCounter(value.expectedGlobalRevision);
        break;
    }
    if (!valid) return fail("invalid-request");
    return modern ? { ok: true, request: value } : { ok: true, request: value };
  }
  function validateGainRequest(message, sender, extensionId) {
    if (!sender || sender.id !== extensionId || !sender.tab || !Number.isSafeInteger(sender.tab.id) || !Number.isSafeInteger(sender.tab.windowId) || sender.tab.incognito !== false || sender.frameId !== 0 || typeof sender.documentId !== "string" || !sender.documentId.length || sender.documentId.length > 128 || sender.origin !== "https://chzzk.naver.com") return fail("invalid-sender");
    try {
      const url = new URL(sender.url);
      if (url.origin !== sender.origin || !/^\/(?:live\/[a-f0-9]{32}|[a-f0-9]{32}|video\/\d+)\/?$/i.test(url.pathname)) return fail("invalid-sender");
    } catch {
      return fail("invalid-sender");
    }
    const header = ["namespace", "protocol", "requestId", "action"];
    const value = mediaRecord(message, header, ["ticket", "intentId", "value"]);
    const id = (entry) => typeof entry === "string" && /^[a-zA-Z0-9:_-]{1,128}$/.test(entry);
    if (!value || value.namespace !== "cheese-knife-player-gain" || value.protocol !== 3 || !id(value.requestId)) return fail("invalid-request");
    if (value.action === "get-gain-view") {
      if (!mediaRecord(value, header)) return fail("invalid-request");
    } else if (value.action !== "set-gain" || !mediaRecord(value, [...header, "ticket", "intentId", "value"]) || !id(value.ticket) || !id(value.intentId) || typeof value.value !== "number" || !Number.isFinite(value.value) || value.value < 0 || value.value > 2) return fail("invalid-request");
    return { ok: true, request: value };
  }
  const sameRecord = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => Object.hasOwn(b, key) && Object.is(value, Object.getOwnPropertyDescriptor(b, key)?.value));
  const sameArray = (a, b) => a.length === b.length && a.every((value, index) => Object.is(value, b.at(index)));
  function mergeOperations(raw, operations) {
    const valid = validateOperations(operations);
    if (!valid.ok) throw error(valid.code);
    const revision = readRevision(raw.settingsRevision);
    const oldConfig = record(raw.config), oldParameters = record(raw.styleParameters);
    const oldStyles = Array.isArray(raw.styles) ? raw.styles : [];
    const config = { ...oldConfig }, styleParameters = { ...oldParameters };
    let styles = [...oldStyles], stylesTouched = operations.length === 0;
    const setStyle = (id, enabled) => {
      if (enabled) {
        if (!styles.includes(id)) styles.push(id);
      } else styles = styles.filter((value) => value !== id);
    };
    for (const op of valid.operations) {
      if (op.type === "config") config[op.id] = op.value;
      else {
        stylesTouched = true;
        if (op.type === "style") setStyle(op.id, op.enabled);
        else {
          styleParameters[op.id] = op.value;
          setStyle(op.id, op.value !== 0);
        }
      }
    }
    const changes = {};
    if (!sameRecord(config, oldConfig)) changes.config = config;
    if (!sameArray(styles, oldStyles)) changes.styles = styles;
    if (!sameRecord(styleParameters, oldParameters)) changes.styleParameters = styleParameters;
    if (Object.keys(changes).length) changes.settingsRevision = revision + 1;
    return { changes, revision: changes.settingsRevision ?? revision, stylesTouched };
  }
  function cssFiles(styles) {
    const selected = new Set(Array.isArray(styles) ? styles : []);
    return [...styleFields.keys()].filter((id) => selected.has(id)).map((id) => `styles/${id}.css`);
  }
  function makeSnapshot(raw, css) {
    const source = record(raw.styleParameters), entries = [];
    for (const [id, field] of styleFields) {
      const value = Object.getOwnPropertyDescriptor(source, id)?.value;
      if (field.type === "range" && numeric(value, field)) entries.push([id, value]);
    }
    const styleParameters = Object.fromEntries(entries);
    return {
      revision: readRevision(raw.settingsRevision),
      config: normalizeConfig(raw.config),
      styles: cssFiles(raw.styles).map((file) => file.slice(7, -4)),
      styleParameters,
      css: { ...css }
    };
  }
  return { validateOperations, validateRequest, validateMediaRequest, validateMediaRequestV3, validateGainRequest, audioState, readRevision, mergeOperations, makeSnapshot, cssFiles };
})();

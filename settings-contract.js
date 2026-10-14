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
    for (const op of operations) {
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
    return { ok: true, operations: operations.map((op) => ({ ...op })) };
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
      "expectedPresetRevision"
    ]);
    if (!value || value.namespace !== "cheese-knife-settings" || value.protocol !== 2 || typeof value.requestId !== "string" || !value.requestId.length || value.requestId.length > 128) return fail("invalid-request");
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
      const fields = selectedDomain === "audio" ? media.audioFields : media.videoFields;
      const partial = mediaRecord(entry, [], fields.map((field) => field.id));
      return !!partial && Object.entries(partial).every(([id, current]) => {
        const field = fields.find((item) => item.id === id);
        return !!field && (field.type === "range" ? numeric(current, field) : typeof current === "boolean");
      });
    };
    const exact = (required, optional = []) => !!mediaRecord(value, [...header, ...required], optional);
    const full = () => domain(value.domain) && media.validateValues(value.domain, value.values).ok;
    let valid = false;
    switch (value.action) {
      case "get-media-snapshot":
        valid = exact(["selection"]) && selected(value.selection, true);
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
  return { validateOperations, validateRequest, validateMediaRequest, readRevision, mergeOperations, makeSnapshot, cssFiles };
})();

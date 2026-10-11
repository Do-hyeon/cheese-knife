var KnifeSettingsContract = (() => {
  /** @type {Map<string, KnifeConfigLeaf>} */
  const configFields = new Map(CONFIGS.flatMap(c => c.configs.flatMap(f => f.configs || [f])).map(f => [f.id, f]));
  /** @type {Map<string, KnifeStyleField>} */
  const styleFields = new Map(STYLES.flatMap(c => c.styles).map(f => [f.id, f]));
  /** @param {unknown} value @returns {KnifeUnknownRecord} */
  const record = value => value && typeof value === 'object' && !Array.isArray(value) ? /** @type {KnifeUnknownRecord} */ (value) : {};
  /** @param {unknown} value @param {string[]} keys */
  const shape = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
  /** @param {string} code @returns {KnifeFailure} */
  const fail = code => ({ ok: false, code });
  /** @param {string} code @returns {KnifeCodedError} */
  const error = code => Object.assign(new Error(code), { code });
  /** @param {unknown} value @param {KnifeRangeConfig | KnifeRangeStyleField} field */
  const numeric = (value, field) => typeof value === 'number' && Number.isFinite(value) && value >= field.min && value <= field.max;
  /** @param {unknown} operations @returns {KnifeOperationsResult} */
  function validateOperations(operations) {
    if (!Array.isArray(operations) || operations.length > 64) return fail('invalid-operations');
    for (const op of operations) {
      if (!op || typeof op.id !== 'string') return fail('invalid-operation');
      if (op.type === 'config') {
        const field = configFields.get(op.id);
        if (!shape(op, ['type', 'id', 'value']) || !field ||
          !(field.type === 'range' ? numeric(op.value, field) : typeof op.value === 'boolean')) return fail('invalid-operation');
      } else if (op.type === 'style') {
        const field = styleFields.get(op.id);
        if (!shape(op, ['type', 'id', 'enabled']) || !field || field.type || typeof op.enabled !== 'boolean') return fail('invalid-operation');
      } else if (op.type === 'parameter') {
        const field = styleFields.get(op.id);
        if (!shape(op, ['type', 'id', 'value']) || field?.type !== 'range' || !numeric(op.value, field)) return fail('invalid-operation');
      } else return fail('invalid-operation');
    }
    return { ok: true, operations: operations.map(op => ({ ...op })) };
  }
  /**
   * @param {KnifeUnknownRecord | null | undefined} message
   * @param {chrome.runtime.MessageSender | null | undefined} sender
   * @param {string} extensionId
   * @param {(path: string) => string} getURL
   * @returns {KnifeRequestResult}
   */
  function validateRequest(message, sender, extensionId, getURL) {
    if (!sender || typeof extensionId !== 'string' || !extensionId || sender.id !== extensionId ||
      typeof sender.url !== 'string' || (sender.frameId !== undefined && sender.frameId !== 0)) return fail('invalid-sender');
    try {
      const url = new URL(sender.url);
      const allowed = ['popup.html', 'styles.html'].some(path => {
        const own = new URL(getURL(path));
        return url.protocol === own.protocol && url.host === own.host && url.pathname === own.pathname;
      });
      if (!allowed) return fail('invalid-sender');
    } catch { return fail('invalid-sender'); }
    if (!message || message.namespace !== 'cheese-knife-settings' || message.protocol !== 1 ||
      typeof message.requestId !== 'string' || !message.requestId.length || message.requestId.length > 128) return fail('invalid-request');
    const keys = ['namespace', 'protocol', 'action', 'requestId'];
    if (message.action === 'patch') {
      if (!shape(message, [...keys, 'operations'])) return fail('invalid-request');
      const result = validateOperations(message.operations);
      if (!result.ok) return result;
      return { ok: true, request: /** @type {KnifeSettingsRequest} */ ({ ...message, operations: result.operations }) };
    }
    if (message.action === 'reload-target') {
      if (!shape(message, [...keys, 'targetTabId', 'targetWindowId']) ||
        ![message.targetTabId, message.targetWindowId].every(v => Number.isSafeInteger(v) && /** @type {number} */ (v) >= 0)) return fail('invalid-request');
    } else if (message.action !== 'get-snapshot' || !shape(message, keys)) return fail('invalid-request');
    return { ok: true, request: /** @type {KnifeSettingsRequest} */ ({ ...message }) };
  }
  /** @param {unknown} value @returns {number} */
  function readRevision(value) {
    if (value === undefined) return 0;
    if (!Number.isSafeInteger(value) || /** @type {number} */ (value) < 0) throw error('revision-invalid');
    if (value === Number.MAX_SAFE_INTEGER) throw error('revision-exhausted');
    return /** @type {number} */ (value);
  }
  /** @param {KnifeUnknownRecord} a @param {KnifeUnknownRecord} b */
  const sameRecord = (a, b) => Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(([key, value]) => Object.hasOwn(b, key) && Object.is(value, Object.getOwnPropertyDescriptor(b, key)?.value));
  /** @param {unknown[]} a @param {unknown[]} b */
  const sameArray = (a, b) => a.length === b.length && a.every((value, index) => Object.is(value, b.at(index)));
  /** @param {KnifeUnknownRecord} raw @param {KnifeSettingsOperation[]} operations */
  function mergeOperations(raw, operations) {
    const valid = validateOperations(operations);
    if (!valid.ok) throw error(valid.code);
    const revision = readRevision(raw.settingsRevision);
    const oldConfig = record(raw.config), oldParameters = record(raw.styleParameters);
    const oldStyles = Array.isArray(raw.styles) ? raw.styles : [];
    const config = { ...oldConfig }, styleParameters = { ...oldParameters };
    let styles = [...oldStyles], stylesTouched = operations.length === 0;
    /** @param {string} id @param {boolean} enabled */
    const setStyle = (id, enabled) => {
      if (enabled) { if (!styles.includes(id)) styles.push(id); }
      else styles = styles.filter(value => value !== id);
    };
    for (const op of valid.operations) {
      if (op.type === 'config') config[op.id] = op.value;
      else {
        stylesTouched = true;
        if (op.type === 'style') setStyle(op.id, op.enabled);
        else { styleParameters[op.id] = op.value; setStyle(op.id, op.value !== 0); }
      }
    }
    /** @type {KnifeUnknownRecord} */
    const changes = {};
    if (!sameRecord(config, oldConfig)) changes.config = config;
    if (!sameArray(styles, oldStyles)) changes.styles = styles;
    if (!sameRecord(styleParameters, oldParameters)) changes.styleParameters = styleParameters;
    if (Object.keys(changes).length) changes.settingsRevision = revision + 1;
    return { changes, revision: changes.settingsRevision ?? revision, stylesTouched };
  }
  /** @param {unknown} styles */
  function cssFiles(styles) {
    const selected = new Set(Array.isArray(styles) ? styles : []);
    return [...styleFields.keys()].filter(id => selected.has(id)).map(id => `styles/${id}.css`);
  }
  /** @param {KnifeUnknownRecord} raw @param {KnifeCssState} css @returns {KnifeSettingsSnapshot} */
  function makeSnapshot(raw, css) {
    const source = record(raw.styleParameters), entries = /** @type {[string, number][]} */ ([]);
    for (const [id, field] of styleFields) {
      const value = Object.getOwnPropertyDescriptor(source, id)?.value;
      if (field.type === 'range' && numeric(value, field)) entries.push([id, value]);
    }
    const styleParameters = Object.fromEntries(entries);
    return { revision: readRevision(raw.settingsRevision), config: normalizeConfig(raw.config),
      styles: cssFiles(raw.styles).map(file => file.slice(7, -4)), styleParameters, css: { ...css } };
  }
  return { validateOperations, validateRequest, readRevision, mergeOperations, makeSnapshot, cssFiles };
})();

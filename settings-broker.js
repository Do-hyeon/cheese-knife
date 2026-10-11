/** @param {typeof chrome} chromeApi */
var createSettingsBroker = chromeApi => {
  const contract = KnifeSettingsContract;
  const keys = ['config', 'styles', 'styleParameters', 'settingsRevision'];
  const jobs = /** @type {KnifeJob[]} */ ([]); let running = false, /** @type {Promise<unknown> | undefined} */ boot, /** @type {unknown} */ initFailure;
  let css = /** @type {KnifeCssState} */ ({ state: 'pending', code: null }), /** @type {string | undefined} */ lastFailedCss;
  let stylesDirty = false, stylesQueued = false, stylesRetry = false;
  /** @param {string} stage @param {string} code @returns {KnifeCodedError} */
  const fault = (stage, code) => Object.assign(new Error(code), { stage, code });
  /** @param {unknown} value @returns {KnifeUnknownRecord} */
  const record = value => value && typeof value === 'object' && !Array.isArray(value) ? /** @type {KnifeUnknownRecord} */ (value) : {};
  /** @param {unknown} a @param {unknown} b */
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  /** @param {() => Promise<unknown>} work */
  function enqueue(work) {
    if (running && jobs.length >= 64) return Promise.reject(fault('busy', 'settings-busy'));
    const result = new Promise((resolve, reject) => jobs.push({ work, resolve, reject }));
    void drain(); return result;
  }
  async function drain() {
    if (running) return;
    running = true;
    while (jobs.length) {
      const job = /** @type {KnifeJob} */ (jobs.shift());
      try { job.resolve(await job.work()); } catch (error) { job.reject(error); }
      scheduleStyles();
    }
    running = false;
  }
  /** @param {boolean} [includeLegacy] @returns {Promise<KnifeUnknownRecord>} */
  async function read(includeLegacy = false) {
    try { return /** @type {KnifeUnknownRecord} */ (await chromeApi.storage.local.get(includeLegacy ? [...keys, 't'] : keys)); }
    catch { throw fault('read', 'storage-read-failed'); }
  }
  /** @param {KnifeUnknownRecord} changes */
  async function write(changes) {
    try { await chromeApi.storage.local.set(changes); }
    catch { throw fault('write', 'storage-write-failed'); }
  }
  /** @param {KnifeUnknownRecord} raw @param {boolean} [force] */
  async function applyStyles(raw, force = false) {
    const files = contract.cssFiles(raw.styles), fingerprint = JSON.stringify(files);
    try {
      const [existing] = await chromeApi.scripting.getRegisteredContentScripts({ ids: ['styles'] });
      /** @type {chrome.scripting.RegisteredContentScript} */
      const desired = { id: 'styles', matches: [...KnifeHostPolicy.origins], css: files, runAt: 'document_start' };
      const matches = !files.length ? !existing : existing && equal(existing.css, files) &&
        equal(existing.matches, desired.matches) && existing.runAt === desired.runAt && !existing.js?.length;
      if (matches) { css = { state: 'ready', code: null }; lastFailedCss = undefined; return; }
      if (!force && lastFailedCss === fingerprint) return;
      if (existing?.js?.length) throw new Error('unexpected-owned-script');
      css = { state: 'pending', code: null };
      if (!files.length) await chromeApi.scripting.unregisterContentScripts({ ids: ['styles'] });
      else if (existing) await chromeApi.scripting.updateContentScripts([desired]);
      else await chromeApi.scripting.registerContentScripts([desired]);
      css = { state: 'ready', code: null }; lastFailedCss = undefined;
    } catch { css = { state: 'failed', code: 'style-registration-failed' }; lastFailedCss = fingerprint; }
  }
  function scheduleStyles() {
    if (!stylesDirty || stylesQueued || !boot || initFailure || jobs.length >= 64) return;
    stylesQueued = true;
    void enqueue(async () => {
      const retry = stylesRetry;
      stylesDirty = false;
      stylesRetry = false;
      let raw;
      try {
        await boot;
        raw = await read(); contract.readRevision(raw.settingsRevision);
      } catch (error) {
        if (retry) stylesRetry = true;
        throw error;
      }
      await applyStyles(raw, retry);
    }).catch(() => {}).finally(() => { stylesQueued = false; scheduleStyles(); });
  }
  /** @param {{ retry?: boolean }} [options] */
  function invalidateStyles(options = {}) {
    stylesDirty = true;
    if (options.retry === true) stylesRetry = true;
    scheduleStyles();
  }
  function initialize() {
    if (boot) return boot;
    boot = enqueue(async () => {
      const raw = await read(true), revision = contract.readRevision(raw.settingsRevision);
      const config = { ...record(raw.config) }, styles = Array.isArray(raw.styles) ? [...raw.styles] : [];
      if (config.resizeChat) { delete config.resizeChat; if (!styles.includes('chat-resize')) styles.push('chat-resize'); }
      if (raw.t != null) {
        const sharpness = Number(raw.t);
        if (contract.validateOperations([{ type: 'config', id: 'sharpness', value: sharpness }]).ok) config.sharpness = sharpness;
      }
      const changes = {};
      if (!equal(config, record(raw.config))) changes.config = config;
      if (!equal(styles, Array.isArray(raw.styles) ? raw.styles : [])) changes.styles = styles;
      if (Object.keys(changes).length) { changes.settingsRevision = revision + 1; await write(changes); }
      if (Object.hasOwn(raw, 't')) {
        try { await chromeApi.storage.local.remove('t'); }
        catch { throw fault('initialization', 'legacy-cleanup-failed'); }
      }
      await applyStyles({ ...raw, ...changes }, true);
    });
    void boot.catch(error => { initFailure = error; });
    return boot;
  }
  /** @param {KnifeSettingsRequest} request */
  async function execute(request) {
    const raw = await read();
    let revision;
    try { revision = contract.readRevision(raw.settingsRevision); }
    catch (error) { throw fault('read', /** @type {KnifeCodedError} */ (error).code); }
    if (request.action === 'get-snapshot') return { ok: true, requestId: request.requestId, snapshot: contract.makeSnapshot(raw, css) };
    if (request.action === 'patch') {
      const result = contract.mergeOperations(raw, request.operations);
      if (Object.keys(result.changes).length) await write(result.changes);
      if (result.stylesTouched) await applyStyles({ ...raw, ...result.changes }, true);
      const failed = result.stylesTouched && css.state === 'failed';
      return { ok: !failed, requestId: request.requestId, revision: result.revision, stored: true,
        css: { ...css }, stage: failed ? 'css' : null, code: failed ? css.code : null };
    }
    await applyStyles(raw);
    if (css.state !== 'ready') throw fault('css', css.code || 'style-registration-failed');
    let tab;
    try { tab = await chromeApi.tabs.get(request.targetTabId); }
    catch { throw fault('target', 'target-missing'); }
    try { if (new URL(/** @type {string} */ (tab.url)).origin !== 'https://chzzk.naver.com') throw new Error(); }
    catch { throw fault('target', 'target-origin-changed'); }
    if (tab.windowId !== request.targetWindowId) throw fault('target', 'target-window-changed');
    try { await chromeApi.tabs.reload(request.targetTabId); }
    catch { throw fault('reload', 'target-reload-failed'); }
    return { ok: true, requestId: request.requestId, revision, reloaded: true,
      appliedStyles: contract.makeSnapshot(raw, css).styles, css: { ...css }, stage: null, code: null };
  }
  /**
   * @param {KnifeUnknownRecord | null | undefined} message
   * @param {chrome.runtime.MessageSender} sender
   * @param {(response: unknown) => void} respond
   */
  function listener(message, sender, respond) {
    if (message?.namespace !== 'cheese-knife-settings') return false;
    const validated = contract.validateRequest(message, sender, chromeApi.runtime.id, path => chromeApi.runtime.getURL(path));
    const requestId = typeof message.requestId === 'string' && message.requestId.length <= 128 ? message.requestId : undefined;
    // The receiver may disappear after a durable commit. Never roll it back
    // or let a closed response channel become an unhandled worker failure.
    /** @param {unknown} result */
    const deliver = result => { try { respond(result); } catch {} };
    /** @param {string} stage @param {string} code */
    const replyError = (stage, code) => ({ ok: false, requestId, stored: false, reloaded: false, css: { ...css }, stage, code });
    if (!validated.ok) { deliver(replyError('validation', validated.code)); return true; }
    const ready = initialize();
    void enqueue(async () => {
      try { await ready; } catch (error) { throw fault('initialization', /** @type {KnifeCodedError} */ (error).code || 'initialization-failed'); }
      return execute(validated.request);
    }).then(deliver, error => deliver(replyError(/** @type {KnifeCodedError} */ (error).stage || 'read', /** @type {KnifeCodedError} */ (error).code || 'settings-operation-failed')));
    return true;
  }
  return { listener, initialize, invalidateStyles };
};

var createSettingsBroker = (chromeApi: typeof chrome) => {
  const contract = KnifeSettingsContract;
  const keys = ['config', 'styles', 'styleParameters', 'settingsRevision', 'mediaProfiles'];
  const gainAuthority = createPlayerGainAuthority();
  const jobs: KnifeJob[] = []; let running = false, boot: Promise<unknown> | undefined, initFailure: unknown;
  let css: KnifeCssState = { state: 'pending', code: null }, lastFailedCss: string | undefined;
  let stylesDirty = false, stylesQueued = false, stylesRetry = false;
  const fault = (stage: string, code: string): KnifeCodedError => Object.assign(new Error(code), { stage, code });
  const record = (value: unknown): KnifeUnknownRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as KnifeUnknownRecord : {};
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  function enqueue(work: () => Promise<unknown>): Promise<unknown> {
    if (running && jobs.length >= 64) return Promise.reject(fault('busy', 'settings-busy'));
    const result = new Promise<unknown>((resolve, reject) => jobs.push({ work, resolve, reject }));
    void drain(); return result;
  }
  async function drain() {
    if (running) return;
    running = true;
    while (jobs.length) {
      const job = jobs.shift() as KnifeJob;
      try { job.resolve(await job.work()); } catch (error) { job.reject(error); }
      scheduleStyles();
    }
    running = false;
  }
  async function read(includeLegacy = false): Promise<KnifeUnknownRecord> {
    try { return await chromeApi.storage.local.get(includeLegacy ? [...keys, 't'] : keys) as KnifeUnknownRecord; }
    catch { throw fault('read', 'storage-read-failed'); }
  }
  async function write(changes: KnifeUnknownRecord, raw: KnifeUnknownRecord) {
    gainAuthority.beforeWrite(raw, changes);
    try { await chromeApi.storage.local.set(changes); }
    catch { gainAuthority.writeFailed(raw, changes); throw fault('write', 'storage-write-failed'); }
  }
  async function applyStyles(raw: KnifeUnknownRecord, force = false) {
    const files = contract.cssFiles(raw.styles), fingerprint = JSON.stringify(files);
    try {
      const [existing] = await chromeApi.scripting.getRegisteredContentScripts({ ids: ['styles'] });
      const desired: chrome.scripting.RegisteredContentScript = {
        id: 'styles', matches: [...KnifeHostPolicy.origins], css: files, runAt: 'document_start',
      };
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
      let raw: KnifeUnknownRecord;
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
  function invalidateStyles(options: { retry?: boolean } = {}) {
    stylesDirty = true;
    if (options.retry === true) stylesRetry = true;
    scheduleStyles();
  }
  function initialize(): Promise<unknown> {
    if (boot) return boot;
    boot = enqueue(async () => {
      const raw = await read(true), revision = contract.readRevision(raw.settingsRevision);
      const config = { ...record(raw.config) }, styles = Array.isArray(raw.styles) ? [...raw.styles] : [];
      if (config.resizeChat) { delete config.resizeChat; if (!styles.includes('chat-resize')) styles.push('chat-resize'); }
      if (raw.t != null) {
        const sharpness = Number(raw.t);
        if (contract.validateOperations([{ type: 'config', id: 'sharpness', value: sharpness }]).ok) config.sharpness = sharpness;
      }
      const changes: KnifeUnknownRecord = {};
      if (!equal(config, record(raw.config))) changes.config = config;
      if (!equal(styles, Array.isArray(raw.styles) ? raw.styles : [])) changes.styles = styles;
      if (Object.keys(changes).length) { changes.settingsRevision = revision + 1; await write(changes, raw); }
      if (Object.hasOwn(raw, 't')) {
        try { await chromeApi.storage.local.remove('t'); }
        catch { throw fault('initialization', 'legacy-cleanup-failed'); }
      }
      await applyStyles({ ...raw, ...changes }, true);
    });
    void boot.catch(error => { initFailure = error; });
    return boot;
  }
  async function execute(request: KnifeSettingsRequest) {
    const raw = await read();
    let revision: number;
    try { revision = contract.readRevision(raw.settingsRevision); }
    catch (error) { throw fault('read', (error as KnifeCodedError).code); }
    if (request.action === 'get-snapshot') return { ok: true, requestId: request.requestId, snapshot: contract.makeSnapshot(raw, css) };
    if (request.action === 'patch') {
      const result = contract.mergeOperations(raw, request.operations);
      if (Object.keys(result.changes).length) await write(result.changes, raw);
      if (result.stylesTouched) await applyStyles({ ...raw, ...result.changes }, true);
      const failed = result.stylesTouched && css.state === 'failed';
      return { ok: !failed, requestId: request.requestId, revision: result.revision, stored: true,
        css: { ...css }, stage: failed ? 'css' : null, code: failed ? css.code : null };
    }
    await applyStyles(raw);
    if (css.state !== 'ready') throw fault('css', css.code || 'style-registration-failed');
    let tab: chrome.tabs.Tab;
    try { tab = await chromeApi.tabs.get(request.targetTabId); }
    catch { throw fault('target', 'target-missing'); }
    try { if (new URL(tab.url as string).origin !== 'https://chzzk.naver.com') throw new Error(); }
    catch { throw fault('target', 'target-origin-changed'); }
    if (tab.windowId !== request.targetWindowId) throw fault('target', 'target-window-changed');
    try { await chromeApi.tabs.reload(request.targetTabId); }
    catch { throw fault('reload', 'target-reload-failed'); }
    return { ok: true, requestId: request.requestId, revision, reloaded: true,
      appliedStyles: contract.makeSnapshot(raw, css).styles, css: { ...css }, stage: null, code: null };
  }

  async function mediaContext(sender: chrome.runtime.MessageSender, tabOnly = false): Promise<boolean> {
    if (!sender.documentId || typeof chromeApi.runtime.getContexts !== 'function') throw fault('sender', 'sender-context-unavailable');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const contexts = await Promise.race([
        chromeApi.runtime.getContexts({ documentIds: [sender.documentId] }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(fault('sender', 'sender-context-unavailable')), 2000); }),
      ]);
      const context = contexts.length === 1 ? contexts[0] : undefined;
      if (!context || context.documentId !== sender.documentId || context.documentUrl !== sender.url ||
        context.documentOrigin !== chromeApi.runtime.getURL('').replace(/\/$/, '') ||
        typeof context.incognito !== 'boolean' ||
        !(context.contextType === 'TAB' && context.frameId === 0 || !tabOnly && context.contextType === 'POPUP' && [0, -1].includes(context.frameId))) {
        throw fault('sender', 'sender-context-unavailable');
      }
      return context.incognito;
    } catch { throw fault('sender', 'sender-context-unavailable'); }
    finally { if (timer !== undefined) clearTimeout(timer); }
  }
  async function mediaTarget(selection: KnifeMediaSelection): Promise<boolean> {
    if (selection.kind !== 'current') return false;
    let tab: chrome.tabs.Tab;
    try { tab = await chromeApi.tabs.get(selection.tabId); }
    catch { throw fault('target', 'target-missing'); }
    if (tab.id !== selection.tabId || tab.windowId !== selection.windowId) throw fault('target', 'target-window-changed');
    let url: URL;
    try { url = new URL(tab.url as string); }
    catch { throw fault('target', 'target-origin-changed'); }
    if (url.origin !== 'https://chzzk.naver.com') throw fault('target', 'target-origin-changed');
    const channel = /^\/(?:live\/)?([a-f0-9]{32})\/?$/i.exec(url.pathname)?.[1]?.toLowerCase();
    if (channel !== selection.channelId) throw fault('target', 'target-channel-changed');
    if (typeof tab.incognito !== 'boolean') throw fault('target', 'target-context-unavailable');
    return tab.incognito;
  }
  function mediaSnapshot(raw: KnifeUnknownRecord, selection: KnifeMediaSelection, incognito: boolean): KnifeMediaSnapshot {
    const global = contract.makeSnapshot(raw, css), read = KnifeMediaProfiles.readLegacyStore(raw.mediaProfiles);
    const channelId = selection.kind === 'global' ? null : selection.channelId;
    const resolved = KnifeMediaProfiles.resolveLegacyMediaSettings(global.config, read, { channelId, topFrame: true, incognito });
    const domainValues = (domain: KnifeMediaDomain) => KnifeMediaProfiles.validateValues(domain, Object.fromEntries(
      (domain === 'audio' ? KnifeMediaProfiles.audioFields : KnifeMediaProfiles.videoFields).map(field => [field.id, resolved.effectiveConfig[field.id]])));
    const audio = domainValues('audio'), video = domainValues('video');
    if (!audio.ok || audio.domain !== 'audio' || !video.ok || video.domain !== 'video') throw fault('read', 'invalid-media-values');
    const store = read.state === 'valid' || read.state === 'absent' ? read.store : null;
    return { selection, version: { globalRevision: global.revision, mediaRevision: store?.revision ?? null },
      profileState: resolved.profileState, code: store ? null : read.state === 'invalid' || read.state === 'unsupported' ? read.code : null,
      canWrite: !!store && !incognito, values: { audio: audio.values, video: video.values }, store,
      channel: incognito ? null : store?.channels.find(item => item.channelId === channelId) ?? null };
  }
  async function executeMedia(request: KnifeMediaRequest, sender: chrome.runtime.MessageSender): Promise<KnifeMediaReply> {
    const selection: KnifeMediaSelection = 'selection' in request ? request.selection : { kind: 'global' };
    const checkContext = async () => (await mediaContext(sender)) || (await mediaTarget(selection));
    const incognito = await checkContext();
    let raw: KnifeUnknownRecord;
    try { raw = await chromeApi.storage.local.get(keys) as KnifeUnknownRecord; }
    catch { throw fault('read', 'storage-read-failed'); }
    let snapshot = mediaSnapshot(raw, selection, incognito);
    if (request.action !== 'get-media-snapshot') {
      if (incognito) throw fault('sender', 'incognito-media-disabled');
      const read = KnifeMediaProfiles.readLegacyStore(raw.mediaProfiles);
      if (read.state !== 'valid' && read.state !== 'absent') throw fault('media', read.code);
      const global = contract.makeSnapshot(raw, css);
      const merged = KnifeMediaProfiles.mergeMediaOperation(read.store, request, { config: global.config, revision: global.revision });
      if (!merged.ok) throw fault('media', merged.code);
      if (await checkContext()) throw fault('sender', 'incognito-media-disabled');
      if (merged.globalOperations) {
        const result = contract.mergeOperations(raw, merged.globalOperations);
        if (Object.keys(result.changes).length) await write(result.changes, raw);
        if (result.stylesTouched) await applyStyles({ ...raw, ...result.changes }, true);
        raw = { ...raw, ...result.changes };
      } else if (merged.changed) {
        await write({ mediaProfiles: merged.nextStore }, raw); raw = { ...raw, mediaProfiles: merged.nextStore };
      }
      snapshot = mediaSnapshot(raw, selection, false);
    }
    return { protocol: 2, ok: true, requestId: request.requestId, stored: request.action !== 'get-media-snapshot',
      snapshot, version: snapshot.version, profileState: snapshot.profileState, stage: null, code: null };
  }

  function mediaSnapshotV3(raw: KnifeUnknownRecord, selection: KnifeMediaSelection, incognito: boolean): KnifeMediaSnapshotV3 {
    const global = contract.makeSnapshot(raw, css), read = KnifeMediaProfiles.readStore(raw.mediaProfiles);
    const channelId = selection.kind === 'global' ? null : selection.channelId;
    const resolved = KnifeMediaProfiles.resolveMediaSettings({ ...global.config, ...record(raw.config) } as Record<string, KnifeScalar>, read,
      { channelId, topFrame: true, incognito });
    const store = read.state === 'valid' || read.state === 'absent' ? read.store : null;
    const channel = incognito ? null : store?.channels.find(item => item.channelId === channelId) ?? null;
    const audio = channel?.audio ? store!.schema === 1
      ? KnifeMediaProfiles.projectAudioV2((channel as KnifeChannelRecord).audio!.values)
      : (channel as KnifeChannelRecordV2).audio!.values
      : KnifeMediaProfiles.projectGlobalAudio(record(raw.config) as Record<string, KnifeScalar>);
    const video = KnifeMediaProfiles.validateValues('video', Object.fromEntries(KnifeMediaProfiles.videoFields.map(field =>
      [field.id, resolved.effectiveConfig[field.id]])));
    if (!video.ok || video.domain !== 'video') throw fault('read', 'invalid-media-values');
    return { selection, version: { globalRevision: global.revision, mediaRevision: store?.revision ?? null },
      profileState: resolved.profileState, gainOrigin: resolved.gainOrigin,
      code: store ? store.schema === 1 ? 'media-upgrade-required' : null : read.state === 'invalid' || read.state === 'unsupported' ? read.code : null,
      canWrite: !!store && store.schema === 2 && !incognito, values: { audio, video: video.values }, store, channel };
  }
  async function nativeCall<T>(work: () => Promise<T>, deadline: number): Promise<T> {
    const remaining = Math.min(2000, deadline - Date.now());
    if (remaining <= 0) throw fault('target', 'native-read-timeout');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(fault('target', 'native-read-timeout')), remaining);
    })]); } finally { if (timer !== undefined) clearTimeout(timer); }
  }
  async function legacyGain(selection: Extract<KnifeMediaSelection, { kind: 'current' }>): Promise<KnifeLegacyGainRead> {
    const deadline = Date.now() + 4000;
    if (await nativeCall(() => mediaTarget(selection), deadline)) throw fault('target', 'incognito-media-disabled');
    const before = await nativeCall(() => chromeApi.tabs.get(selection.tabId), deadline);
    const probe = async () => {
      const result = await nativeCall(() => chromeApi.scripting.executeScript({ target: { tabId: selection.tabId, frameIds: [0] }, world: 'ISOLATED', func: fixedLegacyGainRead }), deadline);
      const row = result.length === 1 ? result[0] : undefined, value = row?.result;
      if (!row || row.frameId !== 0 || typeof row.documentId !== 'string' || !row.documentId.length || row.documentId.length > 128 ||
          !value || value.url !== before.url || !['valid', 'fallback'].includes(value.state) ||
          typeof value.value !== 'number' || !Number.isFinite(value.value) || value.value < 0 || value.value > 2) throw fault('target', 'legacy-read-unavailable');
      return { value: value.value, state: value.state as 'valid' | 'fallback', documentId: row.documentId,
        tabId: selection.tabId, windowId: selection.windowId, url: value.url };
    };
    const first = await probe(), second = await probe();
    if (first.documentId !== second.documentId) throw fault('target', 'legacy-document-changed');
    if (first.value !== second.value || first.state !== second.state) throw fault('target', 'conflict');
    const after = await nativeCall(() => chromeApi.tabs.get(selection.tabId), deadline);
    if (after.id !== before.id || after.windowId !== before.windowId || after.url !== before.url || after.incognito !== false) throw fault('target', 'target-context-changed');
    return second;
  }
  function globalMediaChanges(raw: KnifeUnknownRecord, domain: KnifeMediaDomain, patch: unknown, direct = true): KnifeUnknownRecord {
    const snapshot = mediaSnapshotV3(raw, { kind: 'global' }, false);
    const previous = domain === 'audio' ? snapshot.values.audio : snapshot.values.video;
    const updates = record(patch);
    const values = { ...previous, ...updates, ...(direct && domain === 'audio' && Object.hasOwn(updates, 'audioGain') ? { gainInherited: false } : {}) };
    const checked = domain === 'audio' ? KnifeMediaProfiles.validateAudioV2(values) : KnifeMediaProfiles.validateValues('video', values);
    if (!checked.ok) throw fault('validation', 'invalid-values');
    const config = { ...record(raw.config) };
    for (const [id, value] of Object.entries(updates)) Object.defineProperty(config, id === 'audioDefault' ? 'compressorDefault' : id,
      { value, enumerable: true, configurable: true, writable: true });
    if (direct && domain === 'audio' && Object.hasOwn(updates, 'audioGain')) config.gainInherited = false;
    if (equal(config, record(raw.config))) return {};
    return { config, settingsRevision: contract.readRevision(raw.settingsRevision) + 1 };
  }
  async function executeMediaV3(request: KnifeMediaRequestV3, sender: chrome.runtime.MessageSender): Promise<KnifeMediaReplyV3> {
    const selection: KnifeMediaSelection = 'selection' in request ? request.selection : { kind: 'global' };
    const checkContext = async () => (await mediaContext(sender, true)) || (await mediaTarget(selection));
    const incognito = await checkContext();
    let raw = await read(), snapshot = mediaSnapshotV3(raw, selection, incognito);
    const response = (stored: boolean): KnifeMediaReplyV3 => {
      const current = mediaSnapshotV3(raw, selection, incognito);
      return { protocol: 3, ok: true, requestId: request.requestId, stored, snapshot: current,
        version: current.version, profileState: current.profileState, stage: null, code: null };
    };
    if (request.action === 'get-media-snapshot') return response(false);
    if (incognito) throw fault('sender', 'incognito-media-disabled');
    if (request.action === 'read-legacy-gain') return { ...response(false), legacyGain: await legacyGain(request.selection) };
    const readStore = KnifeMediaProfiles.readStore(raw.mediaProfiles);
    if (readStore.state !== 'valid' && readStore.state !== 'absent') throw fault('media', readStore.code);
    if (request.storeSchema !== readStore.store.schema) throw fault('media', 'conflict');
    let changes: KnifeUnknownRecord;
    if (request.action === 'upgrade-media-store') {
      const merged = KnifeMediaProfiles.upgradeMediaStore(raw.mediaProfiles, request.expectedMediaRevision);
      if (!merged.ok) throw fault('media', merged.code);
      changes = { mediaProfiles: merged.nextStore };
    } else {
      if (readStore.store.schema !== 2) throw fault('media', 'media-upgrade-required');
      if (request.action === 'create-preset' && request.domain === 'audio' && request.values.gainInherited) throw fault('media', 'preset-gain-unconfirmed');
      if (request.action === 'patch-global-fields') {
        if (contract.readRevision(raw.settingsRevision) !== request.expectedGlobalRevision) throw fault('media', 'conflict');
        changes = globalMediaChanges(raw, request.domain, request.patch);
      } else if (request.action === 'import-legacy-gain') {
        if (snapshot.version.globalRevision !== request.expectedGlobalRevision) throw fault('media', 'conflict');
        const fresh = await legacyGain(request.selection);
        if (fresh.documentId !== request.documentId) throw fault('target', 'legacy-document-changed');
        if (fresh.value !== request.value) throw fault('media', 'conflict');
        raw = await read();
        const latest = KnifeMediaProfiles.readStore(raw.mediaProfiles);
        if (contract.readRevision(raw.settingsRevision) !== request.expectedGlobalRevision ||
            latest.state !== 'valid' && latest.state !== 'absent' || latest.store.schema !== 2) throw fault('media', 'conflict');
        changes = globalMediaChanges(raw, 'audio', { audioGain: request.value });
      } else {
        const merged = KnifeMediaProfiles.mergeMediaOperationV2(readStore.store, request,
          { config: { ...snapshot.values.video, ...record(raw.config) } as Record<string, KnifeScalar>, revision: snapshot.version.globalRevision! });
        if (!merged.ok) throw fault('media', merged.code);
        changes = merged.globalValues && merged.domain ? globalMediaChanges(raw, merged.domain, merged.globalValues, false)
          : merged.changed ? { mediaProfiles: merged.nextStore } : {};
      }
    }
    if (await checkContext()) throw fault('sender', 'incognito-media-disabled');
    if (Object.keys(changes).length) await write(changes, raw);
    raw = { ...raw, ...changes }; snapshot = mediaSnapshotV3(raw, selection, false);
    return response(true);
  }
  function fixedLegacyGainRead() {
    try {
      const raw = localStorage.getItem('knifeGain');
      if (raw === null || !raw.trim()) return { url: location.href, value: 1, state: 'fallback' };
      if (raw.length > 64) return { url: location.href, value: null, state: 'invalid' };
      const value = Number(raw);
      return { url: location.href, value: Number.isFinite(value) && value >= 0 && value <= 2 ? value : null, state: 'valid' };
    } catch { return { url: location.href, value: null, state: 'unavailable' }; }
  }
  function fixedPlayerGainProbe(): { url: string; owned: boolean; bindingId: string; legacyValue: number | null;
      intent: { id: string; value: number } | null } | null {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, Symbol.for('cheese-knife.player-gain.private.v3'));
    if (!descriptor || typeof descriptor.get !== 'function') return null;
    // The getter belongs to the isolated owner and exposes only bounded probe facts.
    return descriptor.get.call(globalThis) as ReturnType<typeof fixedPlayerGainProbe>;
  }
  async function playerNative(sender: chrome.runtime.MessageSender, deadline: number) {
    const tabId = sender.tab!.id!, windowId = sender.tab!.windowId;
    const tab = await nativeCall(() => chromeApi.tabs.get(tabId), deadline);
    if (tab.id !== tabId || tab.windowId !== windowId || tab.url !== sender.url || tab.incognito !== false) throw fault('target', 'gain-context-changed');
    const rows = await nativeCall(() => chromeApi.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'ISOLATED', func: fixedPlayerGainProbe }), deadline);
    const row = rows.length === 1 ? rows[0] : undefined, probe = row?.result;
    if (!row || row.frameId !== 0 || row.documentId !== sender.documentId || !probe || probe.url !== tab.url || probe.owned !== true ||
        typeof probe.bindingId !== 'string' || !/^[a-zA-Z0-9:_-]{1,128}$/.test(probe.bindingId) ||
        probe.legacyValue !== null && (typeof probe.legacyValue !== 'number' || !Number.isFinite(probe.legacyValue) || probe.legacyValue < 0 || probe.legacyValue > 2) ||
        probe.intent !== null && (!probe.intent || typeof probe.intent.id !== 'string' || !/^[a-zA-Z0-9:_-]{1,128}$/.test(probe.intent.id) ||
          typeof probe.intent.value !== 'number' || !Number.isFinite(probe.intent.value) || probe.intent.value < 0 || probe.intent.value > 2)) throw fault('target', 'gain-probe-unavailable');
    const after = await nativeCall(() => chromeApi.tabs.get(tabId), deadline);
    if (after.id !== tabId || after.windowId !== windowId || after.url !== tab.url || after.incognito !== false) throw fault('target', 'gain-context-changed');
    return { native: { tabId, windowId, documentId: sender.documentId!, route: tab.url!, bindingId: probe.bindingId, legacyValue: probe.legacyValue }, intent: probe.intent };
  }
  async function executeGain(request: KnifeGainRequest, sender: chrome.runtime.MessageSender) {
    const deadline = Date.now() + 4000;
    const current = await playerNative(sender, deadline); let raw = await read();
    const reply = (view: KnifeGainView, stored: boolean) => ({ protocol: 3, ok: true, requestId: request.requestId, stored, view,
      ...(request.action === 'set-gain' ? { intentId: request.intentId } : {}) });
    if (request.action === 'get-gain-view') {
      const view = gainAuthority.view(current.native, raw);
      if (!view.ok) throw fault('gain', view.code);
      return reply(view, false);
    }
    if (!current.intent || current.intent.id !== request.intentId || current.intent.value !== request.value) throw fault('gain', 'gain-intent-mismatch');
    const checked = gainAuthority.begin(request.ticket, current.native, raw, request.intentId, request.value);
    if (!checked.ok) throw fault('gain', checked.code);
    try {
      const final = await playerNative(sender, deadline);
      raw = await read();
      if (!final.intent || final.intent.id !== request.intentId || final.intent.value !== request.value ||
          !gainAuthority.check(request.ticket, final.native, raw).ok) throw fault('gain', 'gain-context-changed');
      let changes: KnifeUnknownRecord;
      if (checked.state.token) {
        const readStore = KnifeMediaProfiles.readStore(raw.mediaProfiles);
        if (readStore.state !== 'valid' || readStore.store.schema !== 2) throw fault('gain', 'gain-conflict');
        const merged = KnifeMediaProfiles.mergeMediaOperationV2(readStore.store, { action: 'patch-channel-fields',
          selection: { kind: 'saved', channelId: checked.state.token.channelId }, channelToken: checked.state.token,
          domain: 'audio', patch: { audioGain: request.value, gainInherited: false } },
          { config: record(raw.config) as Record<string, KnifeScalar>, revision: checked.state.version.globalRevision });
        if (!merged.ok) throw fault('gain', merged.code);
        changes = merged.changed ? { mediaProfiles: merged.nextStore } : {};
      } else changes = globalMediaChanges(raw, 'audio', { audioGain: request.value });
      if (Object.keys(changes).length) await write(changes, raw);
      gainAuthority.finish(request.ticket, true);
      const view = gainAuthority.view(final.native, { ...raw, ...changes });
      if (!view.ok) throw fault('gain', view.code);
      return reply(view, true);
    } catch (error) { gainAuthority.finish(request.ticket, false); throw error; }
  }

  function listener(message: unknown, sender: chrome.runtime.MessageSender, respond: (response: unknown) => void) {
    const namespace = (message as KnifeUnknownRecord | null | undefined)?.namespace;
    if (namespace !== 'cheese-knife-settings' && namespace !== 'cheese-knife-player-gain') return false;
    const gain = namespace === 'cheese-knife-player-gain';
    const modern = (message as KnifeUnknownRecord).protocol === 3;
    const media = modern || (message as KnifeUnknownRecord).protocol === 2;
    const validated = gain ? contract.validateGainRequest(message, sender, chromeApi.runtime.id)
      : modern ? contract.validateMediaRequestV3(message, sender, chromeApi.runtime.id, path => chromeApi.runtime.getURL(path))
      : media ? contract.validateMediaRequest(message, sender, chromeApi.runtime.id, path => chromeApi.runtime.getURL(path))
      : contract.validateRequest(message, sender, chromeApi.runtime.id, path => chromeApi.runtime.getURL(path));
    const requestId = typeof (message as KnifeUnknownRecord).requestId === 'string' && ((message as KnifeUnknownRecord).requestId as string).length <= 128 ? (message as KnifeUnknownRecord).requestId : undefined;
    // A closed response channel after a durable commit must not roll it back or fail the worker.
    const deliver = (result: unknown) => { try { respond(result); } catch {} };
    const replyError = (stage: string, code: string) => media ? { protocol: modern ? 3 : 2, ok: false, requestId, stored: false, stage, code }
      : { ok: false, requestId, stored: false, reloaded: false, css: { ...css }, stage, code };
    if (!validated.ok) { deliver(replyError('validation', validated.code)); return true; }
    const ready = initialize();
    void enqueue(async () => {
      try { await ready; } catch (error) { throw fault('initialization', (error as KnifeCodedError).code || 'initialization-failed'); }
      return validated.request.namespace === 'cheese-knife-player-gain' ? executeGain(validated.request, sender)
        : validated.request.protocol === 3 ? executeMediaV3(validated.request, sender)
        : validated.request.protocol === 2 ? executeMedia(validated.request, sender) : execute(validated.request);
    }).then(deliver, error => deliver(replyError((error as KnifeCodedError).stage || 'read', (error as KnifeCodedError).code || 'settings-operation-failed')));
    return true;
  }
  return { listener, initialize, invalidateStyles, observeGainChanges: gainAuthority.observe,
    retireGainTab: gainAuthority.retireTab, retireGainActors: gainAuthority.retireAll };
};

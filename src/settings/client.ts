var createSettingsClient = (chromeApi: typeof chrome) => {
  const dirty = new Map<string, KnifePendingEntry>(), confirmed = new Map<string, KnifeConfirmedEntry>(), subscribers = new Set<(view: KnifeSettingsView) => void>();
  let snapshot: KnifeSettingsSnapshot | null = null, css: KnifeCssState = { state: 'pending', code: null }, phase: KnifePhase = 'loading', code: string | null | undefined = null;
  let disposed = false, generation = 0, epoch = 0, snapshotSequence = 0;
  const transport = createSettingsRequestTransport(chromeApi);
  let mutation: KnifeTransport | null = null, reading: Promise<void> | null = null, readWanted = false, failurePhase: KnifePhase | null = null, acceptedReads = 0;
  const key = (op: KnifeSettingsOperation) => `${op.type}:${op.id}`;
  const fault = (value: string): KnifeCodedError => Object.assign(new Error(value), { code: value });
  const isRecord = (value: unknown): value is KnifeUnknownRecord => typeof value === 'object' && value !== null && !Array.isArray(value);
  const isCssState = (value: unknown): value is KnifeCssState => isRecord(value) &&
    ['pending', 'ready', 'failed'].includes(value.state as string) &&
    (value.code === null || typeof value.code === 'string');
  const isValueRecord = (value: unknown, accept: (entry: unknown) => boolean) => isRecord(value) && Object.values(value).every(accept);
  const isSnapshot = (value: unknown): value is KnifeSettingsSnapshot => isRecord(value) &&
    Number.isSafeInteger(value.revision) && (value.revision as number) >= 0 &&
    isValueRecord(value.config, entry => typeof entry === 'boolean' || typeof entry === 'number' && Number.isFinite(entry)) &&
    Array.isArray(value.styles) && value.styles.every(entry => typeof entry === 'string') &&
    isValueRecord(value.styleParameters, entry => typeof entry === 'number' && Number.isFinite(entry)) && isCssState(value.css);

  const validateReply = (action: KnifeSettingsAction, value: unknown, requestId: string): KnifeSettingsReply | null => {
    if (!isRecord(value) || value.requestId !== requestId || typeof value.ok !== 'boolean') return null;
    if (value.code !== undefined && value.code !== null && typeof value.code !== 'string') return null;
    if (value.stage !== undefined && value.stage !== null && typeof value.stage !== 'string') return null;
    if (value.stored !== undefined && typeof value.stored !== 'boolean') return null;
    if (value.reloaded !== undefined && typeof value.reloaded !== 'boolean') return null;
    if (value.revision !== undefined && (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0)) return null;
    if (value.snapshot !== undefined && !isSnapshot(value.snapshot)) return null;
    if (value.css !== undefined && !isCssState(value.css)) return null;
    if (value.appliedStyles !== undefined && (!Array.isArray(value.appliedStyles) || !value.appliedStyles.every(entry => typeof entry === 'string'))) return null;
    if (!value.ok && typeof value.code !== 'string') return null;
    if (action === 'get-snapshot' && value.ok && !isSnapshot(value.snapshot)) return null;
    if (action === 'patch' && (value.ok || value.stored === true) &&
      (value.stored !== true || !Number.isSafeInteger(value.revision) || !isCssState(value.css))) return null;
    if (action === 'reload-target' && value.ok &&
      (value.reloaded !== true || !Number.isSafeInteger(value.revision) || !isCssState(value.css) ||
        !Array.isArray(value.appliedStyles) || !value.appliedStyles.every(entry => typeof entry === 'string'))) return null;
    return value as KnifeSettingsReply;
  };

  function view(): KnifeSettingsView {
    const base = snapshot || KnifeSettingsContract.makeSnapshot({}, css);
    const raw = { config: base.config, styles: base.styles, styleParameters: base.styleParameters, settingsRevision: base.revision };
    const operations = [...confirmed.values(), ...dirty.values()].map(entry => entry.op);
    // Render with writer semantics without promoting a partial acknowledgement to a snapshot.
    const merged = { ...raw, ...KnifeSettingsContract.mergeOperations(raw, operations).changes } as typeof raw;
    return { snapshot, values: { config: merged.config, styles: merged.styles, styleParameters: merged.styleParameters },
      phase, css: { ...css }, pendingKeys: [...dirty.keys()], code };
  }
  function emit() {
    if (disposed) return;
    const value = view(); for (const subscriber of subscribers) subscriber(value);
  }
  function updatePhase() {
    if (failurePhase === 'repair-required') phase = 'repair-required';
    else if (mutation || [...dirty.values()].some(entry => entry.status === 'pending')) phase = 'saving';
    else if ([...dirty.values()].some(entry => entry.status === 'unknown')) phase = 'unknown';
    else if ([...dirty.values()].some(entry => entry.status === 'held')) phase = 'failed';
    else phase = failurePhase || (snapshot ? 'ready' : 'loading');
  }

  function send(action: KnifeSettingsAction, payload: KnifeUnknownRecord = {}): KnifeTransport {
    return transport.send(1, action, payload, validateReply);
  }

  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve();
    readWanted = true;
    if (reading) return reading;
    reading = (async () => {
      while (readWanted && !disposed) {
        readWanted = false;
        const started = epoch;
        try {
          const { reply, requestSequence } = await send('get-snapshot').promise;
          if (disposed) return;
          if (started !== epoch) { readWanted = true; continue; }
          if (!reply.ok) throw fault(reply.code || 'read-failed');
          const next = reply.snapshot;
          KnifeSettingsContract.readRevision(next?.revision);
          if (!next || !next.config || !Array.isArray(next.styles) || !next.styleParameters || !next.css) throw fault('read-failed');
          if (snapshot && next.revision < snapshot.revision) continue;
          snapshot = next; snapshotSequence = requestSequence; css = { ...next.css }; acceptedReads++;
          for (const [id, entry] of confirmed) if (entry.revision <= next.revision) confirmed.delete(id);
          updatePhase(); emit(); flush();
        } catch (error) {
          if (disposed) return;
          code = (error as KnifeCodedError).code || 'read-failed';
          failurePhase = code === 'revision-invalid' || code === 'revision-exhausted' ? 'repair-required' :
            code === 'response-unknown' ? 'unknown' : 'failed';
          updatePhase(); emit();
        }
      }
    })().finally(() => { reading = null; });
    return reading;
  }

  function acceptAck(reply: KnifeSettingsReply, entries: [string, KnifePendingEntry][], requestSequence: number) {
    if (!reply.stored) return false;
    if (typeof reply.revision !== 'number' || !Number.isSafeInteger(reply.revision) || reply.revision < 0) throw fault('response-unknown');
    for (const [id, entry] of entries) {
      if (dirty.get(id)?.generation !== entry.generation) continue;
      dirty.delete(id);
      if (!snapshot || snapshot.revision < reply.revision) confirmed.set(id, { op: entry.op, revision: reply.revision });
    }
    if ((!snapshot || snapshot.revision < reply.revision ||
      (snapshot.revision === reply.revision && snapshotSequence < requestSequence)) && reply.css) css = { ...reply.css };
    return true;
  }

  async function mutate(action: KnifeSettingsAction, payload: KnifeUnknownRecord, entries: [string, KnifePendingEntry][] = []) {
    const transport = send(action, payload);
    mutation = transport; updatePhase(); emit();
    try {
      const { reply, requestSequence } = await transport.promise;
      if (disposed) throw fault('disposed');
      const stored = action === 'patch' && acceptAck(reply, entries, requestSequence);
      if (!reply.ok && !stored) {
        for (const entry of dirty.values()) entry.status = 'held';
        code = reply.code || 'write-failed'; failurePhase = 'failed';
      } else {
        code = reply.revision === Number.MAX_SAFE_INTEGER ? 'revision-exhausted' : reply.ok ? null : reply.code;
        failurePhase = reply.revision === Number.MAX_SAFE_INTEGER ? 'repair-required' : null;
      }
      epoch++; void refresh();
      return reply;
    } catch (error) {
      if (!disposed) {
        for (const entry of dirty.values()) entry.status = 'unknown';
        code = (error as KnifeCodedError).code || 'response-unknown'; failurePhase = 'unknown'; epoch++; void refresh();
      }
      throw error;
    } finally {
      if (!disposed) { mutation = null; updatePhase(); emit(); flush(); }
    }
  }

  function flush() {
    if (disposed || mutation || !snapshot) return;
    const entries = [...dirty].filter(([, entry]) => entry.status === 'pending').slice(0, 64);
    if (!entries.length) return;
    for (const [, entry] of entries) entry.status = 'sent';
    void mutate('patch', { operations: entries.map(([, entry]) => entry.op) }, entries).catch(() => {});
  }
  function edit(operation: KnifeSettingsOperation) {
    if (disposed || phase === 'repair-required') return;
    const validation = KnifeSettingsContract.validateOperations([operation]);
    if (!validation.ok) { code = validation.code; phase = 'failed'; emit(); return; }
    const op = validation.operations[0] as KnifeSettingsOperation;
    dirty.set(key(op), { op, generation: ++generation, status: 'pending' });
    epoch++; code = null; failurePhase = null; updatePhase(); emit(); flush();
  }
  function available() {
    if (disposed || !snapshot || mutation || dirty.size || phase === 'unknown' || phase === 'repair-required') throw fault('settings-not-ready');
  }
  async function retryStyles() {
    available(); return mutate('patch', { operations: [] });
  }
  async function reloadTarget({ tabId, windowId }: { tabId: number; windowId: number }) {
    available();
    if (phase !== 'ready' || css.state !== 'ready' || ![tabId, windowId].every(id => Number.isSafeInteger(id) && id >= 0)) throw fault('settings-not-ready');
    return mutate('reload-target', { targetTabId: tabId, targetWindowId: windowId });
  }
  async function discardPending() {
    if (disposed) return;
    // Discard display intent only; a sent request may still commit and is not rolled back.
    const before = acceptedReads;
    dirty.clear(); confirmed.clear(); epoch++; updatePhase(); emit(); await refresh();
    if (!disposed && acceptedReads > before) { failurePhase = null; code = null; updatePhase(); emit(); }
  }
  const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !['config', 'styles', 'styleParameters', 'settingsRevision'].some(id => Object.hasOwn(changes, id))) return;
    epoch++; void refresh();
  };
  chromeApi.storage.onChanged.addListener(onChanged);
  void refresh();
  return {
    subscribe(fn: (view: KnifeSettingsView) => void) { if (disposed) return () => {}; subscribers.add(fn); fn(view()); return () => subscribers.delete(fn); },
    edit, refresh, retryStyles, reloadTarget, discardPending,
    dispose() { if (disposed) return; disposed = true;
      try { chromeApi.storage.onChanged.removeListener(onChanged); }
      finally { subscribers.clear(); transport.dispose(); } },
  };
};

type KnifeMediaCall = KnifeMediaMutation | { action: 'get-media-snapshot'; selection: KnifeMediaSelection };
type KnifeMediaTransport = { promise: Promise<{ reply: KnifeMediaReply; requestSequence: number }>; requestSequence: number; cancel: () => void };
type KnifeMediaCallV3<T = KnifeMediaRequestV3> = T extends KnifeMediaRequestV3 ? Omit<T, 'namespace' | 'protocol' | 'requestId'> : never;
type KnifeMediaTransportV3 = { promise: Promise<{ reply: KnifeMediaReplyV3; requestSequence: number }>; requestSequence: number; cancel: () => void };
type KnifeGlobalReplyValidator = (action: KnifeSettingsAction, value: unknown, requestId: string) => KnifeSettingsReply | null;
type KnifeMediaView = { selection: KnifeMediaSelection; snapshot: KnifeMediaSnapshot | null;
  values: { audio: KnifeAudioValues; video: KnifeVideoValues }; phase: KnifeMediaPhase; pendingKeys: string[];
  pendingRequest: KnifeMediaMutation | null; pendingValues: KnifeMediaValues | null; code: string | null };

var createSettingsRequestTransport = (chromeApi: typeof chrome) => {
  const pending = new Set<() => void>(); let sequence = 0, disposed = false;
  function send(protocol: 1, action: KnifeSettingsAction, payload: KnifeUnknownRecord, validate: KnifeGlobalReplyValidator): KnifeTransport & { cancel: () => void };
  function send(protocol: 2, request: KnifeMediaCall): KnifeMediaTransport;
  function send(protocol: 3, request: KnifeMediaCallV3): KnifeMediaTransportV3;
  function send(protocol: 1 | 2 | 3, action: KnifeSettingsAction | KnifeMediaCall | KnifeMediaCallV3, payload: KnifeUnknownRecord = {}, validate?: KnifeGlobalReplyValidator) {
    const requestId = `settings-${++sequence}`, requestSequence = sequence;
    const request = protocol === 1 ? { namespace: 'cheese-knife-settings', protocol, action, requestId, ...payload }
      : { namespace: 'cheese-knife-settings', protocol, requestId, ...action as KnifeMediaCall | KnifeMediaCallV3 };
    let cancel = () => {};
    const promise = new Promise<{ reply: KnifeSettingsReply | KnifeMediaReply | KnifeMediaReplyV3; requestSequence: number }>((resolve, reject) => {
      let ended = false;
      const finish = (code: string | null, reply?: KnifeSettingsReply | KnifeMediaReply | KnifeMediaReplyV3) => {
        if (ended) return; ended = true; clearTimeout(timer); pending.delete(cancel);
        if (code) reject(Object.assign(new Error(code), { code }));
        else if (reply) resolve({ reply, requestSequence });
      };
      cancel = () => finish('disposed');
      const timer = setTimeout(() => finish('response-unknown'), 10000); pending.add(cancel);
      if (disposed) { cancel(); return; }
      try {
        chromeApi.runtime.sendMessage(request, (value: unknown) => {
          if (chromeApi.runtime.lastError) { finish('response-unknown'); return; }
          const reply = protocol === 1 ? validate?.(action as KnifeSettingsAction, value, requestId)
            : protocol === 3 ? validateMediaReplyV3(action as KnifeMediaCallV3, value, requestId)
            : validateMediaReply(action as KnifeMediaCall, value, requestId);
          if (!reply) finish('response-unknown'); else finish(null, reply);
        });
      } catch { finish('response-unknown'); }
    });
    return { promise, requestSequence, cancel };
  }
  return { send, dispose() { disposed = true; for (const cancel of [...pending]) cancel(); } };
};

function validateMediaReplyV3(request: KnifeMediaCallV3, value: unknown, requestId: string): KnifeMediaReplyV3 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const reply = value as KnifeMediaReplyV3;
  if (reply.protocol !== 3 || reply.requestId !== requestId || typeof reply.ok !== 'boolean' || typeof reply.stored !== 'boolean' ||
      reply.code !== undefined && reply.code !== null && typeof reply.code !== 'string' ||
      reply.stage !== undefined && reply.stage !== null && typeof reply.stage !== 'string') return null;
  if (!reply.ok) return typeof reply.code === 'string' && !reply.stored ? reply : null;
  const snapshot = reply.snapshot, readOnly = ['get-media-snapshot', 'read-legacy-gain'].includes(request.action);
  if (reply.stored === readOnly || !snapshot || !snapshot.version || !snapshot.values || !snapshot.selection ||
      typeof snapshot.canWrite !== 'boolean' || !(snapshot.code === null || typeof snapshot.code === 'string') ||
      !['global', 'scoped', 'repair-required'].includes(snapshot.profileState) ||
      !['site-legacy', 'global-owned', 'channel-owned'].includes(snapshot.gainOrigin)) return null;
  const selection = 'selection' in request ? request.selection : { kind: 'global' };
  if (JSON.stringify(snapshot.selection) !== JSON.stringify(selection) || !KnifeMediaProfiles.isCounter(snapshot.version.globalRevision) ||
      snapshot.version.mediaRevision !== null && !KnifeMediaProfiles.isCounter(snapshot.version.mediaRevision) ||
      !KnifeMediaProfiles.validateAudioV2(snapshot.values.audio).ok || !KnifeMediaProfiles.validateValues('video', snapshot.values.video).ok) return null;
  if (snapshot.store === null) {
    if (snapshot.profileState !== 'repair-required' || snapshot.version.mediaRevision !== null || snapshot.canWrite) return null;
  } else {
    const read = KnifeMediaProfiles.readStore(snapshot.store);
    if (read.state !== 'valid' || read.store.revision !== snapshot.version.mediaRevision || read.store.schema === 1 && snapshot.canWrite) return null;
    if (snapshot.channel !== null && !read.store.channels.some(channel => JSON.stringify(channel) === JSON.stringify(snapshot.channel))) return null;
  }
  if (JSON.stringify(reply.version) !== JSON.stringify(snapshot.version) || reply.profileState !== snapshot.profileState) return null;
  if (request.action === 'read-legacy-gain') {
    const legacy = reply.legacyGain;
    if (!legacy || !['valid', 'fallback'].includes(legacy.state) || !Number.isFinite(legacy.value) || legacy.value < 0 || legacy.value > 2 ||
        typeof legacy.documentId !== 'string' || !legacy.documentId.length || legacy.documentId.length > 128 ||
        legacy.tabId !== request.selection.tabId || legacy.windowId !== request.selection.windowId || typeof legacy.url !== 'string') return null;
  }
  return reply;
}

function validateMediaReply(request: KnifeMediaCall, value: unknown, requestId: string): KnifeMediaReply | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const reply = value as KnifeUnknownRecord;
  if (reply.protocol !== 2 || reply.requestId !== requestId || typeof reply.ok !== 'boolean' || typeof reply.stored !== 'boolean' ||
    reply.code !== undefined && reply.code !== null && typeof reply.code !== 'string' ||
    reply.stage !== undefined && reply.stage !== null && typeof reply.stage !== 'string') return null;
  if (!reply.ok) return typeof reply.code === 'string' && reply.stored === false ? reply as KnifeMediaReply : null;
  if (reply.stored !== (request.action !== 'get-media-snapshot')) return null;
  const snapshot = reply.snapshot as KnifeMediaSnapshot | null | undefined;
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.version || !snapshot.values || !snapshot.selection ||
    typeof snapshot.canWrite !== 'boolean' || !(snapshot.code === null || typeof snapshot.code === 'string') ||
    !['global', 'scoped', 'repair-required'].includes(snapshot.profileState)) return null;
  const selection = 'selection' in request ? request.selection : { kind: 'global' };
  if (JSON.stringify(snapshot.selection) !== JSON.stringify(selection)) return null;
  if (!KnifeMediaProfiles.isCounter(snapshot.version.globalRevision) ||
    snapshot.version.mediaRevision !== null && !KnifeMediaProfiles.isCounter(snapshot.version.mediaRevision) ||
    !KnifeMediaProfiles.validateValues('audio', snapshot.values.audio).ok || !KnifeMediaProfiles.validateValues('video', snapshot.values.video).ok) return null;
  if (snapshot.store === null) {
    if (snapshot.profileState !== 'repair-required' || snapshot.version.mediaRevision !== null || snapshot.canWrite) return null;
  } else {
    const read = KnifeMediaProfiles.readLegacyStore(snapshot.store);
    if (read.state !== 'valid' || read.store.revision !== snapshot.version.mediaRevision) return null;
    if (snapshot.channel !== null && !read.store.channels.some(channel => JSON.stringify(channel) === JSON.stringify(snapshot.channel))) return null;
  }
  if (JSON.stringify(reply.version) !== JSON.stringify(snapshot.version) || reply.profileState !== snapshot.profileState) return null;
  return reply as KnifeMediaReply;
}

var createMediaSettingsClient = (chromeApi: typeof chrome) => {
  const transport = createSettingsRequestTransport(chromeApi), subscribers = new Set<(view: KnifeMediaView) => void>();
  type Pending = { domain: KnifeMediaDomain; id: string; value: KnifeScalar; generation: number; status: 'pending' | 'sent' | 'held' | 'unknown' };
  const dirty = new Map<string, Pending>();
  let selection: KnifeMediaSelection = { kind: 'global' }, snapshot: KnifeMediaSnapshot | null = null;
  let phase: KnifeMediaPhase = 'loading', code: string | null = null, disposed = false, busy = false;
  let generation = 0, scopeEpoch = 0, epoch = 0, acceptedSequence = 0, reading: Promise<void> | null = null, wanted = false;
  let pendingRequest: KnifeMediaMutation | null = null;
  let pendingValues: KnifeMediaValues | null = null;
  const pendingGenerations = new Map<string, number>();
  const fault = (code: string) => Object.assign(new Error(code), { code });
  const defaults = (domain: KnifeMediaDomain) => Object.fromEntries((domain === 'audio' ? KnifeMediaProfiles.audioFields : KnifeMediaProfiles.videoFields).map(field => [field.id, field.defaultValue]));
  function view(): KnifeMediaView {
    const values = { audio: { ...snapshot?.values.audio ?? defaults('audio') } as KnifeAudioValues,
      video: { ...snapshot?.values.video ?? defaults('video') } as KnifeVideoValues };
    for (const entry of dirty.values()) Object.assign(values[entry.domain], { [entry.id]: entry.value });
    return { selection, snapshot, values, phase, pendingKeys: [...dirty.keys()], pendingRequest, pendingValues, code };
  }
  function emit() { if (!disposed) for (const fn of subscribers) fn(view()); }
  function accept(next: KnifeMediaSnapshot, requestSequence: number) {
    if (requestSequence < acceptedSequence) return;
    if (snapshot && (next.version.globalRevision! < snapshot.version.globalRevision! ||
      next.version.mediaRevision !== null && snapshot.version.mediaRevision !== null && next.version.mediaRevision < snapshot.version.mediaRevision)) return;
    snapshot = next; acceptedSequence = requestSequence;
  }
  function settledPhase() {
    if (busy) phase = 'saving';
    else if (!['unknown', 'conflict', 'failed', 'unavailable'].includes(phase)) phase =
      [...dirty.values()].some(entry => entry.status === 'pending' || entry.status === 'sent') ? 'saving'
        : snapshot?.profileState === 'repair-required' ? 'repair-required' : snapshot ? 'ready' : 'loading';
  }
  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve(); wanted = true;
    if (reading) return reading;
    reading = (async () => {
      while (wanted && !disposed) {
        wanted = false; const started = epoch, scope = scopeEpoch, confirming = phase === 'unknown' ? pendingRequest : null;
        try {
          const result = await transport.send(2, { action: 'get-media-snapshot', selection }).promise;
          if (disposed || scope !== scopeEpoch) continue;
          if (started !== epoch) { wanted = true; continue; }
          if (!result.reply.ok || !result.reply.snapshot) throw fault(result.reply.code || 'media-read-failed');
          accept(result.reply.snapshot, result.requestSequence);
          if (!pendingRequest && !dirty.size && ['unknown','unavailable'].includes(phase)) { phase = 'loading';code = null; }
          if (!busy && phase === 'unknown' && pendingRequest && pendingRequest === confirming && snapshot?.store &&
            ['create-preset','enable-channel-domain'].includes(pendingRequest.action)) {
            const merged = KnifeMediaProfiles.mergeMediaOperation(snapshot.store, pendingRequest,
              { config: { ...snapshot.values.audio, ...snapshot.values.video }, revision: snapshot.version.globalRevision! });
            if (merged.ok && !merged.changed) {
              for (const [key, expected] of pendingGenerations) if (dirty.get(key)?.generation === expected) dirty.delete(key);
              pendingGenerations.clear();pendingRequest = null;pendingValues = null;
              for (const entry of dirty.values()) entry.status = 'held';
              phase = dirty.size ? 'failed' : 'ready';code = dirty.size ? 'draft-held' : null;
            }
          }
          settledPhase(); emit();
        } catch (error) {
          if (disposed || scope !== scopeEpoch) continue;
          code = (error as KnifeCodedError).code || 'media-read-failed';
          if (!(pendingRequest || dirty.size) || !['unknown','conflict','failed'].includes(phase))
            phase = code === 'response-unknown' ? 'unknown' : 'unavailable';
          emit();
        }
      }
    })().finally(() => { reading = null; });
    return reading;
  }
  async function mutateMedia(request: KnifeMediaMutation, entries: [string, Pending][] = []): Promise<KnifeMediaReply> {
    if (disposed || busy || !snapshot || !snapshot.canWrite || ['unknown', 'conflict', 'failed', 'repair-required', 'unavailable'].includes(phase)) throw fault('media-not-ready');
    if ('selection' in request && JSON.stringify(request.selection) !== JSON.stringify(selection)) throw fault('scope-changed');
    const scope = scopeEpoch;pendingRequest = JSON.parse(JSON.stringify(request)) as KnifeMediaMutation;
    const sourceToken = 'presetToken' in pendingRequest ? pendingRequest.presetToken : null;
    pendingValues = 'values' in pendingRequest && pendingRequest.values ? { ...pendingRequest.values } :
      sourceToken ? snapshot.store?.presets.find(preset => preset.id === sourceToken.id &&
        preset.createdRevision === sourceToken.createdRevision && preset.revision === sourceToken.revision)?.values ?? null : null;
    pendingGenerations.clear();for (const [key, entry] of entries) pendingGenerations.set(key,entry.generation);
    busy = true;phase = 'saving';code = null;emit();
    try {
      const result = await transport.send(2, request).promise;
      if (disposed) throw fault('disposed');
      if (scope !== scopeEpoch) throw fault('scope-changed');
      if (!result.reply.ok) {
        phase = result.reply.code === 'conflict' ? 'conflict' : 'failed'; code = result.reply.code || 'media-write-failed';
        for (const [, entry] of entries) entry.status = 'held';
      } else {
        for (const [key, entry] of entries) if (dirty.get(key)?.generation === entry.generation) dirty.delete(key);
        if (result.reply.snapshot && JSON.stringify(result.reply.snapshot.selection) === JSON.stringify(selection)) accept(result.reply.snapshot, result.requestSequence);
        pendingGenerations.clear();pendingRequest = null;pendingValues = null;phase = 'ready';code = null;
      }
      epoch++; void refresh(); return result.reply;
    } catch (error) {
      if (!disposed) { code = (error as KnifeCodedError).code || 'response-unknown'; phase = 'unknown';
        for (const [, entry] of entries) entry.status = 'unknown'; }
      throw error;
    } finally { if (!disposed) { busy = false; settledPhase(); emit(); flush(); } }
  }
  function flush() {
    if (disposed || busy || !snapshot || !snapshot.canWrite || selection.kind === 'global' || ['unknown', 'conflict', 'failed', 'repair-required', 'unavailable'].includes(phase)) return;
    const pending = [...dirty].filter(([, entry]) => entry.status === 'pending'), domain = pending[0]?.[1].domain;
    if (!domain) return;
    const channel = snapshot.channel, binding = domain === 'audio' ? channel?.audio : channel?.video;
    if (!channel || !binding) { code = 'domain-not-enabled'; phase = 'failed'; emit(); return; }
    const entries = pending.filter(([, entry]) => entry.domain === domain);
    for (const [, entry] of entries) entry.status = 'sent';
    const patch = Object.fromEntries(entries.map(([, entry]) => [entry.id, entry.value]));
    const request = { action: 'patch-channel-fields', selection, domain,
      channelToken: { channelId: channel.channelId, recordCreatedRevision: channel.createdRevision, domainCreatedRevision: binding.createdRevision }, patch } as Extract<KnifeMediaMutation, { action: 'patch-channel-fields' }>;
    void mutateMedia(request, entries).catch(() => {});
  }
  function editFields(domain: 'audio', patch: Partial<KnifeAudioValues>): void;
  function editFields(domain: 'video', patch: Partial<KnifeVideoValues>): void;
  function editFields(domain: KnifeMediaDomain, patch: Partial<KnifeMediaValues>) {
    if (domain !== 'audio' && domain !== 'video') return;
    if (disposed || !snapshot?.canWrite || selection.kind === 'global' || !(domain === 'audio' ? snapshot.channel?.audio : snapshot.channel?.video) || ['unknown', 'conflict', 'failed'].includes(phase)) return;
    if (!Object.keys(patch).length) return;
    const values=view().values;
    const check = KnifeMediaProfiles.validateValues(domain, { ...(domain === 'audio' ? values.audio : values.video), ...patch });
    if (!check.ok) { code = check.code; phase = 'failed'; emit(); return; }
    for (const [id, value] of Object.entries(patch)) dirty.set(`${domain}:${id}`, { domain, id, value, generation: ++generation, status: 'pending' });
    epoch++; code = null; phase = 'saving'; emit(); flush();
  }
  async function selectScope(next: KnifeMediaSelection): Promise<{ ok: true } | KnifeFailure> {
    if (disposed || busy || dirty.size || phase === 'unknown') return { ok: false, code: 'media-not-ready' };
    if (pendingRequest) return { ok:false,code:'media-not-ready' };
    selection = { ...next }; snapshot = null; scopeEpoch++; epoch++; acceptedSequence = 0; phase = 'loading'; code = null; emit(); await refresh();
    return { ok: true };
  }
  function discardPending() {
    if (disposed) return;
    // Discard display intent, never roll back a request already sent to the worker.
    dirty.clear();if (!busy) { pendingGenerations.clear();pendingRequest = null;pendingValues = null; }
    epoch++;phase = busy ? 'saving' : 'loading';code = null;emit();void refresh();
  }
  const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !['mediaProfiles', 'config', 'settingsRevision'].some(key => Object.hasOwn(changes, key))) return;
    epoch++; void refresh();
  };
  chromeApi.storage.onChanged.addListener(onChanged); void refresh();
  return { subscribe(fn: (view: KnifeMediaView) => void) { if (disposed) return () => {};subscribers.add(fn);fn(view());return () => { subscribers.delete(fn); }; },
    selectScope, editFields, perform: (request: KnifeMediaMutation) => mutateMedia(request), refresh, discardPending,
    dispose() { if (disposed) return; disposed = true;
      try { chromeApi.storage.onChanged.removeListener(onChanged); }
      finally { transport.dispose(); subscribers.clear(); } } };
};

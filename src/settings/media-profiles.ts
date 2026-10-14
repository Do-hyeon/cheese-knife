type KnifeMediaDomain = import('../shared/media-contracts').MediaDomain;
type KnifeAudioValues = import('../shared/media-contracts').LegacyAudioValues;
type KnifeAudioValuesV2 = import('../shared/media-contracts').AudioValues;
type KnifeGainOrigin = import('../shared/media-contracts').GainOrigin;
type KnifeVideoValues = import('../shared/media-contracts').VideoValues;
type KnifeMediaValues = KnifeAudioValues | KnifeVideoValues;
type KnifeMediaVersion = import('../shared/media-contracts').MediaVersion;
type KnifeMediaDomainPayload = { domain: 'audio'; values: KnifeAudioValues } | { domain: 'video'; values: KnifeVideoValues };
type KnifeMediaPatch = { domain: 'audio'; patch: Partial<KnifeAudioValues> } | { domain: 'video'; patch: Partial<KnifeVideoValues> };
type KnifeChannelToken = { channelId: string; recordCreatedRevision: number; domainCreatedRevision: number };
type KnifePresetToken = { id: string; createdRevision: number; revision: number };
type KnifeMediaSelection = { kind: 'global' } | { kind: 'current'; tabId: number; windowId: number; channelId: string }
  | { kind: 'saved'; channelId: string };
type KnifeChannelSelection = Exclude<KnifeMediaSelection, { kind: 'global' }>;
type KnifeMediaPhase = 'loading' | 'ready' | 'saving' | 'unknown' | 'failed' | 'conflict' | 'repair-required' | 'unavailable';
type KnifeChannelRecord = { channelId: string; createdRevision: number; revision: number;
  audio?: { createdRevision: number; values: KnifeAudioValues }; video?: { createdRevision: number; values: KnifeVideoValues } };
type KnifePresetRecord = { id: string; createdRevision: number; revision: number; name: string } & KnifeMediaDomainPayload;
type KnifeMediaStore = { schema: 1; revision: number; channels: KnifeChannelRecord[]; presets: KnifePresetRecord[] };
type KnifeMediaRead = { state: 'valid'; store: KnifeMediaStore } | { state: 'absent'; store: KnifeMediaStore }
  | { state: 'invalid'; code: string } | { state: 'unsupported'; code: string };
type KnifeChannelRecordV2 = Omit<KnifeChannelRecord, 'audio'> & { audio?: { createdRevision: number; values: KnifeAudioValuesV2 } };
type KnifePresetRecordV2 = Omit<KnifePresetRecord, 'domain' | 'values'> &
  ({ domain: 'audio'; values: KnifeAudioValuesV2 } | { domain: 'video'; values: KnifeVideoValues });
type KnifeMediaStoreV2 = { schema: 2; revision: number; channels: KnifeChannelRecordV2[]; presets: KnifePresetRecordV2[] };
type KnifeMediaReadV2 = { state: 'valid'; store: KnifeMediaStore | KnifeMediaStoreV2 }
  | { state: 'absent'; store: KnifeMediaStoreV2 } | Extract<KnifeMediaRead, { state: 'invalid' | 'unsupported' }>;
type KnifeAudioResultV2 = { ok: true; values: KnifeAudioValuesV2 } | { ok: false; code: string };
type KnifeMediaUpgradeResult = { ok: true; changed: true; nextStore: KnifeMediaStoreV2 } | { ok: false; code: string };
type KnifeValuesResult = { ok: false; code: string } | ({ ok: true } & KnifeMediaDomainPayload);
type KnifeMediaMutation =
  | { action: 'enable-channel-domain'; selection: KnifeChannelSelection; domain: KnifeMediaDomain;
      expectedGlobalRevision: number; expectedMediaRevision: number; expectedRecord: { createdRevision: number; revision: number } | null }
  | ({ action: 'patch-channel-fields'; selection: KnifeChannelSelection; channelToken: KnifeChannelToken } & KnifeMediaPatch)
  | ({ action: 'replace-channel-domain'; selection: KnifeChannelSelection; channelToken: KnifeChannelToken; expectedRecordRevision: number }
      & (KnifeMediaDomainPayload | { domain: KnifeMediaDomain; presetToken: KnifePresetToken }))
  | { action: 'reset-channel-domain'; selection: KnifeChannelSelection; domain: KnifeMediaDomain;
      recordCreatedRevision: number; domainCreatedRevision: number; expectedRecordRevision: number }
  | { action: 'delete-channel'; selection: KnifeChannelSelection; recordCreatedRevision: number; expectedRecordRevision: number }
  | ({ action: 'create-preset'; id: string; expectedMediaRevision: number; name: string } & KnifeMediaDomainPayload)
  | ({ action: 'edit-preset'; id: string; createdRevision: number } & (
      { name: string; patch?: never; values?: never } | (KnifeMediaPatch & { name?: string })
      | (KnifeMediaDomainPayload & { name?: string; expectedPresetRevision: number })))
  | { action: 'delete-preset'; presetToken: KnifePresetToken }
  | { action: 'apply-preset-global'; presetToken: KnifePresetToken; expectedGlobalRevision: number };
type KnifeMediaResolution = { effectiveConfig: Record<string, KnifeScalar>;
  profileState: 'global' | 'scoped' | 'repair-required'; audioBindingKey: string;
  audioKind: 'global' | 'channel'; videoKind: 'global' | 'channel' };
type KnifeScopedContext = import('../shared/media-contracts').ScopedContext;
type KnifeScopedSnapshot = { baseConfig: Record<string, KnifeScalar>; effectiveConfig: Record<string, KnifeScalar>;
  styleParameters: KnifeUnknownRecord; version: KnifeMediaVersion; profileState: KnifeMediaResolution['profileState'];
  revisionStatus: 'ready' | 'repair-required'; audioBindingKey: string; audioKind: 'global' | 'channel'; videoKind: 'global' | 'channel' };
type KnifeMediaMergeResult = { ok: false; code: string } | { ok: true; changed: boolean; nextStore: KnifeMediaStore;
  globalOperations?: KnifeSettingsOperation[]; channelToken?: KnifeChannelToken; recordRevision?: number; presetToken?: KnifePresetToken };

var KnifeMediaProfiles = (() => {
  const audioFields: readonly KnifeConfigLeaf[] = Object.freeze([
    { id: 'compressorDefault', defaultValue: false },
    { id: 'compressorThreshold', type: 'range', min: -100, max: 0, step: 1, unit: 'dB', defaultValue: -50 },
    { id: 'compressorKnee', type: 'range', min: 0, max: 40, step: 1, unit: 'dB', defaultValue: 40 },
    { id: 'compressorRatio', type: 'range', min: 1, max: 20, step: 0.5, digits: 1, defaultValue: 12 },
    { id: 'compressorAttack', type: 'range', min: 0, max: 1, step: 0.01, digits: 2, unit: 's', defaultValue: 0 },
    { id: 'compressorRelease', type: 'range', min: 0, max: 1, step: 0.01, digits: 2, unit: 's', defaultValue: 0.25 },
  ]);
  const videoFields: readonly KnifeConfigLeaf[] = Object.freeze([
    { id: 'brightness', type: 'range', min: 0, max: 3, step: 0.05, digits: 2, defaultValue: 1 },
    { id: 'contrast', type: 'range', min: 0, max: 3, step: 0.05, digits: 2, defaultValue: 1 },
    { id: 'saturation', type: 'range', min: 0, max: 3, step: 0.05, digits: 2, defaultValue: 1 },
    { id: 'gamma', type: 'range', min: 0, max: 3, step: 0.05, digits: 2, defaultValue: 1 },
    { id: 'sharpness', type: 'range', min: 0, max: 10, step: 0.1, digits: 1, defaultValue: 0 },
  ]);
  const audioFieldsV2: readonly KnifeConfigLeaf[] = Object.freeze([
    { id: 'audioDefault', defaultValue: false }, { id: 'compressorEnabled', defaultValue: true },
    ...audioFields.filter(field => field.id !== 'compressorDefault'),
    { id: 'audioGain', type: 'range', min: 0, max: 2, step: 0.05, defaultValue: 1 },
    { id: 'gainInherited', defaultValue: true }, { id: 'eqEnabled', defaultValue: false },
    ...[63, 125, 250, 500, 1000, 2000, 4000, 8000].map(hz =>
      ({ id: `eq${hz}`, type: 'range' as const, min: -6, max: 6, step: 0.1, defaultValue: 0 })),
    { id: 'normalizerEnabled', defaultValue: false },
    { id: 'normalizerTargetDbfs', type: 'range', min: -30, max: -12, step: 1, defaultValue: -20 },
  ]);
  const encoder = new TextEncoder();
  const channelId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
  const presetId = (value: unknown): value is string => typeof value === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
  const counter = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  const creation = (value: unknown, revision: number): value is number => counter(value) && value > 0 && value <= revision;
  const label = (value: unknown): value is string => typeof value === 'string' && value.length <= 96 &&
    value.trim().length > 0 && Array.from(value).length <= 48 && encoder.encode(value).byteLength <= 192 &&
    !/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ud800-\udfff]/u.test(value);
  const fields = (domain: KnifeMediaDomain) => domain === 'audio' ? audioFields : domain === 'video' ? videoFields : null;
  const failure = (code: string): { ok: false; code: string } => ({ ok: false, code });
  const empty = (): KnifeMediaStore => ({ schema: 1, revision: 0, channels: [], presets: [] });

  function ownRecord(value: unknown, allowed: readonly string[], required: readonly string[] = allowed): KnifeUnknownRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length > allowed.length || keys.some(key => typeof key !== 'string' || !allowed.includes(key))) return null;
    const entries: Array<[string, unknown]> = [];
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !descriptor || !('value' in descriptor) || !descriptor.enumerable) return null;
      entries.push([key, descriptor.value]);
    }
    const record = Object.fromEntries(entries);
    return required.every(key => Object.hasOwn(record, key)) ? record : null;
  }
  function ownArray(value: unknown, max: number): unknown[] | null {
    if (!Array.isArray(value) || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) return null;
    const result: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return null;
      result.push(descriptor.value);
    }
    return result;
  }
  function scalar(value: unknown, field: KnifeConfigLeaf): value is KnifeScalar {
    return field.type === 'range' ? typeof value === 'number' && Number.isFinite(value) && value >= field.min && value <= field.max
      : typeof value === 'boolean';
  }
  function validateValues(domain: KnifeMediaDomain, value: unknown): KnifeValuesResult {
    const descriptors = fields(domain);
    if (!descriptors) return failure('invalid-domain');
    const values = ownRecord(value, descriptors.map(field => field.id));
    if (!values || descriptors.some(field => !scalar(values[field.id], field))) return failure('invalid-values');
    // Exact own keys and scalar checks establish the fixed domain record shape.
    return domain === 'audio' ? { ok: true, domain, values: values as KnifeAudioValues }
      : { ok: true, domain, values: values as KnifeVideoValues };
  }
  function project(domain: KnifeMediaDomain, config: Record<string, KnifeScalar>): KnifeMediaValues {
    const descriptors = fields(domain)!;
    const values = Object.fromEntries(descriptors.map(field => {
      const value: unknown = Object.getOwnPropertyDescriptor(config, field.id)?.value;
      return [field.id, scalar(value, field) ? value : field.defaultValue];
    }));
    const checked = validateValues(domain, values);
    if (!checked.ok) throw new Error('media-descriptor-contract');
    return checked.values;
  }
  function readLegacyStore(raw: unknown): KnifeMediaRead {
    if (raw === undefined) return { state: 'absent', store: empty() };
    const record = ownRecord(raw, ['schema', 'revision', 'channels', 'presets']);
    const invalid = (): KnifeMediaRead => ({ state: 'invalid', code: 'invalid-media-store' });
    if (!record) return invalid();
    if (record.schema !== 1) return counter(record.schema) && record.schema > 1
      ? { state: 'unsupported', code: 'unsupported-media-schema' } : invalid();
    if (!counter(record.revision)) return invalid();
    const channelRows = ownArray(record.channels, 128), presetRows = ownArray(record.presets, 64);
    if (!channelRows || !presetRows) return invalid();
    const store: KnifeMediaStore = { schema: 1, revision: record.revision, channels: [], presets: [] };
    const channelIds = new Set<string>(), presetIds = new Set<string>();
    for (const row of channelRows) {
      const item = ownRecord(row, ['channelId', 'createdRevision', 'revision', 'audio', 'video'], ['channelId', 'createdRevision', 'revision']);
      if (!item || !channelId(item.channelId) || channelIds.has(item.channelId) ||
          !creation(item.createdRevision, store.revision) || !creation(item.revision, store.revision)) return invalid();
      const channel: KnifeChannelRecord = { channelId: item.channelId, createdRevision: item.createdRevision, revision: item.revision };
      for (const domain of ['audio', 'video'] as const) {
        if (!Object.hasOwn(item, domain)) continue;
        const binding = ownRecord(domain === 'audio' ? item.audio : item.video, ['createdRevision', 'values']);
        if (!binding || !creation(binding.createdRevision, store.revision) || binding.createdRevision < channel.createdRevision) return invalid();
        const values = validateValues(domain, binding.values);
        if (!values.ok) return invalid();
        if (values.domain === 'audio') channel.audio = { createdRevision: binding.createdRevision, values: values.values };
        else channel.video = { createdRevision: binding.createdRevision, values: values.values };
      }
      if (!channel.audio && !channel.video) return invalid();
      channelIds.add(channel.channelId); store.channels.push(channel);
    }
    for (const row of presetRows) {
      const item = ownRecord(row, ['id', 'createdRevision', 'revision', 'domain', 'name', 'values']);
      if (!item || !presetId(item.id) || presetIds.has(item.id) || !label(item.name) ||
          !creation(item.createdRevision, store.revision) || !creation(item.revision, store.revision) ||
          (item.domain !== 'audio' && item.domain !== 'video')) return invalid();
      const values = validateValues(item.domain, item.values);
      if (!values.ok) return invalid();
      store.presets.push({ id: item.id, createdRevision: item.createdRevision, revision: item.revision, name: item.name,
        ...{ domain: values.domain, values: values.values } } as KnifePresetRecord);
      presetIds.add(item.id);
    }
    if (encoder.encode('mediaProfiles').byteLength + encoder.encode(JSON.stringify(store)).byteLength > 262144) return invalid();
    return { state: 'valid', store };
  }
  function resolveLegacyMediaSettings(base: Record<string, KnifeScalar>, read: KnifeMediaRead,
      context: { channelId: string | null; topFrame: boolean; incognito: boolean }): KnifeMediaResolution {
    const effectiveConfig = { ...base, ...project('audio', base), ...project('video', base) };
    const result: KnifeMediaResolution = { effectiveConfig, profileState: 'global', audioBindingKey: 'global', audioKind: 'global', videoKind: 'global' };
    if (read.state === 'invalid' || read.state === 'unsupported') { result.profileState = 'repair-required'; return result; }
    if (!context.topFrame || context.incognito || !channelId(context.channelId)) return result;
    const channel = read.store.channels.find(item => item.channelId === context.channelId);
    if (channel?.audio) {
      Object.assign(effectiveConfig, channel.audio.values); result.audioKind = 'channel';
      result.audioBindingKey = `${channel.channelId}:${channel.createdRevision}:${channel.audio.createdRevision}`;
    }
    if (channel?.video) { Object.assign(effectiveConfig, channel.video.values); result.videoKind = 'channel'; }
    if (channel) result.profileState = 'scoped';
    return result;
  }
  function patchValues(domain: KnifeMediaDomain, values: KnifeMediaValues, patch: unknown): KnifeValuesResult {
    const descriptors = fields(domain);
    if (!descriptors) return failure('invalid-domain');
    const checked = ownRecord(patch, descriptors.map(field => field.id), []);
    return checked ? validateValues(domain, { ...values, ...checked }) : failure('invalid-patch');
  }
  const equalValues = (a: KnifeMediaValues, b: KnifeMediaValues) => Object.keys(a).every(key =>
    Object.getOwnPropertyDescriptor(a, key)?.value === Object.getOwnPropertyDescriptor(b, key)?.value);
  function mergeMediaOperation(input: KnifeMediaStore, request: KnifeMediaMutation,
      global: { config: Record<string, KnifeScalar>; revision: number }): KnifeMediaMergeResult {
    const read = readLegacyStore(input);
    if (read.state !== 'valid' && read.state !== 'absent') return failure(read.code);
    if (!counter(global.revision)) return failure('invalid-global-revision');
    const store = read.store;
    const nextRevision = store.revision + 1;
    const success = (changed: boolean, extra: Partial<Extract<KnifeMediaMergeResult, { ok: true }>> = {}): KnifeMediaMergeResult => {
      if (changed) {
        if (!counter(nextRevision)) return failure('revision-exhausted');
        store.revision = nextRevision;
        store.channels.sort((a, b) => a.channelId.localeCompare(b.channelId));
        store.presets.sort((a, b) => a.id.localeCompare(b.id));
        if (readLegacyStore(store).state !== 'valid') return failure('media-limit');
      }
      return { ok: true, changed, nextStore: store, ...extra };
    };
    const bump = (record: { revision: number }) => {
      if (!counter(record.revision + 1)) return false;
      record.revision++; return true;
    };
    const sourcePreset = (token: KnifePresetToken) => store.presets.find(preset => preset.id === token.id &&
      preset.createdRevision === token.createdRevision && preset.revision === token.revision);
    if (request.action === 'apply-preset-global') {
      const preset = sourcePreset(request.presetToken);
      if (!preset || request.expectedGlobalRevision !== global.revision) return failure('conflict');
      const globalOperations: KnifeSettingsOperation[] = Object.entries(preset.values).map(([id, value]) => ({ type: 'config', id, value }));
      return success(false, { globalOperations });
    }
    if (request.action === 'create-preset') {
      const values = validateValues(request.domain, request.values);
      if (!presetId(request.id) || !label(request.name) || !values.ok) return failure('invalid-preset');
      const existing = store.presets.find(preset => preset.id === request.id);
      if (existing) return existing.createdRevision === request.expectedMediaRevision + 1 && existing.revision === 1 &&
        existing.domain === values.domain && existing.name === request.name && equalValues(existing.values, values.values)
        ? success(false, { presetToken: { id: existing.id, createdRevision: existing.createdRevision, revision: 1 } }) : failure('conflict');
      if (request.expectedMediaRevision !== store.revision) return failure('conflict');
      if (store.presets.length >= 64) return failure('media-limit');
      const preset = { id: request.id, createdRevision: nextRevision, revision: 1, name: request.name,
        domain: values.domain, values: values.values } as KnifePresetRecord;
      store.presets.push(preset);
      return success(true, { presetToken: { id: preset.id, createdRevision: nextRevision, revision: 1 } });
    }
    if (request.action === 'edit-preset' || request.action === 'delete-preset') {
      const preset = request.action === 'delete-preset' ? sourcePreset(request.presetToken)
        : store.presets.find(item => item.id === request.id && item.createdRevision === request.createdRevision);
      if (!preset) return failure('conflict');
      if (request.action === 'delete-preset') { store.presets = store.presets.filter(item => item !== preset); return success(true); }
      if (request.name !== undefined && !label(request.name)) return failure('invalid-name');
      const name = request.name ?? preset.name;
      let values: KnifeValuesResult = { ok: true, ...{ domain: preset.domain, values: preset.values } } as KnifeValuesResult;
      if ('values' in request && request.values !== undefined) {
        if (request.expectedPresetRevision !== preset.revision || request.domain !== preset.domain) return failure('conflict');
        values = validateValues(preset.domain, request.values);
      } else if ('patch' in request && request.patch !== undefined) {
        if (request.domain !== preset.domain) return failure('conflict');
        values = patchValues(preset.domain, preset.values, request.patch);
      }
      if (!values.ok) return failure(values.code);
      if (preset.name === name && equalValues(preset.values, values.values)) return success(false);
      if (!bump(preset)) return failure('revision-exhausted');
      const updated = { ...preset, name, domain: values.domain, values: values.values } as KnifePresetRecord;
      store.presets[store.presets.indexOf(preset)] = updated;
      return success(true, { presetToken: { id: preset.id, createdRevision: preset.createdRevision, revision: updated.revision } });
    }
    const id = request.selection.channelId;
    if (!channelId(id)) return failure('invalid-channel');
    let channel = store.channels.find(item => item.channelId === id);
    if (request.action === 'enable-channel-domain') {
      if (request.expectedGlobalRevision !== global.revision) return failure('conflict');
      const values = validateValues(request.domain, project(request.domain, global.config));
      if (!values.ok) return values;
      if (request.expectedMediaRevision !== store.revision) {
        const existing = channel?.[request.domain];
        const originalRecord = channel && (request.expectedRecord === null
          ? channel.createdRevision === request.expectedMediaRevision + 1 && channel.revision === 1
          : channel.createdRevision === request.expectedRecord.createdRevision && channel.revision === request.expectedRecord.revision + 1);
        return channel && existing && originalRecord && existing.createdRevision === request.expectedMediaRevision + 1 && equalValues(existing.values, values.values)
          ? success(false, { channelToken: { channelId: id, recordCreatedRevision: channel.createdRevision, domainCreatedRevision: existing.createdRevision }, recordRevision: channel.revision })
          : failure('conflict');
      }
      if (channel) {
        if (!request.expectedRecord || request.expectedRecord.createdRevision !== channel.createdRevision || request.expectedRecord.revision !== channel.revision) return failure('conflict');
        if (channel[request.domain]) return success(false);
        if (!bump(channel)) return failure('revision-exhausted');
      } else {
        if (request.expectedRecord !== null) return failure('conflict');
        if (store.channels.length >= 128) return failure('media-limit');
        channel = { channelId: id, createdRevision: nextRevision, revision: 1 }; store.channels.push(channel);
      }
      if (values.domain === 'audio') channel.audio = { createdRevision: nextRevision, values: values.values };
      else channel.video = { createdRevision: nextRevision, values: values.values };
      return success(true, { channelToken: { channelId: id, recordCreatedRevision: channel.createdRevision, domainCreatedRevision: nextRevision }, recordRevision: channel.revision });
    }
    if (!channel) return failure('conflict');
    if (request.action === 'reset-channel-domain' || request.action === 'delete-channel') {
      if (request.recordCreatedRevision !== channel.createdRevision || request.expectedRecordRevision !== channel.revision) return failure('conflict');
      if (request.action === 'delete-channel') { store.channels = store.channels.filter(item => item !== channel); return success(true); }
      if (channel[request.domain]?.createdRevision !== request.domainCreatedRevision) return failure('conflict');
      if (!bump(channel)) return failure('revision-exhausted');
      delete channel[request.domain];
      if (!channel.audio && !channel.video) store.channels = store.channels.filter(item => item !== channel);
      return success(true);
    }
    const binding = channel[request.domain];
    if (!binding || request.channelToken.channelId !== id || request.channelToken.recordCreatedRevision !== channel.createdRevision ||
        request.channelToken.domainCreatedRevision !== binding.createdRevision) return failure('conflict');
    let values: KnifeValuesResult;
    if (request.action === 'patch-channel-fields') values = patchValues(request.domain, binding.values, request.patch);
    else {
      if (request.expectedRecordRevision !== channel.revision) return failure('conflict');
      if ('presetToken' in request) {
        const preset = sourcePreset(request.presetToken);
        if (!preset || preset.domain !== request.domain) return failure('conflict');
        values = validateValues(request.domain, preset.values);
      } else values = validateValues(request.domain, request.values);
    }
    if (!values.ok) return values;
    if (equalValues(binding.values, values.values)) return success(false);
    if (!bump(channel)) return failure('revision-exhausted');
    if (values.domain === 'audio') channel.audio = { createdRevision: binding.createdRevision, values: values.values };
    else channel.video = { createdRevision: binding.createdRevision, values: values.values };
    return success(true, { channelToken: { channelId: id, recordCreatedRevision: channel.createdRevision, domainCreatedRevision: binding.createdRevision }, recordRevision: channel.revision });
  }
  function validateAudioV2(raw: unknown): KnifeAudioResultV2 {
    const values = ownRecord(raw, audioFieldsV2.map(field => field.id));
    if (!values || audioFieldsV2.some(field => !scalar(values[field.id], field))) return failure('invalid-values');
    return { ok: true, values: values as KnifeAudioValuesV2 };
  }
  function projectAudioV2(legacy: KnifeAudioValues): KnifeAudioValuesV2 {
    const checked = validateValues('audio', legacy);
    if (!checked.ok || checked.domain !== 'audio') throw new Error('invalid-legacy-audio');
    const values = Object.fromEntries(audioFieldsV2.map(field => [field.id,
      field.id === 'audioDefault' ? checked.values.compressorDefault
        : Object.getOwnPropertyDescriptor(checked.values, field.id)?.value ?? field.defaultValue]));
    const result = validateAudioV2(values);
    if (!result.ok) throw new Error('media-descriptor-contract');
    return result.values;
  }
  function projectGlobalAudio(config: Record<string, KnifeScalar>): KnifeAudioValuesV2 {
    const values = Object.fromEntries(audioFieldsV2.map(field => {
      const raw = Object.getOwnPropertyDescriptor(config, field.id === 'audioDefault' ? 'compressorDefault' : field.id)?.value;
      return [field.id, scalar(raw, field) ? raw : field.defaultValue];
    }));
    const checked = validateAudioV2(values);
    if (!checked.ok) throw new Error('media-descriptor-contract');
    return checked.values;
  }
  function readStore(raw: unknown): KnifeMediaReadV2 {
    if (raw === undefined) return { state: 'absent', store: { schema: 2, revision: 0, channels: [], presets: [] } };
    const record = ownRecord(raw, ['schema', 'revision', 'channels', 'presets']);
    const invalid = (): KnifeMediaReadV2 => ({ state: 'invalid', code: 'invalid-media-store' });
    if (!record) return invalid();
    if (record.schema === 1) {
      const legacy = readLegacyStore(raw);
      return legacy.state === 'absent' ? invalid() : legacy;
    }
    if (record.schema !== 2) return counter(record.schema) && record.schema > 2
      ? { state: 'unsupported', code: 'unsupported-media-schema' } : invalid();
    if (!counter(record.revision)) return invalid();
    const channels = ownArray(record.channels, 128), presets = ownArray(record.presets, 64);
    if (!channels || !presets) return invalid();
    const store: KnifeMediaStoreV2 = { schema: 2, revision: record.revision, channels: [], presets: [] };
    const ids = new Set<string>();
    for (const row of channels) {
      const item = ownRecord(row, ['channelId', 'createdRevision', 'revision', 'audio', 'video'], ['channelId', 'createdRevision', 'revision']);
      if (!item || !channelId(item.channelId) || ids.has(item.channelId) ||
          !creation(item.createdRevision, store.revision) || !creation(item.revision, store.revision)) return invalid();
      const channel: KnifeChannelRecordV2 = { channelId: item.channelId, createdRevision: item.createdRevision, revision: item.revision };
      for (const domain of ['audio', 'video'] as const) {
        if (!Object.hasOwn(item, domain)) continue;
        const binding = ownRecord(domain === 'audio' ? item.audio : item.video, ['createdRevision', 'values']);
        if (!binding || !creation(binding.createdRevision, store.revision) || binding.createdRevision < channel.createdRevision) return invalid();
        if (domain === 'audio') {
          const checked = validateAudioV2(binding.values);
          if (!checked.ok) return invalid();
          channel.audio = { createdRevision: binding.createdRevision, values: checked.values };
        } else {
          const checked = validateValues('video', binding.values);
          if (!checked.ok || checked.domain !== 'video') return invalid();
          channel.video = { createdRevision: binding.createdRevision, values: checked.values };
        }
      }
      if (!channel.audio && !channel.video) return invalid();
      ids.add(channel.channelId); store.channels.push(channel);
    }
    ids.clear();
    for (const row of presets) {
      const item = ownRecord(row, ['id', 'createdRevision', 'revision', 'domain', 'name', 'values']);
      if (!item || !presetId(item.id) || ids.has(item.id) || !label(item.name) ||
          !creation(item.createdRevision, store.revision) || !creation(item.revision, store.revision)) return invalid();
      const common = { id: item.id, name: item.name, createdRevision: item.createdRevision, revision: item.revision };
      if (item.domain === 'audio') {
        const checked = validateAudioV2(item.values);
        if (!checked.ok) return invalid();
        store.presets.push({ ...common, domain: 'audio', values: checked.values });
      } else if (item.domain === 'video') {
        const checked = validateValues('video', item.values);
        if (!checked.ok || checked.domain !== 'video') return invalid();
        store.presets.push({ ...common, domain: 'video', values: checked.values });
      } else return invalid();
      ids.add(item.id);
    }
    if (encoder.encode('mediaProfiles').byteLength + encoder.encode(JSON.stringify(store)).byteLength > 262144) return invalid();
    return { state: 'valid', store };
  }
  function upgradeMediaStore(raw: unknown, expectedRevision: number): KnifeMediaUpgradeResult {
    const read = readLegacyStore(raw);
    if (read.state !== 'valid' || !counter(expectedRevision) || read.store.revision !== expectedRevision) return failure('conflict');
    if (!counter(read.store.revision + 1) || read.store.channels.some(item => !counter(item.revision + 1)) ||
        read.store.presets.some(item => !counter(item.revision + 1))) return failure('revision-exhausted');
    const channels: KnifeChannelRecordV2[] = read.store.channels.map(item => {
      const { audio, ...rest } = item;
      return { ...rest, revision: item.revision + 1,
        ...(audio ? { audio: { createdRevision: audio.createdRevision, values: projectAudioV2(audio.values) } } : {}) };
    });
    const presets: KnifePresetRecordV2[] = read.store.presets.map(item => ({ ...item, revision: item.revision + 1,
      ...(item.domain === 'audio' ? { domain: 'audio', values: projectAudioV2(item.values) } : { domain: 'video', values: item.values }) }));
    const nextStore: KnifeMediaStoreV2 = { schema: 2, revision: read.store.revision + 1, channels, presets };
    if (readStore(nextStore).state !== 'valid') return failure('media-limit');
    return { ok: true, changed: true, nextStore };
  }
  function copyAudioPreset(preset: KnifeAudioValuesV2, destination: KnifeAudioValuesV2): KnifeAudioValuesV2 {
    const a = validateAudioV2(preset), b = validateAudioV2(destination);
    if (!a.ok || !b.ok) throw new Error('invalid-values');
    return { ...a.values, ...(a.values.gainInherited ? { audioGain: b.values.audioGain, gainInherited: b.values.gainInherited } : {}) };
  }
  function resolveMediaSettings(base: Record<string, KnifeScalar>, read: KnifeMediaReadV2,
      context: { channelId: string | null; topFrame: boolean; incognito: boolean }): KnifeMediaResolution & { gainOrigin: KnifeGainOrigin } {
    const global = projectGlobalAudio(base), effectiveConfig = { ...base, ...global, ...project('video', base) };
    const result: KnifeMediaResolution & { gainOrigin: KnifeGainOrigin } = { effectiveConfig, profileState: 'global',
      audioBindingKey: 'global', audioKind: 'global', videoKind: 'global', gainOrigin: global.gainInherited ? 'site-legacy' : 'global-owned' };
    if (read.state === 'invalid' || read.state === 'unsupported') { result.profileState = 'repair-required'; return result; }
    if (!context.topFrame || context.incognito || !channelId(context.channelId)) return result;
    const channel = read.store.channels.find(item => item.channelId === context.channelId);
    if (channel?.audio) {
      const values = read.store.schema === 1 ? projectAudioV2((channel as KnifeChannelRecord).audio!.values)
        : (channel as KnifeChannelRecordV2).audio!.values;
      Object.assign(effectiveConfig, values);
      if (values.gainInherited) { effectiveConfig.audioGain = global.audioGain; effectiveConfig.gainInherited = global.gainInherited; }
      else result.gainOrigin = 'channel-owned';
      result.audioKind = 'channel'; result.audioBindingKey = `${channel.channelId}:${channel.createdRevision}:${channel.audio.createdRevision}`;
    }
    if (channel?.video) { Object.assign(effectiveConfig, channel.video.values); result.videoKind = 'channel'; }
    if (channel) result.profileState = 'scoped';
    return result;
  }
  return Object.freeze({ audioFields, audioFieldsV2, videoFields, readStore, readLegacyStore, validateValues, validateAudioV2,
    projectAudioV2, projectGlobalAudio, upgradeMediaStore, copyAudioPreset, resolveMediaSettings, resolveLegacyMediaSettings, mergeMediaOperation,
    isChannelId: channelId, isPresetId: presetId, isPresetName: label, isCounter: counter });
})();
// Publish the bundled namespace for the other MAIN feature entries.
globalThis.KnifeMediaProfiles = KnifeMediaProfiles;

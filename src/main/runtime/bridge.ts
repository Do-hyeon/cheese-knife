import type { BridgeExpectation, ConfigEnvelope, ScopedEnvelope } from './contracts';

type UnknownRecord = Record<PropertyKey, unknown>;

function ordinaryRecord(value: unknown): value is UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === null) return true;
    const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
    return Object.getPrototypeOf(prototype) === null && constructor !== undefined && 'value' in constructor &&
      typeof constructor.value === 'function' && Object.getOwnPropertyDescriptor(constructor.value,'name')?.value === 'Object';
  } catch { return false; }
}

function ownValue(record: UnknownRecord, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function copyRecord(value: unknown, stringsOnly: boolean): Record<string, unknown> | null {
  if (!ordinaryRecord(value)) return null;
  const output: Record<string, unknown> = {};
  try {
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) return null;
      if (!stringsOnly || typeof descriptor.value === 'string') {
        Object.defineProperty(output, key, { enumerable: true, configurable: true, writable: true, value: descriptor.value });
      }
    }
  } catch { return null; }
  return output;
}

export function readConfigEnvelope(event: MessageEvent, expected: BridgeExpectation): ConfigEnvelope | null {
  if (event.source !== expected.source || event.origin !== expected.origin || !ordinaryRecord(event.data)) return null;
  const data = event.data;
  try {
    if (ownValue(data, 'namespace') !== 'cheese-knife' || ownValue(data, 'protocol') !== 1 ||
        ownValue(data, 'type') !== 'config' || ownValue(data, 'requestId') !== expected.requestId) return null;
    const revision = ownValue(data, 'revision');
    if (!Number.isSafeInteger(revision) || (revision as number) <= expected.revision) return null;
    const config = copyRecord(ownValue(data, 'config'), false);
    if (!config) return null;
    const rawI18n = ownValue(data, 'i18n');
    const i18n = rawI18n == null ? {} : copyRecord(rawI18n, true);
    if (!i18n) return null;
    return { revision: revision as number, config, i18n: i18n as Record<string, string> };
  } catch { return null; }
}

export function readScopedConfigEnvelope(event: MessageEvent<unknown>, expected: KnifeScopedContext): ScopedEnvelope | null {
  const exact = (value: unknown, keys: string[]): UnknownRecord | null => {
    if (!ordinaryRecord(value) || Reflect.ownKeys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value,key))) return null;
    return copyRecord(value,false);
  };
  try {
    const data = exact(event.data,['namespace','protocol','type','requestId','context','deliverySequence','baseConfig','effectiveConfig',
      'i18n','version','profileState','revisionStatus','mediaPhase','audioBindingGeneration','audioKind','videoKind']);
    if (!data || data.namespace !== 'cheese-knife' || data.protocol !== 2 || data.type !== 'config' ||
      typeof data.requestId !== 'string' || !data.requestId.length || data.requestId.length > 128 ||
      !KnifeMediaProfiles.isCounter(data.deliverySequence) || !KnifeMediaProfiles.isCounter(data.audioBindingGeneration)) return null;
    const context = exact(data.context,['documentGeneration','routePath','channelId','playerGeneration']);
    if (!context || !KnifeMediaProfiles.isCounter(context.documentGeneration) || context.documentGeneration < 1 ||
      !KnifeMediaProfiles.isCounter(context.playerGeneration) || typeof context.routePath !== 'string' ||
      context.routePath.charCodeAt(0) !== 47 || context.routePath.length > 2048 ||
      context.channelId !== null && !KnifeMediaProfiles.isChannelId(context.channelId) ||
      context.documentGeneration !== expected.documentGeneration || context.routePath !== expected.routePath ||
      context.channelId !== expected.channelId || context.playerGeneration !== expected.playerGeneration) return null;
    const baseConfig = copyRecord(data.baseConfig,false), effectiveConfig = copyRecord(data.effectiveConfig,false);
    const scalars = (record: UnknownRecord | null): record is UnknownRecord => !!record && Reflect.ownKeys(record).length <= 128 &&
      Object.values(record).every(value => typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value));
    if (!scalars(baseConfig) || !scalars(effectiveConfig)) return null;
    const mediaFields = new Set([...KnifeMediaProfiles.audioFields,...KnifeMediaProfiles.videoFields].map(field => field.id));
    for (const config of [baseConfig,effectiveConfig]) for (const domain of ['audio','video'] as const) {
      const fields = domain === 'audio' ? KnifeMediaProfiles.audioFields : KnifeMediaProfiles.videoFields;
      if (!KnifeMediaProfiles.validateValues(domain,Object.fromEntries(fields.map(field => [field.id,ownValue(config,field.id)]))).ok) return null;
    }
    if (Object.keys(baseConfig).length !== Object.keys(effectiveConfig).length ||
      !Object.entries(baseConfig).every(([key,value]) => Object.hasOwn(effectiveConfig,key) && (mediaFields.has(key) || Object.is(value,ownValue(effectiveConfig,key))))) return null;
    const version = exact(data.version,['globalRevision','mediaRevision']);
    if (!version || version.globalRevision !== null && !(KnifeMediaProfiles.isCounter(version.globalRevision) && version.globalRevision < Number.MAX_SAFE_INTEGER) ||
      version.mediaRevision !== null && !KnifeMediaProfiles.isCounter(version.mediaRevision) ||
      !['ready','repair-required'].includes(data.revisionStatus as string) ||
      (version.globalRevision === null) !== (data.revisionStatus === 'repair-required') ||
      !['global','scoped','repair-required'].includes(data.profileState as string) ||
      !['pending','ready','limited'].includes(data.mediaPhase as string) ||
      !['global','channel'].includes(data.audioKind as string) || !['global','channel'].includes(data.videoKind as string)) return null;
    const scoped = data.audioKind === 'channel' || data.videoKind === 'channel';
    if (scoped && !context.channelId || (data.profileState === 'scoped') !== scoped ||
      data.profileState === 'repair-required' && data.mediaPhase !== 'limited' ||
      data.mediaPhase === 'ready' && version.mediaRevision === null ||
      data.mediaPhase === 'pending' && (scoped || !Object.entries(baseConfig).every(([key,value]) => Object.is(value,ownValue(effectiveConfig,key))))) return null;
    const i18n = copyRecord(data.i18n,true);if (!i18n || Object.keys(i18n).length > 64) return null;
    return { requestId:data.requestId,context:context as KnifeScopedContext,deliverySequence:data.deliverySequence,
      baseConfig,effectiveConfig,i18n:i18n as Record<string,string>,version:version as KnifeMediaVersion,
      profileState:data.profileState as ScopedEnvelope['profileState'],revisionStatus:data.revisionStatus as ScopedEnvelope['revisionStatus'],
      mediaPhase:data.mediaPhase as ScopedEnvelope['mediaPhase'],audioBindingGeneration:data.audioBindingGeneration,
      audioKind:data.audioKind as ScopedEnvelope['audioKind'],videoKind:data.videoKind as ScopedEnvelope['videoKind'] };
  } catch { return null; }
}

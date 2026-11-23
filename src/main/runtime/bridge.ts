import type { BridgeExpectation, ConfigEnvelope } from './contracts';

type UnknownRecord = Record<PropertyKey, unknown>;

function ordinaryRecord(value: unknown): value is UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === null) return true;
    const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
    return Object.getPrototypeOf(prototype) === null && constructor !== undefined && 'value' in constructor &&
      typeof constructor.value === 'function' && constructor.value.name === 'Object';
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

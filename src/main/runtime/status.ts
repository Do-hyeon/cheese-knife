import type { FeatureState, FeatureStatus, FeatureStatusTransition, RuntimeDiagnostics, StatusPayload, StatusStore } from './contracts';

const reserved = new Set(['__proto__', 'prototype', 'constructor']);

export function createStatusStore(post: (payload: StatusPayload) => void, diagnostics: () => RuntimeDiagnostics): StatusStore {
  const statuses: Record<string, FeatureStatus> = {};
  const transitions: FeatureStatusTransition[] = [];
  return {
    statuses,
    transitions,
    setStatus(feature: string, state: FeatureState, reason: unknown = '') {
      if (!/^[a-zA-Z][a-zA-Z0-9-]{0,39}$/.test(feature) || reserved.has(feature) ||
          !['pending', 'ready', 'limited', 'failed', 'disabled'].includes(state)) return;
      const normalizedReason = typeof reason === 'string' ? reason.slice(0, 80) : '';
      const current = Object.getOwnPropertyDescriptor(statuses, feature)?.value as FeatureStatus | undefined;
      if (current?.state === state && current.reason === normalizedReason) return;
      const value = { state, reason: normalizedReason };
      Object.defineProperty(statuses, feature, { configurable: true, enumerable: true, writable: true, value });
      transitions.push({ feature, ...value });
      if (transitions.length > 20) transitions.shift();
      post({ namespace: 'cheese-knife', protocol: 1, type: 'status', statuses: { ...statuses }, diagnostics: diagnostics() });
    },
  };
}

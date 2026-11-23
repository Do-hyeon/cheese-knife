export type SiteObject = object | ((...args: never[]) => unknown);
export type Criterion = (value: unknown) => boolean;

export interface DataProperty {
  owner: SiteObject;
  descriptor: PropertyDescriptor & { value: unknown };
  value: unknown;
}

export interface ReactReader {
  fiberOf(node: unknown): SiteObject | null;
  propsOf(node: unknown): SiteObject | null;
  stateOf(node: unknown, criterion: Criterion, raw?: boolean): unknown;
  contextOf(node: unknown, criterion: Criterion): unknown;
}

export function siteObject(value: unknown): value is SiteObject {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

export function ownData(object: unknown, key: PropertyKey): DataProperty | null {
  if (!siteObject(object)) return null;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return descriptor && 'value' in descriptor ? { owner: object, descriptor: descriptor as DataProperty['descriptor'], value: descriptor.value } : null;
  } catch { return null; }
}

export function replaceOwnData(object: unknown, key: PropertyKey, expected: unknown, next: unknown): boolean {
  const current = ownData(object, key);
  if (!current || current.value !== expected || current.descriptor.writable !== true) return false;
  try { Object.defineProperty(current.owner, key, { ...current.descriptor, value: next }); return true; }
  catch { return false; }
}

export function createReactReader(): ReactReader {
  const failed = new WeakSet<SiteObject>();
  const read = (object: unknown, key: PropertyKey): DataProperty | null => {
    if (!siteObject(object) || failed.has(object)) return null;
    try {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      return descriptor && 'value' in descriptor ? { owner: object, descriptor: descriptor as DataProperty['descriptor'], value: descriptor.value } : null;
    } catch { failed.add(object); return null; }
  };
  const prefixed = (node: unknown, prefix: string): SiteObject | null => {
    if (!siteObject(node) || failed.has(node)) return null;
    try {
      for (const key of Object.getOwnPropertyNames(node)) {
        if (!key.startsWith(prefix)) continue;
        const property = read(node, key);
        return property && siteObject(property.value) ? property.value : null;
      }
    } catch { failed.add(node); }
    return null;
  };
  const fiberOf = (node: unknown) => prefixed(node, '__reactFiber$');
  const propsOf = (node: unknown) => prefixed(node, '__reactProps$');
  const stateOf = (node: unknown, criterion: Criterion, raw = false): unknown => {
    const fibers = new Set<SiteObject>();
    for (let fiber = fiberOf(node); fiber && !fibers.has(fiber) && fibers.size < 300;) {
      fibers.add(fiber);
      const hooks = new Set<SiteObject>();
      let state = read(fiber, 'memoizedState')?.value;
      while (siteObject(state) && !hooks.has(state) && hooks.size < 300) {
        hooks.add(state);
        let value = read(state, 'memoizedState')?.value;
        const queue = read(state, 'queue')?.value;
        const pending = read(queue, 'pending')?.value;
        const baseQueue = read(state, 'baseQueue')?.value;
        if (read(pending, 'hasEagerState')?.value === true) value = read(pending, 'eagerState')?.value;
        else if (read(baseQueue, 'hasEagerState')?.value === true) value = read(baseQueue, 'eagerState')?.value;
        try { if (value != null && criterion(value)) return raw ? state : value; } catch {}
        state = read(state, 'next')?.value;
      }
      const parent = read(fiber, 'return')?.value;
      fiber = siteObject(parent) ? parent : null;
    }
    return null;
  };
  const contextOf = (node: unknown, criterion: Criterion): unknown => {
    const fibers = new Set<SiteObject>();
    for (let fiber = fiberOf(node); fiber && !fibers.has(fiber) && fibers.size < 300;) {
      fibers.add(fiber);
      const dependencies = read(fiber, 'dependencies')?.value;
      let context = read(dependencies, 'firstContext')?.value;
      const contexts = new Set<SiteObject>();
      while (siteObject(context) && !contexts.has(context) && contexts.size < 100) {
        contexts.add(context);
        const value = read(context, 'memoizedValue')?.value;
        try { if (value != null && criterion(value)) return value; } catch {}
        context = read(context, 'next')?.value;
      }
      const parent = read(fiber, 'return')?.value;
      fiber = siteObject(parent) ? parent : null;
    }
    return null;
  };
  return { fiberOf, propsOf, stateOf, contextOf };
}

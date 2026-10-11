import type { KnifeRuntime } from '../runtime/contracts';

type RawRecord = Record<PropertyKey, any>;
type Criterion = (value: unknown) => boolean;
interface LegacyAdapter {
  fiberOf(node: unknown): RawRecord | undefined;
  propsOf(node: unknown): RawRecord | undefined;
  stateOf(node: unknown, criterion: Criterion, raw?: boolean): unknown;
  getWebpackRequire(): Promise<unknown | null>;
  getCorePlayer(node?: unknown): Promise<unknown | null>;
  contextOf(node: unknown, criterion: Criterion): unknown;
}
type LegacyRuntime = KnifeRuntime & { adapter?: LegacyAdapter };

const runtime = (window as unknown as Window & Record<symbol, LegacyRuntime | undefined>)[Symbol.for('cheese-knife.runtime.v1')];
if (runtime && !runtime.adapter) {
  const fiberOf = (node: unknown): RawRecord | undefined => Object.entries((node || {}) as RawRecord).find(([key]) => key.startsWith('__reactFiber$'))?.[1] as RawRecord | undefined;
  const propsOf = (node: unknown): RawRecord | undefined => Object.entries((node || {}) as RawRecord).find(([key]) => key.startsWith('__reactProps$'))?.[1] as RawRecord | undefined;
  const stateOf = (node: unknown, criterion: Criterion, raw = false): unknown => {
    const fibers = new Set<RawRecord>();
    for (let fiber = fiberOf(node); fiber && !fibers.has(fiber) && fibers.size < 300; fiber = fiber.return as RawRecord | undefined) {
      fibers.add(fiber);
      const hooks = new Set<RawRecord>();
      for (let state = fiber.memoizedState as RawRecord | undefined; state && !hooks.has(state) && hooks.size < 300; state = state.next as RawRecord | undefined) {
        hooks.add(state);
        let value: unknown = state.memoizedState;
        const pending = state.queue?.pending as RawRecord | undefined;
        const baseQueue = state.baseQueue as RawRecord | undefined;
        if (pending?.hasEagerState) value = pending.eagerState;
        else if (baseQueue?.hasEagerState) value = baseQueue.eagerState;
        try { if (value != null && criterion(value)) return raw ? state : value; } catch {}
      }
    }
    return null;
  };
  let webpackPromise: Promise<unknown | null> | undefined;
  const getWebpackRequire = (): Promise<unknown | null> => {
    if (webpackPromise) return webpackPromise;
    webpackPromise = new Promise(resolve => {
      const attempted = new WeakMap<object, unknown>();
      const id = `knife-${Date.now().toString(36)}`;
      const started = Date.now();
      let settled = false, timer = 0;
      const done = (value: unknown) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
      const probe = () => {
        const chunk = Object.getOwnPropertyDescriptor(window, 'webpackChunkglive_fe_pc')?.value as RawRecord | undefined;
        if (Array.isArray(chunk) && typeof chunk.push === 'function' && attempted.get(chunk) !== chunk.push) {
          attempted.set(chunk, chunk.push);
          try {
            chunk.push([[id], { [id]: (_module: unknown, _exports: unknown, webpackRequire: unknown) => done(webpackRequire) },
              (webpackRequire: (module: string) => unknown) => webpackRequire(id)]);
          } catch {}
        }
        if (settled) return;
        if (Date.now() - started >= 2000) { done(null); return; }
        timer = window.setTimeout(probe, 100);
      };
      window.addEventListener('pagehide', () => done(null), { once: true });
      probe();
    });
    return webpackPromise;
  };
  runtime.adapter = {
    fiberOf, propsOf, stateOf, getWebpackRequire,
    async getCorePlayer(node: unknown = runtime.state.player?.layout) {
      return (stateOf(node, value => !!(value as RawRecord)?._corePlayer) as RawRecord | null)?._corePlayer || null;
    },
    contextOf(node: unknown, criterion: Criterion) {
      const seen = new Set<RawRecord>();
      for (let fiber = fiberOf(node); fiber && !seen.has(fiber) && seen.size < 300; fiber = fiber.return as RawRecord | undefined) {
        seen.add(fiber);
        let context = fiber.dependencies?.firstContext as RawRecord | undefined;
        for (let count = 0; context && count < 100; count++, context = context.next as RawRecord | undefined) {
          try { if (context.memoizedValue != null && criterion(context.memoizedValue)) return context.memoizedValue; } catch {}
        }
      }
      return null;
    },
  };
}

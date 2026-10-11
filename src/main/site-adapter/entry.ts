import type { KnifeRuntime } from '../runtime/contracts';
import { createSiteCapabilities } from './capabilities';
import { createReactReader, ownData, siteObject, type Criterion } from './react';

interface LegacyRawAdapter {
  fiberOf(node: unknown): object | null;
  propsOf(node: unknown): object | null;
  stateOf(node: unknown, criterion: Criterion, raw?: boolean): unknown;
  getCorePlayer(node?: unknown): Promise<unknown | null>;
}
type LegacyRuntime = KnifeRuntime & { adapter?: ReturnType<typeof createSiteCapabilities> & LegacyRawAdapter };

const runtime = (window as unknown as Window & Record<symbol, LegacyRuntime | undefined>)[Symbol.for('cheese-knife.runtime.v1')];
if (runtime && !runtime.adapter) {
  const reader = createReactReader();
  runtime.adapter = {
    ...createSiteCapabilities(reader),
    fiberOf: reader.fiberOf,
    propsOf: reader.propsOf,
    stateOf: reader.stateOf,
    async getCorePlayer(node: unknown = runtime.state.player?.layout) {
      const state = reader.stateOf(node, value => siteObject(ownData(value, '_corePlayer')?.value));
      return ownData(state, '_corePlayer')?.value || null;
    },
  };
}

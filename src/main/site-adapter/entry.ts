import type { KnifeRuntime } from '../runtime/contracts';
import { createSiteCapabilities } from './capabilities';
import { createReactReader } from './react';

const runtime = (window as unknown as Window & Record<symbol, KnifeRuntime | undefined>)[Symbol.for('cheese-knife.runtime.v1')];
if (runtime?.ownerProtocol === 2 && !runtime.adapter) {
  runtime.adapter = createSiteCapabilities(createReactReader());
  runtime.reconcile();
}

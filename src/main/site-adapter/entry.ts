import type { KnifeRuntime } from '../runtime/contracts';
import { createSiteCapabilities } from './capabilities';
import { createReactReader } from './react';

const runtime = (window as unknown as Window & Record<symbol, KnifeRuntime | undefined>)[Symbol.for('cheese-knife.runtime.v1')];
if (runtime?.ownerProtocol === 3 && !runtime.adapter) {
  runtime.adapter = createSiteCapabilities(createReactReader());
  runtime.reconcile();
}

(() => {
  'use strict';
  const storageKey = 'cheese-knife-fixture-state-v1';
  const emptyState = () => ({
    loads: 0,
    pageshowPersisted: 0,
    pagehidePersisted: 0,
    routeHistory: [],
    lastConfigEnvelope: null,
    lastConfigEnvelopeV1: null,
    lastConfigEnvelopeV2: null,
    lastConfigEnvelopeV3: null,
  });
  const readState = () => {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(storageKey));
      return parsed && typeof parsed === 'object' ? { ...emptyState(), ...parsed } : emptyState();
    } catch {
      return emptyState();
    }
  };
  const state = readState();
  state.lastConfigEnvelope = state.lastConfigEnvelopeV1 = state.lastConfigEnvelopeV2 = state.lastConfigEnvelopeV3 = null;
  state.loads += 1;
  state.routeHistory = [...state.routeHistory, location.href].slice(-32);
  const persist = () => sessionStorage.setItem(storageKey, JSON.stringify(state));
  persist();

  Object.defineProperty(window, '__knifeFixture', { value: state, configurable: false, writable: false });
  addEventListener('pageshow', event => {
    if (!event.persisted) return;
    state.pageshowPersisted += 1;
    persist();
  });
  addEventListener('pagehide', event => {
    if (!event.persisted) return;
    state.pagehidePersisted += 1;
    persist();
  });
  addEventListener('message', event => {
    const data = event.data;
    if (event.source !== window || event.origin !== location.origin || !data || data.namespace !== 'cheese-knife' ||
      data.type !== 'config' || typeof data.requestId !== 'string' || !data.requestId.length || data.requestId.length > 128) return;
    const counter = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    if (data.protocol === 1 && counter(data.revision)) {
      state.lastConfigEnvelopeV1 = {requestId:data.requestId,revision:data.revision,load:state.loads};state.lastConfigEnvelope = state.lastConfigEnvelopeV1;
    } else if (data.protocol === 2 || data.protocol === 3) {
      const context = data.context,version = data.version;
      if (!context || typeof context !== 'object' || Array.isArray(context) || Object.keys(context).length !== 4 ||
        !counter(context.documentGeneration) || context.documentGeneration < 1 || !counter(context.playerGeneration) ||
        typeof context.routePath !== 'string' || !context.routePath.startsWith('/') || context.routePath.length > 2048 ||
        context.channelId !== null && !(typeof context.channelId === 'string' && /^[a-f0-9]{32}$/.test(context.channelId)) ||
        !version || typeof version !== 'object' || Array.isArray(version) || Object.keys(version).length !== 2 ||
        version.globalRevision !== null && !counter(version.globalRevision) || version.mediaRevision !== null && !counter(version.mediaRevision) ||
        !counter(data.deliverySequence) || !counter(data.audioBindingGeneration) ||
        !['pending','ready','limited'].includes(data.mediaPhase) || !['global','channel'].includes(data.audioKind) ||
        !['global','channel'].includes(data.videoKind) || !['global','scoped','repair-required'].includes(data.profileState) ||
        !['ready','repair-required'].includes(data.revisionStatus)) return;
      if (data.protocol === 3 && (!['site-legacy','global-owned','channel-owned'].includes(data.gainOrigin) ||
        data.gainOrigin === 'channel-owned' && data.audioKind !== 'channel' ||
        (data.gainOrigin === 'site-legacy') !== (data.effectiveConfig?.gainInherited === true))) return;
      const metadata = {requestId:data.requestId,deliverySequence:data.deliverySequence,load:state.loads,
        context:{documentGeneration:context.documentGeneration,routePath:context.routePath,channelId:context.channelId,playerGeneration:context.playerGeneration},
        version:{globalRevision:version.globalRevision,mediaRevision:version.mediaRevision},audioBindingGeneration:data.audioBindingGeneration,
        mediaPhase:data.mediaPhase,audioKind:data.audioKind,videoKind:data.videoKind,profileState:data.profileState,revisionStatus:data.revisionStatus};
      if (data.protocol === 3) state.lastConfigEnvelopeV3 = {...metadata,gainOrigin:data.gainOrigin};
      else state.lastConfigEnvelopeV2 = metadata;
    } else return;
    persist();
  });
})();

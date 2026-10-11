(() => {
  'use strict';
  const storageKey = 'cheese-knife-fixture-state-v1';
  const emptyState = () => ({
    loads: 0,
    pageshowPersisted: 0,
    pagehidePersisted: 0,
    routeHistory: [],
    lastConfigEnvelope: null,
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
      data.protocol !== 1 || data.type !== 'config' || typeof data.requestId !== 'string' || !Number.isSafeInteger(data.revision)) return;
    state.lastConfigEnvelope = { requestId: data.requestId, revision: data.revision };
    persist();
  });
})();

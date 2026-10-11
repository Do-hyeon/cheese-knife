import type { ResourceScope, ScopeEnvironment } from './contracts';

export function createResourceScope(environment: ScopeEnvironment): ResourceScope {
  const cleanups = new Set<() => void>();
  const controller = new environment.AbortController();
  const scope: ResourceScope = {
    signal: controller.signal,
    disposed: false,
    add(cleanup) {
      if (scope.disposed) { try { cleanup(); } catch {} }
      else cleanups.add(cleanup);
      return cleanup;
    },
    on(target, type, listener, options) {
      if (scope.disposed) return;
      target.addEventListener(type, listener, options);
      scope.add(() => target.removeEventListener(type, listener, options));
    },
    timeout(callback, delay) {
      if (scope.disposed) return 0;
      let id = 0;
      const clear = () => environment.clearTimeout(id);
      id = environment.setTimeout(() => {
        cleanups.delete(clear);
        if (!scope.disposed) callback();
      }, delay);
      scope.add(clear);
      return id;
    },
    interval(callback, delay) {
      if (scope.disposed) return 0;
      const id = environment.setInterval(() => { if (!scope.disposed) callback(); }, delay);
      scope.add(() => environment.clearInterval(id));
      return id;
    },
    observe(observer, target, options) {
      if (scope.disposed) { observer.disconnect(); return; }
      observer.observe(target, options);
      scope.add(() => observer.disconnect());
    },
    dispose() {
      if (scope.disposed) return;
      scope.disposed = true;
      try { controller.abort(); } catch {}
      for (const cleanup of [...cleanups].reverse()) { try { cleanup(); } catch {} }
      cleanups.clear();
    },
  };
  return scope;
}

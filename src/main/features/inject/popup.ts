import type { KnifeRuntime, ResourceScope } from '../../runtime/contracts';
import type { PopupLabels, PopupRegistry } from './contracts';

type BrowserWindow = Window & typeof globalThis;

export function liveURL(target: Window, href: string): URL | null {
  try {
    const url = new URL(href, target.location.origin);
    return url.origin === target.location.origin && /^\/live\/[a-f0-9]{32}\/?$/i.test(url.pathname) ? url : null;
  } catch { return null; }
}

export function createPopupRegistry(runtime: KnifeRuntime, target: Window): PopupRegistry {
  const browser = target as BrowserWindow;
  const popups = new Map<HTMLElement, ResourceScope>();
  let zIndex = 1000;

  const disposePopup = (popup: HTMLElement, player: HTMLIFrameElement, scope: ResourceScope): void => {
    player.src = 'about:blank';
    popup.remove();
    popups.delete(popup);
    if (!scope.disposed) scope.dispose();
  };

  return {
    open(href, left, top, labels) {
      const url = liveURL(target, href);
      if (!url) return null;
      let popup: HTMLElement | null = null, player: HTMLIFrameElement | null = null, scope: ResourceScope | null = null;
      try {
      const createdPopup = popup = browser.document.createElement('div');
      const createdScope = scope = runtime.createScope();
      createdPopup.classList.add('knife-popup');
      createdPopup.style.left = `${left}px`;
      createdPopup.style.top = `${top}px`;
      createdPopup.style.zIndex = `${zIndex++}`;

      const createdPlayer = player = browser.document.createElement('iframe');
      createdPlayer.classList.add('knife-popup-player');
      createdPlayer.src = url.href;
      createdPlayer.allowFullscreen = true;
      createdPlayer.allow = 'autoplay; encrypted-media; picture-in-picture';
      createdPlayer.scrolling = 'no';
      createdPopup.append(createdPlayer);
      createdScope.add(() => { createdPlayer.src = 'about:blank'; createdPopup.remove(); popups.delete(createdPopup); });

      const dragArea = browser.document.createElement('div');
      dragArea.classList.add('knife-popup-drag-area');
      createdPopup.append(dragArea);
      let x = 0, y = 0, stopDrag = (): void => {};
      const finishDrag = (): void => stopDrag();
      createdScope.add(() => finishDrag());
      createdScope.on(target, 'blur', finishDrag);
      createdScope.on(target, 'pagehide', finishDrag);
      createdScope.on(dragArea, 'mousedown', raw => {
        const event = raw as MouseEvent;
        if (event.button !== 0) return;
        event.preventDefault(); stopDrag(); createdPopup.style.zIndex = `${zIndex++}`;
        x = event.clientX; y = event.clientY;
        const move = (rawMove: Event): void => {
          const moveEvent = rawMove as MouseEvent;
          if (!(moveEvent.buttons & 1)) { stopDrag(); return; }
          moveEvent.preventDefault(); browser.document.body.classList.add('knife-dragging');
          const dx = moveEvent.clientX - x, dy = moveEvent.clientY - y;
          x = moveEvent.clientX;
          if (createdPopup.offsetTop + dy < 0) createdPopup.style.top = '0';
          else { y = moveEvent.clientY; createdPopup.style.top = `${createdPopup.offsetTop + dy}px`; }
          createdPopup.style.left = `${createdPopup.offsetLeft + dx}px`;
        };
        const up = (): void => {
          browser.document.removeEventListener('mousemove', move);
          browser.document.removeEventListener('mouseup', up);
          browser.document.body.classList.remove('knife-dragging');
          stopDrag = (): void => {};
        };
        stopDrag = up;
        browser.document.addEventListener('mousemove', move);
        browser.document.addEventListener('mouseup', up);
      });

      const close = browser.document.createElement('button');
      close.classList.add('knife-popup-close-button');
      close.title = labels.close || '';
      close.textContent = 'X';
      createdScope.on(close, 'click', () => createdScope.dispose());
      createdPopup.append(close);
      popups.set(createdPopup, createdScope);
      return createdPopup;
      } catch {
        try { scope?.dispose(); } catch {}
        if (player) player.src = 'about:blank'; popup?.remove();
        return null;
      }
    },
    retireDetached() {
      for (const [popup, scope] of popups) if (!popup.isConnected) {
        try { scope.dispose(); } catch { popups.delete(popup); }
      }
    },
    dispose() {
      for (const [popup, scope] of [...popups]) {
        const player = popup.querySelector('iframe');
        try {
          if (player instanceof browser.HTMLIFrameElement) disposePopup(popup, player, scope);
          else scope.dispose();
        } catch {
          if (player instanceof browser.HTMLIFrameElement) player.src = 'about:blank';
          popup.remove(); popups.delete(popup);
        }
      }
    },
  };
}

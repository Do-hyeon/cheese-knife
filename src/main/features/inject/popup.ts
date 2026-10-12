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
      const popup = browser.document.createElement('div');
      const scope = runtime.createScope();
      popup.classList.add('knife-popup');
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
      popup.style.zIndex = `${zIndex++}`;

      const player = browser.document.createElement('iframe');
      player.classList.add('knife-popup-player');
      player.src = url.href;
      player.allowFullscreen = true;
      player.allow = 'autoplay; encrypted-media; picture-in-picture';
      player.scrolling = 'no';
      popup.append(player);

      const dragArea = browser.document.createElement('div');
      dragArea.classList.add('knife-popup-drag-area');
      popup.append(dragArea);
      let x = 0, y = 0, stopDrag = (): void => {};
      const finishDrag = (): void => stopDrag();
      scope.add(() => finishDrag());
      scope.on(target, 'blur', finishDrag);
      scope.on(target, 'pagehide', finishDrag);
      scope.on(dragArea, 'mousedown', raw => {
        const event = raw as MouseEvent;
        if (event.button !== 0) return;
        event.preventDefault(); stopDrag(); popup.style.zIndex = `${zIndex++}`;
        x = event.clientX; y = event.clientY;
        const move = (rawMove: Event): void => {
          const moveEvent = rawMove as MouseEvent;
          if (!(moveEvent.buttons & 1)) { stopDrag(); return; }
          moveEvent.preventDefault(); browser.document.body.classList.add('knife-dragging');
          const dx = moveEvent.clientX - x, dy = moveEvent.clientY - y;
          x = moveEvent.clientX;
          if (popup.offsetTop + dy < 0) popup.style.top = '0';
          else { y = moveEvent.clientY; popup.style.top = `${popup.offsetTop + dy}px`; }
          popup.style.left = `${popup.offsetLeft + dx}px`;
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
      scope.on(close, 'click', () => scope.dispose());
      popup.append(close);
      scope.add(() => { player.src = 'about:blank'; popup.remove(); popups.delete(popup); });
      popups.set(popup, scope);
      return popup;
    },
    retireDetached() {
      for (const [popup, scope] of popups) if (!popup.isConnected) scope.dispose();
    },
    dispose() {
      for (const [popup, scope] of [...popups]) {
        const player = popup.querySelector('iframe');
        if (player instanceof browser.HTMLIFrameElement) disposePopup(popup, player, scope);
        else scope.dispose();
      }
    },
  };
}

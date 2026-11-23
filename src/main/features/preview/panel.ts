import type { KnifeRuntime, ResourceScope } from '../../runtime/contracts';
import type { PreviewDiagnosticEvent, PreviewDiagnostics } from './contracts';

type MutableDiagnostics = PreviewDiagnostics & { events: PreviewDiagnosticEvent[] };

export interface PreviewPanel {
  readonly diagnostics: MutableDiagnostics;
  root: HTMLDivElement | null;
  image: HTMLImageElement | null;
  player: HTMLDivElement | null;
  uptime: HTMLDivElement | null;
  audioNote: HTMLDivElement | null;
  ensure(): void;
  place(anchor: HTMLAnchorElement, tooltip: boolean, configuredWidth: number): void;
  setImage(source: string | null): void;
  setUptime(text: string): void;
  show(): void;
  hide(): void;
  dispose(): void;
}

export function createPanel(runtime: KnifeRuntime, scope: ResourceScope): PreviewPanel {
  const document = runtime.state.body?.ownerDocument || window.document;
  const target = document.defaultView || window;
  const panel: PreviewPanel = {
    diagnostics: { events: [] }, root: null, image: null, player: null, uptime: null, audioNote: null,
    ensure() {
      if (panel.root?.isConnected) return;
      const root = document.createElement('div'); root.className = 'knife-preview knife-owned'; root.hidden = true;
      const image = document.createElement('img'); image.alt = '';
      const player = document.createElement('div'); player.className = 'knife-preview-player';
      const uptime = document.createElement('div'); uptime.className = 'knife-preview-uptime';
      const audioNote = document.createElement('div'); audioNote.className = 'knife-preview-audio-note'; audioNote.hidden = true;
      root.append(image, player, uptime, audioNote); document.body.append(root);
      panel.root = root; panel.image = image; panel.player = player; panel.uptime = uptime; panel.audioNote = audioNote;
    },
    place(anchor, tooltip, configuredWidth) {
      panel.ensure();
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(Math.max(configuredWidth, rect.width), target.innerWidth - 32);
      panel.root!.style.position = 'fixed'; panel.root!.style.width = `${width}px`;
      panel.root!.style.left = `${Math.max(16, Math.min(rect.left, target.innerWidth - width - 16))}px`;
      panel.root!.style.top = `${Math.max(0, Math.min(tooltip ? rect.bottom : rect.top, target.innerHeight - width * 9 / 16))}px`;
    },
    setImage(source) {
      panel.ensure();
      if (source) panel.image!.src = source.replace('{type}', '480');
      else panel.image!.removeAttribute('src');
    },
    setUptime(text) { panel.ensure(); panel.uptime!.textContent = text; },
    show() { panel.ensure(); panel.root!.hidden = false; },
    hide() {
      if (!panel.root) return;
      panel.root.hidden = true; panel.image!.removeAttribute('src'); panel.audioNote!.hidden = true;
    },
    dispose() {
      panel.root?.remove();
      panel.root = null; panel.image = null; panel.player = null; panel.uptime = null; panel.audioNote = null;
    },
  };
  scope.add(() => panel.dispose());
  return panel;
}

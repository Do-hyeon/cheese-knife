import type { KnifeRuntime } from '../../runtime/contracts';
import type { VideoFilterController } from './contracts';

export function installVideoFilters(target: Window): VideoFilterController | null {
  const browser = target as Window & typeof globalThis;
  const runtime = Object.getOwnPropertyDescriptor(target, browser.Symbol.for('cheese-knife.runtime.v1'))?.value as KnifeRuntime | undefined;
  if (runtime?.ownerProtocol !== 2 || runtime.filters) return null;
  const document = target.document;
  type Renderer = { svg: SVGSVGElement; filter: SVGFilterElement };
  let global: Renderer | null = null, channel: Renderer | null = null, disposed = false;
  let element: HTMLElement | null = null, slot: string | null = null, body: HTMLElement | null = null, ownsBodyClass = false;
  const svgNamespace = ['http:', '', 'www.w3.org', '2000', 'svg'].join(String.fromCharCode(47));
  const create = <K extends keyof SVGElementTagNameMap>(tag: K) => document.createElementNS(svgNamespace, tag) as SVGElementTagNameMap[K];
  const owned = (renderer: Renderer) => renderer.svg.isConnected && renderer.filter.parentNode === renderer.svg &&
    (document.getElementById(renderer.filter.id) as Element | null) === renderer.filter;
  function renderer(id: string, existing: Renderer | null): Renderer | null {
    if (existing) return owned(existing) ? existing : null;
    if (document.getElementById(id) || !document.body) return null;
    const svg = create('svg'), filter = create('filter');svg.classList.add('knife-owned');svg.style.display = 'none';
    filter.id = id;svg.append(filter);document.body.append(svg);return { svg, filter };
  }
  function render(filter: SVGFilterElement, values: KnifeVideoValues): boolean {
    const children: SVGElement[] = [];
    for (const [kind, value] of [['brightness', values.brightness], ['contrast', values.contrast], ['gamma', values.gamma]] as const) {
      if (value === 1) continue;
      const transfer = create('feComponentTransfer');
      for (const tag of ['feFuncR','feFuncG','feFuncB'] as const) {
        const fn = create(tag);fn.setAttribute('type', kind === 'gamma' ? 'gamma' : 'linear');
        if (kind === 'gamma') fn.setAttribute('exponent', String(value));
        else { fn.setAttribute('slope', String(value));if (kind === 'contrast') fn.setAttribute('intercept', String(-value / 2 + 0.5)); }
        transfer.append(fn);
      }
      children.push(transfer);
    }
    if (values.saturation !== 1) {
      const matrix = create('feColorMatrix');matrix.setAttribute('type','saturate');matrix.setAttribute('values',String(values.saturation));children.push(matrix);
    }
    if (values.sharpness > 0) {
      const amount = Number((values.sharpness / 5).toFixed(2)),matrix = create('feConvolveMatrix');
      matrix.setAttribute('preserveAlpha','true');matrix.setAttribute('kernelMatrix',`0 ${-amount} 0 ${-amount} ${1 + amount * 4} ${-amount} 0 ${-amount} 0`);children.push(matrix);
    }
    filter.replaceChildren(...children);return children.length > 0;
  }
  function retireChannel() {
    if (element) {
      if (element.getAttribute('data-knife-channel-filter') === 'owned') element.removeAttribute('data-knife-channel-filter');
      if (element.style.getPropertyValue('--knife-channel-filter') === slot) element.style.removeProperty('--knife-channel-filter');
    }
    element = null;slot = null;
    if (channel && owned(channel)) channel.svg.remove();channel = null;
  }
  const controller: VideoFilterController = {
    reconcile(base, values, filterTarget) {
      if (disposed) return;
      if (KnifeMediaProfiles.validateValues('video',base).ok) {
        global = renderer('knifeFilter',global);
        if (global) {
          const active = render(global.filter,base);
          if (body !== document.body) {
            if (ownsBodyClass) body?.classList.remove('knife-filter');body = document.body;ownsBodyClass = false;
          }
          if (active && body && !body.classList.contains('knife-filter')) { body.classList.add('knife-filter');ownsBodyClass = true; }
          else if (!active && ownsBodyClass) { body?.classList.remove('knife-filter');ownsBodyClass = false; }
        }
      }
      const validTarget = !!values && filterTarget instanceof browser.HTMLElement && filterTarget.isConnected &&
        runtime.selectPlayer()?.filterTarget === filterTarget;
      if (element !== filterTarget || !values || !validTarget) retireChannel();
      if (!values || !validTarget || !KnifeMediaProfiles.validateValues('video',values).ok) return;
      const current = filterTarget as HTMLElement;
      if (element && (current.getAttribute('data-knife-channel-filter') !== 'owned' || current.style.getPropertyValue('--knife-channel-filter') !== slot)) {
        retireChannel();return;
      }
      if (!element && (current.hasAttribute('data-knife-channel-filter') || current.style.getPropertyValue('--knife-channel-filter') || current.style.filter)) return;
      channel = renderer('knifeChannelFilter',channel);if (!channel) return;
      slot = render(channel.filter,values) ? 'url(#knifeChannelFilter)' : 'none';element = current;
      current.setAttribute('data-knife-channel-filter','owned');current.style.setProperty('--knife-channel-filter',slot);
    },
    dispose() {
      if (disposed) return;disposed = true;retireChannel();
      if (global && owned(global)) global.svg.remove();if (ownsBodyClass) body?.classList.remove('knife-filter');
      target.removeEventListener('pagehide',onHide);
    },
  };
  const onHide = (event: PageTransitionEvent) => { if (!event.persisted) controller.dispose(); };
  target.addEventListener('pagehide',onHide);runtime.filters = controller;return controller;
}

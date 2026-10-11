import type { Route } from '../runtime/contracts';
import type { SiteSnapshot } from './contracts';
import { ownData, type ReactReader } from './react';

const discoverySelector = '#root, #layout-body, #sidebar, #live_player_layout, #player_layout, .pzp-pc, .pzp-pc__video, .pzp-pc__bottom-buttons-left, #license, aside[aria-label="사이드바"]';

export function affectsSiteDiscovery(node: Element): boolean {
  try { return node.matches(discoverySelector) || !!node.querySelector(discoverySelector) || !!node.closest('.pzp-pc__bottom-buttons-left'); }
  catch { return false; }
}

export function discoverSite(document: Document, route: Route, reader: ReactReader): SiteSnapshot {
  const root = document.getElementById('root');
  const body = document.getElementById('layout-body');
  const sidebar = document.getElementById('sidebar') || document.querySelector('aside[aria-label="사이드바"]');
  if ((route.kind !== 'live' && route.kind !== 'vod') || !body) return { root, body, sidebar, player: null };
  const layout = document.getElementById(route.kind === 'live' ? 'live_player_layout' : 'player_layout');
  const container = layout || body;
  const candidates = [...container.querySelectorAll('.pzp-pc')].filter(node => !node.closest('.knife-preview, .knife-popup'));
  if (container.matches('.pzp-pc')) candidates.unshift(container);
  if (candidates.length !== 1 || !candidates[0]) return { root, body, sidebar, player: null };
  const pzp = candidates[0];
  const video = pzp.querySelector<HTMLVideoElement>('.pzp-pc__video video') || pzp.querySelector<HTMLVideoElement>('video');
  const playerLayout = layout || pzp.parentElement;
  return { root, body, sidebar, player: { layout: playerLayout, pzp, video,
    vue: !!ownData(pzp, '__vue__')?.value, reactOnLayout: !!reader.fiberOf(playerLayout) } };
}

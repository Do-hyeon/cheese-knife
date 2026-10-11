import type { Route } from '../runtime/contracts';
import type { SiteSnapshot } from './contracts';

export function discoverSite(document: Document, route: Route): SiteSnapshot {
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
  return { root, body, sidebar, player: { layout: layout || pzp.parentElement, pzp, video } };
}

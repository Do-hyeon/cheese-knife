import type { Route } from './contracts';

const excluded = /^\/(?:chat|donation|video-donation|mission-donation|party-donation|gift-effect|product-purchase|embed|error|subs_integration|event|partner|clip-editor|account-interlock|watchparty-source|prime|settings|broadcast-information|close)(?:\/|$)/;

export function parseRoute(pathname: string): Route {
  if (excluded.test(pathname) || /\/profile\//.test(pathname)) return { kind: 'excluded', path: pathname };
  const live = pathname.match(/^\/live\/([a-f0-9]{32})(?:\/chat)?\/?$/i);
  if (live?.[1]) return { kind: 'live', id: live[1], path: pathname };
  const vod = pathname.match(/^\/video\/(\d+)\/?$/);
  if (vod?.[1]) return { kind: 'vod', id: vod[1], path: pathname };
  const channel = pathname.match(/^\/([a-f0-9]{32})(?:\/(?:videos|clips|community))?\/?$/i);
  return channel?.[1] ? { kind: 'channel', id: channel[1], path: pathname } : { kind: 'explore', path: pathname };
}

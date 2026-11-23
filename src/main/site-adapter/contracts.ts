import type { PlayerSnapshot, Route } from '../runtime/contracts';

export interface SiteSnapshot {
  root: Element | null;
  body: HTMLElement | null;
  sidebar: Element | null;
  player: PlayerSnapshot | null;
}

export interface ChatMessageSnapshot {
  identity: number;
  key: string | null;
  user: string | null;
  time: string | number | null;
  playerTime: number | null;
  type: number | null;
  status: string | null;
  content: string | number | null;
}

export interface BlindEventSnapshot {
  messageTime: string | number | null;
  userId: string | null;
  blindType: string | null;
}

export interface SitePlayerMetrics { codec: string | null }

export type ChatRouteKind = 'live' | 'vod';
export type SidebarSectionKind = 'popular' | 'schedule' | 'partner' | 'shortcut';

export interface FollowingControls {
  section: Element;
  more: HTMLButtonElement | null;
  fold: HTMLButtonElement | null;
  refresh: HTMLButtonElement | null;
}

export type StartTimeTarget =
  | { kind: 'live'; node: HTMLElement }
  | { kind: 'vod'; node: HTMLElement; link: HTMLAnchorElement; id: string };

export interface OwnedBinding {
  readonly active: boolean;
  dispose(): void;
}

export interface BlindTransition {
  event: BlindEventSnapshot | null;
  before: ChatMessageSnapshot | null;
  after: ChatMessageSnapshot | null;
  replaceAfterStatus(expected: ChatMessageSnapshot, nextStatus: string): ChatMessageSnapshot | null;
}

export interface ChatControllerPort {
  readonly active: boolean;
  emptyStatus(): string | null;
  messages(): readonly ChatMessageSnapshot[];
  installMessageFilter(block: (message: ChatMessageSnapshot | null) => boolean): OwnedBinding | null;
  installBlindListener(handler: (transition: BlindTransition) => void): OwnedBinding | null;
  replaceStatus(expected: ChatMessageSnapshot, nextStatus: string): ChatMessageSnapshot | null;
  dispose(): void;
}

export interface SiteAdapter {
  discover(root: Document, route: Route): SiteSnapshot;
  affectsDiscovery(node: Element, target?: Element): boolean;
  chat: {
    findContainer(body: Element, kind: ChatRouteKind): Element | null;
    findLogRoot(container: Element): Element | null;
    messageRows(root: Element): readonly Element[];
    timestampTarget(row: Element): HTMLElement | null;
    deletedTextTargets(row: Element): readonly HTMLElement[];
    readMessage(row: Element): ChatMessageSnapshot | null;
    connect(container: Element): ChatControllerPort | null;
  };
  sidebar: {
    sections(root: Element): readonly Element[];
    classify(section: Element): SidebarSectionKind | null;
    following(root: Element): FollowingControls | null;
    viewMode(body: HTMLElement | null, player: Element | null, route: Route): boolean | null;
  };
  page: {
    channelTabs(body: Element, route: Route): Element | null;
    startTarget(target: EventTarget | null, route: Route): StartTimeTarget | null;
    bannerRoot(body: Element): Element | null;
  };
  banner: { closeHandler(node: Element): (() => unknown) | null };
  video: { openDate(node: Element): string | null };
  player: { readMetrics(layout: Element): Promise<SitePlayerMetrics | null> };
}

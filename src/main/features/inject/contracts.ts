import type { KnifeRuntime, ResourceScope, RuntimeState } from '../../runtime/contracts';
import type { PreviewController } from '../preview/contracts';

export type RuntimeConfig = Record<string, unknown>;
export interface PopupLabels { close?: string }
export interface RuntimeLabels extends PopupLabels { chat?: string; liveStart?: string }

export interface PopupRegistry {
  open(url: string, left: number, top: number, labels: PopupLabels): HTMLElement | null;
  retireDetached(): void;
  dispose(): void;
}

export interface ChatFeature {
  reconcile(container: Element | null, isLive: boolean, owner: ResourceScope, config: RuntimeConfig): void;
  dispose(): void;
}

export interface SidebarFeature {
  reconcile(root: Element | null, state: RuntimeState, owner: ResourceScope | null, config: RuntimeConfig): void;
  dispose(): void;
}

export interface PageFeature {
  mountOwner(state: RuntimeState, owner: ResourceScope, config: RuntimeConfig, labels: RuntimeLabels): void;
  reconcileChannel(state: RuntimeState, owner: ResourceScope): void;
  reconcileBanner(state: RuntimeState, owner: ResourceScope): void;
  dispose(): void;
}

export interface InjectDependencies {
  runtime: KnifeRuntime;
  preview: () => PreviewController | undefined;
}

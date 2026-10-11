type KnifeScalar = boolean | number;
type KnifeUnknownRecord = Record<string, unknown>;

type KnifeBooleanConfig = {
  id: string;
  defaultValue: boolean;
  type?: never;
  configs?: never;
};
type KnifeRangeConfig = {
  id: string;
  defaultValue: number;
  type: 'range';
  min: number;
  max: number;
  step?: number;
  digits?: number;
  unit?: string;
  configs?: never;
};
type KnifeConfigLeaf = KnifeBooleanConfig | KnifeRangeConfig;
type KnifeConfigDetails = { id: string; type: 'details'; configs: KnifeConfigLeaf[]; defaultValue?: never };

type KnifeConfigGroup = {
  id: string;
  configs: Array<KnifeConfigLeaf | KnifeConfigDetails>;
};

type KnifePlainStyleField = {
  id: string;
  type?: never;
};
type KnifeRangeStyleField = {
  id: string;
  type: 'range';
  min: number;
  max: number;
  step?: number;
};
type KnifeStyleField = KnifePlainStyleField | KnifeRangeStyleField;
type KnifeStyleGroup = { id: string; styles: KnifeStyleField[] };

type KnifeSettingsOperation =
  | { type: 'config'; id: string; value: KnifeScalar }
  | { type: 'style'; id: string; enabled: boolean }
  | { type: 'parameter'; id: string; value: number };

type KnifeCssState = { state: 'pending' | 'ready' | 'failed'; code: string | null };
type KnifeSettingsSnapshot = {
  revision: number;
  config: Record<string, KnifeScalar>;
  styles: string[];
  styleParameters: Record<string, number>;
  css: KnifeCssState;
};

type KnifeSettingsView = {
  snapshot: KnifeSettingsSnapshot | null;
  values: Pick<KnifeSettingsSnapshot, 'config' | 'styles' | 'styleParameters'>;
  phase: 'loading' | 'saving' | 'unknown' | 'failed' | 'repair-required' | 'ready';
  css: KnifeCssState;
  pendingKeys: string[];
  code: string | null | undefined;
};

type KnifeFailure = { ok: false; code: string };
type KnifeOperationsResult = KnifeFailure | { ok: true; operations: KnifeSettingsOperation[] };
type KnifeSettingsAction = 'get-snapshot' | 'patch' | 'reload-target';
type KnifeSettingsRequestBase = {
  namespace: 'cheese-knife-settings';
  protocol: 1;
  requestId: string;
};
type KnifeSettingsRequest =
  | (KnifeSettingsRequestBase & { action: 'get-snapshot' })
  | (KnifeSettingsRequestBase & { action: 'patch'; operations: KnifeSettingsOperation[] })
  | (KnifeSettingsRequestBase & { action: 'reload-target'; targetTabId: number; targetWindowId: number });
type KnifeRequestResult = KnifeFailure | { ok: true; request: KnifeSettingsRequest };
type KnifeSettingsReply = KnifeUnknownRecord & {
  ok: boolean;
  requestId: string;
  code?: string | null;
  stage?: string | null;
  stored?: boolean;
  revision?: number;
  snapshot?: KnifeSettingsSnapshot;
  css?: KnifeCssState;
};
type KnifePatchReply = KnifeSettingsReply & { revision: number; stored?: boolean; css?: KnifeCssState };
type KnifeTransportResult = { reply: KnifeSettingsReply; requestSequence: number };
type KnifeTransport = { promise: Promise<KnifeTransportResult>; requestSequence: number };
type KnifePendingEntry = { op: KnifeSettingsOperation; generation: number; status: 'pending' | 'sent' | 'unknown' | 'held' };
type KnifeConfirmedEntry = { op: KnifeSettingsOperation; revision: number };
type KnifePhase = KnifeSettingsView['phase'];
type KnifeCodedError = Error & { code: string; stage?: string };
type KnifeJob = { work: () => Promise<unknown>; resolve: (value: unknown) => void; reject: (reason?: unknown) => void };

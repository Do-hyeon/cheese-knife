type KnifeScalar = boolean | number;
type KnifeUnknownRecord = Record<string, unknown>;

type KnifeBooleanConfig = { id: string; defaultValue: boolean; type?: never; configs?: never };
type KnifeRangeConfig = { id: string; defaultValue: number; type: 'range'; min: number; max: number; step?: number; digits?: number; unit?: string; configs?: never };
type KnifeConfigLeaf = KnifeBooleanConfig | KnifeRangeConfig;
type KnifeConfigDetails = { id: string; type: 'details'; configs: KnifeConfigLeaf[]; defaultValue?: never };
type KnifeConfigGroup = { id: string; configs: Array<KnifeConfigLeaf | KnifeConfigDetails> };

type KnifePlainStyleField = { id: string; type?: never };
type KnifeRangeStyleField = { id: string; type: 'range'; min: number; max: number; step?: number };
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
type KnifeSettingsRequestBase = { namespace: 'cheese-knife-settings'; protocol: 1; requestId: string };
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
  reloaded?: boolean;
  appliedStyles?: string[];
};
type KnifeTransportResult = { reply: KnifeSettingsReply; requestSequence: number };
type KnifeTransport = { promise: Promise<KnifeTransportResult>; requestSequence: number };
type KnifePendingEntry = { op: KnifeSettingsOperation; generation: number; status: 'pending' | 'sent' | 'unknown' | 'held' };
type KnifeConfirmedEntry = { op: KnifeSettingsOperation; revision: number };
type KnifePhase = KnifeSettingsView['phase'];
type KnifeCodedError = Error & { code: string; stage?: string };
type KnifeJob = { work: () => Promise<unknown>; resolve: (value: unknown) => void; reject: (reason?: unknown) => void };
type KnifeMergeResult = { changes: KnifeUnknownRecord; revision: number; stylesTouched: boolean };

var KnifeSettingsContract = (() => {
  const configFields = new Map<string, KnifeConfigLeaf>(CONFIGS.flatMap(c => c.configs.flatMap(f => f.configs || [f])).map(f => [f.id, f]));
  const styleFields = new Map<string, KnifeStyleField>(STYLES.flatMap(c => c.styles).map(f => [f.id, f]));
  const record = (value: unknown): KnifeUnknownRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as KnifeUnknownRecord : {};
  const shape = (value: unknown, keys: string[]) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
  const fail = (code: string): KnifeFailure => ({ ok: false, code });
  const error = (code: string): KnifeCodedError => Object.assign(new Error(code), { code });
  const numeric = (value: unknown, field: KnifeRangeConfig | KnifeRangeStyleField): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= field.min && value <= field.max;

  function validateOperations(operations: unknown): KnifeOperationsResult {
    if (!Array.isArray(operations) || operations.length > 64) return fail('invalid-operations');
    for (const op of operations as KnifeUnknownRecord[]) {
      if (!op || typeof op.id !== 'string') return fail('invalid-operation');
      if (op.type === 'config') {
        const field = configFields.get(op.id);
        if (!shape(op, ['type', 'id', 'value']) || !field ||
          !(field.type === 'range' ? numeric(op.value, field) : typeof op.value === 'boolean')) return fail('invalid-operation');
      } else if (op.type === 'style') {
        const field = styleFields.get(op.id);
        if (!shape(op, ['type', 'id', 'enabled']) || !field || field.type || typeof op.enabled !== 'boolean') return fail('invalid-operation');
      } else if (op.type === 'parameter') {
        const field = styleFields.get(op.id);
        if (!shape(op, ['type', 'id', 'value']) || field?.type !== 'range' || !numeric(op.value, field)) return fail('invalid-operation');
      } else return fail('invalid-operation');
    }
    return { ok: true, operations: operations.map(op => ({ ...op })) as KnifeSettingsOperation[] };
  }

  function validateRequest(message: unknown, sender: chrome.runtime.MessageSender | null | undefined, extensionId: string, getURL: (path: string) => string): KnifeRequestResult {
    if (!sender || typeof extensionId !== 'string' || !extensionId || sender.id !== extensionId ||
      typeof sender.url !== 'string' || (sender.frameId !== undefined && sender.frameId !== 0)) return fail('invalid-sender');
    try {
      const url = new URL(sender.url);
      const allowed = ['popup.html', 'styles.html'].some(path => {
        const own = new URL(getURL(path));
        return url.protocol === own.protocol && url.host === own.host && url.pathname === own.pathname;
      });
      if (!allowed) return fail('invalid-sender');
    } catch { return fail('invalid-sender'); }
    if (!message || (message as KnifeUnknownRecord).namespace !== 'cheese-knife-settings' || (message as KnifeUnknownRecord).protocol !== 1 ||
      typeof (message as KnifeUnknownRecord).requestId !== 'string' || !((message as KnifeUnknownRecord).requestId as string).length ||
      ((message as KnifeUnknownRecord).requestId as string).length > 128) return fail('invalid-request');
    const keys = ['namespace', 'protocol', 'action', 'requestId'];
    if ((message as KnifeUnknownRecord).action === 'patch') {
      if (!shape(message, [...keys, 'operations'])) return fail('invalid-request');
      const result = validateOperations((message as KnifeUnknownRecord).operations);
      if (!result.ok) return result;
      return { ok: true, request: { ...(message as KnifeUnknownRecord), operations: result.operations } as KnifeSettingsRequest };
    }
    if ((message as KnifeUnknownRecord).action === 'reload-target') {
      if (!shape(message, [...keys, 'targetTabId', 'targetWindowId']) ||
        ![(message as KnifeUnknownRecord).targetTabId, (message as KnifeUnknownRecord).targetWindowId].every(v => Number.isSafeInteger(v) && (v as number) >= 0)) return fail('invalid-request');
    } else if ((message as KnifeUnknownRecord).action !== 'get-snapshot' || !shape(message, keys)) return fail('invalid-request');
    return { ok: true, request: { ...(message as KnifeUnknownRecord) } as KnifeSettingsRequest };
  }

  function readRevision(value: unknown): number {
    if (value === undefined) return 0;
    if (!Number.isSafeInteger(value) || (value as number) < 0) throw error('revision-invalid');
    if (value === Number.MAX_SAFE_INTEGER) throw error('revision-exhausted');
    return value as number;
  }
  const sameRecord = (a: KnifeUnknownRecord, b: KnifeUnknownRecord) => Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(([key, value]) => Object.hasOwn(b, key) && Object.is(value, Object.getOwnPropertyDescriptor(b, key)?.value));
  const sameArray = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((value, index) => Object.is(value, b.at(index)));

  function mergeOperations(raw: KnifeUnknownRecord, operations: KnifeSettingsOperation[]): KnifeMergeResult {
    const valid = validateOperations(operations);
    if (!valid.ok) throw error(valid.code);
    const revision = readRevision(raw.settingsRevision);
    const oldConfig = record(raw.config), oldParameters = record(raw.styleParameters);
    const oldStyles = Array.isArray(raw.styles) ? raw.styles : [];
    const config = { ...oldConfig }, styleParameters = { ...oldParameters };
    let styles = [...oldStyles], stylesTouched = operations.length === 0;
    const setStyle = (id: string, enabled: boolean) => {
      if (enabled) { if (!styles.includes(id)) styles.push(id); }
      else styles = styles.filter(value => value !== id);
    };
    for (const op of valid.operations) {
      if (op.type === 'config') config[op.id] = op.value;
      else {
        stylesTouched = true;
        if (op.type === 'style') setStyle(op.id, op.enabled);
        else { styleParameters[op.id] = op.value; setStyle(op.id, op.value !== 0); }
      }
    }
    const changes: KnifeUnknownRecord = {};
    if (!sameRecord(config, oldConfig)) changes.config = config;
    if (!sameArray(styles, oldStyles)) changes.styles = styles;
    if (!sameRecord(styleParameters, oldParameters)) changes.styleParameters = styleParameters;
    if (Object.keys(changes).length) changes.settingsRevision = revision + 1;
    return { changes, revision: (changes.settingsRevision as number | undefined) ?? revision, stylesTouched };
  }

  function cssFiles(styles: unknown): string[] {
    const selected = new Set(Array.isArray(styles) ? styles : []);
    return [...styleFields.keys()].filter(id => selected.has(id)).map(id => `styles/${id}.css`);
  }
  function makeSnapshot(raw: KnifeUnknownRecord, css: KnifeCssState): KnifeSettingsSnapshot {
    const source = record(raw.styleParameters), entries: [string, number][] = [];
    for (const [id, field] of styleFields) {
      const value = Object.getOwnPropertyDescriptor(source, id)?.value;
      if (field.type === 'range' && numeric(value, field)) entries.push([id, value]);
    }
    const styleParameters = Object.fromEntries(entries);
    return { revision: readRevision(raw.settingsRevision), config: normalizeConfig(raw.config),
      styles: cssFiles(raw.styles).map(file => file.slice(7, -4)), styleParameters, css: { ...css } };
  }
  return { validateOperations, validateRequest, readRevision, mergeOperations, makeSnapshot, cssFiles };
})();

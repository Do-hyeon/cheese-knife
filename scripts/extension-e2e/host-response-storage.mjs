import { createHash } from 'node:crypto';
import { types } from 'node:util';

const limit = 96 * 1024 * 1024;
const failureCodes = new WeakMap();
const failure = code => { const error = Error('host-response-storage-' + code); failureCodes.set(error, code); return error; };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// JSON values only; object identity, prototypes and descriptor flags are outside this contract.
function encodeResponse(source, check) {
  const active = new Set();
  const copy = value => {
    check();
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
    if (!value || typeof value !== 'object' || types.isProxy(value) || active.has(value)) throw failure('json');
    const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
    if (prototype !== (array ? Array.prototype : Object.prototype)) throw failure('json');
    const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable && !(array && key === 'length')) throw failure('json');
    }
    active.add(value);
    let result;
    if (array) {
      const length = descriptors.length.value;
      if (keys.length !== length + 1) throw failure('json');
      result = []; Object.setPrototypeOf(result, null);
      for (let index = 0; index < length; index++) {
        if (!Object.hasOwn(descriptors, String(index))) throw failure('json');
        result[index] = copy(descriptors[index].value);
      }
    } else {
      result = Object.create(null);
      for (const key of keys) result[key] = copy(descriptors[key].value);
    }
    active.delete(value); return result;
  };
  const value = copy(source), bytes = Buffer.from(JSON.stringify(value) + '\n', 'utf8');
  check();
  return { value, bytes };
}

/** Selected scenario file payloads only: no trace, profile, candidate, report, heap or physical-disk bound. */
export function createHostResponseStorage({ files, directory, runId, caseId, first, onReceipt, onSecondary }) {
  const filename = directory + '/first-host-response.json', attempts = new Map();
  let deadline = null, chargedBytes = 0, claimsClosed = false, prepared = false, firstToken = null;
  let plan = null, preparationReason = null, task = null, terminal = null;
  const abort = new AbortController();
  const check = () => {
    if (abort.signal.aborted || !Number.isFinite(deadline) || performance.now() >= deadline) throw failure('deadline');
  };
  const secondary = error => { try { onSecondary(error); } catch { /* FIRST remains authoritative. */ } };
  const claim = (relative, data, reserved = false) => {
    if (typeof relative !== 'string' || !relative.startsWith(directory + '/') || relative.includes('\\') || relative.split('/').some(part => !part || part === '.' || part === '..') || relative === filename && !reserved) throw failure('path');
    if (attempts.has(relative)) throw failure('duplicate');
    if (claimsClosed) throw failure('closed');
    const row = { path: relative, bytes: 0, state: 'REJECTED', buffer: null, dispatched: false };
    attempts.set(relative, row);
    check();
    if (typeof data !== 'string' && !Buffer.isBuffer(data) && !(data instanceof Uint8Array)) throw failure('data');
    const bytes = Buffer.from(data);
    check();
    if (bytes.length > limit - chargedBytes) throw failure('capacity');
    row.buffer = bytes; row.bytes = bytes.length; row.state = 'CLAIMED'; chargedBytes += bytes.length;
    return row;
  };
  const dispatch = async (row, control) => {
    if (row.dispatched) throw failure('duplicate');
    row.dispatched = true;
    try {
      check(); row.state = 'WRITING';
      const result = await files.writeFile(row.path, row.buffer, { flag: 'wx' }, control);
      check(); row.state = 'DONE'; return result;
    } catch (error) { row.state = 'FAILED'; throw error; }
  };
  const budget = () => Object.freeze({ limit, chargedBytes, attemptedFiles: attempts.size, claimsClosed,
    pendingFiles: [...attempts.values()].filter(row => row.state === 'CLAIMED' || row.state === 'WRITING').length });
  const settle = (status, reason, verifiedAt = null) => {
    if (terminal !== null) return terminal;
    if (status === 'CONFIRMED' && verifiedAt >= deadline) { status = 'REJECTED'; reason = 'deadline'; verifiedAt = null; }
    terminal = Object.freeze({ schema: 'f01-host-response-storage-v1', nativeSeal: 'UNFORMED', status, reason,
      runId, caseId, file: filename, firstAt: firstToken?.firstAt ?? null, deadline,
      bytes: plan?.bytes ?? 0, sha256: plan?.sha256 ?? null, verifiedAt, chargedBytesAtDecision: chargedBytes, limit });
    try { onReceipt(terminal); } catch (error) { secondary(error); }
    return terminal;
  };
  const start = () => {
    if (task !== null) return task;
    const owner = first();
    if (owner === null) return Promise.resolve(null);
    firstToken ??= owner;
    let done;
    task = new Promise(resolve => { done = resolve; });
    if (!prepared || preparationReason !== null || plan === null) {
      done(settle('REJECTED', preparationReason ?? 'no-response')); return task;
    }
    const remaining = Math.floor(deadline - performance.now());
    if (remaining < 1) { done(settle('REJECTED', 'deadline')); return task; }
    const timer = setTimeout(() => { abort.abort(); done(settle('REJECTED', 'deadline')); }, remaining);
    queueMicrotask(async () => {
      try {
        if (terminal !== null) return;
        check();
        if (first() !== firstToken) throw failure('first');
        await dispatch(plan.row, { deadline, signal: abort.signal, onFailure: secondary });
        check();
        let length = 0;
        const hash = createHash('sha256');
        for await (const data of files.readChunks(filename, { signal: abort.signal })) {
          check();
          const chunk = Buffer.from(data);
          if (chunk.length > plan.bytes - length || !chunk.equals(plan.row.buffer.subarray(length, length + chunk.length))) throw failure('readback');
          hash.update(chunk); length += chunk.length;
        }
        check();
        if (length !== plan.bytes || hash.digest('hex') !== plan.sha256 || first() !== firstToken) throw failure('readback');
        settle('CONFIRMED', null, performance.now());
      } catch (error) {
        secondary(error);
        const code = failureCodes.get(error);
        settle('REJECTED', ['deadline', 'first', 'readback'].includes(code) ? code : 'io');
      } finally { clearTimeout(timer); done(terminal); }
    });
    return task;
  };
  return Object.freeze({
    beginScenario() {
      if (deadline !== null || first() !== null) throw failure('begin');
      deadline = performance.now() + 90000; return deadline;
    },
    writeFile(relative, data, options, control) {
      if (options?.flag !== 'wx' || options.encoding !== undefined && options.encoding !== 'utf8' || control?.deadline !== deadline) throw failure('write');
      return dispatch(claim(relative, data), control);
    },
    captureFirst(error, response, present) {
      if (prepared) throw failure('duplicate');
      prepared = true; firstToken = first();
      if (firstToken === null || firstToken.authority !== 'source' || !Object.is(error, firstToken.error)) throw failure('first');
      if (claimsClosed) {
        preparationReason = 'closed'; queueMicrotask(() => { void start(); });
        return { response: null, available: false, snapshotError: 'storage-closed' };
      }
      if (!present) { preparationReason = 'no-response'; return { response: null, available: false, snapshotError: null }; }
      let encoded;
      try { encoded = encodeResponse(response, check); }
      catch (error) { preparationReason = failureCodes.get(error) === 'deadline' ? 'deadline' : 'json'; return { response: null, available: false, snapshotError: preparationReason }; }
      try {
        const row = claim(filename, encoded.bytes, true), sha256 = digest(row.buffer);
        check(); plan = { row, bytes: row.bytes, sha256 };
      } catch (error) { const code = failureCodes.get(error); preparationReason = code === 'capacity' ? 'capacity' : code === 'deadline' ? 'deadline' : 'prepare'; }
      return { response: encoded.value, available: true, snapshotError: null };
    },
    start,
    finish() { claimsClosed = true; return start(); },
    budget,
    receipt: () => terminal,
  });
}

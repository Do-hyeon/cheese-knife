const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const clock = { now: () => performance.now(), setTimeout, clearTimeout, setInterval };
const send = (socket, message) => socket.write(JSON.stringify(message) + '\n');

// Fixture-only local protocol; never forward these messages to the product supervisor.
function readFrames(socket, receive, fail, budget = { bytes: 0 }) {
  let buffered = Buffer.alloc(0);
  socket.on('data', chunk => {
    budget.bytes += chunk.length;
    if (budget.bytes > 1048576) { fail('control-size'); return; }
    buffered = Buffer.concat([buffered, chunk]);
    let end;
    while ((end = buffered.indexOf(10)) !== -1) {
      const line = buffered.subarray(0, end); buffered = buffered.subarray(end + 1);
      try { receive(JSON.parse(line)); } catch { fail('control-protocol'); return; }
    }
  });
  socket.on('error', () => fail('control-socket'));
}

async function createFixtureOwner({ root, registrationMs, net: transport = net, clock: time = clock,
  probe = pid => process.kill(pid, 0) }) {
  const token = randomBytes(24).toString('hex'), generation = randomBytes(16).toString('hex');
  const descriptor = { root, token, parentToken: randomBytes(24).toString('hex'), generation,
    endpoint: process.platform === 'win32' ? `\\\\.\\pipe\\transition-${generation}` : path.join(root, 'control.sock'), registrationMs };
  const sockets = new Set(), roles = {}, errors = [], budget = { bytes: 0 };
  let registered = false, failed = false, closed = false, cleanupPromise, initial = false, registering = false, treeTermination = false;
  let stopSent = false, stopAcknowledged = false;
  let server, timer, connections = 0;
  const registrationEnd = time.now() + registrationMs;
  let spawnedPID;
  const fail = code => {
    if (closed) return;
    if (!errors.includes(code)) errors.push(code);
    failed = true; time.clearTimeout(timer);
    for (const socket of sockets) socket.destroy();
  };
  const query = () => {
    try { probe(roles.descendant.pid); return 'alive'; }
    catch (error) { return error.code === 'ESRCH' ? 'absent' : 'unknown'; }
  };
  const bind = () => {
    if (!roles.descendant || spawnedPID === undefined || registering) return;
    const presence = query();
    if (time.now() >= registrationEnd) { fail('control-registration-timeout'); return; }
    if (spawnedPID !== roles.descendant.pid || presence !== 'alive') { fail('control-initial-presence'); return; }
    initial = true; registering = true; send(roles.descendant.socket, { type: 'registered' });
  };
  server = transport.createServer(socket => {
    sockets.add(socket);
    if (++connections > 2 || failed || closed) { fail('control-connections'); socket.destroy(); return; }
    let role;
    readFrames(socket, message => {
      if (failed || closed) return;
      if (!registered && time.now() >= registrationEnd) { fail('control-registration-timeout'); return; }
      if (!role) {
        role = message.role;
        if (!['parent', 'descendant'].includes(role) || roles[role] || message.root !== root ||
          message.generation !== generation || message[role === 'parent' ? 'parentToken' : 'token'] !== descriptor[role === 'parent' ? 'parentToken' : 'token'] ||
          !Number.isSafeInteger(message.pid) || message.pid <= 0) { fail('control-identity'); return; }
        roles[role] = { socket, pid: message.pid };
        if (role === 'parent') send(socket, { type: 'parent-registered' });
        bind();
      } else if (role === 'parent' && message.type === 'spawned' && spawnedPID === undefined && Number.isSafeInteger(message.pid) && message.pid > 0) {
        spawnedPID = message.pid; bind();
      } else if (role === 'descendant' && message.type === 'ready' && registering && !registered) {
        registered = true; time.clearTimeout(timer); send(roles.parent.socket, { type: 'release' });
      } else if (role === 'descendant' && message.type === 'stopped' && stopSent && !stopAcknowledged) stopAcknowledged = true;
      else fail('control-protocol');
    }, fail, budget);
    socket.on('close', () => {
      socket.controlClosed = true;
      if (!registered) fail('control-registration-lost');
      else if (role === 'descendant' && !cleanupPromise && !treeTermination) fail('control-owner-lost');
    });
  });
  server.on('error', () => fail('control-server'));
  await new Promise((resolve, reject) => {
    let starting = true;
    const abort = code => {
      fail(code);
      if (starting) { starting = false; server.close(() => {}); reject(Error(code)); }
    };
    const onError = () => abort('control-listen');
    server.once('error', onError);
    timer = time.setTimeout(() => abort('control-registration-timeout'), Math.max(0, registrationEnd - time.now()));
    try {
      server.listen(descriptor.endpoint, () => {
        if (!starting) { server.close(() => {}); return; }
        if (time.now() >= registrationEnd) { abort('control-registration-timeout'); return; }
        starting = false; server.removeListener('error', onError); resolve();
      });
    } catch { abort('control-listen'); }
  });
  return {
    descriptor, get registered() { return registered; },
    expectTreeTermination() { if (registered && !failed && !cleanupPromise) treeTermination = true; },
    cleanup() {
      if (cleanupPromise) return cleanupPromise;
      let resolve; cleanupPromise = new Promise(done => { resolve = done; });
      const deadline = time.now() + 5000;
      time.clearTimeout(timer);
      const before = initial ? query() : 'unknown';
      if (!registered) fail('control-unregistered');
      if (registered && (roles.descendant.socket.controlClosed || before !== 'alive') && !(treeTermination && before === 'absent')) fail('control-witness-lost');
      if (time.now() >= deadline) fail('control-cleanup-timeout');
      if (registered && !failed && before === 'alive' && !roles.descendant.socket.controlClosed) {
        stopSent = true;
        try { send(roles.descendant.socket, { type: 'stop' }); } catch { fail('control-stop'); }
      }
      let absent = false, channelsClosed = false, serverClosed = false, closingServer = false, pollTimer;
      const finish = () => {
          if (closed) return;
          if (!absent) errors.push('control-absence-unconfirmed');
          if (!channelsClosed) errors.push('control-close-unconfirmed');
          if (!serverClosed) errors.push('control-server-close-unconfirmed');
          closed = true;
          time.clearTimeout(pollTimer);
          for (const socket of sockets) socket.destroy();
          if (!closingServer) server.close();
          resolve(Object.freeze({ registered, absent, channelsClosed, serverClosed, stopSent,
            confirmed: registered && absent && channelsClosed && serverClosed && errors.length === 0, errors: Object.freeze([...errors]) }));
      };
      const poll = () => {
        if (closed) return;
        time.clearTimeout(pollTimer);
        if (time.now() >= deadline) { finish(); return; }
        const presence = initial ? query() : 'unknown';
        if (time.now() >= deadline) { finish(); return; }
        absent = presence === 'absent';
        channelsClosed = [...sockets].every(socket => socket.controlClosed);
        if (channelsClosed && !closingServer) {
          closingServer = true;
          server.close(() => {
            if (closed) return;
            if (time.now() >= deadline) { finish(); return; }
            serverClosed = true;
            poll();
          });
        }
        if (closed) return;
        if (absent && channelsClosed && serverClosed) finish();
        else { time.clearTimeout(pollTimer); pollTimer = time.setTimeout(poll, Math.min(50, deadline - time.now())); }
      };
      poll(); return cleanupPromise;
    }
  };
}

function runFixtureDescendant({ descriptor, process: runtime = process, connect = net.connect, clock: time = clock }) {
  let stopped = false, ready = false;
  const socket = connect(descriptor.endpoint);
  const finish = code => { if (stopped) return; stopped = true; time.clearTimeout(timer); runtime.exit(code); };
  const timer = time.setTimeout(() => finish(1), descriptor.registrationMs);
  socket.on('connect', () => send(socket, { ...descriptor, role: 'descendant', pid: runtime.pid }));
  readFrames(socket, message => {
    if (stopped) return;
    if (message.type === 'registered' && !ready) {
      ready = true; time.clearTimeout(timer); time.setInterval(() => {}, 1000); send(socket, { type: 'ready' });
    } else if (message.type === 'stop' && ready) {
      send(socket, { type: 'stopped' }); finish(0);
    } else finish(1);
  }, () => finish(1));
  socket.on('close', () => finish(1));
}

function runFixtureParent({ process: runtime = process, spawn: spawnChild = spawn, connect = net.connect,
  writeFileSync = fs.writeFileSync, clock: time = clock } = {}) {
  runtime.once('message', ({ nonce, root, mode, control }) => {
    if (mode === 'stderr-exit') { runtime.stderr.write('bootstrap-sentinel'); runtime.exitCode = 7; runtime.disconnect(); return; }
    if (mode === 'signal') { runtime.send({ type: 'signal-ready', nonce }); time.setInterval(() => {}, 1000); return; }
    const deadline = time.now() + control.registrationMs;
    runtime.send({ type: 'launch-intent', nonce, caseId: 'valid-ui', phase: 'seed', launchId: 'valid-ui:seed', root });
    let finished = false, socket, spawned = false;
    const fail = () => { if (!finished) { finished = true; time.clearTimeout(timer); socket?.destroy(); runtime.exit(1); } };
    const timer = time.setTimeout(fail, control.registrationMs);
    runtime.once('message', message => {
      if (finished || message.type !== 'launch-ack' || message.nonce !== nonce || message.root !== root) { fail(); return; }
      socket = connect(control.endpoint);
      socket.on('connect', () => send(socket, { ...control, role: 'parent', pid: runtime.pid }));
      readFrames(socket, response => {
        if (finished) return;
        if (time.now() >= deadline) { fail(); return; }
        if (response.type === 'parent-registered' && !spawned) {
          spawned = true;
          const { parentToken: _parentToken, ...descriptor } = control;
          descriptor.registrationMs = Math.max(0, deadline - time.now());
          const descendant = spawnChild(runtime.execPath, [__filename, '--descendant', JSON.stringify(descriptor)], {
            detached: true, stdio: mode === 'pipe' ? ['ignore', 'ignore', runtime.stderr] : 'ignore', windowsHide: true });
          descendant.on?.('error', fail);
          writeFileSync(path.join(root, 'descendant.pid'), String(descendant.pid), { flag: 'wx' });
          send(socket, { type: 'spawned', pid: descendant.pid }); descendant.unref();
        } else if (response.type === 'release' && spawned) {
          finished = true; time.clearTimeout(timer); socket.end();
          if (mode === 'exit' || mode === 'pipe') runtime.exit(0);
          else time.setInterval(() => {}, 1000);
        } else fail();
      }, fail);
      socket.on('close', () => { if (!finished) fail(); });
    });
  });
}

module.exports = { createFixtureOwner, runFixtureParent, runFixtureDescendant };
if (require.main === module) {
  if (process.argv[2] === '--descendant') runFixtureDescendant({ descriptor: JSON.parse(process.argv[3]) });
  else runFixtureParent();
}

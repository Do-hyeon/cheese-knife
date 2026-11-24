const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./audio-fixture.cjs');
const { flush, deliverScoped: deliver } = require('./helpers.cjs');

const features = ['audioProcessing', 'compressor', 'equalizer', 'normalizer'];
const publications = fixture => fixture.statusChanges.filter(([feature]) => features.includes(feature));

async function configureFlight(t, config = { compressorAttack: 0 }) {
  const fixture = setup(t, false, false, config, { manualWorkletAck: true, clock: true });
  const enabling = fixture.audio.setEnabled(fixture.video, true);
  await flush();
  const node = fixture.nodes.find(node => node.type === 'transition');
  assert.ok(node, 'worklet must be created before the prepared reply');
  node.reply('prepared');
  await flush();
  assert.equal(fixture.sources(), 1);
  assert.equal(node.commands.length, 1);
  assert.equal(node.packet.wanted, true);
  return { ...fixture, node, enabling };
}

function finalSnapshot(fixture) {
  for (let i = 0; i < 2; i++) {
    fixture.dom.window.dispatchEvent(new fixture.dom.window.PageTransitionEvent('pagehide'));
  }
  return publications(fixture).length;
}

for (const [name, reason, capture] of [
  ['late processorerror', 'audio-processor-failed', fixture => {
    const callback = fixture.node.onprocessorerror;
    return () => callback();
  }],
  ['late failed reply with reason', 'audio-processor-failed', fixture => {
    const callback = fixture.node.port.onmessage;
    const data = { kind: 'failed', sourceEpoch: fixture.node.epoch, seq: fixture.node.packet.seq,
      frame: 0, meterEpoch: fixture.node.meterEpoch, gain: null, code: 'audio-processor-failed' };
    return () => callback({ data });
  }],
  ['late command timeout', 'audio-command-timeout', fixture => () => fixture.time.advance(1001)],
]) {
  test(name, async t => {
    for (const final of [false, true]) {
      await t.test(final ? 'after final disposal' : 'original pre-final failure gate', async child => {
        const fixture = await configureFlight(child);
        if (name === 'late command timeout') {
          fixture.node.reply('accepted');
          fixture.node.reply('completed');
          assert.equal(await fixture.enabling, 'on');
          fixture.audio.setGain(fixture.video, 1.25);
          assert.equal(fixture.node.commands.length, 2);
        }
        const trigger = capture(fixture);
        const before = final ? finalSnapshot(fixture) : publications(fixture).length;
        await trigger();
        await fixture.enabling;
        const added = publications(fixture).slice(before);
        if (final) {
          assert.deepEqual(added, [], 'disposed audio scope must not publish late feature status');
        } else {
          assert.equal(fixture.audio.getState(fixture.video), 'unavailable');
          assert.ok(added.some(([feature, state, code]) =>
            feature === 'audioProcessing' && state === 'limited' && code === reason),
          'the original failure reason must still be published before final disposal');
        }
      });
    }
  });
}

test('accepted drains queued OFF', async t => {
  const fixture = await configureFlight(t);
  const before = finalSnapshot(fixture);
  assert.equal(fixture.node.commands.length, 1, 'OFF must wait behind the active configure');
  fixture.node.reply('accepted');
  assert.equal(fixture.node.commands.length, 2, 'valid ACK must still drain the pending OFF');
  assert.equal(fixture.node.packet.wanted, false);
  fixture.node.reply('accepted');
  fixture.node.reply('completed');
  assert.equal(await fixture.enabling, 'off');
  await fixture.time.advance(1001);
  assert.deepEqual(publications(fixture).slice(before), []);
});

test('Gain0 final status boundary', async t => {
  const fixture = await configureFlight(t, { compressorAttack: 0, audioGain: 0, gainInherited: false });
  fixture.node.reply('accepted');
  fixture.node.reply('completed');
  assert.equal(await fixture.enabling, 'on');
  assert.equal(fixture.audio.getReadback(fixture.video).appliedGain, 0);
  const latch = fixture.nodes.find(node => node.type === 'constant');
  assert.equal(latch.offset.value, -1);
  const error = fixture.node.onprocessorerror;
  const before = finalSnapshot(fixture);
  assert.equal(latch.offset.value, -1, 'final suspension must retain the confirmed silent latch');
  error();
  assert.equal(latch.offset.value, -1);
  assert.deepEqual(publications(fixture).slice(before), []);
});

test('persisted suspend/resume still publishes', async t => {
  const fixture = setup(t);
  await fixture.audio.setEnabled(fixture.video, true);
  const before = publications(fixture).length;
  fixture.dom.window.dispatchEvent(new fixture.dom.window.PageTransitionEvent('pagehide', { persisted: true }));
  await flush();
  assert.equal(fixture.audio.getState(fixture.video), 'pending');
  fixture.dom.window.dispatchEvent(new fixture.dom.window.PageTransitionEvent('pageshow', { persisted: true }));
  deliver(fixture.dom, {});
  await fixture.audio.resumeWanted(fixture.video);
  assert.equal(fixture.audio.getState(fixture.video), 'on');
  assert.equal(fixture.sources(), 1);
  const added = publications(fixture).slice(before);
  assert.ok(added.some(([feature, state]) => feature === 'audioProcessing' && state === 'pending'));
  assert.ok(added.some(([feature, state]) => feature === 'audioProcessing' && state === 'ready'));
});

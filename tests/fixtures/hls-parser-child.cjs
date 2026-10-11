// Test-only access to the actual pinned bundle's private consumers. No test
// hooks are written into the packaged artifact, and no network is permitted.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '../..');
const bytes = fs.readFileSync(process.env.KNIFE_HLS_TEST_BUNDLE || path.join(root, 'vendor/hls.light.private.js'), 'utf8');
const bundlePath = path.resolve(process.env.KNIFE_HLS_TEST_BUNDLE || path.join(root, 'vendor/hls.light.private.js'));
const bundleSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
if (process.env.KNIFE_HLS_EXPECTED_BUNDLE_SHA256 && bundleSha256 !== process.env.KNIFE_HLS_EXPECTED_BUNDLE_SHA256) {
  throw new Error('KNIFE_HLS_INFRA:candidate-hash-mismatch');
}
const seam = 'return Rn.defaultConfig=void 0,Rn}';
if (bytes.split(seam).length !== 2) throw new Error('Pinned bundle test seam changed');
let hooked = bytes;
const dropSeam = 'function knifeHlsDropMetadata(reason) {';
if (hooked.includes(dropSeam)) hooked = hooked.replace(dropSeam, dropSeam + ' window.__hlsBoundsDropCount=(window.__hlsBoundsDropCount||0)+1;');
  hooked = hooked.replace(seam, 'window.__hlsParserHooks={Playlist:nr,MP4:Ai,Remux:$i,frames:Jr,timestamp:ri,samples:ke,logger:j,Bounds:{validateRuns:typeof knifeHlsValidateRuns==="function"?knifeHlsValidateRuns:null,parseEmsg:typeof knifeHlsParseEmsg==="function"?knifeHlsParseEmsg:null,sampleBudgetAllows:typeof knifeHlsSampleBudgetAllows==="function"?knifeHlsSampleBudgetAllows:null}};' + seam);
const sandbox = { console: { log() {}, warn() {}, error() {}, debug() {}, info() {} }, performance, URL, TextDecoder, TextEncoder,
  setTimeout, clearTimeout, setInterval, clearInterval, navigator: { userAgent: 'ParserRegression' } };
sandbox.window = sandbox; sandbox.self = sandbox;
sandbox[Symbol.for('cheese-knife.runtime.v1')] = {};
const context = vm.createContext(sandbox);
vm.runInContext(hooked, context, { timeout: 1000 });
context.caseName = process.argv[2];
const exercise = `(() => {
  const hooks = window.__hlsParserHooks;
  const u32 = value => new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
  const join = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; } return out; };
  const text = value => new TextEncoder().encode(value);
  const box = (type, ...parts) => { const body = join(...parts); return join(u32(body.length + 8), text(type), body); };
  const tag = size => new Uint8Array([73,68,51,4,0,0,(size >>> 21) & 127,(size >>> 14) & 127,(size >>> 7) & 127,size & 127]);
  if (caseName.startsWith('skip-')) {
    const count = { 'skip-negative': '-1', 'skip-large': '4294967295', 'skip-fraction': '1.5', 'skip-junk': '1x', 'skip-valid': '3', 'skip-zero-duplicate': '0', 'skip-limit-minus-one': '9999', 'skip-limit-exact': '10000', 'skip-limit-over': '10001' }[caseName] ?? '3';
    const duplicate = caseName === 'skip-duplicate' ? '#EXT-X-SKIP:SKIPPED-SEGMENTS=4294967295\\n' : caseName === 'skip-zero-duplicate' ? '#EXT-X-SKIP:SKIPPED-SEGMENTS=0,RECENTLY-REMOVED-DATERANGES="x"\\n' : '';
    const body = '#EXTM3U\\n#EXT-X-TARGETDURATION:2\\n#EXT-X-MEDIA-SEQUENCE:10\\n#EXT-X-SKIP:SKIPPED-SEGMENTS=' + count + '\\n' + duplicate + '#EXTINF:2,\\nsegment.ts\\n';
    const level = hooks.Playlist.parseLevelPlaylist(body, 'https://media.invalid/live.m3u8', 0, 'main', 0, null);
    return { rejected: !!level.playlistParsingError, skipped: level.skippedSegments, fragments: level.fragments.length };
  }
  if (caseName.startsWith('emsg-')) {
    if (caseName === 'emsg-v1-search-window') {
      if (!hooks.Bounds.parseEmsg) throw new Error('Bounded emsg helper unavailable');
      const data = new Uint8Array(10000).fill(120); data[0] = 1;
      const originalIndexOf = Uint8Array.prototype.indexOf;
      let maxSearchLength = 0;
      Uint8Array.prototype.indexOf = function(...args) { maxSearchLength = Math.max(maxSearchLength, this.length); return originalIndexOf.apply(this, args); };
      try { return { accepted: !!hooks.Bounds.parseEmsg(data), maxSearchLength }; }
      finally { Uint8Array.prototype.indexOf = originalIndexOf; }
    }
    if (caseName.startsWith('emsg-v1-string-') || caseName === 'emsg-v1-boundary-no-nul' || caseName.startsWith('emsg-v0-value-')) {
      if (!hooks.Bounds.parseEmsg) throw new Error('Bounded emsg helper unavailable');
      let data;
      if (caseName.startsWith('emsg-v1-string-')) {
        const length = Number(caseName.slice('emsg-v1-string-'.length));
        data = join(new Uint8Array([1,0,0,0]), u32(1), u32(0), u32(0), u32(1), u32(7), text('x'.repeat(length) + '\\0\\0'));
      } else if (caseName === 'emsg-v1-boundary-no-nul') {
        data = join(new Uint8Array([1,0,0,0]), u32(1), u32(0), u32(0), u32(1), u32(7), text('x'.repeat(4096)));
      } else {
        const length = Number(caseName.slice('emsg-v0-value-'.length));
        data = join(new Uint8Array([0]), text('v'.repeat(length) + '\\0'), new Uint8Array(28));
      }
      const parsed = hooks.Bounds.parseEmsg(data);
      const contentLength = value => value.endsWith('\\0') ? value.length - 1 : value.length;
      return parsed ? { accepted: true, version: data[0], schemeLength: contentLength(parsed.schemeIdUri), valueLength: contentLength(parsed.value) } : { accepted: false };
    }
    const demux = new hooks.MP4({}, { progressive: false, enableEmsgKLVMetadata: false });
    demux.resetInitSegment();
    const header = join(new Uint8Array([1,0,0,0]), u32(1), u32(0), u32(0), u32(1), u32(7));
    let data;
    if (caseName === 'emsg-short') data = new Uint8Array([1]);
    else if (caseName === 'emsg-no-scheme-nul') data = join(header, text('https://aomedia.org/emsg/ID3'));
    else if (caseName === 'emsg-no-value-nul') data = join(header, text('https://aomedia.org/emsg/ID3\\0value'));
    else data = join(header, text('https://aomedia.org/emsg/ID3\\0value\\0'), tag(0));
    const event = box('emsg', data);
    const result = demux.extractID3Track({ samples: caseName === 'emsg-multiple-valid' ? join(event, event) : event }, 0);
    return { samples: result.samples.length, payloadLength: result.samples[0]?.data.length ?? 0 };
  }
  if (caseName.startsWith('id3-')) {
    let data = tag(0x0fffffff);
    if (caseName === 'id3-empty') data = tag(0);
    else if (caseName === 'id3-valid') data = join(tag(13), text('TIT2'), u32(3), new Uint8Array([0,0,3,79,75]));
    else if (caseName === 'id3-padding-valid') data = join(tag(20), text('TIT2'), u32(3), new Uint8Array([0,0,3,79,75]), new Uint8Array(7));
    else if (caseName === 'id3-padding-nonzero-short') data = join(tag(20), text('TIT2'), u32(3), new Uint8Array([0,0,3,79,75]), new Uint8Array([0,0,0,1,0,0,0]));
    // Characterize the pinned parser's fixed ten-byte skip, not ID3 spec conformance.
    else if (caseName === 'id3-pinned-extended-header') { const header = tag(23); header[5] = 64; data = join(header, new Uint8Array(10), text('TIT2'), u32(3), new Uint8Array([0,0,3,79,75])); }
    else if (caseName === 'id3-frame-truncated') data = join(tag(14), text('TIT2'), u32(50), new Uint8Array([0,0,3,79,75,33]));
    else if (caseName === 'id3-adjacent') { const valid = join(tag(13), text('TIT2'), u32(3), new Uint8Array([0,0,3,79,75])); data = join(valid, valid); }
    else if (caseName.startsWith('id3-payload-')) {
      const size = Number(caseName.slice('id3-payload-'.length));
      const frame = join(text('TIT2'), u32(3), new Uint8Array([0,0,3,79,75]));
      const payload = new Uint8Array(size);
      if (size >= frame.length) payload.set(frame);
      data = join(tag(size), payload);
    } else if (caseName.startsWith('id3-frames-')) {
      const count = Number(caseName.slice('id3-frames-'.length));
      const frame = join(text('TIT2'), u32(3), new Uint8Array([0,0,3,79,75]));
      const size = frame.length * count;
      data = new Uint8Array(10 + size);
      data.set(tag(size));
      for (let index = 0; index < count; index++) data.set(frame, 10 + index * frame.length);
    } else if (caseName === 'id3-extended-truncated') {
      const header = tag(5); header[5] = 64; data = join(header, new Uint8Array(5));
    }
    if (caseName === 'id3-timestamp-truncated') return { timestamp: hooks.timestamp(data) ?? null };
    const frames = hooks.frames(data);
    if (caseName.startsWith('id3-payload-') || caseName.startsWith('id3-frames-') || caseName === 'id3-extended-truncated') return { frames: frames.length };
    return { frames: frames.length, values: frames.map(frame => frame.data) };
  }
  if (caseName.startsWith('run-')) {
    if (!hooks.Bounds.validateRuns) throw new Error('Bounded run helper unavailable');
    const count = Number(caseName.slice('run-count-'.length));
    const validTfhd = box('tfhd', u32(0), u32(caseName === 'run-unselected-malformed' ? 2 : 1));
    const validTfdt = box('tfdt', u32(0), u32(0));
    let tfhd = validTfhd, tfdt = validTfdt, trun = box('trun', u32(0), u32(Number.isFinite(count) ? count : 1));
    if (caseName === 'run-missing-tfhd') tfhd = null;
    if (caseName === 'run-short-tfhd') tfhd = box('tfhd', u32(0));
    if (caseName === 'run-short-tfdt') tfdt = box('tfdt', u32(0));
    if (caseName === 'run-truncated-width' || caseName === 'run-unselected-malformed') trun = box('trun', u32(0x100), u32(2), u32(1));
    const parts = [tfhd, tfdt, trun].filter(Boolean);
    hooks.Bounds.validateRuns(box('moof', box('traf', ...parts)), 1);
    return { accepted: true };
  }
  if (caseName.startsWith('trun-')) {
    if (caseName.startsWith('trun-byte-absolute-')) {
      if (!hooks.Bounds.sampleBudgetAllows) throw new Error('Bounded sample budget helper unavailable');
      const total = caseName.endsWith('-before') ? 16777215 : caseName.endsWith('-exact') ? 16777216 : 16777217;
      return { accepted: hooks.Bounds.sampleBudgetAllows(total, 5000000) };
    }
    const count = caseName === 'trun-count-large' || caseName === 'trun-remux-large' ? 0xffffffff : 2;
    const size = caseName === 'trun-size-large' ? 0xffffffff : 0;
    const tfhd = box('tfhd', u32(0x18), u32(1), u32(1000), u32(size));
    const trun = box('trun', u32(caseName === 'trun-record-truncated' ? 0x100 : 0), u32(count));
    const tfdt = box('tfdt', u32(0), u32(0));
    let data = box('moof', box('traf', tfhd, tfdt, trun));
    if (caseName === 'trun-duplicate-tfhd') data = box('moof', box('traf', tfhd, tfhd, tfdt, trun));
    const track = { id: 1, type: 'video', timescale: 1000, codec: 'avc1.640028', samples: data };
    if (caseName === 'trun-vp9-valid' || caseName === 'trun-vp9-opaque-boundary' || caseName === 'trun-av1-valid') {
      const opaqueHeader = box('tfhd', u32(0x18), u32(1), u32(1000), u32(1));
      const makeMoof = offset => box('moof', box('traf', opaqueHeader, tfdt, box('trun', u32(1), u32(1), u32(offset))));
      const moof = makeMoof(0);
      track.samples = join(makeMoof(moof.length + 8), box('mdat', new Uint8Array([0x88])));
      track.codec = caseName === 'trun-av1-valid' ? 'av01.0.04M.08' : 'vp09.00.10.08';
    }
    if (caseName === 'trun-hevc-valid') {
      const sample = join(u32(1), new Uint8Array([2]));
      const sampleHeader = box('tfhd', u32(0x18), u32(1), u32(1000), u32(sample.length));
      const makeMoof = offset => box('moof', box('traf', sampleHeader, tfdt, box('trun', u32(1), u32(1), u32(offset))));
      const moof = makeMoof(0);
      track.samples = join(makeMoof(moof.length + 8), box('mdat', sample));
      track.codec = 'hvc1.1.6.L93.B0';
    }
    if (caseName.startsWith('trun-byte-budget-')) {
      const size = caseName.endsWith('-before') ? 655 : caseName.endsWith('-exact') ? 656 : 657;
      const sample = new Uint8Array(size);
      const sampleHeader = box('tfhd', u32(0x18), u32(1), u32(1000), u32(size));
      const makeMoof = offset => box('moof', box('traf', sampleHeader, tfdt,
        ...Array.from({ length: 5 }, () => box('trun', u32(1), u32(1), u32(offset)))));
      const moof = makeMoof(0);
      track.samples = join(makeMoof(moof.length + 8), box('mdat', sample));
      track.codec = 'vp09.00.10.08';
    }
    if (caseName.startsWith('trun-nal-')) {
      let sample;
      if (caseName === 'trun-nal-header-truncated') sample = new Uint8Array(3);
      else if (caseName === 'trun-nal-payload-truncated') sample = join(u32(2), new Uint8Array([1]));
      else {
        const count = Number(caseName.slice('trun-nal-count-'.length));
        sample = new Uint8Array(count * 5);
        for (let index = 0; index < count; index++) { const offset = index * 5; sample[offset + 3] = 1; sample[offset + 4] = 1; }
      }
      const sampleHeader = box('tfhd', u32(0x18), u32(1), u32(1000), u32(sample.length));
      const makeMoof = offset => box('moof', box('traf', sampleHeader, tfdt, box('trun', u32(1), u32(1), u32(offset))));
      const moof = makeMoof(0);
      track.samples = join(makeMoof(moof.length + 8), box('mdat', sample));
      track.codec = 'avc1.640028';
    }
    if (['trun-multi-valid','trun-shared-budget','trun-shared-valid','trun-subview-valid'].includes(caseName)) {
      const payload = join(new Uint8Array(16), new Uint8Array(128).fill(65));
      const nal = join(new Uint8Array([6,5,payload.length]), payload, new Uint8Array([128]));
      const sample = join(u32(nal.length), nal);
      const sampleHeader = box('tfhd', u32(0x18), u32(1), u32(1000), u32(sample.length));
      const runCount = caseName === 'trun-shared-budget' ? 40 : 2;
      const shared = caseName.startsWith('trun-shared');
      const makeMoof = offset => box('moof', box('traf', sampleHeader, tfdt,
        ...Array.from({ length: runCount }, (_, index) => index === 0 || shared || caseName === 'trun-multi-valid' ? box('trun', u32(1), u32(1), u32(offset + (caseName === 'trun-multi-valid' ? index * sample.length : 0))) : box('trun', u32(0), u32(1)))));
      const moof = makeMoof(0);
      track.samples = join(makeMoof(moof.length + 8), box('mdat', shared ? sample : join(sample, sample)));
      if (caseName === 'trun-subview-valid') track.samples = join(new Uint8Array(7), track.samples).subarray(7);
    }
    if (caseName === 'trun-remux-large' || caseName === 'trun-remux-valid') {
      const remux = new hooks.Remux({}, {}, {}, hooks.logger);
      const init = []; init[1] = { id: 1, type: 'video', timescale: 1000, default: { duration: 1000, flags: 0 } }; init.video = init[1];
      remux.initData = init;
      const result = remux.remux({ samples: [] }, track, { samples: [] }, { samples: [] }, 0, true);
      return { samples: result.video?.nb, duration: result.video?.endDTS - result.video?.startDTS };
    }
    const captions = hooks.samples(0, track).length;
    if (caseName.startsWith('trun-byte-budget-') || caseName.startsWith('trun-nal-') || caseName === 'trun-vp9-opaque-boundary') return { captions, drops: window.__hlsBoundsDropCount || 0 };
    return { captions };
  }
  throw new Error('Unknown parser fixture');
})()`;
try {
  const result = vm.runInContext(exercise, context, { timeout: 250 });
  process.stdout.write(JSON.stringify({ result }));
} catch (error) {
  process.stdout.write(JSON.stringify({ rejected: error.code === 'KNIFE_HLS_INVALID_INPUT', timedOut: error.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT', name: error.name }));
}

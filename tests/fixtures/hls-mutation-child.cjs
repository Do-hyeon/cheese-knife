const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const mutation = process.argv[2];
const caseName = process.argv[3];
const mutations = {
  'skip-limit-relaxed': ['F>10000', 'F>10001'],
  'emsg-limit-relaxed': ['offset + 4097', 'offset + 4098'],
  'run-limit-relaxed': ['total > 100000', 'total > 100001'],
  'byte-relative-cap-removed': ['return total <= Math.min(16777216, inputLength * 4);', 'return total <= 16777216;'],
  'byte-absolute-cap-removed': ['return total <= Math.min(16777216, inputLength * 4);', 'return total <= inputLength * 4;'],
  'nal-limit-relaxed': ['++knifeHlsNals>100000', '++knifeHlsNals>100001'],
  'id3-payload-limit-relaxed': ['size > 1048576', 'size > 1048577'],
  'id3-frame-limit-relaxed': ['++count > 4096', '++count > 4097'],
  'subview-offset-removed': ['o.byteOffset-i.byteOffset-8', 'o.byteOffset-8'],
  'codec-allowlist-removed': ['t.type===te&&knifeHlsNalCodec(t.codec)', 't.type===te'],
  'optional-metadata-catch-removed': [
    '})),r}catch(knifeHlsError){if(knifeHlsError&&knifeHlsError.code==="KNIFE_HLS_OPTIONAL_METADATA_BOUNDS")return [];throw knifeHlsError}}function De(e){',
    '})),r}catch(knifeHlsError){throw knifeHlsError}}function De(e){'
  ],
  'required-run-reject-removed': [
    "if (headerSize > run.length || total > 100000 || (width && count > Math.floor((run.length - headerSize) / width))) knifeHlsReject('trun record extent or work budget');",
    'if (headerSize > run.length || total > 100000 || (width && count > Math.floor((run.length - headerSize) / width))) return;'
  ],
};

if (!Object.hasOwn(mutations, mutation) || typeof caseName !== 'string' || !caseName) {
  throw new Error('Unknown HLS mutation request');
}

const source = fs.readFileSync(process.env.KNIFE_HLS_TEST_BUNDLE || path.join(root, 'vendor/hls.light.private.js'), 'utf8');
const [before, after] = mutations[mutation];
if (source.split(before).length !== 2) throw new Error('Mutation anchor must occur exactly once: ' + mutation);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'knife-hls-mutation-'));
const candidate = path.join(temporary, 'hls.light.private.js');
try {
  fs.writeFileSync(candidate, source.replace(before, after));
  const candidateSha256 = require('node:crypto').createHash('sha256').update(fs.readFileSync(candidate)).digest('hex');
  const child = spawnSync(process.execPath, ['--max-old-space-size=192', path.join(__dirname, 'hls-parser-child.cjs'), caseName], {
    timeout: 4000,
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024,
    env: { ...process.env, KNIFE_HLS_TEST_BUNDLE: candidate, KNIFE_HLS_EXPECTED_BUNDLE_SHA256: candidateSha256 },
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error('Mutated parser child failed: ' + child.stderr.slice(0, 250));
  process.stdout.write(child.stdout);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

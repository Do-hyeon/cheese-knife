// 검증 호스트에서 공개 오디오 계약을 읽고 재진입 판정과 소스 인벤토리에 같은 근거를 연결한다.
// 저장소의 분류기는 readAudioContract(), 수집기는 attestAudioSource()를 호출한다.
// 입력은 이 모듈과 같은 디렉터리의 계약 JSON이다. 파일 읽기만 하며 형식·지문이 다르면 판정 전에 예외를 던진다.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, realpathSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';

export const contractPath = 'scripts/audio-verification-contract.json';
export const loaderPath = 'scripts/audio-verification-contract.mjs';
export const audioInputs = Object.freeze([contractPath, loaderPath]);
const canonicalSha256 = '64877e194b4997a3b0d3fb7cdf891c4bdca83b123383d76e516ad48f8ac563c4';
const issued = new WeakMap();
const contractURL = new URL('./audio-verification-contract.json', import.meta.url);

/** @param {Uint8Array|string} bytes */
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
/** @param {Uint8Array} bytes */
const normalized = bytes => new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(bytes).replace(/\r\n/g, '\n');
const loadedSource = digest(normalized(readFileSync(new URL(import.meta.url))));

/** @param {Uint8Array} [bytes] */
export function readAudioContract(bytes = readFileSync(contractURL)) {
  const text = normalized(bytes);
  if (digest(text) !== canonicalSha256) throw Error('audio-contract-fingerprint');
  const value = JSON.parse(text);
  if (!isDeepStrictEqual(Object.keys(value).sort(), ['delayFrames','delayRule','delaySeconds','frameOrigin','hold','maxDelayFrames','offProgressMs','qFallMs','retire','retireMs','sampleRateHz','schema','tieOrder','unity']) ||
      value.schema !== 'f01-reentry-verification-v1' || !isDeepStrictEqual(value.sampleRateHz,[44100,48000,96000]) ||
      value.delaySeconds !== 0.006 || value.maxDelayFrames !== 1023 ||
      value.delayRule !== 'min(floor(f32(f32(seconds)*f32(sampleRateHz))),maxDelayFrames)' ||
      value.offProgressMs !== 20 || value.qFallMs !== 10 || value.retireMs !== 10 ||
      value.frameOrigin !== 'accepted-render-frame' || value.tieOrder !== 'command-before-render' ||
      value.hold !== 'B<=R' || value.retire !== 'R<B<E' || value.unity !== 'B>=E') throw Error('audio-contract-schema');
  const expectedDelay = value.sampleRateHz.map(/** @param {number} rate */rate =>
    Math.min(Math.floor(Math.fround(Math.fround(value.delaySeconds)*Math.fround(rate))),value.maxDelayFrames));
  if (!isDeepStrictEqual(value.delayFrames,expectedDelay)) throw Error('audio-contract-delay');
  return {rules:value, authority:{path:contractPath,version:value.schema,sha256:canonicalSha256}};
}

/** Git HEAD와 파일 원본을 직접 읽어 현재 오디오 소스 영수증을 발급한다.
 * @param {{root:string,readFile:(name:string)=>Promise<Buffer>}} files
 * @param {readonly string[]} required @param {'clean'|'working'} mode */
export async function attestAudioSource(files,required,mode) {
  if (!['clean','working'].includes(mode) || !Array.isArray(required) || required.some(name=>typeof name!=='string'))
    throw Error('audio-contract-inventory');
  /** @param {string[]} args */
  const git = args => execFileSync('git',['--no-optional-locks',...args],{
    cwd:files.root,encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe'],
  });
  const root=realpathSync.native(files.root);
  if (root!==realpathSync.native(git(['rev-parse','--show-toplevel']).trim())) throw Error('audio-contract-checkout');
  const clean = mode==='clean';
  const status = () => git(['status','--porcelain','--untracked-files=no']).trim();
  if (clean && status()) throw Error('transition-source-dirty');
  const sourceCommit=git(['rev-parse','HEAD']).trim();
  const tracked=git(['ls-files','--cached','-z']).split('\0').filter(Boolean);
  const core=['package-lock.json','extension/manifest.json','scripts/check-toolchain.mjs'];
  const mandatory=new Set([...audioInputs,...required,...core]);
  if (clean && [...mandatory].some(name=>!tracked.includes(name))) throw Error('transition-input-untracked');
  const untracked=clean?[]:git(['ls-files','--others','--exclude-standard','-z']).split('\0').filter(Boolean);
  const deleted=new Set(clean?[]:git(['ls-files','--deleted','-z']).split('\0').filter(Boolean));
  const paths=[...new Set([...tracked,...untracked,...mandatory])].sort();
  /** @type {Map<string,string|null>} */ const hashes=new Map();
  let authority;
  for (const path of paths) {
    if (deleted.has(path) && !mandatory.has(path)) {hashes.set(path,null);continue;}
    const bytes=await files.readFile(path);
    if (path===contractPath) authority=readAudioContract(bytes).authority;
    if (path===loaderPath && digest(normalized(bytes))!==loadedSource) throw Error('audio-contract-loader');
    hashes.set(path,digest(bytes));
  }
  if (!authority || git(['rev-parse','HEAD']).trim()!==sourceCommit || clean && status()) throw Error('audio-contract-source-changed');
  const source={sourceCommit,sourceSha256:digest(JSON.stringify([...hashes])),
    lockSha256:hashes.get('package-lock.json'),manifestSha256:hashes.get('extension/manifest.json'),toolchainSha256:hashes.get('scripts/check-toolchain.mjs'),
    audioSourceSchema:'f01-audio-source-v2',audioContract:Object.freeze(authority)};
  issued.set(source.audioContract,{source:Object.freeze({...source}),files,root});
  return source;
}

/** @param {unknown} value @returns {asserts value is Record<string,unknown> & {audioContract:object}} */
export function assertAudioSource(value) {
  if (!value || typeof value !== 'object' ||
      Reflect.get(value,'audioSourceSchema') !== 'f01-audio-source-v2' ||
      !isDeepStrictEqual(Reflect.get(value,'audioContract'),readAudioContract().authority) ||
      !/^[0-9a-f]{40}$/.test(Reflect.get(value,'sourceCommit')) ||
      !['sourceSha256','lockSha256','manifestSha256','toolchainSha256'].every(key => /^[0-9a-f]{64}$/.test(Reflect.get(value,key))))
    throw Error('audio-contract-source');
}

/** 실행에서 선택한 파일 접근 객체와 실제 Git 루트에서 수집한 영수증만 받는다.
 * @param {unknown} value @param {{root:string}} files */
export function assertLiveAudioSource(value,files) {
  assertAudioSource(value);
  const original=issued.get(value.audioContract);
  if (!original || original.files!==files || realpathSync.native(files.root)!==original.root ||
      Object.keys(original.source).some(key=>value[key]!==original.source[key])) throw Error('audio-contract-source-unobserved');
}

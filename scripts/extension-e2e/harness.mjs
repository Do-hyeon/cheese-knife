import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';
import { openOwnedRoot } from '../owned-files.mjs';
import {isRunJobShutdown} from './run-job.mjs';
export {selectPopupTarget,attachPopupCDP,openInstalledMediaSettings} from './popup-cdp.mjs';

const harnessError = (code, cause) => Object.assign(new Error(code, cause ? { cause } : undefined), { code });
const runIdPattern = /^[A-Za-z0-9]{1,64}$/;
const workerURLPattern = /^chrome-extension:\/\/([a-p]{32})\/background\.js$/;
const execFileAsync = promisify(execFile);

export async function openMediaBrowserSession(context) {
  const browser = context.browser();
  if (!browser || !browser.isConnected()) throw harnessError('media-browser-unavailable');
  let timer;
  try { return await Promise.race([browser.newBrowserCDPSession(),new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(harnessError('media-browser-session-timeout')),8000);
  })]); } finally { clearTimeout(timer); }
}

/** The caller owns this session and its exact disposable profile, not another Chrome window. */
export async function closeInstalledMediaBrowser({context,browserSession,profilePath,runJobOwner,shutdownBy,sameChildExit,
  queryProcesses=async (profile,deadline)=>(await import('./native-profile.mjs')).queryWindowsProcesses(profile,undefined,deadline),timeoutMs=15000}) {
  if(!path.isAbsolute(profilePath)||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)throw harnessError('media-close-invalid');
  const sharedShutdown=shutdownBy!==undefined||sameChildExit!==undefined;
  if(sharedShutdown&&(!Number.isFinite(shutdownBy)||!(sameChildExit instanceof Promise)||runJobOwner!==undefined))throw harnessError('media-close-invalid');
  const browser=context.browser();if(!browser)throw harnessError('media-browser-unavailable');
  const expectedBinding=runJobOwner===undefined?null:structuredClone(runJobOwner.binding);
  let disconnected=false,retired=false,timer,job,actualChildExit;
  const started=performance.now(),deadline=sharedShutdown?shutdownBy:started+timeoutMs,diagnostic={stage:'close-ack',browserCloseAcknowledged:false,queryPending:false,queryCount:0,lastRootCount:null};
  if(sharedShutdown&&deadline>started+15000)throw harnessError('media-close-invalid');
  const check=()=>{if(retired||performance.now()>=deadline)throw harnessError('media-close-unconfirmed');};
  const onDisconnected=()=>{disconnected=true;};browser.on('disconnected',onDisconnected);
  try{
    const expired=new Promise((_,reject)=>{timer=setTimeout(()=>reject(harnessError('media-close-unconfirmed')),Math.max(0,deadline-performance.now()));});
    await Promise.race([(async()=>{
      check();
      await browserSession.send('Browser.close');
      check();
      diagnostic.browserCloseAcknowledged=true;diagnostic.stage='disconnect';
      while(!disconnected||browser.isConnected()){
        check();await new Promise(resolve=>setTimeout(resolve,Math.min(10,deadline-performance.now())));check();
      }
      check();
      if(runJobOwner!==undefined){
        diagnostic.stage='run-job';job=await runJobOwner.close(deadline);check();
        if(!isRunJobShutdown({contract:'run-job-v1',browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:null,runJobClosed:true,profileRootAssessment:'UNASSESSED',job},expectedBinding))throw harnessError('media-close-job-unconfirmed');
        return;
      }
      diagnostic.stage='owned-roots';
      for(;;){check();if(deadline-performance.now()<1)throw harnessError('media-close-unconfirmed');diagnostic.queryCount++;diagnostic.queryPending=true;
        let roots;try{roots=await queryProcesses(profilePath,deadline);}finally{if(!retired)diagnostic.queryPending=false;}
        if(!Array.isArray(roots)||roots.length>64)throw harnessError('media-close-roots-invalid');
        check();
        diagnostic.lastRootCount=roots.length;
        if(roots.length===0){
          if(sharedShutdown){
            diagnostic.stage='same-child-exit';
            const actual=await sameChildExit,acceptedAt=performance.now();check();
            if(!actual||actual.kind!=='exit'||!Number.isFinite(actual.at)||actual.at<0||actual.at>acceptedAt||actual.at>=deadline||
              !(actual.code===null||Number.isSafeInteger(actual.code))||
              !(actual.signal===null||typeof actual.signal==='string'&&actual.signal.length>0)||
              (actual.code===null)===(actual.signal===null))throw harnessError('media-close-child-exit-unconfirmed');
            actualChildExit=actual;
            if(actual.code!==0||actual.signal!==null)throw harnessError('media-close-child-exit-abnormal');
          }
          return;
        }
        await new Promise(resolve=>setTimeout(resolve,Math.min(25,deadline-performance.now())));}
    })(),expired]);
    check();
    if(runJobOwner!==undefined)return {contract:'run-job-v1',browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:null,runJobClosed:true,profileRootAssessment:'UNASSESSED',job};
    return {browserCloseAcknowledged:true,browserDisconnected:true,ownedRootClosed:true,...sharedShutdown?{actualChildExit}:{}};
  }catch(error){
    let connected=null;try{connected=browser.isConnected();}catch{/* Preserve the original failure. */}
    error.closeDiagnostic={...diagnostic,...actualChildExit?{actualChildExit}:{},browserDisconnected:disconnected,connected,elapsedMs:performance.now()-started};throw error;
  }finally{retired=true;clearTimeout(timer);browser.off('disconnected',onDisconnected);}
}

export function parseInstalledE2EArgs(argv) {
  if (!Array.isArray(argv)) throw harnessError('installed-e2e-args-invalid');
  let headed = false;
  let sawHeaded = false;
  let runId = null;
  let qualification;
  for (const argument of argv) {
    if (typeof argument === 'string' && argument.startsWith('--qualification=')) {
      if (qualification !== undefined || argument !== '--qualification=media-tab') throw harnessError('installed-e2e-args-invalid');
      qualification = 'media-tab';continue;
    }
    if (argument === '--headed') {
      if (sawHeaded) throw harnessError('installed-e2e-args-invalid');
      sawHeaded = true;
      headed = true;
      continue;
    }
    if (typeof argument === 'string' && argument.startsWith('--run-id=')) {
      if (runId !== null) throw harnessError('installed-e2e-args-invalid');
      runId = argument.slice('--run-id='.length);
      if (!runIdPattern.test(runId)) throw harnessError('installed-e2e-args-invalid');
      continue;
    }
    throw harnessError('installed-e2e-args-invalid');
  }
  if (runId === null) runId = `installed${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
  if (!runIdPattern.test(runId)) throw harnessError('installed-e2e-args-invalid');
  return { headed, runId, ...(qualification === undefined ? {} : { qualification }) };
}

export function extensionLaunchOptions(extensionPath, headed) {
  if (typeof extensionPath !== 'string' || !path.isAbsolute(extensionPath)) throw harnessError('extension-path-invalid');
  if (typeof headed !== 'boolean') throw harnessError('headed-invalid');
  return {
    channel: 'chromium',
    headless: !headed,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  };
}

export function extensionIdFromWorkerURL(url) {
  const match = typeof url === 'string' ? workerURLPattern.exec(url) : null;
  if (!match) throw harnessError('extension-worker-url-invalid');
  return match[1];
}

const serviceWorkers = context => {
  if (!context || typeof context.serviceWorkers !== 'function') throw harnessError('extension-context-invalid');
  const workers = context.serviceWorkers();
  if (!Array.isArray(workers)) throw harnessError('extension-context-invalid');
  return workers;
};

const selectExtensionWorker = workers => {
  const valid = [];
  for (const worker of new Set(workers)) {
    if (!worker || typeof worker.url !== 'function') throw harnessError('extension-worker-url-invalid');
    const url = worker.url();
    try {
      extensionIdFromWorkerURL(url);
      valid.push(worker);
    } catch (error) {
      if (typeof url === 'string' && url.startsWith('chrome-extension://')) throw error;
    }
  }
  if (valid.length > 1) throw harnessError('extension-worker-ambiguous');
  return valid[0] ?? null;
};

export async function waitForExtensionWorker(context, timeoutMs = 15000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw harnessError('extension-worker-timeout-invalid');
  const existing = selectExtensionWorker(serviceWorkers(context));
  if (existing) return existing;
  if (typeof context.waitForEvent !== 'function') throw harnessError('extension-context-invalid');
  let started;
  try {
    started = await context.waitForEvent('serviceworker', { timeout: timeoutMs });
  } catch (cause) {
    throw harnessError('extension-worker-timeout', cause);
  }
  const selected = selectExtensionWorker([...serviceWorkers(context), started]);
  if (!selected) throw harnessError('extension-worker-url-invalid');
  return selected;
}

const boundedWorkerProbe = async (worker, timeoutMs) => {
  if (!worker || typeof worker.url !== 'function' || typeof worker.evaluate !== 'function') throw harnessError('extension-worker-url-invalid');
  const expectedId = extensionIdFromWorkerURL(worker.url());
  let timer;
  try {
    const actualId = await Promise.race([
      Promise.resolve().then(() => worker.evaluate(() => chrome.runtime.id)).catch(cause => { throw harnessError('extension-worker-probe-failed', cause); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(harnessError('extension-worker-probe-timeout')), timeoutMs); }),
    ]);
    if (actualId !== expectedId) throw harnessError('extension-worker-probe-invalid');
    return expectedId;
  } finally {
    clearTimeout(timer);
  }
};

const replacementWorkers = (context, previousWorker) => {
  const candidates = [];
  for (const worker of new Set(serviceWorkers(context))) {
    if (worker === previousWorker) continue;
    const url = typeof worker?.url === 'function' ? worker.url() : '';
    try {
      extensionIdFromWorkerURL(url);
      candidates.push(worker);
    } catch (error) {
      if (typeof url === 'string' && url.startsWith('chrome-extension://')) throw error;
    }
  }
  if (candidates.length > 1) throw harnessError('extension-worker-ambiguous');
  return candidates;
};

export async function reacquireExtensionWorker(context, previousWorker, timeoutMs = 15000, options = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw harnessError('extension-worker-timeout-invalid');
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      (Object.hasOwn(options, 'reusePrevious') && typeof options.reusePrevious !== 'boolean')) {
    throw harnessError('extension-worker-options-invalid');
  }
  const reusePrevious = options.reusePrevious !== false;
  const deadline = Date.now() + timeoutMs;
  if (reusePrevious) {
    try {
      const extensionId = await boundedWorkerProbe(previousWorker, timeoutMs);
      return { worker: previousWorker, extensionId };
    } catch (error) {
      if (!['extension-worker-probe-failed', 'extension-worker-probe-timeout'].includes(error?.code)) throw error;
    }
  }

  const inspect = async () => {
    const [candidate] = replacementWorkers(context, previousWorker);
    if (!candidate) return null;
    const remaining = Math.max(1, deadline - Date.now());
    try { return { worker: candidate, extensionId: await boundedWorkerProbe(candidate, remaining) }; }
    catch (error) {
      if (['extension-worker-probe-failed', 'extension-worker-probe-timeout'].includes(error?.code)) return null;
      throw error;
    }
  };
  const existing = await inspect();
  if (existing) return existing;
  const remaining = deadline - Date.now();
  if (remaining <= 0 || typeof context.waitForEvent !== 'function') throw harnessError('extension-worker-reacquire-timeout');
  try { await context.waitForEvent('serviceworker', { timeout: remaining }); }
  catch (cause) { throw harnessError('extension-worker-reacquire-timeout', cause); }
  const replacement = await inspect();
  if (!replacement) throw harnessError('extension-worker-reacquire-timeout');
  return replacement;
}

const windowsSideBySideFailure = error => /spawn UNKNOWN|side-by-side/i.test(String(error?.message || error));

async function findManifestLayout(source) {
  const entries = await source.readdir('', { withFileTypes: true });
  const rootManifest = entries.find(entry => entry.isFile() && /^\d+\.\d+\.\d+\.\d+\.manifest$/.test(entry.name));
  if (rootManifest) return { version: rootManifest.name.slice(0, -'.manifest'.length), payloadRelative: '' };
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+\.\d+\.\d+\.\d+$/.test(entry.name)) continue;
    const manifest = `${entry.name}/${entry.name}.manifest`;
    try { if ((await source.lstat(manifest)).isFile()) return { version: entry.name, payloadRelative: entry.name }; }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  throw harnessError('bundled-chromium-layout-invalid');
}

async function findManifestTool() {
  const kitsRoot = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin');
  const kits = await openOwnedRoot(kitsRoot);
  const versions = (await kits.readdir('', { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    const candidate = `${version}/${process.arch === 'arm64' ? 'arm64' : 'x64'}/mt.exe`;
    try { if ((await kits.lstat(candidate)).isFile()) return kits.resolve(candidate, { type: 'file' }); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  throw harnessError('manifest-tool-unavailable');
}

/** Bound SDK failures without retrying or replacing the original native exit information. */
export async function embedChromiumManifest(manifestTool,manifest,assembly) {
  return execFileAsync(manifestTool, ['-manifest', manifest, `-outputresource:${assembly};#2`], {
    windowsHide:true,timeout:15000,maxBuffer:65536,
  });
}

export async function prepareWindowsBundledChromium({ chromiumApi, profilePath }) {
  const started=Date.now(),diagnostic={stage:'source',profilePath};
  try {
  if (typeof chromiumApi.executablePath !== 'function') throw harnessError('bundled-chromium-path-unavailable');
  const sourceExecutable = chromiumApi.executablePath();
  const sourceRoot = path.dirname(sourceExecutable);
  const source = await openOwnedRoot(sourceRoot);
  const profile = await openOwnedRoot(profilePath);
  const sourceExecutableRelative = path.basename(sourceExecutable);
  await source.resolve(sourceExecutableRelative, { type: 'file' });
  const { version, payloadRelative } = await findManifestLayout(source);
  diagnostic.version=version;diagnostic.stage='copy';
  const targetRoot = 'bundled-chromium';
  const targetVersion = `${targetRoot}/${version}`;
  const targetExecutable = `${targetRoot}/chrome.exe`;
  const readyMarker = `${targetRoot}/.knife-ready`;
  try {
    if (await profile.readFile(readyMarker, 'utf8') === version && (await profile.lstat(targetExecutable)).isFile()) {
      return profile.resolve(targetExecutable, { type: 'file' });
    }
  } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  await profile.ensureDirectory(targetVersion);
  await profile.copyFileFrom(source, sourceExecutableRelative, targetExecutable);
  if (await source.lstat('chrome_proxy.exe', { optional: true })) {
    await profile.copyFileFrom(source, 'chrome_proxy.exe', `${targetRoot}/chrome_proxy.exe`);
  }
  for (const entry of await source.readdir(payloadRelative, { withFileTypes: true })) {
    if (!payloadRelative && ['chrome.exe', 'chrome_proxy.exe', version].includes(entry.name)) continue;
    const sourceChild = payloadRelative ? `${payloadRelative}/${entry.name}` : entry.name;
    const destinationChild = `${targetVersion}/${entry.name}`;
    if (entry.isDirectory()) await profile.copyTreeFrom(source, sourceChild, destinationChild);
    else if (entry.isFile()) await profile.copyFileFrom(source, sourceChild, destinationChild);
    else throw harnessError('bundled-chromium-layout-invalid');
  }
  const manifest = await profile.resolve(`${targetVersion}/${version}.manifest`, { type: 'file' });
  const assemblyRelative = `${targetVersion}/${version}.dll`;
  await profile.copyFile(`${targetVersion}/chrome_elf.dll`, assemblyRelative);
  const assembly = await profile.resolve(assemblyRelative, { type: 'file' });
  const manifestTool = await findManifestTool();
  diagnostic.stage='manifest-tool';diagnostic.manifestTool=manifestTool;
  await embedChromiumManifest(manifestTool,manifest,assembly);
  diagnostic.stage='ready-marker';
  await profile.writeFile(readyMarker, version, 'utf8');
  return profile.resolve(targetExecutable, { type: 'file' });
  } catch(error) {error.preparationDiagnostic={...diagnostic,elapsedMs:Date.now()-started};throw error;}
}

// shortcut: the reviewed digest binds bytes, not atomic ownership; revisit if concurrent replacement enters scope.
export async function verifyBrowserCandidate(selection,{deadline=Date.now()+150000,signal,exclude=[]}={}) {
  const reject=code=>{throw harnessError('browser-candidate-'+code);};
  const check=()=>{if(signal?.aborted||Date.now()>=deadline)reject('deadline');};
  const canonical=value=>{const absolute=path.resolve(value);return process.platform==='win32'?absolute.toLowerCase():absolute;};
  const hashPattern=/^[a-f0-9]{64}$/;
  const localAbsolute=value=>typeof value==='string'&&path.isAbsolute(value)&&!/^[\\/]{2}/.test(value)&&(process.platform!=='win32'||/^[a-z]:[\\/]/i.test(value));
  if(!selection||!localAbsolute(selection.root)||!hashPattern.test(selection.manifestSha256)||!Number.isFinite(deadline))reject('selection');
  deadline=Math.min(deadline,Date.now()+150000);
  const requested=Object.freeze({root:path.resolve(selection.root),manifestSha256:selection.manifestSha256});check();
  const files=await openOwnedRoot(requested.root);
  if(canonical(files.root)!==canonical(requested.root))reject('root-alias');
  const inside=(parent,child)=>{const relative=path.relative(parent,child);return !relative||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
  for(const other of exclude){
    if(!localAbsolute(other)||inside(files.root,other)||inside(other,files.root))reject('overlap');
    const actual=(await openOwnedRoot(other)).root;
    if(inside(files.root,actual)||inside(actual,files.root))reject('overlap');
  }
  async function read(relative,maximum,collect=false){
    check();const hash=createHash('sha256'),chunks=[];let bytes=0;
    // The owned root rejects links/types before streaming; bytes are bounded during the read.
    for await(const chunk of files.readChunks(relative,{signal})){check();bytes+=chunk.length;if(bytes>maximum)reject('file-size');hash.update(chunk);if(collect)chunks.push(chunk);}
    check();return {bytes,sha256:hash.digest('hex'),...(collect?{data:Buffer.concat(chunks)}:{})};
  }
  const raw=await read('browser-candidate.json',1048576,true);
  if(raw.sha256!==requested.manifestSha256)reject('manifest-hash');
  let manifest;try{manifest=JSON.parse(raw.data.toString('utf8'));}catch{reject('manifest-json');}
  const buildArgs={is_debug:true,is_component_build:true,symbol_level:0,blink_symbol_level:0,v8_symbol_level:0,target_cpu:'x64',use_remoteexec:false,use_siso:true};
  if(!manifest||manifest.schema!=='f01-browser-candidate-v1'||typeof manifest.root!=='string'||!path.isAbsolute(manifest.root)||canonical(manifest.root)!==canonical(files.root)||manifest.version!=='159.0.8132.0'||manifest.revision!=='c409acbc7ae0155eb173d8d5b9fd815e244dbf97'||manifest.platform!=='win32'||manifest.arch!=='x64'||manifest.executable!=='chrome.exe'||!isDeepStrictEqual(manifest.buildArgs,buildArgs)||!Array.isArray(manifest.files)||manifest.files.length<1||manifest.files.length>4096)reject('manifest-scope');
  const expected=new Map(),folded=new Set(),directories=new Set();let total=0;
  for(const row of manifest.files){
    if(!row||typeof row.path!=='string'||!row.path||row.path.split('/').some(part=>!part||part==='.'||part==='..'||/[\\:<>":|?*\x00-\x1f]/.test(part)||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))||row.path.toLowerCase()==='browser-candidate.json'||folded.has(row.path.toLowerCase())||!Number.isSafeInteger(row.bytes)||row.bytes<0||!hashPattern.test(row.sha256))reject('manifest-files');
    folded.add(row.path.toLowerCase());expected.set(row.path,Object.freeze({path:row.path,bytes:row.bytes,sha256:row.sha256}));
    const parts=row.path.split('/');if(parts.length>16)reject('inventory-bound');for(let i=1;i<parts.length;i++)directories.add(parts.slice(0,i).join('/'));
    total+=row.bytes;if(total>200*1024**3)reject('payload-bound');
  }
  if(!expected.get('chrome.exe')?.bytes)reject('executable');
  let entries=0;const found=new Set();
  async function visit(relative=''){
    check();
    for await(const item of files.directoryEntries(relative)){
      check();if(++entries>4096)reject('inventory-bound');const name=relative?relative+'/'+item.name:item.name;
      if(item.isSymbolicLink())reject('inventory-link');
      if(item.isDirectory()){if(!directories.has(name))reject('inventory');await visit(name);}
      else if(item.isFile()){if(name!=='browser-candidate.json'){if(!expected.has(name))reject('inventory');found.add(name);}}
      else reject('inventory-type');
    }
  }
  await visit();if(found.size!==expected.size)reject('inventory');
  const rows=[...expected.values()].sort((a,b)=>a.path.localeCompare(b.path));
  for(const row of rows){const actual=await read(row.path,row.bytes);if(actual.bytes!==row.bytes||actual.sha256!==row.sha256)reject('file-hash');}
  if((await read('browser-candidate.json',1048576)).sha256!==requested.manifestSha256)reject('manifest-changed');
  const executable=await files.resolve('chrome.exe',{type:'file'});check();
  return Object.freeze({root:files.root,manifestSha256:requested.manifestSha256,version:manifest.version,revision:manifest.revision,executable,bytes:total,files:Object.freeze(rows)});
}

export async function launchInstalledExtension({ chromiumApi, extensionPath, profilePath, artifactPath, headed, browserCompatibility }) {
  const options = extensionLaunchOptions(extensionPath, headed);
  if (typeof profilePath !== 'string' || !path.isAbsolute(profilePath)) throw harnessError('profile-path-invalid');
  if (typeof artifactPath !== 'string' || !path.isAbsolute(artifactPath)) throw harnessError('artifact-path-invalid');
  if (!chromiumApi || typeof chromiumApi.launchPersistentContext !== 'function') throw harnessError('browser-api-invalid');

  let context;
  try {
    context = await chromiumApi.launchPersistentContext(profilePath, { ...options, tracesDir: artifactPath });
  } catch (cause) {
    const compatibility = browserCompatibility || { platform: process.platform, prepare: prepareWindowsBundledChromium };
    if (compatibility.platform !== 'win32' || !windowsSideBySideFailure(cause) || typeof compatibility.prepare !== 'function') {
      throw harnessError('browser-unavailable', cause);
    }
    try {
      const executablePath = await compatibility.prepare({ chromiumApi, profilePath });
      context = await chromiumApi.launchPersistentContext(profilePath, { ...options, tracesDir: artifactPath, executablePath });
    } catch (fallbackCause) {
      throw harnessError('browser-unavailable', fallbackCause);
    }
  }

  try {
    const worker = await waitForExtensionWorker(context);
    return { context, worker, extensionId: extensionIdFromWorkerURL(worker.url()) };
  } catch (error) {
    if (typeof context.newPage === 'function') {
      let timer;
      try {
        error.startupDiagnostic = await Promise.race([(async () => {
          const manager = await context.newPage();
          await manager.goto('chrome://extensions', { timeout: 3000 });
          const text = await manager.evaluate(() => {
            const pending = [document.documentElement]; let text = '', count = 0;
            while (pending.length && text.length < 4096 && count++ < 2048) {
              const node = pending.shift();
              if (node.nodeType === Node.TEXT_NODE) text += node.textContent + '\n';
              else { pending.push(...node.childNodes); if (node.shadowRoot) pending.push(node.shadowRoot); }
            }
            return text.slice(0, 4096);
          });
          return typeof text === 'string' ? text.slice(0, 4096) : 'unavailable';
        })(), new Promise((_, reject) => { timer = setTimeout(() => reject(harnessError('startup-diagnostic-timeout')), 5000); })]);
      } catch { error.startupDiagnostic = 'unavailable'; }
      finally { clearTimeout(timer); }
    }
    try {
      await context.close();
    } catch {
      // Preserve the worker-discovery failure; cleanup errors are secondary here.
    }
    throw error;
  }
}

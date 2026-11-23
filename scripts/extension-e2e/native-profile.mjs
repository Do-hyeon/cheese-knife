import path from 'node:path';
import { createHash, createPublicKey } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { openOwnedRoot } from '../owned-files.mjs';
import { NATIVE_ID } from './native-preflight-contract.mjs';
import { assertNativeInstallation } from './native-preflight.mjs';

const profilePath = 'output/p09-public-20261012152819/fresh-chrome-profile';
const fail = code => Object.assign(new Error(code), { code });
const need = ok => { if (!ok) throw fail('native-evidence-invalid'); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function extensionPublicKeyId(key) {
  need(typeof key === 'string' && key.length <= 8192);
  const bytes = Buffer.from(key,'base64'); need(bytes.toString('base64') === key);
  try { createPublicKey({key:bytes,format:'der',type:'spki'}); } catch { throw fail('native-evidence-invalid'); }
  return hash(bytes).slice(0,32).split('').map(c=>String.fromCharCode(97+parseInt(c,16))).join('');
}
function tokens(command) {
  need(typeof command === 'string' && command.length <= 32768);
  const result = []; let value = '', quoted = false;
  for (const c of command) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && /\s/u.test(c)) { if (value) { result.push(value); value=''; } }
    else value += c;
  }
  need(!quoted); if (value) result.push(value); return result;
}
function rootProcess(rows, profile, phase) {
  need(Array.isArray(rows) && rows.length <= 64); const roots = [];
  for (const row of rows) {
    const args = tokens(row.CommandLine);
    if (path.basename(args[0] || '').toLowerCase() !== 'chrome.exe' || args.some(v=>v === '--type' || v.startsWith('--type='))) continue;
    const dirs = [];
    for (const [i,arg] of args.entries()) {
      if (arg === '--user-data-dir') dirs.push(args.at(i+1));
      else if (arg.startsWith('--user-data-dir=')) dirs.push(arg.slice(16));
    }
    if (!dirs.length) continue; need(dirs.length === 1 && typeof dirs[0] === 'string' && path.isAbsolute(dirs[0]));
    if (path.resolve(dirs[0]).toLowerCase() !== profile.toLowerCase()) continue;
    need(Number.isSafeInteger(row.ProcessId) && row.ProcessId > 0 && Number.isSafeInteger(row.startedAt) && row.startedAt > 0);
    roots.push({pid:row.ProcessId,startedAt:row.startedAt});
  }
  need(['closed','after'].includes(phase) ? roots.length === 0 : roots.length === 1);
  return {queried:true,root:roots[0] || null};
}
export async function queryWindowsProcesses(profile, invoke=execFileSync) {
  if (process.platform !== 'win32') throw fail('native-unavailable');
  // Command lines stay in this child-result memory, never in artifacts or diagnostics.
  const target = Buffer.from(profile).toString('base64');
  const script = String.raw`
$ErrorActionPreference='Stop'
$taskProfile=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${target}'))
$taskAll=@(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'")
$taskRows=@(foreach($taskProcess in $taskAll) {
  $taskCommand=$taskProcess.CommandLine
  if(-not $taskCommand -or $taskCommand.Length -gt 32768) { throw 'native-unavailable' }
  if($taskCommand -match '(?:^|\s)--type(?:=|\s)') { continue }
  $taskMatches=[regex]::Matches($taskCommand,'(?:^|\s)(?:"--user-data-dir=([^"]+)"|--user-data-dir=(?:"([^"]+)"|([^\s"]+))|--user-data-dir\s+(?:"([^"]+)"|([^\s"]+)))')
  if($taskCommand.Contains('--user-data-dir') -and $taskMatches.Count -eq 0) { throw 'native-unavailable' }
  $taskSelected=$false
  foreach($taskMatch in $taskMatches) {
    foreach($taskGroup in $taskMatch.Groups | Select-Object -Skip 1) {
      if(-not $taskGroup.Success) { continue }
      $taskPath=$taskGroup.Value.Replace('/','\')
      if(-not [IO.Path]::IsPathRooted($taskPath)) { throw 'native-unavailable' }
      if([IO.Path]::GetFullPath($taskPath).TrimEnd('\').Equals($taskProfile,[StringComparison]::OrdinalIgnoreCase)) { $taskSelected=$true }
    }
  }
  if($taskSelected) { @{ ProcessId=[int]$taskProcess.ProcessId; startedAt=([DateTimeOffset]$taskProcess.CreationDate).ToUnixTimeMilliseconds(); CommandLine=$taskCommand } }
})
ConvertTo-Json -InputObject $taskRows -Compress`;
  try { return JSON.parse(invoke('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
    {encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true,timeout:15000,maxBuffer:1048576})); }
  catch { throw fail('native-unavailable'); }
}
async function readJSON(files,name,limit=1048576) {
  need((await files.lstat(name)).size <= limit); const bytes=await files.readFile(name); need(bytes.length<=limit);
  try { return JSON.parse(bytes); } catch { throw fail('native-evidence-invalid'); }
}
/** Read-only fixed-profile inspection; no launch, writes, settings, or browser connection. */
export async function readNativeFacts({repository,baseline,phase,runNonce,now=Date.now,queryProcesses:query=queryWindowsProcesses}) {
  need(['before','closed','restarted','after'].includes(phase) && /^[a-f0-9]{32}$/.test(runNonce));
  try {
    const resolved=await repository.resolve(profilePath,{type:'directory'}), profile=await openOwnedRoot(resolved);
    need(resolved === profile.root);
    const versions=await profile.readdir(`Default/Extensions/${NATIVE_ID}`);need(versions.length === 1 && versions[0] === '2.13.3_0');
    const prefix=`Default/Extensions/${NATIVE_ID}/2.13.3_0`;
    const installed=await openOwnedRoot(await profile.resolve(prefix,{type:'directory'}));
    const manifest=await readJSON(installed,'manifest.json');
    const preferences=await readJSON(profile,'Default/Preferences',16777216), secure=await readJSON(profile,'Default/Secure Preferences',16777216);
    const record=Object.getOwnPropertyDescriptor(secure.extensions?.settings || {},NATIVE_ID)?.value;
    need(record && record.manifest?.version === manifest.version);
    const dev=preferences.extensions?.ui?.developer_mode;need(dev === undefined || typeof dev === 'boolean');
    const files=[];let total=0;
    const walk=async (folder='',depth=0)=>{
      need(depth<=4);
      for(const name of await installed.readdir(folder)) {
        const relative=folder?`${folder}/${name}`:name,stat=await installed.lstat(relative);
        if(stat.isDirectory()) await walk(relative,depth+1);
        else {need(stat.isFile() && stat.size<=1048576 && files.length<60);total+=stat.size;need(total<=16777216);files.push([relative,hash(await installed.readFile(relative))]);}
      }
    };
    await walk();files.sort(([a],[b])=>a<b?-1:a>b?1:0);
    const grants=record.granted_permissions;
    need(Array.isArray(grants?.manifest_permissions) && grants.manifest_permissions.length===0 &&
      Array.isArray(grants?.scriptable_host) && grants.scriptable_host.length===1 && grants.scriptable_host[0]==='https://chzzk.naver.com/*');
    const installation={extensionId:NATIVE_ID,version:manifest.version,publicKeyId:extensionPublicKeyId(manifest.key),fromWebstore:record.from_webstore,
      disableReasons:record.disable_reasons,permissions:grants.api,origins:grants.explicit_host,manifest,
      locales:{en:await readJSON(installed,'_locales/en/messages.json'),ko:await readJSON(installed,'_locales/ko/messages.json')},files};
    assertNativeInstallation(installation,baseline);
    let rows;try {rows=await query(profile.root);} catch {throw fail('native-unavailable');}
    const processFacts=rootProcess(rows,profile.root,phase),capturedAt=now();
    need(Number.isSafeInteger(capturedAt) && capturedAt>0 && (!processFacts.root || processFacts.root.startedAt<=capturedAt));
    return {schema:1,runNonce,phase,capturedAt,profileIdentity:hash(profile.root.toLowerCase()),installation,developerMode:dev ?? false,process:processFacts};
  } catch(e) {throw fail(e.code === 'native-evidence-invalid' ? e.code : 'native-unavailable');}
}

(() => {
document.title = chrome.i18n.getMessage("ext_shortName");
(document.getElementById("stylesConfig") as HTMLElement).textContent =
  chrome.i18n.getMessage("config_styles");
if (window.top !== window) {
  (document.getElementById('media-controls') as HTMLElement).hidden = true;
  return;
}

type MediaTarget = { tabId: number; windowId: number; channelId: string | null };
type CapturedTab = chrome.tabs.Tab & { id: number };
function readMediaLocation(url: URL): { mode: 'global' | 'media'; target: MediaTarget | null; code: string | null } {
  const query = url.searchParams, modes = query.getAll('mediaSettings');
  if (!modes.length) return { mode: 'global', target: null, code: null };
  if (modes.length !== 1 || modes[0] !== '1') return { mode: 'global', target: null, code: 'media-mode-invalid' };
  const invalid = () => ({ mode: 'media' as const, target: null, code: 'media-target-invalid' });
  const keys = ['mediaSettings', 'targetTabId', 'targetWindowId', 'targetChannelId'];
  if (url.search.length > 512 || url.hash || [...query.keys()].some(key => !keys.includes(key) || query.getAll(key).length !== 1)) return invalid();
  const ids = ['targetTabId', 'targetWindowId'].map(key => query.get(key));
  const channelId = query.get('targetChannelId');
  if (ids.every(id => id === null) && channelId === null) return { mode: 'media', target: null, code: null };
  if (!ids.every(id => id !== null && /^(?:0|[1-9]\d{0,15})$/.test(id) && Number.isSafeInteger(Number(id))) ||
    (channelId !== null && !/^[a-f0-9]{32}$/.test(channelId))) return invalid();
  return { mode: 'media', target: { tabId: Number(ids[0]), windowId: Number(ids[1]), channelId }, code: null };
}
const mediaLocation = readMediaLocation(new URL(location.href));
document.body.classList.toggle('media-settings-tab', mediaLocation.mode === 'media');
const safeId = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id >= 0;
function hostTab(tab: chrome.tabs.Tab | undefined): CapturedTab | null {
  if (!tab || !safeId(tab.id) || !safeId(tab.windowId)) return null;
  try {
    if (new URL(tab.url as string).origin !== new URL(KnifeHostPolicy.origins[0] || '').origin) return null;
    return { ...tab, id: tab.id };
  } catch {}
  return null;
}
async function validateCapturedTarget(target: MediaTarget): Promise<CapturedTab | null> {
  try {
    const tab = hostTab(await chrome.tabs.get(target.tabId));
    if (!tab || tab.id !== target.tabId || tab.windowId !== target.windowId || tab.incognito !== false) return null;
    if (target.channelId && /^\/(?:live\/)?([a-f0-9]{32})\/?$/i.exec(new URL(tab.url as string).pathname)?.[1]?.toLowerCase() !== target.channelId) return null;
    return tab;
  } catch { return null; }
}

for (const [id, key, fallback] of [
  ["footer-guide", "footer_guide", "Guide"],
  ["footer-support", "footer_support", "Report issue"],
  ["footer-source", "footer_source", "Source"],
  ["footer-original", "footer_original", "Original project"],
] as const) {
  const link = document.getElementById(id);
  if (link) link.textContent = chrome.i18n.getMessage(key) || fallback;
}

const stylesLink = (document.getElementById('stylesConfig') as HTMLElement).closest('a') as HTMLAnchorElement;
const mediaEntry = document.getElementById('media-entry') as HTMLElement;
const mediaOpen = document.getElementById('media-open') as HTMLButtonElement;
const targetStatus = document.getElementById('media-target-status') as HTMLElement;
mediaOpen.textContent = chrome.i18n.getMessage('media_open');
(document.getElementById('media-entry-guide') as HTMLElement).textContent = chrome.i18n.getMessage('media_entry_guide');
targetStatus.textContent = mediaLocation.code ? chrome.i18n.getMessage('media_target_invalid') : chrome.i18n.getMessage('media_global_guide');
let originalTab: chrome.tabs.Tab | null = null, opening = false;
let targetCaptured = false, retired = false;
stylesLink.addEventListener('click', event => { if (retired || !targetCaptured) event.preventDefault(); });
const capturedTab = chrome.tabs.getCurrent().then(async ownTab => {
  if (retired) return null;
  if (mediaLocation.mode === 'media') return mediaLocation.target ? validateCapturedTarget(mediaLocation.target) : null;
  if (ownTab || mediaLocation.code) return null;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (retired) return null;
  originalTab = tab ?? null;
  mediaEntry.hidden = false;
  mediaOpen.disabled = !tab || !safeId(tab.id) || !safeId(tab.windowId) || tab.incognito !== false;
  return hostTab(tab);
}).catch(() => null);
async function openMediaTab(): Promise<void> {
  if (retired || opening || mediaOpen.disabled || !originalTab || !safeId(originalTab.id) || !safeId(originalTab.windowId) || originalTab.incognito !== false) return;
  opening = true; mediaOpen.disabled = true;
  try {
    const target = await capturedTab, originalWindow = await chrome.windows.get(originalTab.windowId);
    if (retired) return;
    if (originalWindow.id !== originalTab.windowId || originalWindow.incognito !== false) throw new Error('media-open-unavailable');
    const url = new URL(chrome.runtime.getURL('popup.html')); url.searchParams.set('mediaSettings', '1');
    if (target) {
      url.searchParams.set('targetTabId', String(target.id)); url.searchParams.set('targetWindowId', String(target.windowId));
      const channel = /^\/(?:live\/)?([a-f0-9]{32})\/?$/i.exec(new URL(target.url as string).pathname)?.[1]?.toLowerCase();
      if (channel) url.searchParams.set('targetChannelId', channel);
    }
    await chrome.tabs.create({ windowId: originalTab.windowId, url: url.href });
  } catch { if (!retired) targetStatus.textContent = chrome.i18n.getMessage('media_open_failed'); }
  finally { opening = false; mediaOpen.disabled = retired; }
}
mediaOpen.addEventListener('click', () => { void openMediaTab(); });
void capturedTab.then(tab => {
  if (retired) return;
  const url = new URL(chrome.runtime.getURL('styles.html'));
  if (tab) { url.searchParams.set('targetTabId', String(tab.id)); url.searchParams.set('targetWindowId', String(tab.windowId)); }
  stylesLink.href = url.href; targetCaptured = true; stylesLink.setAttribute('aria-disabled', 'false');
});

(async () => {
  const box = document.getElementById("capabilities") as HTMLElement;
  const message = (key: string, fallback: string) => chrome.i18n.getMessage(key) || fallback;
  const title = document.createElement("div"); title.className = "title";
  title.textContent = message("capability_title", "Current tab"); box.append(title);
  try {
    const tab = await capturedTab;
    if (!tab) throw new Error('no-target');
    const result: { statuses?: Record<string, { state: string; reason?: string }> } = await chrome.tabs.sendMessage(tab.id, { type: "cheese-knife-status" }, { frameId: 0 });
    const statusMap = new Map(Object.entries(result?.statuses || {}));
    let shown = 0;
    for (const feature of ["player", "mediaSettings", "compressor", "preview", "livePreview", "chatResize", "donationChat", "deletedChat", "sidebarRefresh", "statistics"]) {
      const status = statusMap.get(feature);
      if (!status) continue;
      const row = document.createElement("div"); row.className = "capability-row";
      const name = document.createElement("span"); name.textContent = message("capability_" + feature, feature);
      const value = document.createElement("span"); value.className = "capability-state " + status.state;
      value.textContent = message("capability_state_" + status.state, status.state);
      if (status.reason) row.title = message("capability_reason_" + status.reason.replaceAll("-", "_"), message("capability_reason_generic", "This feature is not available on the current page."));
      row.append(name, value); box.append(row); shown++;
    }
    if (!shown) throw new Error("no-active-features");
  } catch {
    const note = document.createElement("div"); note.className = "desc";
    note.textContent = message("capability_reload", "Open a CHZZK tab and reload it after updating the extension."); box.append(note);
  }
})();

let hardwareAcceleration = false;
try {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { failIfMajorPerformanceCaveat: true });
  hardwareAcceleration = !!gl;
} catch {}

const settingsClient = createSettingsClient(chrome);
const mediaClient = mediaLocation.mode === 'media' ? createMediaSettingsClient(chrome) : null;
(document.getElementById('media-controls') as HTMLElement).hidden = !mediaClient;
let globalView: KnifeSettingsView | null = null, mediaView: KnifeMediaView | null = null;
let currentScope: Extract<KnifeMediaSelection, { kind: 'current' }> | null = null;
const mediaDomain = (id: string): KnifeMediaDomain | null => KnifeMediaProfiles.audioFields.some(field => field.id === id) ? 'audio'
  : KnifeMediaProfiles.videoFields.some(field => field.id === id) ? 'video' : null;
const channelBinding = (channel: KnifeChannelRecord | null | undefined, domain: KnifeMediaDomain) => domain === 'audio' ? channel?.audio : channel?.video;
function editField(id: string, value: KnifeScalar) {
  if (retired) return;
  const domain = mediaDomain(id);
  if (!domain || !mediaView || mediaView.selection.kind === 'global') settingsClient.edit({ type: 'config', id, value });
  else if (domain === 'audio') mediaClient?.editFields('audio', { [id]: value });
  else mediaClient?.editFields('video', { [id]: value });
}
const renderFields = new Map<string, (view: KnifeSettingsView) => void>();
(() => {
  const list = document.getElementById("list") as HTMLElement;
  const createRow = (c: KnifeConfigLeaf) => {
    const row = document.createElement("div");
    row.classList.add("row");

    const label = document.createElement("label");
    label.htmlFor = c.id;
    const desc = chrome.i18n.getMessage(`config_${c.id}_desc`);
    if (desc) {
      label.title = desc;
    }
    label.textContent = chrome.i18n.getMessage(`config_${c.id}`);
    row.appendChild(label);

    let warning: HTMLAnchorElement | undefined;
    if (c.id === "sharpness") {
      warning = document.createElement("a");
      warning.style.visibility = 'hidden';
      warning.href = "#";
      warning.title = chrome.i18n.getMessage(`config_${c.id}_warning`);
      warning.textContent = "⚠️";
      warning.addEventListener("click", event => {
        event.preventDefault();
        if (retired) return;
        chrome.tabs.create({
          url: navigator.userAgent.includes("Firefox")
            ? "about:preferences"
            : "chrome://settings/system",
        });
      });
      label.appendChild(warning);
    }

    const input = document.createElement("input");
    input.id = c.id;
    input.disabled = true;
    row.appendChild(input);

    if (c.type == null) {
      input.type = "checkbox";
      input.addEventListener("change", (e) => {
        editField(c.id, (e.target as HTMLInputElement).checked);
      });
    } else if (c.type === "range") {
      input.type = "range";
      input.min = String(c.min);
      input.max = String(c.max);
      input.step = String(c.step);
      input.addEventListener("input", (e) => {
        editField(c.id, Number((e.target as HTMLInputElement).value));
      });
      input.addEventListener("dblclick", () => {
        input.value = String(Number(c.defaultValue));
        input.dispatchEvent(new Event("input"));
      });

      const current = document.createElement("span");
      const setCurrent = (v: string) => {
        current.textContent = c.digits ? Number(v).toFixed(c.digits) : v;
      };
      setCurrent(input.value);
      renderFields.set(c.id, view => {
        input.value = String(view.values.config[c.id]); setCurrent(input.value);
        input.disabled = !view.snapshot || view.phase === 'repair-required';
        if (warning) warning.style.visibility = view.values.config[c.id] && !hardwareAcceleration ? 'visible' : 'hidden';
      });
      row.appendChild(current);

      if (c.unit) {
        row.appendChild(document.createTextNode(c.unit));
      }
    }
    if (c.type == null) renderFields.set(c.id, view => {
      input.checked = view.values.config[c.id] as boolean; input.disabled = !view.snapshot || view.phase === 'repair-required';
    });
    return row;
  };

  for (const { id, configs } of CONFIGS) {
    const box = document.createElement("div");
    box.classList.add("box");
    list.appendChild(box);

    const title = document.createElement("div");
    title.classList.add("title");
    title.textContent = chrome.i18n.getMessage(`config_category_${id}`);
    box.appendChild(title);

    for (const c of configs) {
      if (c.type === "details") {
        const details = document.createElement("details");
        box.appendChild(details);

        const summary = document.createElement("summary");
        summary.textContent = chrome.i18n.getMessage(`config_category_${c.id}`);
        details.appendChild(summary);

        for (const cc of c.configs) {
          details.appendChild(createRow(cc));
        }

        const desc = chrome.i18n.getMessage(`config_category_${c.id}_desc`);
        if (desc) {
          const d = document.createElement("div");
          d.classList.add("desc");
          d.textContent = desc;
          details.appendChild(d);
        }
        if (mediaClient && (c.id === 'compressor' || c.id === 'videoFilter')) {
          details.classList.add('box'); details.open = true;
          const domain = c.id === 'compressor' ? 'audio' : 'video';
          const actions = (document.getElementById(`media-${domain}-enable`) as HTMLElement).parentElement!;
          details.appendChild(actions);
          (document.getElementById('media-fields') as HTMLElement).appendChild(details);
        }
        continue;
      }
      box.appendChild(createRow(c));
    }
  }
})();
const settingsStatus = document.getElementById('settings-status') as HTMLElement;
const discard = document.getElementById('settings-discard') as HTMLButtonElement;
discard.textContent = chrome.i18n.getMessage('settings_discard');
discard.addEventListener('click', () => { void settingsClient.discardPending(); });
settingsClient.subscribe(view => {
  globalView = view; renderMedia();
  settingsStatus.dataset.phase = view.phase;
  settingsStatus.textContent = chrome.i18n.getMessage(`settings_${view.phase.replace('-', '_')}`);
  discard.hidden = !['failed', 'unknown'].includes(view.phase);
});
const scopeSelect = document.getElementById('media-scope') as HTMLSelectElement;
const mediaStatus = document.getElementById('media-status') as HTMLElement;
const presetSelect = document.getElementById('media-preset') as HTMLSelectElement;
const presetName = document.getElementById('media-preset-name') as HTMLInputElement;
const presetDomain = document.getElementById('media-preset-domain') as HTMLSelectElement;
const mediaDiscard = document.getElementById('media-discard') as HTMLButtonElement;
const text = (key: string) => chrome.i18n.getMessage(key) || key;
for (const [id, key] of [['media-scope-label','media_scope'],['media-preset-name-label','media_preset_name'],
  ['media-preset-domain-label','media_preset_domain'],['media-preset-label','media_presets'],['media-discard','settings_discard'],
  ['media-preset-create','media_create'],['media-preset-apply','media_apply'],['media-preset-rename','media_rename'],
  ['media-preset-delete','media_delete_preset'],['media-channel-delete','media_delete_channel'],['media-refresh','media_refresh'],
  ['media-audio-enable','media_enable_audio'],['media-video-enable','media_enable_video'],
  ['media-audio-global','media_global_audio'],['media-video-global','media_global_video']] as const) {
  (document.getElementById(id) as HTMLElement).textContent = text(key);
}
scopeSelect.options[0]!.textContent = text('media_global');scopeSelect.options[1]!.textContent = text('media_current');
presetDomain.options[0]!.textContent = text('media_audio');presetDomain.options[1]!.textContent = text('media_video');
const scopeKey = (selection: KnifeMediaSelection) => selection.kind === 'saved' ? `saved:${selection.channelId}` : selection.kind;
let catalogueKey = '';
function confirmedPresetValues(domain: KnifeMediaDomain): Extract<KnifeValuesResult, { ok: true }> | null {
  const global = globalView, media = mediaView;
  if (!global?.snapshot || !media?.snapshot || global.phase !== 'ready' || media.phase !== 'ready' ||
    !media.snapshot.canWrite || global.pendingKeys.length || media.pendingKeys.length || media.pendingRequest) return null;
  const fields = domain === 'audio' ? KnifeMediaProfiles.audioFields : KnifeMediaProfiles.videoFields;
  const inherited = media.selection.kind === 'global' || !channelBinding(media.snapshot.channel, domain);
  if (inherited && (global.snapshot.revision !== media.snapshot.version.globalRevision ||
    fields.some(field => global.values.config[field.id] !== global.snapshot!.config[field.id]))) return null;
  const values = media.selection.kind === 'global'
    ? Object.fromEntries(fields.map(field => [field.id, global.snapshot!.config[field.id]]))
    : domain === 'audio' ? media.snapshot.values.audio : media.snapshot.values.video;
  const displayed = media.selection.kind === 'global' ? global.values.config : domain === 'audio' ? media.values.audio : media.values.video;
  if (fields.some(field => Reflect.get(displayed, field.id) !== Reflect.get(values, field.id))) return null;
  const validated = KnifeMediaProfiles.validateValues(domain, values);
  return validated.ok ? validated : null;
}
function renderMedia() {
  if (retired || !globalView) return;
  const selected = mediaView?.selection.kind !== 'global' && mediaView?.selection !== undefined;
  for (const [id, render] of renderFields) {
    const domain = mediaDomain(id);
    const projected = selected && domain && mediaView ? { ...globalView,
      values: { ...globalView.values, config: { ...globalView.values.config, ...(domain === 'audio' ? mediaView.values.audio : mediaView.values.video) } } } : globalView;
    render(projected);
    if (selected && domain) (document.getElementById(id) as HTMLInputElement).disabled =
      !mediaView?.snapshot?.canWrite || !channelBinding(mediaView.snapshot.channel, domain) ||
      ['loading','unknown','failed','conflict','repair-required','unavailable'].includes(mediaView.phase);
  }
  // The first global subscription is synchronous, before the media controls are bound.
  if (!mediaView) return;
  const blocked = mediaView.phase !== 'ready' || !mediaView.snapshot?.canWrite || globalView.phase !== 'ready';
  scopeSelect.disabled = ['saving','unknown'].includes(mediaView.phase) || mediaView.pendingKeys.length > 0;
  const store = mediaView.snapshot?.store;
  const nextCatalogue = JSON.stringify([store?.channels.map(channel => channel.channelId), store?.presets.map(preset => [preset.id,preset.name]), currentScope?.channelId, scopeKey(mediaView.selection)]);
  if (nextCatalogue !== catalogueKey) {
    catalogueKey = nextCatalogue;
    for (const option of [...scopeSelect.options].slice(2)) option.remove();
    for (const channel of store?.channels ?? []) { const option = document.createElement('option');
      option.value = `saved:${channel.channelId}`; option.textContent = channel.channelId; scopeSelect.append(option); }
    const savedId = mediaView.selection.kind === 'saved' ? mediaView.selection.channelId : null;
    if (savedId && !store?.channels.some(channel => channel.channelId === savedId)) {
      const option = document.createElement('option');option.value = scopeKey(mediaView.selection);
      option.textContent = savedId;scopeSelect.append(option);
    }
    const previous = presetSelect.value; presetSelect.replaceChildren();
    for (const preset of store?.presets ?? []) { const option = document.createElement('option');option.value = preset.id;
      option.textContent = `${text(`media_${preset.domain}`)} · ${preset.name}`;presetSelect.append(option); }
    if ([...presetSelect.options].some(option => option.value === previous)) presetSelect.value = previous;
  }
  scopeSelect.value = scopeKey(mediaView.selection);
  scopeSelect.options[1]!.disabled = !currentScope;
  const channel = mediaView.snapshot?.channel;
  for (const domain of ['audio','video'] as const) {
    (document.getElementById(`media-${domain}-enable`) as HTMLButtonElement).disabled = blocked || !selected || !!channelBinding(channel, domain);
    (document.getElementById(`media-${domain}-global`) as HTMLButtonElement).disabled = blocked || !selected || !channelBinding(channel, domain);
  }
  for (const id of ['media-preset-create','media-preset-apply','media-preset-rename','media-preset-delete','media-channel-delete']) {
    (document.getElementById(id) as HTMLButtonElement).disabled = blocked ||
      (id === 'media-channel-delete' ? !selected || !channel : id !== 'media-preset-create' && !presetSelect.value) ||
      (id === 'media-preset-create' && !confirmedPresetValues(presetDomain.value === 'audio' ? 'audio' : 'video')) ||
      (id === 'media-preset-apply' && selected && !channelBinding(channel, selectedPreset()?.domain ?? 'audio'));
  }
  mediaStatus.dataset.phase = mediaView.phase;
  mediaStatus.textContent = `${text(`media_${mediaView.phase.replace('-', '_')}`)}${mediaView.code ? ` (${mediaView.code})` : ''}`;
  mediaDiscard.hidden = !['failed','unknown','conflict'].includes(mediaView.phase);
  const draft = document.getElementById('media-draft') as HTMLElement, request = mediaView.pendingRequest;
  draft.hidden = !(request || mediaView.pendingKeys.length) || !['failed','unknown','conflict'].includes(mediaView.phase);
  draft.textContent = draft.hidden ? '' : `${text('media_draft')}\n${JSON.stringify({ action:request?.action,
    intent:mediaView.pendingValues ?? mediaView.values, name:request && 'name' in request ? request.name : undefined,
    saved:mediaView.snapshot?.values, version:mediaView.snapshot?.version },null,2)}`;
}
mediaClient?.subscribe(view => { mediaView = view; renderMedia(); });
void capturedTab.then(tab => {
  const id = mediaLocation.target?.channelId;
  if (retired) return;
  if (tab && id && tab.incognito === false) currentScope = { kind: 'current', tabId: tab.id, windowId: tab.windowId, channelId: id };
  if (mediaClient && mediaLocation.target && !tab) targetStatus.textContent = chrome.i18n.getMessage('media_target_changed');
  renderMedia();
});
scopeSelect.addEventListener('change', () => {
  if (retired) return;
  const next: KnifeMediaSelection | null = scopeSelect.value === 'global' ? { kind: 'global' } : scopeSelect.value === 'current' ? currentScope
    : scopeSelect.value.startsWith('saved:') ? { kind: 'saved', channelId: scopeSelect.value.slice(6) } : null;
  if (next && mediaClient) void mediaClient.selectScope(next).then(() => renderMedia());else renderMedia();
});
const perform = (request: KnifeMediaMutation) => { if (!retired) void mediaClient?.perform(request).catch(() => renderMedia()); };
function confirmPerform(request: KnifeMediaMutation, key: string, target: string) {
  const view = mediaView;
  if (retired || !view || view.phase !== 'ready' || !view.snapshot?.canWrite || view.pendingKeys.length || view.pendingRequest) return;
  if (!window.confirm(`${text(key)}\n${target}`)) return;
  if (mediaView?.phase !== 'ready' || !mediaView.snapshot?.canWrite || globalView?.phase !== 'ready' ||
    mediaView.pendingKeys.length || mediaView.pendingRequest || JSON.stringify(mediaView.selection) !== JSON.stringify(view.selection)) return;
  // Keep the pre-dialog tokens; the worker must reject a concurrent edit, not adopt it.
  perform(request);
}
for (const domain of ['audio','video'] as const) {
  (document.getElementById(`media-${domain}-enable`) as HTMLButtonElement).addEventListener('click', () => {
    const view = mediaView, channel = view?.snapshot?.channel;
    if (!view?.snapshot || view.selection.kind === 'global') return;
    perform({ action: 'enable-channel-domain', selection: view.selection, domain,
      expectedGlobalRevision: view.snapshot.version.globalRevision!, expectedMediaRevision: view.snapshot.version.mediaRevision!,
      expectedRecord: channel ? { createdRevision: channel.createdRevision, revision: channel.revision } : null });
  });
  (document.getElementById(`media-${domain}-global`) as HTMLButtonElement).addEventListener('click', () => {
    const view = mediaView, channel = view?.snapshot?.channel, binding = channelBinding(channel, domain);
    if (!view || view.selection.kind === 'global' || !channel || !binding) return;
    confirmPerform({ action: 'reset-channel-domain', selection: view.selection, domain, recordCreatedRevision: channel.createdRevision,
      domainCreatedRevision: binding.createdRevision, expectedRecordRevision: channel.revision },'media_confirm_reset',`${channel.channelId} · ${text(`media_${domain}`)}`);
  });
}
mediaDiscard.addEventListener('click', () => mediaClient?.discardPending());
(document.getElementById('media-refresh') as HTMLButtonElement).addEventListener('click', () => { void mediaClient?.refresh(); });
(document.getElementById('media-channel-delete') as HTMLButtonElement).addEventListener('click', () => {
  const view = mediaView, channel = view?.snapshot?.channel;
  if (view && view.selection.kind !== 'global' && channel) confirmPerform({ action:'delete-channel',selection:view.selection,
    recordCreatedRevision:channel.createdRevision,expectedRecordRevision:channel.revision },'media_confirm_channel',channel.channelId);
});
(document.getElementById('media-preset-create') as HTMLButtonElement).addEventListener('click', () => {
  const domain = presetDomain.value === 'audio' ? 'audio' : 'video',values = confirmedPresetValues(domain);
  if (!mediaView?.snapshot || !values) return;
  const common = { action:'create-preset' as const,id:crypto.randomUUID(),expectedMediaRevision:mediaView.snapshot.version.mediaRevision!,name:presetName.value };
  perform(values.domain === 'audio' ? { ...common,domain:'audio',values:values.values }
    : { ...common,domain:'video',values:values.values });
});
function selectedPreset() { return mediaView?.snapshot?.store?.presets.find(preset => preset.id === presetSelect.value); }
(document.getElementById('media-preset-apply') as HTMLButtonElement).addEventListener('click', () => {
  const preset = selectedPreset(),view = mediaView;if (!preset || !view?.snapshot) return;
  const presetToken = { id:preset.id,createdRevision:preset.createdRevision,revision:preset.revision };
  if (view.selection.kind === 'global') perform({ action:'apply-preset-global',presetToken,expectedGlobalRevision:globalView!.snapshot!.revision });
  else { const channel = view.snapshot.channel,binding = channelBinding(channel, preset.domain);if (!channel || !binding) return;
    perform({ action:'replace-channel-domain',selection:view.selection,domain:preset.domain,presetToken,expectedRecordRevision:channel.revision,
      channelToken:{ channelId:channel.channelId,recordCreatedRevision:channel.createdRevision,domainCreatedRevision:binding.createdRevision } }); }
});
(document.getElementById('media-preset-rename') as HTMLButtonElement).addEventListener('click', () => {
  const preset = selectedPreset();if (preset) perform({ action:'edit-preset',id:preset.id,createdRevision:preset.createdRevision,name:presetName.value });
});
(document.getElementById('media-preset-delete') as HTMLButtonElement).addEventListener('click', () => {
  const preset = selectedPreset();if (preset) confirmPerform({ action:'delete-preset',presetToken:{id:preset.id,createdRevision:preset.createdRevision,revision:preset.revision} },'media_confirm_preset',preset.name);
});
presetSelect.addEventListener('change',renderMedia);
presetDomain.addEventListener('change',renderMedia);
const reconnect = document.getElementById('settings-reconnect') as HTMLButtonElement;
reconnect.textContent = text('settings_reconnect');
function showReconnectionRequired(): void {
  for (const status of [settingsStatus, mediaStatus]) {
    status.dataset.phase = 'reconnect-required';status.textContent = text('settings_reconnect_required');
  }
  reconnect.hidden = false;reconnect.disabled = false;
}
function retireSettingsDocument(): void {
  if (retired) return;retired = true;
  const draft = document.getElementById('settings-retired-draft') as HTMLElement;
  const globalPending = globalView?.pendingKeys.length || globalView?.phase === 'saving' || globalView?.phase === 'unknown';
  const mediaPending = mediaView?.pendingRequest || mediaView?.pendingKeys.length;
  draft.hidden = !globalPending && !mediaPending;
  draft.textContent = draft.hidden ? '' : JSON.stringify({
    global: globalPending ? globalView?.values : null,
    media: mediaPending ? { request: mediaView?.pendingRequest, values: mediaView?.values, saved: mediaView?.snapshot?.values } : null,
  }, null, 2);
  for (const client of [settingsClient, mediaClient]) {
    try { client?.dispose(); } catch { /* Extension reload can retire its API before pagehide; keep the UI locked. */ }
  }
  for (const input of document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select')) input.disabled = true;
  stylesLink.setAttribute('aria-disabled','true');showReconnectionRequired();
}
let reconnecting = false;
reconnect.addEventListener('click', () => {
  if (!retired || reconnecting || !window.confirm(text('settings_reconnect_confirm'))) return;
  reconnecting = true;reconnect.disabled = true;location.reload();
});
window.addEventListener('pagehide', retireSettingsDocument);
window.addEventListener('pageshow', event => { if (event.persisted && retired) showReconnectionRequired(); });
})();

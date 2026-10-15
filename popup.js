// Generated from src/settings/popup.ts by scripts/settings-runtime.mjs. Do not edit.
(() => {
  document.title = chrome.i18n.getMessage("ext_shortName");
  document.getElementById("stylesConfig").textContent = chrome.i18n.getMessage("config_styles");
  if (window.top !== window) {
    document.getElementById("media-controls").hidden = true;
    return;
  }
  function readMediaLocation(url) {
    const query = url.searchParams, modes = query.getAll("mediaSettings");
    if (!modes.length) return { mode: "global", target: null, code: null };
    if (modes.length !== 1 || modes[0] !== "1") return { mode: "global", target: null, code: "media-mode-invalid" };
    const invalid = () => ({ mode: "media", target: null, code: "media-target-invalid" });
    const keys = ["mediaSettings", "targetTabId", "targetWindowId", "targetChannelId"];
    if (url.search.length > 512 || url.hash || [...query.keys()].some((key) => !keys.includes(key) || query.getAll(key).length !== 1)) return invalid();
    const ids = ["targetTabId", "targetWindowId"].map((key) => query.get(key));
    const channelId = query.get("targetChannelId");
    if (ids.every((id) => id === null) && channelId === null) return { mode: "media", target: null, code: null };
    if (!ids.every((id) => id !== null && /^(?:0|[1-9]\d{0,15})$/.test(id) && Number.isSafeInteger(Number(id))) || channelId !== null && !/^[a-f0-9]{32}$/.test(channelId)) return invalid();
    return { mode: "media", target: { tabId: Number(ids[0]), windowId: Number(ids[1]), channelId }, code: null };
  }
  const mediaLocation = readMediaLocation(new URL(location.href));
  document.body.classList.toggle("media-settings-tab", mediaLocation.mode === "media");
  const safeId = (id) => typeof id === "number" && Number.isSafeInteger(id) && id >= 0;
  function hostTab(tab) {
    if (!tab || !safeId(tab.id) || !safeId(tab.windowId)) return null;
    try {
      if (new URL(tab.url).origin !== new URL(KnifeHostPolicy.origins[0] || "").origin) return null;
      return { ...tab, id: tab.id };
    } catch {
    }
    return null;
  }
  async function validateCapturedTarget(target) {
    try {
      const tab = hostTab(await chrome.tabs.get(target.tabId));
      if (!tab || tab.id !== target.tabId || tab.windowId !== target.windowId || tab.incognito !== false) return null;
      if (target.channelId && /^\/(?:live\/)?([a-f0-9]{32})\/?$/i.exec(new URL(tab.url).pathname)?.[1]?.toLowerCase() !== target.channelId) return null;
      return tab;
    } catch {
      return null;
    }
  }
  for (const [id, key, fallback] of [
    ["footer-guide", "footer_guide", "Guide"],
    ["footer-support", "footer_support", "Report issue"],
    ["footer-source", "footer_source", "Source"],
    ["footer-original", "footer_original", "Original project"]
  ]) {
    const link = document.getElementById(id);
    if (link) link.textContent = chrome.i18n.getMessage(key) || fallback;
  }
  const stylesLink = document.getElementById("stylesConfig").closest("a");
  const mediaEntry = document.getElementById("media-entry");
  const mediaOpen = document.getElementById("media-open");
  const targetStatus = document.getElementById("media-target-status");
  mediaOpen.textContent = chrome.i18n.getMessage("media_open");
  document.getElementById("media-entry-guide").textContent = chrome.i18n.getMessage("media_entry_guide");
  targetStatus.textContent = mediaLocation.code ? chrome.i18n.getMessage("media_target_invalid") : chrome.i18n.getMessage("media_global_guide");
  let originalTab = null, opening = false;
  let targetCaptured = false, retired = false;
  stylesLink.addEventListener("click", (event) => {
    if (retired || !targetCaptured) event.preventDefault();
  });
  const capturedTab = chrome.tabs.getCurrent().then(async (ownTab) => {
    if (retired) return null;
    if (mediaLocation.mode === "media") return mediaLocation.target ? validateCapturedTarget(mediaLocation.target) : null;
    if (ownTab || mediaLocation.code) return null;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (retired) return null;
    originalTab = tab ?? null;
    mediaEntry.hidden = false;
    mediaOpen.disabled = !tab || !safeId(tab.id) || !safeId(tab.windowId) || tab.incognito !== false;
    return hostTab(tab);
  }).catch(() => null);
  async function openMediaTab() {
    if (retired || opening || mediaOpen.disabled || !originalTab || !safeId(originalTab.id) || !safeId(originalTab.windowId) || originalTab.incognito !== false) return;
    opening = true;
    mediaOpen.disabled = true;
    try {
      const target = await capturedTab, originalWindow = await chrome.windows.get(originalTab.windowId);
      if (retired) return;
      if (originalWindow.id !== originalTab.windowId || originalWindow.incognito !== false) throw new Error("media-open-unavailable");
      const url = new URL(chrome.runtime.getURL("popup.html"));
      url.searchParams.set("mediaSettings", "1");
      if (target) {
        url.searchParams.set("targetTabId", String(target.id));
        url.searchParams.set("targetWindowId", String(target.windowId));
        const channel = /^\/(?:live\/)?([a-f0-9]{32})\/?$/i.exec(new URL(target.url).pathname)?.[1]?.toLowerCase();
        if (channel) url.searchParams.set("targetChannelId", channel);
      }
      await chrome.tabs.create({ windowId: originalTab.windowId, url: url.href });
    } catch {
      if (!retired) targetStatus.textContent = chrome.i18n.getMessage("media_open_failed");
    } finally {
      opening = false;
      mediaOpen.disabled = retired;
    }
  }
  mediaOpen.addEventListener("click", () => {
    void openMediaTab();
  });
  void capturedTab.then((tab) => {
    if (retired) return;
    const url = new URL(chrome.runtime.getURL("styles.html"));
    if (tab) {
      url.searchParams.set("targetTabId", String(tab.id));
      url.searchParams.set("targetWindowId", String(tab.windowId));
    }
    stylesLink.href = url.href;
    targetCaptured = true;
    stylesLink.setAttribute("aria-disabled", "false");
  });
  (async () => {
    const box = document.getElementById("capabilities");
    const message = (key, fallback) => chrome.i18n.getMessage(key) || fallback;
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = message("capability_title", "Current tab");
    box.append(title);
    try {
      const tab = await capturedTab;
      if (!tab) throw new Error("no-target");
      const result = await chrome.tabs.sendMessage(tab.id, { type: "cheese-knife-status" }, { frameId: 0 });
      const statusMap = new Map(Object.entries(result?.statuses || {}));
      let shown = 0;
      for (const feature of ["player", "mediaSettings", "compressor", "preview", "livePreview", "chatResize", "donationChat", "deletedChat", "sidebarRefresh", "statistics"]) {
        const status = statusMap.get(feature);
        if (!status) continue;
        const row = document.createElement("div");
        row.className = "capability-row";
        const name = document.createElement("span");
        name.textContent = message("capability_" + feature, feature);
        const value = document.createElement("span");
        value.className = "capability-state " + status.state;
        value.textContent = message("capability_state_" + status.state, status.state);
        if (status.reason) row.title = message("capability_reason_" + status.reason.replaceAll("-", "_"), message("capability_reason_generic", "This feature is not available on the current page."));
        row.append(name, value);
        box.append(row);
        shown++;
      }
      if (!shown) throw new Error("no-active-features");
    } catch {
      const note = document.createElement("div");
      note.className = "desc";
      note.textContent = message("capability_reload", "Open a CHZZK tab and reload it after updating the extension.");
      box.append(note);
    }
  })();
  let hardwareAcceleration = false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", { failIfMajorPerformanceCaveat: true });
    hardwareAcceleration = !!gl;
  } catch {
  }
  const settingsClient = createSettingsClient(chrome);
  const mediaClient = mediaLocation.mode === "media" ? createMediaSettingsClient(chrome) : null;
  document.getElementById("media-controls").hidden = !mediaClient;
  let globalView = null, mediaView = null;
  let currentScope = null;
  const mediaDomain = (id) => [...KnifeMediaProfiles.audioFieldsV2, ...KnifeMediaProfiles.audioFields].some((field) => field.id === id) ? "audio" : KnifeMediaProfiles.videoFields.some((field) => field.id === id) ? "video" : null;
  const channelBinding = (channel, domain) => domain === "audio" ? channel?.audio : channel?.video;
  function editField(id, value) {
    if (retired) return;
    const domain = mediaDomain(id);
    if (!domain || !mediaClient) settingsClient.edit({ type: "config", id, value });
    else if (domain === "audio") mediaClient?.editFields("audio", { [id]: value });
    else mediaClient?.editFields("video", { [id]: value });
  }
  const renderFields = /* @__PURE__ */ new Map();
  (() => {
    const list = document.getElementById("list");
    const createRow = (c) => {
      const row = document.createElement("div");
      row.classList.add("row");
      const label2 = document.createElement("label");
      label2.htmlFor = c.id;
      const desc = chrome.i18n.getMessage(`config_${c.id}_desc`);
      if (desc) {
        label2.title = desc;
      }
      label2.textContent = chrome.i18n.getMessage(`config_${c.id}`);
      row.appendChild(label2);
      let warning;
      if (c.id === "sharpness") {
        warning = document.createElement("a");
        warning.style.visibility = "hidden";
        warning.href = "#";
        warning.title = chrome.i18n.getMessage(`config_${c.id}_warning`);
        warning.textContent = "\u26A0\uFE0F";
        warning.addEventListener("click", (event) => {
          event.preventDefault();
          if (retired) return;
          chrome.tabs.create({
            url: navigator.userAgent.includes("Firefox") ? "about:preferences" : "chrome://settings/system"
          });
        });
        label2.appendChild(warning);
      }
      const input = document.createElement("input");
      input.id = c.id;
      input.disabled = true;
      row.appendChild(input);
      if (c.type == null) {
        input.type = "checkbox";
        input.addEventListener("change", (e) => {
          editField(c.id, e.target.checked);
        });
      } else if (c.type === "range") {
        input.type = "range";
        input.min = String(c.min);
        input.max = String(c.max);
        input.step = String(c.step);
        input.addEventListener("input", (e) => {
          editField(c.id, Number(e.target.value));
        });
        input.addEventListener("dblclick", () => {
          input.value = String(Number(c.defaultValue));
          input.dispatchEvent(new Event("input"));
        });
        const current = document.createElement("span");
        const setCurrent = (v) => {
          current.textContent = c.digits ? Number(v).toFixed(c.digits) : v;
        };
        setCurrent(input.value);
        renderFields.set(c.id, (view) => {
          input.value = String(view.values.config[c.id]);
          setCurrent(input.value);
          input.disabled = !view.snapshot || view.phase === "repair-required";
          if (warning) warning.style.visibility = view.values.config[c.id] && !hardwareAcceleration ? "visible" : "hidden";
        });
        row.appendChild(current);
        if (c.unit) {
          row.appendChild(document.createTextNode(c.unit));
        }
      }
      if (c.type == null) renderFields.set(c.id, (view) => {
        input.checked = view.values.config[c.id];
        input.disabled = !view.snapshot || view.phase === "repair-required";
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
          if (mediaClient && c.id === "compressor") continue;
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
          if (mediaClient && (c.id === "compressor" || c.id === "videoFilter")) {
            details.classList.add("box");
            details.open = true;
            const domain = c.id === "compressor" ? "audio" : "video";
            const actions = document.getElementById(`media-${domain}-enable`).parentElement;
            details.appendChild(actions);
            document.getElementById("media-fields").appendChild(details);
          }
          continue;
        }
        box.appendChild(createRow(c));
      }
    }
  })();
  const settingsStatus = document.getElementById("settings-status");
  const discard = document.getElementById("settings-discard");
  discard.textContent = chrome.i18n.getMessage("settings_discard");
  discard.addEventListener("click", () => {
    void settingsClient.discardPending();
  });
  settingsClient.subscribe((view) => {
    globalView = view;
    renderMedia();
    settingsStatus.dataset.phase = view.phase;
    settingsStatus.textContent = chrome.i18n.getMessage(`settings_${view.phase.replace("-", "_")}`);
    discard.hidden = !["failed", "unknown"].includes(view.phase);
  });
  const scopeSelect = document.getElementById("media-scope");
  const mediaStatus = document.getElementById("media-status");
  const presetSelect = document.getElementById("media-preset");
  const presetName = document.getElementById("media-preset-name");
  const presetDomain = document.getElementById("media-preset-domain");
  const createName = document.getElementById("media-preset-create-name");
  const createDetails = document.getElementById("media-preset-new");
  const panelTabs = [...document.querySelectorAll("[data-media-panel]")];
  function showPanel(name, focus = false) {
    for (const tab of panelTabs) {
      const selected = tab.dataset.mediaPanel === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !selected;
      if (selected && focus) tab.focus();
    }
    if (name === "presets") renderMedia();
  }
  for (const tab of panelTabs) {
    tab.addEventListener("click", () => {
      if (!retired) showPanel(tab.dataset.mediaPanel);
    });
    tab.addEventListener("keydown", (event) => {
      if (retired || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = panelTabs.indexOf(tab), next = event.key === "Home" ? panelTabs[0] : event.key === "End" ? panelTabs.at(-1) : panelTabs.at((index + (event.key === "ArrowLeft" ? 2 : 1)) % 3);
      if (next) showPanel(next.dataset.mediaPanel, true);
    });
  }
  const createStatus = document.getElementById("media-create-status");
  const mediaDiscard = document.getElementById("media-discard");
  const text = (key) => chrome.i18n.getMessage(key) || key;
  const label = (key, fallback) => chrome.i18n.getMessage(key) || fallback;
  for (const element of document.querySelectorAll("[data-audio-label]")) {
    element.textContent = label("audio_ui_" + element.dataset.audioLabel, element.textContent ?? "");
  }
  const button = (id) => document.getElementById(id);
  for (const [id, key] of [
    ["media-scope-label", "media_scope"],
    ["media-preset-name-label", "media_preset_name"],
    ["media-preset-domain-label", "media_preset_domain"],
    ["media-preset-label", "media_presets"],
    ["media-discard", "settings_discard"],
    ["media-preset-create", "media_create"],
    ["media-preset-rename", "media_rename"],
    ["media-preset-delete", "media_delete_preset"],
    ["media-channel-delete", "media_delete_channel"],
    ["media-refresh", "media_refresh"],
    ["media-audio-enable", "media_enable_audio"],
    ["media-video-enable", "media_enable_video"],
    ["media-audio-global", "media_global_audio"],
    ["media-video-global", "media_global_video"]
  ]) {
    document.getElementById(id).textContent = text(key);
  }
  scopeSelect.options[0].textContent = text("media_global");
  scopeSelect.options[1].textContent = text("media_current");
  presetDomain.options[0].textContent = text("media_audio");
  presetDomain.options[1].textContent = text("media_video");
  const scopeKey = (selection) => selection.kind === "saved" ? "saved:" + selection.channelId : selection.kind;
  const fingerprint = () => mediaView?.snapshot ? JSON.stringify({ selection: mediaView.selection, snapshot: mediaView.snapshot, fresh: mediaView.fresh }) : "";
  const ready = () => !retired && mediaView?.phase === "ready" && mediaView.snapshot?.canWrite === true && mediaView.fresh && !mediaView.pendingRequest && !mediaView.pendingKeys.length && !audioUI?.hasDraft();
  const perform = (request) => {
    if (!retired) void mediaClient?.perform(request).catch(() => renderMedia());
  };
  function confirmPerform(request, key, target, upgrade = false) {
    if (!mediaClient || !mediaView?.snapshot || !ready() && !(upgrade && mediaView.phase === "ready" && mediaView.snapshot.code === "media-upgrade-required")) return;
    const payload = mediaClient.capture(request), basis = fingerprint();
    if (!window.confirm(label(key, key) + "\n" + target)) return;
    if (retired || basis !== fingerprint() || mediaView.phase !== "ready" || mediaView.pendingRequest || mediaView.pendingKeys.length) return;
    perform(payload);
  }
  function confirmedPresetValues(domain) {
    if (!ready() || !mediaView?.snapshot) return null;
    const snapshot = mediaView.snapshot;
    if (domain === "audio") {
      if (snapshot.gainOrigin === "site-legacy") return null;
      const validated2 = KnifeMediaProfiles.validateAudioV2({ ...snapshot.values.audio, audioGain: snapshot.effectiveGain, gainInherited: false });
      return validated2.ok ? { domain, values: validated2.values } : null;
    }
    const validated = KnifeMediaProfiles.validateValues("video", snapshot.values.video);
    return validated.ok && validated.domain === "video" ? { domain, values: validated.values } : null;
  }
  let creation = null, creationExpired = false;
  let creationOpenedBySaveAs = false, managementOpened = false;
  const createDrafts = /* @__PURE__ */ new Map([["audio", ""], ["video", ""]]);
  let createDomain = "audio", catalogueKey = "";
  function prepareCreation(domain) {
    createDrafts.set(createDomain, createName.value);
    createDomain = domain;
    presetDomain.value = domain;
    createName.value = createDrafts.get(domain) ?? "";
    const source = confirmedPresetValues(domain);
    creation = source ? { basis: fingerprint(), source: structuredClone(source) } : null;
    creationExpired = false;
    renderMedia();
  }
  const audioTransport = createSettingsRequestTransport(chrome);
  let audioState = null, audioBusy = false, audioEpoch = 0;
  let audioRoutePath = null;
  let legacy = null;
  let legacyBusy = false;
  const legacyStatus = document.getElementById("media-legacy-status");
  const legacyLimited = label("audio_ui_legacy_limited", "\uC0AC\uC774\uD2B8 Gain \uC77D\uAE30\xB7\uAC00\uC838\uC624\uAE30\uB294 \uD655\uC778\uB41C \uB77C\uC774\uBE0C \uCC44\uB110\uC5D0\uC11C\uB9CC \uC9C0\uC6D0\uD569\uB2C8\uB2E4. VOD\uC5D0\uC11C\uB294 Gain\uC744 \uC9C1\uC811 \uC800\uC7A5\uD574 \uC8FC\uC138\uC694.");
  let audioMessage = label("audio_ui_target_missing", "\uBC29\uC1A1 \uD0ED\uC5D0\uC11C \uC124\uC815\uC744 \uB2E4\uC2DC \uC5F4\uC5B4 \uC8FC\uC138\uC694.");
  async function refreshAudio(wanted) {
    if (retired || !mediaLocation.target || !audioRoutePath || audioBusy || wanted !== void 0 && !audioState) return;
    const target = { tabId: mediaLocation.target.tabId, windowId: mediaLocation.target.windowId, routePath: audioRoutePath };
    const sequence = ++audioEpoch, basis = scopeKey(mediaView?.selection ?? { kind: "global" }), binding = audioState;
    audioBusy = true;
    renderMedia();
    try {
      const request = wanted === void 0 ? { action: "get-audio-state", target } : { action: "set-audio-wanted", target, binding, wanted };
      const { reply } = await audioTransport.send(3, request).promise;
      if (retired || sequence !== audioEpoch || basis !== scopeKey(mediaView?.selection ?? { kind: "global" })) return;
      if (!reply.ok || !reply.audioState) throw new Error(reply.code || "audio-target-unavailable");
      audioState = reply.audioState;
      audioMessage = reply.audioState.state === "pending" || reply.audioState.state === "unavailable" ? label("audio_ui_resume_hint", "\uBC29\uC1A1\uC5D0\uC11C \uBCF4\uC815 \uBC84\uD2BC\uC744 \uC9C1\uC811 \uB20C\uB7EC \uC8FC\uC138\uC694. \uC124\uC815 \uD0ED\uC740 \uC7AC\uC0DD \uAD8C\uD55C\uC744 \uC804\uB2EC\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.") : label("audio_ui_advisory", "\uD604\uC7AC \uBC29\uC1A1\uC758 \uC801\uC6A9 \uC0C1\uD0DC\uC785\uB2C8\uB2E4. \uC2E4\uC81C \uCD9C\uB825 \uC74C\uB7C9 \uCE21\uC815\uAC12\uC740 \uC544\uB2D9\uB2C8\uB2E4.");
    } catch {
      if (retired || sequence !== audioEpoch) return;
      audioState = null;
      audioMessage = label("audio_ui_target_changed", "\uC6D0\uB798 \uBC29\uC1A1 \uBB38\uC11C\uAC00 \uBC14\uB00C\uC5C8\uAC70\uB098 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC0C8\uB85C \uC870\uD68C\uD574 \uC8FC\uC138\uC694. \uC790\uB3D9 \uC7AC\uC2DC\uB3C4\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    } finally {
      if (sequence === audioEpoch) {
        audioBusy = false;
        renderMedia();
      }
    }
  }
  const audioUI = mediaClient ? createAudioSettingsUI(document.getElementById("media-audio-panel"), {
    edit(patch) {
      if (Object.hasOwn(patch, "gainInherited") && patch.gainInherited === true && mediaView?.snapshot && ready()) {
        const view = mediaView, channel = view.snapshot.channel;
        if (view.selection.kind === "global") confirmPerform({
          action: "patch-global-fields",
          domain: "audio",
          patch: { gainInherited: true },
          expectedGlobalRevision: view.snapshot.version.globalRevision
        }, "media_confirm_gain_inherit", text("media_global"));
        else if (channel?.audio) confirmPerform(
          {
            action: "patch-channel-fields",
            domain: "audio",
            selection: view.selection,
            patch: { gainInherited: true },
            channelToken: { channelId: channel.channelId, recordCreatedRevision: channel.createdRevision, domainCreatedRevision: channel.audio.createdRevision }
          },
          "media_confirm_gain_inherit",
          channel.channelId
        );
        renderMedia();
      } else mediaClient.editFields("audio", patch);
    },
    wanted(value) {
      void refreshAudio(value);
    },
    draftChanged: renderMedia
  }) : null;
  const applySelect = (domain) => document.getElementById("media-" + domain + "-preset");
  function selectedPreset() {
    return mediaView?.snapshot?.store?.presets.find((preset) => preset.id === presetSelect.value);
  }
  function renderMedia() {
    if (retired || !globalView) return;
    const selected = mediaView?.selection.kind !== "global" && mediaView?.selection !== void 0;
    for (const [id, render] of renderFields) {
      const domain = mediaDomain(id);
      const projected = mediaClient && domain && mediaView ? {
        ...globalView,
        values: { ...globalView.values, config: { ...globalView.values.config, ...domain === "audio" ? mediaView.values.audio : mediaView.values.video } }
      } : globalView;
      render(projected);
      if (mediaClient && domain && mediaView) document.getElementById(id).disabled = !mediaView.snapshot?.canWrite || selected && !channelBinding(mediaView.snapshot.channel, domain) || ["loading", "unknown", "failed", "conflict", "repair-required", "unavailable"].includes(mediaView.phase);
    }
    if (!mediaView) return;
    const blocked = !ready(), snapshot = mediaView.snapshot, channel = snapshot?.channel, store = snapshot?.store;
    button("media-legacy-read").disabled = !currentScope || legacyBusy;
    button("media-legacy-import").disabled = !currentScope || blocked || !legacy || legacy.basis !== fingerprint();
    if (!currentScope) legacyStatus.textContent = legacyLimited;
    else if (legacyStatus.textContent === legacyLimited) legacyStatus.textContent = "";
    if (!managementOpened && !document.getElementById("media-presets").hidden && snapshot && mediaView.phase === "ready") {
      managementOpened = true;
      if (!store?.presets.length) createDetails.open = true;
    }
    scopeSelect.disabled = audioBusy || ["saving", "unknown"].includes(mediaView.phase) || mediaView.pendingKeys.length > 0;
    const nextCatalogue = JSON.stringify([store?.channels.map((item) => item.channelId), store?.presets.map((item) => [item.id, item.name, item.domain]), currentScope?.channelId, scopeKey(mediaView.selection)]);
    if (nextCatalogue !== catalogueKey) {
      catalogueKey = nextCatalogue;
      for (const option of [...scopeSelect.options].slice(2)) option.remove();
      for (const item of store?.channels ?? []) {
        const option = document.createElement("option");
        option.value = "saved:" + item.channelId;
        option.textContent = item.channelId;
        scopeSelect.append(option);
      }
      if (mediaView.selection.kind === "saved") {
        const id = mediaView.selection.channelId;
        if (![...scopeSelect.options].some((option) => option.value === "saved:" + id)) {
          const option = document.createElement("option");
          option.value = "saved:" + id;
          option.textContent = id;
          scopeSelect.append(option);
        }
      }
      const previous = presetSelect.value;
      presetSelect.replaceChildren();
      for (const preset of store?.presets ?? []) {
        const option = document.createElement("option");
        option.value = preset.id;
        option.textContent = text("media_" + preset.domain) + " \xB7 " + preset.name;
        presetSelect.append(option);
      }
      if ([...presetSelect.options].some((option) => option.value === previous)) presetSelect.value = previous;
      for (const domain of ["audio", "video"]) {
        const select = applySelect(domain), old = select.value;
        select.replaceChildren();
        const entries = domain === "audio" ? [["recipe:compressor", label("audio_ui_recipe_compressor", "\uAE30\uC874 \uCEF4\uD504\uB808\uC11C")], ["recipe:voice", label("audio_ui_recipe_voice", "\uC74C\uC131 EQ")]] : [];
        for (const preset of store?.presets ?? []) if (preset.domain === domain) entries.push([preset.id, preset.name]);
        for (const [value, name] of entries) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = name;
          select.append(option);
        }
        if ([...select.options].some((option) => option.value === old)) select.value = old;
      }
    }
    scopeSelect.value = scopeKey(mediaView.selection);
    scopeSelect.options[1].disabled = !currentScope;
    for (const domain of ["audio", "video"]) {
      button("media-" + domain + "-enable").disabled = blocked || !selected || !!channelBinding(channel, domain);
      button("media-" + domain + "-global").disabled = blocked || !selected || !channelBinding(channel, domain);
      button("media-" + domain + "-preset-apply").disabled = blocked || !applySelect(domain).value || selected && !channelBinding(channel, domain);
      button("media-" + domain + "-save-preset").disabled = !confirmedPresetValues(domain);
      applySelect(domain).disabled = blocked;
    }
    button("media-channel-delete").disabled = blocked || !selected || !channel;
    for (const id of ["media-preset-rename", "media-preset-delete"]) button(id).disabled = blocked || !selectedPreset();
    if (creation && creation.basis !== fingerprint()) creationExpired = true;
    button("media-preset-create").disabled = blocked || !creation || creationExpired;
    createStatus.textContent = creationExpired ? label("audio_ui_create_expired", "\uC6D0\uB798 \uC124\uC815\uC774 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC774\uB984\uC740 \uBCF4\uC874\uD588\uC2B5\uB2C8\uB2E4. \uC0DD\uC131 \uC601\uC5ED\uC744 \uB2E4\uC2DC \uC5F4\uC5B4 \uC900\uBE44\uD574 \uC8FC\uC138\uC694.") : creation ? label("audio_ui_create_ready", "\uC9C4\uC785 \uC2DC \uD655\uC815 \uC800\uC7A5\uAC12\uC73C\uB85C \uC0DD\uC131\uD569\uB2C8\uB2E4.") : label("audio_ui_gain_unconfirmed", "\uC0AC\uC774\uD2B8 Gain\uC740 \uBBF8\uD655\uC778\uC785\uB2C8\uB2E4. Gain\uC744 \uC9C1\uC811 \uC800\uC7A5\uD558\uAC70\uB098 \uC77D\uC5B4 \uAC00\uC838\uC628 \uB4A4 \uB2E4\uC2DC \uC900\uBE44\uD574 \uC8FC\uC138\uC694.");
    const upgrade = button("media-upgrade");
    upgrade.hidden = snapshot?.code !== "media-upgrade-required";
    upgrade.disabled = mediaView.phase !== "ready";
    audioUI?.render({
      values: mediaView.values.audio,
      effectiveGain: mediaView.pendingKeys.includes("audio:audioGain") ? mediaView.values.audio.audioGain : snapshot?.gainOrigin === "site-legacy" ? legacy?.basis === fingerprint() ? legacy.value.value : null : snapshot?.effectiveGain ?? null,
      globalScope: mediaView.selection.kind === "global",
      gainOrigin: snapshot?.gainOrigin ?? "site-legacy",
      editable: !!snapshot?.canWrite && (!selected || !!channel?.audio) && !["loading", "unknown", "failed", "conflict", "repair-required", "unavailable"].includes(mediaView.phase),
      wanted: audioState?.wanted ?? false,
      masterAvailable: !!audioState && !audioBusy,
      masterStatus: audioMessage
    });
    mediaStatus.dataset.phase = mediaView.phase;
    mediaStatus.textContent = text("media_" + mediaView.phase.replace("-", "_")) + (mediaView.code ? " (" + mediaView.code + ")" : "");
    mediaDiscard.hidden = !["failed", "unknown", "conflict"].includes(mediaView.phase);
    const draft = document.getElementById("media-draft"), request = mediaView.pendingRequest;
    draft.hidden = !(request || mediaView.pendingKeys.length) || !["failed", "unknown", "conflict"].includes(mediaView.phase);
    draft.textContent = draft.hidden ? "" : text("media_draft") + "\n" + JSON.stringify({
      action: request?.action,
      intent: mediaView.pendingValues ?? mediaView.values,
      name: request && "name" in request ? request.name : void 0,
      saved: snapshot?.values,
      version: snapshot?.version
    }, null, 2);
  }
  mediaClient?.subscribe((view) => {
    mediaView = view;
    renderMedia();
  });
  void capturedTab.then((tab) => {
    if (retired) return;
    const id = mediaLocation.target?.channelId;
    if (tab && id && tab.incognito === false) currentScope = { kind: "current", tabId: tab.id, windowId: tab.windowId, channelId: id };
    if (mediaClient && mediaLocation.target && !tab) targetStatus.textContent = text("media_target_changed");
    if (tab) audioRoutePath = new URL(tab.url).pathname;
    renderMedia();
    if (tab && mediaClient) void refreshAudio();
  });
  scopeSelect.addEventListener("change", () => {
    if (retired || audioBusy) return;
    const next = scopeSelect.value === "global" ? { kind: "global" } : scopeSelect.value === "current" ? currentScope : scopeSelect.value.startsWith("saved:") ? { kind: "saved", channelId: scopeSelect.value.slice(6) } : null;
    if (next && mediaClient) {
      audioEpoch++;
      audioState = null;
      void mediaClient.selectScope(next).then(() => {
        renderMedia();
        void refreshAudio();
      });
    } else renderMedia();
  });
  for (const domain of ["audio", "video"]) {
    button("media-" + domain + "-enable").addEventListener("click", () => {
      const view = mediaView, channel = view?.snapshot?.channel;
      if (!view?.snapshot || view.selection.kind === "global") return;
      perform({
        action: "enable-channel-domain",
        selection: view.selection,
        domain,
        expectedGlobalRevision: view.snapshot.version.globalRevision,
        expectedMediaRevision: view.snapshot.version.mediaRevision,
        expectedRecord: channel ? { createdRevision: channel.createdRevision, revision: channel.revision } : null
      });
    });
    button("media-" + domain + "-global").addEventListener("click", () => {
      const view = mediaView, channel = view?.snapshot?.channel, binding = channelBinding(channel, domain);
      if (!view || view.selection.kind === "global" || !channel || !binding) return;
      confirmPerform({
        action: "reset-channel-domain",
        selection: view.selection,
        domain,
        recordCreatedRevision: channel.createdRevision,
        domainCreatedRevision: binding.createdRevision,
        expectedRecordRevision: channel.revision
      }, "media_confirm_reset", channel.channelId + " \xB7 " + text("media_" + domain));
    });
    applySelect(domain).addEventListener("change", renderMedia);
    button("media-" + domain + "-save-preset").addEventListener("click", () => {
      prepareCreation(domain);
      if (!createDetails.open) creationOpenedBySaveAs = true;
      createDetails.open = true;
      showPanel("presets");
      createName.focus();
    });
    button("media-" + domain + "-preset-apply").addEventListener("click", () => {
      const view = mediaView, snapshot = view?.snapshot, choice = applySelect(domain).value;
      if (!view || !snapshot || !ready()) return;
      let patch = null;
      if (domain === "audio" && choice.startsWith("recipe:")) {
        patch = Object.fromEntries(KnifeMediaProfiles.audioFields.filter((field) => field.id !== "compressorDefault").map((field) => [field.id, field.defaultValue]));
        Object.assign(patch, { compressorEnabled: true, eqEnabled: false, normalizerEnabled: false }, Object.fromEntries([[63, -2], [125, -1], [250, -1], [500, 0], [1e3, 1], [2e3, 2], [4e3, 1], [8e3, 0]].map(([hz, gain]) => ["eq" + hz, choice === "recipe:voice" ? gain : 0])));
        if (choice === "recipe:voice") patch.eqEnabled = true;
      }
      const preset = snapshot.store?.presets.find((item) => item.id === choice && item.domain === domain);
      const presetToken = preset ? { id: preset.id, createdRevision: preset.createdRevision, revision: preset.revision } : null;
      if (!patch && !presetToken) return;
      const title = preset?.name ?? applySelect(domain).selectedOptions[0]?.textContent ?? "";
      if (view.selection.kind === "global") {
        if (patch) confirmPerform({ action: "patch-global-fields", domain: "audio", patch, expectedGlobalRevision: snapshot.version.globalRevision }, "media_confirm_apply", title);
        else confirmPerform({ action: "apply-preset-global", presetToken, expectedGlobalRevision: snapshot.version.globalRevision }, "media_confirm_apply", title);
      } else {
        const channel = snapshot.channel, binding = channelBinding(channel, domain);
        if (!channel || !binding) return;
        const common = {
          action: "replace-channel-domain",
          selection: view.selection,
          domain,
          expectedRecordRevision: channel.revision,
          channelToken: { channelId: channel.channelId, recordCreatedRevision: channel.createdRevision, domainCreatedRevision: binding.createdRevision }
        };
        confirmPerform(patch ? { ...common, domain: "audio", values: { ...snapshot.values.audio, ...patch } } : { ...common, presetToken }, "media_confirm_apply", title);
      }
    });
  }
  mediaDiscard.addEventListener("click", () => {
    void mediaClient?.discardPending();
  });
  button("media-refresh").addEventListener("click", () => {
    void mediaClient?.refresh();
    void refreshAudio();
  });
  button("media-upgrade").addEventListener("click", () => {
    if (mediaView?.snapshot) confirmPerform({
      action: "upgrade-media-store",
      expectedMediaRevision: mediaView.snapshot.version.mediaRevision
    }, "media_confirm_upgrade", label("audio_ui_upgrade_note", "\uC800\uC7A5 \uD615\uC2DD\uB9CC \uC804\uD658\uD558\uBA70 \uD604\uC7AC \uBC29\uC1A1\uC758 \uBCF4\uC815\uC744 \uC790\uB3D9\uC73C\uB85C \uCF1C\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."), true);
  });
  button("media-channel-delete").addEventListener("click", () => {
    const view = mediaView, channel = view?.snapshot?.channel;
    if (view && view.selection.kind !== "global" && channel) confirmPerform({
      action: "delete-channel",
      selection: view.selection,
      recordCreatedRevision: channel.createdRevision,
      expectedRecordRevision: channel.revision
    }, "media_confirm_channel", channel.channelId);
  });
  createDetails.addEventListener("toggle", () => {
    if (!createDetails.open || retired) {
      creationOpenedBySaveAs = false;
      return;
    }
    if (creationOpenedBySaveAs) {
      creationOpenedBySaveAs = false;
      return;
    }
    prepareCreation(presetDomain.value === "audio" ? "audio" : "video");
  });
  presetDomain.addEventListener("change", () => prepareCreation(presetDomain.value === "audio" ? "audio" : "video"));
  createName.addEventListener("input", () => {
    createDrafts.set(createDomain, createName.value);
  });
  button("media-preset-create").addEventListener("click", () => {
    if (!creation || !ready() || creation.basis !== fingerprint() || !mediaClient || !mediaView?.snapshot) {
      creationExpired = true;
      renderMedia();
      return;
    }
    const source = creation.source, common = {
      action: "create-preset",
      id: crypto.randomUUID(),
      expectedMediaRevision: mediaView.snapshot.version.mediaRevision,
      name: createName.value
    };
    const request = mediaClient.capture(source.domain === "audio" ? { ...common, domain: "audio", values: source.values } : { ...common, domain: "video", values: source.values });
    perform(request);
  });
  button("media-preset-rename").addEventListener("click", () => {
    const preset = selectedPreset();
    if (preset) perform({ action: "edit-preset", id: preset.id, createdRevision: preset.createdRevision, name: presetName.value });
  });
  button("media-preset-delete").addEventListener("click", () => {
    const preset = selectedPreset();
    if (preset) confirmPerform({ action: "delete-preset", presetToken: { id: preset.id, createdRevision: preset.createdRevision, revision: preset.revision } }, "media_confirm_preset", preset.name);
  });
  presetSelect.addEventListener("change", renderMedia);
  button("media-legacy-read").addEventListener("click", () => {
    if (!currentScope || retired || legacyBusy) return;
    const basis = fingerprint(), scope = { ...currentScope };
    legacyBusy = true;
    renderMedia();
    void audioTransport.send(3, { action: "read-legacy-gain", selection: scope }).promise.then(({ reply }) => {
      if (retired || basis !== fingerprint() || !reply.ok || !reply.legacyGain) return;
      legacy = { value: reply.legacyGain, revision: reply.snapshot.version.globalRevision, basis };
      legacyStatus.textContent = (reply.legacyGain.value * 100).toFixed(2) + "% \xB7 " + reply.legacyGain.state;
      renderMedia();
    }).catch(() => {
      legacy = null;
    }).finally(() => {
      legacyBusy = false;
      renderMedia();
    });
  });
  button("media-legacy-import").addEventListener("click", () => {
    if (!legacy || !currentScope || legacy.basis !== fingerprint()) {
      button("media-legacy-import").disabled = true;
      return;
    }
    confirmPerform({
      action: "import-legacy-gain",
      selection: { ...currentScope },
      expectedGlobalRevision: legacy.revision,
      documentId: legacy.value.documentId,
      value: legacy.value.value
    }, "media_confirm_gain_import", (legacy.value.value * 100).toFixed(2) + "% \xB7 " + text("media_global"));
  });
  const reconnect = document.getElementById("settings-reconnect");
  reconnect.textContent = text("settings_reconnect");
  function showReconnectionRequired() {
    for (const status of [settingsStatus, mediaStatus]) {
      status.dataset.phase = "reconnect-required";
      status.textContent = text("settings_reconnect_required");
    }
    reconnect.hidden = false;
    reconnect.disabled = false;
  }
  function retireSettingsDocument() {
    if (retired) return;
    retired = true;
    audioEpoch++;
    audioState = null;
    audioTransport.dispose();
    const draft = document.getElementById("settings-retired-draft");
    const globalPending = globalView?.pendingKeys.length || globalView?.phase === "saving" || globalView?.phase === "unknown";
    const mediaPending = mediaView?.pendingRequest || mediaView?.pendingKeys.length;
    draft.hidden = !globalPending && !mediaPending;
    draft.textContent = draft.hidden ? "" : JSON.stringify({
      global: globalPending ? globalView?.values : null,
      media: mediaPending ? { request: mediaView?.pendingRequest, values: mediaView?.values, saved: mediaView?.snapshot?.values } : null
    }, null, 2);
    for (const client of [settingsClient, mediaClient]) {
      try {
        client?.dispose();
      } catch {
      }
    }
    for (const input of document.querySelectorAll("input,button,select")) input.disabled = true;
    stylesLink.setAttribute("aria-disabled", "true");
    showReconnectionRequired();
  }
  let reconnecting = false;
  reconnect.addEventListener("click", () => {
    if (!retired || reconnecting || !window.confirm(text("settings_reconnect_confirm"))) return;
    reconnecting = true;
    reconnect.disabled = true;
    location.reload();
  });
  window.addEventListener("pagehide", retireSettingsDocument);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && retired) showReconnectionRequired();
  });
})();

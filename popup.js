// Generated from src/settings/popup.ts by scripts/settings-runtime.mjs. Do not edit.
(() => {
  document.title = chrome.i18n.getMessage("ext_shortName");
  document.getElementById("stylesConfig").textContent = chrome.i18n.getMessage("config_styles");
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
  let targetCaptured = false;
  stylesLink.addEventListener("click", (event) => {
    if (!targetCaptured) event.preventDefault();
  });
  const capturedTab = chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (!tab || typeof tab.id !== "number" || !Number.isSafeInteger(tab.id) || tab.id < 0 || !Number.isSafeInteger(tab.windowId) || tab.windowId < 0 || new URL(tab.url).origin !== "https://chzzk.naver.com") return null;
    return { ...tab, id: tab.id };
  }).catch(() => null);
  void capturedTab.then((tab) => {
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
      for (const feature of ["player", "compressor", "preview", "livePreview", "chatResize", "donationChat", "deletedChat", "sidebarRefresh", "statistics"]) {
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
  const mediaClient = createMediaSettingsClient(chrome);
  let globalView = null, mediaView = null;
  let currentScope = null;
  const mediaDomain = (id) => KnifeMediaProfiles.audioFields.some((field) => field.id === id) ? "audio" : KnifeMediaProfiles.videoFields.some((field) => field.id === id) ? "video" : null;
  const channelBinding = (channel, domain) => domain === "audio" ? channel?.audio : channel?.video;
  function editField(id, value) {
    const domain = mediaDomain(id);
    if (!domain || !mediaView || mediaView.selection.kind === "global") settingsClient.edit({ type: "config", id, value });
    else if (domain === "audio") mediaClient.editFields("audio", { [id]: value });
    else mediaClient.editFields("video", { [id]: value });
  }
  const renderFields = /* @__PURE__ */ new Map();
  (() => {
    const list = document.getElementById("list");
    const createRow = (c) => {
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
      let warning;
      if (c.id === "sharpness") {
        warning = document.createElement("a");
        warning.style.visibility = "hidden";
        warning.href = "#";
        warning.title = chrome.i18n.getMessage(`config_${c.id}_warning`);
        warning.textContent = "\u26A0\uFE0F";
        warning.addEventListener("click", (event) => {
          event.preventDefault();
          chrome.tabs.create({
            url: navigator.userAgent.includes("Firefox") ? "about:preferences" : "chrome://settings/system"
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
  const mediaDiscard = document.getElementById("media-discard");
  const text = (key) => chrome.i18n.getMessage(key) || key;
  for (const [id, key] of [
    ["media-scope-label", "media_scope"],
    ["media-preset-name-label", "media_preset_name"],
    ["media-preset-domain-label", "media_preset_domain"],
    ["media-preset-label", "media_presets"],
    ["media-discard", "settings_discard"],
    ["media-preset-create", "media_create"],
    ["media-preset-apply", "media_apply"],
    ["media-preset-rename", "media_rename"],
    ["media-preset-delete", "media_delete_preset"],
    ["media-channel-delete", "media_delete_channel"],
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
  const scopeKey = (selection) => selection.kind === "saved" ? `saved:${selection.channelId}` : selection.kind;
  let catalogueKey = "";
  function renderMedia() {
    if (!globalView) return;
    const selected = mediaView?.selection.kind !== "global" && mediaView?.selection !== void 0;
    for (const [id, render] of renderFields) {
      const domain = mediaDomain(id);
      const projected = selected && domain && mediaView ? {
        ...globalView,
        values: { ...globalView.values, config: { ...globalView.values.config, ...domain === "audio" ? mediaView.values.audio : mediaView.values.video } }
      } : globalView;
      render(projected);
      if (selected && domain) document.getElementById(id).disabled = !mediaView?.snapshot?.canWrite || !channelBinding(mediaView.snapshot.channel, domain) || ["loading", "unknown", "failed", "conflict", "repair-required", "unavailable"].includes(mediaView.phase);
    }
    if (!mediaView) return;
    const blocked = mediaView.phase !== "ready" || !mediaView.snapshot?.canWrite || globalView.phase !== "ready";
    scopeSelect.disabled = ["saving", "unknown"].includes(mediaView.phase) || mediaView.pendingKeys.length > 0;
    const store = mediaView.snapshot?.store;
    const nextCatalogue = JSON.stringify([store?.channels.map((channel2) => channel2.channelId), store?.presets.map((preset) => [preset.id, preset.name]), currentScope?.channelId, scopeKey(mediaView.selection)]);
    if (nextCatalogue !== catalogueKey) {
      catalogueKey = nextCatalogue;
      for (const option of [...scopeSelect.options].slice(2)) option.remove();
      for (const channel2 of store?.channels ?? []) {
        const option = document.createElement("option");
        option.value = `saved:${channel2.channelId}`;
        option.textContent = channel2.channelId;
        scopeSelect.append(option);
      }
      const savedId = mediaView.selection.kind === "saved" ? mediaView.selection.channelId : null;
      if (savedId && !store?.channels.some((channel2) => channel2.channelId === savedId)) {
        const option = document.createElement("option");
        option.value = scopeKey(mediaView.selection);
        option.textContent = savedId;
        scopeSelect.append(option);
      }
      const previous = presetSelect.value;
      presetSelect.replaceChildren();
      for (const preset of store?.presets ?? []) {
        const option = document.createElement("option");
        option.value = preset.id;
        option.textContent = `${text(`media_${preset.domain}`)} \xB7 ${preset.name}`;
        presetSelect.append(option);
      }
      if ([...presetSelect.options].some((option) => option.value === previous)) presetSelect.value = previous;
    }
    scopeSelect.value = scopeKey(mediaView.selection);
    scopeSelect.options[1].disabled = !currentScope;
    const channel = mediaView.snapshot?.channel;
    for (const domain of ["audio", "video"]) {
      document.getElementById(`media-${domain}-enable`).disabled = blocked || !selected || !!channelBinding(channel, domain);
      document.getElementById(`media-${domain}-global`).disabled = blocked || !selected || !channelBinding(channel, domain);
    }
    for (const id of ["media-preset-create", "media-preset-apply", "media-preset-rename", "media-preset-delete", "media-channel-delete"]) {
      document.getElementById(id).disabled = blocked || (id === "media-channel-delete" ? !selected || !channel : id !== "media-preset-create" && !presetSelect.value) || id === "media-preset-apply" && selected && !channelBinding(channel, selectedPreset()?.domain ?? "audio");
    }
    mediaStatus.dataset.phase = mediaView.phase;
    mediaStatus.textContent = `${text(`media_${mediaView.phase.replace("-", "_")}`)}${mediaView.code ? ` (${mediaView.code})` : ""}`;
    mediaDiscard.hidden = !["failed", "unknown", "conflict"].includes(mediaView.phase);
    const draft = document.getElementById("media-draft"), request = mediaView.pendingRequest;
    draft.hidden = !request || !["failed", "unknown", "conflict"].includes(mediaView.phase);
    draft.textContent = draft.hidden ? "" : `${text("media_draft")}
${JSON.stringify({
      action: request?.action,
      intent: mediaView.pendingValues ?? mediaView.values,
      name: request && "name" in request ? request.name : void 0,
      saved: mediaView.snapshot?.values,
      version: mediaView.snapshot?.version
    }, null, 2)}`;
  }
  mediaClient.subscribe((view) => {
    mediaView = view;
    renderMedia();
  });
  void capturedTab.then((tab) => {
    const id = tab?.url ? /^\/(?:live\/)?([a-f0-9]{32})\/?$/i.exec(new URL(tab.url).pathname)?.[1]?.toLowerCase() : null;
    if (tab && id && tab.incognito === false) currentScope = { kind: "current", tabId: tab.id, windowId: tab.windowId, channelId: id };
    renderMedia();
  });
  scopeSelect.addEventListener("change", () => {
    const next = scopeSelect.value === "global" ? { kind: "global" } : scopeSelect.value === "current" ? currentScope : scopeSelect.value.startsWith("saved:") ? { kind: "saved", channelId: scopeSelect.value.slice(6) } : null;
    if (next) void mediaClient.selectScope(next).then(() => renderMedia());
    else renderMedia();
  });
  const perform = (request) => {
    void mediaClient.perform(request).catch(() => renderMedia());
  };
  for (const domain of ["audio", "video"]) {
    document.getElementById(`media-${domain}-enable`).addEventListener("click", () => {
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
    document.getElementById(`media-${domain}-global`).addEventListener("click", () => {
      const view = mediaView, channel = view?.snapshot?.channel, binding = channelBinding(channel, domain);
      if (!view || view.selection.kind === "global" || !channel || !binding) return;
      perform({
        action: "reset-channel-domain",
        selection: view.selection,
        domain,
        recordCreatedRevision: channel.createdRevision,
        domainCreatedRevision: binding.createdRevision,
        expectedRecordRevision: channel.revision
      });
    });
  }
  mediaDiscard.addEventListener("click", () => mediaClient.discardPending());
  document.getElementById("media-channel-delete").addEventListener("click", () => {
    const view = mediaView, channel = view?.snapshot?.channel;
    if (view && view.selection.kind !== "global" && channel) perform({
      action: "delete-channel",
      selection: view.selection,
      recordCreatedRevision: channel.createdRevision,
      expectedRecordRevision: channel.revision
    });
  });
  document.getElementById("media-preset-create").addEventListener("click", () => {
    if (!mediaView?.snapshot) return;
    const common = { action: "create-preset", id: crypto.randomUUID(), expectedMediaRevision: mediaView.snapshot.version.mediaRevision, name: presetName.value };
    perform(presetDomain.value === "audio" ? { ...common, domain: "audio", values: mediaView.values.audio } : { ...common, domain: "video", values: mediaView.values.video });
  });
  function selectedPreset() {
    return mediaView?.snapshot?.store?.presets.find((preset) => preset.id === presetSelect.value);
  }
  document.getElementById("media-preset-apply").addEventListener("click", () => {
    const preset = selectedPreset(), view = mediaView;
    if (!preset || !view?.snapshot) return;
    const presetToken = { id: preset.id, createdRevision: preset.createdRevision, revision: preset.revision };
    if (view.selection.kind === "global") perform({ action: "apply-preset-global", presetToken, expectedGlobalRevision: globalView.snapshot.revision });
    else {
      const channel = view.snapshot.channel, binding = channelBinding(channel, preset.domain);
      if (!channel || !binding) return;
      perform({
        action: "replace-channel-domain",
        selection: view.selection,
        domain: preset.domain,
        presetToken,
        expectedRecordRevision: channel.revision,
        channelToken: { channelId: channel.channelId, recordCreatedRevision: channel.createdRevision, domainCreatedRevision: binding.createdRevision }
      });
    }
  });
  document.getElementById("media-preset-rename").addEventListener("click", () => {
    const preset = selectedPreset();
    if (preset) perform({ action: "edit-preset", id: preset.id, createdRevision: preset.createdRevision, name: presetName.value });
  });
  document.getElementById("media-preset-delete").addEventListener("click", () => {
    const preset = selectedPreset();
    if (preset) perform({ action: "delete-preset", presetToken: { id: preset.id, createdRevision: preset.createdRevision, revision: preset.revision } });
  });
  presetSelect.addEventListener("change", renderMedia);
  window.addEventListener("pagehide", () => {
    settingsClient.dispose();
    mediaClient.dispose();
  }, { once: true });
})();

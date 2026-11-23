// Generated from src/settings/styles.ts by scripts/settings-runtime.mjs. Do not edit.
(() => {
  document.title = chrome.i18n.getMessage("ext_shortName");
  document.getElementById("stylesConfig").textContent = chrome.i18n.getMessage("config_styles");
  const message = (key) => chrome.i18n.getMessage(key);
  const settingsClient = createSettingsClient(chrome), fields = /* @__PURE__ */ new Map();
  const status = document.getElementById("settings-status"), reload = document.getElementById("reload");
  const retry = document.getElementById("settings-retry"), discard = document.getElementById("settings-discard");
  const search = new URLSearchParams(location.search);
  function targetId(key) {
    const values = search.getAll(key);
    if (values.length !== 1 || !/^\d+$/.test(values[0])) return null;
    const value = Number(values[0]);
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  const tabId = targetId("targetTabId"), windowId = targetId("targetWindowId");
  const target = tabId !== null && windowId !== null ? { tabId, windowId } : null;
  document.getElementById("settings-guide").textContent = message("settings_global");
  document.getElementById("settings-target").textContent = message(target ? "settings_target" : "settings_no_target");
  retry.textContent = message("settings_retry");
  discard.textContent = message("settings_discard");
  reload.append(document.createTextNode(message("config_reload")));
  let currentView, appliedStyles;
  reload.disabled = true;
  reload.addEventListener("click", async () => {
    if (reload.disabled || !target) return;
    try {
      const result = await settingsClient.reloadTarget(target);
      if (result.reloaded && Array.isArray(result.appliedStyles)) {
        appliedStyles = [...result.appliedStyles];
        if (currentView) render(currentView);
      }
    } catch {
    }
  });
  retry.addEventListener("click", () => {
    void settingsClient.retryStyles().catch(() => {
    });
  });
  discard.addEventListener("click", () => {
    void settingsClient.discardPending();
  });
  for (const category of STYLES) {
    const box = document.createElement("div");
    box.className = "box";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = message("styles_category_" + category.id);
    box.append(title);
    document.getElementById("list").append(box);
    for (const style of category.styles) {
      const item = document.createElement("div"), checkbox = document.createElement("input"), label = document.createElement("label");
      checkbox.type = "checkbox";
      checkbox.disabled = true;
      label.htmlFor = style.id;
      label.textContent = message("styles_" + style.id.replaceAll("-", "_"));
      const description = message("styles_" + style.id.replaceAll("-", "_") + "_desc");
      if (description) label.title = description;
      item.append(checkbox, label);
      box.append(item);
      if (!style.type) {
        checkbox.id = style.id;
        checkbox.addEventListener("change", () => settingsClient.edit({ type: "style", id: style.id, enabled: checkbox.checked }));
        fields.set(style.id, (view) => {
          checkbox.checked = view.values.styles.includes(style.id);
          checkbox.disabled = !view.snapshot || view.phase === "repair-required";
        });
      } else {
        const input = document.createElement("input"), current = document.createElement("span");
        input.id = style.id;
        input.type = "range";
        input.min = String(style.min);
        input.max = String(style.max);
        input.step = String(style.step);
        input.disabled = true;
        input.addEventListener("input", () => settingsClient.edit({ type: "parameter", id: style.id, value: Number(input.value) }));
        item.append(input, current);
        fields.set(style.id, (view) => {
          input.value = String(view.values.styleParameters[style.id] ?? 0);
          current.textContent = input.value;
          checkbox.checked = view.values.styles.includes(style.id);
          input.disabled = !view.snapshot || view.phase === "repair-required";
        });
      }
    }
  }
  function render(view) {
    currentView = view;
    for (const update of fields.values()) update(view);
    if (!appliedStyles && view.snapshot) appliedStyles = [...view.snapshot.styles];
    const changed = appliedStyles && JSON.stringify(appliedStyles) !== JSON.stringify(view.values.styles);
    reload.classList.toggle("hidden", !changed);
    reload.disabled = !target || view.phase !== "ready" || view.pendingKeys.length > 0 || view.css.state !== "ready";
    retry.hidden = view.css.state !== "failed";
    retry.disabled = view.phase !== "ready" || view.pendingKeys.length > 0;
    discard.hidden = !["failed", "unknown"].includes(view.phase);
    status.dataset.phase = view.phase;
    const stateKey = view.code?.startsWith("target-") ? "settings_target_changed" : view.css.state === "failed" && view.phase === "ready" ? "settings_css_failed" : "settings_" + view.phase.replace("-", "_");
    status.textContent = message(stateKey);
  }
  settingsClient.subscribe(render);
  window.addEventListener("pagehide", () => settingsClient.dispose(), { once: true });
})();

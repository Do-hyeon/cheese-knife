(() => {
document.title = chrome.i18n.getMessage("ext_shortName");
(document.getElementById("stylesConfig") as HTMLElement).textContent =
  chrome.i18n.getMessage("config_styles");

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
let targetCaptured = false;
stylesLink.addEventListener('click', event => { if (!targetCaptured) event.preventDefault(); });
const capturedTab = chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  if (!tab || typeof tab.id !== 'number' || !Number.isSafeInteger(tab.id) || tab.id < 0 ||
    !Number.isSafeInteger(tab.windowId) || tab.windowId < 0 || new URL(tab.url as string).origin !== 'https://chzzk.naver.com') return null;
  return { ...tab, id: tab.id };
}).catch(() => null);
void capturedTab.then(tab => {
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
    for (const feature of ["player", "compressor", "preview", "livePreview", "chatResize", "donationChat", "deletedChat", "sidebarRefresh", "statistics"]) {
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
        settingsClient.edit({ type: 'config', id: c.id, value: (e.target as HTMLInputElement).checked });
      });
    } else if (c.type === "range") {
      input.type = "range";
      input.min = String(c.min);
      input.max = String(c.max);
      input.step = String(c.step);
      input.addEventListener("input", (e) => {
        settingsClient.edit({ type: 'config', id: c.id, value: Number((e.target as HTMLInputElement).value) });
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
  for (const render of renderFields.values()) render(view);
  settingsStatus.dataset.phase = view.phase;
  settingsStatus.textContent = chrome.i18n.getMessage(`settings_${view.phase.replace('-', '_')}`);
  discard.hidden = !['failed', 'unknown'].includes(view.phase);
});
window.addEventListener('pagehide', () => settingsClient.dispose(), { once: true });
})();

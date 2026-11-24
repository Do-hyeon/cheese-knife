// Generated from src/settings/permission.ts by scripts/settings-runtime.mjs. Do not edit.
(() => {
  document.title = chrome.i18n.getMessage("ext_shortName");
  document.getElementById("desc").textContent = chrome.i18n.getMessage("permission_desc");
  const list = document.getElementById("list");
  for (const h of KnifeHostPolicy.origins) {
    const item = document.createElement("li");
    item.textContent = chrome.i18n.getMessage("permission_host", h);
    list.appendChild(item);
  }
  const grant = document.getElementById("grant");
  const status = document.getElementById("permission-status");
  let pending = false;
  grant.textContent = chrome.i18n.getMessage("permission_grant");
  grant.addEventListener("click", () => {
    if (pending) return;
    pending = true;
    grant.disabled = true;
    status.textContent = chrome.i18n.getMessage("permission_pending");
    let request;
    try {
      request = chrome.permissions.request({ origins: [...KnifeHostPolicy.origins] });
    } catch {
      pending = false;
      grant.disabled = false;
      status.textContent = chrome.i18n.getMessage("permission_failed");
      return;
    }
    Promise.resolve(request).then((granted) => {
      if (granted) {
        window.close();
        return;
      }
      pending = false;
      grant.disabled = false;
      status.textContent = chrome.i18n.getMessage("permission_denied");
    }, () => {
      pending = false;
      grant.disabled = false;
      status.textContent = chrome.i18n.getMessage("permission_failed");
    });
  });
})();

(() => {
document.title = chrome.i18n.getMessage("ext_shortName");
(document.getElementById("desc") as HTMLElement).textContent =
  chrome.i18n.getMessage("permission_desc");

const list = document.getElementById("list") as HTMLElement;
for (const h of KnifeHostPolicy.origins) {
  const item = document.createElement("li");
  item.textContent = chrome.i18n.getMessage("permission_host", h);
  list.appendChild(item);
}

const grant = document.getElementById("grant") as HTMLButtonElement;
const status = document.getElementById("permission-status") as HTMLElement;
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
  Promise.resolve(request).then(granted => {
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

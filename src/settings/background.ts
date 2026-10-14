declare function importScripts(...urls: string[]): void;
(() => {
if (typeof importScripts === 'function') {
  importScripts('media-profiles.js', 'config.js', 'style-schema.js', 'settings-contract.js', 'settings-broker.js');
}
const settingsBroker = createSettingsBroker(chrome);
chrome.runtime.onMessage.addListener(settingsBroker.listener);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ['styles', 'styleParameters', 'settingsRevision'].some(id => Object.hasOwn(changes, id))) settingsBroker.invalidateStyles();
});
void settingsBroker.initialize().catch(() => {});
async function checkPermission() {
  const granted = await chrome.permissions.contains({ origins: [...KnifeHostPolicy.origins] });
  if (!granted) await chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
}
async function retryStylesAfterPermissionGrant() {
  const granted = await chrome.permissions.contains({ origins: [...KnifeHostPolicy.origins] });
  if (granted) settingsBroker.invalidateStyles({ retry: true });
}
function onWake() {
  settingsBroker.invalidateStyles();
  void checkPermission().catch(() => {});
}
chrome.runtime.onInstalled.addListener(onWake);
chrome.runtime.onStartup.addListener(onWake);
chrome.permissions.onAdded.addListener(() => { void retryStylesAfterPermissionGrant().catch(() => {}); });
chrome.permissions.onRemoved.addListener(() => { void checkPermission().catch(() => {}); });
})();

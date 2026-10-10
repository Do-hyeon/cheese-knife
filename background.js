if (typeof importScripts === 'function') {
  importScripts('config.js', 'style-schema.js', 'settings-contract.js', 'settings-broker.js');
}
const settingsBroker = createSettingsBroker(chrome);
chrome.runtime.onMessage.addListener(settingsBroker.listener);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ['styles', 'styleParameters', 'settingsRevision'].some(id => Object.hasOwn(changes, id))) settingsBroker.invalidateStyles();
});
void settingsBroker.initialize().catch(() => {});
async function checkPermission() {
  const granted = await chrome.permissions.contains({ origins: ['*://*.chzzk.naver.com/*'] });
  if (!granted) await chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
}
function onWake() {
  settingsBroker.invalidateStyles();
  void checkPermission().catch(() => {});
}
chrome.runtime.onInstalled.addListener(onWake);
chrome.runtime.onStartup.addListener(onWake);
chrome.permissions.onRemoved.addListener(() => { void checkPermission().catch(() => {}); });

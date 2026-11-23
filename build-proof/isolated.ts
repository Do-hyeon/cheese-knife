import { proofContext } from './shared';
proofContext('isolated', { send: chrome.runtime.sendMessage, post: window.postMessage });

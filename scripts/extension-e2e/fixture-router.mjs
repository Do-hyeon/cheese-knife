export const FIXTURE_LIVE_URL = 'https://chzzk.naver.com/live/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const FIXTURE_CHANNEL_URL = 'https://chzzk.naver.com/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
export const FIXTURE_VOD_URL = 'https://chzzk.naver.com/video/12345';
export const FIXTURE_SITE_SCRIPT_URL = 'https://chzzk.naver.com/__knife_fixture__/site.js';

const definitions = Object.freeze([
  Object.freeze({ url: FIXTURE_LIVE_URL, file: 'tests/fixtures/installed-extension/live.html', contentType: 'text/html; charset=utf-8' }),
  Object.freeze({ url: FIXTURE_CHANNEL_URL, file: 'tests/fixtures/installed-extension/channel.html', contentType: 'text/html; charset=utf-8' }),
  Object.freeze({ url: FIXTURE_VOD_URL, file: 'tests/fixtures/installed-extension/live.html', contentType: 'text/html; charset=utf-8' }),
  Object.freeze({ url: FIXTURE_SITE_SCRIPT_URL, file: 'tests/fixtures/installed-extension/site.js', contentType: 'text/javascript; charset=utf-8' }),
]);

const fixtureError = code => Object.assign(new Error(code), { code });

const responseIndex = responses => {
  if (!Array.isArray(responses)) throw fixtureError('fixture-responses-invalid');
  const index = new Map();
  for (const response of responses) {
    if (!response || typeof response.url !== 'string' || !response.url.startsWith('https://') ||
      !Number.isInteger(response.status) || typeof response.contentType !== 'string' || typeof response.body !== 'string') {
      throw fixtureError('fixture-response-invalid');
    }
    if (index.has(response.url)) throw fixtureError('fixture-response-duplicate');
    index.set(response.url, response);
  }
  return index;
};

export async function loadFixtureResponses(files) {
  if (!files || typeof files.readFile !== 'function') throw fixtureError('fixture-files-invalid');
  const responses = await Promise.all(definitions.map(async definition => Object.freeze({
    url: definition.url,
    status: 200,
    contentType: definition.contentType,
    body: await files.readFile(definition.file, 'utf8'),
  })));
  responseIndex(responses);
  return Object.freeze(responses);
}

export function fixtureDecision(url, responses) {
  const response = typeof url === 'string' ? responseIndex(responses).get(url) : null;
  if (!response) return { action: 'abort', reason: 'not-allowlisted' };
  return { action: 'fulfill', status: response.status, contentType: response.contentType, body: response.body };
}

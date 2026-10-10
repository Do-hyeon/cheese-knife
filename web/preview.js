(() => {
  const runtime = window[Symbol.for('cheese-knife.runtime.v1')];
  if (!runtime || runtime.preview) return;
  let generation = 0;
  let controller;
  let current;
  let panel;
  let backend;
  let media;
  let timers = new Set();
  const cache = new Map();
  const diagnostic = { events: [] };
  const note = event => { diagnostic.events.push(event); if (diagnostic.events.length > 20) diagnostic.events.shift(); };
  const scope = runtime.createScope();
  const later = (fn, delay) => { const timer = setTimeout(() => { timers.delete(timer); fn(); }, delay); timers.add(timer); return timer; };
  const ownsAnchor = anchor => !!runtime.state.sidebar?.isConnected && !!anchor?.isConnected && runtime.state.sidebar.contains(anchor);
  const volume = () => {
    const value = runtime.config.previewVolume;
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value / 100)) : 0.05;
  };
  const parseURL = href => {
    try { const url = new URL(href); return url.origin === location.origin && /^\/live\/[a-f0-9]{32}\/?$/i.test(url.pathname) ? url : null; }
    catch { return null; }
  };
  const cleanup = () => {
    generation++; controller?.abort(); controller = null; current = null;
    for (const timer of timers) clearTimeout(timer); timers.clear();
    try { backend?.destroy?.(); } catch {}
    backend = null;
    if (media) {
      try { media.pause(); media.removeAttribute('src'); media.srcObject = null; media.load(); } catch {}
      media.remove(); media = null;
    }
    if (panel) { panel.hidden = true; panel.querySelector('img').removeAttribute('src'); }
  };
  const ensurePanel = () => {
    if (panel?.isConnected) return;
    panel = document.createElement('div'); panel.className = 'knife-preview knife-owned'; panel.hidden = true;
    const image = document.createElement('img'); image.alt = '';
    const player = document.createElement('div'); player.className = 'knife-preview-player';
    const uptime = document.createElement('div'); uptime.className = 'knife-preview-uptime';
    panel.append(image, player, uptime); document.body.append(panel);
  };
  const valid = (token, anchor, href) => token === generation && !!current && ownsAnchor(anchor) && anchor.href === href &&
    location.pathname === current.route && runtime.config.preview === true && !document.hidden && runtime.configReady;
  const prepare = async (info, anchor, href, token) => {
    if (!valid(token, anchor, href) || runtime.config.livePreview !== true || info.adult) return;
    const Hls = runtime.Hls;
    diagnostic.hlsSupported = !!Hls?.isSupported();
    const path = info.playback?.media?.find(item => item.mediaId === 'HLS' && typeof item.path === 'string' && item.path.startsWith('https://'))?.path;
    if (!path) { runtime.setStatus('livePreview', 'limited', 'stream-unavailable'); return; }
    const video = document.createElement('video'); video.playsInline = true; video.muted = true; video.volume = volume();
    video.className = 'knife-preview-video'; video.style.visibility = 'hidden';
    video.style.cssText += ';width:100%;height:100%;object-fit:contain;background:#000;';
    panel.querySelector('.knife-preview-player').append(video); media = video;
    let failed = false;
    let attempt = 0;
    let playingAttempt = null;
    let recoveries = 0;
    let loaded = false;
    let watching = false;
    let lastTime = 0;
    let lastProgress = 0;
    const active = () => !failed && media === video && valid(token, anchor, href);
    const sample = type => {
      if (!active()) return;
      let ahead = 0;
      for (let index = 0; index < video.buffered.length; index++) {
        if (video.buffered.start(index) <= video.currentTime && video.buffered.end(index) >= video.currentTime) ahead = video.buffered.end(index) - video.currentTime;
      }
      note({ type, currentTime: video.currentTime, readyState: video.readyState, bufferedAhead: ahead,
        width: video.videoWidth, height: video.videoHeight, paused: video.paused });
    };
    const fail = () => {
      if (!active()) return;
      failed = true; cache.delete(current.id);
      try { backend?.destroy?.(); video.pause(); video.removeAttribute('src'); video.load(); } catch {}
      backend = null; video.style.visibility = 'hidden';
      runtime.setStatus('livePreview', 'limited', 'stream-playback-unavailable');
    };
    const watchProgress = () => {
      if (!active()) return;
      const now = performance.now();
      if (video.paused || video.currentTime > lastTime + 0.01) lastProgress = now;
      else if (now - lastProgress >= 10000) {
        sample('stalled-timeout'); fail();
        runtime.setStatus('livePreview', 'limited', 'stream-stalled'); return;
      }
      lastTime = video.currentTime;
      later(watchProgress, 1000);
    };
    const play = async () => {
      if (!active() || playingAttempt === attempt) return;
      const startedAttempt = attempt;
      playingAttempt = startedAttempt;
      try {
        await video.play();
        if (!active() || startedAttempt !== attempt) return;
        loaded = true;
        video.style.visibility = ''; runtime.setStatus('livePreview', 'ready');
        if (!watching) { watching = true; lastTime = video.currentTime; lastProgress = performance.now(); later(watchProgress, 1000); }
      } catch { if (active() && startedAttempt === attempt) fail(); }
      finally { if (playingAttempt === startedAttempt) playingAttempt = null; }
    };
    video.addEventListener('loadeddata', play);
    video.addEventListener('error', () => {
      sample('media-error');
      // The HLS backend reports/classifies this same error and owns recovery.
      if (!backend) fail();
    });
    for (const event of ['waiting', 'stalled', 'playing', 'loadedmetadata']) video.addEventListener(event, () => {
      sample(event);
      if (!active()) return;
      if (event === 'playing') runtime.setStatus('livePreview', 'ready');
      else if (event === 'waiting' || event === 'stalled') runtime.setStatus('livePreview', 'pending', 'stream-buffering');
    });
    try {
      if (Hls?.isSupported()) {
        const hls = backend = new Hls({ enableWorker: false, autoStartLoad: false, capLevelToPlayerSize: true,
          maxBufferLength: 8, maxMaxBufferLength: 16, backBufferLength: 0 });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!active() || backend !== hls) return;
          note({ type: data.type, details: data.details, fatal: data.fatal === true,
            status: typeof data.response?.code === 'number' ? data.response.code : null });
          if (!data.fatal) return; // Let hls.js own its ordinary retry policy.
          const denied = [401, 403].includes(data.response?.code);
          const mediaFailure = data.type === 'mediaError';
          const networkFailure = data.type === 'networkError' && hls.levels.length > 0;
          if (denied || recoveries >= 2 || (!mediaFailure && !networkFailure)) { fail(); return; }
          recoveries++; attempt++;
          const recoveryAttempt = attempt;
          runtime.setStatus('livePreview', 'pending', 'stream-recovering');
          note({ type: 'recovery', attempt: recoveries, reason: mediaFailure ? 'media' : 'network' });
          const recover = () => {
            if (!active() || backend !== hls || recoveryAttempt !== attempt) return;
            try { if (mediaFailure) hls.recoverMediaError(); else hls.startLoad(); }
            catch { fail(); }
          };
          if (mediaFailure) recover(); else later(recover, 500);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!active() || backend !== hls) return;
          note({ type: 'manifestParsed', levels: hls.levels.map(level => ({ height: level.height, videoCodec: level.videoCodec, audioCodec: level.audioCodec })) });
          const target = Math.max(480, (parseFloat(panel.style.width) || 400) * 9 / 16 * Math.min(window.devicePixelRatio || 1, 2));
          const levels = hls.levels.map((level, index) => ({ height: level.height, index }))
            .filter(item => Number.isFinite(item.height) && item.height > 0).sort((a, b) => a.height - b.height);
          const initial = levels.find(item => item.height >= target) || levels.at(-1);
          if (initial) hls.startLevel = initial.index;
          hls.startLoad(); // Startup preference, not a persistent manual quality lock.
        });
        hls.loadSource(path); hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = path;
      else { fail(); return; }
      runtime.setStatus('livePreview', 'pending', 'stream-loading');
      later(() => { if (active() && !loaded && video.readyState < 2) fail(); }, 15000);
    } catch { fail(); }
  };
  runtime.preview = {
    diagnostics: diagnostic,
    async show(href, anchor, tooltip = false) {
      const url = parseURL(href);
      if (!url || !ownsAnchor(anchor) || href !== anchor.href || runtime.config.preview !== true || !runtime.configReady ||
        runtime.state.route.kind === 'excluded') return;
      if (current?.href === href && current.anchor === anchor) return;
      cleanup();
      const token = generation;
      const hoverStarted = Date.now();
      const id = url.pathname.split('/')[2];
      const request = controller = new AbortController();
      current = { id, href, anchor, route: location.pathname, live: runtime.config.livePreview === true };
      const timeout = later(() => request.abort(), 5000);
      let info;
      try {
        const cached = cache.get(id);
        if (cached && cached.expires > Date.now()) info = cached.info;
        else {
          const response = await fetch('https://api.chzzk.naver.com/service/v3.3/channels/' + id + '/live-detail', { credentials: 'include', signal: request.signal });
          if (!response.ok) throw new Error('api-unavailable');
          const body = await response.json();
          if (body.code !== 200 || !body.content) throw new Error('api-unavailable');
          info = { ...body.content };
          try { info.playback = JSON.parse(info.livePlaybackJson); } catch { info.playback = null; }
          if (valid(token, anchor, href)) {
            cache.delete(id); cache.set(id, { info, expires: Date.now() + (info.status === 'OPEN' ? 30000 : 5000) });
            while (cache.size > 100) cache.delete(cache.keys().next().value);
          }
        }
      } catch {
        if (valid(token, anchor, href)) runtime.setStatus('livePreview', 'limited', 'live-detail-unavailable');
        return;
      } finally { clearTimeout(timeout); timers.delete(timeout); }
      if (!valid(token, anchor, href)) return;
      const rect = anchor.getBoundingClientRect();
      if (!rect.width) return;
      ensurePanel();
      const width = Math.min(Math.max(Number(runtime.config.previewWidth) || 400, rect.width), window.innerWidth - 32);
      panel.style.position = 'fixed'; panel.style.width = width + 'px';
      panel.style.left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)) + 'px';
      panel.style.top = Math.max(0, Math.min(tooltip ? rect.bottom : rect.top, window.innerHeight - width * 9 / 16)) + 'px';
      const thumbnail = info.liveImageUrl || info.playback?.thumbnail?.snapshotThumbnailTemplate;
      if (typeof thumbnail === 'string' && thumbnail.startsWith('https://')) panel.querySelector('img').src = thumbnail.replace('{type}', '480');
      const open = info.openDate ? new Date(info.openDate + '+0900').getTime() : NaN;
      const uptime = panel.querySelector('.knife-preview-uptime');
      const updateUptime = () => {
        if (!valid(token, anchor, href)) return;
        if (Number.isFinite(open)) {
          const seconds = Math.max(0, Math.floor((Date.now() - open) / 1000));
          uptime.textContent = Math.floor(seconds / 3600) + ':' + String(Math.floor(seconds / 60) % 60).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
        } else uptime.textContent = '';
        later(updateUptime, 1000);
      };
      // Metadata/network time is part of the user's hover delay. Start muted
      // loading in parallel with the remaining wait, not after another full wait.
      if (runtime.config.livePreview === true && info.status === 'OPEN' && !info.adult) prepare(info, anchor, href, token);
      else if (info.adult) runtime.setStatus('livePreview', 'limited', 'age-restricted-stream');
      const delay = Math.max(100, Math.min(3000, Number(runtime.config.previewDelay) * 1000 || 1000));
      later(() => {
        if (!valid(token, anchor, href)) return;
        panel.hidden = false; updateUptime(); runtime.setStatus('preview', 'ready');
      }, Math.max(0, hoverStarted + delay - Date.now()));
    },
    hide(href) { if (!href || current?.href === href) cleanup(); },
  };
  scope.on(document, 'mouseout', event => {
    const anchor = event.target.closest?.('a[href]');
    if (anchor === current?.anchor && !anchor.contains(event.relatedTarget)) runtime.preview.hide(anchor.href);
  });
  scope.on(document, 'visibilitychange', () => { if (document.hidden) cleanup(); });
  scope.on(document, 'contextmenu', event => {
    if (runtime.config.rightClickToUnmute !== true) return;
    if (!current || !media || event.target.closest?.('a[href]') !== current.anchor ||
      !valid(generation, current.anchor, current.href)) return;
    event.preventDefault(); media.volume = volume(); media.muted = !media.muted;
  });
  scope.on(window, 'pagehide', event => { cleanup(); if (!event.persisted) scope.dispose(); });
  const checkActive = () => {
    if (current && (location.pathname !== current.route || !ownsAnchor(current.anchor) || current.anchor.href !== current.href ||
      (panel && !panel.isConnected) || runtime.config.preview !== true ||
      (current.live && runtime.config.livePreview !== true))) cleanup();
    if (current && media) media.volume = volume();
  };
  // Constant-time identity check, not a document-wide card scan. Invalidation
  // must stop an existing stream as well as reject future async completions.
  scope.observe(new MutationObserver(checkActive), document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  runtime.subscribe(checkActive);
})();

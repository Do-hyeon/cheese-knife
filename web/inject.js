(() => {
  const runtime = window[Symbol.for('cheese-knife.runtime.v1')];
  if (!runtime?.adapter || runtime.coordinatorStarted) return;
  runtime.coordinatorStarted = true;
  const { stateOf, propsOf } = runtime.adapter;
  let config = {};
  let i18n = {};
  let owner;
  let ownerGeneration = -1;
  let chats;
  let anchors;
  let sidebar;
  let sidebarRecord;
  let timestampRoots;
  const popups = new Map();
  const videoMetadata = new Map();
  const pad = value => String(value).padStart(2, '0');
  const formatTime = value => {
    const total = Math.max(0, Math.floor(value / 1000));
    const hours = Math.floor(total / 3600), minutes = Math.floor(total / 60) % 60, seconds = total % 60;
    return hours ? hours + ':' + pad(minutes) + ':' + pad(seconds) : minutes + ':' + pad(seconds);
  };
  const liveURL = href => {
    try { const url = new URL(href, location.origin); return url.origin === location.origin && /^\/live\/[a-f0-9]{32}\/?$/i.test(url.pathname) ? url : null; }
    catch { return null; }
  };
  let zIndex = 1000;
  const createPopupPlayer = (url, left, top) => {
    const popup = document.createElement("div");
    const popupScope = runtime.createScope();
    popupScope.add(() => { player.src = "about:blank"; popup.remove(); popups.delete(popup); });
    popup.classList.add("knife-popup");
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.style.zIndex = `${zIndex++}`;

    const player = document.createElement("iframe");
    player.classList.add("knife-popup-player");
    player.src = url;
    player.allowFullscreen = true;
    player.allow = "autoplay; encrypted-media; picture-in-picture";
    player.scrolling = "no";
    popup.appendChild(player);

    const dragArea = document.createElement("div");
    dragArea.classList.add("knife-popup-drag-area");
    popup.appendChild(dragArea);

    let x = 0;
    let y = 0;
    let dx = 0;
    let dy = 0;
    let stopDrag = () => {};
    popupScope.add(() => stopDrag());
    popupScope.on(window, 'blur', () => stopDrag());
    popupScope.on(window, 'pagehide', () => stopDrag());
    popupScope.on(dragArea, "mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      stopDrag();
      popup.style.zIndex = `${zIndex++}`;
      x = e.clientX;
      y = e.clientY;

      const onMouseMove = (e) => {
        if (!(e.buttons & 1)) { stopDrag(); return; }
        e.preventDefault();
        document.body.classList.add("knife-dragging");
        dx = e.clientX - x;
        dy = e.clientY - y;
        x = e.clientX;
        if (popup.offsetTop + dy < 0) {
          popup.style.top = "0";
        } else {
          y = e.clientY;
          popup.style.top = `${popup.offsetTop + dy}px`;
        }
        popup.style.left = `${popup.offsetLeft + dx}px`;
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.classList.remove("knife-dragging");
        stopDrag = () => {};
      };
      stopDrag = onMouseUp;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });

    const button = document.createElement("button");
    button.classList.add("knife-popup-close-button");
    button.title = i18n.close;
    button.textContent = "X";
    popupScope.on(button, "click", () => {
      popupScope.dispose();
    });
    popup.appendChild(button);

    popups.set(popup, popupScope);
    return popup;
  };


  const resizeChat = (container, scope) => {
    if (getComputedStyle(document.documentElement).getPropertyValue('--knife-chat-resize').trim() !== '1') return;
    if (!container.parentElement || container.parentElement.querySelector('.knife-resize-handle')) return;
    const handle = document.createElement('div');
    handle.className = 'knife-resize-handle knife-owned'; handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical');
    container.before(handle);
    scope.add(() => { handle.remove(); container.style.width = ''; });
    let dragging;
    let width;
    try {
      const saved = Number(localStorage.getItem('chatWidth'));
      if (Number.isFinite(saved) && saved >= 24 && saved < window.innerWidth) document.documentElement.style.setProperty('--knife-chat-width', saved + 'px');
    } catch {}
    const finish = () => {
      if (!dragging) return;
      if (handle.hasPointerCapture?.(dragging.id)) handle.releasePointerCapture(dragging.id);
      dragging = null; container.style.width = '';
      if (Number.isFinite(width)) {
        document.documentElement.style.setProperty('--knife-chat-width', width + 'px');
        try { localStorage.setItem('chatWidth', String(width)); } catch {}
      }
    };
    scope.on(handle, 'pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      dragging = { id: event.pointerId, left: rect.left, right: rect.right,
        reverse: getComputedStyle(container.parentElement).flexDirection.endsWith('reverse') };
      handle.setPointerCapture?.(event.pointerId);
    });
    scope.on(handle, 'pointermove', event => {
      if (!dragging) return;
      width = Math.max(24, Math.min(window.innerWidth - 24, dragging.reverse ? event.clientX - dragging.left - 1 : dragging.right - event.clientX - 1));
      container.style.width = width + 'px';
    });
    scope.on(handle, 'pointerup', finish); scope.on(handle, 'pointercancel', finish);
    scope.on(window, 'blur', finish); scope.add(() => { dragging = null; });
    runtime.setStatus('chatResize', 'ready');
  };
  const timestamps = (container, isLive, scope) => {
    if (getComputedStyle(document.documentElement).getPropertyValue('--knife-chat-timestamp').trim() !== '1') return;
    // Current VOD rows contain nickname wrappers too; those are not log roots.
    const root = container.querySelector('[role="log"], [class^="live_chatting_list_wrapper__"], [class^="vod_chatting_list__"]');
    if (!root || timestampRoots.has(root)) return;
    timestampRoots.add(root);
    const apply = () => {
      let supported = 0;
      for (const node of root.querySelectorAll('[class^="_item_"], [class^="live_chatting_item__"], [class^="vod_chatting_item__"]')) {
        const props = propsOf(node);
        const message = props?.chatMessage || props?.children?.props?.chatMessage;
        const target = node.querySelector('[class^="_chatting_message_"], [class^="live_chatting_message_chatting_message__"]');
        if (!message || !target) continue;
        if (isLive) {
          const date = new Date(message.time);
          if (Number.isFinite(date.getTime())) { target.dataset.timestamp = pad(date.getHours()) + ':' + pad(date.getMinutes()); supported++; }
        } else if (Number.isFinite(message.playerMessageTime)) { target.dataset.timestamp = formatTime(message.playerMessageTime); supported++; }
      }
      runtime.setStatus('chatTimestamp', supported ? 'ready' : 'pending', supported ? '' : 'message-props-unavailable');
    };
    apply();
    scope.observe(new MutationObserver(apply), root, { childList: true, subtree: true, characterData: true });
  };
  const attachChat = (container, isLive, scope) => {
    if (!container) return;
    timestamps(container, isLive, scope);
    if (chats.has(container)) { chats.get(container).find(); return; }
    resizeChat(isLive ? container : container.closest('aside') || container.parentElement, scope);
    const record = { timer: null, restore: null, controller: null, replacement: null };
    const reportControllerStatus = () => {
      runtime.setStatus('donationChat', config.hideDonation ? 'ready' : 'disabled');
      runtime.setStatus('deletedChat', config.showDeleted ? 'limited' : 'disabled', config.showDeleted ? 'jsx-adapter-unavailable' : '');
    };
    let attempts = 0;
    const findController = () => {
      if (scope.disposed || !container.isConnected) return;
      const controller = stateOf(container, value => typeof value.messageFilter === 'function');
      if (controller === record.controller && controller?.messageFilter === record.replacement) { reportControllerStatus(); return; }
      record.restore?.(); record.restore = null; record.controller = null;
      if (!controller) {
        if (record.timer) return;
        if (++attempts < 20) record.timer = scope.timeout(() => { record.timer = null; findController(); }, 100);
        else {
          runtime.setStatus('donationChat', config.hideDonation ? 'limited' : 'disabled', config.hideDonation ? 'chat-controller-unavailable' : '');
          runtime.setStatus('deletedChat', config.showDeleted ? 'limited' : 'disabled', config.showDeleted ? 'chat-controller-unavailable' : '');
        }
        return;
      }
      const original = controller.messageFilter;
      const replacement = function (message) {
        return original.call(this, message) && !(config.hideDonation === true && message?.type === 10);
      };
      controller.messageFilter = replacement;
      record.controller = controller; record.replacement = replacement;
      record.restore = () => { if (controller.messageFilter === replacement) controller.messageFilter = original; };
      // The current site has no webpack JSX factory. Do not fabricate React
      // elements or suppress the native blind listener with guessed internals.
      reportControllerStatus();
    };
    record.find = findController; chats.set(container, record);
    scope.add(() => record.restore?.());
    scope.observe(new MutationObserver(mutations => {
      timestamps(container, isLive, scope);
      if (mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes].some(node => node.nodeType === 1 && !node.closest?.('.knife-owned')))) {
        attempts = 0; findController();
      }
    }), container, { childList: true, subtree: true });
    findController();
  };
  const bindSidebar = (node, scope) => {
    if (!node) return;
    if (sidebar === node) { sidebarRecord.sync(); return; }
    sidebar = node;
    const record = sidebarRecord = { timer: null, expanded: new WeakSet(), suspended: false };
    const followingSection = () => [...node.querySelectorAll('nav')].find(section =>
      /^(팔로잉 채널|Following channels)$/i.test(section.querySelector('[class*="_title_"], [class^="navigation_bar_title__"]')?.textContent.trim() || ''));
    const refreshControl = () => followingSection()?.querySelector('button[aria-label="새로고침"], button[aria-label="Refresh"]');
    const stopRefresh = () => { clearInterval(record.timer); record.timer = null; };
    const refresh = () => {
      if (scope.disposed || record.suspended || document.hidden || !node.isConnected || config.updateSidebar !== true) return;
      const button = refreshControl();
      if (button && !button.disabled) button.click();
    };
    record.sync = () => {
      if (scope.disposed || !node.isConnected) { stopRefresh(); return; }
      const button = refreshControl();
      if (config.updateSidebar === true && button) {
        if (record.timer == null && !record.suspended) record.timer = scope.interval(refresh, 30000);
        runtime.setStatus('sidebarRefresh', 'ready');
      } else {
        stopRefresh();
        runtime.setStatus('sidebarRefresh', config.updateSidebar ? 'limited' : 'disabled', config.updateSidebar ? 'following-control-unavailable' : '');
      }
      if (config.expandFollowings !== true) {
        record.expanded = new WeakSet(); runtime.setStatus('expandFollowings', 'disabled'); return;
      }
      const more = followingSection()?.querySelector('button[class*="_more_button_"], button[class^="navigation_bar_more_button__"]');
      if (!more || !['true', 'false'].includes(more.getAttribute('aria-expanded'))) {
        runtime.setStatus('expandFollowings', 'limited', 'following-control-unavailable'); return;
      }
      if (more.getAttribute('aria-expanded') === 'false' && !more.disabled && !record.expanded.has(more)) {
        record.expanded.add(more); more.click();
      }
      runtime.setStatus('expandFollowings', record.expanded.has(more) || more.getAttribute('aria-expanded') === 'true' ? 'ready' : 'pending');
    };
    scope.add(stopRefresh);
    scope.on(window, 'pagehide', () => { record.suspended = true; stopRefresh(); });
    scope.on(window, 'pageshow', () => { record.suspended = false; record.sync(); });
    const attach = anchor => {
      const url = liveURL(anchor.href);
      if (!url || anchors.has(anchor)) return;
      anchors.add(anchor); anchor.draggable = true;
      scope.on(anchor, 'mouseenter', () => { if (config.preview === true) runtime.preview?.show(anchor.href, anchor, true); });
      scope.on(anchor, 'mouseleave', () => runtime.preview?.hide(anchor.href));
      scope.on(anchor, 'dragstart', event => {
        if (!config.popupPlayer || !event.dataTransfer) return;
        event.stopPropagation(); event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('knife-data', anchor.href);
      });
    };
    node.querySelectorAll('a[href]').forEach(attach);
    scope.observe(new MutationObserver(mutations => {
      for (const mutation of mutations) for (const added of mutation.addedNodes) {
        if (added.nodeType !== 1) continue;
        if (added.matches('a[href]')) attach(added);
        added.querySelectorAll('a[href]').forEach(attach);
      }
      record.sync();
    }), node, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded', 'disabled'] });
    record.sync();
  };
  const channelButton = (state, scope) => {
    if (state.route.kind !== 'channel' || !state.body) return;
    const list = state.body.querySelector('[role="tablist"], [class*="channel_area__"]');
    if (!list || list.querySelector('.knife-channel-chat')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = (list.lastElementChild?.className || '') + ' knife-channel-chat knife-owned';
    button.textContent = '↗ ' + (i18n.chat || 'Chat');
    scope.on(button, 'click', () => { location.href = '/live/' + state.route.id; });
    list.append(button); scope.add(() => button.remove());
  };
  const bindStartTimes = (body, scope) => {
    const pending = new WeakSet();
    scope.on(body, 'mouseover', async event => {
      const node = event.target.closest?.('[class^="video_information_count__"], span[class^="video_card_item__"]');
      if (!node || node.contains(event.relatedTarget) || node.dataset.knifeTooltip || pending.has(node)) return;
      const annotate = date => {
        if (scope.disposed || !node.isConnected || typeof date !== 'string' || !date.trim()) return;
        const text = (i18n.liveStart || 'Live start') + ': ' + date;
        node.dataset.knifeTooltip = text;
        scope.add(() => { if (node.dataset.knifeTooltip === text) delete node.dataset.knifeTooltip; });
        runtime.setStatus('startTime', 'ready');
      };
      if (node.className.startsWith('video_information_count__')) {
        const detail = stateOf(node, value => Array.isArray(value) && typeof value[0]?.openDate === 'string');
        if (detail) annotate(detail[0].openDate);
        else runtime.setStatus('startTime', 'limited', 'start-metadata-unavailable');
        return;
      }
      if (node.nextElementSibling) return;
      const link = node.parentElement?.parentElement?.querySelector('a[href]');
      let url;
      try { url = new URL(link?.href); } catch { return; }
      const match = url.origin === location.origin && url.pathname.match(/^\/video\/(\d+)\/?$/);
      if (!match) return;
      const cached = videoMetadata.get(match[1]);
      if (cached && cached.expires > Date.now()) { annotate(cached.date); return; }
      const controller = new AbortController(); const abort = scope.add(() => controller.abort());
      const timeout = setTimeout(abort, 5000); pending.add(node);
      try {
        const response = await fetch('https://api.chzzk.naver.com/service/v3/videos/' + match[1], { credentials: 'include', signal: controller.signal });
        if (!response.ok) throw new Error('metadata-unavailable');
        const info = await response.json();
        if (scope.disposed || !node.isConnected || link.href !== url.href) return;
        if (info.code !== 200 || typeof info.content?.liveOpenDate !== 'string') throw new Error('metadata-unavailable');
        videoMetadata.delete(match[1]); videoMetadata.set(match[1], { date: info.content.liveOpenDate, expires: Date.now() + 1800000 });
        while (videoMetadata.size > 100) videoMetadata.delete(videoMetadata.keys().next().value);
        annotate(info.content.liveOpenDate);
      } catch { if (!scope.disposed) runtime.setStatus('startTime', 'limited', 'start-metadata-unavailable'); }
      finally { clearTimeout(timeout); pending.delete(node); }
    });
  };
  runtime.subscribe(state => {
    config = runtime.config; i18n = runtime.i18n;
    for (const [node, scope] of popups) if (!node.isConnected) scope.dispose();
    if (!runtime.configReady || state.route.kind === 'excluded') {
      owner?.dispose(); owner = null; sidebar = null;
      if (state.route.kind === 'excluded') for (const scope of popups.values()) scope.dispose();
      return;
    }
    if (!owner || ownerGeneration !== runtime.generation) {
      owner?.dispose(); owner = runtime.createScope(); ownerGeneration = runtime.generation;
      chats = new WeakMap(); anchors = new WeakSet(); timestampRoots = new WeakSet(); sidebar = null;
      if (state.body) {
        // CSS cannot identify a SPA route from the document URL. Mark only
        // the exact home content root; never classify the native subtree as owned.
        if (state.route.path === '/') {
          const body = state.body; body.dataset.knifeHome = '1';
          owner.add(() => { if (body.dataset.knifeHome === '1') delete body.dataset.knifeHome; });
        }
        bindStartTimes(state.body, owner);
        owner.on(state.body, 'drop', event => {
          const href = event.dataTransfer?.getData('knife-data');
          if (!config.popupPlayer || !liveURL(href)) return;
          event.preventDefault(); state.body.append(createPopupPlayer(href, event.pageX - 320, event.pageY - 12));
        });
        owner.on(state.body, 'dragover', event => { if (config.popupPlayer && event.dataTransfer?.types.includes('knife-data')) event.preventDefault(); });
      }
    }
    bindSidebar(state.sidebar, owner);
    channelButton(state, owner);
    if (['live','vod'].includes(state.route.kind) && state.body) {
      const chat = state.body.querySelector('[class^="vod_chatting_container__"]') || state.body.querySelector('aside:not([aria-label])');
      attachChat(chat, state.route.kind === 'live', owner);
    }
    const banner = state.body?.querySelector('[class^="band_banner_container__"]');
    if (banner && !banner.querySelector('button')) {
      const close = runtime.adapter.fiberOf(banner)?.return?.memoizedProps?.closeHandler;
      if (typeof close === 'function') {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'knife-owned'; button.textContent = '×';
        owner.on(button, 'click', close); banner.append(button); owner.add(() => button.remove());
      }
    }
  });
  window.addEventListener('pagehide', event => {
    if (!event.persisted) { owner?.dispose(); for (const scope of popups.values()) scope.dispose(); }
  });
})();

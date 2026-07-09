(() => {
  'use strict';

  if (window.__OKX_USDT_BOOST_CHROME_BRIDGE__) return;
  window.__OKX_USDT_BOOST_CHROME_BRIDGE__ = true;

  const CHANNEL_KEY = '__okxBoostExtension';
  const pendingCommands = new Map();
  let commandSequence = 0;

  function sendToEngine(command, payload = {}) {
    const id = `${Date.now()}-${++commandSequence}`;

    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => {
        pendingCommands.delete(id);
        resolve({ ok: false, error: '页面交易引擎未响应，请刷新 OKX 页面后重试' });
      }, 8000);

      pendingCommands.set(id, { resolve, timeoutId });
      window.postMessage({
        [CHANNEL_KEY]: true,
        kind: 'command',
        id,
        command,
        payload
      }, window.location.origin);
    });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data[CHANNEL_KEY] !== true) return;

    if (data.kind === 'state') {
      chrome.runtime.sendMessage({
        type: 'OKX_BOOST_EXTENSION_STATE',
        state: data.payload
      }).catch(() => {});
      return;
    }

    if (data.kind === 'response' && data.payload?.id) {
      const pending = pendingCommands.get(data.payload.id);
      if (!pending) return;
      window.clearTimeout(pending.timeoutId);
      pendingCommands.delete(data.payload.id);
      pending.resolve(data.payload);
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'OKX_BOOST_EXTENSION_COMMAND') return;
    sendToEngine(message.command, message.payload)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });

  chrome.runtime.sendMessage({ type: 'OKX_BOOST_BRIDGE_READY' }).catch(() => {});
})();

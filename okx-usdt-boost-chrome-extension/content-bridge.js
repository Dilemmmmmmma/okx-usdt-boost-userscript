(() => {
  'use strict';

  if (window.__OKX_USDT_BOOST_CHROME_BRIDGE__) return;
  window.__OKX_USDT_BOOST_CHROME_BRIDGE__ = true;

  const CHANNEL_KEY = '__okxBoostExtension';
  const pendingCommands = new Map();
  let commandSequence = 0;
  let bridgeActive = true;

  function isExtensionContextAlive() {
    if (!bridgeActive) return false;
    try {
      return Boolean(chrome && chrome.runtime && chrome.runtime.id);
    } catch {
      bridgeActive = false;
      return false;
    }
  }

  function safeRuntimeSendMessage(message) {
    if (!isExtensionContextAlive()) return Promise.resolve(null);
    try {
      return Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => null);
    } catch {
      return Promise.resolve(null);
    }
  }

  function sendToEngine(command, payload = {}) {
    if (!isExtensionContextAlive()) {
      return Promise.resolve({ ok: false, error: '扩展已更新，请刷新当前 OKX 页面' });
    }

    const id = `${Date.now()}-${++commandSequence}`;

    return new Promise((resolve) => {
      let timeoutId = null;
      try {
        if (!isExtensionContextAlive()) {
          resolve({ ok: false, error: '扩展已更新，请刷新当前 OKX 页面' });
          return;
        }

        timeoutId = window.setTimeout(() => {
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
      } catch {
        if (timeoutId) window.clearTimeout(timeoutId);
        pendingCommands.delete(id);
        bridgeActive = false;
        resolve({ ok: false, error: '扩展已更新，请刷新当前 OKX 页面' });
      }
    });
  }

  function safeSendResponse(sendResponse, payload) {
    if (!isExtensionContextAlive()) return;
    try {
      sendResponse(payload);
    } catch {
      bridgeActive = false;
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data[CHANNEL_KEY] !== true) return;

    if (data.kind === 'state') {
      safeRuntimeSendMessage({
        type: 'OKX_BOOST_EXTENSION_STATE',
        state: data.payload
      });
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

  if (isExtensionContextAlive()) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== 'OKX_BOOST_EXTENSION_COMMAND') return;
      sendToEngine(message.command, message.payload)
        .then((result) => safeSendResponse(sendResponse, result))
        .catch((error) => safeSendResponse(sendResponse, {
          ok: false,
          error: String(error?.message || error)
        }));
      return true;
    });
  }

  safeRuntimeSendMessage({ type: 'OKX_BOOST_BRIDGE_READY' });
})();

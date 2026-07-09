const OKX_HOSTS = new Set(['web3.okx.com', 'web3.cnouxyex.co']);

function isSupportedUrl(url) {
  try {
    return OKX_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function configureSidePanel(tabId, url) {
  await chrome.sidePanel.setOptions({
    tabId,
    path: 'sidepanel.html',
    enabled: isSupportedUrl(url)
  });
}

async function ensurePageEngine(tabId, url) {
  if (!tabId || !isSupportedUrl(url)) {
    return { ok: false, error: '当前不是受支持的 OKX Web3 页面' };
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['page-engine.js'],
    world: 'MAIN',
    injectImmediately: true
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content-bridge.js'],
    injectImmediately: true
  });

  return { ok: true };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    configureSidePanel(tabId, tab.url || changeInfo.url || '').catch(() => {});
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !isSupportedUrl(tab.url || '')) return;
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OKX_BOOST_OPEN_RECORDS') {
    chrome.tabs.create({ url: 'https://web3.okx.com/zh-hans/boost/records' });
    return;
  }

  if (message?.type === 'OKX_BOOST_ENSURE_ENGINE') {
    chrome.tabs.get(message.tabId)
      .then((tab) => ensurePageEngine(tab.id, tab.url || ''))
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
});

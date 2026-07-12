const OKX_HOSTS = new Set(['web3.okx.com', 'web3.cnouxyex.co']);
const BINANCE_HOST = 'www.binance.com';
const BINANCE_WALLET_HOST = 'web3.binance.com';

function getWorkspaceForUrl(url) {
  try {
    const parsed = new URL(url);
    if (OKX_HOSTS.has(parsed.hostname)) return 'boost';
    if (parsed.hostname === BINANCE_HOST && /^\/[^/]+\/alpha\//.test(parsed.pathname)) return 'alpha-cex';
    if (parsed.hostname === BINANCE_WALLET_HOST && /^\/[^/]+\/token\/[^/]+\/[^/]+/.test(parsed.pathname)) return 'alpha-wallet';
  } catch {}
  return null;
}

function isSupportedUrl(url) {
  try {
    return Boolean(getWorkspaceForUrl(url));
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
  const workspace = getWorkspaceForUrl(url);
  if (!tabId || !workspace) {
    return { ok: false, error: '当前页面不支持交易助手' };
  }

  const pageEngine = workspace === 'alpha-cex'
    ? 'alpha-page-engine.js'
    : workspace === 'alpha-wallet'
      ? 'wallet-alpha-page-engine.js'
      : 'page-engine.js';
  const contentBridge = workspace === 'alpha-cex'
    ? 'alpha-content-bridge.js'
    : workspace === 'alpha-wallet'
      ? 'wallet-alpha-content-bridge.js'
      : 'content-bridge.js';

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [pageEngine],
    world: 'MAIN',
    injectImmediately: true
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [contentBridge],
    injectImmediately: true
  });

  return { ok: true, workspace };
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
  await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OKX_BOOST_OPEN_RECORDS') {
    chrome.tabs.create({ url: 'https://web3.okx.com/zh-hans/boost/records' }).catch(() => {});
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

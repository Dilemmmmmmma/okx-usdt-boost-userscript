(() => {
  'use strict';

  if (window.__WALLET_ALPHA_EXTENSION_ENGINE__) return;
  window.__WALLET_ALPHA_EXTENSION_ENGINE__ = true;

  const VERSION = '1.2.6';
  const CHANNEL_KEY = '__walletAlphaExtension';
  const TAG_API = '/bapi/defi/v1/public/wallet-direct/buw/wallet/dex/market/token/tag/info';
  const META_API = '/bapi/defi/v1/public/wallet-direct/buw/wallet/dex/market/token/meta/info';
  const DEFAULT_SETTINGS = Object.freeze({ targetPoints: 0, shortcutAmount: 20, orderTimeoutSec: 90 });
  const CHAIN_IDS = Object.freeze({ bsc: '56', ethereum: '1', eth: '1', base: '8453', solana: 'CT_501' });
  const SUCCESS_RE = /成功|完成|已成交|全部成交|filled|completed|success/i;
  const FAILURE_RE = /失败|已取消|已拒绝|已过期|failed|cancelled|canceled|rejected|expired/i;
  const BUY_RE = /买入|\bbuy\b/i;
  const SELL_RE = /卖出|\bsell\b/i;
  const INSUFFICIENT_BALANCE_RE = /余额不足|insufficient(?:\s+[A-Z0-9._-]+)?\s+balance/i;

  let settings = loadSettings();
  let token = readTokenFromUrl();
  let multiplier = null;
  let multiplierSource = '识别中';
  let tokenSymbol = '';
  let running = false;
  let stopRequested = false;
  let phase = 'idle';
  let status = '正在识别 Wallet Alpha 代币';
  let loopToken = 0;
  let visibleDialogBaseline = new Set();
  let progress = loadProgress();
  let lastInsufficientBalanceNotice = { sequence: 0, text: '' };

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function recordInsufficientBalanceNotice(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!INSUFFICIENT_BALANCE_RE.test(text)) return;
    lastInsufficientBalanceNotice = {
      sequence: lastInsufficientBalanceNotice.sequence + 1,
      text: text.slice(0, 160)
    };
  }

  function observeTradeNotices() {
    const root = document.documentElement || document;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          recordInsufficientBalanceNotice(mutation.target.nodeValue);
          continue;
        }
        for (const node of mutation.addedNodes) {
          recordInsufficientBalanceNotice(node.nodeType === Node.TEXT_NODE ? node.nodeValue : node.textContent);
        }
      }
    });
    observer.observe(root, { childList: true, characterData: true, subtree: true });
  }

  observeTradeNotices();

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function readTokenFromUrl() {
    try {
      const parts = window.location.pathname.split('/').filter(Boolean);
      const tokenIndex = parts.indexOf('token');
      if (tokenIndex < 0 || !parts[tokenIndex + 1] || !parts[tokenIndex + 2]) return null;
      const chain = String(parts[tokenIndex + 1]).toLowerCase();
      const address = String(parts[tokenIndex + 2]).split(/[?#]/)[0];
      return { chain, chainId: CHAIN_IDS[chain] || chain, address };
    } catch {
      return null;
    }
  }

  function tokenKey(current = token) {
    return current ? `${current.chain}:${current.address.toLowerCase()}` : 'unknown';
  }

  function utcDayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function settingsKey() {
    return 'walletAlphaSettings';
  }

  function progressKey(current = token) {
    return `walletAlphaProgress:${tokenKey(current)}:${utcDayKey()}`;
  }

  function loadSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(settingsKey()) || '{}');
      return {
        targetPoints: positiveNumber(parsed.targetPoints, DEFAULT_SETTINGS.targetPoints, true),
        shortcutAmount: positiveNumber(parsed.shortcutAmount, DEFAULT_SETTINGS.shortcutAmount),
        orderTimeoutSec: positiveNumber(parsed.orderTimeoutSec, DEFAULT_SETTINGS.orderTimeoutSec)
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings() {
    try { localStorage.setItem(settingsKey(), JSON.stringify(settings)); } catch {}
  }

  function emptyProgress() {
    return { points: 0, actualBuyUsd: 0, rounds: 0, updatedAt: 0 };
  }

  function loadProgress() {
    try {
      const parsed = JSON.parse(localStorage.getItem(progressKey()) || '{}');
      return {
        points: Number(parsed.points) || 0,
        actualBuyUsd: Number(parsed.actualBuyUsd) || 0,
        rounds: Number(parsed.rounds) || 0,
        updatedAt: Number(parsed.updatedAt) || 0
      };
    } catch {
      return emptyProgress();
    }
  }

  function saveProgress() {
    progress.updatedAt = Date.now();
    try { localStorage.setItem(progressKey(), JSON.stringify(progress)); } catch {}
  }

  function positiveNumber(value, fallback, allowZero = false) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    if (allowZero ? number < 0 : number <= 0) return fallback;
    return number;
  }

  function compactNumber(text) {
    const match = String(text || '').replace(/,/g, '').trim().match(/-?\d+(?:\.\d+)?\s*([KMB])?/i);
    if (!match) return NaN;
    const scale = { K: 1e3, M: 1e6, B: 1e9 }[String(match[1] || '').toUpperCase()] || 1;
    return Number(match[0].replace(/[KMB]/ig, '').trim()) * scale;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function parseMultiplierFromText(text) {
    const value = String(text || '');
    const match = value.match(/(\d+(?:\.\d+)?)\s*(?:x|倍)\s*Alpha|Alpha[^\d]{0,20}(\d+(?:\.\d+)?)\s*(?:x|倍)/i);
    const number = Number(match && (match[1] || match[2]));
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function readMultiplierFromPage() {
    const candidates = Array.from(document.querySelectorAll('[aria-label*="Alpha"], [alt*="Alpha"], [title*="Alpha"]'));
    for (const element of candidates) {
      const text = [element.getAttribute('aria-label'), element.getAttribute('alt'), element.getAttribute('title'), element.textContent].filter(Boolean).join(' ');
      const parsed = parseMultiplierFromText(text);
      if (parsed) return parsed;
    }
    return null;
  }

  async function fetchPublicTokenInfo(current) {
    const query = `chainId=${encodeURIComponent(current.chainId)}&contractAddress=${encodeURIComponent(current.address)}`;
    const [tagResponse, metaResponse] = await Promise.all([
      fetch(`${TAG_API}?${query}`, { credentials: 'omit', headers: { Accept: 'application/json' } }),
      fetch(`${META_API}?${query}`, { credentials: 'omit', headers: { Accept: 'application/json' } }).catch(() => null)
    ]);
    if (!tagResponse.ok) throw new Error(`倍数接口返回 ${tagResponse.status}`);
    const tagPayload = await tagResponse.json();
    const alphaTags = tagPayload?.data?.['Alpha Points'];
    let apiMultiplier = null;
    if (Array.isArray(alphaTags)) {
      for (const tag of alphaTags) {
        apiMultiplier = parseMultiplierFromText(`${tag?.tagName || ''} ${tag?.languageKey || ''}`);
        if (apiMultiplier) break;
      }
    }
    if (!apiMultiplier && tagPayload?.success === true) apiMultiplier = 1;

    let symbol = '';
    if (metaResponse?.ok) {
      try {
        const metaPayload = await metaResponse.json();
        symbol = String(metaPayload?.data?.symbol || '').trim();
      } catch {}
    }
    return { multiplier: apiMultiplier, symbol, explicit: tagPayload?.success === true };
  }

  async function refreshTokenInfo() {
    const current = readTokenFromUrl();
    if (!current) {
      token = null;
      multiplier = null;
      status = '当前不是 Binance Wallet 代币页';
      postState();
      return;
    }
    if (!token || tokenKey(token) !== tokenKey(current)) {
      token = current;
      progress = loadProgress();
    }
    multiplier = null;
    multiplierSource = '识别中';
    try {
      const info = await fetchPublicTokenInfo(current);
      tokenSymbol = info.symbol || tokenSymbol;
      if (info.multiplier) {
        multiplier = info.multiplier;
        multiplierSource = info.multiplier === 1 ? '公开接口：1x' : `公开接口：${info.multiplier}x`;
      }
    } catch {}
    if (!multiplier) {
      const domMultiplier = readMultiplierFromPage();
      if (domMultiplier) {
        multiplier = domMultiplier;
        multiplierSource = `页面标记：${domMultiplier}x`;
      }
    }
    if (!multiplier) {
      multiplierSource = '无法确认倍数';
      status = '无法确认 Alpha 倍数，禁止启动';
    } else if (!running) {
      status = 'Wallet Alpha 已就绪';
    }
    postState();
  }

  function state() {
    const requiredActual = multiplier && settings.targetPoints > 0 ? settings.targetPoints / multiplier : null;
    return {
      version: VERSION,
      mode: 'wallet',
      ready: Boolean(token),
      running,
      stopRequested,
      phase,
      status,
      token: token ? { ...token, symbol: tokenSymbol || token.address.slice(0, 8) } : null,
      market: { multiplier, multiplierSource },
      stats: { ...progress, requiredActual },
      settings: { ...settings }
    };
  }

  function postState() {
    window.postMessage({ [CHANNEL_KEY]: true, kind: 'state', payload: state() }, window.location.origin);
  }

  function respond(id, payload) {
    window.postMessage({ [CHANNEL_KEY]: true, kind: 'response', payload: { id, ...payload } }, window.location.origin);
  }

  function visibleElements(selector) {
    return Array.from(document.querySelectorAll(selector)).filter(isVisible);
  }

  function clickElement(element) {
    if (!element || !isVisible(element)) return false;
    element.click();
    return true;
  }

  async function waitUntil(test, timeoutMs = 5000, intervalMs = 100) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = test();
      if (result) return result;
      await sleep(intervalMs);
    }
    return null;
  }

  function visibleElementsWithin(root, selector) {
    if (!root?.querySelectorAll) return [];
    return Array.from(root.querySelectorAll(selector)).filter(isVisible);
  }

  function elementsWithin(root, selector) {
    if (!root?.querySelectorAll) return [];
    return Array.from(root.querySelectorAll(selector));
  }

  function shortcutSide(element) {
    const text = String(element?.textContent || '').replace(/\s+/g, '').trim();
    return text.endsWith('%') ? 'sell' : 'buy';
  }

  function hasBothShortcutSides(root, visibleOnly = false) {
    const selector = '[aria-label^="Shortcut "], [aria-label^="快捷 "]';
    const shortcuts = visibleOnly ? visibleElementsWithin(root, selector) : elementsWithin(root, selector);
    return shortcuts.some((element) => shortcutSide(element) === 'buy')
      && shortcuts.some((element) => shortcutSide(element) === 'sell');
  }

  function findOneClickPanelRoot() {
    const anchoredPanels = elementsWithin(document, '[tabindex="-1"]').filter((element) => {
      return element.querySelector('[aria-label="P1"]')
        && element.querySelector('[aria-label="P2"]')
        && element.querySelector('[aria-label="P3"]')
        && hasBothShortcutSides(element);
    });
    const visibleAnchoredPanels = anchoredPanels.filter(isVisible);
    if (visibleAnchoredPanels.length === 1) return visibleAnchoredPanels[0];
    if (anchoredPanels.length === 1) return anchoredPanels[0];

    const shortcuts = elementsWithin(document, '[aria-label^="Shortcut "], [aria-label^="快捷 "]');
    for (const shortcut of shortcuts) {
      let ancestor = shortcut.parentElement;
      while (ancestor && ancestor !== document.body) {
        if (hasBothShortcutSides(ancestor)) return ancestor;
        ancestor = ancestor.parentElement;
      }
    }
    return null;
  }

  function oneClickToggleIsActive(button) {
    if (!button) return false;
    return elementsWithin(button, '[class]').some((element) => element.classList.contains('text-[--color-Buy]'));
  }

  function findOneClickToggle() {
    const exact = visibleElements('button[aria-label="一键买卖"], button[aria-label="One-click Buy/Sell"]');
    if (exact.length === 1) return exact[0];
    const active = exact.filter(oneClickToggleIsActive);
    return active.length === 1 ? active[0] : null;
  }

  function oneClickPanelIsReady() {
    const toggle = findOneClickToggle();
    const panelRoot = findOneClickPanelRoot();
    return Boolean(toggle && oneClickToggleIsActive(toggle) && panelRoot && hasBothShortcutSides(panelRoot, true));
  }

  function findTab(key) {
    const matches = visibleElements(`[data-tab-key="${key}"]`);
    return matches.length === 1 ? matches[0] : null;
  }

  async function selectTab(key, label) {
    if (/^(BUY|SELL)$/.test(key)) {
      if (!oneClickPanelIsReady()) throw new Error('一键买卖面板未打开');
      return;
    }
    const tab = findTab(key);
    if (!tab) throw new Error(`${label}按钮未找到或不唯一`);
    if (!String(tab.className || '').includes('active') && tab.getAttribute('aria-selected') !== 'true') {
      clickElement(tab);
      await sleep(250);
    }
  }

  function normalizeShortcut(value) {
    const number = Number(value);
    return Number.isInteger(number) ? String(number) : String(number).replace(/0+$/, '').replace(/\.$/, '');
  }

  function findShortcut(value, side) {
    const normalized = normalizeShortcut(value);
    const exactLabels = side === 'sell'
      ? [`Shortcut ${normalized}`, `快捷 ${normalized}`, `${normalized}%`]
      : [`Shortcut ${normalized}`, `快捷 ${normalized}`];
    const panelRoot = findOneClickPanelRoot();
    const visibleButtons = panelRoot
      ? visibleElementsWithin(panelRoot, '[role="button"], button')
      : visibleElements('[role="button"], button');
    const sideButtons = visibleButtons.filter((element) => shortcutSide(element) === side);
    const ariaCandidates = sideButtons.filter((element) => {
      const aria = String(element.getAttribute('aria-label') || '').trim();
      return exactLabels.includes(aria);
    });
    if (ariaCandidates.length === 1) return ariaCandidates[0];
    if (ariaCandidates.length > 1) return null;

    const textCandidates = sideButtons.filter((element) => {
      const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
      return exactLabels.includes(text) || (side === 'sell' && text === `${normalized}%`) || (side === 'buy' && text === normalized);
    });
    return textCandidates.length === 1 ? textCandidates[0] : null;
  }

  async function ensureTradePanel() {
    let toggle = findOneClickToggle();
    if (!toggle) throw new Error('一键买卖按钮未找到或不唯一');

    if (!oneClickToggleIsActive(toggle)) {
      status = '一键买卖面板未打开，正在打开';
      postState();
      clickElement(toggle);
      toggle = await waitUntil(() => {
        const current = findOneClickToggle();
        return current && oneClickToggleIsActive(current) ? current : null;
      }, 5000, 100);
      if (!toggle) throw new Error('一键买卖按钮未切换到打开状态');
    }

    if (oneClickPanelIsReady()) return true;
    status = '一键买卖面板已打开，等待快捷值加载';
    postState();
    const ready = await waitUntil(oneClickPanelIsReady, 5000, 100);
    if (!ready) throw new Error('一键买卖面板已打开，但快捷值控件未加载');
    return true;
  }

  function isLoginRequired() {
    return visibleElements('button,a').some((element) => /^(登录|连接|Log in|Connect)$/i.test(String(element.textContent || '').trim()));
  }

  async function ensureOrderView() {
    await selectTab('MY_ORDERS', '我的订单');
    const allTab = await waitUntil(() => {
      const matches = visibleElements('[aria-label="my-orders-tab-all"]');
      return matches.length === 1 ? matches[0] : null;
    }, 5000, 100);
    if (!allTab) throw new Error('全部订单按钮未找到');
    if (!String(allTab.className || '').includes('active') && allTab.getAttribute('aria-selected') !== 'true') {
      clickElement(allTab);
      await sleep(250);
    }
  }

  function orderRows() {
    return Array.from(document.querySelectorAll('tr[data-row-key]')).map((row) => ({
      id: String(row.getAttribute('data-row-key') || ''),
      text: String(row.textContent || '').replace(/\s+/g, ' ').trim(),
      cells: Array.from(row.querySelectorAll('td')).map((cell) => ({
        text: String(cell.textContent || '').replace(/\s+/g, ' ').trim(),
        label: String(cell.getAttribute('data-label') || cell.getAttribute('aria-label') || '').trim()
      }))
    })).filter((row) => row.id);
  }

  function orderIds() {
    return new Set(orderRows().map((row) => row.id));
  }

  function orderStatusText(row) {
    const labeled = row.cells
      .filter((cell) => /状态|status/i.test(cell.label))
      .map((cell) => cell.text)
      .filter(Boolean);
    return labeled.length ? labeled.join(' ') : row.text;
  }

  async function settledOrderIds(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    let previous = null;
    let stableReads = 0;
    while (Date.now() < deadline) {
      const ids = Array.from(orderIds()).sort();
      const signature = ids.join('|');
      if (signature === previous) stableReads += 1;
      else stableReads = 0;
      if (stableReads >= 4) return new Set(ids);
      previous = signature;
      await sleep(250);
    }
    return orderIds();
  }

  function readPageMarketPrice() {
    const values = [];
    for (const element of visibleElements('span,div')) {
      const text = String(element.textContent || '').trim();
      if (!/^\$\s*\d[\d,.]*(?:\.\d+)?$/.test(text)) continue;
      const number = compactNumber(text.replace('$', ''));
      if (Number.isFinite(number) && number > 0) values.push({ number, top: element.getBoundingClientRect().top });
      if (values.length >= 30) break;
    }
    values.sort((a, b) => a.top - b.top);
    return values.length ? values[0].number : NaN;
  }

  function extractBuyUsd(row) {
    const symbol = String(tokenSymbol || '').trim();
    const marketPrice = readPageMarketPrice();
    const combined = [row.text, ...row.cells.map((cell) => `${cell.label} ${cell.text}`)].join(' ');
    let quantity = NaN;

    if (symbol) {
      const escaped = escapeRegExp(symbol);
      const patterns = [
        new RegExp(`([0-9,.]+(?:\\s*[KMB])?)\\s*${escaped}\\b`, 'i'),
        new RegExp(`\\b${escaped}\\s*([0-9,.]+(?:\\s*[KMB])?)`, 'i')
      ];
      for (const pattern of patterns) {
        const match = combined.match(pattern);
        const parsed = compactNumber(match && match[1]);
        if (Number.isFinite(parsed) && parsed > 0) { quantity = parsed; break; }
      }
    }

    if (!Number.isFinite(quantity) && Number.isFinite(marketPrice)) {
      const expectedUsd = settings.shortcutAmount;
      const numericCandidates = [];
      for (const cell of row.cells) {
        if (/时间|time|状态|status|价格|price/i.test(cell.label)) continue;
        const number = compactNumber(cell.text.replace(/\$/g, ''));
        if (!Number.isFinite(number) || number <= 0) continue;
        const usd = number * marketPrice;
        if (usd >= expectedUsd * 0.2 && usd <= expectedUsd * 5) numericCandidates.push({ number, distance: Math.abs(usd - expectedUsd) });
      }
      numericCandidates.sort((a, b) => a.distance - b.distance);
      if (numericCandidates.length) quantity = numericCandidates[0].number;
    }

    const priceCandidates = [];
    const dollarRe = /\$\s*([0-9,.]+(?:\s*[KMB])?)/g;
    let match;
    while ((match = dollarRe.exec(combined))) {
      const number = compactNumber(match[1]);
      if (Number.isFinite(number) && number > 0) priceCandidates.push(number);
    }
    if (!priceCandidates.length) {
      for (const cell of row.cells.filter((item) => /价格|price/i.test(`${item.label} ${item.text}`))) {
        const number = compactNumber(cell.text);
        if (Number.isFinite(number) && number > 0) priceCandidates.push(number);
      }
    }
    let price = NaN;
    if (priceCandidates.length && Number.isFinite(marketPrice)) {
      priceCandidates.sort((a, b) => Math.abs(a - marketPrice) - Math.abs(b - marketPrice));
      price = priceCandidates[0];
    } else if (priceCandidates.length === 1) {
      price = priceCandidates[0];
    }

    const usd = quantity * price;
    return Number.isFinite(usd) && usd > 0 ? usd : NaN;
  }

  function dialogElements() {
    return visibleElements('[role="dialog"], .bn-modal');
  }

  function newDialogDetected() {
    for (const element of dialogElements()) {
      if (!visibleDialogBaseline.has(element)) return String(element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160) || '未知弹窗';
    }
    return '';
  }

  function tokenUnchanged(expectedKey) {
    const current = readTokenFromUrl();
    return current && tokenKey(current) === expectedKey;
  }

  function insufficientBalanceError() {
    const error = new Error(lastInsufficientBalanceNotice.text || '余额不足');
    error.code = 'INSUFFICIENT_BALANCE';
    return error;
  }

  async function waitForNewOrder(side, beforeIds, expectedTokenKey, timeoutMs, noticeBaseline = Infinity) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!tokenUnchanged(expectedTokenKey)) throw new Error('页面代币已改变，交易已暂停');
      if (side === 'buy' && lastInsufficientBalanceNotice.sequence > noticeBaseline) throw insufficientBalanceError();
      const unexpectedDialog = newDialogDetected();
      if (unexpectedDialog) throw new Error('检测到新的确认或风险弹窗，请手动处理后重新启动');
      const rows = orderRows().filter((row) => !beforeIds.has(row.id));
      for (const row of rows) {
        if (tokenSymbol && !row.text.toUpperCase().includes(tokenSymbol.toUpperCase())) continue;
        const sideMatches = side === 'buy' ? BUY_RE.test(row.text) : SELL_RE.test(row.text);
        if (!sideMatches) continue;
        const statusText = orderStatusText(row);
        if (FAILURE_RE.test(statusText)) throw new Error(`${side === 'buy' ? '买入' : '卖出'}订单失败：${statusText.slice(0, 80)}`);
        if (SUCCESS_RE.test(statusText)) {
          return { row, usd: side === 'buy' ? extractBuyUsd(row) : null };
        }
      }
      await sleep(250);
    }
    throw new Error(`${side === 'buy' ? '买入' : '卖出'}订单等待超时，未自动重试`);
  }

  async function executeSell100(sessionToken, expectedTokenKey, preparingStatus = '准备卖出 100%') {
    phase = 'preparing-sell';
    status = preparingStatus;
    postState();
    await selectTab('SELL', '卖出');
    const beforeSell = await settledOrderIds();
    const sellShortcut = findShortcut(100, 'sell');
    if (!sellShortcut) throw new Error('卖出 100% 按钮未找到或不唯一');
    if (!running || sessionToken !== loopToken) return false;
    if (!tokenUnchanged(expectedTokenKey)) throw new Error('页面代币已改变，交易已暂停');
    clickElement(sellShortcut);
    phase = 'waiting-sell';
    status = '等待卖出订单确认';
    postState();
    await waitForNewOrder('sell', beforeSell, expectedTokenKey, settings.orderTimeoutSec * 1000);
    return true;
  }

  function pauseWithError(error) {
    running = false;
    stopRequested = false;
    phase = 'paused';
    status = String(error?.message || error || '交易已暂停');
    postState();
  }

  async function runTrading(sessionToken) {
    const expectedTokenKey = tokenKey();
    try {
      if (isLoginRequired()) throw new Error('请先连接 Binance Wallet');
      await ensureTradePanel();
      await ensureOrderView();
      visibleDialogBaseline = new Set(dialogElements());

      while (running && sessionToken === loopToken) {
        if (stopRequested) break;
        if (progress.points >= settings.targetPoints) {
          status = '已达到目标积分交易量';
          break;
        }
        if (!tokenUnchanged(expectedTokenKey)) throw new Error('页面代币已改变，交易已暂停');

        phase = 'preparing-buy';
        status = '准备买入';
        postState();
        await selectTab('BUY', '买入');
        const beforeBuy = await settledOrderIds();
        const buyShortcut = findShortcut(settings.shortcutAmount, 'buy');
        if (!buyShortcut) throw new Error(`买入快捷值 ${normalizeShortcut(settings.shortcutAmount)} 未找到或不唯一`);
        if (!running || sessionToken !== loopToken || stopRequested) break;
        if (!tokenUnchanged(expectedTokenKey)) throw new Error('页面代币已改变，交易已暂停');
        const buyNoticeBaseline = lastInsufficientBalanceNotice.sequence;
        clickElement(buyShortcut);
        phase = 'waiting-buy';
        status = '等待买入订单确认';
        postState();

        let buyOrder;
        try {
          buyOrder = await waitForNewOrder('buy', beforeBuy, expectedTokenKey, settings.orderTimeoutSec * 1000, buyNoticeBaseline);
        } catch (error) {
          if (error?.code !== 'INSUFFICIENT_BALANCE') throw error;
          const recovered = await executeSell100(sessionToken, expectedTokenKey, '余额不足，先卖出 100%');
          if (!recovered || stopRequested) break;
          phase = 'idle';
          status = '卖出成功，重新准备买入';
          postState();
          await sleep(1000);
          continue;
        }
        const buyUsdAvailable = Number.isFinite(buyOrder.usd) && buyOrder.usd > 0;
        if (buyUsdAvailable) {
          progress.actualBuyUsd += buyOrder.usd;
          progress.points += buyOrder.usd * multiplier;
          saveProgress();
          postState();
        }

        const sold = await executeSell100(sessionToken, expectedTokenKey, '买入成功，准备卖出 100%');
        if (!sold) break;

        progress.rounds += 1;
        saveProgress();
        if (!buyUsdAvailable) throw new Error('买卖已完成，但无法从买入订单计算美元交易额，交易已暂停');
        phase = 'idle';
        status = '本轮买卖已完成';
        postState();
        if (stopRequested || progress.points >= settings.targetPoints) break;
        await sleep(1000);
      }

      running = false;
      stopRequested = false;
      phase = 'idle';
      status = progress.points >= settings.targetPoints ? '已达到目标积分交易量' : '已安全停止';
      postState();
    } catch (error) {
      pauseWithError(error);
    }
  }

  async function startTrading() {
    if (running) return;
    token = readTokenFromUrl();
    if (!token) throw new Error('当前不是 Binance Wallet 代币页');
    if (!multiplier) throw new Error('无法确认 Alpha 倍数，禁止启动');
    if (!(settings.targetPoints > 0)) throw new Error('请填写大于 0 的目标积分交易量');
    if (!(settings.shortcutAmount > 0)) throw new Error('请填写有效的买入快捷值');
    running = true;
    stopRequested = false;
    phase = 'starting';
    status = '正在启动 Wallet Alpha 交易';
    loopToken += 1;
    postState();
    runTrading(loopToken);
  }

  function requestStop() {
    if (!running) return;
    if (['waiting-buy', 'preparing-sell', 'waiting-sell'].includes(phase)) {
      stopRequested = true;
      status = '将在当前仓位卖出成功后停止';
    } else {
      running = false;
      stopRequested = false;
      loopToken += 1;
      phase = 'idle';
      status = '已停止';
    }
    postState();
  }

  async function handleCommand(command, payload = {}) {
    switch (command) {
      case 'wallet-alpha-get-state':
        return { ok: true, state: state() };
      case 'wallet-alpha-refresh':
        await refreshTokenInfo();
        return { ok: true, state: state() };
      case 'wallet-alpha-save-settings':
        settings = {
          targetPoints: positiveNumber(payload.targetPoints, settings.targetPoints, true),
          shortcutAmount: positiveNumber(payload.shortcutAmount, settings.shortcutAmount),
          orderTimeoutSec: positiveNumber(payload.orderTimeoutSec, settings.orderTimeoutSec)
        };
        saveSettings();
        return { ok: true, state: state() };
      case 'wallet-alpha-toggle-run':
        if (running) requestStop();
        else await startTrading();
        return { ok: true, state: state() };
      case 'wallet-alpha-clear-records':
        progress = emptyProgress();
        saveProgress();
        status = 'Wallet Alpha 记录已清除';
        postState();
        return { ok: true, state: state() };
      default:
        return { ok: false, error: `未知 Wallet Alpha 指令：${String(command || '')}` };
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data[CHANNEL_KEY] !== true || data.kind !== 'command' || !data.id) return;
    Promise.resolve(handleCommand(data.command, data.payload || {}))
      .then((result) => respond(data.id, result))
      .catch((error) => respond(data.id, { ok: false, error: String(error?.message || error), state: state() }));
  });

  let lastUrl = window.location.href;
  window.setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      const current = readTokenFromUrl();
      if (running && (!current || tokenKey(current) !== tokenKey(token))) pauseWithError('页面代币已改变，交易已暂停');
      token = current;
      progress = loadProgress();
      refreshTokenInfo();
    }
  }, 800);
  window.setInterval(postState, 1500);

  refreshTokenInfo();
  postState();
})();

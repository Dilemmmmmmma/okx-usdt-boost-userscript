(() => {
  'use strict';

  const OKX_HOSTS = new Set(['web3.okx.com', 'web3.cnouxyex.co']);
  const BINANCE_HOST = 'www.binance.com';
  const REFRESH_INTERVAL_MS = 2500;
  let activeTabId = null;
  let activePageKind = null;
  let activeWorkspace = localStorage.getItem('trade-assistant-workspace') || 'boost';
  let currentBoostState = null;
  let currentAlphaState = null;
  let loadedBoostForm = false;
  let loadedAlphaForm = false;
  let boostAutosaveTimerId = null;
  let alphaAutosaveTimerId = null;
  let alphaSettingsRevision = 0;
  let alphaSettingsDirty = false;

  const $ = (id) => document.getElementById(id);

  function pageKindFromUrl(url) {
    try {
      const parsed = new URL(url);
      if (OKX_HOSTS.has(parsed.hostname)) return 'boost';
      if (parsed.hostname === BINANCE_HOST && parsed.pathname.startsWith('/zh-CN/alpha/')) return 'alpha';
    } catch {}
    return null;
  }

  function formatNumber(value, decimals = 4) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(decimals) : '--';
  }

  function formatSigned(value, decimals = 4) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '--';
    return `${number > 0 ? '+' : ''}${number.toFixed(decimals)}`;
  }

  function setMetric(id, value, tone = '') {
    const element = $(id);
    if (!element) return;
    element.textContent = value;
    element.className = tone;
  }

  function toneForValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return number > 0 ? 'positive' : number < 0 ? 'negative' : '';
  }

  function setFooter(message, isError = false) {
    const footer = $('footer-status');
    footer.textContent = message;
    footer.classList.toggle('error', Boolean(isError));
  }

  function setConnection(connected, message) {
    $('connection-dot').className = `dot${connected ? ' connected' : ' warning'}`;
    $('connection-text').textContent = message;
  }

  function setInputValue(id, value, force = false) {
    const input = $(id);
    if (!input || value === undefined || value === null) return;
    if (!force && document.activeElement === input) return;
    input.value = String(value);
  }

  function setDisabled(ids, disabled) {
    ids.forEach((id) => {
      const element = $(id);
      if (element) element.disabled = disabled;
    });
  }

  function setBoostControlsReady(ready) {
    setDisabled([
      'auto-trade-button', 'refresh-button', 'schedule-button',
      'alarm-toggle', 'pause-stats-toggle', 'rebate-percent', 'boost-daily',
      'boost-multiplier', 'buy-option-index', 'schedule-minutes'
    ], !ready);
  }

  function setAlphaControlsReady(ready) {
    setDisabled([
      'alpha-run-button', 'alpha-clear-button', 'alpha-target',
      'refresh-button',
      'alpha-sell-slider', 'alpha-buy-min', 'alpha-buy-max', 'alpha-cycle-min',
      'alpha-cycle-max', 'alpha-buy-wait', 'alpha-sell-wait', 'alpha-stable-toggle',
      'alpha-order-monitor-toggle', 'alpha-reverse-toggle', 'alpha-volatility-toggle'
    ], !ready);
  }

  function renderWorkspace() {
    const isBoost = activeWorkspace === 'boost';
    $('boost-workspace').classList.toggle('is-hidden', !isBoost);
    $('alpha-workspace').classList.toggle('is-hidden', isBoost);
    $('workspace-switch').textContent = isBoost ? 'Alpha' : 'Boost';
  }

  function applyPageTheme(pageKind) {
    document.body.classList.toggle('theme-alpha', pageKind === 'alpha');
    document.body.classList.toggle('theme-boost', pageKind !== 'alpha');
  }

  function switchWorkspace() {
    activeWorkspace = activeWorkspace === 'boost' ? 'alpha' : 'boost';
    localStorage.setItem('trade-assistant-workspace', activeWorkspace);
    renderWorkspace();
    if (activeWorkspace !== activePageKind) {
      const name = activeWorkspace === 'alpha' ? 'Binance Alpha' : 'OKX Web3';
      setFooter(`请切换到 ${name} 页面以使用当前工作台`);
    } else if (activeWorkspace === 'alpha') {
      renderAlphaState(currentAlphaState);
    } else {
      renderBoostState(currentBoostState);
    }
  }

  function getBoostPayload() {
    return {
      rebatePercent: $('rebate-percent').value,
      boostDaily: $('boost-daily').value,
      boostMultiplier: $('boost-multiplier').value,
      buyOptionIndex: $('buy-option-index').value,
      scheduleMinutes: $('schedule-minutes').value
    };
  }

  function getAlphaPayload() {
    return {
      target: $('alpha-target').value,
      sellSliderValue: $('alpha-sell-slider').value,
      buySliderMin: $('alpha-buy-min').value,
      buySliderMax: $('alpha-buy-max').value,
      cycleTimeMin: $('alpha-cycle-min').value,
      cycleTimeMax: $('alpha-cycle-max').value,
      buyOrderWaitSec: $('alpha-buy-wait').value,
      sellOrderWaitSec: $('alpha-sell-wait').value,
      stableDetectEnabled: $('alpha-stable-toggle').checked,
      orderMonitorEnabled: $('alpha-order-monitor-toggle').checked,
      reverseOrderEnabled: $('alpha-reverse-toggle').checked,
      volatilityLimitEnabled: $('alpha-volatility-toggle').checked
    };
  }

  function saveBoostSettings(quiet = true) {
    return sendBoost('save-settings', getBoostPayload(), quiet);
  }

  function saveAlphaSettings(quiet = true, renderResponse = false) {
    return sendAlpha('alpha-save-settings', getAlphaPayload(), quiet, renderResponse);
  }

  function scheduleBoostAutosave() {
    window.clearTimeout(boostAutosaveTimerId);
    boostAutosaveTimerId = window.setTimeout(async () => {
      const result = await saveBoostSettings(true);
      if (!result) setFooter('Boost 设置同步失败，请刷新页面后重试', true);
    }, 250);
  }

  function scheduleAlphaAutosave() {
    const revision = ++alphaSettingsRevision;
    alphaSettingsDirty = true;
    window.clearTimeout(alphaAutosaveTimerId);
    alphaAutosaveTimerId = window.setTimeout(async () => {
      const result = await saveAlphaSettings(true, false);
      if (revision !== alphaSettingsRevision) return;
      alphaSettingsDirty = false;
      if (result?.state) renderAlphaState(result.state);
      else setFooter('Alpha 设置同步失败，请刷新页面后重试', true);
    }, 250);
  }

  function friendlyError(error) {
    const message = String(error?.message || error || '无法连接页面交易引擎');
    if (/Receiving end does not exist|Extension context invalidated|message port closed/i.test(message)) {
      return '扩展已更新，请刷新当前页面后重试';
    }
    return message;
  }

  function renderBoostState(state) {
    if (!state) return;
    currentBoostState = state;
    const stats = state.stats || {};
    const fee = stats.feeBreakdown || {};
    const paused = Boolean(state.controls?.tradeStatsPaused);
    const dailyTarget = Number(state.targets?.dailyTarget) || 0;
    const boost = state.boost || {};
    const legacy = Boolean(state.legacyUserscriptDetected);
    const ready = Boolean(state.ready) && !legacy;

    if (activeWorkspace === 'boost') {
      setConnection(ready, legacy ? '检测到旧篡改猴脚本' : state.ready ? '已连接 OKX 页面' : 'OKX 页面引擎加载中');
      $('token-context').textContent = state.token
        ? `${state.token.chainSlug} · ${state.token.tokenAddress.slice(0, 6)}...${state.token.tokenAddress.slice(-4)}`
        : '非代币详情页';
      setBoostControlsReady(ready);
    }

    $('summary-source').textContent = paused ? '统计停止' : stats.sellSyncPending ? '卖出同步中' : stats.boostProgressOfficial ? 'Boost实时' : `08:00订单 ${stats.count || 0}`;
    setMetric('order-history-total', paused ? '--' : formatNumber(stats.orderHistoryTotal));
    setMetric('boost-total', paused ? '--' : formatNumber(stats.officialBoostTotal));
    setMetric('estimated-fee', paused ? '--' : formatSigned(fee.estimatedFee), paused ? 'pending' : 'negative');
    setMetric('actual-rebate', paused ? '--' : formatNumber(fee.actualRebate, 2), Number(fee.actualRebate) > 0 ? 'positive' : '');
    setMetric('net-difference', paused ? '--' : stats.sellSyncPending ? '同步中' : formatSigned(stats.net), paused || stats.sellSyncPending ? 'pending' : toneForValue(stats.net));
    setMetric('rebate-adjusted-wear', paused ? '--' : stats.sellSyncPending ? '同步中' : formatSigned(fee.rebateAdjustedWear), paused || stats.sellSyncPending ? 'pending' : toneForValue(fee.rebateAdjustedWear));
    setMetric('boost-progress', paused ? '已停止' : dailyTarget > 0 ? `${formatNumber(stats.boostProgress, 2)} / ${formatNumber(dailyTarget, 2)}` : formatNumber(stats.boostProgress, 2), !paused && dailyTarget > 0 && Number(stats.boostProgress) >= dailyTarget ? 'positive' : '');

    $('auto-trade-button').textContent = state.auto?.running ? '停止 Boost 交易' : '启动 Boost 交易';
    $('auto-trade-button').classList.toggle('running', Boolean(state.auto?.running));
    $('auto-status').textContent = state.auto?.status || '未启动';
    setMetric('boost-balance', boost.avgBalance === undefined ? '--' : formatNumber(boost.avgBalance, 2), Number(boost.avgBalance) >= 200 ? 'positive' : '');
    setMetric('boost-trading-volume', boost.avgTradingVolume === undefined ? '--' : formatNumber(boost.avgTradingVolume, 2), Number(boost.avgTradingVolume) >= 500 ? 'positive' : '');
    setMetric('boost-rolling-total', boost.rollingTotal === undefined ? '--' : formatNumber(boost.rollingTotal, 2));
    $('boost-expiry').textContent = boost.nextExpiry ? `下次断档：${new Date(boost.nextExpiry.expireAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}` : boost.accountIdAvailable ? 'Boost 记录已同步。' : '访问 Boost 记录页后会自动识别 accountId。';

    if (state.ready && !loadedBoostForm) {
      setInputValue('rebate-percent', state.settings?.rebatePercent, true);
      setInputValue('fixed-percent', state.settings?.fixedInviteRebatePercent, true);
      setInputValue('boost-daily', state.settings?.boostDaily, true);
      setInputValue('boost-multiplier', state.settings?.boostMultiplier, true);
      setInputValue('buy-option-index', state.settings?.buyOptionIndex, true);
      setInputValue('schedule-minutes', state.settings?.scheduleMinutes, true);
      loadedBoostForm = true;
    }
    $('alarm-toggle').checked = Boolean(state.controls?.alarmEnabled);
    $('pause-stats-toggle').checked = paused;
    $('automation-hint').textContent = state.controls?.boostAutomationStatus || '--';
    const scheduled = Number(state.auto?.scheduledRemainingMs) > 0;
    $('schedule-button').textContent = scheduled ? '取消定时' : '开始倒计时';
    $('schedule-status').textContent = scheduled ? `将在 ${Math.ceil(state.auto.scheduledRemainingMs / 1000)} 秒后启动` : '定时启动未设置';
    if (activeWorkspace === 'boost') setFooter(legacy ? '请停用旧篡改猴脚本，避免两个交易引擎同时运行' : state.auto?.status || '准备就绪', legacy);
  }

  function renderAlphaState(state) {
    if (!state) return;
    currentAlphaState = state;
    const stats = state.stats || {};
    const settings = state.settings || {};
    const controls = state.controls || {};
    const legacy = Boolean(state.legacyUserscriptDetected);
    const ready = Boolean(state.ready) && !legacy;

    if (activeWorkspace === 'alpha') {
      setConnection(ready, legacy ? '检测到旧 Alpha 篡改猴脚本' : state.ready ? '已连接 Binance Alpha 页面' : 'Alpha 页面引擎加载中');
      $('token-context').textContent = state.token && state.token !== '--' ? `Binance Alpha · ${state.token}` : '等待 Alpha 代币页面';
      setAlphaControlsReady(ready);
    }

    $('alpha-token').textContent = state.token || '--';
    $('alpha-market-trend').textContent = [state.market?.range, state.market?.direction].filter(Boolean).join(' · ') || '--';
    setMetric('alpha-daily-volume', state.market?.dailyVolume || '--');
    setMetric('alpha-yesterday-volume', state.market?.yesterdayVolume || '--');
    setMetric('alpha-multiplier', state.market?.multiplier || '--', 'positive');
    setMetric('alpha-total', formatNumber(stats.total), '');
    setMetric('alpha-buy', formatNumber(stats.buy), 'positive');
    setMetric('alpha-integral', formatNumber(stats.integral, 0), '');
    setMetric('alpha-wear', stats.wear === null ? '--' : formatSigned(stats.wear), toneForValue(stats.wear));
    $('alpha-run-button').textContent = state.running ? '停止 Alpha 交易' : '启动 Alpha 交易';
    $('alpha-run-button').classList.toggle('running', Boolean(state.running));
    $('alpha-run-status').textContent = legacy ? '请先停用旧 Alpha 篡改猴脚本' : state.status || (state.running ? '自动交易运行中' : '未启动');

    if (state.ready && !loadedAlphaForm) {
      setInputValue('alpha-target', settings.target, true);
      setInputValue('alpha-sell-slider', settings.sellSliderValue, true);
      setInputValue('alpha-buy-min', settings.buySliderMin, true);
      setInputValue('alpha-buy-max', settings.buySliderMax, true);
      setInputValue('alpha-cycle-min', settings.cycleTimeMin, true);
      setInputValue('alpha-cycle-max', settings.cycleTimeMax, true);
      setInputValue('alpha-buy-wait', settings.buyOrderWaitSec, true);
      setInputValue('alpha-sell-wait', settings.sellOrderWaitSec, true);
      loadedAlphaForm = true;
    }
    if (!alphaSettingsDirty) {
      $('alpha-stable-toggle').checked = Boolean(controls.stableDetectEnabled);
      $('alpha-order-monitor-toggle').checked = Boolean(controls.orderMonitorEnabled);
      $('alpha-reverse-toggle').checked = Boolean(controls.reverseOrderEnabled);
      $('alpha-volatility-toggle').checked = Boolean(controls.volatilityLimitEnabled);
    }
    if (activeWorkspace === 'alpha') setFooter(legacy ? '请停用旧 Alpha 篡改猴脚本后再启动扩展' : state.running ? 'Alpha 自动交易运行中' : 'Alpha 工作台已就绪', legacy);
  }

  async function sendToEngine(type, command, payload = {}, quiet = false, renderResponse = true) {
    if (!activeTabId) return null;
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await chrome.tabs.sendMessage(activeTabId, { type, command, payload });
        if (!response?.ok) throw new Error(response?.error || '页面交易引擎未准备好');
        if (response.state && renderResponse) (type === 'ALPHA_VOLUME_EXTENSION_COMMAND' ? renderAlphaState : renderBoostState)(response.state);
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
    }
    if (!quiet) setFooter(friendlyError(lastError), true);
    return null;
  }

  function sendBoost(command, payload, quiet, renderResponse) {
    return sendToEngine('OKX_BOOST_EXTENSION_COMMAND', command, payload, quiet, renderResponse);
  }

  function sendAlpha(command, payload, quiet, renderResponse) {
    return sendToEngine('ALPHA_VOLUME_EXTENSION_COMMAND', command, payload, quiet, renderResponse);
  }

  async function refreshActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTabId = tab?.id || null;
      activePageKind = pageKindFromUrl(tab?.url || '');
      applyPageTheme(activePageKind);
      loadedBoostForm = false;
      loadedAlphaForm = false;
      if (!activePageKind) {
        setConnection(false, '请切换到 OKX 或 Binance Alpha 页面');
        $('token-context').textContent = '当前页面不支持';
        setBoostControlsReady(false);
        setAlphaControlsReady(false);
        setFooter('支持 web3.okx.com、web3.cnouxyex.co 和 Binance Alpha');
        return;
      }

      activeWorkspace = activePageKind;
      localStorage.setItem('trade-assistant-workspace', activeWorkspace);
      renderWorkspace();
      setConnection(false, '正在连接页面交易引擎');
      const ensured = await chrome.runtime.sendMessage({ type: 'OKX_BOOST_ENSURE_ENGINE', tabId: activeTabId });
      if (!ensured?.ok) {
        setFooter(friendlyError(ensured?.error || '无法注入页面交易引擎'), true);
        return;
      }
      if (activePageKind === 'alpha') await sendAlpha('alpha-get-state', {}, true);
      else await sendBoost('get-state', {}, true);
    } catch (error) {
      activeTabId = null;
      activePageKind = null;
      setConnection(false, '扩展连接已中断');
      setBoostControlsReady(false);
      setAlphaControlsReady(false);
      setFooter(friendlyError(error), true);
    }
  }

  function bindEvents() {
    $('workspace-switch').addEventListener('click', switchWorkspace);
    $('refresh-button').addEventListener('click', () => activePageKind === 'alpha' ? sendAlpha('alpha-refresh') : sendBoost('refresh'));
    $('auto-trade-button').addEventListener('click', () => sendBoost('toggle-auto-trade'));
    $('schedule-button').addEventListener('click', () => {
      const scheduled = Number(currentBoostState?.auto?.scheduledRemainingMs) > 0;
      sendBoost(scheduled ? 'cancel-schedule' : 'schedule-auto-trade', scheduled ? {} : { minutes: $('schedule-minutes').value });
    });
    $('alarm-toggle').addEventListener('change', (event) => sendBoost('set-alarm', { enabled: event.target.checked }));
    $('pause-stats-toggle').addEventListener('change', (event) => sendBoost('set-trade-stats-paused', { enabled: event.target.checked }));
    $('open-records-button').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OKX_BOOST_OPEN_RECORDS' }).catch((error) => setFooter(friendlyError(error), true));
    });
    $('alpha-run-button').addEventListener('click', async () => {
      if (!currentAlphaState?.running) {
        const saved = await saveAlphaSettings();
        if (!saved) return;
      }
      sendAlpha('alpha-toggle-run');
    });
    $('alpha-clear-button').addEventListener('click', () => sendAlpha('alpha-clear-records'));
    ['rebate-percent', 'boost-daily', 'boost-multiplier', 'buy-option-index'].forEach((id) => {
      $(id).addEventListener('input', scheduleBoostAutosave);
      $(id).addEventListener('change', scheduleBoostAutosave);
    });
    ['alpha-target', 'alpha-sell-slider', 'alpha-buy-min', 'alpha-buy-max', 'alpha-cycle-min', 'alpha-cycle-max', 'alpha-buy-wait', 'alpha-sell-wait'].forEach((id) => {
      $(id).addEventListener('input', scheduleAlphaAutosave);
      $(id).addEventListener('change', scheduleAlphaAutosave);
    });
    ['alpha-stable-toggle', 'alpha-order-monitor-toggle', 'alpha-reverse-toggle', 'alpha-volatility-toggle'].forEach((id) => {
      $(id).addEventListener('change', scheduleAlphaAutosave);
    });
  }

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (!activeTabId || sender.tab?.id !== activeTabId) return;
    if (message?.type === 'OKX_BOOST_EXTENSION_STATE') renderBoostState(message.state);
    if (message?.type === 'ALPHA_VOLUME_EXTENSION_STATE') renderAlphaState(message.state);
  });

  chrome.tabs.onActivated.addListener(() => refreshActiveTab().catch(() => {}));
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (tabId === activeTabId && changeInfo.status === 'complete') window.setTimeout(() => refreshActiveTab().catch(() => {}), 600);
  });

  bindEvents();
  renderWorkspace();
  refreshActiveTab().catch(() => {});
  window.setInterval(() => {
    if (activePageKind === 'alpha') sendAlpha('alpha-get-state', {}, true);
    if (activePageKind === 'boost') sendBoost('get-state', {}, true);
  }, REFRESH_INTERVAL_MS);
})();

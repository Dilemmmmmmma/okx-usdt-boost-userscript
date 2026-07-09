(() => {
  'use strict';

  const OKX_HOSTS = new Set(['web3.okx.com', 'web3.cnouxyex.co']);
  const REFRESH_INTERVAL_MS = 2500;
  let activeTabId = null;
  let currentState = null;
  let loadedFormState = false;

  const $ = (id) => document.getElementById(id);
  const formIds = [
    'rebate-percent',
    'fixed-percent',
    'boost-daily',
    'boost-multiplier',
    'buy-option-index',
    'schedule-minutes'
  ];

  function isSupportedUrl(url) {
    try {
      return OKX_HOSTS.has(new URL(url).hostname);
    } catch {
      return false;
    }
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
    const el = $(id);
    if (!el) return;
    el.textContent = value;
    el.className = tone ? tone : '';
  }

  function toneForCost(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return number > 0 ? 'positive' : number < 0 ? 'negative' : '';
  }

  function formatCountdown(ms) {
    const total = Math.max(0, Math.ceil(Number(ms) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function formatUtc8(timestamp) {
    const time = Number(timestamp);
    if (!Number.isFinite(time) || time <= 0) return '--';
    const date = new Date(time);
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(date).reduce((result, part) => {
      if (part.type !== 'literal') result[part.type] = part.value;
      return result;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} UTC+8`;
  }

  function setFooter(message, isError = false) {
    const footer = $('footer-status');
    footer.textContent = message;
    footer.style.color = isError ? 'var(--danger)' : '';
  }

  function setInputFromState(id, value, force = false) {
    const input = $(id);
    if (!input || value === undefined || value === null) return;
    if (!force && document.activeElement === input) return;
    input.value = String(value);
  }

  function getFormPayload() {
    return {
      rebatePercent: $('rebate-percent').value,
      boostDaily: $('boost-daily').value,
      boostMultiplier: $('boost-multiplier').value,
      buyOptionIndex: $('buy-option-index').value,
      scheduleMinutes: $('schedule-minutes').value
    };
  }

  function setConnection(connected, message) {
    $('connection-dot').className = `dot${connected ? ' connected' : ' warning'}`;
    $('connection-text').textContent = message;
  }

  function renderState(state) {
    if (!state) return;
    currentState = state;
    const stats = state.stats || {};
    const fee = stats.feeBreakdown || {};
    const paused = Boolean(state.controls?.tradeStatsPaused);
    const dailyTarget = Number(state.targets?.dailyTarget) || 0;
    const boost = state.boost || {};
    const token = state.token;

    setConnection(Boolean(state.ready), state.ready ? '已连接 OKX 页面' : '页面交易引擎加载中');
    $('token-context').textContent = token ? `${token.chainSlug} · ${token.tokenAddress.slice(0, 6)}...${token.tokenAddress.slice(-4)}` : '非代币详情页';
    $('summary-source').textContent = paused
      ? '统计停止'
      : stats.sellSyncPending
        ? '卖出同步中'
        : stats.boostProgressOfficial
          ? 'Boost实时'
          : `08:00订单 ${stats.count || 0}`;

    setMetric('order-history-total', paused ? '--' : formatNumber(stats.orderHistoryTotal));
    setMetric('boost-total', paused ? '--' : formatNumber(stats.officialBoostTotal));
    setMetric('estimated-fee', paused ? '--' : formatSigned(fee.estimatedFee), paused ? 'pending' : 'negative');
    setMetric('actual-rebate', paused ? '--' : formatNumber(fee.actualRebate, 2), paused ? 'pending' : Number(fee.actualRebate) > 0 ? 'positive' : '');
    setMetric('net-difference', paused ? '--' : stats.sellSyncPending ? '同步中' : formatSigned(stats.net), paused || stats.sellSyncPending ? 'pending' : toneForCost(stats.net));
    setMetric('rebate-adjusted-wear', paused ? '--' : stats.sellSyncPending ? '同步中' : formatSigned(fee.rebateAdjustedWear), paused || stats.sellSyncPending ? 'pending' : toneForCost(fee.rebateAdjustedWear));
    const progressText = paused
      ? '已停止'
      : dailyTarget > 0
        ? `${formatNumber(stats.boostProgress, 2)} / ${formatNumber(dailyTarget, 2)}`
        : formatNumber(stats.boostProgress, 2);
    setMetric('boost-progress', progressText, !paused && dailyTarget > 0 && Number(stats.boostProgress) >= dailyTarget ? 'positive' : '');

    const autoButton = $('auto-trade-button');
    autoButton.textContent = state.auto?.running ? '停止自动交易' : '开启自动交易';
    autoButton.classList.toggle('running', Boolean(state.auto?.running));
    $('auto-status').textContent = state.auto?.status || '未启动';

    setMetric('boost-balance', boost.avgBalance === undefined ? '--' : formatNumber(boost.avgBalance, 2), Number(boost.avgBalance) >= 200 ? 'positive' : boost.avgBalance === undefined ? '' : 'negative');
    setMetric('boost-trading-volume', boost.avgTradingVolume === undefined ? '--' : formatNumber(boost.avgTradingVolume, 2), Number(boost.avgTradingVolume) >= 500 ? 'positive' : boost.avgTradingVolume === undefined ? '' : 'negative');
    setMetric('boost-rolling-total', boost.rollingTotal === undefined ? '--' : formatNumber(boost.rollingTotal, 2));
    $('boost-expiry').textContent = boost.nextExpiry
      ? `下次断档：${formatUtc8(boost.nextExpiry.expireAt)} · 到期 ${formatNumber(boost.nextExpiry.tradingVolume, 2)}`
      : boost.accountIdAvailable
        ? 'Boost records 已同步，当前无待补接交易量。'
        : '访问 Boost 记录页后会自动识别 accountId。';

    if (!loadedFormState) {
      setInputFromState('rebate-percent', state.settings?.rebatePercent, true);
      setInputFromState('fixed-percent', state.settings?.fixedInviteRebatePercent, true);
      setInputFromState('boost-daily', state.settings?.boostDaily, true);
      setInputFromState('boost-multiplier', state.settings?.boostMultiplier, true);
      setInputFromState('buy-option-index', state.settings?.buyOptionIndex, true);
      setInputFromState('schedule-minutes', state.settings?.scheduleMinutes, true);
      loadedFormState = true;
    } else {
      setInputFromState('fixed-percent', state.settings?.fixedInviteRebatePercent);
    }

    $('alarm-toggle').checked = Boolean(state.controls?.alarmEnabled);
    $('pause-stats-toggle').checked = paused;
    $('automation-hint').textContent = state.controls?.boostAutomationStatus || '--';
    const scheduled = Number(state.auto?.scheduledRemainingMs) > 0;
    $('schedule-button').textContent = scheduled ? '取消定时' : '开始倒计时';
    $('schedule-status').textContent = scheduled
      ? `将在 ${formatCountdown(state.auto.scheduledRemainingMs)} 后启动自动交易`
      : '定时启动未设置';
    setFooter(state.auto?.status || '准备就绪');
  }

  async function refreshActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab?.id || null;
    loadedFormState = false;
    currentState = null;
    if (!tab || !isSupportedUrl(tab.url || '')) {
      setConnection(false, '请切换到 OKX Web3 页面');
      $('token-context').textContent = '不支持当前页面';
      setFooter('此侧边栏仅在 web3.okx.com 与 web3.cnouxyex.co 上工作');
      return;
    }
    setConnection(false, '正在连接页面交易引擎');
    $('token-context').textContent = '读取代币信息中';
    await sendCommand('get-state', {}, true);
  }

  async function sendCommand(command, payload = {}, quiet = false) {
    if (!activeTabId) {
      if (!quiet) setFooter('请先切换到 OKX Web3 代币页面', true);
      return null;
    }

    try {
      const response = await chrome.tabs.sendMessage(activeTabId, {
        type: 'OKX_BOOST_EXTENSION_COMMAND',
        command,
        payload
      });
      if (!response?.ok) throw new Error(response?.error || '页面交易引擎未准备好');
      if (response.state) renderState(response.state);
      return response;
    } catch (error) {
      if (!quiet) {
        setConnection(false, '未连接页面交易引擎');
        setFooter(error?.message || '请求失败，请刷新 OKX 页面后重试', true);
      }
      return null;
    }
  }

  function bindEvents() {
    $('refresh-button').addEventListener('click', () => sendCommand('refresh'));
    $('auto-trade-button').addEventListener('click', () => sendCommand('toggle-auto-trade'));
    $('save-settings-button').addEventListener('click', () => sendCommand('save-settings', getFormPayload()));
    $('schedule-button').addEventListener('click', () => {
      const scheduled = Number(currentState?.auto?.scheduledRemainingMs) > 0;
      sendCommand(scheduled ? 'cancel-schedule' : 'schedule-auto-trade', scheduled ? {} : { minutes: $('schedule-minutes').value });
    });
    $('alarm-toggle').addEventListener('change', (event) => sendCommand('set-alarm', { enabled: event.target.checked }));
    $('pause-stats-toggle').addEventListener('change', (event) => sendCommand('set-trade-stats-paused', { enabled: event.target.checked }));
    $('open-records-button').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OKX_BOOST_OPEN_RECORDS' }));
  }

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== 'OKX_BOOST_EXTENSION_STATE') return;
    if (!activeTabId || sender.tab?.id !== activeTabId) return;
    renderState(message.state);
  });

  chrome.tabs.onActivated.addListener(() => refreshActiveTab().catch(() => {}));
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (tabId === activeTabId && changeInfo.status === 'complete') {
      window.setTimeout(() => sendCommand('get-state', {}, true), 600);
    }
  });

  bindEvents();
  refreshActiveTab().catch(() => {});
  window.setInterval(() => sendCommand('get-state', {}, true), REFRESH_INTERVAL_MS);
})();

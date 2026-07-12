// ==UserScript==
// @name         OKX Web3 DEX USDT 盈亏计算器 (含 Boost 计算、自动刷新与自动交易) 极简版
// @namespace    http://tampermonkey.net/
// @version      6.69_DefaultKlineCalculator
// @description  使用订单接口统计 USDT 总交易额与净差，默认在K线区域打开USDT计算器，支持定时启动自动交易，并使用官方 Boost records 实时同步总 Boost 交易额与进度
// @author       Dilemmmmmmma
// @match        *://web3.okx.com/*
// @match        *://web3.cnouxyex.co/*
// @homepageURL  https://github.com/Dilemmmmmmma/okx-usdt-boost-userscript
// @supportURL   https://github.com/Dilemmmmmmma/okx-usdt-boost-userscript/issues
// @updateURL    https://raw.githubusercontent.com/Dilemmmmmmma/okx-usdt-boost-userscript/main/OKX-USDT-Boost.user.js
// @downloadURL  https://raw.githubusercontent.com/Dilemmmmmmma/okx-usdt-boost-userscript/main/OKX-USDT-Boost.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // The extension side panel owns the visible UI. This hidden compatibility
    // tree lets the previously proven page-trading engine keep its DOM contract.
    if (window.__OKX_USDT_BOOST_CHROME_ENGINE__) return;
    window.__OKX_USDT_BOOST_CHROME_ENGINE__ = true;

    const ordersMap = new Map();
    let dailyOrderRecordsMap = new Map();
    let activeDailyStatsKey = '';

    let statsIntervalId = null;
    let isAlarmEnabled = false;
    let lastAlarmTime = 0;

    let isAutoTrading = false;
    let autoTradeTimerId = null;
    let autoTradeSide = 'buy';
    let lastSwapFormContainer = null;
    let uiMountRetryId = null;
    let calculatorPanelEl = null;
    let compactPanelHostEl = null;
    let compactPanelToggleEl = null;
    let compactChartContentEl = null;
    let isCompactPanelOpen = true;
    let isCompactPanelAutoOpened = true;
    let isCompactPanelDismissed = false;
    let boostGroupRequestStarted = false;
    let boostMultiplierManuallyEdited = false;
    let lastBoostAutomation = null;
    let activeBoostTokenKey = '';
    let boostAutomationRunId = 0;
    let boostRouteWatchIntervalId = null;
    let oneClickTradeOpenAttempted = false;
    let consecutiveTradeFailures = 0;
    let lastBoostAccountId = '';
    let lastBoostRecords = null;
    let boostRecordsFetchPromise = null;
    let boostRecordsRefreshIntervalId = null;
    let orderHistoryFetchPromise = null;
    let pendingSellOrderSync = null;
    let sellOrderSyncBackgroundTimerId = null;
    let forceSellBeforeStop = false;
    let stopSyncPromise = null;
    let autoTradeRecoveryReloads = 0;
    let isAutoTradeReloading = false;
    let activeTradeExecutorMode = 'instant';
    let isTradeStatsPaused = false;
    let scheduledAutoTradeEndAt = 0;
    let scheduledAutoTradeTimerId = null;

    const LS_KEY_BOOST_DAILY = 'okx_usdt_boost_daily';
    const LS_KEY_BOOST_MULTI = 'okx_usdt_boost_multi';
    const LS_KEY_REBATE_PERCENT = 'okx_usdt_rebate_percent';
    const LS_KEY_DAILY_STATS = 'okx_usdt_daily_order_stats';
    const LS_KEY_BOOST_ACCOUNT_ID = 'okx_usdt_boost_account_id';
    const LS_KEY_BOOST_RECORDS = 'okx_usdt_boost_records';
    const LS_KEY_BOOST_RECORDS_BY_ACCOUNT = 'okx_usdt_boost_records_by_account';
    const LS_KEY_AUTO_TRADE_RESUME = 'okx_usdt_auto_trade_resume';
    const LS_KEY_TRADE_STATS_PAUSED = 'okx_usdt_trade_stats_paused';
    const LS_KEY_AUTO_TRADE_SCHEDULE_END_AT = 'okx_usdt_auto_trade_schedule_end_at';
    const BOOST_RECORDS_REFRESH_INTERVAL_MS = 300000;
    const BOOST_RECORDS_PATH = '/priapi/v1/dapp/boost/records';
    const ORDER_HISTORY_PATH = '/priapi/v1/dx/trade/multi/v2/orderHistory';
    const ORDER_HISTORY_PAGE_SIZE = 20;
    const ORDER_HISTORY_SELL_SYNC_DELAYS_MS = [1000, 2000, 4000, 8000, 12000];
    const ORDER_HISTORY_BACKGROUND_SYNC_INTERVAL_MS = 10000;
    const ORDER_HISTORY_BACKGROUND_SYNC_TIMEOUT_MS = 120000;
    const BOOST_MIN_BALANCE = 200;
    const BOOST_TARGET_AVG_TRADING_VOLUME = 500;
    const BOOST_WINDOW_DAYS = 10;
    const BOOST_RECORD_EXPIRY_DAYS = BOOST_WINDOW_DAYS + 1;
    const BOOST_REFILL_NOTICE_DAYS_BEFORE = 1;
    const DEFAULT_REBATE_PERCENT = 48;
    const FIXED_INVITE_REBATE_PERCENT = 20;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const MAX_CONSECUTIVE_TRADE_FAILURES = 3;
    const TRADE_STATUS_TIMEOUT_MS = 5000;
    const TRADE_SUBMITTED_STATUS_TIMEOUT_MS = 5000;
    const TRADE_NEXT_STEP_COOLDOWN_MS = 2000;
    const TRADE_RETRY_COOLDOWN_MS = 1000;
    const AUTO_TRADE_RESUME_TTL_MS = 5 * 60 * 1000;
    const AUTO_TRADE_RELOAD_DELAY_MS = 800;
    const AUTO_TRADE_RELOAD_RESUME_DELAY_MS = 2500;
    const MAX_AUTO_TRADE_RELOAD_RECOVERIES = 3;

    let lastStats = {
        buy: 0,
        sell: 0,
        total: 0,
        net: 0,
        count: 0
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function isVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);
    }

    function normalizeText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function parseAmountText(text) {
        const raw = String(text || '').replace(/,/g, '');
        const match = raw.match(/-?\d+(?:\.\d+)?\s*([kKmMbB万亿])?/);
        if (!match) return null;

        let value = parseFloat(match[0]);
        if (Number.isNaN(value)) return null;

        const suffix = (match[1] || '').toUpperCase();
        if (suffix === 'K') value *= 1000;
        if (suffix === 'M') value *= 1000000;
        if (suffix === 'B') value *= 1000000000;
        if (suffix === '万') value *= 10000;
        if (suffix === '亿') value *= 100000000;

        return value;
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function createEmptyStats(count = 0) {
        return {
            buy: 0,
            sell: 0,
            total: 0,
            orderHistoryTotal: 0,
            net: 0,
            boostProgress: 0,
            boostSnapshotCount: 0,
            boostProgressFallback: false,
            boostProgressOfficial: false,
            officialBoostTotal: null,
            officialBoostProgress: null,
            officialBoostUpdatedAt: 0,
            projectedWear: null,
            feeBreakdown: null,
            count
        };
    }

    function cloneStats(stats) {
        return {
            ...createEmptyStats(Number(stats && stats.count) || 0),
            ...(stats || {})
        };
    }

    function createPausedTradeStats() {
        return {
            ...createEmptyStats(0),
            tradeStatsPaused: true
        };
    }

    function hasSellOrderSynced(stats, baselineStats) {
        if (!stats || !baselineStats) return false;
        return (Number(stats.sell) || 0) > (Number(baselineStats.sell) || 0) + 0.000001;
    }

    function getDailyStatsWindow(now = new Date()) {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0, 0);
        if (now.getTime() < start.getTime()) {
            start.setDate(start.getDate() - 1);
        }

        const end = new Date(start.getTime());
        end.setDate(end.getDate() + 1);

        const key = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}-08`;
        return { key, startMs: start.getTime(), endMs: end.getTime() };
    }

    function loadDailyOrderRecords(windowInfo = getDailyStatsWindow()) {
        if (activeDailyStatsKey === windowInfo.key) return;

        activeDailyStatsKey = windowInfo.key;
        dailyOrderRecordsMap = new Map();

        try {
            const raw = window.localStorage.getItem(LS_KEY_DAILY_STATS);
            const saved = raw ? JSON.parse(raw) : null;

            if (!saved || saved.key !== windowInfo.key || !Array.isArray(saved.orders)) {
                window.localStorage.setItem(LS_KEY_DAILY_STATS, JSON.stringify({
                    key: windowInfo.key,
                    startMs: windowInfo.startMs,
                    endMs: windowInfo.endMs,
                    orders: []
                }));
                return;
            }

            saved.orders.forEach(([orderId, record]) => {
                if (!orderId || !record) return;
                dailyOrderRecordsMap.set(String(orderId), {
                    buy: parseFloat(record.buy || 0) || 0,
                    sell: parseFloat(record.sell || 0) || 0,
                    time: parseInt(record.time, 10) || 0,
                    boostMultiplier: parseFloat(record.boostMultiplier || 0) || 0,
                    boostDaily: parseFloat(record.boostDaily || 0) || 0,
                    boostTarget: parseFloat(record.boostTarget || 0) || 0,
                    boostTokenKey: String(record.boostTokenKey || '')
                });
            });
        } catch (err) {
            console.error('[USDT计算器] 读取每日统计缓存失败', err);
        }
    }

    function saveDailyOrderRecords(windowInfo = getDailyStatsWindow()) {
        try {
            window.localStorage.setItem(LS_KEY_DAILY_STATS, JSON.stringify({
                key: windowInfo.key,
                startMs: windowInfo.startMs,
                endMs: windowInfo.endMs,
                orders: Array.from(dailyOrderRecordsMap.entries())
            }));
        } catch (err) {
            console.error('[USDT计算器] 保存每日统计缓存失败', err);
        }
    }

    function normalizeOrderTimeMs(order) {
        const raw = Number(order && order.createTime);
        if (!Number.isFinite(raw) || raw <= 0) return 0;
        return raw < 1000000000000 ? raw * 1000 : raw;
    }

    function getCurrentBoostSnapshot() {
        const dailyInput = document.getElementById('boost-daily');
        const multiInput = document.getElementById('boost-multi');
        const daily = parseFloat(dailyInput && dailyInput.value);
        const multiplier = parseFloat(multiInput && multiInput.value);
        const boostDaily = Number.isFinite(daily) && daily > 0 ? daily : 0;
        const boostMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 0;
        const boostTarget = boostDaily > 0 && boostMultiplier > 0
            ? (boostDaily / boostMultiplier) * BOOST_WINDOW_DAYS
            : 0;

        return {
            boostDaily,
            boostMultiplier,
            boostTarget,
            boostTokenKey: activeBoostTokenKey || ''
        };
    }

    function getCurrentBoostDailyTarget() {
        const snapshot = getCurrentBoostSnapshot();
        return snapshot.boostDaily;
    }

    function getWeightedBoostProgressStats(stats = lastStats) {
        const target = getCurrentBoostDailyTarget();
        const officialProgress = Number(stats && stats.officialBoostProgress);
        const progress = Number.isFinite(officialProgress)
            ? officialProgress
            : (Number(stats && stats.boostProgress) || 0);
        const percentage = Number.isFinite(target) && target > 0
            ? progress / target * 100
            : 0;

        return {
            progress,
            target,
            percentage,
            reached: Number.isFinite(target) && target > 0 && progress >= target
        };
    }

    function getRecordBoostMultiplier(record) {
        const multiplier = parseFloat(record && record.boostMultiplier);
        if (Number.isFinite(multiplier) && multiplier > 0) return multiplier;
        return 0;
    }

    function getRecordUsdtVolume(record) {
        if (!record) return 0;
        return (parseFloat(record.buy || 0) || 0) + (parseFloat(record.sell || 0) || 0);
    }

    function playAlertSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.type = 'square';
            osc1.frequency.value = 800;
            gain1.gain.value = 0.1;
            osc1.start();
            setTimeout(() => { osc1.stop(); }, 200);

            setTimeout(() => {
                const osc2 = ctx.createOscillator();
                const gain2 = ctx.createGain();
                osc2.connect(gain2);
                gain2.connect(ctx.destination);
                osc2.type = 'square';
                osc2.frequency.value = 1000;
                gain2.gain.value = 0.1;
                osc2.start();
                setTimeout(() => { osc2.stop(); }, 200);
            }, 300);
            setTimeout(() => {
                try {
                    if (typeof ctx.close === 'function') Promise.resolve(ctx.close()).catch(() => {});
                } catch {}
            }, 700);
        } catch(e) {
            console.error('[USDT计算器] 音频播放失败', e);
        }
    }

    function getDetailPanelTarget(root) {
        if (!root) return null;
        return root.querySelector('.dex-tabs-panel.dex-tabs-panel-show, [role="tabpanel"][aria-hidden="false"], [role="tabpanel"]') || root;
    }

    function findCalculatorMountTarget() {
        const modules = Array.from(document.querySelectorAll('.fspG_T__dex.dd-module, [class*="fspG_T"][class*="dd-module"]'))
            .filter(isVisible);
        const matchedModule = modules.find((module) => {
            return module.querySelector('[data-pane-id="info"]') &&
                normalizeText(module.innerText || module.textContent).includes('Top 10');
        }) || modules[0];

        if (matchedModule) return getDetailPanelTarget(matchedModule);

        const infoTabs = Array.from(document.querySelectorAll('[data-pane-id="info"], [role="tab"], .dex-tabs-pane'))
            .filter(isVisible)
            .filter((tab) => normalizeText(tab.innerText || tab.textContent) === '详情');

        for (const infoTab of infoTabs) {
            const tabList = infoTab.closest('[role="tablist"], .dex-tabs-pane-list, [class*="dex-tabs-pane-list"]');
            const tabListText = normalizeText(tabList && (tabList.innerText || tabList.textContent));
            if (tabList && !tabListText.includes('同名代币')) continue;

            const tabsRoot = infoTab.closest('.dex-tabs');
            if (tabsRoot) {
                const rootText = normalizeText(tabsRoot.innerText || tabsRoot.textContent);
                if (rootText.includes('详情') && rootText.includes('同名代币')) return getDetailPanelTarget(tabsRoot);
            }

            let node = infoTab.parentElement;
            while (node && node !== document.body) {
                const nodeText = normalizeText(node.innerText || node.textContent);
                if (nodeText.includes('详情') && nodeText.includes('同名代币') && nodeText.includes('Top 10')) {
                    return getDetailPanelTarget(node);
                }
                node = node.parentElement;
            }
        }

        return null;
    }

    function findCompactChartElements() {
        const overlay = document.getElementById('global-chart-overlay');
        if (overlay && isVisible(overlay)) {
            const iframe = overlay.querySelector('iframe[src^="blob:"], iframe');
            if (iframe) {
                let content = iframe;
                while (content.parentElement && content.parentElement !== overlay) {
                    const parent = content.parentElement;
                    const parentText = normalizeText(parent.innerText || parent.textContent);
                    const hasToolbarSetting = parent.querySelector('button i[class*="setting"]');
                    if (hasToolbarSetting || parentText.includes('技术指标') || parentText.includes('显示设置')) {
                        return { overlay, shell: parent, content, mode: 'iframe' };
                    }
                    content = parent;
                }

                return { overlay, shell: overlay, content: iframe.parentElement || iframe, mode: 'iframe' };
            }
        }

        const compactOverlay = document.querySelector('[class*="PCZxMT"]');
        if (!compactOverlay || !isVisible(compactOverlay)) return null;

        const shell = compactOverlay.firstElementChild || compactOverlay;
        const content = shell.firstElementChild || shell;
        if (content === compactOverlay) return null;

        return { overlay: compactOverlay, shell, content, mode: 'lightweight' };
    }

    function restoreCompactChartContent() {
        if (compactChartContentEl && compactChartContentEl.dataset.okxCalcPreviousDisplay !== undefined) {
            compactChartContentEl.style.display = compactChartContentEl.dataset.okxCalcPreviousDisplay;
            delete compactChartContentEl.dataset.okxCalcPreviousDisplay;
            delete compactChartContentEl.dataset.okxCalcPreviousHeight;
        }

        if (compactPanelHostEl) compactPanelHostEl.style.display = 'none';
        compactChartContentEl = null;
    }

    function ensureCompactPanelHost() {
        const chart = findCompactChartElements();
        if (!chart) return null;

        if (compactChartContentEl && compactChartContentEl !== chart.content) {
            restoreCompactChartContent();
        }

        compactChartContentEl = chart.content;
        if (compactChartContentEl.dataset.okxCalcPreviousDisplay === undefined) {
            compactChartContentEl.dataset.okxCalcPreviousDisplay = compactChartContentEl.style.display || '';
            compactChartContentEl.dataset.okxCalcPreviousHeight = String(compactChartContentEl.getBoundingClientRect().height || 0);
        }
        compactChartContentEl.style.display = 'none';

        if (!compactPanelHostEl || compactPanelHostEl.parentElement !== chart.shell) {
            if (compactPanelHostEl) compactPanelHostEl.remove();
            compactPanelHostEl = document.createElement('div');
            compactPanelHostEl.id = 'okx-usdt-compact-host';
            chart.shell.appendChild(compactPanelHostEl);
        }

        compactPanelHostEl.style.cssText = `
            display: block;
            height: ${Math.max(parseFloat(compactChartContentEl.dataset.okxCalcPreviousHeight || '0') || 0, 420)}px;
            padding: 12px clamp(12px, 2vw, 24px);
            overflow: auto;
            box-sizing: border-box;
            background: #0e0e0e;
        `;
        return compactPanelHostEl;
    }

    function updateCompactPanelToggleState() {
        if (!compactPanelToggleEl) return;
        compactPanelToggleEl.title = isCompactPanelOpen ? '返回K线' : '打开USDT计算器';
        compactPanelToggleEl.setAttribute('aria-label', compactPanelToggleEl.title);
        compactPanelToggleEl.style.color = isCompactPanelOpen ? '#a5ff00' : '';
    }

    function toggleCompactPanel() {
        isCompactPanelOpen = !isCompactPanelOpen;
        isCompactPanelAutoOpened = false;
        isCompactPanelDismissed = !isCompactPanelOpen;
        mountCalculatorPanel(calculatorPanelEl);
    }

    function ensureCompactPanelToggle() {
        const chart = findCompactChartElements();
        if (!chart) return false;

        const nativeSettingButton = Array.from(chart.shell.querySelectorAll('button'))
            .find((button) => button.id !== 'okx-usdt-compact-toggle' && button.querySelector('i[class*="setting"]'));
        const mountTarget = nativeSettingButton && nativeSettingButton.parentElement && nativeSettingButton.parentElement.parentElement
            ? nativeSettingButton.parentElement.parentElement
            : chart.overlay;
        if (!mountTarget) return false;

        if (!compactPanelToggleEl) {
            compactPanelToggleEl = document.createElement('button');
            compactPanelToggleEl.id = 'okx-usdt-compact-toggle';
            compactPanelToggleEl.type = 'button';
            compactPanelToggleEl.className = 'dex-plain-button d9ndgX__dex XQIezD__dex';
            compactPanelToggleEl.innerHTML = '<i class="icon iconfont dex-okx-defi-setting E3QMRY__dex" role="img" aria-hidden="true" style="font-size: 16px;"></i>';
            compactPanelToggleEl.addEventListener('click', toggleCompactPanel);
        }

        compactPanelToggleEl.style.cssText = nativeSettingButton ? `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            margin-left: 6px;
            cursor: pointer;
        ` : `
            position: absolute;
            top: 12px;
            right: 112px;
            z-index: 1006;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            padding: 0;
            cursor: pointer;
            color: #b6b6b6;
            background: #202020;
            border: 1px solid #303030;
            border-radius: 4px;
        `;
        if (!nativeSettingButton && window.getComputedStyle(chart.overlay).position === 'static') {
            chart.overlay.style.position = 'relative';
        }

        if (compactPanelToggleEl.parentElement !== mountTarget) {
            mountTarget.appendChild(compactPanelToggleEl);
        }
        updateCompactPanelToggleState();
        return true;
    }

    function applyPanelLayout(panel) {
        panel.classList.remove('okx-calc-compact-mode');
        panel.style.cssText = `
            position: relative;
            width: 100%;
            margin-top: 12px;
            padding-top: 12px;
            background: transparent;
            color: #e6e6e6;
            border-top: 1px solid #252525;
            font-family: inherit;
            font-size: 12px;
            line-height: 16px;
            box-sizing: border-box;
        `;
    }

    function applyCompactPanelLayout(panel) {
        panel.classList.add('okx-calc-compact-mode');
        panel.style.cssText = `
            position: relative;
            width: 100%;
            max-width: none;
            margin: 0;
            padding: 0;
            background: transparent;
            color: #e6e6e6;
            border-top: 0;
            font-family: inherit;
            font-size: 12px;
            line-height: 16px;
            box-sizing: border-box;
        `;
    }

    function appendPanelIfNeeded(panel, target) {
        if (!panel || !target) return false;
        if (panel.parentElement !== target) {
            target.appendChild(panel);
        }
        return true;
    }

    function mountCalculatorPanel(panel) {
        if (!panel) return false;
        const detailTarget = findCalculatorMountTarget();
        ensureCompactPanelToggle();

        if (!detailTarget && !isCompactPanelOpen && !isCompactPanelDismissed) {
            isCompactPanelOpen = true;
            isCompactPanelAutoOpened = true;
        }

        if (isCompactPanelOpen) {
            const compactTarget = ensureCompactPanelHost();
            if (compactTarget) {
                applyCompactPanelLayout(panel);
                appendPanelIfNeeded(panel, compactTarget);
                updateCompactPanelToggleState();
                return true;
            }
        }

        restoreCompactChartContent();
        if (!detailTarget) {
            panel.remove();
            updateCompactPanelToggleState();
            return false;
        }

        applyPanelLayout(panel);
        appendPanelIfNeeded(panel, detailTarget);
        updateCompactPanelToggleState();
        return true;
    }

    function watchCalculatorMountTarget() {
        if (!document.documentElement) return;

        const ensureMounted = () => {
            ensureCompactPanelToggle();

            if (!calculatorPanelEl) {
                createUI();
                return;
            }

            mountCalculatorPanel(calculatorPanelEl);
        };

        if (!uiMountRetryId) {
            uiMountRetryId = setInterval(ensureMounted, 1000);
        }
    }

    function createUI() {
        if (calculatorPanelEl) {
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'okx-usdt-calculator';
        calculatorPanelEl = panel;

        panel.innerHTML = `
            <style>
                #okx-usdt-calculator .okx-calc-section {
                    padding-bottom: 12px;
                    margin-bottom: 12px;
                    border-bottom: 1px solid #252525;
                }
                #okx-usdt-calculator .okx-calc-section:last-child {
                    padding-bottom: 0;
                    margin-bottom: 0;
                    border-bottom: 0;
                }
                #okx-usdt-calculator .okx-calc-heading,
                #okx-usdt-calculator .okx-calc-row {
                    display: flex;
                    align-items: center;
                }
                #okx-usdt-calculator .okx-calc-heading {
                    justify-content: space-between;
                    gap: 8px;
                    margin-bottom: 8px;
                    color: #e6e6e6;
                    font-size: 12px;
                    font-weight: 500;
                    line-height: 16px;
                }
                #okx-usdt-calculator .okx-calc-row {
                    justify-content: space-between;
                    gap: 8px;
                    min-height: 20px;
                    color: #909090;
                    font-size: 12px;
                    line-height: 16px;
                }
                #okx-usdt-calculator .okx-calc-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 6px;
                    margin-bottom: 8px;
                }
                #okx-usdt-calculator .okx-calc-grid-3 {
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                }
                #okx-usdt-calculator .okx-calc-muted,
                #okx-usdt-calculator label,
                #okx-usdt-calculator .okx-calc-status {
                    color: #909090;
                    font-size: 11px;
                    line-height: 16px;
                }
                #okx-usdt-calculator label {
                    display: block;
                }
                #okx-usdt-calculator .okx-calc-value {
                    color: #e6e6e6;
                    font-weight: 500;
                    text-align: right;
                }
                #okx-usdt-calculator .okx-calc-buy { color: #a5ff00; }
                #okx-usdt-calculator .okx-calc-danger { color: #fc46ab; }
                #okx-usdt-calculator .okx-calc-note {
                    color: #909090;
                    font-size: 11px;
                    line-height: 16px;
                }
                #okx-usdt-calculator .okx-calc-link {
                    cursor: pointer;
                    text-decoration: none;
                }
                #okx-usdt-calculator .okx-calc-link:hover {
                    color: #e6e6e6 !important;
                }
                #okx-usdt-calculator input[type="number"] {
                    width: 100%;
                    height: 28px;
                    padding: 0 8px;
                    box-sizing: border-box;
                    border: 1px solid #303030;
                    border-radius: 4px;
                    outline: none;
                    background: #202020;
                    color: #e6e6e6;
                    font-family: inherit;
                    font-size: 12px;
                }
                #okx-usdt-calculator input[type="number"]:focus {
                    border-color: #666666;
                }
                #okx-usdt-calculator input[type="number"]:disabled {
                    color: #909090;
                    background: #181818;
                    cursor: not-allowed;
                }
                #okx-usdt-calculator input[type="checkbox"] {
                    width: 13px;
                    height: 13px;
                    margin: 0;
                    accent-color: #a5ff00;
                    cursor: pointer;
                }
                #okx-usdt-calculator .okx-calc-action {
                    min-height: 28px;
                    padding: 0 10px;
                    border: 0;
                    border-radius: 4px;
                    background: #202020;
                    color: #e6e6e6;
                    cursor: pointer;
                    font-family: inherit;
                    font-size: 12px;
                    font-weight: 500;
                }
                #okx-usdt-calculator .okx-calc-action:hover {
                    background: #292929;
                }
                #okx-usdt-calculator .okx-calc-action-primary {
                    width: 100%;
                    background: #a5ff00;
                    color: #0e0e0e;
                }
                #okx-usdt-calculator .okx-calc-action-primary:hover {
                    background: #b5ff33;
                }
                #okx-usdt-calculator .okx-calc-alarm {
                    color: #909090;
                    font-weight: 500;
                    cursor: pointer;
                }
                #okx-usdt-calculator .okx-calc-alarm:hover {
                    color: #e6e6e6;
                }
                #okx-usdt-calculator .okx-calc-alarm.is-enabled {
                    color: #a5ff00;
                }
                #okx-usdt-calculator .okx-calc-alarm input {
                    display: none;
                }
                #okx-usdt-calculator .okx-calc-status {
                    min-height: 16px;
                    margin-top: 6px;
                }
                #okx-usdt-calculator.okx-calc-compact-mode {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 12px 22px;
                    align-items: start;
                }
                #okx-usdt-calculator.okx-calc-compact-mode .okx-calc-section {
                    min-width: 0;
                    padding-bottom: 0;
                    margin-bottom: 0;
                    border-bottom: 0;
                }
                #okx-usdt-calculator.okx-calc-compact-mode .okx-calc-heading {
                    margin-bottom: 6px;
                }
                #okx-usdt-calculator.okx-calc-compact-mode .okx-calc-row {
                    min-height: 18px;
                    line-height: 15px;
                }
                #okx-usdt-calculator.okx-calc-compact-mode .okx-calc-note,
                #okx-usdt-calculator.okx-calc-compact-mode .okx-calc-muted,
                #okx-usdt-calculator.okx-calc-compact-mode label,
                #okx-usdt-calculator.okx-calc-compact-mode .okx-calc-status {
                    line-height: 15px;
                }
                #okx-usdt-calculator.okx-calc-compact-mode input[type="number"] {
                    height: 26px;
                }
                #okx-usdt-calculator.okx-calc-compact-mode .okx-calc-action {
                    min-height: 26px;
                }
                @media (max-width: 560px) {
                    #okx-usdt-calculator.okx-calc-compact-mode {
                        grid-template-columns: repeat(auto-fit, minmax(205px, 1fr));
                        gap: 10px 14px;
                    }
                    #okx-usdt-calculator.okx-calc-compact-mode .okx-calc-grid {
                        gap: 5px;
                    }
                }
            </style>

            <div class="okx-calc-section">
                <div class="okx-calc-heading">
                    <span>USDT 交易统计(Boost榜无返佣)</span>
                    <span id="summary-source-status" class="okx-calc-muted">读取中</span>
                </div>
                <div class="okx-calc-row"><span title="订单历史当前 08:00 周期内 USDT 买入+卖出累计">总交易额</span><span id="order-history-volume" class="okx-calc-value">0.0000</span></div>
                <div class="okx-calc-row"><span title="官方 Boost records 今日 tradingVolume">总Boost交易额</span><span id="usdt-volume" class="okx-calc-value">0.0000</span></div>
                <div class="okx-calc-row"><span title="-(实际需刷量 × 未加成基础倍数% × (1 - 固定返利20%))">预估手续费</span><span id="usdt-estimated-wear" class="okx-calc-value">--</span></div>
                <div class="okx-calc-row"><span title="总Boost交易额 / Boost倍数 × (返佣比例 - 固定返利20%) × 未加成基础倍数%">实际返佣</span><span id="usdt-estimated-rebate" class="okx-calc-value">--</span></div>
                <div class="okx-calc-row"><span>USDT 净差</span><span id="usdt-net" class="okx-calc-value">0.0000</span></div>
                <div class="okx-calc-row"><span title="USDT净差 + 当前交易量对应的实际返佣">返佣后磨损</span><span id="usdt-rebate-adjusted-wear" class="okx-calc-value">--</span></div>
                <div class="okx-calc-row"><span title="官方 Boost 记录当日交易量 / 10；接口异常时回退到本地订单估算">Boost交易量进度</span><span id="boost-weighted-progress" class="okx-calc-value">0.00</span></div>
                <button id="btn-auto-trade" class="okx-calc-action okx-calc-action-primary">启动 Boost 交易</button>
                <div id="auto-trade-status" class="okx-calc-status">未启动</div>
            </div>

            <div class="okx-calc-section">
                <div class="okx-calc-heading">
                    <span>Boost 数据记录</span>
                    <a id="boost-records-status" class="okx-calc-muted okx-calc-link" href="https://web3.okx.com/zh-hans/boost/records" target="_blank" rel="noopener noreferrer" title="在新标签页打开 Boost 记录页">请访问 Boost 记录页</a>
                </div>
                <div class="okx-calc-row"><span>Boost 余额</span><span id="boost-record-balance" class="okx-calc-value">--</span></div>
                <div class="okx-calc-row"><span>Boost 交易量</span><span id="boost-record-volume" class="okx-calc-value">--</span></div>
                <div id="boost-record-expiry" class="okx-calc-note"></div>
            </div>

            <div class="okx-calc-section">
                <div class="okx-calc-heading"><span>设置</span></div>
                <div class="okx-calc-grid">
                    <label>
                        返佣比例(%)
                        <input type="number" step="0.01" min="0" id="rebate-percent" value="48">
                    </label>
                    <label>
                        固定比例(%)
                        <input type="number" id="fixed-invite-rebate" value="20" disabled>
                    </label>
                    <label>
                        日均交易量
                        <input type="number" id="boost-daily" value="500">
                    </label>
                    <label>
                        Boost 倍数
                        <input type="number" step="0.01" id="boost-multi" value="0.12">
                    </label>
                    <label title="按顺序选择买入快捷按钮">
                        买入序号
                        <input type="number" min="1" step="1" id="buy-option-index" value="3">
                    </label>
                        <label title="倒计时结束后自动启动 Boost 交易">
                        定时启动(分钟)
                        <input type="number" min="1" step="1" id="auto-trade-delay-minutes" value="10">
                    </label>
                </div>
                <div id="boost-auto-status" class="okx-calc-muted" style="margin-bottom: 6px;">自动识别中</div>
                <div class="okx-calc-row">
                    <span id="auto-trade-schedule-status" class="okx-calc-muted">定时启动未设置</span>
                    <button id="btn-schedule-auto-trade" type="button" class="okx-calc-action">开始倒计时</button>
                </div>
                <div class="okx-calc-row">
                    <span class="okx-calc-muted">达到目标后提示并停止</span>
                    <label id="alarm-toggle-label" class="okx-calc-alarm" title="当官方 Boost records 今日 tradingVolume / 10 达到日均目标时发出提示音">
                        <input type="checkbox" id="enable-alarm">
                        <span id="alarm-toggle-text">开启达量警报</span>
                    </label>
                </div>
            </div>
        `;

        panel.classList.add('okx-extension-engine-ui');
        panel.style.cssText = 'display:none !important; visibility:hidden !important; pointer-events:none !important;';
        document.documentElement.appendChild(panel);

        document.getElementById('enable-alarm').addEventListener('change', (e) => {
            isAlarmEnabled = e.target.checked;
            updateAlarmToggleState();
            if (isAlarmEnabled) playAlertSound();
        });
        document.getElementById('btn-auto-trade').addEventListener('click', toggleAutoTrade);
        document.getElementById('btn-schedule-auto-trade').addEventListener('click', toggleScheduledAutoTrade);
        document.getElementById('boost-daily').addEventListener('input', calculateBoost);
        document.getElementById('boost-multi').addEventListener('input', () => {
            boostMultiplierManuallyEdited = true;
            calculateBoost();
            updateBoostAutomationStatus(`手动倍数 ${document.getElementById('boost-multi').value}`);
        });
        document.getElementById('rebate-percent').addEventListener('input', () => {
            saveRebateSettings();
            calculateStats();
        });

        loadBoostSettings();
        loadRebateSettings();
        clearLegacyTradeStatsPauseSetting();
        loadBoostRecordsCache();
        renderBoostRecords();
        refreshBoostRecordsFromCache();
        calculateBoost();
        calculateStats();
        updateAlarmToggleState();
        watchTokenUrlForBoost();
        if (!statsIntervalId) statsIntervalId = setInterval(calculateStats, 1000);
        if (!boostRecordsRefreshIntervalId) {
            boostRecordsRefreshIntervalId = setInterval(refreshBoostRecordsFromCache, BOOST_RECORDS_REFRESH_INTERVAL_MS);
        }
        const resumedAfterReload = resumeAutoTradeAfterReload();
        loadScheduledAutoTrade();
        if (resumedAfterReload && scheduledAutoTradeEndAt) clearScheduledAutoTrade('网页恢复自动交易，已取消定时启动');
        startExtensionStateBridge();
    }

    function hasVisibleLegacyUserscriptPanel() {
        return Array.from(document.querySelectorAll('#okx-usdt-calculator'))
            .some((panel) => panel !== calculatorPanelEl && isVisible(panel));
    }

    function loadBoostSettings() {
        const dailyInput = document.getElementById('boost-daily');
        const multiInput = document.getElementById('boost-multi');
        const savedDaily = window.localStorage.getItem(LS_KEY_BOOST_DAILY);
        const savedMulti = window.localStorage.getItem(LS_KEY_BOOST_MULTI);

        if (dailyInput && savedDaily !== null && savedDaily !== '') dailyInput.value = savedDaily;
        if (multiInput && savedMulti !== null && savedMulti !== '') multiInput.value = savedMulti;
    }

    function saveBoostSettings(dailyVal, multiVal) {
        window.localStorage.setItem(LS_KEY_BOOST_DAILY, String(dailyVal));
        window.localStorage.setItem(LS_KEY_BOOST_MULTI, String(multiVal));
    }

    function loadRebateSettings() {
        const rebateInput = document.getElementById('rebate-percent');
        if (!rebateInput) return;

        const savedRebate = window.localStorage.getItem(LS_KEY_REBATE_PERCENT);
        if (savedRebate !== null && savedRebate !== '') {
            rebateInput.value = savedRebate;
        } else {
            rebateInput.value = String(DEFAULT_REBATE_PERCENT);
        }
    }

    function saveRebateSettings() {
        const rebateInput = document.getElementById('rebate-percent');
        if (!rebateInput) return;
        window.localStorage.setItem(LS_KEY_REBATE_PERCENT, String(rebateInput.value));
    }

    function clearLegacyTradeStatsPauseSetting() {
        isTradeStatsPaused = false;
        window.localStorage.removeItem(LS_KEY_TRADE_STATS_PAUSED);
    }

    function updateBoostAutomationStatus(message, color = '#909090') {
        const status = document.getElementById('boost-auto-status');
        if (!status) return;
        status.textContent = message;
        status.style.color = color;
    }

    function updateScheduledAutoTradeStatus(message, color = '#909090') {
        const status = document.getElementById('auto-trade-schedule-status');
        if (!status) return;
        status.textContent = message;
        status.style.color = color;
    }

    function setScheduledAutoTradeButton(active) {
        const btn = document.getElementById('btn-schedule-auto-trade');
        if (!btn) return;

        btn.textContent = active ? '取消定时' : '开始倒计时';
        btn.style.color = active ? '#fc46ab' : '#e6e6e6';
        btn.style.background = active ? '#351520' : '#202020';
    }

    function clearScheduledAutoTrade(message = '定时启动未设置') {
        if (scheduledAutoTradeTimerId) {
            clearTimeout(scheduledAutoTradeTimerId);
            scheduledAutoTradeTimerId = null;
        }

        scheduledAutoTradeEndAt = 0;
        window.localStorage.removeItem(LS_KEY_AUTO_TRADE_SCHEDULE_END_AT);
        setScheduledAutoTradeButton(false);
        if (message !== null) updateScheduledAutoTradeStatus(message);
    }

    function formatScheduledCountdown(ms) {
        const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
        return `${minutes}:${pad2(seconds)}`;
    }

    function refreshScheduledAutoTradeCountdown() {
        if (scheduledAutoTradeTimerId) {
            clearTimeout(scheduledAutoTradeTimerId);
            scheduledAutoTradeTimerId = null;
        }

        if (!scheduledAutoTradeEndAt) {
            clearScheduledAutoTrade();
            return;
        }

        if (isAutoTrading) {
            clearScheduledAutoTrade('自动交易已运行，定时已取消');
            return;
        }

        const remainingMs = scheduledAutoTradeEndAt - Date.now();
        if (remainingMs <= 0) {
            scheduledAutoTradeEndAt = 0;
            window.localStorage.removeItem(LS_KEY_AUTO_TRADE_SCHEDULE_END_AT);
            setScheduledAutoTradeButton(false);
            updateScheduledAutoTradeStatus('倒计时结束，正在启动自动交易', '#a5ff00');
            startAutoTrade('定时启动到点，准备买入', { fromSchedule: true });
            return;
        }

        setScheduledAutoTradeButton(true);
        updateScheduledAutoTradeStatus(`剩余 ${formatScheduledCountdown(remainingMs)}`, '#a5ff00');
        scheduledAutoTradeTimerId = setTimeout(refreshScheduledAutoTradeCountdown, 1000);
    }

    function startScheduledAutoTradeCountdown() {
        if (isAutoTrading) {
            clearScheduledAutoTrade('自动交易已运行，无需定时启动');
            return;
        }

        const input = document.getElementById('auto-trade-delay-minutes');
        const minutes = parseFloat(input && input.value);
        if (!Number.isFinite(minutes) || minutes <= 0) {
            updateScheduledAutoTradeStatus('请输入大于 0 的分钟数', '#fc46ab');
            return;
        }

        scheduledAutoTradeEndAt = Date.now() + minutes * 60 * 1000;
        window.localStorage.setItem(LS_KEY_AUTO_TRADE_SCHEDULE_END_AT, String(scheduledAutoTradeEndAt));
        refreshScheduledAutoTradeCountdown();
    }

    function toggleScheduledAutoTrade() {
        if (scheduledAutoTradeEndAt) {
            clearScheduledAutoTrade('定时启动已取消');
            return;
        }

        startScheduledAutoTradeCountdown();
    }

    function loadScheduledAutoTrade() {
        const savedEndAt = Number(window.localStorage.getItem(LS_KEY_AUTO_TRADE_SCHEDULE_END_AT));
        if (!Number.isFinite(savedEndAt) || savedEndAt <= 0) {
            clearScheduledAutoTrade();
            return;
        }

        scheduledAutoTradeEndAt = savedEndAt;
        refreshScheduledAutoTradeCountdown();
    }

    function parseBoostRecordsAccountId(url) {
        try {
            const parsedUrl = new URL(String(url || ''), window.location.origin);
            return parsedUrl.pathname === BOOST_RECORDS_PATH
                ? parsedUrl.searchParams.get('accountId') || ''
                : '';
        } catch {
            return '';
        }
    }

    function normalizeBoostAccountId(accountId) {
        return String(accountId || '').trim();
    }

    function isBoostRecordsPage() {
        return /\/boost\/records\/?$/.test(String(window.location.pathname || ''));
    }

    function loadBoostRecordsByAccount() {
        try {
            const raw = window.localStorage.getItem(LS_KEY_BOOST_RECORDS_BY_ACCOUNT);
            const recordsByAccount = raw ? JSON.parse(raw) : null;
            return recordsByAccount && typeof recordsByAccount === 'object' && !Array.isArray(recordsByAccount)
                ? recordsByAccount
                : {};
        } catch (err) {
            console.error('[USDT计算器] 读取 Boost records 账户缓存失败', err);
            return {};
        }
    }

    function getCachedBoostRecords(accountId) {
        const normalizedAccountId = normalizeBoostAccountId(accountId);
        if (!normalizedAccountId) return null;

        const recordsByAccount = loadBoostRecordsByAccount();
        const accountCache = recordsByAccount[normalizedAccountId];
        if (accountCache && accountCache.accountId === normalizedAccountId && accountCache.data) {
            return accountCache;
        }

        try {
            const raw = window.localStorage.getItem(LS_KEY_BOOST_RECORDS);
            const legacyCache = raw ? JSON.parse(raw) : null;
            return legacyCache && legacyCache.accountId === normalizedAccountId && legacyCache.data
                ? legacyCache
                : null;
        } catch (err) {
            console.error('[USDT计算器] 读取 Boost records 缓存失败', err);
            return null;
        }
    }

    function cacheBoostAccountId(accountId, { allowAccountSwitch = false } = {}) {
        const normalizedAccountId = normalizeBoostAccountId(accountId);
        if (!normalizedAccountId) return lastBoostAccountId;

        // A token page can request records for a non-selected context. Only the
        // dedicated Boost records page is allowed to establish or replace binding.
        if (!lastBoostAccountId && !allowAccountSwitch) {
            console.debug('[USDT计算器] 等待 Boost 记录页确认 accountId', normalizedAccountId);
            return '';
        }

        if (lastBoostAccountId && normalizedAccountId !== lastBoostAccountId && !allowAccountSwitch) {
            console.debug('[USDT计算器] 已忽略非 Boost 记录页的 accountId 变更', normalizedAccountId);
            return lastBoostAccountId;
        }

        if (normalizedAccountId !== lastBoostAccountId) {
            lastBoostAccountId = normalizedAccountId;
            try {
                window.localStorage.setItem(LS_KEY_BOOST_ACCOUNT_ID, normalizedAccountId);
            } catch (err) {
                console.error('[USDT计算器] 保存 Boost accountId 缓存失败', err);
            }

            lastBoostRecords = getCachedBoostRecords(normalizedAccountId);
            renderBoostRecords();
        }

        return normalizedAccountId;
    }

    function loadBoostRecordsCache() {
        lastBoostAccountId = normalizeBoostAccountId(window.localStorage.getItem(LS_KEY_BOOST_ACCOUNT_ID));
        lastBoostRecords = getCachedBoostRecords(lastBoostAccountId);
    }

    function saveBoostRecordsCache(accountId, data) {
        const normalizedAccountId = normalizeBoostAccountId(accountId);
        if (!normalizedAccountId || !data) return;

        lastBoostRecords = {
            accountId: normalizedAccountId,
            data,
            updatedAt: Date.now()
        };

        try {
            window.localStorage.setItem(LS_KEY_BOOST_RECORDS, JSON.stringify(lastBoostRecords));

            const recordsByAccount = loadBoostRecordsByAccount();
            recordsByAccount[normalizedAccountId] = lastBoostRecords;
            window.localStorage.setItem(LS_KEY_BOOST_RECORDS_BY_ACCOUNT, JSON.stringify(recordsByAccount));
        } catch (err) {
            console.error('[USDT计算器] 保存 Boost records 缓存失败', err);
        }
    }

    function formatBoostRecordNumber(value) {
        const numericValue = Number(value);
        return Number.isFinite(numericValue)
            ? numericValue.toFixed(2)
            : '--';
    }

    function formatUtc8Date(timestamp) {
        const date = new Date(Number(timestamp) + 8 * 60 * 60 * 1000);
        if (!Number.isFinite(date.getTime())) return '--';
        return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())} UTC+8`;
    }

    function getOfficialBoostWindowRows(data) {
        const summary = Array.isArray(data && data.summary) ? data.summary : [];
        const statistics = data && data.statistics ? data.statistics : {};
        const startMs = Number(statistics.calStartDate);
        const endMs = Number(statistics.calEndDate);
        const rows = summary.filter((row) => {
            const timestamp = Number(row && row.timestamp);
            return Number.isFinite(timestamp) &&
                (!Number.isFinite(startMs) || timestamp >= startMs) &&
                (!Number.isFinite(endMs) || timestamp <= endMs);
        });

        return (rows.length > 0 ? rows : summary.slice(0, BOOST_WINDOW_DAYS))
            .slice()
            .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    }

    function getOfficialBoostTodayStats(data = lastBoostRecords && lastBoostRecords.data) {
        const summary = Array.isArray(data && data.summary) ? data.summary : [];
        if (summary.length === 0) return null;

        const now = new Date();
        const officialDateStr = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
        const todayRow = summary.find((row) => row && row.isToday === true) ||
            summary.find((row) => row && String(row.timestampStr || '') === officialDateStr);
        if (!todayRow) return null;

        const todayTradingVolume = Number(todayRow && todayRow.tradingVolume);
        if (!Number.isFinite(todayTradingVolume)) return null;

        const updatedAt = Number(data && data.volumeUpdatedAt) ||
            Number((data && data.statistics && data.statistics.refreshTime)) ||
            Number(todayRow && todayRow.timestamp) ||
            0;

        return {
            tradingVolume: todayTradingVolume,
            progress: todayTradingVolume / BOOST_WINDOW_DAYS,
            updatedAt,
            timestamp: Number(todayRow && todayRow.timestamp) || 0,
            timestampStr: String(todayRow && todayRow.timestampStr || '')
        };
    }

    function calculateBoostRecordsView(data) {
        const statistics = data && data.statistics ? data.statistics : {};
        const rows = getOfficialBoostWindowRows(data);
        const todayStats = getOfficialBoostTodayStats(data);
        const rollingTotal = rows.reduce((total, row) => total + (Number(row.tradingVolume) || 0), 0);
        const referenceTime = Number(statistics.refreshTime) || Number(statistics.calEndDate) || Date.now();
        const targetRollingTotal = BOOST_TARGET_AVG_TRADING_VOLUME * BOOST_WINDOW_DAYS;
        const expiringRows = rows
            .map((row) => ({
                expireAt: Number(row.timestamp) + BOOST_RECORD_EXPIRY_DAYS * DAY_MS,
                tradingVolume: Number(row.tradingVolume) || 0
            }))
            .filter((row) => row.tradingVolume > 0 && row.expireAt > referenceTime)
            .sort((a, b) => a.expireAt - b.expireAt);

        let projectedRollingTotal = rollingTotal;
        let nextExpiry = null;
        for (const row of expiringRows) {
            projectedRollingTotal -= row.tradingVolume;
            if (projectedRollingTotal < targetRollingTotal) {
                nextExpiry = {
                    ...row,
                    startAt: row.expireAt - BOOST_REFILL_NOTICE_DAYS_BEFORE * DAY_MS,
                    projectedRollingTotal: Math.max(0, projectedRollingTotal),
                    refillNeeded: Math.max(0, targetRollingTotal - projectedRollingTotal)
                };
                break;
            }
        }

        const immediateRefill = Math.max(0, targetRollingTotal - rollingTotal);

        return {
            avgBalance: Number(statistics.avgBalance) || 0,
            avgTradingVolume: todayStats ? todayStats.progress : (Number(statistics.avgTradingVolume) || 0),
            todayTradingVolume: todayStats ? todayStats.tradingVolume : null,
            todayProgress: todayStats ? todayStats.progress : null,
            volumeUpdatedAt: todayStats ? todayStats.updatedAt : 0,
            rollingTotal,
            immediateRefill,
            nextExpiry
        };
    }

    function updateBoostRecordMetric(elementId, value, threshold) {
        const element = document.getElementById(elementId);
        if (!element) return;
        element.textContent = formatBoostRecordNumber(value);
        element.title = `门槛 ${threshold}`;
        element.classList.toggle('okx-calc-buy', value >= threshold);
        element.classList.toggle('okx-calc-danger', value < threshold);
    }

    function renderBoostRecords() {
        const statusElement = document.getElementById('boost-records-status');
        const expiryElement = document.getElementById('boost-record-expiry');
        if (!statusElement || !expiryElement) return;

        if (!lastBoostRecords || !lastBoostRecords.data) {
            statusElement.textContent = lastBoostAccountId ? '等待刷新' : '请访问 Boost 记录页';
            statusElement.style.color = '#909090';
            expiryElement.textContent = lastBoostAccountId ? '正在读取 Boost records 数据' : '尚未捕获 accountId';
            return;
        }

        const view = calculateBoostRecordsView(lastBoostRecords.data);
        updateBoostRecordMetric('boost-record-balance', view.avgBalance, BOOST_MIN_BALANCE);
        updateBoostRecordMetric('boost-record-volume', view.avgTradingVolume, BOOST_TARGET_AVG_TRADING_VOLUME);
        const volumeMetricElement = document.getElementById('boost-record-volume');
        if (volumeMetricElement && view.todayTradingVolume !== null) {
            volumeMetricElement.title = `今日官方 tradingVolume：${formatBoostRecordNumber(view.todayTradingVolume)}，显示值已除以 ${BOOST_WINDOW_DAYS}`;
        }
        statusElement.textContent = '已更新';
        statusElement.style.color = '#a5ff00';
        expiryElement.textContent = view.nextExpiry
            ? `下次断档：${formatUtc8Date(view.nextExpiry.expireAt)} · 到期 ${formatBoostRecordNumber(view.nextExpiry.tradingVolume)}`
            : '下次断档：暂无待衔接交易量';
    }

    function handleBoostRecordsResponse(payload, accountId, { allowAccountSwitch = false } = {}) {
        const normalizedAccountId = normalizeBoostAccountId(accountId);
        if (!normalizedAccountId || !payload || payload.code !== 0 || !payload.data) return;

        const selectedAccountId = cacheBoostAccountId(normalizedAccountId, { allowAccountSwitch });
        if (selectedAccountId !== normalizedAccountId) {
            console.debug('[USDT计算器] 已忽略非当前账户的 Boost records 响应', normalizedAccountId);
            return;
        }

        saveBoostRecordsCache(normalizedAccountId, payload.data);
        renderBoostRecords();
        calculateStats();
    }

    async function refreshBoostRecordsFromCache() {
        if (boostRecordsFetchPromise) return boostRecordsFetchPromise;
        const accountId = cacheBoostAccountId(lastBoostAccountId || window.localStorage.getItem(LS_KEY_BOOST_ACCOUNT_ID));
        if (!accountId) {
            renderBoostRecords();
            return null;
        }

        boostRecordsFetchPromise = (async () => {
            try {
                const url = `${BOOST_RECORDS_PATH}?accountId=${encodeURIComponent(accountId)}&t=${Date.now()}`;
                const response = await originalFetch.call(window, url, {
                    method: 'GET',
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' }
                });
                if (!response.ok) throw new Error(`Boost records 请求失败: HTTP ${response.status}`);
                handleBoostRecordsResponse(await response.json(), accountId);
            } catch (err) {
                console.error('[USDT计算器] 刷新 Boost records 失败', err);
                renderBoostRecords();
            } finally {
                boostRecordsFetchPromise = null;
            }
        })();

        return boostRecordsFetchPromise;
    }

    async function refreshOfficialBoostRecordsAfterTrade() {
        try {
            await Promise.race([
                refreshBoostRecordsFromCache(),
                sleep(4500)
            ]);
        } catch (err) {
            console.error('[USDT计算器] 交易后同步 Boost records 失败', err);
        }
    }

    async function syncDataOnAutoTradeStop(reason = '') {
        if (stopSyncPromise) return stopSyncPromise;

        if (isTradeStatsPaused) {
            updateAutoTradeStatus(`${reason || '已停止'}，交易统计已停止`, '#ff9800');
            stopSyncPromise = (async () => {
                try {
                    await Promise.race([
                        refreshBoostRecordsFromCache(),
                        sleep(4500)
                    ]);
                    renderBoostRecords();
                } catch (err) {
                    console.error('[USDT计算器] 停止自动交易后同步 Boost records 失败', err);
                } finally {
                    stopSyncPromise = null;
                }
            })();

            return stopSyncPromise;
        }

        updateAutoTradeStatus(`${reason || '已停止'}，同步数据中`, '#2196f3');
        stopSyncPromise = (async () => {
            try {
                await Promise.allSettled([
                    fetchOrderHistoryByApi(),
                    refreshBoostRecordsFromCache()
                ]);
                calculateStats();
                renderBoostRecords();
                updateAutoTradeStatus(`${reason || '已停止'}，数据已同步`, '#ff9800');
            } catch (err) {
                console.error('[USDT计算器] 停止自动交易后同步数据失败', err);
                updateAutoTradeStatus(`${reason || '已停止'}，同步失败请手动核对`, '#ff9800');
            } finally {
                stopSyncPromise = null;
            }
        })();

        return stopSyncPromise;
    }

    function updateAlarmToggleState() {
        const label = document.getElementById('alarm-toggle-label');
        const text = document.getElementById('alarm-toggle-text');
        if (label) label.classList.toggle('is-enabled', isAlarmEnabled);
        if (text) text.textContent = isAlarmEnabled ? '达量警报已开启' : '开启达量警报';
    }

    function getCurrentTokenFromUrl() {
        const match = window.location.pathname.match(/\/token\/([^/]+)\/([^/?#]+)\/?$/);
        if (!match) return null;

        const chainSlug = decodeURIComponent(match[1]);
        const rawTokenAddress = decodeURIComponent(match[2]);
        const isEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(rawTokenAddress);
        const isSolanaAddress = normalizeChainKey(chainSlug) === 'solana' &&
            /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(rawTokenAddress);
        if (!isEvmAddress && !isSolanaAddress) return null;

        return {
            chainSlug,
            tokenAddress: isEvmAddress ? rawTokenAddress.toLowerCase() : rawTokenAddress,
            addressType: isEvmAddress ? 'evm' : 'solana'
        };
    }

    function normalizeChainKey(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function getFeeTokenGroup(feeTokens, chainSlug) {
        if (!Array.isArray(feeTokens) || feeTokens.length === 0) return 'Other';

        const chainKey = normalizeChainKey(chainSlug);
        const chainAliases = {
            bsc: ['bsc', 'bnbchain'],
            eth: ['eth', 'ethereum'],
            ethereum: ['eth', 'ethereum'],
            solana: ['solana'],
            xlayer: ['xlayer']
        };
        const acceptedChainKeys = chainAliases[chainKey] || [chainKey];
        const matchedToken = feeTokens.find((token) => {
            return acceptedChainKeys.includes(normalizeChainKey(token.chainName));
        }) || feeTokens[0];

        return matchedToken && ['Group1', 'Group2'].includes(matchedToken.tag)
            ? matchedToken.tag
            : 'Other';
    }

    function getQuoteBoostAsset(chainSlug) {
        if (normalizeChainKey(chainSlug) === 'solana') {
            return { symbol: 'SOL', group: 'Group1' };
        }

        return { symbol: 'USDT', group: 'Group1' };
    }

    function getBaseBoostMultiplier(tokenGroup, quoteGroup) {
        if (tokenGroup === 'Other' && quoteGroup === 'Other') return 0;
        if (tokenGroup === 'Other' || quoteGroup === 'Other') return 0.5;
        if (tokenGroup === 'Group1' && quoteGroup === 'Group1') return 0.1;
        return 0.25;
    }

    function readExtraBoostPercent() {
        const values = Array.from(document.querySelectorAll('img[alt="赚取额外 Boost 交易量"]'))
            .map((img) => img.closest('[data-testid="okd-popup"]') || img.parentElement?.parentElement)
            .filter((container) => container && isVisible(container))
            .map((container) => {
                const match = normalizeText(container.innerText || container.textContent).match(/\+\s*(\d+(?:\.\d+)?)\s*%/);
                const rect = container.getBoundingClientRect();
                return match ? { percent: parseFloat(match[1]), top: rect.top } : null;
            })
            .filter((item) => item && Number.isFinite(item.percent));

        if (values.length === 0) return null;

        // Detail page badge lives in the token header. Ignoring list-row badges
        // prevents stale Boost values from being captured during SPA navigation.
        const headerValues = values.filter((item) => item.top >= 0 && item.top < 260);
        const candidates = headerValues.length > 0
            ? headerValues
            : (values.length === 1 ? values : []);
        if (candidates.length === 0) return null;

        return Math.min(Math.max(...candidates.map((item) => item.percent)), 50);
    }

    async function waitForExtraBoostPercent(expectedTokenKey, timeoutMs = 6000) {
        const startedAt = Date.now();
        let lastPercent = null;
        let stableReads = 0;

        await sleep(700);
        while (Date.now() - startedAt < timeoutMs) {
            if (activeBoostTokenKey !== expectedTokenKey) return null;

            const percent = readExtraBoostPercent();
            if (percent !== null && percent === lastPercent) {
                stableReads += 1;
            } else {
                lastPercent = percent;
                stableReads = percent === null ? 0 : 1;
            }

            if (stableReads >= 3) return percent;
            await sleep(250);
        }

        return lastPercent || 0;
    }

    async function fetchCurrentTokenGroupOnce(tokenInfo) {
        if (boostGroupRequestStarted) return null;
        boostGroupRequestStarted = true;

        const url = `/priapi/v1/dx/trade/multi/feeToken/search?tokenAddress=${encodeURIComponent(tokenInfo.tokenAddress)}&t=${Date.now()}`;
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`Group 请求失败: HTTP ${response.status}`);
        }

        const payload = await response.json();
        if (payload.code !== 0 || !Array.isArray(payload.data)) {
            throw new Error('Group 请求返回格式异常');
        }

        return getFeeTokenGroup(payload.data, tokenInfo.chainSlug);
    }

    function formatBoostMultiplier(value) {
        return String(Number(value.toFixed(4)));
    }

    function getBoostTokenKey(tokenInfo) {
        if (!tokenInfo) return '';
        return `${normalizeChainKey(tokenInfo.chainSlug)}:${tokenInfo.tokenAddress}`;
    }

    function watchTokenUrlForBoost() {
        const refreshBoostForCurrentUrl = () => {
            const tokenInfo = getCurrentTokenFromUrl();
            const tokenKey = getBoostTokenKey(tokenInfo);
            if (tokenKey === activeBoostTokenKey) return;

            if (activeBoostTokenKey && isAutoTrading) {
                stopAutoTrade('检测到代币切换，已停止自动交易');
            }

            activeBoostTokenKey = tokenKey;
            boostAutomationRunId += 1;
            boostGroupRequestStarted = false;
            boostMultiplierManuallyEdited = false;
            lastBoostAutomation = null;

            if (!tokenInfo) {
                updateBoostAutomationStatus('非代币详情页，保留手动倍数');
                return;
            }

            updateBoostAutomationStatus('自动识别中');
            initializeBoostMultiplierAutomation(tokenInfo, tokenKey, boostAutomationRunId);
        };

        refreshBoostForCurrentUrl();
        if (!boostRouteWatchIntervalId) {
            boostRouteWatchIntervalId = setInterval(refreshBoostForCurrentUrl, 500);
        }
    }

    async function initializeBoostMultiplierAutomation(tokenInfo, tokenKey, runId) {
        if (!tokenInfo) {
            updateBoostAutomationStatus('非代币详情页，保留手动倍数');
            return;
        }

        try {
            const [tokenGroup, extraBoostPercent] = await Promise.all([
                fetchCurrentTokenGroupOnce(tokenInfo),
                waitForExtraBoostPercent(tokenKey)
            ]);
            if (!tokenGroup || extraBoostPercent === null) return;
            if (runId !== boostAutomationRunId || tokenKey !== activeBoostTokenKey) return;

            const quoteAsset = getQuoteBoostAsset(tokenInfo.chainSlug);
            const baseMultiplier = getBaseBoostMultiplier(tokenGroup, quoteAsset.group);
            const multiplier = baseMultiplier * (1 + extraBoostPercent / 100);
            const multiplierText = formatBoostMultiplier(multiplier);
            const groupText = tokenGroup === 'Other' ? '其他代币' : tokenGroup;

            lastBoostAutomation = {
                tokenAddress: tokenInfo.tokenAddress,
                chainSlug: tokenInfo.chainSlug,
                tokenGroup,
                quoteAsset,
                baseMultiplier,
                extraBoostPercent,
                multiplier
            };

            if (!boostMultiplierManuallyEdited) {
                const multiInput = document.getElementById('boost-multi');
                if (multiInput) {
                    multiInput.value = multiplierText;
                    calculateBoost();
                }
                updateBoostAutomationStatus(`${groupText} ↔ ${quoteAsset.symbol} · 基础 ${baseMultiplier} · 加成 +${extraBoostPercent}% · 自动 ${multiplierText}`, '#a5ff00');
                return;
            }

            updateBoostAutomationStatus(`已识别 ${groupText} ↔ ${quoteAsset.symbol} · 自动值 ${multiplierText} · 保留手动值`);
        } catch (err) {
            console.error('[USDT计算器] Boost 倍数自动识别失败', err);
            updateBoostAutomationStatus('自动识别失败，保留手动倍数', '#fc46ab');
        }
    }

    function calculateBoost() {
        const dailyInput = document.getElementById('boost-daily');
        const multiInput = document.getElementById('boost-multi');
        if (!dailyInput || !multiInput) return;

        const dailyRaw = dailyInput.value;
        const multiRaw = multiInput.value;
        const parsedDaily = parseFloat(dailyRaw);
        const parsedMulti = parseFloat(multiRaw);
        const dailyVal = Number.isFinite(parsedDaily) ? parsedDaily : 0;
        const multiVal = Number.isFinite(parsedMulti) ? parsedMulti : 1;

        saveBoostSettings(dailyRaw, multiRaw);
        if (dailyVal <= 0 || multiVal <= 0) {
            calculateStats();
            return;
        }

        calculateStats();
    }

    function readDexSummaryValue(labelText) {
        const rows = Array.from(document.querySelectorAll('.K_Nnu2__dex, [class*="K_Nnu2"]')).filter(isVisible);
        const candidates = [];

        for (const row of rows) {
            const rowText = normalizeText(row.innerText || row.textContent);
            if (!rowText.includes(labelText)) continue;

            const valueNodes = Array.from(row.querySelectorAll('div, span')).filter((node) => {
                const text = normalizeText(node.innerText || node.textContent);
                return isVisible(node) && text && !text.includes(labelText);
            });

            for (let i = valueNodes.length - 1; i >= 0; i--) {
                const value = parseAmountText(valueNodes[i].innerText || valueNodes[i].textContent);
                if (value !== null) {
                    candidates.push(value);
                    break;
                }
            }

            const fallbackValue = parseAmountText(rowText.replace(labelText, ''));
            if (fallbackValue !== null) candidates.push(fallbackValue);
        }

        return candidates.length > 0 ? Math.max(...candidates) : null;
    }

    function readDexVolumeStats() {
        const buyValue = readDexSummaryValue('总买入');
        const sellValue = readDexSummaryValue('总卖出');
        const buy = buyValue || 0;
        const sell = sellValue || 0;

        return {
            buy,
            sell,
            total: buy + sell
        };
    }

    function applyOfficialBoostVolumeStats(stats) {
        const officialStats = getOfficialBoostTodayStats();
        if (!stats || !officialStats) return stats;

        stats.officialBoostTotal = officialStats.tradingVolume;
        stats.officialBoostProgress = officialStats.progress;
        stats.officialBoostUpdatedAt = officialStats.updatedAt;
        stats.total = officialStats.tradingVolume;
        stats.boostProgress = officialStats.progress;
        stats.boostProgressOfficial = true;
        stats.boostProgressFallback = false;
        return stats;
    }

    function getCurrentRebatePercent() {
        const rebateInput = document.getElementById('rebate-percent');
        const parsedRebate = parseFloat(rebateInput && rebateInput.value);
        return Number.isFinite(parsedRebate) && parsedRebate >= 0
            ? parsedRebate
            : DEFAULT_REBATE_PERCENT;
    }

    function getCurrentBaseBoostPercent() {
        const automationBase = Number(lastBoostAutomation && lastBoostAutomation.baseMultiplier);
        if (Number.isFinite(automationBase) && automationBase > 0) return automationBase;

        const multiInput = document.getElementById('boost-multi');
        const inputMultiplier = parseFloat(multiInput && multiInput.value);
        return Number.isFinite(inputMultiplier) && inputMultiplier > 0 ? inputMultiplier : 0;
    }

    function calculateFeeBreakdown(stats) {
        const requiredVolume = getBoostTarget();
        const baseBoostPercent = getCurrentBaseBoostPercent();
        const rebatePercent = getCurrentRebatePercent();
        const boostMultiplier = getCurrentBoostSnapshot().boostMultiplier;

        if (!Number.isFinite(requiredVolume) || requiredVolume <= 0 || baseBoostPercent <= 0) return null;

        const baseRate = baseBoostPercent / 100;
        const rebateDeltaRate = Math.max(0, rebatePercent - FIXED_INVITE_REBATE_PERCENT) / 100;
        const feeAmount = -(requiredVolume * baseRate);
        const estimatedFee = -(requiredVolume * baseRate * (1 - FIXED_INVITE_REBATE_PERCENT / 100));
        const actualRebate = stats &&
            Number.isFinite(Number(stats.total)) &&
            Number.isFinite(boostMultiplier) &&
            boostMultiplier > 0
            ? (Number(stats.total) / boostMultiplier) * rebateDeltaRate * baseRate
            : null;
        const rebateAdjustedWear = stats && Number.isFinite(Number(stats.net))
            ? Number(stats.net) + (actualRebate || 0)
            : null;

        return {
            requiredVolume,
            baseBoostPercent,
            boostMultiplier,
            rebatePercent,
            feeAmount,
            actualRebate,
            estimatedFee,
            rebateAdjustedWear
        };
    }

    function formatSignedAmount(value, decimals = 4) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return '--';
        return `${numericValue > 0 ? '+' : ''}${numericValue.toFixed(decimals)}`;
    }

    function formatProgressAmount(value) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return '--';
        if (Math.abs(numericValue) > 0 && Math.abs(numericValue) < 0.01) return numericValue.toFixed(4);
        return numericValue.toFixed(2);
    }

    function formatUnsignedAmount(value, decimals = 4) {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue.toFixed(decimals) : '--';
    }

    function colorCostValue(element, value) {
        if (!element) return;
        const numericValue = Number(value);
        element.style.color = !Number.isFinite(numericValue)
            ? '#e6e6e6'
            : numericValue > 0
            ? '#a5ff00'
            : (numericValue < 0 ? '#fc46ab' : '#e6e6e6');
    }

    function isUsdtToken(token) {
        return token && String(token.tokenSymbol || '').toUpperCase() === 'USDT';
    }

    function getDailyOrderRecord(order, windowInfo) {
        if (!order || !order.orderId || parseInt(order.status, 10) !== 1) return null;

        const orderTime = normalizeOrderTimeMs(order);
        if (!orderTime || orderTime < windowInfo.startMs || orderTime >= windowInfo.endMs) return null;

        const fromToken = order.fromToken;
        const toToken = order.toToken;
        let usdtSpent = 0;
        let usdtGained = 0;

        if (isUsdtToken(fromToken)) {
            usdtSpent += parseFloat(fromToken.tokenAmount || 0) || 0;
        }

        if (isUsdtToken(toToken)) {
            usdtGained += parseFloat(toToken.tokenAmount || 0) || 0;
        }

        if (usdtSpent <= 0 && usdtGained <= 0) return null;
        return {
            id: String(order.orderId),
            buy: usdtSpent,
            sell: usdtGained,
            time: orderTime
        };
    }

    function syncDailyOrderRecords(windowInfo = getDailyStatsWindow()) {
        loadDailyOrderRecords(windowInfo);

        let changed = false;
        const currentBoostSnapshot = getCurrentBoostSnapshot();
        ordersMap.forEach((order) => {
            const record = getDailyOrderRecord(order, windowInfo);
            if (!record) return;

            const previous = dailyOrderRecordsMap.get(record.id);
            const previousBoostMultiplier = getRecordBoostMultiplier(previous);
            const shouldFillBoostSnapshot = previousBoostMultiplier <= 0 && currentBoostSnapshot.boostMultiplier > 0;
            const snapshot = previousBoostMultiplier > 0
                ? {
                    boostMultiplier: previous.boostMultiplier,
                    boostDaily: previous.boostDaily,
                    boostTarget: previous.boostTarget,
                    boostTokenKey: previous.boostTokenKey
                }
                : currentBoostSnapshot;
            if (!previous ||
                previous.buy !== record.buy ||
                previous.sell !== record.sell ||
                previous.time !== record.time ||
                shouldFillBoostSnapshot) {
                dailyOrderRecordsMap.set(record.id, {
                    buy: record.buy,
                    sell: record.sell,
                    time: record.time,
                    boostMultiplier: snapshot.boostMultiplier,
                    boostDaily: snapshot.boostDaily,
                    boostTarget: snapshot.boostTarget,
                    boostTokenKey: snapshot.boostTokenKey
                });
                changed = true;
            }
        });

        if (changed) saveDailyOrderRecords(windowInfo);
    }

    function readOrderVolumeStats() {
        if (isTradeStatsPaused) return createPausedTradeStats();

        const windowInfo = getDailyStatsWindow();
        syncDailyOrderRecords(windowInfo);

        const stats = createEmptyStats(dailyOrderRecordsMap.size);

        dailyOrderRecordsMap.forEach((record) => {
            stats.buy += parseFloat(record.buy || 0) || 0;
            stats.sell += parseFloat(record.sell || 0) || 0;
            const recordBoostMultiplier = getRecordBoostMultiplier(record);
            if (recordBoostMultiplier > 0) {
                stats.boostSnapshotCount += 1;
                stats.boostProgress += getRecordUsdtVolume(record) * recordBoostMultiplier / BOOST_WINDOW_DAYS;
            }
        });

        stats.orderHistoryTotal = stats.buy + stats.sell;
        stats.total = stats.orderHistoryTotal;
        stats.net = stats.sell - stats.buy;
        if (stats.boostProgress <= 0 && stats.total > 0 && stats.boostSnapshotCount === 0) {
            const currentBoostSnapshot = getCurrentBoostSnapshot();
            if (currentBoostSnapshot.boostMultiplier > 0) {
                stats.boostProgress = stats.total * currentBoostSnapshot.boostMultiplier / BOOST_WINDOW_DAYS;
                stats.boostProgressFallback = true;
            }
        }

        applyOfficialBoostVolumeStats(stats);
        stats.feeBreakdown = calculateFeeBreakdown(stats);
        stats.projectedWear = stats.feeBreakdown ? stats.feeBreakdown.rebateAdjustedWear : null;

        return stats;
    }

    function getStatsForDisplay(rawStats) {
        if (!pendingSellOrderSync) return rawStats;
        if (hasSellOrderSynced(rawStats, pendingSellOrderSync.baselineStats)) return rawStats;
        return {
            ...cloneStats(pendingSellOrderSync.baselineStats),
            sellSyncPending: true,
            rawStats
        };
    }

    function calculateStats() {
        const rawStats = readOrderVolumeStats();
        lastStats = rawStats;
        const displayStats = getStatsForDisplay(rawStats);

        const orderHistoryVolumeElement = document.getElementById('order-history-volume');
        const volumeElement = document.getElementById('usdt-volume');
        const netElement = document.getElementById('usdt-net');
        const estimatedRebateElement = document.getElementById('usdt-estimated-rebate');
        const estimatedWearElement = document.getElementById('usdt-estimated-wear');
        const rebateAdjustedWearElement = document.getElementById('usdt-rebate-adjusted-wear');
        const weightedProgressElement = document.getElementById('boost-weighted-progress');
        const sourceElement = document.getElementById('summary-source-status');
        const progressElement = document.getElementById('boost-target-progress');
        const feeBreakdown = displayStats.feeBreakdown || null;

        if (isTradeStatsPaused) {
            if (orderHistoryVolumeElement) {
                orderHistoryVolumeElement.textContent = '--';
                orderHistoryVolumeElement.title = '交易统计已停止';
            }

            if (volumeElement) {
                volumeElement.textContent = '--';
                volumeElement.title = '交易统计已停止';
            }

            if (netElement) {
                netElement.textContent = '--';
                netElement.style.color = '#909090';
                netElement.title = '交易统计已停止';
            }

            if (estimatedRebateElement) {
                estimatedRebateElement.textContent = '--';
                estimatedRebateElement.style.color = '#909090';
                estimatedRebateElement.title = '交易统计已停止';
            }

            if (estimatedWearElement) {
                estimatedWearElement.textContent = '--';
                estimatedWearElement.style.color = '#909090';
                estimatedWearElement.title = '交易统计已停止';
            }

            if (rebateAdjustedWearElement) {
                rebateAdjustedWearElement.textContent = '--';
                rebateAdjustedWearElement.style.color = '#909090';
                rebateAdjustedWearElement.title = '交易统计已停止';
            }

            if (weightedProgressElement) {
                weightedProgressElement.textContent = '已停止';
                weightedProgressElement.style.color = '#909090';
                weightedProgressElement.title = '交易统计已停止，自动交易将持续买卖';
            }

            if (sourceElement) {
                sourceElement.textContent = '统计停止';
                sourceElement.title = '已停止账单同步与交易统计';
                sourceElement.style.color = '#ff9800';
            }

            if (progressElement) {
                progressElement.textContent = '已停止';
                progressElement.title = '交易统计已停止，不用达量进度停止自动交易';
                progressElement.style.color = '#909090';
            }

            return rawStats;
        }

        if (orderHistoryVolumeElement) {
            orderHistoryVolumeElement.textContent = formatUnsignedAmount(displayStats.orderHistoryTotal, 4);
            orderHistoryVolumeElement.title = displayStats.sellSyncPending
                ? '卖出订单同步中，暂用卖出前的订单历史总交易额'
                : '订单历史当前 08:00 周期 USDT 买入+卖出累计';
        }

        if (volumeElement) {
            volumeElement.textContent = formatUnsignedAmount(displayStats.total, 4);
            volumeElement.title = displayStats.sellSyncPending
                ? '卖出已确认，正在等待订单历史出现卖出记录；总Boost交易额暂用当前值'
                : displayStats.boostProgressOfficial
                ? '官方 Boost records 今日 tradingVolume'
                : '官方 Boost records 暂不可用，回退显示订单历史总交易额';
        }

        if (netElement) {
            netElement.textContent = displayStats.sellSyncPending
                ? '同步中'
                : formatSignedAmount(displayStats.net, 4);
            netElement.style.color = displayStats.sellSyncPending
                ? '#2196f3'
                : (displayStats.net > 0 ? '#a5ff00' : (displayStats.net < 0 ? '#fc46ab' : '#e6e6e6'));
            netElement.title = displayStats.sellSyncPending
                ? '卖出订单还没出现在订单历史中，暂不显示单边买入造成的临时净差'
                : '';
        }

        if (estimatedRebateElement) {
            estimatedRebateElement.textContent = feeBreakdown && feeBreakdown.actualRebate !== null
                ? formatUnsignedAmount(feeBreakdown.actualRebate, 2)
                : '--';
            estimatedRebateElement.style.color = feeBreakdown && feeBreakdown.actualRebate > 0 ? '#a5ff00' : '#e6e6e6';
            estimatedRebateElement.title = feeBreakdown
                ? `总Boost交易额 ${formatUnsignedAmount(displayStats.total, 4)} / Boost倍数 ${feeBreakdown.boostMultiplier} × (${feeBreakdown.rebatePercent}% - ${FIXED_INVITE_REBATE_PERCENT}%) × 基础 ${feeBreakdown.baseBoostPercent}%`
                : '等待返佣比例、Boost倍数和基础倍数';
        }

        if (estimatedWearElement) {
            estimatedWearElement.textContent = feeBreakdown ? formatSignedAmount(feeBreakdown.estimatedFee, 4) : '--';
            colorCostValue(estimatedWearElement, feeBreakdown ? feeBreakdown.estimatedFee : null);
            estimatedWearElement.title = feeBreakdown
                ? `-(实际需刷量 × 基础 ${feeBreakdown.baseBoostPercent}% × (1 - ${FIXED_INVITE_REBATE_PERCENT}%))`
                : '等待手续费数据';
        }

        if (rebateAdjustedWearElement) {
            rebateAdjustedWearElement.textContent = displayStats.sellSyncPending
                ? '同步中'
                : feeBreakdown && feeBreakdown.rebateAdjustedWear !== null
                ? formatSignedAmount(feeBreakdown.rebateAdjustedWear, 4)
                : '--';
            rebateAdjustedWearElement.style.color = displayStats.sellSyncPending ? '#2196f3' : rebateAdjustedWearElement.style.color;
            if (!displayStats.sellSyncPending) colorCostValue(rebateAdjustedWearElement, feeBreakdown ? feeBreakdown.rebateAdjustedWear : null);
            rebateAdjustedWearElement.title = displayStats.sellSyncPending
                ? '卖出订单同步完成后重新计算'
                : feeBreakdown
                ? `USDT净差 ${formatSignedAmount(displayStats.net, 4)} + 实际返佣 ${formatUnsignedAmount(feeBreakdown.actualRebate, 2)}`
                : '等待返佣数据';
        }

        if (weightedProgressElement) {
            const dailyTarget = getCurrentBoostDailyTarget();
            weightedProgressElement.textContent = dailyTarget > 0
                ? `${formatProgressAmount(displayStats.boostProgress)} / ${formatProgressAmount(dailyTarget)}`
                : formatProgressAmount(displayStats.boostProgress);
            const boostProgressPercent = dailyTarget > 0 ? displayStats.boostProgress / dailyTarget * 100 : 0;
            weightedProgressElement.style.color = boostProgressPercent >= 100 ? '#a5ff00' : '#e6e6e6';
            weightedProgressElement.title = displayStats.sellSyncPending
                ? '卖出订单同步中，暂用卖出前进度'
                : displayStats.boostProgressOfficial
                ? `官方今日 tradingVolume / ${BOOST_WINDOW_DAYS}：${boostProgressPercent.toFixed(2)}%`
                : dailyTarget > 0
                ? `按订单发生时倍数折算：${boostProgressPercent.toFixed(2)}%${displayStats.boostProgressFallback ? '（当前倍数估算）' : ''}`
                : '等待日均交易量设置';
        }

        if (sourceElement) {
            const windowInfo = getDailyStatsWindow();
            sourceElement.textContent = displayStats.sellSyncPending
                ? `卖出同步中 ${pendingSellOrderSync.attempts || 0}`
                : displayStats.boostProgressOfficial ? 'Boost实时'
                : displayStats.count > 0 ? `08:00订单 ${displayStats.count}` : `08:00起`;
            sourceElement.title = displayStats.sellSyncPending
                ? '卖出已确认，等待订单历史接口返回卖出订单'
                : displayStats.boostProgressOfficial
                ? `官方 records 更新时间：${displayStats.officialBoostUpdatedAt ? new Date(displayStats.officialBoostUpdatedAt).toLocaleString() : '未知'}；总交易额和净差来自订单历史`
                : `统计周期：${new Date(windowInfo.startMs).toLocaleString()} - ${new Date(windowInfo.endMs).toLocaleString()}`;
            sourceElement.style.color = displayStats.sellSyncPending
                ? '#2196f3'
                : displayStats.boostProgressOfficial ? '#a5ff00'
                : displayStats.count > 0 ? '#a5ff00' : '#909090';
        }

        const weightedTargetStats = getWeightedBoostProgressStats(displayStats);
        if (progressElement) {
            const cappedPercentage = Math.min(weightedTargetStats.percentage, 100);
            progressElement.textContent = cappedPercentage > 0 && cappedPercentage < 0.1
                ? '<0.1%'
                : `${cappedPercentage.toFixed(1)}%`;
            progressElement.title = displayStats.sellSyncPending
                ? '卖出订单同步中，达量进度暂不更新'
                : displayStats.boostProgressOfficial
                ? `官方 Boost进度：${formatProgressAmount(weightedTargetStats.progress)} / ${formatProgressAmount(weightedTargetStats.target)}`
                : weightedTargetStats.target > 0
                ? `Boost进度：${formatProgressAmount(weightedTargetStats.progress)} / ${formatProgressAmount(weightedTargetStats.target)}${displayStats.boostProgressFallback ? '（当前倍数估算）' : ''}`
                : '等待日均交易量设置';
            progressElement.style.color = weightedTargetStats.reached ? '#a5ff00' : '#e6e6e6';
        }

        if (isAlarmEnabled && weightedTargetStats.reached) {
            const now = Date.now();
            if (now - lastAlarmTime > 5000) {
                playAlertSound();
                lastAlarmTime = now;
            }
        }

        return lastStats;
    }

    function getBoostTarget() {
        const snapshot = getCurrentBoostSnapshot();
        const target = snapshot.boostTarget;

        return Number.isFinite(target) && target > 0 ? target : Infinity;
    }

    function refreshOrderTabs() {
        const openOrdersTab = document.querySelector('[data-pane-id="open_orders"]');
        const orderHistoryTab = document.querySelector('[data-pane-id="order_history"]');

        if (openOrdersTab && orderHistoryTab) {
            openOrdersTab.click();
            setTimeout(() => { orderHistoryTab.click(); }, 300);
        } else {
            console.log('[USDT计算器] 未找到订单标签页元素。');
        }
    }

    function performRefreshClick() {
        const myOrdersButton = findElementByTextPattern(/^我的订单(?:\s*[\(（]\d+[\)）])?$/);

        if (myOrdersButton) {
            triggerRealClick(myOrdersButton);
            setTimeout(refreshOrderTabs, 300);
        } else {
            refreshOrderTabs();
        }
    }

    function getReusableAccountId() {
        return cacheBoostAccountId(lastBoostAccountId || window.localStorage.getItem(LS_KEY_BOOST_ACCOUNT_ID));
    }

    async function fetchOrderHistoryByApi() {
        if (isTradeStatsPaused) return null;
        if (orderHistoryFetchPromise) return orderHistoryFetchPromise;

        const accountId = getReusableAccountId();
        if (!accountId) throw new Error('缺少 Boost accountId，无法主动同步订单历史');

        orderHistoryFetchPromise = (async () => {
            const controller = typeof AbortController === 'function' ? new AbortController() : null;
            const timeoutId = controller ? setTimeout(() => controller.abort(), 4500) : null;

            try {
                const response = await originalFetch.call(window, `${ORDER_HISTORY_PATH}?t=${Date.now()}`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        accountId,
                        isLoadMore: false,
                        pageSize: ORDER_HISTORY_PAGE_SIZE
                    }),
                    signal: controller ? controller.signal : undefined
                });

                if (!response.ok) throw new Error(`订单历史请求失败: HTTP ${response.status}`);
                const payload = await response.json();
                handleOrderHistoryResponse(payload);
                return payload;
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
                orderHistoryFetchPromise = null;
            }
        })();

        return orderHistoryFetchPromise;
    }

    function clearSellOrderSyncBackgroundTimer() {
        if (sellOrderSyncBackgroundTimerId) {
            clearTimeout(sellOrderSyncBackgroundTimerId);
            sellOrderSyncBackgroundTimerId = null;
        }
    }

    function beginPendingSellOrderSync(baselineStats) {
        if (isTradeStatsPaused) return;

        clearSellOrderSyncBackgroundTimer();
        pendingSellOrderSync = {
            baselineStats: cloneStats(baselineStats || readOrderVolumeStats()),
            startedAt: Date.now(),
            attempts: 0,
            lastError: ''
        };
        calculateStats();
    }

    function completePendingSellOrderSync(message = '卖出订单已同步', color = '#4caf50') {
        clearSellOrderSyncBackgroundTimer();
        pendingSellOrderSync = null;
        calculateStats();
        updateAutoTradeStatus(message, color);
    }

    async function fetchOrderHistoryAndReadStats() {
        if (isTradeStatsPaused) return createPausedTradeStats();

        await fetchOrderHistoryByApi();
        const latestStats = readOrderVolumeStats();
        calculateStats();
        return latestStats;
    }

    function startBackgroundSellOrderSync() {
        if (isTradeStatsPaused) return;

        clearSellOrderSyncBackgroundTimer();
        if (!pendingSellOrderSync) return;

        const run = async () => {
            if (!pendingSellOrderSync) return;

            if (Date.now() - pendingSellOrderSync.startedAt > ORDER_HISTORY_BACKGROUND_SYNC_TIMEOUT_MS) {
                pendingSellOrderSync = null;
                calculateStats();
                updateAutoTradeStatus('订单历史同步超时，请手动核对', '#ff9800');
                return;
            }

            pendingSellOrderSync.attempts += 1;
            try {
                const latestStats = await fetchOrderHistoryAndReadStats();
                if (!pendingSellOrderSync) return;
                if (hasSellOrderSynced(latestStats, pendingSellOrderSync.baselineStats)) {
                    completePendingSellOrderSync('卖出订单后台同步完成', '#4caf50');
                    return;
                }
            } catch (err) {
                pendingSellOrderSync.lastError = err && err.message ? err.message : String(err);
                console.error('[USDT计算器] 后台同步卖出订单失败', err);
            }

            sellOrderSyncBackgroundTimerId = setTimeout(run, ORDER_HISTORY_BACKGROUND_SYNC_INTERVAL_MS);
        };

        sellOrderSyncBackgroundTimerId = setTimeout(run, ORDER_HISTORY_BACKGROUND_SYNC_INTERVAL_MS);
    }

    async function refreshOrderHistoryAfterConfirmedSell(beforeOrderStats, options = {}) {
        if (isTradeStatsPaused) {
            clearSellOrderSyncBackgroundTimer();
            pendingSellOrderSync = null;
            updateAutoTradeStatus('交易统计已停止，跳过卖出账单同步', '#ff9800');
            return true;
        }

        const requireSellIncrease = options.requireSellIncrease !== false;
        updateAutoTradeStatus('卖出已确认，同步订单历史', '#2196f3');

        if (!requireSellIncrease) {
            try {
                await fetchOrderHistoryByApi();
            } catch (err) {
                console.error('[USDT计算器] 主动同步订单历史失败，回退点击订单历史', err);
                performRefreshClick();
            }
            calculateStats();
            return true;
        }

        beginPendingSellOrderSync(beforeOrderStats);
        let fallbackClickUsed = false;

        for (let i = 0; i < ORDER_HISTORY_SELL_SYNC_DELAYS_MS.length; i += 1) {
            await sleep(ORDER_HISTORY_SELL_SYNC_DELAYS_MS[i]);
            if (!pendingSellOrderSync) return true;

            pendingSellOrderSync.attempts += 1;
            updateAutoTradeStatus(`卖出已确认，等待订单历史同步 ${pendingSellOrderSync.attempts}`, '#2196f3');

            try {
                const latestStats = await fetchOrderHistoryAndReadStats();
                if (!pendingSellOrderSync) return true;
                if (hasSellOrderSynced(latestStats, pendingSellOrderSync.baselineStats)) {
                    completePendingSellOrderSync('卖出订单已同步', '#4caf50');
                    return true;
                }
            } catch (err) {
                pendingSellOrderSync.lastError = err && err.message ? err.message : String(err);
                console.error('[USDT计算器] 主动同步订单历史失败', err);

                if (!fallbackClickUsed) {
                    fallbackClickUsed = true;
                    updateAutoTradeStatus('订单历史 API 失败，回退点击刷新', '#ff9800');
                    performRefreshClick();
                    await sleep(2500);
                    const latestStats = readOrderVolumeStats();
                    calculateStats();
                    if (!pendingSellOrderSync) return true;
                    if (hasSellOrderSynced(latestStats, pendingSellOrderSync.baselineStats)) {
                        completePendingSellOrderSync('卖出订单已同步', '#4caf50');
                        return true;
                    }
                }
            }
        }

        updateAutoTradeStatus('卖出已确认，订单历史延迟，暂停自动交易', '#ff9800');
        startBackgroundSellOrderSync();
        if (isAutoTrading) stopAutoTrade('卖出已确认，等待订单历史同步');
        return false;
    }

    function updateAutoTradeStatus(message, color) {
        const status = document.getElementById('auto-trade-status');
        if (!status) return;
        const officialColorMap = {
            '#4caf50': '#a5ff00',
            '#ff5252': '#fc46ab',
            '#ff9800': '#909090',
            '#2196f3': '#e6e6e6',
            '#aaa': '#909090'
        };
        status.textContent = message;
        status.style.color = officialColorMap[color] || color || '#909090';
    }

    function clearAutoTradeResumeState() {
        window.localStorage.removeItem(LS_KEY_AUTO_TRADE_RESUME);
    }

    function readAutoTradeResumeState() {
        let payload = null;
        try {
            payload = JSON.parse(window.localStorage.getItem(LS_KEY_AUTO_TRADE_RESUME) || 'null');
        } catch (err) {
            clearAutoTradeResumeState();
            return null;
        }

        if (!payload || payload.resume !== true) return null;
        if (payload.href !== window.location.href) {
            clearAutoTradeResumeState();
            return null;
        }

        const ts = Number(payload.ts) || 0;
        if (!ts || Date.now() - ts > AUTO_TRADE_RESUME_TTL_MS) {
            clearAutoTradeResumeState();
            return null;
        }

        return payload;
    }

    function saveAutoTradeResumeState(reason) {
        const count = autoTradeRecoveryReloads + 1;
        const payload = {
            resume: true,
            href: window.location.href,
            side: 'sell',
            forceSellBeforeStop: true,
            count,
            reason: reason || '',
            ts: Date.now()
        };
        window.localStorage.setItem(LS_KEY_AUTO_TRADE_RESUME, JSON.stringify(payload));
        autoTradeRecoveryReloads = count;
        return payload;
    }

    function setAutoTradeButtonRunning() {
        const btn = document.getElementById('btn-auto-trade');
        if (btn) {
            btn.textContent = '停止 Boost 交易';
            btn.style.background = '#351520';
            btn.style.color = '#fc46ab';
        }
    }

    function setAutoTradeButtonStopped() {
        const btn = document.getElementById('btn-auto-trade');
        if (btn) {
            btn.textContent = '启动 Boost 交易';
            btn.style.background = '#a5ff00';
            btn.style.color = '#0e0e0e';
        }
    }

    function requestAutoTradePageReload(reason) {
        if (autoTradeRecoveryReloads >= MAX_AUTO_TRADE_RELOAD_RECOVERIES) {
            clearAutoTradeResumeState();
            return false;
        }

        const payload = saveAutoTradeResumeState(reason);
        isAutoTradeReloading = true;
        updateAutoTradeStatus(`卖出无反应，刷新网页后继续 (${payload.count}/${MAX_AUTO_TRADE_RELOAD_RECOVERIES})`, '#ff9800');

        if (autoTradeTimerId) {
            clearTimeout(autoTradeTimerId);
            autoTradeTimerId = null;
        }

        window.setTimeout(() => {
            if (isAutoTradeReloading) window.location.reload();
        }, AUTO_TRADE_RELOAD_DELAY_MS);

        return true;
    }

    function resumeAutoTradeAfterReload() {
        const payload = readAutoTradeResumeState();
        if (!payload) return false;

        clearAutoTradeResumeState();
        autoTradeRecoveryReloads = Number(payload.count) || 0;
        isAutoTrading = true;
        isAutoTradeReloading = false;
        autoTradeSide = payload.side === 'buy' ? 'buy' : 'sell';
        activeTradeExecutorMode = 'instant';
        forceSellBeforeStop = payload.forceSellBeforeStop !== false;
        oneClickTradeOpenAttempted = false;
        consecutiveTradeFailures = 0;
        lastSwapFormContainer = null;
        setAutoTradeButtonRunning();
        updateAutoTradeStatus('网页已重新加载，继续执行 100% 卖出', '#2196f3');
        autoTradeTimerId = setTimeout(runAutoTradeLoop, AUTO_TRADE_RELOAD_RESUME_DELAY_MS);
        return true;
    }

    function getAutoTradeConfig() {
        const buyIndexInput = document.getElementById('buy-option-index');
        let buyOptionIndex = parseInt(buyIndexInput && buyIndexInput.value, 10);

        if (!Number.isFinite(buyOptionIndex) || buyOptionIndex < 1) buyOptionIndex = 3;
        if (buyIndexInput) buyIndexInput.value = buyOptionIndex;

        return { buyOptionIndex };
    }

    function toggleAutoTrade() {
        if (isAutoTrading) {
            stopAutoTrade('已手动停止');
            return;
        }

        startAutoTrade('已启动，准备买入');
    }

    function startAutoTrade(startMessage = '已启动，准备买入', options = {}) {
        if (isAutoTrading) {
            updateAutoTradeStatus('自动交易已在运行', '#ff9800');
            return false;
        }

        if (hasVisibleLegacyUserscriptPanel()) {
            updateAutoTradeStatus('检测到旧篡改猴脚本，请先停用后再启动扩展自动交易', '#ff5252');
            return false;
        }

        const target = getBoostTarget();
        if (!Number.isFinite(target)) {
            updateAutoTradeStatus('实际需刷量无效，无法启动', '#ff5252');
            if (options.fromSchedule) updateScheduledAutoTradeStatus('定时启动失败：实际需刷量无效', '#fc46ab');
            clearScheduledAutoTrade(null);
            return false;
        }

        if (!options.fromSchedule && scheduledAutoTradeEndAt) clearScheduledAutoTrade('自动交易已启动，定时已取消');

        getAutoTradeConfig();
        clearAutoTradeResumeState();
        isAutoTrading = true;
        autoTradeSide = 'buy';
        oneClickTradeOpenAttempted = false;
        consecutiveTradeFailures = 0;
        forceSellBeforeStop = false;
        autoTradeRecoveryReloads = 0;
        isAutoTradeReloading = false;
        activeTradeExecutorMode = 'instant';
        setAutoTradeButtonRunning();

        updateAutoTradeStatus(startMessage, '#4caf50');
        if (options.fromSchedule) updateScheduledAutoTradeStatus('已定时启动自动交易', '#a5ff00');
        runAutoTradeLoop();
        return true;
    }

    function stopAutoTrade(reason) {
        const stopReason = reason || '已停止';
        isAutoTrading = false;
        isAutoTradeReloading = false;
        forceSellBeforeStop = false;
        clearAutoTradeResumeState();
        if (autoTradeTimerId) {
            clearTimeout(autoTradeTimerId);
            autoTradeTimerId = null;
        }

        setAutoTradeButtonStopped();

        updateAutoTradeStatus(stopReason, '#ff9800');
        syncDataOnAutoTradeStop(stopReason);
    }

    function findElementByText(text, selector = 'button, [role="button"], [role="tab"], div, span') {
        const elements = Array.from(document.querySelectorAll(selector));
        for (let i = elements.length - 1; i >= 0; i--) {
            const el = elements[i];
            if (!isVisible(el)) continue;
            if (normalizeText(el.innerText || el.textContent) !== text) continue;
            return el.closest('button, [role="button"], [role="tab"]') || el;
        }
        return null;
    }

    function findElementByTextPattern(pattern, selector = 'button, [role="button"], [role="tab"], div, span') {
        const elements = Array.from(document.querySelectorAll(selector));
        for (let i = elements.length - 1; i >= 0; i--) {
            const el = elements[i];
            if (!isVisible(el)) continue;

            const text = normalizeText(el.innerText || el.textContent);
            if (!pattern.test(text)) continue;

            return el.closest('button, [role="button"], [role="tab"]') || el;
        }
        return null;
    }

    function dispatchMouseLikeEvent(target, eventName, rect) {
        const eventOptions = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            screenX: window.screenX + rect.left + rect.width / 2,
            screenY: window.screenY + rect.top + rect.height / 2,
            button: 0,
            buttons: eventName.includes('down') ? 1 : 0
        };

        if (eventName.startsWith('pointer') && typeof PointerEvent === 'function') {
            target.dispatchEvent(new PointerEvent(eventName, {
                ...eventOptions,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true
            }));
            return;
        }

        target.dispatchEvent(new MouseEvent(eventName, eventOptions));
    }

    function triggerRealClick(el) {
        if (!el) return false;
        const calculatorPanel = document.getElementById('okx-usdt-calculator');
        const originalPointerEvents = calculatorPanel ? calculatorPanel.style.pointerEvents : '';
        if (calculatorPanel && !calculatorPanel.contains(el)) {
            calculatorPanel.style.pointerEvents = 'none';
        }

        try {
            const rect = el.getBoundingClientRect();
            const clickTargets = [el];
            const contentNode = el.querySelector && el.querySelector('.l5GPKh__dex, .btn-content, div, span');
            if (contentNode) clickTargets.push(contentNode);

            const pointTarget = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            if (pointTarget && !clickTargets.includes(pointTarget)) {
                clickTargets.unshift(pointTarget);
            }

            if (el.focus) el.focus();

            clickTargets.forEach((target) => {
                ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((eventName) => {
                    dispatchMouseLikeEvent(target, eventName, rect);
                });
            });

            if (typeof el.click === 'function') el.click();
            return true;
        } finally {
            if (calculatorPanel && !calculatorPanel.contains(el)) {
                calculatorPanel.style.pointerEvents = originalPointerEvents;
            }
        }
    }

    function isDisabledButton(el) {
        if (!el) return true;
        const button = el.closest('button') || el;
        return button.disabled ||
            button.getAttribute('aria-disabled') === 'true' ||
            /\bdisabled\b/i.test(button.className || '');
    }

    function isDomDisabledButton(el) {
        if (!el) return true;
        const button = el.closest('button') || el;
        return Boolean(button.disabled) ||
            button.hasAttribute('disabled') ||
            button.getAttribute('aria-disabled') === 'true';
    }

    async function selectTradeTab(side) {
        if (activeTradeExecutorMode === 'sidebar') {
            return selectSidebarTradeTab(side);
        }

        const tabText = side === 'buy' ? '买入' : '卖出';
        const tab = findElementByText(tabText, '[role="tab"], button[aria-selected], button[aria-controls]');
        if (!tab) return false;

        triggerRealClick(tab);
        await sleep(300);
        return true;
    }

    async function ensureInstantTradePanelOpenOnce() {
        if (getActiveInstantTradePanels().length > 0) {
            oneClickTradeOpenAttempted = false;
            return true;
        }

        if (oneClickTradeOpenAttempted) {
            await sleep(300);
            return getActiveInstantTradePanels().length > 0;
        }

        oneClickTradeOpenAttempted = true;
        const oneClickTradeButton = findElementByText('一键买卖', 'button, [role="button"]');
        if (!oneClickTradeButton || isDisabledButton(oneClickTradeButton)) {
            updateAutoTradeStatus('一键买卖按钮未找到', '#ff9800');
            return false;
        }

        updateAutoTradeStatus('交易面板未开启，点击一次一键买卖', '#2196f3');
        triggerRealClick(oneClickTradeButton);

        const deadline = Date.now() + 3500;
        while (isAutoTrading && Date.now() < deadline) {
            await sleep(250);
            if (getActiveInstantTradePanels().length > 0) {
                oneClickTradeOpenAttempted = false;
                return true;
            }
        }

        return false;
    }

    function findElementByTextInScope(scope, text, selector = 'button, [role="button"], [role="tab"], div, span') {
        const elements = Array.from((scope || document).querySelectorAll(selector));
        for (let i = elements.length - 1; i >= 0; i--) {
            const el = elements[i];
            if (!isVisible(el)) continue;
            if (normalizeText(el.innerText || el.textContent) !== text) continue;
            return el.closest('button, [role="button"], [role="tab"]') || el;
        }
        return null;
    }

    function getSidebarTradePanel() {
        const ownPanel = document.getElementById('okx-usdt-calculator');
        const candidates = Array.from(document.querySelectorAll('aside, section, div[class]'))
            .filter((el) => {
                if (!el || !isVisible(el) || (ownPanel && (el === ownPanel || ownPanel.contains(el) || el.contains(ownPanel)))) return false;

                const rect = el.getBoundingClientRect();
                if (rect.width < 240 || rect.height < 260) return false;
                if (rect.left < Math.max(280, window.innerWidth * 0.42)) return false;

                const text = normalizeText(el.innerText || el.textContent);
                if (!text.includes('买入') || !text.includes('卖出')) return false;
                if (!/(市价|限价|拆单|数量|最大|Pilot|动态)/.test(text)) return false;

                return Boolean(findElementByTextInScope(el, '买入')) &&
                    Boolean(findElementByTextInScope(el, '卖出')) &&
                    Array.from(el.querySelectorAll('button')).some(isVisible);
            })
            .sort((a, b) => {
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                return rb.left - ra.left || (rb.width * rb.height) - (ra.width * ra.height);
            });

        return candidates[0] || null;
    }

    async function ensureSidebarTradePanelAvailable() {
        const panel = getSidebarTradePanel();
        if (!panel) return false;
        activeTradeExecutorMode = 'sidebar';
        updateAutoTradeStatus('一键买卖不可用，启用右侧栏兜底', '#ff9800');
        return true;
    }

    async function ensureTradeExecutorMode() {
        if (await ensureInstantTradePanelOpenOnce()) {
            activeTradeExecutorMode = 'instant';
            return 'instant';
        }

        if (await ensureSidebarTradePanelAvailable()) return 'sidebar';
        return '';
    }

    async function selectSidebarTradeTab(side) {
        const panel = getSidebarTradePanel();
        if (!panel) return false;

        const tabText = side === 'buy' ? '买入' : '卖出';
        const panelRect = panel.getBoundingClientRect();
        const tab = Array.from(panel.querySelectorAll('button, [role="button"], [role="tab"], div, span'))
            .filter(isVisible)
            .map((element) => ({
                element: element.closest('button, [role="button"], [role="tab"]') || element,
                text: normalizeText(element.innerText || element.textContent),
                rect: element.getBoundingClientRect()
            }))
            .filter((item) => item.text === tabText && item.rect.top <= panelRect.top + 120)
            .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)[0]?.element || null;
        if (!tab || isDisabledButton(tab)) return false;

        triggerRealClick(tab);
        await sleep(350);
        return true;
    }

    function getVisibleOptionGroups() {
        return Array.from(document.querySelectorAll('.options-wrapper, [class*="options-wrapper"]'))
            .filter(isVisible)
            .map((wrapper) => ({
                wrapper,
                buttons: Array.from(wrapper.querySelectorAll('button')).filter(isVisible)
            }))
            .filter((group) => group.buttons.length > 0);
    }

    function getButtonText(button) {
        return normalizeText(button.innerText || button.textContent);
    }

    function hasClassLike(el, classPart) {
        return String((el && el.className) || '').includes(classPart);
    }

    function findSwapFormContainer(el) {
        let node = el;
        while (node && node !== document.body) {
            if (node.querySelector) {
                const hasBuyButtons = node.querySelector('button[class*="Cg7h1c"]');
                const hasSellButtons = node.querySelector('button[class*="ODJ17x"]');
                if (hasBuyButtons && hasSellButtons) return node;
            }
            node = node.parentElement;
        }
        return null;
    }

    function rememberSwapFormFromButton(button) {
        const container = findSwapFormContainer(button);
        if (container) lastSwapFormContainer = container;
    }

    function getActiveInstantTradePanels() {
        const panels = new Set();

        Array.from(document.querySelectorAll('.cIknRK__dex, [class*="cIknRK"], [role="button"][tabindex="-1"]'))
            .filter(isVisible)
            .forEach((panel) => {
                if (panel.querySelector('.instant-trade-token-selector-0') &&
                    panel.querySelector('.instant-trade-token-selector-1')) {
                    panels.add(panel);
                }
            });

        Array.from(document.querySelectorAll('.instant-trade-token-selector-0'))
            .filter(isVisible)
            .forEach((selector) => {
                const formContainer = findSwapFormContainer(selector);
                if (formContainer && isVisible(formContainer) &&
                    formContainer.querySelector('.instant-trade-token-selector-1')) {
                    panels.add(formContainer);
                    return;
                }

                let node = selector.parentElement;
                while (node && node !== document.body) {
                    if (isVisible(node) &&
                        node.querySelector('.instant-trade-token-selector-1') &&
                        node.querySelector('button[class*="Cg7h1c"]') &&
                        node.querySelector('button[class*="ODJ17x"]')) {
                        panels.add(node);
                        return;
                    }
                    node = node.parentElement;
                }
            });

        return Array.from(panels).sort((a, b) => {
            const zA = parseInt(window.getComputedStyle(a).zIndex, 10) || 0;
            const zB = parseInt(window.getComputedStyle(b).zIndex, 10) || 0;
            return zB - zA;
        });
    }

    function findInstantTradeSection(panel, side) {
        const tokenSelector = panel.querySelector(side === 'buy'
            ? '.instant-trade-token-selector-0'
            : '.instant-trade-token-selector-1');
        const sideClass = side === 'buy' ? 'Cg7h1c' : 'ODJ17x';

        let node = tokenSelector;
        while (node && node !== panel.parentElement) {
            if (node.querySelector && node.querySelector(`button[class*="${sideClass}"]`)) {
                return node;
            }
            node = node.parentElement;
        }

        return panel;
    }

    function getPanelOptionButtonsBySide(side) {
        const sideClass = side === 'buy' ? 'Cg7h1c' : 'ODJ17x';
        const panels = getActiveInstantTradePanels();

        for (const panel of panels) {
            const section = findInstantTradeSection(panel, side);
            const buttons = Array.from(section.querySelectorAll(`button[class*="${sideClass}"]`))
                .filter(isVisible)
                .filter((button) => hasClassLike(button, 'dex-plain-button') || hasClassLike(button, 'VmOKPA'));

            if (buttons.length > 0) {
                lastSwapFormContainer = panel;
                return buttons;
            }
        }

        return [];
    }

    function isDexPlainOptionGroup(group, side) {
        const sideClass = side === 'buy' ? 'Cg7h1c' : 'ODJ17x';
        const wrapperIsTargetLayer = hasClassLike(group.wrapper, 'IZrTZc');
        const hasPlainButton = group.buttons.some((button) => {
            return hasClassLike(button, 'dex-plain-button') ||
                hasClassLike(button, 'VmOKPA') ||
                hasClassLike(button, sideClass);
        });

        return wrapperIsTargetLayer || hasPlainButton;
    }

    function getTargetOptionGroups(side) {
        const groups = getVisibleOptionGroups();
        const matchingTextGroups = groups.filter((group) => {
            const texts = group.buttons.map(getButtonText).filter(Boolean);
            if (texts.length === 0) return false;
            return side === 'buy'
                ? texts.every((text) => !text.includes('%'))
                : texts.some((text) => text.includes('%'));
        });

        const plainGroups = matchingTextGroups.filter((group) => isDexPlainOptionGroup(group, side));
        if (plainGroups.length > 0) return plainGroups;

        return matchingTextGroups.filter((group) => {
            return group.buttons.every((button) => {
                return !hasClassLike(button, 'dex-btn') && !hasClassLike(button, 'dex-button-var');
            });
        });
    }

    function getPlainOptionButtonsBySide(side, scope = document) {
        const sideClass = side === 'buy' ? 'Cg7h1c' : 'ODJ17x';
        return Array.from(scope.querySelectorAll(`button[class*="${sideClass}"]`))
            .filter(isVisible);
    }

    function clickButtonAndRemember(button) {
        rememberSwapFormFromButton(button);
        return triggerRealClick(button);
    }

    function clickSellButton(button, source) {
        updateAutoTradeStatus(`找到卖出100%按钮，点击中 (${source})`, '#2196f3');
        return clickButtonAndRemember(button);
    }

    function clickBuyAmountButton() {
        const { buyOptionIndex } = getAutoTradeConfig();
        const panelButtons = getPanelOptionButtonsBySide('buy');

        if (panelButtons.length > 0) {
            const panelIndex = Math.min(buyOptionIndex - 1, panelButtons.length - 1);
            return clickButtonAndRemember(panelButtons[panelIndex]);
        }

        const directButtons = getPlainOptionButtonsBySide('buy');

        if (directButtons.length > 0) {
            const directIndex = Math.min(buyOptionIndex - 1, directButtons.length - 1);
            return clickButtonAndRemember(directButtons[directIndex]);
        }

        const buyGroups = getTargetOptionGroups('buy');

        const group = buyGroups[buyGroups.length - 1];
        if (!group) return false;

        const index = Math.min(buyOptionIndex - 1, group.buttons.length - 1);
        return clickButtonAndRemember(group.buttons[index]);
    }

    function clickSellAllButton() {
        const panelButtons = getPanelOptionButtonsBySide('sell');
        const panelExactButton = panelButtons.find((button) => getButtonText(button) === '100%');
        if (panelExactButton) return clickSellButton(panelExactButton, 'instant-panel-ODJ17x');
        if (panelButtons.length > 0) return clickSellButton(panelButtons[panelButtons.length - 1], 'instant-panel-last-ODJ17x');

        const scopes = [];
        if (lastSwapFormContainer && document.contains(lastSwapFormContainer) && isVisible(lastSwapFormContainer)) {
            scopes.push(lastSwapFormContainer);
        }
        scopes.push(document);

        for (const scope of scopes) {
            const directButtons = getPlainOptionButtonsBySide('sell', scope);
            const directExactButton = directButtons.find((button) => getButtonText(button) === '100%');
            if (directExactButton) return clickSellButton(directExactButton, scope === document ? 'document-ODJ17x' : 'same-card-ODJ17x');
            if (directButtons.length > 0) return clickSellButton(directButtons[directButtons.length - 1], scope === document ? 'document-last-ODJ17x' : 'same-card-last-ODJ17x');
        }

        const exactTextButtons = Array.from(document.querySelectorAll('button'))
            .filter(isVisible)
            .filter((button) => getButtonText(button) === '100%')
            .filter((button) => !hasClassLike(button, 'dex-btn') && !hasClassLike(button, 'dex-button-var'));

        if (exactTextButtons.length > 0) {
            const scopedButton = exactTextButtons.find((button) => {
                return lastSwapFormContainer && lastSwapFormContainer.contains(button);
            });
            return clickSellButton(scopedButton || exactTextButtons[exactTextButtons.length - 1], scopedButton ? 'same-card-text' : 'document-text');
        }

        const sellGroups = getTargetOptionGroups('sell');

        const group = sellGroups[sellGroups.length - 1];
        if (!group) return false;

        const exactButton = group.buttons.find((button) => getButtonText(button) === '100%');
        return clickSellButton(exactButton || group.buttons[group.buttons.length - 1], 'fallback-group');
    }

    function getSidebarOptionButtons(side) {
        const panel = getSidebarTradePanel();
        if (!panel) return [];

        const groups = Array.from(panel.querySelectorAll('.options-wrapper, [class*="options-wrapper"]'))
            .filter(isVisible)
            .map((wrapper) => ({
                wrapper,
                buttons: Array.from(wrapper.querySelectorAll('button')).filter(isVisible)
            }))
            .filter((group) => group.buttons.length > 0)
            .filter((group) => {
                const texts = group.buttons.map(getButtonText).filter(Boolean);
                return side === 'buy'
                    ? texts.length > 0 && texts.every((text) => !text.includes('%'))
                    : texts.some((text) => text.includes('%'));
            });

        const group = groups[groups.length - 1];
        return group ? group.buttons : [];
    }

    function clickSidebarBuyAmountButton() {
        const { buyOptionIndex } = getAutoTradeConfig();
        const buttons = getSidebarOptionButtons('buy');
        if (buttons.length === 0) return false;

        const index = Math.min(buyOptionIndex - 1, buttons.length - 1);
        updateAutoTradeStatus(`右侧栏买入序号 ${index + 1}`, '#2196f3');
        return triggerRealClick(buttons[index]);
    }

    function clickSidebarSellAmountButton() {
        const panel = getSidebarTradePanel();
        if (!panel) return false;

        const percentButtons = getSidebarOptionButtons('sell');
        const exactPercent = percentButtons.find((button) => getButtonText(button) === '100%');
        if (exactPercent || percentButtons.length > 0) {
            updateAutoTradeStatus('右侧栏点击 100% 卖出数量', '#2196f3');
            return triggerRealClick(exactPercent || percentButtons[percentButtons.length - 1]);
        }

        const maxButton = findElementByTextInScope(panel, '最大', 'button, [role="button"], div, span');
        if (maxButton && !isDisabledButton(maxButton)) {
            updateAutoTradeStatus('右侧栏点击最大卖出数量', '#2196f3');
            return triggerRealClick(maxButton);
        }

        return Boolean(findSidebarSubmitButton('sell'));
    }

    function findSidebarSubmitButton(side, options = {}) {
        const panel = getSidebarTradePanel();
        const includeDisabled = Boolean(options.includeDisabled);
        const sideText = side === 'buy' ? '买入' : '卖出';
        const isSubmitText = (text) => side === 'buy'
            ? text.startsWith('买入')
            : text.startsWith('卖出') || text.startsWith('兑换为');
        const panelRect = panel ? panel.getBoundingClientRect() : null;
        const rightAreaLeft = panelRect
            ? Math.max(280, Math.min(window.innerWidth * 0.42, panelRect.left - 180))
            : Math.max(280, window.innerWidth * 0.42);
        const ownPanel = document.getElementById('okx-usdt-calculator');

        return Array.from(document.querySelectorAll('button, [role="button"]'))
            .filter(isVisible)
            .filter((button) => !ownPanel || !ownPanel.contains(button))
            .map((button) => ({
                button,
                text: getButtonText(button),
                rect: button.getBoundingClientRect(),
                disabled: isDomDisabledButton(button)
            }))
            .filter((item) => {
                if (!isSubmitText(item.text)) return false;
                if (item.rect.left < rightAreaLeft) return false;
                if (panelRect && item.text === sideText && item.rect.top <= panelRect.top + 120) return false;
                return item.rect.width >= 120 && item.rect.height >= 28;
            })
            .filter((item) => includeDisabled || !item.disabled)
            .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height || b.rect.top - a.rect.top)[0]?.button || null;
    }

    async function clickSidebarSubmitButton(side, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        const sideText = side === 'buy' ? '买入' : '卖出';
        let lastWaitingStatusAt = 0;

        while (isAutoTrading && Date.now() < deadline) {
            const submitButton = findSidebarSubmitButton(side, { includeDisabled: true });
            if (submitButton && !isDomDisabledButton(submitButton)) {
                updateAutoTradeStatus(`右侧栏点击${sideText}按钮`, '#2196f3');
                return triggerRealClick(submitButton);
            }

            if (submitButton && Date.now() - lastWaitingStatusAt > 1000) {
                updateAutoTradeStatus(`等待右侧栏${sideText}按钮可用`, '#2196f3');
                lastWaitingStatusAt = Date.now();
            }
            await sleep(300);
        }

        return false;
    }

    async function clickTradeAmountButton(side, timeoutMs, mode = activeTradeExecutorMode) {
        const deadline = Date.now() + timeoutMs;

        while (isAutoTrading && Date.now() < deadline) {
            const clicked = mode === 'sidebar'
                ? (side === 'buy' ? clickSidebarBuyAmountButton() : clickSidebarSellAmountButton())
                : (side === 'buy' ? clickBuyAmountButton() : clickSellAllButton());
            if (clicked) return true;
            if (mode === 'sidebar') {
                await selectSidebarTradeTab(side);
            } else {
                await ensureInstantTradePanelOpenOnce();
            }
            await sleep(300);
        }

        return false;
    }

    async function recoverInstantTradePanel() {
        oneClickTradeOpenAttempted = false;
        lastSwapFormContainer = null;
        await sleep(500);
        if (activeTradeExecutorMode === 'sidebar') {
            return Boolean(getSidebarTradePanel());
        }
        return ensureInstantTradePanelOpenOnce();
    }

    async function handleTradeInterruptions() {
        const bodyText = document.body ? document.body.innerText : '';

        if (bodyText.includes('第三方合约执行失败')) {
            const cancelButton = findElementByText('取消') || findElementByText('确定');
            if (cancelButton) triggerRealClick(cancelButton);
            updateAutoTradeStatus('第三方合约执行失败，恢复交易入口后继续', '#ff9800');
            await recoverInstantTradePanel();
            return 'contract_failed';
        }

        if (bodyText.includes('报价已过期，请刷新以获取最新报价。') || bodyText.includes('报价已过期')) {
            const refreshButton = findElementByText('刷新') || findElementByText('确定') || findElementByText('取消');
            if (refreshButton) triggerRealClick(refreshButton);
            await sleep(1000);
            return 'quote_expired';
        }

        return '';
    }

    function getTradeStatusFlags() {
        const ownPanel = document.getElementById('okx-usdt-calculator');
        const notificationTitles = Array.from(document.querySelectorAll('.dex-notification-stack-title'));
        const candidates = [
            ...notificationTitles,
            ...Array.from(document.querySelectorAll('[class*="notification"], [class*="toast"], [class*="message"], [role="alert"]'))
        ]
            .filter((element) => {
                if (!element || (ownPanel && ownPanel.contains(element))) return false;
                const text = normalizeText(element.innerText || element.textContent);
                if (!/(交易(已提交|成功|失败)|第三方合约执行失败|数量不能为\s*0|余额不足|insufficient\s+balance)/i.test(text)) return false;
                if (text.length > 180 || !isVisible(element)) return false;

                const rect = element.getBoundingClientRect();
                const style = window.getComputedStyle(element);
                const className = String(element.className || '').toLowerCase();
                const isOfficialTitle = className.includes('dex-notification-stack-title');
                const toastLike = isOfficialTitle ||
                    style.position === 'fixed' ||
                    style.position === 'sticky' ||
                    rect.top < Math.max(220, window.innerHeight * 0.28) ||
                    className.includes('toast') ||
                    className.includes('message') ||
                    className.includes('notice') ||
                    className.includes('notification');

                return toastLike && rect.width > 40 && rect.height > 12;
            })
            .map((element) => ({
                text: normalizeText(element.innerText || element.textContent),
                rect: element.getBoundingClientRect(),
                official: String(element.className || '').toLowerCase().includes('dex-notification-stack-title')
            }))
            .sort((a, b) => Number(b.official) - Number(a.official) || a.rect.top - b.rect.top || a.text.length - b.text.length);

        const normalized = candidates.length > 0 ? candidates[0].text : '';
        const signature = candidates
            .map((candidate) => candidate.text)
            .filter(Boolean)
            .join('|');
        return {
            text: normalized,
            signature,
            submitted: signature.includes('交易已提交'),
            success: signature.includes('交易成功'),
            failed: signature.includes('交易失败'),
            contractFailed: signature.includes('第三方合约执行失败'),
            zeroAmount: /数量不能为\s*0/.test(signature),
            insufficientBalance: /余额不足|insufficient\s+balance/i.test(signature)
        };
    }

    async function waitForTradeResult(side, beforeFlags, timeoutMs = TRADE_STATUS_TIMEOUT_MS) {
        const label = side === 'buy' ? '买入' : '卖出';
        let deadline = Date.now() + timeoutMs;
        let sawSubmitted = false;
        let lastStatusAt = 0;

        while (isAutoTrading && Date.now() < deadline) {
            const interruption = await handleTradeInterruptions();
            if (interruption === 'contract_failed') {
                return { ok: false, state: 'contract_failed', message: `${label}第三方合约执行失败，继续${label}` };
            }

            const flags = getTradeStatusFlags();
            const textChanged = flags.signature !== beforeFlags.signature;

            if (!flags.text && beforeFlags.text) {
                beforeFlags = { text: '', signature: '', submitted: false, success: false, failed: false, contractFailed: false, zeroAmount: false, insufficientBalance: false };
            }

            if (side === 'sell' && flags.zeroAmount && (textChanged || !beforeFlags.zeroAmount)) {
                return { ok: true, state: 'empty_sell', message: '卖出数量为 0，按已卖出处理' };
            }

            if (side === 'buy' && flags.insufficientBalance && (textChanged || !beforeFlags.insufficientBalance)) {
                return { ok: false, state: 'insufficient_balance', message: 'USDT 余额不足，先尝试卖出' };
            }

            if (flags.contractFailed && (textChanged || !beforeFlags.contractFailed)) {
                await recoverInstantTradePanel();
                return { ok: false, state: 'contract_failed', message: `${label}第三方合约执行失败，继续${label}` };
            }

            if (flags.submitted && (textChanged || !beforeFlags.submitted)) {
                sawSubmitted = true;
                deadline = Math.max(deadline, Date.now() + TRADE_SUBMITTED_STATUS_TIMEOUT_MS);
                if (Date.now() - lastStatusAt > 800) {
                    updateAutoTradeStatus(`${label}交易已提交，等待结果`, '#2196f3');
                    lastStatusAt = Date.now();
                }
            }

            if (flags.failed && (sawSubmitted || textChanged || !beforeFlags.failed)) {
                return { ok: false, state: 'failed', message: `${label}交易失败，准备重试` };
            }

            if (flags.success && (sawSubmitted || textChanged || !beforeFlags.success)) {
                return { ok: true, state: 'success', message: `${label}交易成功` };
            }

            await sleep(350);
        }

        return {
            ok: false,
            state: sawSubmitted ? 'timeout_after_submit' : 'timeout',
            message: sawSubmitted ? `${label}已提交但未确认结果` : `${label}未检测到交易状态`
        };
    }

    async function waitForSummaryValueChange(key, previousValues, timeoutMs) {
        if (isTradeStatsPaused) return false;

        const deadline = Date.now() + timeoutMs;
        let lastOfficialBoostRefreshAt = 0;
        const rawPreviousOfficialBoostTotal = previousValues && previousValues.order && previousValues.order.officialBoostTotal;
        const previousOfficialBoostTotal = Number(rawPreviousOfficialBoostTotal);
        const hasPreviousOfficialBoostTotal = rawPreviousOfficialBoostTotal !== null &&
            rawPreviousOfficialBoostTotal !== undefined &&
            Number.isFinite(previousOfficialBoostTotal);

        while (isAutoTrading && Date.now() < deadline) {
            await sleep(1000);
            if (Date.now() - lastOfficialBoostRefreshAt > 4000) {
                lastOfficialBoostRefreshAt = Date.now();
                await refreshOfficialBoostRecordsAfterTrade();
            }
            const orderStats = calculateStats();
            const dexStats = readDexVolumeStats();
            const latestOfficialBoostTotal = Number(orderStats.officialBoostTotal);

            if (orderStats[key] > previousValues.order[key] + 0.000001) return true;
            if (dexStats[key] > previousValues.dex[key] + 0.000001) return true;
            if (hasPreviousOfficialBoostTotal &&
                Number.isFinite(latestOfficialBoostTotal) &&
                latestOfficialBoostTotal > previousOfficialBoostTotal + 0.000001) return true;
        }

        return false;
    }

    async function executeTradeSide(side, options = {}) {
        const label = side === 'buy' ? '买入' : '卖出';
        const key = side === 'buy' ? 'buy' : 'sell';
        const beforeStats = {
            order: calculateStats(),
            dex: readDexVolumeStats()
        };
        const requireSummaryChange = !isTradeStatsPaused && (side === 'sell' || Boolean(options.requireSummaryChange));

        updateAutoTradeStatus(`${label}准备中`, '#2196f3');
        const tradeMode = await ensureTradeExecutorMode();
        if (!tradeMode) {
            updateAutoTradeStatus('交易入口未找到，一键买卖和右侧栏均不可用', '#ff5252');
            return false;
        }

        await selectTradeTab(side);
        await sleep(500);

        let beforeTradeStatus = getTradeStatusFlags();
        const selected = await clickTradeAmountButton(side, 8000, tradeMode);
        if (!selected) {
            updateAutoTradeStatus(`${label}金额按钮未找到`, '#ff5252');
            return false;
        }

        if (tradeMode === 'sidebar') {
            await sleep(500);
            beforeTradeStatus = getTradeStatusFlags();
            const submitted = await clickSidebarSubmitButton(side, 8000);
            if (!submitted) {
                updateAutoTradeStatus(`右侧栏${label}按钮未找到或未启用`, '#ff5252');
                return false;
            }
        }

        updateAutoTradeStatus(
            tradeMode === 'sidebar'
                ? (side === 'sell' ? '已点击右侧栏卖出，等待卖出结果' : '已点击右侧栏买入，等待买入结果')
                : (side === 'sell' ? '已点击 100%，等待卖出结果' : '已点击买入金额，等待买入结果'),
            '#2196f3'
        );
        const tradeResult = await waitForTradeResult(side, beforeTradeStatus);
        if (side === 'sell' && tradeResult.ok && tradeResult.state === 'empty_sell') {
            await refreshOrderHistoryAfterConfirmedSell(beforeStats.order, { requireSellIncrease: false });
            await refreshOfficialBoostRecordsAfterTrade();
            calculateStats();
            updateAutoTradeStatus(tradeResult.message, '#4caf50');
            return true;
        }

        if (!tradeResult.ok) {
            if (side === 'buy' && tradeResult.state === 'insufficient_balance') {
                forceSellBeforeStop = true;
                autoTradeSide = 'sell';
                updateAutoTradeStatus('USDT 余额不足，下一步执行 100% 卖出', '#ff9800');
                return false;
            }

            const changedAfterFailure = !isTradeStatsPaused && (await waitForSummaryValueChange(key, beforeStats, 8000));
            if (changedAfterFailure) {
                if (side === 'sell') {
                    const synced = await refreshOrderHistoryAfterConfirmedSell(beforeStats.order);
                    if (!synced) return true;
                }
                await refreshOfficialBoostRecordsAfterTrade();
                calculateStats();
                updateAutoTradeStatus(`${label}统计已变化，按成功处理`, '#4caf50');
                return true;
            }

            updateAutoTradeStatus(tradeResult.message, '#ff9800');
            return false;
        }

        if (side === 'sell') {
            const synced = await refreshOrderHistoryAfterConfirmedSell(beforeStats.order);
            if (!synced) return true;
        }

        await refreshOfficialBoostRecordsAfterTrade();

        if (requireSummaryChange) {
            const changed = await waitForSummaryValueChange(key, beforeStats, 8000);
            if (!changed) {
                updateAutoTradeStatus(`${label}成功，统计稍后刷新`, '#4caf50');
                calculateStats();
                return true;
            }
        }

        calculateStats();
        updateAutoTradeStatus(tradeResult.message, '#4caf50');
        return true;
    }

    async function runAutoTradeLoop() {
        if (!isAutoTrading) return;

        const targetVolumeStats = calculateStats();
        const targetReached = !isTradeStatsPaused && getWeightedBoostProgressStats(targetVolumeStats).reached;

        // 达量后无论下一步原本是什么，都强制最终执行 100% 卖出，避免停在买入仓位。
        const sideToRun = (targetReached || forceSellBeforeStop) ? 'sell' : autoTradeSide;
        const label = sideToRun === 'buy' ? '买入' : '卖出';

        if (targetReached) {
            updateAutoTradeStatus('已达实际需刷量，执行最终 100% 卖出', '#ff9800');
        } else if (forceSellBeforeStop) {
            updateAutoTradeStatus('先执行 100% 卖出，再判断是否继续', '#ff9800');
        }

        const success = await executeTradeSide(sideToRun, { requireSummaryChange: targetReached });
        if (!isAutoTrading) return;

        const latestTargetVolumeStats = calculateStats();

        if (!isTradeStatsPaused && sideToRun === 'sell' && success && getWeightedBoostProgressStats(latestTargetVolumeStats).reached) {
            stopAutoTrade('已达实际需刷量，并检测到卖出变化');
            return;
        }

        if (sideToRun === 'sell' && success && forceSellBeforeStop) {
            forceSellBeforeStop = false;
            consecutiveTradeFailures = 0;
            autoTradeSide = !isTradeStatsPaused && getWeightedBoostProgressStats(latestTargetVolumeStats).reached ? 'sell' : 'buy';
            updateAutoTradeStatus(
                autoTradeSide === 'buy' ? '卖出已确认，恢复买入' : '卖出已确认，等待停止',
                '#4caf50'
            );
            autoTradeTimerId = setTimeout(runAutoTradeLoop, TRADE_NEXT_STEP_COOLDOWN_MS);
            return;
        }

        if (sideToRun === 'sell' && !success && forceSellBeforeStop) {
            if (requestAutoTradePageReload('强制卖出未确认')) return;
            stopAutoTrade('卖出多次无反应，请手动核对仓位');
            return;
        }

        consecutiveTradeFailures = success ? 0 : consecutiveTradeFailures + 1;
        if (success) {
            autoTradeRecoveryReloads = 0;
            clearAutoTradeResumeState();
        }
        if (consecutiveTradeFailures >= MAX_CONSECUTIVE_TRADE_FAILURES) {
            forceSellBeforeStop = true;
            autoTradeSide = 'sell';
            updateAutoTradeStatus(`连续 ${MAX_CONSECUTIVE_TRADE_FAILURES} 次未确认，先尝试 100% 卖出`, '#ff9800');
            autoTradeTimerId = setTimeout(runAutoTradeLoop, TRADE_RETRY_COOLDOWN_MS);
            return;
        }

        autoTradeSide = success ? (sideToRun === 'buy' ? 'sell' : 'buy') : sideToRun;

        const delayMs = success ? TRADE_NEXT_STEP_COOLDOWN_MS : TRADE_RETRY_COOLDOWN_MS;
        updateAutoTradeStatus(
            success
                ? `${label}完成，准备${autoTradeSide === 'sell' ? '卖出' : '买入'}`
                : `${label}未确认，重试${autoTradeSide === 'sell' ? '卖出' : '买入'}`,
            success ? '#4caf50' : '#ff9800'
        );
        autoTradeTimerId = setTimeout(runAutoTradeLoop, delayMs);
    }

    function extractOrders(data) {
        if (Array.isArray(data)) {
            data.forEach((item) => {
                if (item && item.orderId) {
                    ordersMap.set(item.orderId, item);
                } else if (item && typeof item === 'object') {
                    extractOrders(item);
                }
            });
            return;
        }

        if (data && typeof data === 'object') {
            if (data.orderId) {
                ordersMap.set(data.orderId, data);
                return;
            }

            Object.values(data).forEach((value) => extractOrders(value));
        }
    }

    function handleOrderHistoryResponse(data) {
        if (isTradeStatsPaused) return;

        extractOrders(data);
        calculateStats();
    }

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        const url = args[0] instanceof Request ? args[0].url : String(args[0] || '');
        const boostAccountId = parseBoostRecordsAccountId(url);

        if (url.includes(ORDER_HISTORY_PATH)) {
            response.clone().json()
                .then(handleOrderHistoryResponse)
                .catch((err) => console.error('[USDT计算器] 解析订单数据出错', err));
        }

        if (boostAccountId) {
            response.clone().json()
                .then((payload) => handleBoostRecordsResponse(payload, boostAccountId, {
                    allowAccountSwitch: isBoostRecordsPage()
                }))
                .catch((err) => console.error('[USDT计算器] 解析 Boost records 数据出错', err));
        }

        return response;
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        this.addEventListener('load', function() {
            const urlText = String(url || '');
            const boostAccountId = parseBoostRecordsAccountId(urlText);

            if (urlText.includes(ORDER_HISTORY_PATH)) {
                try {
                    handleOrderHistoryResponse(JSON.parse(this.responseText));
                } catch (err) {
                    console.error('[USDT计算器] 解析 XHR 订单数据出错', err);
                }
            }

            if (boostAccountId) {
                try {
                    handleBoostRecordsResponse(JSON.parse(this.responseText), boostAccountId, {
                        allowAccountSwitch: isBoostRecordsPage()
                    });
                } catch (err) {
                    console.error('[USDT计算器] 解析 XHR Boost records 数据出错', err);
                }
            }
        });

        originalOpen.apply(this, arguments);
    };

    function getDebugButtonInfo(button, index) {
        if (!button) {
            return {
                index,
                found: false
            };
        }

        const rect = button.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const pointTarget = document.elementFromPoint(centerX, centerY);

        return {
            index,
            text: getButtonText(button),
            className: String(button.className || ''),
            disabled: isDisabledButton(button),
            domDisabled: isDomDisabledButton(button),
            rect: {
                left: Math.round(rect.left),
                top: Math.round(rect.top),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            },
            pointTargetText: pointTarget ? normalizeText(pointTarget.innerText || pointTarget.textContent).slice(0, 40) : '',
            pointTargetClass: pointTarget ? String(pointTarget.className || '') : ''
        };
    }

    window.OKX_USDT_DEBUG = function() {
        const panels = getActiveInstantTradePanels();
        const buyButtons = getPanelOptionButtonsBySide('buy');
        const sellButtons = getPanelOptionButtonsBySide('sell');
        const sidebarPanel = getSidebarTradePanel();

        return {
            panelCount: panels.length,
            autoTradeSide,
            activeTradeExecutorMode,
            sidebarPanelFound: Boolean(sidebarPanel),
            sidebarBuyButtons: getSidebarOptionButtons('buy').map(getDebugButtonInfo),
            sidebarSellButtons: getSidebarOptionButtons('sell').map(getDebugButtonInfo),
            sidebarBuySubmit: getDebugButtonInfo(findSidebarSubmitButton('buy'), -1),
            sidebarSellSubmit: getDebugButtonInfo(findSidebarSubmitButton('sell'), -1),
            sidebarBuySubmitCandidate: getDebugButtonInfo(findSidebarSubmitButton('buy', { includeDisabled: true }), -1),
            sidebarSellSubmitCandidate: getDebugButtonInfo(findSidebarSubmitButton('sell', { includeDisabled: true }), -1),
            isAutoTrading,
            forceSellBeforeStop,
            autoTradeRecoveryReloads,
            isAutoTradeReloading,
            oneClickTradeOpenAttempted,
            consecutiveTradeFailures,
            tradeStatsPaused: isTradeStatsPaused,
            scheduledAutoTradeEndAt,
            scheduledAutoTradeRemainingMs: scheduledAutoTradeEndAt ? Math.max(0, scheduledAutoTradeEndAt - Date.now()) : 0,
            orderHistoryAccountId: getReusableAccountId(),
            orderHistoryFetchInFlight: Boolean(orderHistoryFetchPromise),
            pendingSellOrderSync,
            dailyWindow: getDailyStatsWindow(),
            lastStats,
            lifetimeDexVolumeStats: readDexVolumeStats(),
            buyButtons: buyButtons.map(getDebugButtonInfo),
            sellButtons: sellButtons.map(getDebugButtonInfo),
            status: document.getElementById('auto-trade-status')?.textContent || ''
        };
    };

    window.OKX_USDT_CLICK_SELL_100 = function() {
        return clickSellAllButton();
    };

    window.OKX_USDT_BOOST_DEBUG = function() {
        return {
            tokenInfo: getCurrentTokenFromUrl(),
            activeBoostTokenKey,
            automationRunId: boostAutomationRunId,
            groupRequestStarted: boostGroupRequestStarted,
            manuallyEdited: boostMultiplierManuallyEdited,
            extraBoostPercent: readExtraBoostPercent(),
            automation: lastBoostAutomation,
            inputValue: document.getElementById('boost-multi')?.value || '',
            status: document.getElementById('boost-auto-status')?.textContent || ''
        };
    };

    window.OKX_USDT_BOOST_RECORDS_DEBUG = function() {
        return {
            accountId: lastBoostAccountId,
            cache: lastBoostRecords,
            view: lastBoostRecords && lastBoostRecords.data
                ? calculateBoostRecordsView(lastBoostRecords.data)
                : null
        };
    };

    window.OKX_USDT_REFRESH_BOOST_RECORDS = function() {
        return refreshBoostRecordsFromCache();
    };

    window.OKX_USDT_REFRESH_ORDER_HISTORY = function() {
        return fetchOrderHistoryByApi();
    };

    window.OKX_USDT_MOUNT_DEBUG = function() {
        const panel = document.getElementById('okx-usdt-calculator');
        const target = findCalculatorMountTarget();
        const chart = findCompactChartElements();

        return {
            targetFound: Boolean(target),
            panelFound: Boolean(panel),
            isEmbedded: Boolean(panel && target && panel.parentElement === target),
            isCompactPanelOpen,
            isCompactPanelAutoOpened,
            isCompactPanelDismissed,
            compactChartFound: Boolean(chart),
            compactChartClass: chart ? String(chart.overlay.className || '') : '',
            compactChartMode: chart ? chart.mode : '',
            compactHostFound: Boolean(compactPanelHostEl),
            toggleFound: Boolean(compactPanelToggleEl && document.contains(compactPanelToggleEl)),
            targetClass: target ? String(target.className || '') : '',
            panelParentClass: panel && panel.parentElement ? String(panel.parentElement.className || '') : '',
            infoTabCount: document.querySelectorAll('[data-pane-id="info"]').length,
            moduleCount: document.querySelectorAll('.fspG_T__dex.dd-module, [class*="fspG_T"][class*="dd-module"]').length
        };
    };

    window.OKX_USDT_REMOUNT = function() {
        const panel = document.getElementById('okx-usdt-calculator');
        return panel ? mountCalculatorPanel(panel) : false;
    };

    window.OKX_USDT_TOGGLE_PANEL = function() {
        toggleCompactPanel();
        return window.OKX_USDT_MOUNT_DEBUG();
    };

    let extensionStateBridgeTimerId = null;

    function getExtensionInputValue(id) {
        const input = document.getElementById(id);
        return input ? String(input.value || '') : '';
    }

    function getExtensionState() {
        const rawStats = calculateStats();
        const displayStats = getStatsForDisplay(rawStats);
        const boostView = lastBoostRecords && lastBoostRecords.data
            ? calculateBoostRecordsView(lastBoostRecords.data)
            : null;
        const boostSnapshot = getCurrentBoostSnapshot();
        const autoButton = document.getElementById('btn-auto-trade');
        const autoStatus = document.getElementById('auto-trade-status');
        const boostStatus = document.getElementById('boost-auto-status');

        return {
            version: '1.2.7',
            ready: Boolean(calculatorPanelEl),
            legacyUserscriptDetected: hasVisibleLegacyUserscriptPanel(),
            url: window.location.href,
            token: getCurrentTokenFromUrl(),
            auto: {
                running: isAutoTrading,
                side: autoTradeSide,
                status: normalizeText(autoStatus && autoStatus.textContent),
                buttonText: normalizeText(autoButton && autoButton.textContent),
                scheduledEndAt: scheduledAutoTradeEndAt,
                scheduledRemainingMs: scheduledAutoTradeEndAt ? Math.max(0, scheduledAutoTradeEndAt - Date.now()) : 0
            },
            controls: {
                alarmEnabled: isAlarmEnabled,
                tradeStatsPaused: isTradeStatsPaused,
                boostAutomationStatus: normalizeText(boostStatus && boostStatus.textContent)
            },
            settings: {
                rebatePercent: getExtensionInputValue('rebate-percent'),
                fixedInviteRebatePercent: String(FIXED_INVITE_REBATE_PERCENT),
                boostDaily: getExtensionInputValue('boost-daily'),
                boostMultiplier: getExtensionInputValue('boost-multi'),
                buyOptionIndex: getExtensionInputValue('buy-option-index'),
                scheduleMinutes: getExtensionInputValue('auto-trade-delay-minutes')
            },
            targets: {
                requiredVolume: boostSnapshot.boostTarget,
                dailyTarget: getCurrentBoostDailyTarget()
            },
            stats: {
                buy: displayStats.buy,
                sell: displayStats.sell,
                orderHistoryTotal: displayStats.orderHistoryTotal,
                officialBoostTotal: displayStats.officialBoostTotal,
                boostProgress: displayStats.boostProgress,
                net: displayStats.net,
                count: displayStats.count,
                sellSyncPending: Boolean(displayStats.sellSyncPending),
                boostProgressOfficial: Boolean(displayStats.boostProgressOfficial),
                feeBreakdown: displayStats.feeBreakdown || null
            },
            boost: boostView ? {
                accountIdAvailable: Boolean(lastBoostAccountId),
                updatedAt: lastBoostRecords.updatedAt || 0,
                avgBalance: boostView.avgBalance,
                avgTradingVolume: boostView.avgTradingVolume,
                todayTradingVolume: boostView.todayTradingVolume,
                todayProgress: boostView.todayProgress,
                rollingTotal: boostView.rollingTotal,
                nextExpiry: boostView.nextExpiry
            } : {
                accountIdAvailable: Boolean(lastBoostAccountId),
                updatedAt: 0
            }
        };
    }

    function postExtensionMessage(kind, payload) {
        window.postMessage({
            __okxBoostExtension: true,
            kind,
            payload
        }, window.location.origin);
    }

    function postExtensionState() {
        if (!calculatorPanelEl) return;
        postExtensionMessage('state', getExtensionState());
    }

    function setExtensionInputValue(id, value, triggerInput = true) {
        if (value === undefined || value === null) return;
        const input = document.getElementById(id);
        if (!input) return;
        input.value = String(value);
        if (triggerInput) input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    async function handleExtensionCommand(command, payload = {}) {
        switch (command) {
            case 'get-state':
                return { ok: true, state: getExtensionState() };
            case 'refresh':
                await Promise.allSettled([
                    isTradeStatsPaused ? Promise.resolve() : fetchOrderHistoryByApi(),
                    refreshBoostRecordsFromCache()
                ]);
                calculateStats();
                renderBoostRecords();
                return { ok: true, state: getExtensionState() };
            case 'toggle-auto-trade':
                toggleAutoTrade();
                return { ok: true, state: getExtensionState() };
            case 'save-settings':
                setExtensionInputValue('rebate-percent', payload.rebatePercent);
                setExtensionInputValue('boost-daily', payload.boostDaily);
                setExtensionInputValue('boost-multi', payload.boostMultiplier);
                setExtensionInputValue('buy-option-index', payload.buyOptionIndex, false);
                setExtensionInputValue('auto-trade-delay-minutes', payload.scheduleMinutes, false);
                calculateBoost();
                calculateStats();
                return { ok: true, state: getExtensionState() };
            case 'set-alarm':
                isAlarmEnabled = Boolean(payload.enabled);
                const alarmCheckbox = document.getElementById('enable-alarm');
                if (alarmCheckbox) alarmCheckbox.checked = isAlarmEnabled;
                updateAlarmToggleState();
                if (isAlarmEnabled) playAlertSound();
                return { ok: true, state: getExtensionState() };
            case 'set-trade-stats-paused':
                clearLegacyTradeStatsPauseSetting();
                return { ok: true, state: getExtensionState() };
            case 'schedule-auto-trade':
                setExtensionInputValue('auto-trade-delay-minutes', payload.minutes, false);
                if (scheduledAutoTradeEndAt) clearScheduledAutoTrade('已重设计时启动');
                startScheduledAutoTradeCountdown();
                return { ok: true, state: getExtensionState() };
            case 'cancel-schedule':
                clearScheduledAutoTrade('定时启动已取消');
                return { ok: true, state: getExtensionState() };
            default:
                return { ok: false, error: `未知命令: ${String(command || '')}` };
        }
    }

    function startExtensionStateBridge() {
        postExtensionState();
        if (extensionStateBridgeTimerId) return;
        extensionStateBridgeTimerId = window.setInterval(postExtensionState, 1000);
    }

    window.addEventListener('message', (event) => {
        if (event.source !== window || event.origin !== window.location.origin) return;
        const data = event.data;
        if (!data || data.__okxBoostExtension !== true || data.kind !== 'command') return;

        handleExtensionCommand(data.command, data.payload)
            .then((result) => {
                postExtensionMessage('response', { id: data.id, ...result });
                postExtensionState();
            })
            .catch((error) => {
                postExtensionMessage('response', {
                    id: data.id,
                    ok: false,
                    error: error && error.message ? error.message : String(error)
                });
            });
    });

    if (document.readyState === 'loading') {
        window.addEventListener('load', createUI);
    } else {
        createUI();
    }
})();

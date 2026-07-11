// ==UserScript==
// @name         Alpha交易量工具
// @namespace    http://tampermonkey.net/
// @version      7.2.73
// @description  x
// @author       GPT
// @match        https://www.binance.com/zh-CN/alpha/*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      *
// ==/UserScript==
(function () {
  'use strict';

  if (window.__ALPHA_VOLUME_EXTENSION_ENGINE__) return;
  window.__ALPHA_VOLUME_EXTENSION_ENGINE__ = true;
  const ALPHA_EXTENSION_MFA_DISABLED = true;
  // 模拟真实鼠标操作的工具函数
  function simulateRealMouseClick(element) {
    if (!element || !element.offsetParent) return false;

    try {
      // 获取元素位置
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      // 创建真实的鼠标事件序列
      const events = [
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 0,
          buttons: 1
        }),
        new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 0,
          buttons: 0
        }),
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 0,
          buttons: 0
        })
      ];

      // 依次触发事件
      events.forEach(event => {
        element.dispatchEvent(event);
      });

      return true;
    } catch (e) {
      console.error('模拟鼠标点击失败:', e);
      return false;
    }
  }


  function simulateRealMouseInput(element, value) {
    if (!element || !element.offsetParent) return false;

    try {
      // 先点击输入框
      simulateRealMouseClick(element);

      // 等待一小段时间让点击生效
      setTimeout(() => {
        try {
          // 对于价格输入框，使用更底层的方法
          if (element.id === 'limitPrice' || element.placeholder?.includes('限价')) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            if (setter) {
              setter.call(element, value);
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
              return;
            }
          }

          // 聚焦元素
          element.focus();

          // 清空现有内容
          element.select();

          // 模拟键盘输入
          const inputEvent = new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: value
          });

          // 设置值并触发事件
          element.value = value;
          element.dispatchEvent(inputEvent);

          // 触发change事件
          const changeEvent = new Event('change', {
            bubbles: true,
            cancelable: true
          });
          element.dispatchEvent(changeEvent);
        } catch (e) {
          console.error('输入失败:', e);
        }
      }, Math.floor(Math.random() * (clickIntervalMax - clickIntervalMin + 1)) + clickIntervalMin); // 使用用户设置的点击间隔

      return true;
    } catch (e) {
      console.error('模拟鼠标输入失败:', e);
      return false;
    }
  }

  function setNativeInputValue(element, value) {
    if (!element) return false;
    try {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(element, value);
      else element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (_) {
      try {
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  const Logger = {
    enabled: false,
    log(...args) {
      if (this.enabled) console.log('[Alpha工具]', ...args);
    },
    warn(...args) {
      if (this.enabled) console.warn('[Alpha工具]', ...args);
    },
    error(...args) {
      if (this.enabled) console.error('[Alpha工具]', ...args);
    }
  };
  const MAX_WAIT_SECOND_BTN = 12000;
  const POLL_INTERVAL_BTN = 1500;
  const PRE_THIRD_STEP_CLICK_WINDOW_MS = 1000;
  const OBSERVE_IDLE_MS = 600;
  const CONTINUE_CLICK_INTERVAL_MS = 120;
  const CONTINUE_SCAN_INTERVAL_MS = 120;
  const RANGE_MIN = 0.02;
  const RANGE_MAX = 0.5;
  const FILL_MAX_WAIT_MS = 8000;
  const POLL_INTERVAL_FILL = 60;
  const PRE_THIRD_STEP_INITIAL_WAIT_MS = 1000;
  const PRE_SET_SLIDER_DELAY_MS = 750; // 将被randomSleep()替换
  const PRE_AFTER_SLIDER_DELAY_MS = 750; // 将被randomSleep()替换
  const PRE_AFTER_FIRST_BTN_DELAY_MS = 750; // 将被randomSleep()替换
  const STABLE_PROCESS_MIN_INTERVAL_MS = 200;
  const STABLE_FALLBACK_POLL_MS = 1000;
  const STABLE_MIN_SAMPLES_CONST = 5;
  const STABLE_MIN_COVERAGE_SEC_CONST = 3;
  const STABLE_MAX_LAG_SEC_CONST = 5;
  const TOKEN_OBSERVER_POLL_INTERVAL_MS = 200;
  const TOKEN_OBSERVER_MAX_WAIT_MS = 20000;
  const DAILY_REFRESH_INTERVAL_MS = 60000;
  const TOKENLIST_CACHE_TTL_MS = 300000;
  const ORDER_MONITOR_INTERVAL_MS = 9000;
  const REALTIME_STATS_BACKFILL_INTERVAL_MS = 5000;
  const BUY_STATS_FOLLOWUP_INTERVAL_MS = 5000;
  const BUY_STATS_FOLLOWUP_KICK_MS = 600;
  const BUY_STATS_FOLLOWUP_DURATION_MS = 10 * 60 * 1000;
  const STOP_FINAL_BUY_SCAN_INTERVAL_MS = 2000;
  const STOP_FINAL_BUY_SCAN_KICK_MS = 600;
  const STOP_FINAL_BUY_SCAN_MIN_DURATION_MS = 60000;
  const STOP_FINAL_BUY_SCAN_MAX_DURATION_MS = 180000;
  const STATS_SCAN_NORMAL_DELAYS_MS = [1000, 700, 700, 700];
  const STATS_SCAN_FAST_DELAYS_MS = [120, 250, 350, 500, 700, 900];
  const IMMEDIATE_BUY_HISTORY_MATCH_MIN_WINDOW_MS = 60000;
  const IMMEDIATE_BUY_HISTORY_MATCH_BUFFER_MS = 60000;
  const IMMEDIATE_BUY_HISTORY_MATCH_MAX_WINDOW_MS = 10 * 60 * 1000;
  const COMPLETION_SOUND_COOLDOWN_MS = 5000;
  const COMPLETION_SOUND_BURST_COUNT = 6;
  const COMPLETION_SOUND_BURST_INTERVAL_MS = 820;
  const COMPLETION_VOICE_TEXT = '老弟，刷完啦';
  const COMPLETION_VOICE_RETRY_MS = 350;
  const COMPLETION_DISPLAY_REFRESH_DELAYS_MS = [250, 1200, 2500];
  const ORDER_STUCK_VOICE_TEXT = '老弟，订单卡住了';
  const ORDER_STUCK_ALERT_COOLDOWN_MS = 8000;
  const FILLED_BUY_ORDER_RECORDS_STORAGE = 'filledBuyOrderRecords';
  const FILLED_BUY_FINGERPRINTS_STORAGE = 'filledBuyFingerprints';
  const REALTIME_STATS_RECORDED_KEYS_STORAGE = 'realtimeStatsRecordedKeys';
  const REALTIME_STATS_START_TIME_STORAGE = 'realtimeStatsStartTime';
  const FILLED_AMOUNT_HEADERS = [
    '成交金额', '成交额', '成交总额', '成交总计', '成交量(USDT)',
    '已成交金额', '实际成交', 'FilledTotal', 'Filled Total',
    'Filled Value', 'Executed Value', '成交/委托', 'Filled/Order'
  ];
  const ORDER_AMOUNT_FALLBACK_HEADERS = [
    '委托金额', '订单金额', '订单总额', '下单金额',
    '总额', '金额', 'Total', 'Value', 'Amount', 'Order Amount'
  ];
  const AMOUNT_COLUMN_EXCLUDES = ['数量', '价格', 'Price', 'Qty', 'Quantity'];
  const ORDER_CANCEL_AFTER_MS = 10000;
  const BALANCE_CAPTURE_AFTER_FILL_DELAY_MS = 1800;
  const BALANCE_CAPTURE_AFTER_FILL_WINDOW_MS = 10000;
  const STABILITY_WAIT_TIMEOUT_MS = 60000;
  const DEFAULT_STABLE_WINDOW_SEC = 8;
  const DEFAULT_STABLE_TOLERANCE_PCT = 0.1;
  const DEFAULT_VOLATILITY_PAUSE_SEC = 4;
  const DEFAULT_BUY_PRICE_PREMIUM_PCT = 0.05;
  const DEFAULT_SELL_PRICE_DISCOUNT_PCT = 0.05;
  const DEFAULT_SINGLE_TRADE_MAX_WEAR_PCT = 0.2;
  const DEFAULT_BUY_ORDER_WAIT_SEC = 10;
  const DEFAULT_SELL_ORDER_WAIT_SEC = 10;
  const INTEGRAL_THRESHOLDS = [
    2, 4, 8, 16, 32, 64, 128, 256, 512, 1024,
    2048, 4096, 8192, 16384, 32768, 65536, 131072,
    262144, 524288, 1048576, 2097152, 4194304,
    8388608, 16777216, 33554432
  ];
  const RESOURCE_IDS = {
    schedulerVisibility: 'scheduler_visibility',
    stableMonitor: 'stable_monitor',
    tokenDetector: 'token_detector',
    orderMonitor: 'order_monitor',
    orderMonitorObserver: 'order_monitor_observer',
    orderMonitorObserverTimeout: 'order_monitor_observer_timeout',
    realtimeStatsBackfill: 'realtime_stats_backfill',
    buyStatsFollowup: 'buy_stats_followup',
    buyStatsFollowupKick: 'buy_stats_followup_kick',
    buyStatsFinalScan: 'buy_stats_final_scan',
    buyStatsFinalScanKick: 'buy_stats_final_scan_kick',
    multiplierCountdown: 'multiplier_countdown',
    dailyRefresh: 'daily_refresh',
    balanceRetry: 'balance_capture_retry',
    uiDragMove: 'ui_drag_mousemove',
    uiDragUp: 'ui_drag_mouseup',
    uiResize: 'ui_resize',
    uiInitialRefresh: 'ui_initial_refresh',
    uiReverseEnforceEarly: 'ui_reverse_enforce_early',
    uiReverseEnforceLate: 'ui_reverse_enforce_late',
    uiReverseEnforceRetry: 'ui_reverse_enforce_retry',
    uiReverseObserver: 'ui_reverse_observer',
    uiTokenIcon: 'ui_token_icon',
    uiEnsure: 'ui_ensure'
  };
  function bindCheckboxToPanel({ checkbox, panel, storageKey, defaultChecked, onToggle }) {
    let checked;
    const raw = localStorage.getItem(storageKey);
    if (raw === null) checked = !!defaultChecked; else checked = raw === 'true';
    checkbox.checked = checked;
    if (panel) panel.style.display = checked ? 'block' : 'none';
    try { if (onToggle) onToggle(checked); } catch (e) { }
    checkbox.onchange = function () {
      const val = !!this.checked;
      StorageUtils.set(storageKey, val);
      if (panel) panel.style.display = val ? 'block' : 'none';
      try { if (onToggle) onToggle(val); } catch (e) { }
    };
  }
  const Scheduler = (() => {
    const phases = ['read', 'compute', 'write'];
    const queues = { read: new Map(), compute: new Map(), write: new Map() };
    const lastRunTimes = new Map();
    let ticking = false;
    let paused = document.visibilityState === 'hidden';
    let started = false;

    function enqueue({ key, phase = 'compute', fn, minIntervalMs = 0 }) {
      if (!queues[phase]) queues[phase] = new Map();
      queues[phase].set(key, { fn, minIntervalMs });
      tick();
    }
    function flushPhase(phase) {
      const now = Date.now();
      const q = queues[phase];
      if (!q || q.size === 0) return;
      for (const [key, task] of Array.from(q.entries())) {
        const lastRunTime = lastRunTimes.get(key) || 0;
        if (task.minIntervalMs && now - lastRunTime < task.minIntervalMs) continue;
        try { task.fn(); } catch (e) { }
        lastRunTimes.set(key, now);
        q.delete(key);
      }
    }
    function frame() {
      ticking = false;
      if (paused) return;
      for (const p of phases) flushPhase(p);
      if (queues.read.size || queues.compute.size || queues.write.size) tick();
    }
    function tick() {
      if (ticking || paused) return;
      ticking = true;
      try { requestAnimationFrame(frame); } catch (_) { setTimeout(frame, 16); }
    }
    function start() {
      if (started) {
        tick();
        return;
      }
      started = true;
      const onVisibilityChange = () => {
        paused = document.visibilityState === 'hidden';
        if (!paused) tick();
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      try {
        ResourceManager.register('appEvent', RESOURCE_IDS.schedulerVisibility, () => {
          document.removeEventListener('visibilitychange', onVisibilityChange);
          started = false;
        });
      } catch (_) {}
      tick();
    }
    return { enqueue, start };
  })();
  /**
   * Asynchronous wait function
   * @param {number} ms - Wait time in milliseconds
   * @returns {Promise<void>} Promise object
   */
  const DelayManager = {
    async sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    async ifSwitchDelayEnabled() {
      if (!switchDelayEnabled) return;
      await this.sleep(RandomGenerator.cycleTime());
    },

    async afterPairIfEnabled() {
      if (!afterPairWaitEnabled) return;
      await this.sleep(RandomGenerator.afterPairWait());
    },

    async withOrderMonitoring(duration) {
      return new Promise((resolve) => {
        setTimeout(resolve, duration);
      });
    }
  };

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 随机等待函数：使用用户设置的点击间隔
  function randomSleep() {
    const min = clickIntervalMin;
    const max = clickIntervalMax;
    const randomMs = Math.floor(Math.random() * (max - min + 1)) + min;
    return sleep(randomMs);
  }
  /**
   * Unified local storage operation utility
   * Provides safe localStorage operations with error handling and type conversion
   */
  const StorageUtils = {
    /**
     * Safely get boolean value
     * @param {string} key - Storage key name
     * @param {boolean} defaultValue - Default value
     * @returns {boolean} Stored boolean value or default value
     */
    getBool(key, defaultValue) {
      try {
    const v = localStorage.getItem(key);
    if (v === null) return defaultValue;
    return v === 'true';
      } catch (e) {
        return defaultValue;
      }
    },

    /**
     * Safely get numeric value
     * @param {string} key - Storage key name
     * @param {number} defaultValue - Default value
     * @returns {number} Stored numeric value or default value
     */
    getNum(key, defaultValue) {
      try {
    const v = parseFloat(localStorage.getItem(key));
    return isNaN(v) ? defaultValue : v;
      } catch (e) {
        return defaultValue;
      }
    },

    /**
     * Safely get string value
     * @param {string} key - Storage key name
     * @param {string} defaultValue - Default value
     * @returns {string} Stored string value or default value
     */
    getString(key, defaultValue = '') {
      try {
        return localStorage.getItem(key) || defaultValue;
      } catch (e) {
        return defaultValue;
      }
    },

    /**
     * Safely set value
     * @param {string} key - Storage key name
     * @param {any} value - Value to store
     * @returns {boolean} Whether setting was successful
     */
    set(key, value) {
      try {
        localStorage.setItem(key, String(value));
        return true;
      } catch (e) {
        return false;
      }
    },

    /**
     * Safely remove value
     * @param {string} key - Storage key name
     * @returns {boolean} Whether removal was successful
     */
    remove(key) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (e) {
        return false;
      }
    },

    /**
     * Batch remove values
     * @param {string[]} keys - Array of keys to remove
     * @returns {boolean[]} Results of each key removal
     */
    removeMultiple(keys) {
      const results = [];
      for (const key of keys) {
        results.push(this.remove(key));
      }
      return results;
    }
  };

  const StorageLoader = {
    bool(key, defaultValue) {
    return StorageUtils.getBool(key, defaultValue);
    },
    num(key, defaultValue) {
    return StorageUtils.getNum(key, defaultValue);
    },
    string(key, defaultValue) {
    return StorageUtils.getString(key, defaultValue);
  }
  };



  /**
   * Error boundary manager
   * Provides unified error handling mechanism, wraps critical operations and provides fallback handling
   */
  const ErrorBoundary = {
    /**
     * Wrap async function with error boundary
     * @param {Function} fn - Async function to execute
     * @param {string} context - Context description for error logging
     * @param {Function} fallback - Fallback handler function
     * @returns {Promise<any>} Function execution result or null
     */
    async wrapAsync(fn, context = '', fallback = null) {
      try {
        return await fn();
      } catch (error) {
        if (fallback && typeof fallback === 'function') {
          try {
            return await fallback(error);
          } catch (fallbackError) {
          }
        }
        return null;
      }
    },

    /**
     * Wrap sync function with error boundary
     * @param {Function} fn - Sync function to execute
     * @param {string} context - Context description for error logging
     * @param {Function} fallback - Fallback handler function
     * @returns {any} Function execution result or null
     */
    wrapSync(fn, context = '', fallback = null) {
      try {
        return fn();
      } catch (error) {
        if (fallback && typeof fallback === 'function') {
          try {
            return fallback(error);
          } catch (fallbackError) {
          }
        }
        return null;
      }
    },

    /**
     * Wrap user interaction function
     * @param {Function} fn - User interaction function
     * @param {string} context - Context description
     * @returns {Function} Wrapped function
     */
    wrapUserInteraction(fn, context = '') {
      return (...args) => {
        try {
          return fn(...args);
        } catch (error) {
          return false;
        }
      };
    },

    /**
     * Wrap network request
     * @param {Function} requestFn - Network request function
     * @param {string} context - Context description
     * @returns {Promise<any>} Request result or null
     */
    async wrapNetworkRequest(requestFn, context = '') {
      try {
        return await requestFn();
      } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
        } else if (error.status >= 500) {
        } else if (error.status >= 400) {
        }
        return null;
      }
    }
  };

  /**
   * Resource cleanup manager
   * Unified management of all resources that need cleanup to prevent memory leaks
   */
  const ResourceManager = {
    /** @type {Map<string, Map<string, Function>>} Store all resources that need cleanup */
    resources: new Map(),

    /**
     * Register resource
     * @param {string} type - Resource type (e.g. 'timer', 'observer')
     * @param {string} id - Unique resource identifier
     * @param {Function} cleanupFn - Cleanup function
     */
    register(type, id, cleanupFn) {
      if (!this.resources.has(type)) {
        this.resources.set(type, new Map());
      }
      this.resources.get(type).set(id, cleanupFn);
    },

    /**
     * Unregister resource
     * @param {string} type - Resource type
     * @param {string} id - Unique resource identifier
     * @returns {boolean} Whether unregistration was successful
     */
    unregister(type, id) {
      if (this.resources.has(type)) {
        const typeMap = this.resources.get(type);
        if (typeMap.has(id)) {
          typeMap.delete(id);
          return true;
        }
      }
      return false;
    },

    cleanup(type, id) {
      if (!this.resources.has(type)) return false;

      const typeMap = this.resources.get(type);
      if (!typeMap.has(id)) return false;
      const cleanupFn = typeMap.get(id);
      try {
        if (typeof cleanupFn === 'function') {
          cleanupFn();
        }
      } catch (error) {
      } finally {
        typeMap.delete(id);
      }
      return true;
    },

    /**
     * Cleanup resources of specific type
     * @param {string} type - Resource type
     */
    cleanupType(type) {
      if (!this.resources.has(type)) return;

      const typeMap = this.resources.get(type);
      for (const [id, cleanupFn] of typeMap.entries()) {
        try {
          if (typeof cleanupFn === 'function') {
            cleanupFn();
          }
        } catch (error) {
        }
        typeMap.delete(id);
      }
      typeMap.clear();
    },

    /**
     * Cleanup all resources
     */
    cleanupAll() {
      for (const [type, typeMap] of this.resources.entries()) {
        this.cleanupType(type);
      }
      this.resources.clear();
    },

    /**
     * Get resource status
     * @returns {Object<string, number>} Count statistics of each resource type
     */
    getStatus() {
      const status = {};
      for (const [type, typeMap] of this.resources.entries()) {
        status[type] = typeMap.size;
      }
      return status;
    }
  };

  function setManagedTimeout(type, id, fn, delay) {
    ResourceManager.cleanup(type, id);
    const timer = setTimeout(() => {
      ResourceManager.unregister(type, id);
      try { fn(); } catch (_) {}
    }, delay);
    ResourceManager.register(type, id, () => clearTimeout(timer));
    return timer;
  }

  function setManagedInterval(type, id, fn, delay, onCleanup) {
    ResourceManager.cleanup(type, id);
    const timer = setInterval(fn, delay);
    ResourceManager.register(type, id, () => {
      clearInterval(timer);
      try { if (onCleanup) onCleanup(); } catch (_) {}
    });
    return timer;
  }

  function registerManagedEvent(type, id, target, event, handler, options) {
    if (!target || !target.addEventListener) return false;
    ResourceManager.cleanup(type, id);
    try {
      target.addEventListener(event, handler, options);
      ResourceManager.register(type, id, () => target.removeEventListener(event, handler, options));
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * DOM cache manager
   * Provides intelligent DOM element caching, reduces redundant queries, improves performance
   */
  const DOMCache = {
    /** @type {Map<string, {element: Element, timestamp: number}>} Cache storage */
    cache: new Map(),
    /** @type {number} Maximum cache size */
    maxSize: 100,
    /** @type {number} Cache time-to-live in milliseconds */
    ttl: 5000,

    /**
     * Get cached element
     * @param {string} selector - Selector (CSS, XPath or ID)
     * @param {boolean} forceRefresh - Whether to force refresh cache
     * @returns {Element|null} Cached element or null
     */
    get(selector, forceRefresh = false) {
      const key = `selector:${selector}`;
      const cached = this.cache.get(key);

      if (!forceRefresh && cached && Date.now() - cached.timestamp < this.ttl) {
        if (cached.element && document.contains(cached.element)) {
          return cached.element;
        }
      }

      const element = this.queryElement(selector);
      if (element) {
        this.set(key, element);
      }
      return element;
    },

    /**
     * Set cache
     * @param {string} key - Cache key
     * @param {Element} element - Element to cache
     */
    set(key, element) {
      this.cleanup();

      if (this.cache.size >= this.maxSize) {
        const firstCacheKey = this.cache.keys().next().value;
        this.cache.delete(firstCacheKey);
      }

      this.cache.set(key, {
        element,
        timestamp: Date.now()
      });
    },

    /**
     * Cleanup expired cache
     */
    cleanup() {
      const now = Date.now();
      for (const [key, value] of this.cache.entries()) {
        if (now - value.timestamp > this.ttl) {
          this.cache.delete(key);
        }
      }
    },

    /**
     * Query single element
     * @param {string} selector - Selector
     * @returns {Element|null} Queried element or null
     */
    queryElement(selector) {
      try {
        if (selector.startsWith('//') || selector.startsWith('/')) {
          return document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        } else if (selector.startsWith('#')) {
          return document.getElementById(selector.substring(1));
        } else {
          return document.querySelector(selector);
        }
      } catch (e) {
        return null;
      }
    },

    /**
     * Batch query elements (with cache)
     * @param {string} selector - Selector
     * @param {boolean} forceRefresh - Whether to force refresh cache
     * @returns {Element[]} Queried elements array
     */
    queryAll(selector, forceRefresh = false) {
      const key = `queryAll:${selector}`;
      const cached = this.cache.get(key);

      if (!forceRefresh && cached && Date.now() - cached.timestamp < this.ttl) {
        return cached.elements;
      }

      const elements = this.queryAllElements(selector);
      if (elements.length > 0) {
        this.cache.set(key, {
          elements,
          timestamp: Date.now()
        });
      }
      return elements;
    },

    /**
     * Query all elements
     * @param {string} selector - Selector
     * @returns {Element[]} Queried elements array
     */
    queryAllElements(selector) {
      try {
        if (selector.startsWith('//') || selector.startsWith('/')) {
          const result = document.evaluate(selector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          const elements = [];
          for (let i = 0; i < result.snapshotLength; i++) {
            elements.push(result.snapshotItem(i));
          }
          return elements;
        } else {
          return Array.from(document.querySelectorAll(selector));
        }
      } catch (e) {
        return [];
      }
    },

    /**
     * Clear specific cache
     * @param {string} selector - Selector
     */
    clear(selector) {
      const key = `selector:${selector}`;
      this.cache.delete(key);
    },

    /**
     * Clear all cache
     */
    clearAll() {
      this.cache.clear();
    },

    /**
     * Get cache status
     * @returns {Object} Cache status information
     */
    getStatus() {
      return {
        size: this.cache.size,
        maxSize: this.maxSize,
        ttl: this.ttl
      };
    }
  };

  /**
   * Debounce utility
   * Provides debounce and throttle functionality to optimize frequently triggered operations
   */
  const DebounceUtils = {
    /** @type {Map<string, number>} Timer storage */
    timers: new Map(),

    /**
     * Debounce function
     * @param {string} key - Debounce identifier
     * @param {Function} fn - Function to execute
     * @param {number} delay - Delay time in milliseconds
     */
    debounce(key, fn, delay = 300) {
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
      }

      const timer = setTimeout(() => {
        fn();
        this.timers.delete(key);
      }, delay);

      this.timers.set(key, timer);
    },

    /**
     * Throttle function
     * @param {string} key - Throttle identifier
     * @param {Function} fn - Function to execute
     * @param {number} delay - Throttle interval in milliseconds
     */
    throttle(key, fn, delay = 100) {
      if (this.timers.has(key)) {
        return;
      }

      fn();

      const timer = setTimeout(() => {
        this.timers.delete(key);
      }, delay);

      this.timers.set(key, timer);
    },

    /**
     * Immediate execution debounce (execute immediately first time, then debounce)
     * @param {string} key - Debounce identifier
     * @param {Function} fn - Function to execute
     * @param {number} delay - Delay time in milliseconds
     */
    debounceImmediate(key, fn, delay = 300) {
      if (!this.timers.has(key)) {
        fn();
      }

      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
      }

      const timer = setTimeout(() => {
        this.timers.delete(key);
      }, delay);

      this.timers.set(key, timer);
    },

    /**
     * Cancel debounce
     * @param {string} key - Debounce identifier
     */
    cancel(key) {
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
        this.timers.delete(key);
      }
    },

    /**
     * Clear all timers
     */
    clearAll() {
      for (const timer of this.timers.values()) {
        clearTimeout(timer);
      }
      this.timers.clear();
    }
  };

  const DOMUtils = {
    createElement(tag, options = {}) {
      try {
        const element = document.createElement(tag);
        if (options.className) element.className = options.className;
        if (options.id) element.id = options.id;
        if (options.textContent) element.textContent = options.textContent;
        if (options.innerHTML) element.innerHTML = options.innerHTML;
        if (options.style) {
          if (typeof options.style === 'string') {
            element.style.cssText = options.style;
          } else {
            Object.assign(element.style, options.style);
          }
        }
        return element;
      } catch (e) {
        return null;
      }
    },

    safeClick(element) {
      return simulateRealMouseClick(element);
    },

    safeSetStyle(element, styles) {
      if (!element) return false;
      try {
        if (typeof styles === 'string') {
          element.style.cssText = styles;
        } else {
          Object.assign(element.style, styles);
        }
        return true;
      } catch (e) {
        return false;
      }
    },

    safeAddEventListener(element, event, handler, options = {}) {
      if (!element) return false;
      try {
        element.addEventListener(event, handler, options);
        return true;
      } catch (e) {
        return false;
      }
    },

    safeRemoveEventListener(element, event, handler) {
      if (!element) return false;
      try {
        element.removeEventListener(event, handler);
        return true;
      } catch (e) {
        return false;
      }
    },

    querySelector(selector, forceRefresh = false) {
      return DOMCache.get(selector, forceRefresh);
    },

    querySelectorAll(selector, forceRefresh = false) {
      return DOMCache.queryAll(selector, forceRefresh);
    },

    clearCache(selector) {
      if (selector) {
        DOMCache.clear(selector);
      } else {
        DOMCache.clearAll();
      }
    }
  };
  async function fetchOTP(secret) {
    // The extension build never reads an authenticator secret or calls an OTP service.
    if (ALPHA_EXTENSION_MFA_DISABLED) return { otp: null, timeRemaining: null };
    // 验证secret格式
    if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
      Logger.warn('获取OTP失败: Secret为空或格式无效');
      return { otp: null, timeRemaining: null };
    }

    const url = `https://2fa.fb.rip/api/otp/${encodeURIComponent(secret)}`;
    Logger.log('OTP请求URL:', url);

    function extractOtpData(json) {
      const rawOtp = (json && (json.data?.otp ?? json.otp)) ?? '';
      const otp = String(rawOtp).replace(/\D+/g, '');
      const timeRemaining = json?.data?.timeRemaining ?? json?.timeRemaining ?? null;
      return { otp, timeRemaining };
    }

    // 优先使用 GM_xmlhttpRequest 绕过页面 CSP
    if (typeof GM_xmlhttpRequest === 'function') {
      return await new Promise((resolve) => {
        try {
          GM_xmlhttpRequest({
            method: 'GET',
            url,
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Cache-Control': 'no-cache'
            },
            onload: (r) => {
              try {
                Logger.log('OTP响应状态:', r.status);

                if (r.status >= 200 && r.status < 300) {
                  const j = JSON.parse(r.responseText || '{}');
                  const { otp, timeRemaining } = extractOtpData(j);
                  resolve({ otp: otp || null, timeRemaining });
                } else {
                  Logger.warn('获取OTP失败: HTTP', r.status);
                  resolve({ otp: null, timeRemaining: null });
                }
              } catch (e) {
                Logger.warn('获取OTP失败: JSON解析错误', e);
                resolve({ otp: null, timeRemaining: null });
              }
            },
            onerror: (e) => {
              Logger.warn('获取OTP失败: 网络错误', e);
              resolve({ otp: null, timeRemaining: null });
            },
            ontimeout: () => {
              Logger.warn('获取OTP失败: 超时');
              resolve({ otp: null, timeRemaining: null });
            },
            onabort: () => {
              Logger.warn('获取OTP失败: 中止');
              resolve({ otp: null, timeRemaining: null });
            },
          });
        } catch (e) {
          Logger.warn('获取OTP失败: GM 调用异常', e);
          resolve({ otp: null, timeRemaining: null });
        }
      });
    }

    // 回退：fetch（可能受 CSP 限制）
    try {
      const resp = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*'
        }
      });
      Logger.log('Fetch响应状态:', resp.status);
      const j = await resp.json();
      Logger.log('Fetch响应已解析');
      const { otp, timeRemaining } = extractOtpData(j);
      return { otp: otp || null, timeRemaining };
    } catch (e) {
      Logger.warn('获取OTP失败:', e);
      return { otp: null, timeRemaining: null };
    }
  }

  async function clickMFAAltLink() {
    const textMatch = (el) => (el && (el.textContent || '').trim().includes('我的通行密钥无法使用'));
    const cssCand = document.querySelector('.bidscls-btnLink2');
    if (cssCand && textMatch(cssCand)) { return simulateRealMouseClick(cssCand); }
    const host = document.querySelector('#mfa-shadow-host');
    if (host && host.shadowRoot) {
      const innerByClass = host.shadowRoot.querySelector('.bidscls-btnLink2');
      if (innerByClass && textMatch(innerByClass)) { return simulateRealMouseClick(innerByClass); }
      const walker = document.createTreeWalker(host.shadowRoot, NodeFilter.SHOW_ELEMENT, null, false);
      let node;
      while ((node = walker.nextNode())) {
        if (textMatch(node)) { return simulateRealMouseClick(node); }
      }
    }
    const xpaths = [
      '//*[@id="mfa-shadow-host"]//div/div/div/div/div/div[2]/div/div/div[1]/div[5]/div',
      '/html/body/div[9]//div/div/div/div/div/div[2]/div/div/div[1]/div[5]/div'
    ];
    for (const xp of xpaths) {
      try {
        const res = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const n = res.singleNodeValue;
        if (n) { return simulateRealMouseClick(n); }
      } catch (_) {}
    }
    const anyTextEl = Array.from(document.querySelectorAll('div,button,a,span')).find(textMatch);
    if (anyTextEl) { return simulateRealMouseClick(anyTextEl); }

    return false;
  }

  function fillMFAInput(otp) {
    const selectors = [
      'input[data-e2e="input-mfa"]',
      'input[id*="bn-formItem"]',
      'input[type="text"][maxlength="6"]',
      'input[placeholder*="验证"]',
      'input[placeholder*="code"]'
    ];

    function findInput(root = document) {
      for (const sel of selectors) {
        const input = root.querySelector(sel);
        if (input && input.offsetParent !== null) {
          // 排除前端UI控件的密钥输入框
          if (input === authenticatorSecretInput ||
              input.placeholder === '输入身份验证器密钥' ||
              input.type === 'password') {
            continue;
          }
          return input;
        }
      }

      // Shadow DOM 递归搜索
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
      let n;
      while ((n = walker.nextNode())) {
        if (n.shadowRoot) {
          const found = findInput(n.shadowRoot);
          if (found) return found;
        }
      }
      return null;
    }

    function setNativeValue(el, val) {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (desc && desc.set) {
        desc.set.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }

    const observer = new MutationObserver(() => {
      const input = findInput();
      if (input) {
        if (setNativeValue(input, otp)) {
          observer.disconnect();
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    const existing = findInput();
    if (existing) {
      setNativeValue(existing, otp);
      observer.disconnect();
    }
    setTimeout(() => observer.disconnect(), 5000);
  }

  const MFAHandler = {
    async handle() {
    if (ALPHA_EXTENSION_MFA_DISABLED) return false;
    if (!authenticatorEnabled || !authenticatorSecret) return false;

    // 重试检测2FA弹窗，最多等待3秒
    const maxWaitMs = 3000;
    const checkInterval = 200;
    let waited = 0;

    while (waited < maxWaitMs) {
      if (this.isPresent()) {
        Logger.log('检测到2FA弹窗');
        break;
      }
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    if (!this.isPresent()) {
      Logger.log('等待3秒后仍未检测到2FA弹窗');
      return false;
    }

    Logger.log('点击"我的通行密钥无法使用"...');
    try {
        const clicked = await this.clickMFAAltLink();
      if (clicked) {
        Logger.log('成功点击"我的通行密钥无法使用"');
      } else {
        Logger.log('点击"我的通行密钥无法使用"失败');
      }
    } catch (e) {
      Logger.warn('点击"我的通行密钥无法使用"出错:', e);
    }

    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        Logger.log(`获取OTP (尝试 ${retryCount + 1}/${maxRetries})...`);
          const otpData = await this.fetchOTP();
        if (otpData.otp) {
          Logger.log('获取到OTP');
          if (otpData.timeRemaining !== null) {
            Logger.log(`验证码剩余时间: ${otpData.timeRemaining}秒`);
          }
          this.fillInput(otpData.otp);
          await new Promise(resolve => setTimeout(resolve, 1000));
          const waitForNewCodeTexts = [
            '请等待新的验证码生成',
            'wait for new verification code',
            '验证码已过期',
            'verification code expired',
            '60秒内输入'
          ];

          const hasExpiredMessage = waitForNewCodeTexts.some(text =>
            document.body.textContent.includes(text)
          );

          if (hasExpiredMessage) {
            Logger.log('检测到验证码过期提示，等待新验证码生成...');
            retryCount++;
            if (retryCount < maxRetries) {
              const waitTime = otpData.timeRemaining !== null ?
                Math.min(otpData.timeRemaining + 2, 10) : 3;
              Logger.log(`等待 ${waitTime} 秒后重试...`);
              await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
              continue;
            }
          }
            if (running && orderMonitorCheckbox && orderMonitorCheckbox.checked) {
              OrderMonitor.start();
            }
          return true;
        } else {
          Logger.log('获取OTP失败');
          retryCount++;
        }
      } catch (e) {
        Logger.warn('2FA处理失败:', e);
        retryCount++;
      }

      if (retryCount < maxRetries) {
        Logger.log('等待2秒后重试...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    Logger.log('2FA处理达到最大重试次数，放弃处理');
    return false;
    },

    isPresent() {
      return isMfaPopupPresent();
    },


    async fetchOTP() {
      return await fetchOTP(authenticatorSecret);
    },

    fillInput(otp) {
      fillMFAInput(otp);
    },

    async clickMFAAltLink() {
      return await clickMFAAltLink();
    }
  };

  const RandomGenerator = {
    buySlider: () => {
      const min = Math.max(0, Math.min(buySliderMin, 100));
      const max = Math.max(min, Math.min(buySliderMax, 100));
      const randomValue = Math.random() * (max - min) + min;
      return Math.round(randomValue * 10) / 10;
    },
    cycleTime: () => {
      const min = Math.max(100, Math.min(cycleTimeMin, 2000));
      const max = Math.max(min, Math.min(cycleTimeMax, 5000));
      return Math.random() * (max - min) + min;
    },
    afterPairWait: () => {
      const minMs = Math.max(0, Math.floor(afterPairWaitMinSec * 1000));
      const maxMs = Math.max(minMs, Math.floor(afterPairWaitMaxSec * 1000));
      const rand = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      return rand;
    }
  };

  const OrderMonitor = {
    timer: null,
    observer: null,

    start() {
      this.startMutationObserver();
      this.startTimerMonitoring();
    },

    stop() {
      this.stopMutationObserver();
      this.stopTimerMonitoring();
    },

    isRunning() {
      return this.timer !== null;
    },

    startMutationObserver() {
    const orderSelectors = [
      'text()[contains(., "限价买单已成交")]',
      'text()[contains(., "限价卖单已成交")]',
      'text()[contains(., "订单已成交")]',
      'text()[contains(., "Order filled")]',
      'text()[contains(., "Trade completed")]'
    ];

    if (this.observer) {
      this.stopMutationObserver();
    }
    const observer = new MutationObserver(() => {
      for (const selector of orderSelectors) {
        const elements = document.evaluate(
          `//${selector}`,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );

        if (elements.snapshotLength > 0) {
          Logger.log('检测到订单已成交');
          this.stopMutationObserver();
          return;
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    this.observer = observer;
    ResourceManager.register('orderObserver', RESOURCE_IDS.orderMonitorObserver, () => {
      try { observer.disconnect(); } catch (_) {}
      if (this.observer === observer) this.observer = null;
    });
    setManagedTimeout('orderTimeout', RESOURCE_IDS.orderMonitorObserverTimeout, () => {
      this.stopMutationObserver();
    }, 10000);
    },

    stopMutationObserver() {
      ResourceManager.cleanup('orderTimeout', RESOURCE_IDS.orderMonitorObserverTimeout);
      ResourceManager.cleanup('orderObserver', RESOURCE_IDS.orderMonitorObserver);
      if (this.observer) {
        try { this.observer.disconnect(); } catch (_) {}
        this.observer = null;
      }
    },

    startTimerMonitoring() {
      if (this.timer) return;
      this.timer = setManagedInterval('orderTimer', RESOURCE_IDS.orderMonitor, () => {
        if (!running || inTradeFlow) return;
        for (let rowIndex = 2; rowIndex <= 4; rowIndex++) {
          const selector = `#bn-tab-pane-orderOrder tbody tr:nth-child(${rowIndex}) td:nth-child(8) svg`;
          const svg = document.querySelector(selector);
          if (svg) {
            const orderKey = `order_${rowIndex}`;
            if (!window[orderKey]) {
              window[orderKey] = Date.now();
            }
            if (Date.now() - window[orderKey] >= 10000) {
              try {
                simulateRealMouseClick(svg);
              } catch (e) {
                try {
                  svg.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                } catch (e2) {
                  try {
                    const parent = svg.closest('td');
                    if (parent) {
                      simulateRealMouseClick(parent);
                    }
                  } catch (e3) {
                    // 忽略错误
                  }
                }
              }
            }
          }
        }
      }, 1000, () => { this.timer = null; });
    },

    stopTimerMonitoring() {
      ResourceManager.cleanup('orderTimer', RESOURCE_IDS.orderMonitor);
      this.timer = null;
      for (let rowIndex = 2; rowIndex <= 4; rowIndex++) {
        const orderKey = `order_${rowIndex}`;
        if (window[orderKey]) {
          delete window[orderKey];
        }
      }
    }
  };

  // 2FA 身份验证器相关函数





  let running = false;
  let currentTabIndex = 0;
  let maxTotalAmount = StorageLoader.num('maxTotalAmount', 0);
  let totalAmount = StorageLoader.num('totalAmount', 0);
  let buyAmount = StorageLoader.num('buyAmount', 0);
  let currentMultiplier = 1;
  let totalIntegral = 0;
  let tokenRecords = new Map();
  const tokenIconUrlCache = new Map();

  try {
    const savedTokenRecords = localStorage.getItem('tokenRecords');
    if (savedTokenRecords) {
      const parsed = JSON.parse(savedTokenRecords);
      tokenRecords = new Map(Object.entries(parsed));
    }
  } catch (e) {
  }
  let lastExecutedTabIndex = -1;
  let sellParamRetryOnce = false;
  let buySliderValue = StorageLoader.num('buySliderValue', 95);
  let buySliderMin = StorageLoader.num('buySliderMin', 90);
  let buySliderMax = StorageLoader.num('buySliderMax', 100);
  let sellSliderValue = StorageLoader.num('sellSliderValue', 99.7);
  let cycleTimeMin = StorageLoader.num('cycleTimeMin', 300);
  let cycleTimeMax = StorageLoader.num('cycleTimeMax', 600);
  let switchDelayEnabled = StorageLoader.bool('switchDelayEnabled', true);
  let afterPairWaitEnabled = StorageLoader.bool('afterPairWaitEnabled', false);
  let afterPairWaitMinSec = StorageLoader.num('afterPairWaitMinSec', 0);
  let afterPairWaitMaxSec = StorageLoader.num('afterPairWaitMaxSec', 2);
  let pairProgress = new Set();
  let opToken = 0;
  const LifecycleManager = {
    pendingCleanups: new Set(),

    addCleanup(fn) {
      try {
        this.pendingCleanups.add(fn);
    } catch (e) {
    }
    },

    runAndClearCleanups() {
    try {
        this.pendingCleanups.forEach(fn => {
        try {
          fn && fn();
        } catch (e) {
        }
      });
    } catch (e) {
    }
      this.pendingCleanups.clear();
    },

    clearRecords() {
      totalAmount = 0;
      buyAmount = 0;
      totalIntegral = 0;
      maxTotalAmount = 0;
      tokenRecords.clear();
      localStorage.removeItem('maxTotalAmount');
      localStorage.removeItem('totalAmount');
      localStorage.removeItem('buyAmount');
      localStorage.removeItem('tokenRecords');
      if (totalAmountDisplay) totalAmountDisplay.textContent = '0.0000';
      if (buyAmountDisplay) buyAmountDisplay.textContent = '0.0000';
      if (integralDisplay) integralDisplay.textContent = '0';
      updateAmountDisplay({ skipFallbacks: true });
      stopBuyStatsFollowup();
      stopFinalBuyStatsScan();
      const accountInputnum = document.getElementById('accountInput');
      if (accountInputnum) {
        accountInputnum.value = '';
      }
      balanceInit = NaN; balanceCurrent = NaN; balanceWear = NaN; balanceBaselineLocked = false;
      localStorage.removeItem('balanceInit');
      localStorage.removeItem('balanceCurrent');
      localStorage.removeItem('balanceWear');
      localStorage.setItem('balanceBaselineLocked', 'false');

      // 清除记录后读取当前余额并设置为初始余额
      setTimeout(() => {
        BalanceManager.commit(BalanceManager.read());
        updateBalanceUI();
      }, 500);

      clearRealtimeStatsState();
      buyStatsNeedsFinalScan = false;
      lastBuyOrderSubmittedAt = 0;
      stopFinalBuyStatsScan();
      realtimeStatsStartTime = running && realtimeStatsEnabled ? Date.now() : 0;
      if (realtimeStatsStartTime > 0) saveRealtimeStatsState();
    },

    calibrateRecords() {
      const raw = window.prompt('输入真实总成交数据', Number.isFinite(totalAmount) && totalAmount > 0 ? String(totalAmount.toFixed(4)) : '');
      if (raw === null) return;
      const actualTotal = parseFloat(String(raw).replace(/,/g, '').trim());
      if (!Number.isFinite(actualTotal) || actualTotal < 0) return;
      if (running) stop();
      const token = (currentTokenDisplay && currentTokenDisplay.textContent || '').trim() || '当前币种';
      const multiplier = Number(currentMultiplier) > 0 ? Number(currentMultiplier) : 1;
      const actualBuy = actualTotal / multiplier;
      totalAmount = actualTotal;
      buyAmount = actualBuy;
      tokenRecords.clear();
      tokenRecords.set(token, { total: actualTotal, buy: actualBuy });
      StorageUtils.set('totalAmount', totalAmount);
      StorageUtils.set('buyAmount', buyAmount);
      saveTokenRecords();
      clearRealtimeStatsState();
      realtimeStatsStartTime = Date.now();
      saveRealtimeStatsState();
      updateAmountDisplay({ skipFallbacks: true });
    },

    resetSettings() {
      cycleTimeMin = 300;
      cycleTimeMax = 600;
      if (cycleTimeMinInput) {
        cycleTimeMinInput.value = String(cycleTimeMin);
        cycleTimeMinInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (cycleTimeMaxInput) {
        cycleTimeMaxInput.value = String(cycleTimeMax);
        cycleTimeMaxInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      StorageUtils.set('cycleTimeMin', cycleTimeMin);
      StorageUtils.set('cycleTimeMax', cycleTimeMax);
      switchDelayEnabled = true;
      if (switchDelayCheckbox) {
        switchDelayCheckbox.checked = true;
        switchDelayCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
      localStorage.setItem('switchDelayEnabled', 'true');
      afterPairWaitEnabled = false;
      afterPairWaitMinSec = 0;
      afterPairWaitMaxSec = 2;
      if (afterPairMinInput) {
        afterPairMinInput.value = String(afterPairWaitMinSec);
        afterPairMinInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (afterPairMaxInput) {
        afterPairMaxInput.value = String(afterPairWaitMaxSec);
        afterPairMaxInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      localStorage.setItem('afterPairWaitEnabled', 'false');
      localStorage.setItem('afterPairWaitMinSec', String(afterPairWaitMinSec));
      localStorage.setItem('afterPairWaitMaxSec', String(afterPairWaitMaxSec));
      volatilityLimitEnabled = true;
      localStorage.setItem('volatilityLimitEnabled', 'true');
      buySliderValue = 95;
      buySliderMin = 90;
      buySliderMax = 100;
      if (buySliderMinInputEl) {
        buySliderMinInputEl.value = String(buySliderMin);
        buySliderMinInputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (buySliderMaxInputEl) {
        buySliderMaxInputEl.value = String(buySliderMax);
        buySliderMaxInputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (sellSliderInputEl) {
        sellSliderInputEl.value = String(sellSliderValue);
        sellSliderInputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      localStorage.setItem('buySliderValue', String(buySliderValue));
      localStorage.setItem('buySliderMin', String(buySliderMin));
      localStorage.setItem('buySliderMax', String(buySliderMax));
      localStorage.setItem('sellSliderValue', String(sellSliderValue));
      if (orderMonitorCheckbox) {
        orderMonitorCheckbox.checked = true;
        orderMonitorCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
      localStorage.setItem('orderMonitorEnabled', 'true');
      uptrendOrderEnabled = false;
      if (typeof upCheckbox !== 'undefined' && upCheckbox) {
        upCheckbox.checked = false;
        upCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
      localStorage.setItem('uptrendOrderEnabled', 'false');
      stableWindowSec = DEFAULT_STABLE_WINDOW_SEC;
      stableTolerancePct = DEFAULT_STABLE_TOLERANCE_PCT;
      if (stableSecInput) {
        stableSecInput.value = String(stableWindowSec);
        stableSecInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (stablePctInput) {
        stablePctInput.value = String(stableTolerancePct);
        stablePctInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      localStorage.setItem('stableWindowSec', String(stableWindowSec));
      localStorage.setItem('stableTolerancePct', String(stableTolerancePct));
      volatilityPauseEnabled = true;
      volatilityPauseSec = DEFAULT_VOLATILITY_PAUSE_SEC;
      if (typeof pauseCheckbox !== 'undefined' && pauseCheckbox) {
        pauseCheckbox.checked = true;
        pauseCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (typeof pauseSecInput !== 'undefined' && pauseSecInput) {
        pauseSecInput.value = String(volatilityPauseSec);
        pauseSecInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      localStorage.setItem('volatilityPauseEnabled', 'true');
      localStorage.setItem('volatilityPauseSec', String(volatilityPauseSec));
      // 重置点击间隔
      buyOrderWaitSec = DEFAULT_BUY_ORDER_WAIT_SEC;
      sellOrderWaitSec = DEFAULT_SELL_ORDER_WAIT_SEC;
      if (buyOrderWaitInput) {
        buyOrderWaitInput.value = String(buyOrderWaitSec);
        buyOrderWaitInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (sellOrderWaitInput) {
        sellOrderWaitInput.value = String(sellOrderWaitSec);
        sellOrderWaitInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      localStorage.setItem('buyOrderWaitSec', String(buyOrderWaitSec));
      localStorage.setItem('sellOrderWaitSec', String(sellOrderWaitSec));
      clickIntervalMin = 1000;
      clickIntervalMax = 3000;
      if (clickIntervalMinInput) {
        clickIntervalMinInput.value = String(clickIntervalMin);
        clickIntervalMinInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (clickIntervalMaxInput) {
        clickIntervalMaxInput.value = String(clickIntervalMax);
        clickIntervalMaxInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      localStorage.setItem('clickIntervalMin', String(clickIntervalMin));
      localStorage.setItem('clickIntervalMax', String(clickIntervalMax));

      try { pairProgress.clear(); } catch (_) {}
    }
  };

  let busy = false;


  let inputAmount, btnStart, btnClear, totalAmountDisplay, buyAmountDisplay, integralDisplay, tokenRecordsContainer;
  let currentTokenDisplay;
  let cycleTimeMinInput, cycleTimeMaxInput;
  let volatilityLimitEnabled = StorageLoader.bool('volatilityLimitEnabled', true);
  let orderMonitorCheckbox, switchDelayCheckbox;
  let buyOrderWaitInput, sellOrderWaitInput;
  let volatilityRangeDisplay;
  const volatilityRangeMin = RANGE_MIN;
  const volatilityRangeMax = RANGE_MAX;
  let quickAmount1 = StorageLoader.num('quickAmount1', 32800);
  let quickAmount2 = StorageLoader.num('quickAmount2', 65600);
  let quickAmount3 = StorageLoader.num('quickAmount3', 132000);
  let isEditMode = false;
  let quickAmountButtons = [];
  let editSaveButton;
  let afterPairWaitCheckbox, afterPairMinInput, afterPairMaxInput, afterPairBox;
  let buySliderInputEl, buySliderMinInputEl, buySliderMaxInputEl, sellSliderInputEl;

  const UIUpdater = {
    update(type, data) {
      switch(type) {
        case 'dailyVolume': return this.updateDailyVolumeUI();
        case 'multiplier': return this.updateMultiplierUI(data);
        case 'tokenRecords': return updateTokenRecordsDisplay();
        case 'sellSlider': return this.updateSellSliderDisabled();
        default: throw new Error(`Unknown update type: ${type}`);
      }
    },

    updateSellSliderDisabled() {
    if (sellSliderInputEl) {
      if (reverseOrderEnabled) {
        sellSliderInputEl.disabled = true;
        sellSliderInputEl.style.opacity = '0.5';
        sellSliderInputEl.style.backgroundColor = '#333';
        sellSliderInputEl.style.cursor = 'not-allowed';
      } else {
        sellSliderInputEl.disabled = false;
        sellSliderInputEl.style.opacity = '1';
        sellSliderInputEl.style.backgroundColor = '';
        sellSliderInputEl.style.cursor = '';
      }
    }
    },


    async updateDailyVolumeUI() {
      try {
        if (!dailyVolumeDisplay || !currentTokenDisplay) return;
        const sym = (currentTokenDisplay.textContent || '').trim();
        if (!sym) { dailyVolumeDisplay.textContent = ''; if (yesterdayVolumeDisplay) yesterdayVolumeDisplay.textContent=''; return; }
        const upper = sym.toUpperCase();
        try { await this.updateMultiplierUI(upper); } catch (_) {}
        if (yesterdayVolumeDisplay) yesterdayVolumeDisplay.textContent = '昨日成交:—';
        await initYesterdayVolumeIfNeeded(upper);
        dailyVolumeDisplay.textContent = '今日成交:—';
        const now = Date.now();
        const todayStart = DateUtils.getTodayStart(now);
        const todayVol = await DataManager.fetchDailyVolume(upper, todayStart, now);
        if (!isNaN(todayVol)) {
          const todayText = NumberUtils.format(todayVol, 'volume');
          if (!isNaN(yesterdayVolumeValue)) {
            const up = todayVol > yesterdayVolumeValue;
            dailyVolumeDisplay.style.color = up ? '#ff6666' : '#00ff88';
          } else {
            dailyVolumeDisplay.style.color = '#CCCCCC';
          }
          dailyVolumeDisplay.textContent = `今日成交:${todayText}`;
        }
        if (yesterdayVolumeValue && !isNaN(yesterdayVolumeValue)) {
          const yesterdayText = NumberUtils.format(yesterdayVolumeValue, 'volume');
          yesterdayVolumeDisplay.textContent = `昨日成交:${yesterdayText}`;
        }
      } catch (e) {
        console.error('updateDailyVolumeUI error:', e);
      }
    },

    async updateMultiplierUI(symbolUpper) {
      try {
        if (!multiplierDisplay) return;
        multiplierDisplay.textContent = '';
        const rec = await resolveAlphaRec(symbolUpper);
        if (!rec || !rec.alphaId) return;
        const symbol = `${rec.alphaId}USDT`;
        const url = `https://www.binance.com/bapi/defi/v1/public/alpha-trade/aggTicker24?dataType=limit&symbols=${encodeURIComponent(symbol)}`;
        const json = await fetchJSONNoCache(url);
        const arr = (json && json.data) || [];
        let mp = 0;
        if (Array.isArray(arr)) {
          const found = arr.find(it => it && (it.alphaId === rec.alphaId || it.symbol === symbol));
          if (found && found.mulPoint != null) mp = Number(found.mulPoint) || 0;
        } else if (json && json.data && json.data.mulPoint != null) {
          mp = Number(json.data.mulPoint) || 0;
        }

        if (mp > 1 && rec && rec.listingTime && rec.listingTime > 0) {
          currentMultiplierData = { mp, listingTime: rec.listingTime };
          currentMultiplier = mp;
          const now = Date.now();
          const timeSinceListing = now - rec.listingTime;
          const msPerDay = 24 * 60 * 60 * 1000;
          const remainingMs = Math.max(0, (30 * msPerDay) - timeSinceListing);

          if (remainingMs > 0) {
            const totalHours = Math.floor(remainingMs / (60 * 60 * 1000));
            const remainingMinutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
            const remainingSeconds = Math.floor((remainingMs % (60 * 1000)) / 1000);

            const hoursCountdown = `${totalHours.toString().padStart(2, '0')}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
            multiplierDisplay.textContent = `交易倍数:${mp}倍 ${hoursCountdown}`;
            multiplierDisplay.style.color = '#ffcc00';
            MultiplierCountdown.start();
          } else {
            multiplierDisplay.textContent = `交易倍数:${mp}倍 00:00:00`;
            multiplierDisplay.style.color = '#666';
            MultiplierCountdown.stop();
          }
        } else {
          currentMultiplierData = null;
          currentMultiplier = 1;
          multiplierDisplay.textContent = '倍数:—';
          multiplierDisplay.style.color = '#666';
          MultiplierCountdown.stop();
        }
        updateAmountDisplay();
    } catch (e) {
        console.error('UIUpdater.updateMultiplierUI error:', e);
        multiplierDisplay.textContent = '倍数:—';
        multiplierDisplay.style.color = '#666';
        MultiplierCountdown.stop();
    }
  }
  };

  function updateTokenRecordsDisplay() {
    if (!tokenRecordsContainer) return;

    tokenRecordsContainer.innerHTML = '';

    if (tokenRecords.size === 0) {
      const noDataMsg = document.createElement('div');
      noDataMsg.textContent = '暂无代币交易记录';
      noDataMsg.style.color = '#999';
      noDataMsg.style.textAlign = 'center';
      noDataMsg.style.padding = '20px';
      noDataMsg.style.fontStyle = 'italic';
      tokenRecordsContainer.appendChild(noDataMsg);
      return;
    }

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.fontSize = '12px';
    table.style.marginTop = '4px';
    table.style.marginBottom = '0px';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';

    const headers = ['代币', '总', '买'];
    const alignments = ['left', 'right', 'right'];
    headers.forEach((headerText, index) => {
      const th = document.createElement('th');
      th.textContent = headerText;
      th.style.padding = '4px 6px';
      th.style.textAlign = alignments[index];
      th.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)';
      th.style.fontSize = '11px';
      th.style.color = '#CCCCCC';
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    for (const [tokenName, record] of tokenRecords) {
      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';

      const tokenCell = document.createElement('td');
      tokenCell.style.padding = '3px 6px';
      tokenCell.style.color = '#ffcc00';
      tokenCell.style.fontWeight = 'bold';
      tokenCell.style.fontSize = '11px';
      tokenCell.style.display = 'flex';
      tokenCell.style.alignItems = 'center';
      tokenCell.style.gap = '4px';

      const tokenIcon = document.createElement('img');
      tokenIcon.style.width = '14px';
      tokenIcon.style.height = '14px';
      tokenIcon.style.borderRadius = '3px';
      tokenIcon.style.marginRight = '2px';
      tokenIcon.alt = tokenName;
      tokenIcon.onerror = () => { tokenIcon.style.display = 'none'; };

      const tokenText = document.createElement('span');
      tokenText.textContent = tokenName;

      tokenCell.appendChild(tokenIcon);
      tokenCell.appendChild(tokenText);
      row.appendChild(tokenCell);

      loadTokenIconForRecord(tokenIcon, tokenName);

      const totalCell = document.createElement('td');
      totalCell.textContent = record.total.toFixed(4);
      totalCell.style.padding = '3px 6px';
      totalCell.style.color = '#ffcc00';
      totalCell.style.fontSize = '11px';
      totalCell.style.textAlign = 'right';
      row.appendChild(totalCell);

      const buyCell = document.createElement('td');
      buyCell.textContent = record.buy.toFixed(4);
      buyCell.style.padding = '3px 6px';
      buyCell.style.color = '#00ff88';
      buyCell.style.fontSize = '11px';
      buyCell.style.textAlign = 'right';
      row.appendChild(buyCell);

      tbody.appendChild(row);
    }

    table.appendChild(tbody);
    tokenRecordsContainer.appendChild(table);
  }

  const Calculator = {
    calculateIntegral(totalAmount) {
      for (let i = 0; i < INTEGRAL_THRESHOLDS.length; i++) {
        if (totalAmount < INTEGRAL_THRESHOLDS[i]) return i;
      }
      return INTEGRAL_THRESHOLDS.length;
    },

    computeVWAP(samples) {
      let sumPV = 0, sumV = 0;
      for (const s of samples) { if (!isNaN(s.v) && s.v > 0) { sumPV += s.p * s.v; sumV += s.v; } }
      return sumV > 0 ? (sumPV / sumV) : NaN;
    },

    computeWeightedQuantile(samples, q) {
      const arr = samples.filter(s => !isNaN(s.v) && s.v > 0).slice().sort((a, b) => a.p - b.p);
      let totalV = 0; for (const s of arr) totalV += s.v;
      if (totalV <= 0) return NaN;
      const target = totalV * q;
      let cum = 0;
      for (const s of arr) {
        cum += s.v;
        if (cum >= target) return s.p;
      }
      return arr.length ? arr[arr.length - 1].p : NaN;
    }
  };



  function saveTokenRecords() {
    try {
      const recordsObj = Object.fromEntries(tokenRecords);
      localStorage.setItem('tokenRecords', JSON.stringify(recordsObj));
    } catch (e) {
    }
  }

  async function loadTokenIconForRecord(imgElement, tokenName) {
    try {
      const sym = tokenName.trim().toUpperCase();
      if (!sym) return;
      if (tokenIconUrlCache.has(sym)) {
        const cachedUrl = tokenIconUrlCache.get(sym);
        if (cachedUrl) imgElement.src = cachedUrl;
        return;
      }

      const cache = await DataManager.fetchAlphaTokenMap();
      if (!cache) return;

      let rec = null;

      if (sym && cache.bySymbol && cache.bySymbol.has(sym)) {
        rec = cache.bySymbol.get(sym);
      }

      tokenIconUrlCache.set(sym, rec && rec.iconUrl ? rec.iconUrl : '');
      if (rec && rec.iconUrl) {
        imgElement.src = rec.iconUrl;
      }
    } catch (e) {
    }
  }


  let orderMonitorPersisted = StorageLoader.bool('orderMonitorEnabled', true);
  let rememberPositionEnabled = StorageLoader.bool('rememberPositionEnabled', false);
  let rememberPositionCheckbox;
  let reverseOrderEnabled = StorageLoader.bool('reverseOrderEnabled', false);
  let reverseOrderInitialFillArmed = true;
  let reverseOrderInitialFillDone = false;
  let reverseOrderCheckbox;
  let authenticatorEnabled = false;
  let authenticatorSecret = '';
  let authenticatorCheckbox;
  let authenticatorSecretInput;
  let clickIntervalMin = StorageLoader.num('clickIntervalMin', 1000);
  let clickIntervalMax = StorageLoader.num('clickIntervalMax', 3000);
  let clickIntervalMinInput;
  let clickIntervalMaxInput;
  let stableDetectEnabled = StorageLoader.bool('stableDetectEnabled', true);
  let stableWindowSec = DEFAULT_STABLE_WINDOW_SEC;
  let stableTolerancePct = DEFAULT_STABLE_TOLERANCE_PCT;
  let stableMinSamples = STABLE_MIN_SAMPLES_CONST;
let stableMinCoverageSec = STABLE_MIN_COVERAGE_SEC_CONST;
let stableMaxLagSec = STABLE_MAX_LAG_SEC_CONST;
  let stableCheckbox, stableBox, stableSecInput, stablePctInput;
  let stableTimer = null;
  let settingsWrapper = null;
  const seenFilledEls = new WeakSet();
  class RingBuffer {
    constructor(capacity) {
      this.cap = Math.max(8, capacity | 0);
      this.buf = new Array(this.cap);
      this.head = 0;
      this.size = 0;
    }
    push(item) {
      if (this.size < this.cap) {
        this.buf[(this.head + this.size) % this.cap] = item;
        this.size++;
      } else {
        this.buf[this.head] = item;
        this.head = (this.head + 1) % this.cap;
      }
    }
    evictOlderThan(cutoffMs) {
      while (this.size > 0) {
        const it = this.buf[this.head];
        if (it && it.t < cutoffMs) {
          this.head = (this.head + 1) % this.cap;
          this.size--;
        } else {
          break;
        }
      }
    }
    toArray() {
      const out = new Array(this.size);
      for (let i = 0; i < this.size; i++) {
        out[i] = this.buf[(this.head + i) % this.cap];
      }
      return out;
    }
    clear() { this.head = 0; this.size = 0; }
    resize(newCap) {
      newCap = Math.max(8, newCap | 0);
      if (newCap === this.cap) return;
      const arr = this.toArray();
      this.cap = newCap;
      this.buf = new Array(this.cap);
      this.head = 0;
      this.size = 0;
      const start = Math.max(0, arr.length - this.cap);
      for (let i = start; i < arr.length; i++) this.push(arr[i]);
    }
  }
  function recommendCapacity(windowSec) {
    const est = windowSec * 10 + 32;
    let cap = 1; while (cap < est) cap <<= 1; cap = Math.max(64, cap);
    return cap;
  }
  let sampleBuffer = new RingBuffer(recommendCapacity(20));
  let volatilityDisplay;
  let directionDisplay;
  let rangeDisplay;
  let dailyVolumeDisplay;
  let yesterdayVolumeDisplay;
  let multiplierDisplay;
  let dailyRefreshTimer = null;
  let currentMultiplierData = null; // 存储当前倍数数据用于倒计时
  let yesterdayVolumeValue = NaN;
  let yesterdayAlphaId = '';
  let yesterdayWindowStart = 0;
  let alphaTokenCache = { bySymbol: null, byAddress: null, ts: 0 };
  let lastProcessMs = 0;
  let lastRangePct = NaN;
  let tokenIconImg = null;
  let tokenIconLoaded = false;
  let balanceInit = parseFloat(localStorage.getItem('balanceInit') || 'NaN');
  let balanceCurrent = parseFloat(localStorage.getItem('balanceCurrent') || 'NaN');
  let balanceWear = parseFloat(localStorage.getItem('balanceWear') || 'NaN');
  let balanceBaselineLocked = localStorage.getItem('balanceBaselineLocked') === 'true';
  let balanceInitSpan, balanceCurSpan, balanceWearSpan;
  let balanceSnifferStarted = false;
  let balanceDisabled = false;
  let inTradeFlow = false;
  let lastFirstBtnClickAt = 0;
  let realtimeStatsEnabled = true;
  try { localStorage.setItem('realtimeStatsEnabled', 'true'); } catch (_) {}
  let realtimeStatsStartTime = 0;
  let realtimeStatsRecordedKeys = new Set();
  let filledBuyFingerprints = new Set();
  let filledBuyOrderRecords = new Map();
  let filledBuyRecentRecords = [];
  let realtimeStatsBackfillTimer = null;
  let realtimeStatsScanInFlight = false;
  let realtimeStatsScanGeneration = 0;
  let buyStatsFollowupTimer = null;
  let buyStatsFollowupUntilMs = 0;
  let buyStatsNeedsFinalScan = false;
  let lastBuyOrderSubmittedAt = 0;
  let buyStatsFinalScanTimer = null;
  let buyStatsFinalScanUntilMs = 0;
  let realtimeStatsCheckbox;
  let completionAudioContext = null;
  let lastCompletionSoundAt = 0;
  let lastOrderStuckAlertAt = 0;
  const buyPricePremiumPct = DEFAULT_BUY_PRICE_PREMIUM_PCT;
  const sellPriceDiscountPct = DEFAULT_SELL_PRICE_DISCOUNT_PCT;
  const singleTradeMaxWearPct = DEFAULT_SINGLE_TRADE_MAX_WEAR_PCT;
  let buyOrderWaitSec = StorageLoader.num('buyOrderWaitSec', DEFAULT_BUY_ORDER_WAIT_SEC);
  let sellOrderWaitSec = StorageLoader.num('sellOrderWaitSec', DEFAULT_SELL_ORDER_WAIT_SEC);
  migrateOrderWaitDefaultSeconds();
  let lastPlannedBuyPrice = NaN;
  let lastBuyReferencePrice = NaN;
  let protectionPauseReason = '';
  let volatilityPauseEnabled = StorageLoader.bool('volatilityPauseEnabled', true);
  let volatilityPauseSec = StorageLoader.num('volatilityPauseSec', DEFAULT_VOLATILITY_PAUSE_SEC);
  let stableStateIsStable = false;
  let stableSinceMs = 0;
  // 停滞监测变量
  let lastSignPct = NaN;
  let lastPctChangeMs = 0;
  let lastForceApiAt = 0;
  let uptrendOrderEnabled = StorageLoader.bool('uptrendOrderEnabled', false);
  let uptrendRequiredCount = StorageLoader.num('uptrendRequiredCount', 3);
  let uptrendThresholdPct = StorageLoader.num('uptrendThresholdPct', 0.002);
  let uptrendConsecCount = 0;
  let uptrendConditionNow = false;
  let uptrendSlopeWindowSec = StorageLoader.num('uptrendSlopeWindowSec', 5);
  let uptrendMinSlopePctPerSec = StorageLoader.num('uptrendMinSlopePctPerSec', 0);
  let uptrendMinSecondDerivPctPerSec2 = StorageLoader.num('uptrendMinSecondDerivPctPerSec2', -0.03);

  function loadStoredStringSet(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
    } catch (_) {
      return new Set();
    }
  }

  function loadStoredOrderMap(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return new Map();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return new Map();
      return new Map(Object.entries(parsed));
    } catch (_) {
      return new Map();
    }
  }

  function migrateOrderWaitDefaultSeconds() {
    const migrate = (key, oldDefaultValue, nextDefaultValue) => {
      try {
        const raw = localStorage.getItem(key);
        const parsed = Number(raw);
        if (raw == null || raw === '' || parsed === oldDefaultValue) {
          localStorage.setItem(key, String(nextDefaultValue));
          return nextDefaultValue;
        }
        return Number.isFinite(parsed) && parsed > 0 ? parsed : nextDefaultValue;
      } catch (_) {
        return nextDefaultValue;
      }
    };
    buyOrderWaitSec = migrate('buyOrderWaitSec', 30, DEFAULT_BUY_ORDER_WAIT_SEC);
    sellOrderWaitSec = migrate('sellOrderWaitSec', 20, DEFAULT_SELL_ORDER_WAIT_SEC);
  }

  function saveRealtimeStatsState() {
    try {
      localStorage.setItem(REALTIME_STATS_RECORDED_KEYS_STORAGE, JSON.stringify(Array.from(realtimeStatsRecordedKeys).slice(-3000)));
      localStorage.setItem(FILLED_BUY_FINGERPRINTS_STORAGE, JSON.stringify(Array.from(filledBuyFingerprints).slice(-3000)));
      localStorage.setItem(FILLED_BUY_ORDER_RECORDS_STORAGE, JSON.stringify(Object.fromEntries(filledBuyOrderRecords)));
      if (realtimeStatsStartTime > 0) localStorage.setItem(REALTIME_STATS_START_TIME_STORAGE, String(realtimeStatsStartTime));
    } catch (_) {}
  }

  function clearRealtimeStatsState() {
    try {
      realtimeStatsRecordedKeys.clear();
      filledBuyFingerprints.clear();
      filledBuyOrderRecords.clear();
      filledBuyRecentRecords = [];
      localStorage.removeItem(REALTIME_STATS_RECORDED_KEYS_STORAGE);
      localStorage.removeItem(FILLED_BUY_FINGERPRINTS_STORAGE);
      localStorage.removeItem(FILLED_BUY_ORDER_RECORDS_STORAGE);
      localStorage.removeItem(REALTIME_STATS_START_TIME_STORAGE);
    } catch (_) {}
  }

  realtimeStatsRecordedKeys = loadStoredStringSet(REALTIME_STATS_RECORDED_KEYS_STORAGE);
  filledBuyFingerprints = loadStoredStringSet(FILLED_BUY_FINGERPRINTS_STORAGE);
  filledBuyOrderRecords = loadStoredOrderMap(FILLED_BUY_ORDER_RECORDS_STORAGE);
  try {
    const storedStatsStartTime = parseFloat(localStorage.getItem(REALTIME_STATS_START_TIME_STORAGE) || '0');
    if (Number.isFinite(storedStatsStartTime) && storedStatsStartTime > 0) realtimeStatsStartTime = storedStatsStartTime;
  } catch (_) {}


  const DataManager = {
    async fetch(type, params) {
      switch(type) {
        case 'trades':
          return this.fetchLatestTrades(params.alphaId, params.limit);
        case 'alphaId':
          return this.getCurrentAlphaId();
        case 'tokenMap':
          return this.fetchAlphaTokenMap();
        case 'dailyVolume':
          return this.fetchDailyVolume(params.symbolUpper, params.startMs, params.endMs);
        default:
          throw new Error(`Unknown fetch type: ${type}`);
      }
    },

    async fetchLatestTrades(alphaId, limit = 10) {
    try {
      const url = `https://www.binance.com/bapi/defi/v1/public/alpha-trade/agg-trades?symbol=${encodeURIComponent(alphaId)}USDT&limit=${limit}`;
      const json = await fetchJSONNoCache(url);
      const trades = (json && json.data) || [];
      return trades.map(trade => ({
        price: parseFloat(trade.p),
        volume: parseFloat(trade.q),
        timestamp: trade.T,
        tradeId: trade.a
      })).filter(trade => !isNaN(trade.price) && !isNaN(trade.volume) && trade.price > 0 && trade.volume > 0);
    } catch (e) {
      return [];
    }
    },

    async getCurrentAlphaId() {
    try {
      const sym = (currentTokenDisplay && currentTokenDisplay.textContent || '').trim();
      const cache = await this.fetchAlphaTokenMap();
      if (!cache) return null;
      let rec = null;
      const addr = getAlphaPageContract();
      if (addr && cache.byAddress && cache.byAddress.has(addr)) {
        rec = cache.byAddress.get(addr);
      }
      if (!rec && sym && sym !== '-' && cache.bySymbol) {
        rec = cache.bySymbol.get(sym.toUpperCase());
      }
      return rec ? rec.alphaId : null;
    } catch (e) {
        return null;
      }
    },

    async fetchAlphaTokenMap() {
      const now = Date.now();
      if (alphaTokenCache.bySymbol && alphaTokenCache.byAddress && now - alphaTokenCache.ts < 5 * 60 * 1000) return alphaTokenCache;
      const url = 'https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list';
      try {
        const json = await fetchJSONNoCache(url);
        const arr = (json && json.data) || [];
        const bySymbol = new Map();
        const byAddress = new Map();
        for (const it of arr) {
          if (it && it.alphaId) {
            const sym = (it.symbol || '').toString().toUpperCase();
            const addr = (it.contractAddress || '').toString().toLowerCase();
            const rec = { alphaId: it.alphaId, symbol: sym, contract: addr, iconUrl: it.iconUrl || '', listingTime: Number(it.listingTime) || 0 };
            if (sym) bySymbol.set(sym, rec);
            if (addr) byAddress.set(addr, rec);
          }
        }
        alphaTokenCache = { bySymbol, byAddress, ts: now };
        return alphaTokenCache;
      } catch (e) {
      return null;
    }
    },

    async fetchDailyVolume(symbolUpper, startMs, endMs) {
      try {
        const cache = await this.fetchAlphaTokenMap();
        if (!cache) return NaN;
        let rec = null;
        const addr = getAlphaPageContract();
        if (addr && cache.byAddress && cache.byAddress.has(addr)) {
          rec = cache.byAddress.get(addr);
        }
        if (!rec && cache.bySymbol) rec = cache.bySymbol.get(symbolUpper);
        if (!rec || !rec.alphaId) return NaN;
        const alphaId = rec.alphaId;
        const url = `https://www.binance.com/bapi/defi/v1/public/alpha-trade/klines?symbol=${encodeURIComponent(alphaId)}USDT&interval=1h&startTime=${startMs}&endTime=${endMs}&limit=1500`;
        const json = await fetchJSONNoCache(url);
        const lines = (json && json.data) || [];
        let vol = 0;
        let idx = 0;
        for (const k of lines) {
          let v = 0;
          if (k && typeof k === 'object') {
            if (Array.isArray(k)) {
              const raw = k[7];
              v = parseFloat(raw);
            } else if ('volume' in k) {
              v = parseFloat(k.volume);
            }
          }
          if (!isNaN(v) && v > 0) {
            vol += v;
            idx++;
          }
        }
        return idx > 0 ? vol : NaN;
      } catch (e) {
        return NaN;
      }
    }
  };



  async function processLatestTradeAPI(now) {
    try {
      const alphaId = await DataManager.getCurrentAlphaId();
      if (!alphaId) {
        return;
      }
      const trades = await DataManager.fetchLatestTrades(alphaId, stableWindowSec);
      if (trades.length === 0) {
        return;
      }
      for (const trade of trades) {
        sampleBuffer.push({ t: trade.timestamp, p: trade.price, v: trade.volume });

      }
      const cutoff = now - stableWindowSec * 1000;
      sampleBuffer.evictOlderThan(cutoff);
      const arr = sampleBuffer.toArray();
      if (arr.length < stableMinSamples) {
        VolatilityUI.clearVolatilityIndicator();
        stableStateIsStable = false; stableSinceMs = 0;

        return;
      }
      const coverageMs = arr[arr.length - 1].t - arr[0].t;
      if (coverageMs < stableMinCoverageSec * 1000) {
        VolatilityUI.clearVolatilityIndicator();
        stableStateIsStable = false; stableSinceMs = 0;

        return;
      }
      const latestLagMs = now - arr[arr.length - 1].t;
      if (latestLagMs > stableMaxLagSec * 1000) {
        VolatilityUI.clearVolatilityIndicator();
        stableStateIsStable = false; stableSinceMs = 0;

        return;
      }
      const p05 = Calculator.computeWeightedQuantile(arr, 0.05);
      const p95 = Calculator.computeWeightedQuantile(arr, 0.95);
      const vwap = Calculator.computeVWAP(arr);
      if (!isNaN(p05) && !isNaN(p95) && !isNaN(vwap) && vwap !== 0) {
        const rangePct = Math.abs((p95 - p05) / vwap) * 100;
        lastRangePct = rangePct;
        const isStable = rangePct <= stableTolerancePct;
        const p50 = Calculator.computeWeightedQuantile(arr, 0.5);
        const signPct = isNaN(p50) ? NaN : ((p50 - vwap) / vwap) * 100;
        const lastPrice = trades[0] ? trades[0].price : NaN;
        const biasPct = isNaN(lastPrice) ? NaN : ((lastPrice - vwap) / vwap) * 100;
        let slopePctPerSec = NaN;
        let secondDerivPctPerSec2 = NaN;
        try {
          const wMs = Math.max(1000, Math.floor(stableWindowSec * 1000));
          const cut = now - wMs;
          const seg = arr.filter(s => s.t >= cut);
          if (seg.length >= 3) {
            const t0 = seg[0].t;
            let Sw = 0, Swx = 0, Swy = 0, Swxx = 0, Swxy = 0;
            for (const s of seg) {
              const w = Math.max(0, Number(s.v) || 0);
              const x = (s.t - t0) / 1000;
              const y = s.p;
              Sw += w; Swx += w * x; Swy += w * y; Swxx += w * x * x; Swxy += w * x * y;
            }
            const denom = Sw * Swxx - Swx * Swx;
            const slope = denom !== 0 ? (Sw * Swxy - Swx * Swy) / denom : 0;
            slopePctPerSec = (slope / vwap) * 100;
            const midMs = cut + wMs / 2;
            const seg1 = seg.filter(s => s.t < midMs);
            const seg2 = seg.filter(s => s.t >= midMs);
            function wlsSlope(a) {
              if (a.length < 2) return 0;
              const t00 = a[0].t; let sw=0, swx=0, swy=0, swxx=0, swxy=0;
              for (const s of a) { const w = Math.max(0, Number(s.v)||0); const x=(s.t - t00)/1000; const y=s.p; sw+=w; swx+=w*x; swy+=w*y; swxx+=w*x*x; swxy+=w*x*y; }
              const d = sw*swxx - swx*swx; return d!==0 ? (sw*swxy - swx*swy)/d : 0;
            }
            const s1 = wlsSlope(seg1);
            const s2 = wlsSlope(seg2);
            const halfSec = (wMs/2)/1000;
            const sdot = halfSec > 0 ? (s2 - s1) / halfSec : 0;
            secondDerivPctPerSec2 = (sdot / vwap) * 100;
          }
        } catch (_) {}

        // 停滞监测：检查 signPct 和 rangePct 是否发生变化
        const tolerance = 1e-6;
        const signPctChanged = isNaN(lastSignPct) || Math.abs(signPct - lastSignPct) > tolerance;
        const rangePctChanged = isNaN(lastRangePct) || Math.abs(rangePct - lastRangePct) > tolerance;

        if (signPctChanged || rangePctChanged) {
          lastPctChangeMs = now;
          lastSignPct = signPct;
        }

        // 5秒停滞触发刷新机制
        const stagnationMs = 5000; // 5秒停滞阈值
        const cooldownMs = 2000;   // 2秒冷却时间
        const timeSinceLastChange = now - lastPctChangeMs;
        const timeSinceLastForce = now - lastForceApiAt;

        if (timeSinceLastChange >= stagnationMs && timeSinceLastForce >= cooldownMs) {
          lastForceApiAt = now;
          // 通过 Scheduler.enqueue 触发额外的 API 处理，使用 1秒节流避免频繁连发
          Scheduler.enqueue({
            key: 'stable:force:refresh',
            phase: 'compute',
            fn: () => processLatestTradeAPI(Date.now()),
            minIntervalMs: 1000
          });
        }

        VolatilityUI.updateVolatilityIndicator(isStable);
        VolatilityUI.updateDirectionAndRange({ signPct, biasPct, rangePct });
        if (uptrendOrderEnabled && !isNaN(signPct)) {
          const slopeOk = !isNaN(slopePctPerSec) ? (slopePctPerSec > uptrendMinSlopePctPerSec) : true;
          const d2Ok = !isNaN(secondDerivPctPerSec2) ? (secondDerivPctPerSec2 >= uptrendMinSecondDerivPctPerSec2) : true;
          const cond = (signPct >= uptrendThresholdPct) && slopeOk && d2Ok;
          uptrendConditionNow = cond;
          if (cond) { uptrendConsecCount = Math.min(uptrendRequiredCount, (uptrendConsecCount || 0) + 1); }
          else { uptrendConsecCount = 0; }
        } else {
          uptrendConditionNow = false;
          uptrendConsecCount = 0;
        }
        if (isStable) {
          if (!stableStateIsStable) { stableSinceMs = now; }
          stableStateIsStable = true;
        } else {
          stableStateIsStable = false;
          stableSinceMs = 0;
        }
      } else {
        VolatilityUI.clearVolatilityIndicator();
        stableStateIsStable = false; stableSinceMs = 0;
        uptrendConditionNow = false; uptrendConsecCount = 0;

      }
    } catch (e) {

    }
  }
  function startStableMonitor() {
    if (stableTimer) return;

    stableTimer = setManagedInterval('stableTimer', RESOURCE_IDS.stableMonitor, () => {
      Scheduler.enqueue({
        key: 'stable:process:api',
        phase: 'compute',
        fn: () => processLatestTradeAPI(Date.now())
      });
    }, STABLE_FALLBACK_POLL_MS, () => { stableTimer = null; });
  }
  function stopStableMonitor() {
    ResourceManager.cleanup('stableTimer', RESOURCE_IDS.stableMonitor);
    stableTimer = null;
    stableStateIsStable = false; stableSinceMs = 0;
  }

  const VolatilityUI = {
    enabled: true,

    update({ isStable, signPct, biasPct, rangePct }) {
      if (!this.enabled) {
        this.clear();
        return;
      }

      // 更新波动性指示器
      this.updateVolatilityIndicator(isStable);

      // 更新方向和范围显示
      this.updateDirectionAndRange({ signPct, biasPct, rangePct });
    },

    updateVolatilityIndicator(isStable) {
    if (!volatilityDisplay) return;
    if (!stableDetectEnabled) {
      volatilityDisplay.textContent = '';
      return;
    }
    if (isStable) {
      volatilityDisplay.textContent = ' 稳定';
      volatilityDisplay.style.color = '#00ff88';
    } else {
      volatilityDisplay.textContent = ' 波动';
      volatilityDisplay.style.color = '#ffcc00';
    }
    },

    updateDirectionAndRange({ signPct, biasPct, rangePct }) {
      if (!directionDisplay || !rangeDisplay) return;
      if (!stableDetectEnabled || [signPct, biasPct, rangePct].some(v => isNaN(v))) {
        this.clearDirectionAndRange();
        return;
      }
      const up = signPct > 0;
      directionDisplay.textContent = up ? `${Math.abs(signPct).toFixed(4)}% ↑` : (signPct < 0 ? `${Math.abs(signPct).toFixed(4)}% ↓` : `±0.0000%`);
      directionDisplay.style.display = 'inline-block';
      rangeDisplay.style.display = 'inline-block';
      directionDisplay.style.color = up ? '#00ff88' : (signPct < 0 ? '#ff6666' : '#ffffff');
      directionDisplay.style.fontVariantNumeric = 'tabular-nums';
      rangeDisplay.style.fontVariantNumeric = 'tabular-nums';
      rangeDisplay.textContent = ` ${rangePct.toFixed(4)}%`;
      rangeDisplay.style.color = '#ffffff';
      this.syncRightColWidth();
    },

    clear() {
      this.clearVolatilityIndicator();
      this.clearDirectionAndRange();
    },

    clearVolatilityIndicator() {
    if (!volatilityDisplay) return;
    volatilityDisplay.textContent = '';
    },

    clearDirectionAndRange() {
      if (directionDisplay) directionDisplay.textContent = '';
      if (rangeDisplay) rangeDisplay.textContent = '';
    },

    syncRightColWidth() {
      try {
        if (!rangeDisplay || !directionDisplay) return;
        rangeDisplay.style.width = '';
        directionDisplay.style.width = '';
        const w = Math.max(rangeDisplay.offsetWidth || 0, directionDisplay.offsetWidth || 0);
        if (w > 0) {
          rangeDisplay.style.width = w + 'px';
          directionDisplay.style.width = w + 'px';
          rangeDisplay.style.textAlign = 'right';
          directionDisplay.style.textAlign = 'right';
        }
      } catch (_) {}
    }
  };
  function isNodeVisible(node) {
    if (!(node instanceof Element)) return false;
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }



  function $xpath(path) {
    return DOMCache.get(path);
  }
  const TabManager = {
    tabParentXpaths: [
    '/html/body/div[5]/div[2]/div[7]/div/div[2]/div[1]/div[1]',
    '/html/body/div[4]/div[2]/div[7]/div/div[2]/div[1]/div[1]'
    ],

    amountXpaths: [
      '/html/body/div[4]/div[2]/div/div/div[2]/div[4]/div[2]/text()[1]'
    ],

    getParent() {
      for (const xpath of this.tabParentXpaths) {
      const elem = $xpath(xpath);
      if (elem) return elem;
    }
    return null;
    },

    click(index) {
      const tabParent = this.getParent();
    if (!tabParent) return;
    const tabTexts = ['买入', '卖出'];
    const tabs = tabParent.querySelectorAll('div');
    for (let tab of tabs) {
      if (tab.innerText.trim() === tabTexts[index]) {
        simulateRealMouseClick(tab);
        break;
      }
    }
    },

    getAmountFromVisibleInputs() {
      const sideWords = currentTabIndex === 0 ? ['买', 'Buy'] : ['卖', 'Sell'];
      const inputs = Array.from(document.querySelectorAll('input, textarea')).filter(input => {
        if (!isNodeVisible(input)) return false;
        if (input.closest && input.closest('#alpha-extension-engine-container')) return false;
        const value = (input.value || '').trim();
        return /\d/.test(value);
      });
      let best = null;
      let bestScore = -1;
      for (const input of inputs) {
        const meta = [
          input.id,
          input.name,
          input.placeholder,
          input.getAttribute('aria-label'),
          input.className
        ].filter(Boolean).join(' ');
        let score = 0;
        if (/limitTotal|total|amount|quote/i.test(meta)) score += 4;
        if (sideWords.some(word => meta.includes(word))) score += 4;
        if (/USDT|金额|总额|买入|卖出|Buy|Sell/i.test(meta)) score += 2;
        if (input.id === 'limitTotal') score += 3;
        if (score > bestScore) {
          bestScore = score;
          best = input;
        }
      }
      return best && bestScore > 0 ? (best.value || '').trim() : '';
    },

    getAmountText(options = {}) {
      if (realtimeStatsEnabled && !options.allowRealtime) {
        return '';
      }
      const inputAmountText = this.getAmountFromVisibleInputs();
      if (inputAmountText) return inputAmountText;
      for (const xpath of this.amountXpaths) {
        const element = DOMCache.get(xpath);
        if (element && element.textContent) {
          const result = element.textContent.trim();
          if (result) return result;
        }
      }
      return '';
    }
  };




  const TradingEngine = {
    async preClick() {
        if (!volatilityLimitEnabled) return;
        const input = Array.from(document.querySelectorAll('input#limitPrice')).find(el => isNodeVisible(el)) || document.querySelector('input#limitPrice');
        if (input) {
      let desired = null;
      if (volatilityLimitEnabled && !isNaN(lastRangePct)) {
        try {
            const alphaId = await DataManager.getCurrentAlphaId();
          if (alphaId) {
              const trades = await DataManager.fetchLatestTrades(alphaId, 1);
            if (trades.length > 0) {
              const base = trades[0].price;
              if (!isNaN(base) && base > 0) {
                const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
                const pct = clamp(lastRangePct, volatilityRangeMin, volatilityRangeMax);
                const factor = currentTabIndex === 0 ? (1 + pct / 100) : (1 - pct / 100);
                const price = base * factor;
                desired = String(price);
              }
            }
          }
        } catch (e) {
        }
      }
      if (desired) {
        if (currentTabIndex === 0) {
          desired = protectBuyPrice(desired);
          if (!desired) return;
          lastPlannedBuyPrice = parsePriceNumber(desired);
        } else if (currentTabIndex === 1) {
          desired = protectSellPrice(desired, { applyDiscount: true });
          if (!desired) return;
        }
        try {
          simulateRealMouseClick(input);
          if (!setNativeInputValue(input, desired)) return;
          if (currentTabIndex === 0 && reverseOrderEnabled) {
            try {
              await syncReverseOrderPriceInput(desired, { onlyIfEmpty: false, preferFallback: true });
            } catch (_) {}
          }
          // 等待第一个输入框完成后再处理反向订单
          await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (clickIntervalMax - clickIntervalMin + 1)) + clickIntervalMin));
        return;
        } catch (_) {}
      }

    }
    const path = '//*[@id="__APP"]/div[2]/div[7]/div/div[2]/div[3]/div[1]/div[1]/div[2]/div[2]';
    const elem = $xpath(path);
    if (elem) simulateRealMouseClick(elem);
    },

    async preThirdStepClick() {
    await sleep(PRE_THIRD_STEP_INITIAL_WAIT_MS);
    function isVisible(el) {
      if (!(el instanceof Element)) return false;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }
    function getContinueEls() {
      const containers = Array.from(document.querySelectorAll('.bn-modal-confirm-actions'));
      const out = [];
      for (const c of containers) {
        const kids = Array.from(c.querySelectorAll('*'))
          .filter(el => {
            const text = (el.textContent || '').trim();
            return (/继续/.test(text) || /确认/.test(text)) && isVisible(el);
          });
        out.push(...kids);
      }
      return out;
    }
    function safeClick(el) {
      return simulateRealMouseClick(el);
    }
    let clickCount = 0;
    const endAt = Date.now() + PRE_THIRD_STEP_CLICK_WINDOW_MS;
    let lastClickMs = 0;
    while (Date.now() < endAt) {
      const btns = getContinueEls();
      let any = false;
      for (const b of btns) { safeClick(b); clickCount++; any = true; lastClickMs = Date.now(); await sleep(CONTINUE_CLICK_INTERVAL_MS); }
      if (!any && Date.now() - lastClickMs >= OBSERVE_IDLE_MS) break;
      await sleep(CONTINUE_SCAN_INTERVAL_MS);
    }
    },

    async waitForFillConfirmation(tabIndex, maxWait = FILL_MAX_WAIT_MS) {
    const expectedText = reverseOrderEnabled ? '限价卖单已成交' : (tabIndex === 0 ? '限价买单已成交' : '限价卖单已成交');
    const errorText = '余额不足，下单失败。';
    const sellParamError1 = '非法参数';
    const sellParamError2 = '参数非法';
    const sellParamSelector = '.bn-notification-content-message.data-push-message';
    const cancelRe = /(已取消|已撤销|撤单成功|取消成功|订单取消|订单已取消|订单已撤销|Order\s*(cancelled|canceled)|Cancelled|Canceled)/i;
    const pollInterval = POLL_INTERVAL_FILL;

    const checkStatusNow = () => {
      try {
        const errSnap = document.evaluate(`//*[contains(text(), "${errorText}")]`, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < errSnap.snapshotLength; i++) {
          const el = errSnap.snapshotItem(i);
          if (isNodeVisible(el)) return 'insufficient';
        }
        const noteEls = Array.from(document.querySelectorAll(sellParamSelector));
        for (const el of noteEls) {
          const txt = (el.textContent || '').trim();
          if (cancelRe.test(txt) && isNodeVisible(el)) return 'cancelled';
          if ((txt.includes(sellParamError1) || txt.includes(sellParamError2)) && isNodeVisible(el)) return 'sell_param_error';
        }
          const snap = document.evaluate(`//*[contains(text(), "${expectedText}")]`, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          for (let i = 0; i < snap.snapshotLength; i++) {
            const el = snap.snapshotItem(i);
            if (isNodeVisible(el)) return 'filled';
          }
        } catch (e) {
        }
      return null;
    };

      const start = Date.now();
      while (Date.now() - start < maxWait) {
        const status = checkStatusNow();
        if (status === 'filled') return 'filled';
        if (status === 'cancelled') return 'cancelled';
        if (status === 'insufficient') return 'insufficient';
        if (status === 'sell_param_error') return 'sell_param_error';
        await sleep(pollInterval);
      }
      try {
        const hasOpenOrder = await hasOpenCurrentOrdersForCurrentToken();
        if (!hasOpenOrder) return 'cancelled';
      } catch (_) {}
      return 'timeout';
    },

    async waitAndClickSecondButton(sessionToken) {
    const maxWait = MAX_WAIT_SECOND_BTN;
    const pollInterval = POLL_INTERVAL_BTN;
    const selectors = [
      '//*[@id="__APP"]/div[3]/div/div/button',
      '//*[@id="__APP"]/div[3]//button',
    ];
    function findBtn() {
      const labelRe = reverseOrderEnabled ? /确认/ : /继续/;
      const primaryBtns = Array.from(document.querySelectorAll('.bn-modal-confirm-actions .bn-button.bn-button__primary'))
        .filter(el => labelRe.test((el.textContent || '').trim()) && isNodeVisible(el));
      if (primaryBtns.length > 0) return primaryBtns[0];
      const reverseConfirmSelectors = [
        '//*[@id="__APP"]/div[3]/div/div/button',
        '/html/body/div[4]/div[3]/div/div/button'
      ];
      const xpList = reverseOrderEnabled ? reverseConfirmSelectors : selectors;
      for (const xp of xpList) {
        const el = $xpath(xp);
        if (el && el instanceof Element && isNodeVisible(el) && labelRe.test((el.textContent || '').trim())) return el;
      }
      const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
      return candidates.find(el => labelRe.test((el.textContent || '').trim()) && isNodeVisible(el)) || null;
    }
    let scheduled = false;
    let resolved = false;
    const startedAt = Date.now();
    let observer = null;
    try {
      observer = new MutationObserver(() => {
        if (resolved) return;
        const noteEls = Array.from(document.querySelectorAll('.bn-notification-content-message.data-push-message'));
        for (const el of noteEls) {
          const txt = (el.textContent || '').trim();
          if ((txt.includes('非法参数') || txt.includes('参数非法')) && isNodeVisible(el)) {
            resolved = true;
            try { observer.disconnect(); } catch (_) {}
            return;
          }
        }
        const btn = findBtn();
        if (btn) {
          resolved = true;
          try { observer.disconnect(); } catch (_) {}
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
    while (!resolved && Date.now() - startedAt < maxWait) {
      if (!running || sessionToken !== opToken) break;
      const btn2 = findBtn();
      if (btn2) {
        resolved = true;
        let pendingManualBuyAmount = NaN;
        let pendingManualToken = '';
        if (currentTabIndex === 0) {
          const amountText = TabManager.getAmountText({ allowRealtime: true });
          const amount = parseFloat(amountText.replace(/[^\d.]/g, ''));
          if (!isNaN(amount) && amount > 0) {
            pendingManualBuyAmount = amount;
            pendingManualToken = (currentTokenDisplay && currentTokenDisplay.textContent || '').trim();
          }
        }
        simulateRealMouseClick(btn2);
        if (realtimeStatsEnabled && (currentTabIndex === 0 || reverseOrderEnabled)) {
          startBuyStatsFollowup();
        }
        lastExecutedTabIndex = currentTabIndex;
        const fillResult = await this.waitForFillConfirmation(currentTabIndex, getOrderFillWaitMs(currentTabIndex));
        if (!running || sessionToken !== opToken) break;
        if (fillResult === 'cancelled') {
          clearPendingBuyStatsScan();
          scheduleBalanceCapture({ startDelayMs: 1200, maxWindowMs: 30000 });
          pauseTradingForProtection(`${getOrderWaitLabel(currentTabIndex)} order was cancelled`);
          scheduled = true;
          break;
        }
        if (fillResult === 'insufficient' && currentTabIndex === 0) {
          if (reverseOrderEnabled) {
            await DelayManager.ifSwitchDelayEnabled();
            this.runLoop(sessionToken);
          } else {
            currentTabIndex = 1;
            await DelayManager.ifSwitchDelayEnabled();
            this.runLoop(sessionToken);
          }
          scheduled = true;
          break;
        }
        if (fillResult === 'sell_param_error' && currentTabIndex === 1) {
          if (!sellParamRetryOnce) {
            sellParamRetryOnce = true;
            currentTabIndex = 1;
            await DelayManager.ifSwitchDelayEnabled();
            this.runLoop(sessionToken);
            scheduled = true;
            break;
          } else {
            sellParamRetryOnce = false;
          }
        }
        if (fillResult === 'filled') {
          sellParamRetryOnce = false;
          const justExecutedIndex = currentTabIndex;
          if (justExecutedIndex === 0) {
            const ref = getBuyReferencePrice();
            if (Number.isFinite(ref) && ref > 0) lastBuyReferencePrice = ref;
            if (realtimeStatsEnabled) buyStatsNeedsFinalScan = true;
          }
          try { pairProgress.add(justExecutedIndex); } catch (_) {}
          scheduleBalanceCaptureAfterFill(justExecutedIndex);
          if (justExecutedIndex === 0 && pendingManualToken && Number.isFinite(pendingManualBuyAmount) && pendingManualBuyAmount > 0) {
            if (!realtimeStatsEnabled) {
              const existingRecord = tokenRecords.get(pendingManualToken) || { total: 0, buy: 0 };
              const newBuyAmount = existingRecord.buy + pendingManualBuyAmount;
              const calculatedTotal = newBuyAmount * currentMultiplier;
              tokenRecords.set(pendingManualToken, {
                total: calculatedTotal,
                buy: newBuyAmount
              });
              saveTokenRecords();
              updateAmountDisplay();
            }
          }
          if (realtimeStatsEnabled && justExecutedIndex === 0) {
            try {
              await processRealtimeStats({ force: true, fast: true, allowDuringTrade: true });
            } catch (e) {

            }
          } else if (realtimeStatsEnabled && justExecutedIndex === 1) {
            try {
              await processRealtimeStats({ force: true, fast: true, allowDuringTrade: true });
            } catch (e) {

            }
          }
          if (justExecutedIndex === 1 || reverseOrderEnabled) {
            lastBuyReferencePrice = NaN;
            lastPlannedBuyPrice = NaN;
          }
        }
        if (fillResult === 'timeout') {
          clearPendingBuyStatsScan();
          playOrderStuckAlert();
          pauseTradingForProtection(`${getOrderWaitLabel(currentTabIndex)} order fill timeout`);
          scheduled = true;
          break;
        }
        if (stopIfTargetTotalReached()) {
          scheduled = true;
          break;
        }
        if (pairProgress && pairProgress.size === 2) {
          await DelayManager.afterPairIfEnabled();
          pairProgress.clear();
        }
        if (reverseOrderEnabled) {
          if (fillResult === 'filled') {
            await DelayManager.afterPairIfEnabled();
            await DelayManager.ifSwitchDelayEnabled();
            this.runLoop(sessionToken);
            scheduled = true;
          }
        } else {
          currentTabIndex = (currentTabIndex + 1) % 2;
          await DelayManager.ifSwitchDelayEnabled();
          this.runLoop(sessionToken);
          scheduled = true;
        }
        break;
      }
      await sleep(pollInterval);
    }
    try { if (observer) observer.disconnect(); } catch (_) {}
    if (!scheduled) {
      if (!running || sessionToken !== opToken) return true;
      if (!reverseOrderEnabled) {
        currentTabIndex = (currentTabIndex + 1) % 2;
      }
      await DelayManager.ifSwitchDelayEnabled();
      this.runLoop(sessionToken);
      return true;
    }
    return true;
    },

    async runLoop(sessionToken) {
      return await ErrorBoundary.wrapAsync(async () => {
        if (!running || sessionToken !== opToken) {
        return;
        }
        if (stopIfTargetTotalReached()) {
          return;
        }
        if (await guardBeforeNewBuy(sessionToken)) {
          return;
        }
        if (!reverseOrderEnabled || !findReverseOrderSwitchNode()) {
          TabManager.click(currentTabIndex);
        }
        if (!running || sessionToken !== opToken) return;
        if (reverseOrderEnabled) { await ensureReverseChecked(1500); }
        const gateOk = uptrendOrderEnabled
          ? await waitForUptrendIfNeeded(sessionToken)
          : await waitForStabilityIfNeeded(sessionToken);
        if (!gateOk) {
          if (!running || sessionToken !== opToken) return;
          await DelayManager.ifSwitchDelayEnabled();
          if (running && sessionToken === opToken) this.runLoop(sessionToken);
          return;
        }
        if (!running || sessionToken !== opToken) return;
        await DelayManager.ifSwitchDelayEnabled();
        if (!running || sessionToken !== opToken) return;
        await preTradeSequence(sessionToken);
      }, 'runLoop main loop', async (error) => {
        stop();
        return null;
      });
    }
  };


  function setSlider100() {
    const slider = Array.from(document.querySelectorAll('input[type=range].bn-slider'))
      .find(el => isNodeVisible(el) && !(el.closest && el.closest('#alpha-extension-engine-container')));
    if (slider) {
      let value;
      if (currentTabIndex === 0) {
        value = RandomGenerator.buySlider();
        buySliderValue = value;
        } else {
        value = sellSliderValue;
      }

      // 先点击滑块
      simulateRealMouseClick(slider);

      // 使用更底层的方法设置滑块值
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      if (setter) {
        setter.call(slider, value);
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }
  function clickFirstButton() {
    const now = Date.now();
    if (now - lastFirstBtnClickAt < 800) return;
    lastFirstBtnClickAt = now;
    const sideRe = currentTabIndex === 0 ? /(买入|Buy)/i : /(卖出|Sell)/i;
    const classRe = currentTabIndex === 0 ? /buy/i : /sell/i;
    const candidates = Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter(btn => btn instanceof Element && isNodeVisible(btn) && !(btn.closest && btn.closest('#alpha-extension-engine-container')))
      .map(btn => {
        const text = (btn.textContent || '').trim();
        const meta = [btn.className, btn.id, btn.getAttribute('aria-label')].filter(Boolean).join(' ');
        let score = 0;
        if (sideRe.test(text)) score += 10;
        if (classRe.test(meta)) score += 6;
        if (/w-full|data-size-middle|bn-button/i.test(meta)) score += 2;
        if (/继续|确认|取消|设置|显示|清除|启动|停止/i.test(text)) score -= 8;
        return { btn, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);
    const btn = candidates.length ? candidates[0].btn : $xpath('//*[@id="__APP"]/div/div[3]/div/div[8]/div/div/div/div/div[3]/button');
    if (btn && isNodeVisible(btn)) simulateRealMouseClick(btn);
  }


  const tokenSelector = '.text-\\[20px\\].font-\\[600\\].leading-\\[24px\\].text-PrimaryText';

  const TokenDetector = {
    watcher: { observer: null, timer: null, isActive: false },

    start() {
      if (this.watcher.isActive) return;
      this.watcher.isActive = true;

    const observerId = RESOURCE_IDS.tokenDetector;
    const timerId = RESOURCE_IDS.tokenDetector;

    const setTokenIfAvailable = () => {
        const t = this.getFirstText();
      if (t && currentTokenDisplay) {
          Scheduler.enqueue({ key: 'token:write', phase: 'write', fn: () => { currentTokenDisplay.textContent = t; UIUpdater.updateDailyVolumeUI(); } });
    return true;
  }
      return false;
    };

    if (setTokenIfAvailable()) {
      this.watcher.isActive = false;
      return;
    }

    try {
        this.watcher.observer = new MutationObserver(() => {
        if (setTokenIfAvailable()) {
          try {
              this.watcher.observer && this.watcher.observer.disconnect();
          } catch (e) {
              // 忽略错误
          }
            this.watcher.observer = null;
          ResourceManager.cleanup('tokenObserver', observerId);
        }
      });
        this.watcher.observer.observe(document.body, { childList: true, subtree: true, characterData: true });

      ResourceManager.register('tokenObserver', observerId, () => {
          if (this.watcher.observer) {
            this.watcher.observer.disconnect();
            this.watcher.observer = null;
        }
      });
    } catch (e) {
        // 忽略错误
    }

    const maxWait = 20000;
    const interval = 200;
    let waited = 0;
      this.watcher.timer = setManagedInterval('tokenTimer', timerId, () => {
      Scheduler.enqueue({ key: 'token:read', phase: 'read', fn: () => {
          if (setTokenIfAvailable()) { this.stop(); }
          else { waited += interval; if (waited >= maxWait) { this.stop(); } }
      }});
    }, interval, () => { this.watcher.timer = null; });

    if (document.readyState !== 'complete') {
      window.addEventListener('load', () => { setTokenIfAvailable(); }, { once: true });
    }
    },

    stop() {
      ResourceManager.cleanup('tokenObserver', RESOURCE_IDS.tokenDetector);
      ResourceManager.cleanup('tokenTimer', RESOURCE_IDS.tokenDetector);

      try {
        if (this.watcher.observer) {
          this.watcher.observer.disconnect();
          this.watcher.observer = null;
        }
      } catch (e) {
        // 忽略错误
      }
      try {
        if (this.watcher.timer) {
          clearInterval(this.watcher.timer);
          this.watcher.timer = null;
        }
      } catch (e) {
        // 忽略错误
      }
      this.watcher.isActive = false;
    },

    getFirstText() {
      try {
        const nodes = DOMCache.queryAll(tokenSelector);
        for (const el of nodes) {
          if (!el) continue;
          const txt = (el.textContent || '').trim();
          if (txt) return txt;
        }
      } catch (_) {}
      return '';
    },

    isRunning() {
      return this.watcher.isActive;
    }
  };



  const MonitorRegistry = {
    order: {
      start: () => OrderMonitor.start(),
      stop: () => OrderMonitor.stop(),
      isRunning: () => OrderMonitor.isRunning(),
    },
    stable: {
      start: () => startStableMonitor(),
      stop: () => stopStableMonitor(),
      isRunning: () => !!stableTimer,
    },
    token: {
      start: () => TokenDetector.start(),
      stop: () => TokenDetector.stop(),
      isRunning: () => TokenDetector.isRunning(),
    },
    start(name) {
      try {
        if (!this[name].isRunning()) this[name].start();
      } catch (e) {
      }
    },
    stop(name) {
      try {
        if (this[name].isRunning()) this[name].stop();
      } catch (e) {
      }
    },
    restart(name) { this.stop(name); this.start(name); },
  };




  async function runTab1AndStop(sessionToken) {
    if (!running || sessionToken !== opToken) return;
    TabManager.click(1);
    if (!running || sessionToken !== opToken) return;
    const gateOk = uptrendOrderEnabled
      ? await waitForUptrendIfNeeded(sessionToken)
      : await waitForStabilityIfNeeded(sessionToken);
    if (!gateOk) return;
    if (!running || sessionToken !== opToken) return;
    await DelayManager.ifSwitchDelayEnabled();
    if (!running || sessionToken !== opToken) return;
    await preTradeSequence(sessionToken);
    if (!running || sessionToken !== opToken) return;
    stop();
  }

  async function preTradeSequence(sessionToken) {
    if (inTradeFlow) return;
    let advanced = false;
    try {
      inTradeFlow = true;
      if (!running || sessionToken !== opToken) return;
      await TradingEngine.preClick();
      if (!running || sessionToken !== opToken) return;
      await randomSleep(); // 滑块设置前随机等待
      if (!running || sessionToken !== opToken) return;
      setSlider100();
      if (!running || sessionToken !== opToken) return;
      await randomSleep(); // 滑块设置后随机等待
      if (!running || sessionToken !== opToken) return;
      if (uptrendOrderEnabled) {
        const ok = uptrendConsecCount >= uptrendRequiredCount;
        if (!ok) {
          await DelayManager.ifSwitchDelayEnabled();
          return;
        }
      }

      try {
        BalanceManager.commit(BalanceManager.read());
      } catch (_) {}
      if (!isStabilityReadyForSubmit()) {
        await DelayManager.ifSwitchDelayEnabled();
        return;
      }
      clickFirstButton();
      if (!running || sessionToken !== opToken) return;
      await sleep(PRE_AFTER_FIRST_BTN_DELAY_MS);
      if (!running || sessionToken !== opToken) return;

      await TradingEngine.preThirdStepClick();
      if (!running || sessionToken !== opToken) return;
      await TradingEngine.waitAndClickSecondButton(sessionToken);

      // 2FA检测移到点击确认/继续按钮之后
      if (authenticatorEnabled && isMfaPopupPresent()) {
        Logger.log('检测到2FA弹窗，开始处理...');
        const ok = await MFAHandler.handle();
        if (ok) {
          Logger.log('2FA处理完成');
        } else {
          Logger.log('2FA处理失败');
        }
      }
      advanced = true;
    } catch (e) {
    } finally {
      inTradeFlow = false;
      lastFirstBtnClickAt = 0;
      if (!advanced) {
        if (!running || sessionToken !== opToken) return;
        if (!reverseOrderEnabled) {
          currentTabIndex = (currentTabIndex + 1) % 2;
        }
        await DelayManager.ifSwitchDelayEnabled();
        TradingEngine.runLoop(sessionToken);
      }
    }
  }

  /**
   * Start trading script
   * Check input validation, initialize state and start main loop
   * @returns {void}
   */
  function start() {
    return ErrorBoundary.wrapSync(() => {
    if (busy) {
      return;
    }
    const inputVal = parseFloat(inputAmount.value.trim());
    if (!inputVal || inputVal <= 0) {
      return;
    }
    maxTotalAmount = inputVal;
    StorageUtils.set('maxTotalAmount', maxTotalAmount);
    if (isTargetTotalReached()) {
      setButtonState(false);
      return;
    }
    updateAmountDisplay();
    if (running) {
      return;
    }
    running = true;
    protectionPauseReason = '';
    inTradeFlow = false;
    cancelRealtimeStatsScans();
    stopFinalBuyStatsScan();
    primeCompletionSound();
    opToken++;
    LifecycleManager.runAndClearCleanups();
    const sessionToken = opToken;
    lastExecutedTabIndex = -1;
    try { pairProgress.clear(); } catch (_) {}
    setButtonState(true);
    currentTabIndex = 0;
    if (realtimeStatsEnabled) {
      realtimeStatsStartTime = Date.now();
      filledBuyRecentRecords = [];
      buyStatsNeedsFinalScan = false;
      lastBuyOrderSubmittedAt = 0;
      saveRealtimeStatsState();
      startRealtimeStatsBackfill();

    }
    else {
      stopRealtimeStatsBackfill();
    }
    if (stableDetectEnabled) {
      sampleBuffer.clear();
      MonitorRegistry.start('stable');
    }
    if (orderMonitorCheckbox && orderMonitorCheckbox.checked) {
      MonitorRegistry.start('order');
    }
    TradingEngine.runLoop(sessionToken);
    }, 'start script', () => {
      running = false;
      busy = false;
      setButtonState(false);
    });
  }
  /**
   * Stop trading script
   * Cleanup all resources, reset state, stop monitoring
   * @returns {void}
   */
  function stop() {
    return ErrorBoundary.wrapSync(() => {
    const shouldFinalScan = running && realtimeStatsEnabled && buyStatsNeedsFinalScan && realtimeStatsStartTime > 0 && !(inTradeFlow && currentTabIndex === 0);
    running = false;
    opToken++;
    inTradeFlow = false;
    setButtonState(false);
    try { pairProgress.clear(); } catch (_) {}
    busy = false;
    LifecycleManager.runAndClearCleanups();

      ResourceManager.cleanupType('tradeTimeout');
      ResourceManager.cleanupType('orderTimeout');
      stopRealtimeStatsBackfill();
      stopBuyStatsFollowup();
      stopFinalBuyStatsScan();
      MonitorRegistry.stop('order');
      MonitorRegistry.stop('stable');

      DOMCache.clearAll();
      DebounceUtils.clearAll();

    if (realtimeStatsEnabled && realtimeStatsStartTime > 0) {
      const duration = Date.now() - realtimeStatsStartTime;

    }
    if (shouldFinalScan) scheduleFinalBuyStatsScanOnStop();
    else cancelRealtimeStatsScans();
    try {
      if (!orderMonitorCheckbox || !orderMonitorCheckbox.checked) {
        MonitorRegistry.stop('order');
      }
    } catch (_) {}
    }, 'stop script', () => {
      running = false;
      busy = false;
      inTradeFlow = false;
      ResourceManager.cleanupType('tradeTimeout');
      ResourceManager.cleanupType('orderTimeout');
      stopRealtimeStatsBackfill();
      stopBuyStatsFollowup();
      MonitorRegistry.stop('order');
      MonitorRegistry.stop('stable');
      DOMCache.clearAll();
      DebounceUtils.clearAll();
    });
  }
  function renewData() {

    if (cycleTimeMinInput) {
      StorageUtils.set('cycleTimeMin', cycleTimeMinInput.value);
    }
    if (cycleTimeMaxInput) {
      StorageUtils.set('cycleTimeMax', cycleTimeMaxInput.value);
    }
    if (switchDelayCheckbox) {
      localStorage.setItem('switchDelayEnabled', 'true');
    }
   if (afterPairMinInput) {
    localStorage.setItem('afterPairWaitMinSec', String(  afterPairMinInput.value));
    }
    if (afterPairMaxInput) {
      localStorage.setItem('afterPairWaitMaxSec', String(  afterPairMaxInput.value));
    }
  }


  function setButtonState(isRunning) {
    btnStart.textContent = isRunning ? '停止' : '启动';
    btnStart.style.background = isRunning
      ? 'linear-gradient(135deg, #ff3c3c, #cc0000)'
      : 'linear-gradient(135deg, #00d4ff, #0071ff)';
  }

  function playCompletionTonePair(ctx) {
    try {
      const start = ctx.currentTime + 0.01;
      const notes = [
        { freq: 880, at: 0, len: 0.16 },
        { freq: 1174, at: 0.22, len: 0.22 }
      ];
      for (const note of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, start + note.at);
        gain.gain.setValueAtTime(0.0001, start + note.at);
        gain.gain.exponentialRampToValueAtTime(0.18, start + note.at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.len);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start + note.at);
        osc.stop(start + note.at + note.len + 0.04);
      }
    } catch (_) {}
  }

  function playCompletionBeepSeries(ctx) {
    for (let i = 0; i < COMPLETION_SOUND_BURST_COUNT; i++) {
      setTimeout(() => {
        try {
          if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
          playCompletionTonePair(ctx);
        } catch (_) {}
      }, i * COMPLETION_SOUND_BURST_INTERVAL_MS);
    }
  }

  function getSpeechUtteranceCtor() {
    try {
      return window.SpeechSynthesisUtterance
        || (typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null);
    } catch (_) {
      return null;
    }
  }

  function pickChineseVoice(voices) {
    try {
      return (voices || []).find(v => /zh|Chinese|Mandarin|中文|普通话/i.test(`${v.lang} ${v.name}`)) || null;
    } catch (_) {
      return null;
    }
  }

  function speakVoice(text, retry = 0) {
    try {
      const synth = window.speechSynthesis;
      const Utterance = getSpeechUtteranceCtor();
      if (!synth || !Utterance) return false;
      try { synth.cancel(); } catch (_) {}
      if (synth.paused && synth.resume) {
        try { synth.resume(); } catch (_) {}
      }
      let started = false;
      const utterance = new Utterance(text || COMPLETION_VOICE_TEXT);
      utterance.lang = 'zh-CN';
      utterance.rate = 0.95;
      utterance.pitch = 1.15;
      utterance.volume = 1;
      const voices = synth.getVoices ? synth.getVoices() : [];
      const zhVoice = pickChineseVoice(voices);
      if (zhVoice) utterance.voice = zhVoice;
      utterance.onstart = () => { started = true; };
      utterance.onerror = () => {
        if (retry < 3) setTimeout(() => speakVoice(text, retry + 1), COMPLETION_VOICE_RETRY_MS);
      };
      synth.speak(utterance);
      if (retry < 3) {
        setTimeout(() => {
          if (!started && !synth.speaking) speakVoice(text, retry + 1);
        }, COMPLETION_VOICE_RETRY_MS);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function playCompletionVoice() {
    speakVoice(COMPLETION_VOICE_TEXT, 0);
  }

  function playOrderStuckAlert() {
    try {
      const now = Date.now();
      if (now - lastOrderStuckAlertAt < ORDER_STUCK_ALERT_COOLDOWN_MS) return;
      lastOrderStuckAlertAt = now;
      speakVoice(ORDER_STUCK_VOICE_TEXT, 0);
      try {
        if (completionAudioContext) playCompletionTonePair(completionAudioContext);
      } catch (_) {}
    } catch (_) {}
  }

  function playCompletionSound() {
    try {
      const now = Date.now();
      if (now - lastCompletionSoundAt < COMPLETION_SOUND_COOLDOWN_MS) return;
      lastCompletionSoundAt = now;
      playCompletionVoice();
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      completionAudioContext = completionAudioContext || new AudioCtx();
      const ctx = completionAudioContext;
      const startBeeps = () => playCompletionBeepSeries(ctx);
      if (ctx.state === 'suspended' && ctx.resume) {
        ctx.resume().then(startBeeps).catch(startBeeps);
      } else {
        startBeeps();
      }
    } catch (_) {}
  }

  function primeCompletionSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      completionAudioContext = completionAudioContext || new AudioCtx();
      if (completionAudioContext.state === 'suspended') {
        completionAudioContext.resume().catch(() => {});
      }
      const synth = window.speechSynthesis;
      if (synth && synth.getVoices) synth.getVoices();
    } catch (_) {}
  }

  function parseAmountText(text) {
    const match = String(text || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return NaN;
    const value = parseFloat(match[0]);
    return Number.isFinite(value) ? value : NaN;
  }

  function pickFirstFiniteAmount(values) {
    for (const value of values) {
      const num = Number(value);
      if (Number.isFinite(num) && num >= 0) return num;
    }
    return 0;
  }

  function getCurrentAmountTotals(options = {}) {
    let totalBuyAmount = 0;
    let totalCalculatedAmount = 0;
    try {
      for (const [, record] of tokenRecords) {
        const buy = Number(record && record.buy);
        const total = Number(record && record.total);
        if (Number.isFinite(buy)) totalBuyAmount += buy;
        if (Number.isFinite(total)) totalCalculatedAmount += total;
      }
    } catch (_) {}
    if (options.includeFallbacks) {
      if (tokenRecords.size === 0) {
        totalBuyAmount = pickFirstFiniteAmount([
          parseAmountText(buyAmountDisplay && buyAmountDisplay.textContent),
          buyAmount,
          StorageLoader.num('buyAmount', NaN)
        ]);
        totalCalculatedAmount = pickFirstFiniteAmount([
          parseAmountText(totalAmountDisplay && totalAmountDisplay.textContent),
          totalAmount,
          StorageLoader.num('totalAmount', NaN)
        ]);
      }
    }
    return { buy: totalBuyAmount, total: totalCalculatedAmount };
  }

  function isTargetTotalReached() {
    const target = Number(maxTotalAmount);
    if (!Number.isFinite(target) || target <= 0) return false;
    const totals = getCurrentAmountTotals({ includeFallbacks: true });
    buyAmount = totals.buy;
    totalAmount = totals.total;
    return totalAmount >= target;
  }

  function stopIfTargetTotalReached() {
    if (!isTargetTotalReached()) return false;
    refreshAmountDisplayNow({ skipFallbacks: true });
    buyStatsNeedsFinalScan = false;
    stopFinalBuyStatsScan();
    scheduleBalanceCapture({ startDelayMs: 2000, maxWindowMs: BALANCE_CAPTURE_AFTER_FILL_WINDOW_MS });
    playCompletionSound();
    scheduleCompletionDisplayRefresh();
    stopBuyStatsFollowup();
    stop();
    return true;
  }

  function pauseTradingForProtection(reason) {
    protectionPauseReason = reason || 'trade protection';
    try { console.warn('[AlphaTool] paused:', protectionPauseReason); } catch (_) {}
    if (running) stop();
  }

  function getOrderFillWaitMs(tabIndex) {
    const buyMs = Math.max(1, Number(buyOrderWaitSec) || DEFAULT_BUY_ORDER_WAIT_SEC) * 1000;
    const sellMs = Math.max(1, Number(sellOrderWaitSec) || DEFAULT_SELL_ORDER_WAIT_SEC) * 1000;
    if (reverseOrderEnabled) return buyMs + sellMs;
    return tabIndex === 0 ? buyMs : sellMs;
  }

  function getOrderWaitLabel(tabIndex) {
    if (reverseOrderEnabled) return 'reverse buy/sell';
    return tabIndex === 0 ? 'buy' : 'sell';
  }

  function refreshAmountDisplayNow(options = {}) {
    try {
      const timer = DebounceUtils.timers && DebounceUtils.timers.get('updateAmountDisplay');
      if (timer) {
        clearTimeout(timer);
        DebounceUtils.timers.delete('updateAmountDisplay');
      }
    } catch (_) {}
    const { buy: totalBuyAmount, total: totalCalculatedAmount } = getCurrentAmountTotals({
      includeFallbacks: !options.skipFallbacks && tokenRecords.size === 0
    });

    buyAmount = totalBuyAmount;
    totalAmount = totalCalculatedAmount;
    if (tokenRecords.size > 0 || totalBuyAmount > 0 || totalCalculatedAmount > 0) {
      StorageUtils.set('buyAmount', totalBuyAmount);
      StorageUtils.set('totalAmount', totalCalculatedAmount);
    }

    if (totalAmountDisplay) {
      totalAmountDisplay.textContent = totalCalculatedAmount.toFixed(4);
    }
    if (buyAmountDisplay) {
      buyAmountDisplay.textContent = totalBuyAmount.toFixed(4);
    }

    totalIntegral = Calculator.calculateIntegral(totalCalculatedAmount);
    if (integralDisplay) {
      integralDisplay.textContent = totalIntegral;
    }

    updateTokenRecordsDisplay();
    updateBalanceUI();
  }

  function updateAmountDisplay(options = {}) {
    DebounceUtils.debounce('updateAmountDisplay', () => {
      refreshAmountDisplayNow(options);
    }, 100);
  }

  function scheduleCompletionDisplayRefresh() {
    refreshAmountDisplayNow({ skipFallbacks: true });
    for (const delay of COMPLETION_DISPLAY_REFRESH_DELAYS_MS) {
      setTimeout(() => {
        try { refreshAmountDisplayNow({ skipFallbacks: true }); } catch (_) {}
      }, delay);
    }
  }
  function handleStartStop() {
    if (running) stop();
    else {
      const inputVal = parseFloat(inputAmount.value.trim());
      if (Number.isFinite(inputVal) && inputVal > 0) {
        maxTotalAmount = inputVal;
        StorageUtils.set('maxTotalAmount', maxTotalAmount);
        if (isTargetTotalReached()) {
          setButtonState(false);
          return;
        }
      }
      start();
    }
  }
  const STORAGE_KEYS = {
    totalAmount: 'totalAmount',
    buyAmount: 'buyAmount',
    buySliderValue: 'buySliderValue',
    buySliderMin: 'buySliderMin',
    buySliderMax: 'buySliderMax',
    sellSliderValue: 'sellSliderValue',
    cycleTimeMin: 'cycleTimeMin',
    cycleTimeMax: 'cycleTimeMax',
    switchDelayEnabled: 'switchDelayEnabled',
    afterPairWaitEnabled: 'afterPairWaitEnabled',
    afterPairWaitMinSec: 'afterPairWaitMinSec',
    afterPairWaitMaxSec: 'afterPairWaitMaxSec',
    volatilityLimitEnabled: 'volatilityLimitEnabled',
    orderMonitorEnabled: 'orderMonitorEnabled',
    authenticatorEnabled: 'authenticatorEnabled',
    authenticatorSecret: 'authenticatorSecret',
    clickIntervalMin: 'clickIntervalMin',
    clickIntervalMax: 'clickIntervalMax',
    stableDetectEnabled: 'stableDetectEnabled',
    stableWindowSec: 'stableWindowSec',
    stableTolerancePct: 'stableTolerancePct',
    realtimeStatsEnabled: 'realtimeStatsEnabled',
    maxTotalAmount:'maxTotalAmount',
    settingsCollapsed:'settingsCollapsed'
  };
  STORAGE_KEYS.balanceInit = 'balanceInit';
  STORAGE_KEYS.balanceCurrent = 'balanceCurrent';
  STORAGE_KEYS.balanceWear = 'balanceWear';
  STORAGE_KEYS.balanceDisabled = 'balanceDisabled';
  STORAGE_KEYS.volatilityPauseEnabled = 'volatilityPauseEnabled';
  STORAGE_KEYS.volatilityPauseSec = 'volatilityPauseSec';
  STORAGE_KEYS.uptrendOrderEnabled = 'uptrendOrderEnabled';
  STORAGE_KEYS.uptrendRequiredCount = 'uptrendRequiredCount';
  STORAGE_KEYS.uptrendThresholdPct = 'uptrendThresholdPct';
  STORAGE_KEYS.uptrendSlopeWindowSec = 'uptrendSlopeWindowSec';
  STORAGE_KEYS.uptrendMinSlopePctPerSec = 'uptrendMinSlopePctPerSec';
  STORAGE_KEYS.uptrendMinSecondDerivPctPerSec2 = 'uptrendMinSecondDerivPctPerSec2';

  function clearLegacyHiddenPriceSettings() {
    const legacyKeys = [
      'limitPriceEnabled', 'buyLimitPrice', 'sellLimitPrice',
      'buyPricePremiumPct', 'sellPriceDiscountPct', 'singleTradeMaxWearPct',
      'buyPriceAutoFollowEnabled', 'reverseSellAutoPriceEnabled',
      'volatilityRangeMin', 'volatilityRangeMax', 'stableWindowSec', 'stableTolerancePct'
    ];
    for (const key of legacyKeys) {
      try { localStorage.removeItem(key); } catch (_) {}
    }
  }
  STORAGE_KEYS.buyOrderWaitSec = 'buyOrderWaitSec';
  STORAGE_KEYS.sellOrderWaitSec = 'sellOrderWaitSec';
  const UIBuilder = {
    sections: {
      run: {
        build(container) {
          return buildRunSection(container);
        }
      },
      monitor: {
        build(container) {
          return buildMonitorSection(container);
        }
      },
      volume: {
        build(container) {
          return buildVolumeSection(container);
        }
      }
    },

    buildAll(container) {
      Object.values(this.sections).forEach(section => {
        try {
          section.build(container);
        } catch (error) {
          console.error('UIBuilder section build error:', error);
        }
      });
    },

    buildSection(sectionName, container) {
      if (this.sections[sectionName]) {
        try {
          return this.sections[sectionName].build(container);
        } catch (error) {
          console.error(`UIBuilder buildSection error for ${sectionName}:`, error);
        }
      } else {
        console.warn(`UIBuilder: Unknown section ${sectionName}`);
      }
    }
  };

  function buildRunSection(container) {
    const tokenRow = document.createElement('div');
    tokenRow.style.display = 'grid';
    tokenRow.style.gridTemplateColumns = 'auto auto';
    tokenRow.style.columnGap = '8px';
    tokenRow.style.alignItems = 'center';
    tokenRow.style.justifyContent = 'flex-start';
    tokenRow.style.marginBottom = '0px';
    const leftGroup = document.createElement('span');
    leftGroup.style.display = 'flex';
    leftGroup.style.alignItems = 'center';
    const tokenLabel = document.createElement('span');
    tokenLabel.textContent = '';
    tokenLabel.style.marginRight = '6px';
    currentTokenDisplay = document.createElement('span');
    currentTokenDisplay.style.fontWeight = '600';
    currentTokenDisplay.style.color = '#ffcc00';
    currentTokenDisplay.style.fontSize = '135%';
    currentTokenDisplay.textContent = '-';
    tokenIconImg = document.createElement('img');
    tokenIconImg.style.width = '20px';
    tokenIconImg.style.height = '20px';
    tokenIconImg.style.borderRadius = '4px';
    tokenIconImg.style.marginRight = '6px';
    tokenIconImg.alt = '';
    leftGroup.appendChild(tokenLabel);
    leftGroup.appendChild(tokenIconImg);
    leftGroup.appendChild(currentTokenDisplay);
    volatilityDisplay = document.createElement('span');
    volatilityDisplay.style.fontWeight = '600';
    volatilityDisplay.style.fontSize = '150%';
    volatilityDisplay.style.marginLeft = '8px';
    volatilityDisplay.textContent = '';
    leftGroup.appendChild(volatilityDisplay);
    tokenRow.appendChild(leftGroup);
    const rightGroup = document.createElement('span');
    rightGroup.style.display = 'flex';
    rightGroup.style.alignItems = 'baseline';
    rightGroup.style.gap = '8px';
    rightGroup.style.flexWrap = 'nowrap';
    rightGroup.style.whiteSpace = 'nowrap';
    rangeDisplay = document.createElement('span');
    rangeDisplay.style.fontWeight = '600';
    rangeDisplay.style.fontSize = '100%';
    rangeDisplay.style.fontVariantNumeric = 'tabular-nums';
    rangeDisplay.textContent = '';
    directionDisplay = document.createElement('span');
    directionDisplay.style.fontWeight = '600';
    directionDisplay.style.fontSize = '100%';
    directionDisplay.style.fontVariantNumeric = 'tabular-nums';
    directionDisplay.textContent = '';
    rightGroup.appendChild(rangeDisplay);
    rightGroup.appendChild(directionDisplay);
    tokenRow.appendChild(rightGroup);
    container.appendChild(tokenRow);
    try { UIBuilder.buildSection('volume', container); } catch (_) {}
    const amountContainer = document.createElement('div');
    amountContainer.style.display = 'grid';
    amountContainer.style.gridTemplateColumns = '1fr 1fr 1fr';
    amountContainer.style.columnGap = '10px';
    amountContainer.style.margin = '7px 0 0';
    amountContainer.style.fontSize = '15px';
    amountContainer.style.alignItems = 'center';
    amountContainer.style.width = '100%';
    const totalGroup = document.createElement('div');
    totalGroup.style.display = 'flex';
    totalGroup.style.alignItems = 'center';
    totalGroup.style.gap = '4px';

    const tokenToggleBtn = document.createElement('button');
    tokenToggleBtn.textContent = '<';
    tokenToggleBtn.style.background = '#666';
    tokenToggleBtn.style.color = '#fff';
    tokenToggleBtn.style.border = 'none';
    tokenToggleBtn.style.borderRadius = '4px';
    tokenToggleBtn.style.padding = '2px 6px';
    tokenToggleBtn.style.cursor = 'pointer';
    tokenToggleBtn.style.fontSize = '12px';
    tokenToggleBtn.style.marginRight = '4px';
    tokenToggleBtn.title = '显示/隐藏代币交易记录';

    const totalLabel = document.createElement('span'); totalLabel.textContent = '总: ';
    totalAmountDisplay = document.createElement('span'); totalAmountDisplay.style.color = '#ffcc00'; totalAmountDisplay.style.fontWeight = 'bold'; totalAmountDisplay.textContent = totalAmount.toFixed(2);

    totalGroup.appendChild(tokenToggleBtn);
    totalGroup.appendChild(totalLabel);
    totalGroup.appendChild(totalAmountDisplay);

    const tokenPopupPanel = document.createElement('div');
    tokenPopupPanel.id = 'alpha-extension-token-popup';
    tokenPopupPanel.style.position = 'fixed';
    tokenPopupPanel.style.width = '350px';
    tokenPopupPanel.style.backgroundColor = 'rgba(0,0,0,0.9)';
    tokenPopupPanel.style.border = 'none';
    tokenPopupPanel.style.borderRadius = '10px';
    tokenPopupPanel.style.padding = '15px';
    tokenPopupPanel.style.zIndex = '2147483648';
    tokenPopupPanel.style.display = 'none';
    tokenPopupPanel.style.overflowY = 'auto';
    tokenPopupPanel.style.overflowX = 'hidden';

    tokenRecordsContainer = document.createElement('div');
    tokenRecordsContainer.style.margin = '4px 0';
    tokenRecordsContainer.style.fontSize = '12px';
    tokenRecordsContainer.style.minHeight = '20px';
    tokenPopupPanel.appendChild(tokenRecordsContainer);

    document.body.appendChild(tokenPopupPanel);

    window.updatePopupPosition = function() {
      const mainContainer = document.getElementById('alpha-extension-engine-container');
      const popupPanel = document.getElementById('alpha-extension-token-popup');
      if (!mainContainer || !popupPanel) return;

      const mainRect = mainContainer.getBoundingClientRect();
      const popupWidth = 350;

      if (popupPanel.style.display === 'none') {
        popupPanel.style.display = 'block';
        popupPanel.style.visibility = 'hidden';
      }

      const contentHeight = popupPanel.scrollHeight;
      const minHeight = 100;
      const maxHeight = Math.max(minHeight, window.innerHeight - 20);
      const popupHeight = Math.max(minHeight, Math.min(contentHeight, maxHeight));

      popupPanel.style.visibility = 'visible';

      let left = mainRect.left - popupWidth - 10;
      let top = mainRect.top;

      if (left < 10) {
        left = mainRect.right + 10;
      }
      if (top < 10) {
        top = 10;
      }
      if (top + popupHeight > window.innerHeight - 10) {
        top = Math.max(10, window.innerHeight - popupHeight - 10);
      }

      popupPanel.style.left = left + 'px';
      popupPanel.style.top = top + 'px';
      popupPanel.style.height = popupHeight + 'px';
      popupPanel.style.maxHeight = maxHeight + 'px';
    };

    tokenToggleBtn.onclick = function() {
      if (tokenPopupPanel.style.display === 'none') {
        updateTokenRecordsDisplay();
        setTimeout(() => {
          window.updatePopupPosition();
        }, 0);
      } else {
        tokenPopupPanel.style.display = 'none';
      }
    };

    const buyGroup = document.createElement('div');
    buyGroup.style.display = 'flex';
    buyGroup.style.alignItems = 'center';
    buyGroup.style.justifyContent = 'center';
    buyGroup.style.whiteSpace = 'nowrap';
    const buyLabel = document.createElement('span'); buyLabel.textContent = '买: ';
    buyAmountDisplay = document.createElement('span'); buyAmountDisplay.style.color = '#00ff88'; buyAmountDisplay.style.fontWeight = 'bold'; buyAmountDisplay.textContent = buyAmount.toFixed(2);
    buyGroup.appendChild(buyLabel); buyGroup.appendChild(buyAmountDisplay);

    const integralGroup = document.createElement('div');
    integralGroup.style.display = 'flex';
    integralGroup.style.alignItems = 'center';
    integralGroup.style.justifyContent = 'flex-end';
    integralGroup.style.whiteSpace = 'nowrap';
    const integralLabel = document.createElement('span'); integralLabel.textContent = '交易量积分: ';
    integralDisplay = document.createElement('span'); integralDisplay.style.color = '#ffcc00'; integralDisplay.style.fontWeight = 'bold'; integralDisplay.textContent = totalIntegral;
    integralGroup.appendChild(integralLabel); integralGroup.appendChild(integralDisplay);
    totalGroup.style.justifyContent = 'flex-start';
    totalGroup.style.whiteSpace = 'nowrap';
    amountContainer.appendChild(totalGroup); amountContainer.appendChild(buyGroup); amountContainer.appendChild(integralGroup);
    container.appendChild(amountContainer);

    const balRow = document.createElement('div');
    balRow.style.display = 'grid';
    balRow.style.gridTemplateColumns = '1fr 1fr 1fr';
    balRow.style.columnGap = '10px';
    balRow.style.margin = '5px 0 2px 0';
    balRow.style.fontSize = '15px';
    balRow.style.alignItems = 'center';
    balRow.style.width = '100%';
    const initGroup = document.createElement('div');
    initGroup.appendChild(document.createTextNode('初始余额: '));
    balanceInitSpan = document.createElement('span'); balanceInitSpan.style.color = '#ffcc00'; balanceInitSpan.textContent = Number.isFinite(balanceInit) ? balanceInit.toFixed(2) : '-';
    initGroup.appendChild(balanceInitSpan);
    const curGroup = document.createElement('div');
    curGroup.style.textAlign = 'center';
    curGroup.appendChild(document.createTextNode('现余额: '));
    balanceCurSpan = document.createElement('span'); balanceCurSpan.style.color = '#00ff88'; balanceCurSpan.textContent = Number.isFinite(balanceCurrent) ? balanceCurrent.toFixed(2) : '-';
    curGroup.appendChild(balanceCurSpan);
    const wearGroup = document.createElement('div');
    wearGroup.style.textAlign = 'right';
    wearGroup.appendChild(document.createTextNode('磨损: '));
    balanceWearSpan = document.createElement('span'); balanceWearSpan.style.color = '#CCCCCC'; balanceWearSpan.textContent = Number.isFinite(balanceWear) ? balanceWear.toFixed(2) : '-';
    wearGroup.appendChild(balanceWearSpan);
    balRow.appendChild(initGroup); balRow.appendChild(curGroup); balRow.appendChild(wearGroup);
    container.appendChild(balRow);
    const actionRow = document.createElement('div');
    actionRow.style.display = 'flex';
    actionRow.style.alignItems = 'center';
    actionRow.style.justifyContent = 'flex-start';
    actionRow.style.gap = '8px';
    actionRow.style.marginTop = '10px';
    actionRow.style.flexWrap = 'nowrap';
    actionRow.style.width = '100%';
    const styleActionButton = (button, minWidth) => {
      button.style.marginTop = '0';
      button.style.marginLeft = '0';
      button.style.padding = '8px 10px';
      button.style.cursor = 'pointer';
      button.style.borderRadius = '8px';
      button.style.border = 'none';
      button.style.color = '#fff';
      button.style.whiteSpace = 'nowrap';
      button.style.lineHeight = '1';
      button.style.minWidth = minWidth || '64px';
      button.style.boxSizing = 'border-box';
    };
    inputAmount = document.createElement('input');
    inputAmount.type = 'number';
    inputAmount.placeholder = '输入买入金额';
    inputAmount.style.width = '150px';
    inputAmount.style.marginTop = '0';
    inputAmount.style.padding = '6px';
    inputAmount.style.borderRadius = '6px';
    inputAmount.style.boxSizing = 'border-box';
    inputAmount.style.flex = '0 0 150px';
    inputAmount.value= maxTotalAmount || ""
    inputAmount.setAttribute('id', 'accountInput');
    actionRow.appendChild(inputAmount);
    btnStart = document.createElement('button');
    styleActionButton(btnStart, '56px');
    btnStart.addEventListener('click', handleStartStop);
    actionRow.appendChild(btnStart);
    btnClear = document.createElement('button');
    btnClear.textContent = '清除记录';
    styleActionButton(btnClear, '78px');
    btnClear.style.background = '#666';
    btnClear.onclick = LifecycleManager.clearRecords;
    actionRow.appendChild(btnClear);
    const btnCalibrate = document.createElement('button');
    btnCalibrate.textContent = '校准记录';
    styleActionButton(btnCalibrate, '78px');
    btnCalibrate.style.background = '#666';
    btnCalibrate.onclick = LifecycleManager.calibrateRecords;
    actionRow.appendChild(btnCalibrate);
    const btnReset = document.createElement('button');
    btnReset.textContent = '还原设置';
    styleActionButton(btnReset, '78px');
    btnReset.style.background = '#666';
    btnReset.onclick = LifecycleManager.resetSettings;
    actionRow.appendChild(btnReset);
    container.appendChild(actionRow);
    const quickAmountContainer = document.createElement('div');
    quickAmountContainer.style.display = 'grid';
    quickAmountContainer.style.gridTemplateColumns = 'repeat(5, 1fr)';
    quickAmountContainer.style.gap = '8px';
    quickAmountContainer.style.marginTop = '12px';
    quickAmountContainer.style.marginLeft = '0';
    quickAmountContainer.style.alignItems = 'center';
    quickAmountContainer.style.width = '100%';
    for (let i = 0; i < 3; i++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.style.padding = '8px 12px';
      button.style.borderRadius = '8px';
      button.style.border = 'none';
      button.style.background = '#666';
      button.style.color = '#fff';
      button.style.cursor = 'pointer';
      button.style.fontSize = '14px';
      button.style.minWidth = '0';
      button.style.width = '100%';
      const amounts = [quickAmount1, quickAmount2, quickAmount3];
      button.textContent = amounts[i].toLocaleString();
      quickAmountButtons.push(button);
      button.onclick = function() {
        if (!isEditMode) {
          const currentAmounts = [quickAmount1, quickAmount2, quickAmount3];
          inputAmount.value = currentAmounts[i];
          inputAmount.dispatchEvent(new Event('input', { bubbles: true }));
        }
      };
      quickAmountContainer.appendChild(button);
    }
    editSaveButton = document.createElement('button');
    editSaveButton.type = 'button';
    editSaveButton.textContent = '编辑';
    editSaveButton.style.padding = '8px 12px';
    editSaveButton.style.borderRadius = '8px';
    editSaveButton.style.border = 'none';
    editSaveButton.style.background = '#666';
    editSaveButton.style.color = '#fff';
    editSaveButton.style.cursor = 'pointer';
    editSaveButton.style.fontSize = '14px';
    editSaveButton.style.minWidth = '0';
    editSaveButton.style.width = '100%';
    editSaveButton.onclick = function() {
      if (!isEditMode) {
        isEditMode = true;
        editSaveButton.textContent = '保存';
        editSaveButton.style.background = 'linear-gradient(135deg, #00d4ff, #0071ff)';
        quickAmountButtons.forEach((btn, index) => {
          btn.contentEditable = true;
          btn.style.background = '#444';
          btn.style.border = '1px solid #00d4ff';
          btn.focus();
        });
      } else {
        isEditMode = false;
        editSaveButton.textContent = '编辑';
        editSaveButton.style.background = '#666';
        quickAmountButtons.forEach((btn, index) => {
          btn.contentEditable = false;
          btn.style.background = '#666';
          btn.style.border = 'none';
          const newValue = parseFloat(btn.textContent.replace(/[^\d.]/g, ''));
          if (!isNaN(newValue) && newValue > 0) {
            if (index === 0) quickAmount1 = newValue;
            if (index === 1) quickAmount2 = newValue;
            if (index === 2) quickAmount3 = newValue;
            localStorage.setItem('quickAmount1', String(quickAmount1));
            localStorage.setItem('quickAmount2', String(quickAmount2));
            localStorage.setItem('quickAmount3', String(quickAmount3));
            btn.textContent = newValue.toLocaleString();
            btn.onclick = function() {
              if (!isEditMode) {
                const currentAmounts = [quickAmount1, quickAmount2, quickAmount3];
                inputAmount.value = currentAmounts[index];
                inputAmount.dispatchEvent(new Event('input', { bubbles: true }));
              }
            };
          }
        });
      }
    };
    quickAmountContainer.appendChild(editSaveButton);
    const toggleSettingsBtn = document.createElement('button');
    toggleSettingsBtn.type = 'button';
    const initCollapsed = localStorage.getItem(STORAGE_KEYS.settingsCollapsed) === 'true' || localStorage.getItem(STORAGE_KEYS.settingsCollapsed) === null;
    toggleSettingsBtn.textContent = initCollapsed ? '显示' : '隐藏';
    toggleSettingsBtn.style.padding = '8px 12px';
    toggleSettingsBtn.style.borderRadius = '8px';
    toggleSettingsBtn.style.border = 'none';
    toggleSettingsBtn.style.background = '#666';
    toggleSettingsBtn.style.color = '#fff';
    toggleSettingsBtn.style.cursor = 'pointer';
    toggleSettingsBtn.style.fontSize = '14px';
    toggleSettingsBtn.style.minWidth = '0';
    toggleSettingsBtn.style.width = '100%';
    toggleSettingsBtn.onclick = function() {
      if (!settingsWrapper) return;
      const hidden = settingsWrapper.style.display === 'none';
      settingsWrapper.style.display = hidden ? 'block' : 'none';
      const sliderEl = document.getElementById('alpha-slider-container');
      if (sliderEl) sliderEl.style.display = hidden ? 'flex' : 'none';
      localStorage.setItem(STORAGE_KEYS.settingsCollapsed, String(!hidden));
      toggleSettingsBtn.textContent = hidden ? '隐藏' : '显示';
    };
    quickAmountContainer.appendChild(toggleSettingsBtn);
    container.appendChild(quickAmountContainer);
    const sliderContainer = document.createElement('div');
    sliderContainer.id = 'alpha-slider-container';
    const collapsedInit = localStorage.getItem(STORAGE_KEYS.settingsCollapsed) === 'true';
    sliderContainer.style.display = collapsedInit ? 'none' : 'flex';
    sliderContainer.style.alignItems = 'center';
    sliderContainer.style.marginTop = '8px';
    sliderContainer.style.marginBottom = '8px';
    const buySliderLabel = document.createElement('span'); buySliderLabel.textContent = '买入比例:'; buySliderLabel.style.marginRight = '4px';
    const buySliderMinInput = document.createElement('input'); buySliderMinInput.type = 'number'; buySliderMinInput.value = String(buySliderMin); buySliderMinInput.step = '0.1'; buySliderMinInput.style.width = '50px'; buySliderMinInput.style.marginRight = '4px'; buySliderMinInput.style.padding = '4px'; buySliderMinInput.style.borderRadius = '6px'; buySliderMinInputEl = buySliderMinInput;
    const buySliderSeparator = document.createElement('span'); buySliderSeparator.textContent = ' - '; buySliderSeparator.style.marginRight = '4px';
    const buySliderMaxInput = document.createElement('input'); buySliderMaxInput.type = 'number'; buySliderMaxInput.value = String(buySliderMax); buySliderMaxInput.step = '0.1'; buySliderMaxInput.style.width = '50px'; buySliderMaxInput.style.marginRight = '15px'; buySliderMaxInput.style.padding = '4px'; buySliderMaxInput.style.borderRadius = '6px'; buySliderMaxInputEl = buySliderMaxInput;
    const sellSliderLabel = document.createElement('span'); sellSliderLabel.textContent = '卖出比例:'; sellSliderLabel.style.marginRight = '4px';
    const sellSliderInput = document.createElement('input'); sellSliderInput.type = 'number'; sellSliderInput.value = String(sellSliderValue); sellSliderInput.step = '0.1'; sellSliderInput.style.width = '50px'; sellSliderInput.style.padding = '4px'; sellSliderInput.style.borderRadius = '6px'; sellSliderInputEl = sellSliderInput;
    sliderContainer.appendChild(buySliderLabel); sliderContainer.appendChild(buySliderMinInput); sliderContainer.appendChild(buySliderSeparator); sliderContainer.appendChild(buySliderMaxInput); sliderContainer.appendChild(sellSliderLabel); sliderContainer.appendChild(sellSliderInput);
    buySliderMinInput.oninput = function () {
      DebounceUtils.debounce('buySliderMin', () => {
      let value = parseFloat(this.value) || 90;
      if (value < 0) value = 0;
      if (value > 100) value = 100;
      buySliderMin = value;
      if (buySliderMin >= buySliderMax) {
        buySliderMax = buySliderMin + 0.1;
        buySliderMaxInput.value = String(buySliderMax);
          StorageUtils.set(STORAGE_KEYS.buySliderMax, buySliderMax);
      }
        StorageUtils.set(STORAGE_KEYS.buySliderMin, buySliderMin);
      }, 300);
    };
    buySliderMaxInput.oninput = function () {
      DebounceUtils.debounce('buySliderMax', () => {
      let value = parseFloat(this.value) || 100;
      if (value < 0) value = 0;
      if (value > 100) value = 100;
      buySliderMax = value;
      if (buySliderMax <= buySliderMin) {
        buySliderMin = buySliderMax - 0.1;
        buySliderMinInput.value = String(buySliderMin);
          StorageUtils.set(STORAGE_KEYS.buySliderMin, buySliderMin);
        }
        StorageUtils.set(STORAGE_KEYS.buySliderMax, buySliderMax);
      }, 300);
    };
    sellSliderInput.oninput = function () {
      DebounceUtils.debounce('sellSlider', () => {
        sellSliderValue = parseFloat(this.value) || 99.7;
        StorageUtils.set(STORAGE_KEYS.sellSliderValue, sellSliderValue);
      }, 300);
    };

    UIUpdater.updateSellSliderDisabled();

    container.appendChild(sliderContainer);

    setButtonState(false);
    updateAmountDisplay();
  }
  function buildMonitorSection(container) {
    const cycleTimeContainer = document.createElement('div'); cycleTimeContainer.style.display = 'flex'; cycleTimeContainer.style.alignItems = 'center'; cycleTimeContainer.style.marginTop = '8px'; cycleTimeContainer.style.marginBottom = '8px';
    const cycleTimeLabel = document.createElement('span'); cycleTimeLabel.textContent = '随机循环时间'; cycleTimeLabel.style.marginRight = '4px';
    cycleTimeMinInput = document.createElement('input'); cycleTimeMinInput.type = 'number'; cycleTimeMinInput.value = String(cycleTimeMin); cycleTimeMinInput.min = '100'; cycleTimeMinInput.max = '2000'; cycleTimeMinInput.step = '50'; cycleTimeMinInput.style.width = '60px'; cycleTimeMinInput.style.padding = '4px'; cycleTimeMinInput.style.borderRadius = '6px';
    const cycleTimeSeparator = document.createElement('span'); cycleTimeSeparator.textContent = '-'; cycleTimeSeparator.style.margin = '0 6px';
    cycleTimeMaxInput = document.createElement('input'); cycleTimeMaxInput.type = 'number'; cycleTimeMaxInput.value = String(cycleTimeMax); cycleTimeMaxInput.min = '100'; cycleTimeMaxInput.max = '5000'; cycleTimeMaxInput.step = '50'; cycleTimeMaxInput.style.width = '60px'; cycleTimeMaxInput.style.padding = '4px'; cycleTimeMaxInput.style.borderRadius = '6px';
    const cycleTimeMinUnit = document.createElement('span'); cycleTimeMinUnit.textContent = ' ms '; cycleTimeMinUnit.style.marginLeft = '6px';
    const cycleTimeMaxUnit = document.createElement('span'); cycleTimeMaxUnit.textContent = ' ms'; cycleTimeMaxUnit.style.marginLeft = '6px';
    cycleTimeContainer.appendChild(cycleTimeLabel); cycleTimeContainer.appendChild(cycleTimeMinInput); cycleTimeContainer.appendChild(cycleTimeMinUnit); cycleTimeContainer.appendChild(cycleTimeSeparator); cycleTimeContainer.appendChild(cycleTimeMaxInput); cycleTimeContainer.appendChild(cycleTimeMaxUnit);
    cycleTimeMinInput.oninput = function () { const v = parseFloat(this.value); if (v >= 100 && v <= 2000) { cycleTimeMin = v; if (cycleTimeMin >= cycleTimeMax) { cycleTimeMax = cycleTimeMin + 100; cycleTimeMaxInput.value = cycleTimeMax; } } };
    cycleTimeMinInput.onchange = function () { const v = parseFloat(this.value); if (!isNaN(v)) { cycleTimeMin = Math.min(Math.max(v, 100), 2000); if (cycleTimeMin >= cycleTimeMax) { cycleTimeMax = cycleTimeMin + 100; cycleTimeMaxInput.value = String(cycleTimeMax); } this.value = String(cycleTimeMin); localStorage.setItem(STORAGE_KEYS.cycleTimeMin, String(cycleTimeMin)); localStorage.setItem(STORAGE_KEYS.cycleTimeMax, String(cycleTimeMax)); } };
    cycleTimeMaxInput.oninput = function () { const v = parseFloat(this.value); if (v >= 100 && v <= 5000) { cycleTimeMax = v; if (cycleTimeMax <= cycleTimeMin) { cycleTimeMin = cycleTimeMax - 100; cycleTimeMinInput.value = cycleTimeMin; }  } };
    cycleTimeMaxInput.onchange = function () { const v = parseFloat(this.value); if (!isNaN(v)) { cycleTimeMax = Math.min(Math.max(v, 100), 5000); if (cycleTimeMax <= cycleTimeMin) { cycleTimeMin = cycleTimeMax - 100; cycleTimeMinInput.value = String(cycleTimeMin); } this.value = String(cycleTimeMax); localStorage.setItem(STORAGE_KEYS.cycleTimeMax, String(cycleTimeMax)); localStorage.setItem(STORAGE_KEYS.cycleTimeMin, String(cycleTimeMin)); } };
    const switchDelayContainer = document.createElement('div'); switchDelayContainer.style.marginTop = '8px';
    switchDelayCheckbox = document.createElement('input'); switchDelayCheckbox.type = 'checkbox'; switchDelayCheckbox.id = 'switchDelayCheckbox'; switchDelayCheckbox.checked = switchDelayEnabled; switchDelayEnabled = switchDelayCheckbox.checked;
    const switchDelayLabel = document.createElement('label'); switchDelayLabel.textContent = '买入/卖出前随机等待'; switchDelayLabel.htmlFor = 'switchDelayCheckbox'; switchDelayLabel.style.marginLeft = '4px';
    switchDelayContainer.appendChild(switchDelayCheckbox); switchDelayContainer.appendChild(switchDelayLabel);
    cycleTimeContainer.style.display = switchDelayCheckbox.checked ? 'flex' : 'none';
    switchDelayContainer.appendChild(cycleTimeContainer);
    bindCheckboxToPanel({ checkbox: switchDelayCheckbox, panel: null, storageKey: STORAGE_KEYS.switchDelayEnabled, defaultChecked: switchDelayEnabled, onToggle: (checked) => { switchDelayEnabled = checked; cycleTimeContainer.style.display = checked ? 'flex' : 'none'; } });
    container.appendChild(switchDelayContainer);
    const afterPairWaitContainer = document.createElement('div'); afterPairWaitContainer.style.marginTop = '8px';
    afterPairWaitCheckbox = document.createElement('input'); afterPairWaitCheckbox.type = 'checkbox'; afterPairWaitCheckbox.id = 'afterPairWaitCheckbox'; afterPairWaitCheckbox.checked = afterPairWaitEnabled;
    const afterPairWaitLabel = document.createElement('label'); afterPairWaitLabel.textContent = '买卖完成后等待'; afterPairWaitLabel.htmlFor = 'afterPairWaitCheckbox'; afterPairWaitLabel.style.marginLeft = '4px';
    afterPairWaitContainer.appendChild(afterPairWaitCheckbox); afterPairWaitContainer.appendChild(afterPairWaitLabel);
    afterPairBox = document.createElement('div'); afterPairBox.style.display = 'none'; afterPairBox.style.marginTop = '6px';
    afterPairMinInput = document.createElement('input'); afterPairMinInput.type = 'number'; afterPairMinInput.value = String(afterPairWaitMinSec); afterPairMinInput.min = '0'; afterPairMinInput.step = '1'; afterPairMinInput.style.width = '60px'; afterPairMinInput.style.padding = '4px'; afterPairMinInput.style.borderRadius = '6px'; afterPairMinInput.style.marginRight = '8px';
    const afterPairSeparator = document.createElement('span'); afterPairSeparator.textContent = '-'; afterPairSeparator.style.margin = '0 6px';
    afterPairMaxInput = document.createElement('input'); afterPairMaxInput.type = 'number'; afterPairMaxInput.value = String(afterPairWaitMaxSec); afterPairMaxInput.min = '0'; afterPairMaxInput.step = '1'; afterPairMaxInput.style.width = '60px'; afterPairMaxInput.style.padding = '4px'; afterPairMaxInput.style.borderRadius = '6px';
    const afterPairMinUnit = document.createElement('span'); afterPairMinUnit.textContent = ' 秒 '; afterPairMinUnit.style.marginLeft = '6px';
    const afterPairMaxUnit = document.createElement('span'); afterPairMaxUnit.textContent = ' 秒'; afterPairMaxUnit.style.marginLeft = '6px';
    afterPairMinInput.onchange = function () { const v = parseFloat(this.value); if (!isNaN(v)) { afterPairWaitMinSec = v; if (afterPairWaitMinSec >= afterPairWaitMaxSec) { afterPairWaitMaxSec = afterPairWaitMinSec + 1; afterPairMaxInput.value = String(afterPairWaitMaxSec); } this.value = String(afterPairWaitMinSec); localStorage.setItem(STORAGE_KEYS.afterPairWaitMinSec, String(afterPairWaitMinSec)); localStorage.setItem(STORAGE_KEYS.afterPairWaitMaxSec, String(afterPairWaitMaxSec)); } };
    afterPairMaxInput.onchange = function () { const v = parseFloat(this.value); if (!isNaN(v)) { afterPairWaitMaxSec = v; if (afterPairWaitMaxSec <= afterPairWaitMinSec) { afterPairWaitMinSec = 0.01; afterPairMinInput.value = String(afterPairWaitMinSec); } this.value = String(afterPairWaitMaxSec); localStorage.setItem(STORAGE_KEYS.afterPairWaitMaxSec, String(afterPairWaitMaxSec)); localStorage.setItem(STORAGE_KEYS.afterPairWaitMinSec, String(afterPairWaitMinSec)); } };
    afterPairBox.appendChild(afterPairMinInput); afterPairBox.appendChild(afterPairMinUnit); afterPairBox.appendChild(afterPairSeparator); afterPairBox.appendChild(afterPairMaxInput); afterPairBox.appendChild(afterPairMaxUnit);
    bindCheckboxToPanel({ checkbox: afterPairWaitCheckbox, panel: afterPairBox, storageKey: STORAGE_KEYS.afterPairWaitEnabled, defaultChecked: afterPairWaitEnabled, onToggle: (checked) => { afterPairWaitEnabled = checked; } });
    container.appendChild(afterPairWaitContainer); container.appendChild(afterPairBox);
    const orderWaitBox = document.createElement('div');
    orderWaitBox.style.marginTop = '8px';
    orderWaitBox.style.display = 'flex';
    orderWaitBox.style.alignItems = 'center';
    orderWaitBox.style.gap = '6px';
    orderWaitBox.style.flexWrap = 'wrap';
    const buyWaitLabel = document.createElement('span');
    buyWaitLabel.textContent = '买单等待秒:';
    buyOrderWaitInput = document.createElement('input');
    buyOrderWaitInput.type = 'number';
    buyOrderWaitInput.min = '1';
    buyOrderWaitInput.max = '300';
    buyOrderWaitInput.step = '1';
    buyOrderWaitInput.value = String(buyOrderWaitSec);
    buyOrderWaitInput.style.width = '58px';
    buyOrderWaitInput.style.padding = '4px';
    buyOrderWaitInput.style.borderRadius = '6px';
    const sellWaitLabel = document.createElement('span');
    sellWaitLabel.textContent = '卖单等待秒:';
    sellOrderWaitInput = document.createElement('input');
    sellOrderWaitInput.type = 'number';
    sellOrderWaitInput.min = '1';
    sellOrderWaitInput.max = '300';
    sellOrderWaitInput.step = '1';
    sellOrderWaitInput.value = String(sellOrderWaitSec);
    sellOrderWaitInput.style.width = '58px';
    sellOrderWaitInput.style.padding = '4px';
    sellOrderWaitInput.style.borderRadius = '6px';
    buyOrderWaitInput.oninput = function () {
      let v = parseInt(this.value, 10);
      if (isNaN(v) || v < 1) v = 1;
      if (v > 300) v = 300;
      buyOrderWaitSec = v;
      localStorage.setItem(STORAGE_KEYS.buyOrderWaitSec, String(v));
    };
    sellOrderWaitInput.oninput = function () {
      let v = parseInt(this.value, 10);
      if (isNaN(v) || v < 1) v = 1;
      if (v > 300) v = 300;
      sellOrderWaitSec = v;
      localStorage.setItem(STORAGE_KEYS.sellOrderWaitSec, String(v));
    };
    orderWaitBox.appendChild(buyWaitLabel);
    orderWaitBox.appendChild(buyOrderWaitInput);
    orderWaitBox.appendChild(sellWaitLabel);
    orderWaitBox.appendChild(sellOrderWaitInput);
    container.appendChild(orderWaitBox);
    const monitorRow = document.createElement('div');
    monitorRow.style.marginTop = '8px';
    monitorRow.style.display = 'flex';
    monitorRow.style.alignItems = 'center';
    monitorRow.style.gap = '16px';
    stableCheckbox = document.createElement('input'); stableCheckbox.type = 'checkbox'; stableCheckbox.id = 'stableCheckbox'; stableCheckbox.checked = stableDetectEnabled;
    const stableLabel = document.createElement('label'); stableLabel.textContent = '稳定监测'; stableLabel.htmlFor = 'stableCheckbox'; stableLabel.style.marginLeft = '4px';
    const stableGroup = document.createElement('span'); stableGroup.appendChild(stableCheckbox); stableGroup.appendChild(stableLabel);
    orderMonitorCheckbox = document.createElement('input'); orderMonitorCheckbox.type = 'checkbox'; orderMonitorCheckbox.id = 'orderMonitorCheckbox'; orderMonitorCheckbox.checked = orderMonitorPersisted;
    const orderMonitorLabel = document.createElement('label'); orderMonitorLabel.textContent = '挂单监测'; orderMonitorLabel.htmlFor = 'orderMonitorCheckbox'; orderMonitorLabel.style.marginLeft = '4px';
    const orderGroup = document.createElement('span'); orderGroup.appendChild(orderMonitorCheckbox); orderGroup.appendChild(orderMonitorLabel);
    realtimeStatsCheckbox = document.createElement('input'); realtimeStatsCheckbox.type = 'checkbox'; realtimeStatsCheckbox.id = 'realtimeStatsCheckbox'; realtimeStatsCheckbox.checked = true; realtimeStatsCheckbox.disabled = true;
    const realtimeStatsLabel = document.createElement('label'); realtimeStatsLabel.textContent = '实时统计'; realtimeStatsLabel.htmlFor = 'realtimeStatsCheckbox'; realtimeStatsLabel.style.marginLeft = '4px';
    const realtimeStatsGroup = document.createElement('span'); realtimeStatsGroup.appendChild(realtimeStatsCheckbox); realtimeStatsGroup.appendChild(realtimeStatsLabel);
    realtimeStatsGroup.style.display = 'none';
    reverseOrderCheckbox = document.createElement('input'); reverseOrderCheckbox.type = 'checkbox'; reverseOrderCheckbox.id = 'reverseOrderCheckbox'; reverseOrderCheckbox.checked = reverseOrderEnabled;
    const reverseOrderLabel = document.createElement('label'); reverseOrderLabel.textContent = '反向订单'; reverseOrderLabel.htmlFor = 'reverseOrderCheckbox'; reverseOrderLabel.style.marginLeft = '4px';
    const reverseOrderGroup = document.createElement('span'); reverseOrderGroup.appendChild(reverseOrderCheckbox); reverseOrderGroup.appendChild(reverseOrderLabel);
    try {
      realtimeStatsEnabled = true;
      if (realtimeStatsCheckbox) realtimeStatsCheckbox.checked = true;
      localStorage.setItem(STORAGE_KEYS.realtimeStatsEnabled, 'true');
    } catch (_) {}
    monitorRow.appendChild(stableGroup);
    monitorRow.appendChild(orderGroup);
    monitorRow.appendChild(reverseOrderGroup);
    container.appendChild(monitorRow);
    let stableContainer;
    try {
      stableContainer = document.createElement('div');
      stableBox = document.createElement('div'); stableBox.style.display = stableCheckbox.checked ? 'block' : 'none'; stableBox.style.marginTop = '6px';
      stableSecInput = document.createElement('input'); stableSecInput.type = 'number'; stableSecInput.min = '1'; stableSecInput.step = '1'; stableSecInput.style.width = '60px'; stableSecInput.style.padding = '4px'; stableSecInput.style.borderRadius = '6px'; stableSecInput.value = String(stableWindowSec);
      const secUnit = document.createElement('span'); secUnit.textContent = ' 秒  ±'; secUnit.style.margin = '0 6px 0 6px';
      stablePctInput = document.createElement('input'); stablePctInput.type = 'number'; stablePctInput.min = '0'; stablePctInput.step = '0.1'; stablePctInput.style.width = '60px'; stablePctInput.style.padding = '4px'; stablePctInput.style.borderRadius = '6px'; stablePctInput.value = String(stableTolerancePct);
      const pctUnit = document.createElement('span'); pctUnit.textContent = ' %'; pctUnit.style.marginLeft = '6px';
      stableBox.appendChild(stableSecInput); stableBox.appendChild(secUnit); stableBox.appendChild(stablePctInput); stableBox.appendChild(pctUnit);
      bindCheckboxToPanel({ checkbox: stableCheckbox, panel: stableBox, storageKey: STORAGE_KEYS.stableDetectEnabled, defaultChecked: stableDetectEnabled, onToggle: (checked) => { stableDetectEnabled = checked; if (checked && running) { sampleBuffer.clear(); MonitorRegistry.start('stable'); } else { MonitorRegistry.stop('stable'); if (volatilityDisplay) volatilityDisplay.textContent = ''; } try { const el = document.getElementById('alpha-uptrend-slope-win'); if (el) el.value = String(stableWindowSec); } catch (_) {} } });
      stableSecInput.oninput = function () { let v = parseFloat(this.value); if (isNaN(v) || v < 1) v = 1; stableWindowSec = v; localStorage.setItem(STORAGE_KEYS.stableWindowSec, String(stableWindowSec)); };
      stablePctInput.oninput = function () { let v = parseFloat(this.value); if (isNaN(v) || v < 0) v = 0; stableTolerancePct = v; localStorage.setItem(STORAGE_KEYS.stableTolerancePct, String(stableTolerancePct)); };
      if ((stableCheckbox.checked || stableDetectEnabled) && running) { sampleBuffer.clear(); MonitorRegistry.start('stable'); }
      container.appendChild(stableContainer); container.appendChild(stableBox);
    } catch (e) { }
    try {
      const pauseRow = document.createElement('div'); pauseRow.style.marginTop = '6px'; pauseRow.style.display = 'flex'; pauseRow.style.alignItems = 'center'; pauseRow.style.gap = '8px';
      const pauseCheckbox = document.createElement('input'); pauseCheckbox.type = 'checkbox'; pauseCheckbox.id = 'volatilityPauseCheckbox'; pauseCheckbox.checked = volatilityPauseEnabled;
      const pauseLabel = document.createElement('label'); pauseLabel.textContent = '稳定后下单'; pauseLabel.htmlFor = 'volatilityPauseCheckbox'; pauseLabel.style.marginLeft = '4px';
      const pauseBox = document.createElement('div'); pauseBox.style.display = pauseCheckbox.checked ? 'block' : 'none';
      const pauseSecInput = document.createElement('input'); pauseSecInput.type = 'number'; pauseSecInput.min = '1'; pauseSecInput.step = '1'; pauseSecInput.style.width = '60px'; pauseSecInput.style.padding = '4px'; pauseSecInput.style.borderRadius = '6px'; pauseSecInput.value = String(volatilityPauseSec);
      const pauseUnit = document.createElement('span'); pauseUnit.textContent = ' 秒'; pauseUnit.style.marginLeft = '6px';
      pauseBox.appendChild(pauseSecInput); pauseBox.appendChild(pauseUnit);
      pauseRow.appendChild(pauseCheckbox); pauseRow.appendChild(pauseLabel);
      container.appendChild(pauseRow); container.appendChild(pauseBox);
      bindCheckboxToPanel({ checkbox: pauseCheckbox, panel: pauseBox, storageKey: STORAGE_KEYS.volatilityPauseEnabled, defaultChecked: volatilityPauseEnabled, onToggle: (checked) => { volatilityPauseEnabled = checked; try { if (checked) { if (typeof uptrendOrderEnabled !== 'undefined') { uptrendOrderEnabled = false; localStorage.setItem(STORAGE_KEYS.uptrendOrderEnabled, 'false'); } if (typeof upCheckbox !== 'undefined' && upCheckbox) { upCheckbox.checked = false; upCheckbox.dispatchEvent(new Event('change', { bubbles: true })); upCheckbox.disabled = true; } if (typeof upLabel !== 'undefined' && upLabel) { upLabel.style.opacity = '0.5'; } } else { if (typeof upCheckbox !== 'undefined' && upCheckbox) { upCheckbox.disabled = false; } if (typeof upLabel !== 'undefined' && upLabel) { upLabel.style.opacity = '1'; } } } catch (_) {} } });
      pauseSecInput.oninput = function () { let v = parseFloat(this.value); if (isNaN(v) || v < 1) v = 1; volatilityPauseSec = v; localStorage.setItem(STORAGE_KEYS.volatilityPauseSec, String(volatilityPauseSec)); };
      const upRow = document.createElement('div'); upRow.style.marginTop = '6px'; upRow.style.display = 'flex'; upRow.style.alignItems = 'center'; upRow.style.gap = '8px';
      const upCheckbox = document.createElement('input'); upCheckbox.type = 'checkbox'; upCheckbox.id = 'uptrendOrderCheckbox'; upCheckbox.checked = uptrendOrderEnabled;
      const upLabel = document.createElement('label'); upLabel.textContent = '上涨下单'; upLabel.htmlFor = 'uptrendOrderCheckbox'; upLabel.style.marginLeft = '4px';
      const upBox = document.createElement('div'); upBox.style.display = upCheckbox.checked ? 'block' : 'none';
      const upSecInput = document.createElement('input'); upSecInput.type = 'number'; upSecInput.min = '1'; upSecInput.step = '1'; upSecInput.style.width = '60px'; upSecInput.style.padding = '4px'; upSecInput.style.borderRadius = '6px'; upSecInput.value = String(uptrendRequiredCount);
      const upSecUnit = document.createElement('span'); upSecUnit.textContent = ' 次  ≥'; upSecUnit.style.margin = '0 6px 0 6px';
      const upPctInput = document.createElement('input'); upPctInput.type = 'number'; upPctInput.min = '0'; upPctInput.step = '0.001'; upPctInput.style.width = '80px'; upPctInput.style.padding = '4px'; upPctInput.style.borderRadius = '6px'; upPctInput.value = String(uptrendThresholdPct);
      const upPctUnit = document.createElement('span'); upPctUnit.textContent = ' %'; upPctUnit.style.marginLeft = '6px';
      const slopeWinInput = document.createElement('input'); slopeWinInput.id = 'alpha-uptrend-slope-win'; slopeWinInput.type = 'number'; slopeWinInput.min = '1'; slopeWinInput.step = '1'; slopeWinInput.style.width = '60px'; slopeWinInput.style.padding = '4px'; slopeWinInput.style.borderRadius = '6px'; slopeWinInput.value = String(stableWindowSec);
      const slopeWinUnit = document.createElement('span'); slopeWinUnit.textContent = ' 秒窗口(随稳定监测)'; slopeWinUnit.style.margin = '0 6px';
      upBox.appendChild(upSecInput); upBox.appendChild(upSecUnit); upBox.appendChild(upPctInput); upBox.appendChild(upPctUnit);
      slopeWinInput.style.marginLeft = '8px';
      upRow.appendChild(upCheckbox); upRow.appendChild(upLabel);
      container.appendChild(upRow); container.appendChild(upBox);
      bindCheckboxToPanel({ checkbox: upCheckbox, panel: upBox, storageKey: STORAGE_KEYS.uptrendOrderEnabled, defaultChecked: uptrendOrderEnabled, onToggle: (checked) => {
        uptrendOrderEnabled = checked;
        if (checked) {
          try {
            pauseCheckbox.checked = false;
            pauseCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            volatilityPauseEnabled = false;
            pauseCheckbox.disabled = true; if (pauseLabel) pauseLabel.style.opacity = '0.5';
          } catch (_) {}
        } else {
          pauseCheckbox.disabled = false; if (pauseLabel) pauseLabel.style.opacity = '1';
        }
      } });
      upSecInput.oninput = function () { let v = parseFloat(this.value); if (isNaN(v) || v < 1) v = 1; uptrendRequiredCount = v; localStorage.setItem(STORAGE_KEYS.uptrendRequiredCount, String(uptrendRequiredCount)); };
      upPctInput.oninput = function () { let v = parseFloat(this.value); if (isNaN(v) || v < 0) v = 0; uptrendThresholdPct = v; localStorage.setItem(STORAGE_KEYS.uptrendThresholdPct, String(uptrendThresholdPct)); };
      slopeWinInput.readOnly = true; slopeWinInput.oninput = null;
    } catch (e) { }

    try {
      const authenticatorRow = document.createElement('div');
      authenticatorRow.style.marginTop = '6px';
      authenticatorRow.style.display = 'flex';
      authenticatorRow.style.alignItems = 'center';
      authenticatorRow.style.gap = '8px';

      authenticatorCheckbox = document.createElement('input');
      authenticatorCheckbox.type = 'checkbox';
      authenticatorCheckbox.id = 'authenticatorCheckbox';
      authenticatorCheckbox.checked = authenticatorEnabled;
      const authenticatorLabel = document.createElement('label');
      authenticatorLabel.textContent = '身份验证器';
      authenticatorLabel.htmlFor = 'authenticatorCheckbox';
      authenticatorLabel.style.marginLeft = '4px';

      const authenticatorSecretBox = document.createElement('div');
      authenticatorSecretBox.style.display = authenticatorCheckbox.checked ? 'block' : 'none';
      authenticatorSecretBox.style.marginTop = '6px';

      const secretLabel = document.createElement('span');
      secretLabel.textContent = '密钥: ';
      secretLabel.style.marginRight = '6px';

      authenticatorSecretInput = document.createElement('input');
      authenticatorSecretInput.type = 'password';
      authenticatorSecretInput.placeholder = '输入身份验证器密钥';
      authenticatorSecretInput.style.width = '200px';
      authenticatorSecretInput.style.padding = '4px';
      authenticatorSecretInput.style.borderRadius = '6px';
      authenticatorSecretInput.value = authenticatorSecret;

      authenticatorSecretBox.appendChild(secretLabel);
      authenticatorSecretBox.appendChild(authenticatorSecretInput);

      authenticatorRow.appendChild(authenticatorCheckbox);
      authenticatorRow.appendChild(authenticatorLabel);

      container.appendChild(authenticatorRow);
      container.appendChild(authenticatorSecretBox);

      bindCheckboxToPanel({
        checkbox: authenticatorCheckbox,
        panel: authenticatorSecretBox,
        storageKey: STORAGE_KEYS.authenticatorEnabled,
        defaultChecked: authenticatorEnabled,
        onToggle: (checked) => {
          authenticatorEnabled = checked;
        }
      });

      authenticatorSecretInput.oninput = function () {
        authenticatorSecret = this.value;
        localStorage.setItem(STORAGE_KEYS.authenticatorSecret, authenticatorSecret);
      };

    } catch (e) {
      console.error('创建2FA身份验证器失败:', e);
    }

    // 点击间隔设置
    try {
      const clickIntervalRow = document.createElement('div');
      clickIntervalRow.style.display = 'flex';
      clickIntervalRow.style.alignItems = 'center';
      clickIntervalRow.style.marginTop = '12px';
      clickIntervalRow.style.gap = '8px';

      const clickIntervalLabel = document.createElement('span');
      clickIntervalLabel.textContent = '点击间隔:';
      clickIntervalLabel.style.marginRight = '4px';

      clickIntervalMinInput = document.createElement('input');
      clickIntervalMinInput.type = 'number';
      clickIntervalMinInput.placeholder = '最小值';
      clickIntervalMinInput.style.width = '80px';
      clickIntervalMinInput.style.padding = '4px';
      clickIntervalMinInput.style.borderRadius = '6px';
      clickIntervalMinInput.style.marginRight = '4px';
      clickIntervalMinInput.value = clickIntervalMin;

      const dashSpan = document.createElement('span');
      dashSpan.textContent = '-';
      dashSpan.style.marginRight = '4px';

      clickIntervalMaxInput = document.createElement('input');
      clickIntervalMaxInput.type = 'number';
      clickIntervalMaxInput.placeholder = '最大值';
      clickIntervalMaxInput.style.width = '80px';
      clickIntervalMaxInput.style.padding = '4px';
      clickIntervalMaxInput.style.borderRadius = '6px';
      clickIntervalMaxInput.style.marginRight = '4px';
      clickIntervalMaxInput.value = clickIntervalMax;

      const msLabel = document.createElement('span');
      msLabel.textContent = 'ms';

      clickIntervalRow.appendChild(clickIntervalLabel);
      clickIntervalRow.appendChild(clickIntervalMinInput);
      clickIntervalRow.appendChild(dashSpan);
      clickIntervalRow.appendChild(clickIntervalMaxInput);
      clickIntervalRow.appendChild(msLabel);

      container.appendChild(clickIntervalRow);

      // 绑定输入事件
      clickIntervalMinInput.oninput = function() {
        let value = parseInt(this.value) || 1000;
        if (value < 100) value = 100;
        if (value > 10000) value = 10000;
        clickIntervalMin = value;
        localStorage.setItem(STORAGE_KEYS.clickIntervalMin, String(clickIntervalMin));
      };

      clickIntervalMaxInput.oninput = function() {
        let value = parseInt(this.value) || 1750;
        if (value < 100) value = 100;
        if (value > 10000) value = 10000;
        if (value < clickIntervalMin) value = clickIntervalMin;
        clickIntervalMax = value;
        localStorage.setItem(STORAGE_KEYS.clickIntervalMax, String(clickIntervalMax));
      };

    } catch (e) {
      console.error('创建点击间隔设置失败:', e);
    }

    bindCheckboxToPanel({ checkbox: orderMonitorCheckbox, panel: null, storageKey: STORAGE_KEYS.orderMonitorEnabled, defaultChecked: orderMonitorPersisted, onToggle: (checked) => { (checked && running) ? MonitorRegistry.start('order') : MonitorRegistry.stop('order'); } });
    realtimeStatsEnabled = true;
    try { localStorage.setItem(STORAGE_KEYS.realtimeStatsEnabled, 'true'); } catch (_) {}
    try { if (running) { if (!realtimeStatsStartTime) realtimeStatsStartTime = Date.now(); startRealtimeStatsBackfill(); } } catch (_) {}
    bindCheckboxToPanel({ checkbox: reverseOrderCheckbox, panel: null, storageKey: 'reverseOrderEnabled', defaultChecked: reverseOrderEnabled, onToggle: (checked) => {
      reverseOrderEnabled = checked;
      try {
        realtimeStatsEnabled = true;
        if (realtimeStatsCheckbox) realtimeStatsCheckbox.checked = true;
        localStorage.setItem(STORAGE_KEYS.realtimeStatsEnabled, 'true');
        if (running) startRealtimeStatsBackfill();
      } catch (_) {}
      try { UIUpdater.updateSellSliderDisabled(); } catch (_) {}
      if (checked) {
        scheduleReverseOrderInitialFill();
      } else {
        reverseOrderInitialFillArmed = false;
        reverseOrderInitialFillDone = true;
        ResourceManager.cleanup('uiTimeout', RESOURCE_IDS.uiReverseEnforceRetry);
        ResourceManager.cleanup('uiObserver', RESOURCE_IDS.uiReverseObserver);
      }
    } });

  }
  function buildVolumeSection(container) {
    const volRow = document.createElement('div'); volRow.style.marginTop = '2px'; volRow.style.display = 'flex'; volRow.style.justifyContent = 'flex-start'; volRow.style.flexWrap = 'wrap'; volRow.style.gap = '12px';
    yesterdayVolumeDisplay = document.createElement('span'); yesterdayVolumeDisplay.style.fontSize = '90%'; yesterdayVolumeDisplay.style.color = '#999999'; yesterdayVolumeDisplay.textContent = '';
    dailyVolumeDisplay = document.createElement('span'); dailyVolumeDisplay.style.fontSize = '90%'; dailyVolumeDisplay.style.color = '#CCCCCC'; dailyVolumeDisplay.textContent = '';
    multiplierDisplay = document.createElement('span'); multiplierDisplay.style.fontSize = '90%'; multiplierDisplay.style.color = '#CCCCCC'; multiplierDisplay.textContent = '';
    volRow.appendChild(yesterdayVolumeDisplay); volRow.appendChild(dailyVolumeDisplay); volRow.appendChild(multiplierDisplay); container.appendChild(volRow);
  }
  function createUI() {
    try {
      clearLegacyHiddenPriceSettings();
      ResourceManager.cleanupType('uiEvent');
      ResourceManager.cleanupType('uiTimeout');
      ResourceManager.cleanupType('uiTimer');
      dailyRefreshTimer = null;
      ResourceManager.cleanup('uiObserver', RESOURCE_IDS.uiReverseObserver);
      const existing = document.getElementById('alpha-extension-engine-container');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      const existingPopup = document.getElementById('alpha-extension-token-popup');
      if (existingPopup && existingPopup.parentNode) existingPopup.parentNode.removeChild(existingPopup);
    const container = document.createElement('div');
    container.id = 'alpha-extension-engine-container';
    container.style.position = 'fixed';
    const defaultTop = 20; const defaultLeft = Math.round(window.innerWidth / 2);
    let initTop = Math.max(0, Math.min(defaultTop, Math.max(0, window.innerHeight - 80)));
    let initLeft = Math.max(0, Math.min(defaultLeft, Math.max(0, window.innerWidth - 200)));
    container.style.top = initTop + 'px'; container.style.left = initLeft + 'px'; container.style.transform = 'translateX(-50%)';
    container.style.backgroundColor = 'rgba(0,0,0,0.74)'; container.style.color = '#fff'; container.style.padding = '12px'; container.style.borderRadius = '10px'; container.style.border = '1px solid rgba(255,255,255,0.08)'; container.style.boxShadow = '0 8px 24px rgba(0,0,0,0.28)'; container.style.zIndex = '2147483647'; container.style.cursor = 'move'; container.style.width = '560px'; container.style.maxWidth = 'calc(100vw - 24px)'; container.style.boxSizing = 'border-box'; container.style.display = 'block';
    document.documentElement.appendChild(container);
    let isDragging = false; let dragOffsetX = 0; let dragOffsetY = 0;
    container.addEventListener('mousedown', function (e) { isDragging = true; dragOffsetX = e.clientX - container.getBoundingClientRect().left; dragOffsetY = e.clientY - container.getBoundingClientRect().top; document.body.style.userSelect = 'none'; });
    const handleDragMove = function (e) {
      if (isDragging) {
        let newLeft = e.clientX - dragOffsetX;
        let newTop = e.clientY - dragOffsetY;
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - container.offsetWidth));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - container.offsetHeight));
        container.style.left = newLeft + 'px';
        container.style.top = newTop + 'px';
        container.style.transform = '';

        const popupPanel = document.getElementById('alpha-extension-token-popup');
        if (popupPanel && popupPanel.style.display !== 'none') {
          window.updatePopupPosition();
        }
      }
    };
    registerManagedEvent('uiEvent', RESOURCE_IDS.uiDragMove, document, 'mousemove', handleDragMove);
    const handleDragUp = function () { isDragging = false; document.body.style.userSelect = ''; };
    registerManagedEvent('uiEvent', RESOURCE_IDS.uiDragUp, document, 'mouseup', handleDragUp);

    const handleResize = function() {
      const popupPanel = document.getElementById('alpha-extension-token-popup');
      if (popupPanel && popupPanel.style.display !== 'none') {
        window.updatePopupPosition();
      }
    };
    registerManagedEvent('uiEvent', RESOURCE_IDS.uiResize, window, 'resize', handleResize);
    UIBuilder.buildSection('run', container);
    settingsWrapper = document.createElement('div');
    const collapsed = localStorage.getItem(STORAGE_KEYS.settingsCollapsed) === 'true' || localStorage.getItem(STORAGE_KEYS.settingsCollapsed) === null;
    settingsWrapper.style.display = collapsed ? 'none' : 'block';
    settingsWrapper.style.marginTop = '10px';
    settingsWrapper.style.padding = '10px';
    settingsWrapper.style.backgroundColor = 'transparent';
    settingsWrapper.style.borderRadius = '0px';
    settingsWrapper.style.border = 'none';

    const rightPanel = container.querySelector('div[data-panel="right"]');
    if (rightPanel) {
      rightPanel.appendChild(settingsWrapper);
    } else {
      container.appendChild(settingsWrapper);
    }
    const prevSlider = document.getElementById('alpha-slider-container');
    if (prevSlider) { prevSlider.style.display = collapsed ? 'none' : 'flex'; settingsWrapper.appendChild(prevSlider); }
    UIBuilder.buildSection('monitor', settingsWrapper);
    try { Scheduler.start(); MonitorRegistry.start('token'); } catch (e) { }
    try { setManagedTimeout('uiTimeout', RESOURCE_IDS.uiInitialRefresh, () => { UIUpdater.updateDailyVolumeUI(); scheduleDailyRefresh(); }, 500); } catch (_) {}
    try { if (running && stableDetectEnabled) MonitorRegistry.start('stable'); else MonitorRegistry.stop('stable'); } catch (e) { }
    if (reverseOrderEnabled) {
      setManagedTimeout('uiTimeout', RESOURCE_IDS.uiReverseEnforceEarly, () => { scheduleReverseOrderInitialFill(15000); }, 600);
      setManagedTimeout('uiTimeout', RESOURCE_IDS.uiReverseEnforceLate, () => { scheduleReverseOrderInitialFill(15000); }, 1800);
    }
    initTokenIconOnce();
    setManagedTimeout('uiTimeout', RESOURCE_IDS.uiTokenIcon, () => { initTokenIconOnce(); }, 800);
    updateBalanceUI();
    BalanceManager.capture({ startDelayMs: 1800, maxWindowMs: 10000 });
    container.dataset.alphaExtensionEngine = 'true';
    container.style.display = 'none';
    const tokenPopup = document.getElementById('alpha-extension-token-popup');
    if (tokenPopup) tokenPopup.style.display = 'none';
    startAlphaExtensionBridge();
    } catch (error) {
      console.error('UI创建失败:', error);
    }
  }

  let alphaExtensionBridgeTimerId = null;

  function alphaExtensionText(element) {
    return String(element && element.textContent || '').trim();
  }

  function alphaExtensionNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function alphaHasVisibleLegacyPanel() {
    const legacy = document.getElementById('alpha-helper-container');
    if (!legacy) return false;
    const style = window.getComputedStyle(legacy);
    return style.display !== 'none' && style.visibility !== 'hidden' && legacy.getClientRects().length > 0;
  }

  function alphaExtensionState() {
    return {
      version: '1.1.12',
      ready: Boolean(inputAmount && btnStart),
      legacyUserscriptDetected: alphaHasVisibleLegacyPanel(),
      status: alphaExtensionStatus,
      url: window.location.href,
      running,
      token: alphaExtensionText(currentTokenDisplay) || '--',
      market: {
        dailyVolume: alphaExtensionText(dailyVolumeDisplay) || '--',
        yesterdayVolume: alphaExtensionText(yesterdayVolumeDisplay) || '--',
        multiplier: alphaExtensionText(multiplierDisplay) || '--',
        range: alphaExtensionText(rangeDisplay) || '--',
        direction: alphaExtensionText(directionDisplay) || '--'
      },
      stats: {
        target: alphaExtensionNumber(maxTotalAmount),
        total: alphaExtensionNumber(totalAmount),
        buy: alphaExtensionNumber(buyAmount),
        integral: alphaExtensionNumber(totalIntegral),
        balanceInitial: Number.isFinite(balanceInit) ? balanceInit : null,
        balanceCurrent: Number.isFinite(balanceCurrent) ? balanceCurrent : null,
        wear: Number.isFinite(balanceWear) ? balanceWear : null
      },
      settings: {
        target: inputAmount ? inputAmount.value : String(maxTotalAmount || ''),
        buySliderMin,
        buySliderMax,
        sellSliderValue,
        cycleTimeMin,
        cycleTimeMax,
        buyOrderWaitSec,
        sellOrderWaitSec,
        quickAmount1,
        quickAmount2,
        quickAmount3
      },
      controls: {
        stableDetectEnabled,
        orderMonitorEnabled: Boolean(orderMonitorCheckbox ? orderMonitorCheckbox.checked : orderMonitorPersisted),
        reverseOrderEnabled,
        volatilityLimitEnabled
      }
    };
  }

  function postAlphaExtensionMessage(kind, payload) {
    window.postMessage({ __alphaVolumeExtension: true, kind, payload }, window.location.origin);
  }

  function postAlphaExtensionState() {
    if (!inputAmount) return;
    postAlphaExtensionMessage('state', alphaExtensionState());
  }

  function alphaSetInput(input, value) {
    if (!input || value === undefined || value === null) return;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function alphaSetCheckbox(input, enabled) {
    if (!input || enabled === undefined || enabled === null) return;
    if (input.checked !== Boolean(enabled)) {
      input.checked = Boolean(enabled);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  let alphaExtensionStatus = '准备就绪';

  async function handleAlphaExtensionCommand(command, payload = {}) {
    if (!inputAmount) return { ok: false, error: 'Alpha 页面交易引擎正在加载' };
    if (alphaHasVisibleLegacyPanel() && command === 'alpha-toggle-run') {
      return { ok: false, error: '检测到旧版 Alpha 篡改猴脚本，请停用后再启动扩展' };
    }

    switch (command) {
      case 'alpha-get-state':
        return { ok: true, state: alphaExtensionState() };
      case 'alpha-toggle-run':
        if (running) {
          stop();
          alphaExtensionStatus = '已停止';
          return { ok: true, state: alphaExtensionState() };
        }
        if (!(parseFloat(inputAmount.value) > 0)) {
          alphaExtensionStatus = '请先填写大于 0 的目标交易额';
          return { ok: true, state: alphaExtensionState() };
        }
        alphaExtensionStatus = '正在启动 Alpha 交易';
        start();
        alphaExtensionStatus = running ? 'Alpha 自动交易运行中' : 'Alpha 未能启动，请检查目标交易额和交易面板';
        return { ok: true, state: alphaExtensionState() };
      case 'alpha-save-settings':
        alphaSetInput(inputAmount, payload.target);
        alphaSetInput(buySliderMinInputEl, payload.buySliderMin);
        alphaSetInput(buySliderMaxInputEl, payload.buySliderMax);
        alphaSetInput(sellSliderInputEl, payload.sellSliderValue);
        alphaSetInput(cycleTimeMinInput, payload.cycleTimeMin);
        alphaSetInput(cycleTimeMaxInput, payload.cycleTimeMax);
        alphaSetInput(buyOrderWaitInput, payload.buyOrderWaitSec);
        alphaSetInput(sellOrderWaitInput, payload.sellOrderWaitSec);
        alphaSetCheckbox(stableCheckbox, payload.stableDetectEnabled);
        alphaSetCheckbox(orderMonitorCheckbox, payload.orderMonitorEnabled);
        if (payload.volatilityLimitEnabled !== undefined && payload.volatilityLimitEnabled !== null) {
          volatilityLimitEnabled = Boolean(payload.volatilityLimitEnabled);
          localStorage.setItem(STORAGE_KEYS.volatilityLimitEnabled, String(volatilityLimitEnabled));
        }
        alphaSetCheckbox(reverseOrderCheckbox, Boolean(payload.reverseOrderEnabled));
        renewData();
        alphaExtensionStatus = '设置已生效';
        return { ok: true, state: alphaExtensionState() };
      case 'alpha-clear-records':
        LifecycleManager.clearRecords();
        return { ok: true, state: alphaExtensionState() };
      case 'alpha-refresh':
        updateAmountDisplay();
        await UIUpdater.updateDailyVolumeUI();
        return { ok: true, state: alphaExtensionState() };
      default:
        return { ok: false, error: `未知 Alpha 指令：${String(command || '')}` };
    }
  }

  function startAlphaExtensionBridge() {
    postAlphaExtensionState();
    if (alphaExtensionBridgeTimerId) return;
    alphaExtensionBridgeTimerId = window.setInterval(postAlphaExtensionState, 1000);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.__alphaVolumeExtension !== true || data.kind !== 'command') return;
    handleAlphaExtensionCommand(data.command, data.payload)
      .then((result) => {
        postAlphaExtensionMessage('response', { id: data.id, ...result });
        postAlphaExtensionState();
      })
      .catch((error) => postAlphaExtensionMessage('response', {
        id: data.id,
        ok: false,
        error: error && error.message ? error.message : String(error)
      }));
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createUI, { once: true });
  } else {
  createUI();
  }
  setManagedTimeout('uiTimeout', RESOURCE_IDS.uiEnsure, () => {
    if (!document.getElementById('alpha-extension-engine-container')) {
      try { createUI(); } catch (e) { }
    }
  }, 1500);

  let lastReverseSwitchClickAt = 0;

  function getElementContextText(element, maxDepth = 6) {
    const parts = [];
    let node = element;
    for (let depth = 0; node && depth < maxDepth; depth++, node = node.parentElement) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) parts.push(text.slice(0, 400));
    }
    return parts.join(' ');
  }

  function findReverseOrderSwitchNode() {
    const candidates = [];
    const seen = new Set();
    const pushCandidate = (node) => {
      if (!(node instanceof Element) || seen.has(node)) return;
      seen.add(node);
      if (!isNodeVisible(node)) return;
      if (node.closest && node.closest('#alpha-extension-engine-container')) return;
      candidates.push(node);
    };
    try {
      const oldNode = document.evaluate('//*[@id="__APP"]/div[2]/div[7]/div/div[2]/div[3]/div[5]/div[1]/div[1]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      pushCandidate(oldNode);
    } catch (_) {}
    try {
      const labels = Array.from(document.querySelectorAll('div, span, label, p'))
        .filter(el => /反向订单|反向|Reverse/i.test((el.textContent || '').trim()))
        .filter(el => isNodeVisible(el) && !(el.closest && el.closest('#alpha-extension-engine-container')));
      for (const label of labels) {
        let scope = label;
        for (let depth = 0; scope && depth < 5; depth++, scope = scope.parentElement) {
          Array.from(scope.querySelectorAll('[aria-checked], [role="switch"], input[type="checkbox"], button, [class*="switch"], [class*="Switch"]')).forEach(pushCandidate);
        }
      }
    } catch (_) {}
    try {
      Array.from(document.querySelectorAll('[aria-checked], [role="switch"], input[type="checkbox"], button, [class*="switch"], [class*="Switch"]')).forEach(pushCandidate);
    } catch (_) {}
    let best = null;
    let bestScore = -100;
    for (const node of candidates) {
      const context = getElementContextText(node, 7);
      const meta = [
        node.getAttribute('aria-label'),
        node.getAttribute('role'),
        node.getAttribute('aria-checked'),
        node.className,
        node.id
      ].filter(Boolean).join(' ');
      const text = `${meta} ${context}`;
      let score = 0;
      if (/反向订单|反向|Reverse/i.test(text)) score += 20;
      if (node.hasAttribute && node.hasAttribute('aria-checked')) score += 8;
      if (/switch|checkbox/i.test(meta)) score += 6;
      if (/当前委托|历史委托|持有资产|全部取消/i.test(context)) score -= 12;
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return best && bestScore >= 12 ? best : null;
  }

  function isReverseSwitchChecked(node) {
    if (!node) return false;
    try {
      const aria = node.getAttribute && node.getAttribute('aria-checked');
      if (aria === 'true') return true;
      if (aria === 'false') return false;
      if (node instanceof HTMLInputElement && node.type === 'checkbox') return !!node.checked;
      const cls = String(node.className || '');
      if (/\b(active|checked|selected|open|on)\b/i.test(cls)) return true;
      const context = getElementContextText(node, 2);
      if (/已开启|开启|On/i.test(context) && !/关闭|Off/i.test(context)) return true;
    } catch (_) {}
    return false;
  }

  function tryEnsureReverseCheckedOnce() {
    try {
      const node = findReverseOrderSwitchNode();
      if (!node) return false;
      if (isReverseSwitchChecked(node)) return true;
      const nowMs = Date.now();
      if (nowMs - lastReverseSwitchClickAt > 700) {
        lastReverseSwitchClickAt = nowMs;
        simulateRealMouseClick(node);
      }
      return isReverseSwitchChecked(node);
    } catch (_) { return false; }
  }
  async function ensureReverseChecked(maxWaitMs = 1200) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (tryEnsureReverseCheckedOnce()) return true;
      await sleep(80);
    }
    return tryEnsureReverseCheckedOnce();
  }

  function findReverseOrderPriceInput() {
    const inputs = [];
    const seen = new Set();
    const selectors = [
      'input.bn-textField-input#limitTotal',
      'input#limitTotal',
      'input#limitPrice',
      'input[placeholder*="限价卖出"]',
      'input[aria-label*="限价卖出"]',
      'input[placeholder*="卖出"]',
      'input[aria-label*="卖出"]',
      'input[placeholder*="Price"]',
      'input[aria-label*="Price"]',
      'input'
    ];
    const getContextText = (input) => getElementContextText(input, 7);
    const pushInput = (input) => {
      if (!(input instanceof HTMLInputElement) || seen.has(input)) return;
      seen.add(input);
      if (!isNodeVisible(input)) return;
      if (input.closest && input.closest('#alpha-extension-engine-container')) return;
      inputs.push(input);
    };
    for (const selector of selectors) {
      try { Array.from(document.querySelectorAll(selector)).forEach(pushInput); } catch (_) {}
    }
    let best = null;
    let bestScore = -100;
    let bestHasReverseSignal = false;
    const priceLikeInputs = [];
    for (const input of inputs) {
      const meta = [
        input.placeholder,
        input.getAttribute('aria-label'),
        input.id,
        input.name,
        input.className
      ].filter(Boolean).join(' ');
      const context = getContextText(input);
      const text = `${meta} ${context}`;
      const hasReverseSignal = /反向订单|反向|Reverse|限价卖出|卖出|Sell|limitTotal/i.test(text);
      let score = 0;
      if (/反向订单|反向|Reverse/i.test(text)) score += 12;
      if (/限价卖出|卖出|Sell/i.test(text)) score += 8;
      if (/价格|Price|limitPrice/i.test(meta)) score += 6;
      if (/limitTotal/i.test(meta)) score += 4;
      if (input.id === 'limitPrice') score += 3;
      if (input.id === 'limitTotal') score += 3;
      if (/数量|Amount|Qty|Quantity/i.test(meta)) score -= 4;
      if (/当前委托|历史委托|已成交|新订单/i.test(context)) score -= 10;
      if (/(价格|Price|limitPrice|限价卖出|卖出|Sell|limitTotal)/i.test(text) && !/(数量|Amount|Qty|Quantity)/i.test(meta)) {
        priceLikeInputs.push({ input, score, top: input.getBoundingClientRect().top });
      }
      if (score > bestScore) {
        bestScore = score;
        best = input;
        bestHasReverseSignal = hasReverseSignal;
      }
    }
    if (best && bestScore >= 5 && bestHasReverseSignal) return best;
    const sortedPriceInputs = priceLikeInputs
      .filter(item => item.score >= 3)
      .sort((a, b) => b.top - a.top || b.score - a.score);
    if (sortedPriceInputs.length >= 2) return sortedPriceInputs[0].input;
    const limitTotal = sortedPriceInputs.find(item => item.input.id === 'limitTotal');
    return limitTotal ? limitTotal.input : null;
  }

  function getVisibleLimitPriceValue() {
    const candidates = [];
    try {
      const selectors = [
        'input#limitPrice',
        'input[placeholder*="价格"]',
        'input[aria-label*="价格"]',
        'input[placeholder*="Price"]',
        'input[aria-label*="Price"]'
      ];
      const seen = new Set();
      for (const selector of selectors) {
        for (const input of Array.from(document.querySelectorAll(selector))) {
          if (!(input instanceof HTMLInputElement) || seen.has(input)) continue;
          seen.add(input);
          if (!isNodeVisible(input)) continue;
          if (input.closest && input.closest('#alpha-extension-engine-container')) continue;
          const value = String(input.value || '').trim();
          if (!value || !/\d/.test(value)) continue;
          const meta = [input.placeholder, input.getAttribute('aria-label'), input.id, input.name].filter(Boolean).join(' ');
          let score = 0;
          if (/价格|Price|limitPrice/i.test(meta)) score += 5;
          if (input.id === 'limitPrice') score += 3;
          if (/数量|Amount|Qty|Quantity|Total|金额/i.test(meta)) score -= 5;
          candidates.push({ value, score });
        }
      }
    } catch (_) {}
    candidates.sort((a, b) => b.score - a.score);
    return candidates.length ? candidates[0].value : '';
  }

  async function resolveReverseOrderPrice(fallbackPrice = '', options = {}) {
    if (options.preferFallback && fallbackPrice) {
      return protectSellPrice(fallbackPrice, { applyDiscount: true, buyReferencePrice: fallbackPrice });
    }
    const visiblePrice = getVisibleLimitPriceValue();
    if (visiblePrice) return protectSellPrice(visiblePrice, { applyDiscount: true, buyReferencePrice: fallbackPrice || visiblePrice });
    if (fallbackPrice) return protectSellPrice(fallbackPrice, { applyDiscount: true, buyReferencePrice: fallbackPrice });
    if (volatilityLimitEnabled) {
      try {
        const alphaId = await DataManager.getCurrentAlphaId();
        if (alphaId) {
          const trades = await DataManager.fetchLatestTrades(alphaId, 1);
          if (trades && trades.length > 0) {
            const base = trades[0].price;
            if (!isNaN(base) && base > 0) {
              const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
              const rawPct = Number.isFinite(lastRangePct) ? lastRangePct : volatilityRangeMin;
              const pct = clamp(rawPct, volatilityRangeMin, volatilityRangeMax);
              return protectSellPrice(base * (1 - pct / 100), { applyDiscount: true, buyReferencePrice: base });
            }
          }
        }
      } catch (_) {}
    }
    return '';
  }

  function parseReversePriceValue(text) {
    const n = parseFloat(String(text || '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }

  function parsePriceNumber(text) {
    const n = parseFloat(String(text || '').replace(/,/g, '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : NaN;
  }

  function formatPriceForInput(price, referenceText = '') {
    if (!Number.isFinite(price) || price <= 0) return '';
    const ref = String(referenceText || '');
    const decimalMatch = ref.match(/\.(\d+)/);
    const decimals = decimalMatch ? Math.min(12, Math.max(0, decimalMatch[1].length)) : 12;
    let text = price.toFixed(decimals);
    text = text.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
    return text || String(price);
  }

  function getBuyReferencePrice(fallbackPrice = '') {
    const values = [
      lastBuyReferencePrice,
      lastPlannedBuyPrice,
      parsePriceNumber(fallbackPrice),
      parsePriceNumber(getVisibleLimitPriceValue())
    ];
    for (const value of values) {
      if (Number.isFinite(value) && value > 0) return value;
    }
    return NaN;
  }

  function protectBuyPrice(rawPrice) {
    const price = parsePriceNumber(rawPrice);
    if (!Number.isFinite(price) || price <= 0) return '';
    const premiumPct = Math.max(0, Number(buyPricePremiumPct) || 0);
    const adjusted = price * (1 + premiumPct / 100);
    return formatPriceForInput(adjusted, rawPrice);
  }

  function protectSellPrice(rawPrice, options = {}) {
    const price = parsePriceNumber(rawPrice);
    if (!Number.isFinite(price) || price <= 0) return '';
    const discountPct = Math.max(0, Number(sellPriceDiscountPct) || 0);
    let adjusted = options.applyDiscount === false ? price : price * (1 - discountPct / 100);
    const buyRef = getBuyReferencePrice(options.buyReferencePrice || rawPrice);
    const maxWearPct = Math.max(0, Number(singleTradeMaxWearPct) || 0);
    if (Number.isFinite(buyRef) && buyRef > 0 && maxWearPct > 0) {
      const minAcceptable = buyRef * (1 - maxWearPct / 100);
      if (adjusted < minAcceptable) adjusted = minAcceptable;
    }
    return formatPriceForInput(adjusted, rawPrice);
  }

  function hasMeaningfulReversePrice(text) {
    const n = parseReversePriceValue(text);
    return Number.isFinite(n) && n > 0;
  }

  async function syncReverseOrderPriceInput(fallbackPrice = '', options = {}) {
    if (!reverseOrderEnabled || !volatilityLimitEnabled) return false;
    const value = await resolveReverseOrderPrice(fallbackPrice, options);
    if (!hasMeaningfulReversePrice(value)) return false;
    for (let i = 0; i < 16; i++) {
      const input = findReverseOrderPriceInput();
      if (input) {
        const currentValue = String(input.value || '').trim();
        if (options.onlyIfEmpty && hasMeaningfulReversePrice(currentValue)) {
          return true;
        }
        simulateRealMouseClick(input);
        if (!setNativeInputValue(input, value)) return false;
        await sleep(250);
        return hasMeaningfulReversePrice(input.value);
      }
      await sleep(125);
    }
    return false;
  }

  async function enforceReverseOrder(options = {}) {
    if (!reverseOrderEnabled) return false;
    const checked = await ensureReverseChecked(2000);
    if (!volatilityLimitEnabled) return checked;
    if (!checked && !findReverseOrderPriceInput()) return false;
    return await syncReverseOrderPriceInput(options.fallbackPrice || '', options);
  }

  function scheduleReverseOrderEnforce(maxWaitMs = 12000, intervalMs = 350, options = {}) {
    if (!reverseOrderEnabled) return;
    const startedAt = Date.now();
    let busy = false;
    ResourceManager.cleanup('uiObserver', RESOURCE_IDS.uiReverseObserver);
    const tick = async () => {
      if (!reverseOrderEnabled) return;
      if (busy) {
        setManagedTimeout('uiTimeout', RESOURCE_IDS.uiReverseEnforceRetry, tick, intervalMs);
        return;
      }
      busy = true;
      let ok = false;
      try {
        ok = await enforceReverseOrder(options);
      } catch (_) {
        ok = false;
      } finally {
        busy = false;
      }
      if (ok || Date.now() - startedAt >= maxWaitMs || !reverseOrderEnabled) {
        if (options.onlyIfEmpty) reverseOrderInitialFillDone = true;
        ResourceManager.cleanup('uiObserver', RESOURCE_IDS.uiReverseObserver);
        return;
      }
      setManagedTimeout('uiTimeout', RESOURCE_IDS.uiReverseEnforceRetry, tick, intervalMs);
    };
    try {
      const observer = new MutationObserver(() => {
        if (!reverseOrderEnabled) return;
        setManagedTimeout('uiTimeout', RESOURCE_IDS.uiReverseEnforceRetry, tick, 50);
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-checked', 'class', 'style', 'value'] });
      ResourceManager.register('uiObserver', RESOURCE_IDS.uiReverseObserver, () => {
        try { observer.disconnect(); } catch (_) {}
      });
    } catch (_) {}
    ResourceManager.cleanup('uiTimeout', RESOURCE_IDS.uiReverseEnforceRetry);
    setManagedTimeout('uiTimeout', RESOURCE_IDS.uiReverseEnforceRetry, tick, 150);
  }

  function scheduleReverseOrderInitialFill(maxWaitMs = 15000) {
    if (!reverseOrderEnabled || !reverseOrderInitialFillArmed || reverseOrderInitialFillDone) return;
    reverseOrderInitialFillArmed = false;
    scheduleReverseOrderEnforce(maxWaitMs, 350, { onlyIfEmpty: true });
  }


  const DateUtils = {
    getTodayStart(nowMs) {
    const tzMs = 8 * 60 * 60 * 1000;
    const local8 = new Date(nowMs + tzMs);
    let y = local8.getUTCFullYear();
    let m = local8.getUTCMonth();
    let d = local8.getUTCDate();
    const h = local8.getUTCHours();
    if (h < 8) {
      const prev = new Date(Date.UTC(y, m, d, 0) - 24 * 60 * 60 * 1000);
      y = prev.getUTCFullYear();
      m = prev.getUTCMonth();
      d = prev.getUTCDate();
    }
    return Date.UTC(y, m, d, 0, 0, 0, 0);
    },

    getYesterdayRange(nowMs) {
      const todayStart = this.getTodayStart(nowMs);
      const yStart = todayStart - 24 * 60 * 60 * 1000;
      const yEnd = todayStart;
      return { start: yStart, end: yEnd };
    }
  };

  const NumberUtils = {
    format(value, type) {
      switch(type) {
        case 'volume':
          return value >= 1e9 ? (value/1e9).toFixed(2) + 'B' :
                 value >= 1e6 ? (value/1e6).toFixed(2) + 'M' :
                 value >= 1e3 ? (value/1e3).toFixed(2) + 'K' :
                 value.toFixed(2);
        case 'balance':
          return Number.isFinite(value) ? value.toFixed(2) : '-';
        default:
          return String(value);
      }
    }
  };




  const MultiplierCountdown = {
    timer: null,

    update() {
    if (!multiplierDisplay || !currentMultiplierData) return;

    const { mp, listingTime } = currentMultiplierData;
    if (mp <= 1 || !listingTime) return;

    try {
      const nowMs = Date.now();
      const msPerDay = 24 * 60 * 60 * 1000;
      const remainingMs = Math.max(0, (30 * msPerDay) - (nowMs - listingTime));

      if (remainingMs <= 0) {
        multiplierDisplay.textContent = `交易倍数:${mp}倍 00:00:00`;
        return;
      }

      const totalHours = Math.floor(remainingMs / (60 * 60 * 1000));
      const remainingMinutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
      const remainingSeconds = Math.floor((remainingMs % (60 * 1000)) / 1000);

      const hoursCountdown = `${totalHours.toString().padStart(2, '0')}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
      multiplierDisplay.textContent = `交易倍数:${mp}倍 ${hoursCountdown}`;
    } catch (_) {}
    },

    start() {
      if (this.timer) {
        ResourceManager.cleanup('uiTimer', RESOURCE_IDS.multiplierCountdown);
        this.timer = null;
    }
      this.timer = setManagedInterval('uiTimer', RESOURCE_IDS.multiplierCountdown, () => this.update(), 1000, () => { this.timer = null; });
    },

    stop() {
      ResourceManager.cleanup('uiTimer', RESOURCE_IDS.multiplierCountdown);
      this.timer = null;
    }
  };


  function getAlphaPageContract() {
    try {
      const m = location.pathname.match(/\/alpha\/[^/]+\/([^/?#]+)/i);
      if (m && m[1]) return m[1].toLowerCase();
    } catch (_) {}
    return '';
  }

  function scheduleDailyRefresh() {
    try {
      ResourceManager.cleanup('uiTimer', RESOURCE_IDS.dailyRefresh);
      dailyRefreshTimer = setManagedInterval('uiTimer', RESOURCE_IDS.dailyRefresh, () => {
        UIUpdater.updateDailyVolumeUI();
      }, DAILY_REFRESH_INTERVAL_MS, () => { dailyRefreshTimer = null; });
    } catch (_) {}
  }
  async function resolveAlphaRec(symbolUpper) {
    const cache = await DataManager.fetchAlphaTokenMap();
    if (!cache) return null;
    let rec = null;
    const addr = getAlphaPageContract();
    if (addr && cache.byAddress && cache.byAddress.has(addr)) rec = cache.byAddress.get(addr);
    if (!rec && cache.bySymbol) rec = cache.bySymbol.get(symbolUpper);
    return rec;
  }
  async function initYesterdayVolumeIfNeeded(symbolUpper) {
    try {
      const now = Date.now();
      const yWin = DateUtils.getYesterdayRange(now);
      const rec = await resolveAlphaRec(symbolUpper);
      if (!rec) return;
      if (isNaN(yesterdayVolumeValue) || yesterdayAlphaId !== rec.alphaId || yesterdayWindowStart !== yWin.start) {
        yesterdayAlphaId = rec.alphaId;
        yesterdayWindowStart = yWin.start;
        const yVol = await DataManager.fetchDailyVolume(symbolUpper, yWin.start, yWin.end);
        yesterdayVolumeValue = yVol;
      }
    } catch (e) { }
  }

  async function initTokenIconOnce() {
    try {
      if (tokenIconLoaded || !tokenIconImg) return;
      const cache = await DataManager.fetchAlphaTokenMap();
      if (!cache) return;
      const addr = getAlphaPageContract();
      let rec = null;
      if (addr && cache.byAddress && cache.byAddress.has(addr)) rec = cache.byAddress.get(addr);
      if (!rec) {
        const sym = (currentTokenDisplay && currentTokenDisplay.textContent || '').trim().toUpperCase();
        if (sym && cache.bySymbol && cache.bySymbol.has(sym)) rec = cache.bySymbol.get(sym);
      }
      if (rec && rec.iconUrl) {
        tokenIconImg.src = rec.iconUrl;
        tokenIconImg.onerror = () => { tokenIconImg.style.display = 'none'; };
        tokenIconLoaded = true;

      }
    } catch (e) { }
  }
  function updateBalanceUI() {
    try {
      const fmt = (v) => Number.isFinite(v) ? v.toFixed(2) : '-';
      if (balanceInitSpan) {
        balanceInitSpan.textContent = fmt(balanceInit);
        balanceInitSpan.style.color = Number.isFinite(balanceInit) ? '#ffcc00' : '#CCCCCC';
      }
      if (balanceCurSpan) {
        balanceCurSpan.textContent = fmt(balanceCurrent);
        balanceCurSpan.style.color = Number.isFinite(balanceCurrent) ? '#00ff88' : '#CCCCCC';
      }
      if (balanceWearSpan) {
        // 计算磨损率：磨损的绝对值*10000/总买金额
        let wearRateText = fmt(balanceWear);
        if (Number.isFinite(balanceWear) && Number.isFinite(buyAmount) && buyAmount > 0) {
          const wearRate = Math.abs(balanceWear) * 10000 / buyAmount;
          wearRateText = `${fmt(balanceWear)} / ${wearRate.toFixed(2)}`;
        }

        balanceWearSpan.textContent = wearRateText;
        if (!Number.isFinite(balanceWear)) balanceWearSpan.style.color = '#CCCCCC';
        else balanceWearSpan.style.color = balanceWear > 0 ? '#00ff88' : (balanceWear < 0 ? '#ff6666' : '#CCCCCC');
      }
    } catch (_) {}
  }

  function scheduleBalanceCapture(options = {}, retryCount = 0) {
    try {
      if (balanceSnifferStarted && retryCount < 20) {
        setManagedTimeout('balanceTimeout', RESOURCE_IDS.balanceRetry, () => scheduleBalanceCapture(options, retryCount + 1), 500);
        return;
      }
      BalanceManager.capture(options);
    } catch (_) {}
  }

  function scheduleBalanceCaptureAfterFill(executedTabIndex) {
    const shouldCapture = executedTabIndex === 1 || reverseOrderEnabled;
    if (!shouldCapture) return;
    scheduleBalanceCapture({
      startDelayMs: BALANCE_CAPTURE_AFTER_FILL_DELAY_MS,
      maxWindowMs: BALANCE_CAPTURE_AFTER_FILL_WINDOW_MS
    });
  }

  const BalanceManager = {
    read() {
    try {
      const xpaths = [
        '.text-PrimaryText.text-\\[12px\\].leading-\\[18px\\].font-\\[500\\]'
      ];
      for (const xp of xpaths) {
        let node;
        if (typeof xp === 'string' && (xp.startsWith('/') || xp.startsWith('(') || xp.startsWith('//*[@'))) {
          node = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        } else {
          node = document.querySelector(xp);
        }
        if (!node) continue;
        const t = (node.textContent || '').trim();
        const m = t.replace(/[\s,]/g, '').match(/(-?\d+(?:\.\d+)?)/);
        if (m) {
          const v = parseFloat(m[1]);
          if (Number.isFinite(v)) return v;
        }
      }
    } catch (_) {}
    return NaN;
    },

    commit(val) {
    if (!Number.isFinite(val) || val <= 0) return false;
    try {
      if (!balanceBaselineLocked) {
        balanceInit = val;
        localStorage.setItem('balanceInit', String(balanceInit));
        balanceBaselineLocked = true;
        localStorage.setItem('balanceBaselineLocked', 'true');
      } else {
        balanceCurrent = val;
        localStorage.setItem('balanceCurrent', String(balanceCurrent));
        if (Number.isFinite(balanceInit)) {
          balanceWear = balanceCurrent - balanceInit;
          localStorage.setItem('balanceWear', String(balanceWear));
        }
      }
      updateBalanceUI();
      return true;
    } catch (_) { return false; }
    },

    async capture(options = {}) {
    if (balanceSnifferStarted) return false;
    balanceSnifferStarted = true;
      const startDelayMs = typeof options.startDelayMs === 'number' ? options.startDelayMs : 1500;
      const maxWindowMs = typeof options.maxWindowMs === 'number' ? options.maxWindowMs : 15000;
    const pollIntervalMs = 300;
    let observer = null;
    try {
    try { if (startDelayMs > 0) await sleep(startDelayMs); } catch (_) {}

      const readDomBalance = () => {
      try {
        const quickValue = this.read();
        if (Number.isFinite(quickValue) && quickValue > 0) return quickValue;
        const xpaths = [
          '/html/body/div[4]/div[2]/div[7]/div/div[2]/div[3]/div[5]/div[1]/div[1]/div/div/div[2]/div',
          '/html/body/div[5]/div[2]/div[7]/div/div[2]/div[3]/div[5]/div[1]/div[1]/div/div/div[2]/div',
          '//*[@id="__APP"]/div[2]/div[7]/div/div[2]/div[3]/div[6]/div[1]/div[1]/div/div/div[2]/div/text()[1]',
          '/html/body/div[4]/div/div[3]/div/div[9]/div/div/div/div/div[3]/div[6]/div[1]/div[1]/div/div/div[2]/div/text()[1]',
          '/*[@id="__APP"]/div/div[3]/div/div[9]/div/div/div/div/div[3]/div[6]/div[1]/div[1]/div/div/div[2]/div/text()[1]'
        ];
        for (const xp of xpaths) {
          const node = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
          if (!node) continue;
          const t = (node.textContent || '').trim();
          const m = t.replace(/[\s,]/g, '').match(/(-?\d+(?:\.\d+)?)/);
          if (m) {
            const v = parseFloat(m[1]);
            if (Number.isFinite(v)) return v;
          }
        }
      } catch (_) {}
      return NaN;
      };

      if (this.commit(readDomBalance())) return true;
    let done = false;
    const deadline = Date.now() + maxWindowMs;
    try {
      observer = new MutationObserver(() => {
        if (done) return;
        const v = readDomBalance();
          if (this.commit(v)) { done = true; try { observer.disconnect(); } catch (_) {} }
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (_) {}
    while (!done && Date.now() < deadline) {
      const v = readDomBalance();
        if (this.commit(v)) { done = true; break; }
      await sleep(pollIntervalMs);
    }
    return done;
    } finally {
    try { observer && observer.disconnect(); } catch (_) {}
      balanceSnifferStarted = false;
      updateBalanceUI();
    }
    },

    update() {
      updateBalanceUI();
  }
  };
  function startRealtimeStatsBackfill() {
    if (realtimeStatsBackfillTimer || !realtimeStatsEnabled) return;
    realtimeStatsBackfillTimer = setManagedInterval('realtimeStatsTimer', RESOURCE_IDS.realtimeStatsBackfill, () => {
      if (!shouldRunRealtimeStatsBackfill()) return;
      processRealtimeStats({ skipDuringTrade: true }).catch(() => {});
    }, REALTIME_STATS_BACKFILL_INTERVAL_MS, () => {
      realtimeStatsBackfillTimer = null;
    });
  }

  function shouldRunRealtimeStatsBackfill() {
    if (!running || !realtimeStatsEnabled || inTradeFlow || realtimeStatsScanInFlight || isTargetTotalReached()) return false;
    if (buyStatsNeedsFinalScan) return true;
    return !!lastBuyOrderSubmittedAt && Date.now() - lastBuyOrderSubmittedAt <= BUY_STATS_FOLLOWUP_DURATION_MS;
  }

  function startBuyStatsFollowup(durationMs = BUY_STATS_FOLLOWUP_DURATION_MS) {
    if (!running || !realtimeStatsEnabled || !realtimeStatsStartTime || isTargetTotalReached()) return;
    lastBuyOrderSubmittedAt = Date.now();
    buyStatsFollowupUntilMs = Math.max(buyStatsFollowupUntilMs || 0, Date.now() + Math.max(durationMs, BUY_STATS_FOLLOWUP_INTERVAL_MS));
    if (buyStatsFollowupTimer) return;
    buyStatsFollowupTimer = setManagedInterval('buyStatsFollowupTimer', RESOURCE_IDS.buyStatsFollowup, () => {
      if (!running || !realtimeStatsEnabled || !realtimeStatsStartTime || isTargetTotalReached() || Date.now() > buyStatsFollowupUntilMs) {
        stopBuyStatsFollowup();
        return;
      }
      if (inTradeFlow || realtimeStatsScanInFlight) return;
      processRealtimeStats({ force: true, fast: true }).catch(() => {});
    }, BUY_STATS_FOLLOWUP_INTERVAL_MS, () => {
      buyStatsFollowupTimer = null;
    });
    setManagedTimeout('buyStatsFollowupTimer', RESOURCE_IDS.buyStatsFollowupKick, () => {
      if (!running || !realtimeStatsEnabled || isTargetTotalReached() || inTradeFlow || realtimeStatsScanInFlight) return;
      processRealtimeStats({ force: true, fast: true }).catch(() => {});
    }, BUY_STATS_FOLLOWUP_KICK_MS);
  }

  function stopBuyStatsFollowup() {
    ResourceManager.cleanup('buyStatsFollowupTimer', RESOURCE_IDS.buyStatsFollowup);
    ResourceManager.cleanup('buyStatsFollowupTimer', RESOURCE_IDS.buyStatsFollowupKick);
    buyStatsFollowupTimer = null;
    buyStatsFollowupUntilMs = 0;
  }

  function cancelRealtimeStatsScans() {
    realtimeStatsScanGeneration++;
    realtimeStatsScanInFlight = false;
  }

  function clearPendingBuyStatsScan() {
    buyStatsNeedsFinalScan = false;
    lastBuyOrderSubmittedAt = 0;
    stopBuyStatsFollowup();
    stopFinalBuyStatsScan();
    cancelRealtimeStatsScans();
  }

  function getStopFinalBuyScanDurationMs() {
    const waitMs = Math.max(1, Number(buyOrderWaitSec) || DEFAULT_BUY_ORDER_WAIT_SEC) * 1000;
    return Math.min(STOP_FINAL_BUY_SCAN_MAX_DURATION_MS, Math.max(STOP_FINAL_BUY_SCAN_MIN_DURATION_MS, waitMs + 15000));
  }

  function stopFinalBuyStatsScan() {
    ResourceManager.cleanup('buyStatsFinalScanTimer', RESOURCE_IDS.buyStatsFinalScan);
    ResourceManager.cleanup('buyStatsFinalScanTimer', RESOURCE_IDS.buyStatsFinalScanKick);
    buyStatsFinalScanTimer = null;
    buyStatsFinalScanUntilMs = 0;
  }

  function scheduleFinalBuyStatsScanOnStop() {
    if (!realtimeStatsEnabled || !realtimeStatsStartTime || !buyStatsNeedsFinalScan) return;
    stopFinalBuyStatsScan();
    buyStatsFinalScanUntilMs = Date.now() + getStopFinalBuyScanDurationMs();
    const tick = async () => {
      if (!realtimeStatsEnabled || !buyStatsNeedsFinalScan || !realtimeStatsStartTime) {
        stopFinalBuyStatsScan();
        return;
      }
      if (running) {
        stopFinalBuyStatsScan();
        return;
      }
      if (Date.now() > buyStatsFinalScanUntilMs) {
        buyStatsNeedsFinalScan = false;
        stopFinalBuyStatsScan();
        return;
      }
      if (inTradeFlow || realtimeStatsScanInFlight) return;
      const stats = await processRealtimeStats({ force: true, allowStopped: true, fast: true, minTimeMs: lastBuyOrderSubmittedAt });
      if (stats && stats.terminalBuyCount > 0) {
        buyStatsNeedsFinalScan = false;
        stopFinalBuyStatsScan();
        return;
      }
      if (stats && stats.count > 0) {
        buyStatsNeedsFinalScan = false;
        stopFinalBuyStatsScan();
      }
    };
    buyStatsFinalScanTimer = setManagedInterval('buyStatsFinalScanTimer', RESOURCE_IDS.buyStatsFinalScan, () => {
      tick().catch(() => {});
    }, STOP_FINAL_BUY_SCAN_INTERVAL_MS, () => {
      buyStatsFinalScanTimer = null;
    });
    setManagedTimeout('buyStatsFinalScanTimer', RESOURCE_IDS.buyStatsFinalScanKick, () => {
      tick().catch(() => {});
    }, STOP_FINAL_BUY_SCAN_KICK_MS);
  }

  function stopRealtimeStatsBackfill() {
    ResourceManager.cleanup('realtimeStatsTimer', RESOURCE_IDS.realtimeStatsBackfill);
    realtimeStatsBackfillTimer = null;
  }

  async function processRealtimeStats(options = {}) {
    if (!realtimeStatsEnabled || (!running && !options.allowStopped)) return { total: 0, count: 0 };
    if (options.skipDuringTrade && inTradeFlow && !options.allowDuringTrade) return { total: 0, count: 0 };
    const scanGeneration = realtimeStatsScanGeneration;
    const isScanActive = () => scanGeneration === realtimeStatsScanGeneration && (running || options.allowStopped);
    if (realtimeStatsScanInFlight) {
      if (!options.force) return { total: 0, count: 0 };
      const waitUntil = Date.now() + 2500;
      while (realtimeStatsScanInFlight && Date.now() < waitUntil) {
        await sleep(100);
        if (!isScanActive()) return { total: 0, count: 0 };
      }
      if (realtimeStatsScanInFlight) return { total: 0, count: 0 };
    }
    if (!isScanActive()) return { total: 0, count: 0 };
    realtimeStatsScanInFlight = true;
    let switchedToHistory = false;
    try {
      const historyBtn = await clickHistoryOrdersButton();
      if (!isScanActive()) return { total: 0, count: 0 };
      if (!historyBtn) {

        return { total: 0, count: 0 };
      }
      switchedToHistory = true;
      await sleep(300);
      if (!isScanActive()) return { total: 0, count: 0 };
      await clickHistoryLimitOrdersButton();
      if ((!running && !options.allowStopped) || !realtimeStatsEnabled) return { total: 0, count: 0 };
      let stats = { total: 0, count: 0 };
      const delays = options.fast ? STATS_SCAN_FAST_DELAYS_MS : STATS_SCAN_NORMAL_DELAYS_MS;
      for (let attempt = 0; attempt < delays.length; attempt++) {
        await sleep(delays[attempt]);
        if (!isScanActive()) break;
        if (!running && !options.allowStopped) break;
        stats = await parseHistoryOrders({ allowStopped: !!options.allowStopped, minTimeMs: options.minTimeMs || 0 });
        if (stats && stats.count > 0) break;
      }
      if (stats && stats.count > 0) {
        stopIfTargetTotalReached();
      }
      return stats || { total: 0, count: 0 };
    } catch (e) {

      return { total: 0, count: 0 };
    } finally {
      try {
        if (switchedToHistory && (running || options.allowStopped || scanGeneration !== realtimeStatsScanGeneration)) await clickCurrentOrdersButton();
      } catch (_) {}
      if (scanGeneration === realtimeStatsScanGeneration) realtimeStatsScanInFlight = false;
    }
  }
  async function clickHistoryOrdersButton() {
    const selectors = [
      '//*[@id="bn-tab-orderHistory"]/div',
      '/html/body/div[4]/div[2]/div[6]/div/div/div[1]/div[2]/div',
      '//*[contains(text(), "历史委托")]',
      '//*[contains(text(), "历史订单")]',
      '//*[contains(text(), "订单历史")]',
      '//*[contains(text(), "成交历史")]',
      '//*[contains(text(), "历史成交")]',
      '//*[contains(text(), "Order History")]',
      '//*[contains(text(), "Trade History")]',
      '//button[contains(text(), "历史委托")]',
      '//button[contains(text(), "历史订单")]',
      '//button[contains(text(), "订单历史")]',
      '//button[contains(text(), "成交历史")]',
      '//button[contains(text(), "历史成交")]',
      '//button[contains(text(), "Order History")]',
      '//button[contains(text(), "Trade History")]'
    ];
    for (const selector of selectors) {
      try {
        const element = $xpath(selector);
        if (element && isNodeVisible(element)) {
          simulateRealMouseClick(element);

          return element;
        }
      } catch (_) {}
    }
    return null;
  }
  async function clickHistoryLimitOrdersButton() {
    const exactTexts = ['限价', 'Limit'];
    const candidates = [];
    const seen = new Set();
    const pushCandidate = (node) => {
      if (!(node instanceof Element) || seen.has(node)) return;
      seen.add(node);
      if (!isNodeVisible(node)) return;
      if (node.closest && node.closest('#alpha-extension-engine-container')) return;
      if (node.closest && node.closest('tbody, tr, [role="row"], [role="gridcell"], td')) return;
      const text = normalizeOrderText(node.textContent);
      if (!exactTexts.some(item => text === normalizeOrderText(item))) return;
      const clickable = node.closest('button, [role="tab"], [role="button"], [aria-selected], [data-bn-type]') || node;
      if (!(clickable instanceof Element) || !isNodeVisible(clickable)) return;
      if (clickable.closest && clickable.closest('tbody, tr, [role="row"], [role="gridcell"], td')) return;
      candidates.push(clickable);
    };
    for (const text of exactTexts) {
      try {
        const snap = document.evaluate(`//*[normalize-space(text())="${text}"]`, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < snap.snapshotLength; i++) pushCandidate(snap.snapshotItem(i));
      } catch (_) {}
    }
    try {
      Array.from(document.querySelectorAll('button, [role="tab"], [role="button"], [aria-selected], div, span')).forEach(pushCandidate);
    } catch (_) {}
    const scored = candidates.map(el => {
      const rect = el.getBoundingClientRect();
      const meta = [
        el.getAttribute('aria-selected'),
        el.getAttribute('aria-current'),
        el.className,
        el.parentElement && el.parentElement.className
      ].filter(Boolean).join(' ');
      let score = 0;
      if (/true|active|selected|current/i.test(meta)) score += 6;
      if (el.matches && el.matches('button, [role="tab"], [role="button"], [aria-selected]')) score += 4;
      if (rect.top < window.innerHeight * 0.6) score += 2;
      return { el, score };
    }).sort((a, b) => b.score - a.score || a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top);
    if (scored.length) {
      simulateRealMouseClick(scored[0].el);
      return scored[0].el;
    }
    return null;
  }
  async function clickCurrentOrdersButton() {
    const selectors = [
      '//*[@id="bn-tab-orderOrder"]/div',
      '/html/body/div[4]/div[2]/div[6]/div/div/div[1]/div[1]/div',
      '//*[contains(text(), "当前委托")]',
      '//*[contains(text(), "当前订单")]',
      '//*[contains(text(), "当前挂单")]',
      '//*[contains(text(), "开放订单")]',
      '//*[contains(text(), "Open Orders")]',
      '//*[contains(text(), "Current Orders")]',
      '//button[contains(text(), "当前委托")]',
      '//button[contains(text(), "当前订单")]',
      '//button[contains(text(), "当前挂单")]',
      '//button[contains(text(), "开放订单")]',
      '//button[contains(text(), "Open Orders")]',
      '//button[contains(text(), "Current Orders")]'
    ];
    for (const selector of selectors) {
      try {
        const element = $xpath(selector);
        if (element && isNodeVisible(element)) {
          simulateRealMouseClick(element);

          return element;
        }
      } catch (_) {}
    }
    return null;
  }

  async function hasOpenCurrentOrdersForCurrentToken() {
    try {
      await clickCurrentOrdersButton();
      await sleep(450);
      const currentToken = (currentTokenDisplay && currentTokenDisplay.textContent || '').trim();
      const selector = '[role="grid"], table, [class*="bn-web-table"], [class*="bn-table"], [class*="table"], [class*="Table"]';
      const tables = Array.from(document.querySelectorAll(selector))
        .filter(table => table instanceof Element && isNodeVisible(table) && !(table.closest && table.closest('#alpha-extension-engine-container')));
      for (const table of tables) {
        const rows = getHistoryOrderRows(table);
        for (const row of rows) {
          const text = readableOrderText(row);
          if (!text || /暂无|无记录|没有记录|No records|No data/i.test(text)) continue;
          if (row.querySelector('[role="columnheader"], th')) continue;
          if (currentToken && !tokenMatchesOrderCell(text, currentToken)) continue;
          if (/(已成交|全部成交|已取消|已撤销|取消|撤单|拒绝|失败|过期|Filled|Completed|Cancelled|Canceled|Rejected|Failed|Expired)/i.test(text)) continue;
          if (/(新订单|当前委托|委托中|挂单|未成交|处理中|排队|等待|Open|Pending|New|Submitted|Created|PartiallyFilled|Partial|Buy|Sell|Limit)/i.test(text)) {
            return true;
          }
          const cells = getOrderCells(row);
          if (cells.length >= 4) return true;
        }
      }
    } catch (_) {}
    return false;
  }

  async function guardBeforeNewBuy(sessionToken) {
    if (!running || sessionToken !== opToken || currentTabIndex !== 0 || inTradeFlow) return false;
    const hasOpenOrder = await hasOpenCurrentOrdersForCurrentToken();
    if (hasOpenOrder) {
      pauseTradingForProtection('open order exists before new buy');
      return true;
    }
    return false;
  }

  function parseTradeTimeMs(timeText) {
    try {
      const isoMatch = timeText.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (isoMatch) {
        const [, year, month, day, hour, minute, second] = isoMatch;
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day),
                            parseInt(hour), parseInt(minute), parseInt(second));
        return date.getTime();
      }
      const shortMatch = timeText.match(/(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (shortMatch) {
        const [, month, day, hour, minute, second] = shortMatch;
        const currentYear = new Date().getFullYear();
        const date = new Date(currentYear, parseInt(month) - 1, parseInt(day),
                            parseInt(hour), parseInt(minute), parseInt(second));
        return date.getTime();
      }
      const timeOnlyMatch = timeText.match(/(\d{2}):(\d{2}):(\d{2})/);
      if (timeOnlyMatch) {
        const [, hour, minute, second] = timeOnlyMatch;
        const now = new Date();
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                            parseInt(hour), parseInt(minute), parseInt(second));
        return date.getTime();
      }
    } catch (e) {
    }
    return NaN;
  }

  function isValidTradeTime(timeText) {
    if (!realtimeStatsStartTime || realtimeStatsStartTime <= 0) return false;
    try {
      const tradeTime = parseTradeTimeMs(timeText);
      if (!Number.isFinite(tradeTime)) return false;
      const isValid = tradeTime >= realtimeStatsStartTime;

      return isValid;
    } catch (e) {

      return false;
    }
  }
  function normalizeOrderText(text) {
    return String(text || '').replace(/\s+/g, '').trim();
  }

  function readableOrderText(node) {
    return (node && node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function parseOrderAmountValue(text, options = {}) {
    const source = String(text || '').replace(/,/g, '');
    const matches = source.match(/(?:\d+\.\d+|\d+|\.\d+)/g);
    if (!matches || !matches.length) return NaN;
    const values = matches.map(v => parseFloat(v)).filter(v => Number.isFinite(v));
    if (!values.length) return NaN;
    if (options.preferFilledPart && values.length >= 2) {
      const compact = normalizeOrderText(source);
      if (/\/|／|成交|已成交|filled|executed/i.test(compact)) return values[0];
    }
    return values[values.length - 1];
  }

  function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getOrderCellIndex(cell, fallbackIndex) {
    const raw = cell && cell.getAttribute ? cell.getAttribute('aria-colindex') : '';
    const parsed = parseInt(raw || '', 10);
    return Number.isFinite(parsed) ? parsed : fallbackIndex;
  }

  function getOrderCells(row) {
    if (!row) return [];
    let cells = [];
    try {
      cells = Array.from(row.querySelectorAll(':scope > [aria-colindex], :scope > td, :scope > th, :scope > [role="gridcell"], :scope > [role="cell"]'));
    } catch (_) {}
    if (!cells.length) {
      cells = Array.from(row.querySelectorAll('[aria-colindex], td, th, [role="gridcell"], [role="cell"]'));
    }
    const seen = new Set();
    return cells.filter(cell => {
      if (!(cell instanceof Element)) return false;
      if (seen.has(cell)) return false;
      seen.add(cell);
      return isNodeVisible(cell) && readableOrderText(cell);
    }).sort((a, b) => {
      const ai = getOrderCellIndex(a, Number.MAX_SAFE_INTEGER);
      const bi = getOrderCellIndex(b, Number.MAX_SAFE_INTEGER);
      if (ai !== bi) return ai - bi;
      return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
    });
  }

  function getOrderCell(row, cells, index) {
    if (!index) return null;
    try {
      const direct = row.querySelector(`[aria-colindex="${index}"]`);
      if (direct && isNodeVisible(direct)) return direct;
    } catch (_) {}
    return cells.find((cell, idx) => getOrderCellIndex(cell, idx + 1) === index) || cells[index - 1] || null;
  }

  function buildOrderHeaderMap(table) {
    const map = {};
    const addHeaders = (headers) => {
      headers.forEach((cell, idx) => {
        if (!(cell instanceof Element) || !isNodeVisible(cell)) return;
        const text = normalizeOrderText(cell.textContent);
        if (!text) return;
        const index = getOrderCellIndex(cell, idx + 1);
        if (index) map[index] = text;
      });
    };
    try {
      addHeaders(Array.from(table.querySelectorAll('[role="columnheader"], thead th, thead [aria-colindex], [aria-rowindex="1"] [aria-colindex]')));
    } catch (_) {}
    if (!Object.keys(map).length) {
      try {
        addHeaders(Array.from(document.querySelectorAll('[role="columnheader"]')));
      } catch (_) {}
    }
    return map;
  }

  function findOrderColumnIndex(headerMap, includes, excludes = []) {
    const inc = includes.map(v => normalizeOrderText(v).toLowerCase()).filter(Boolean);
    const exc = excludes.map(v => normalizeOrderText(v).toLowerCase()).filter(Boolean);
    for (const [index, header] of Object.entries(headerMap)) {
      const text = String(header || '').toLowerCase();
      if (exc.some(word => text.includes(word))) continue;
      if (inc.some(word => text.includes(word))) return parseInt(index, 10);
    }
    return 0;
  }

  function getHistoryOrderRows(table) {
    const selectors = [
      '[role="row"][aria-rowindex]',
      '[data-row-key]',
      'tbody tr',
      'tr',
      '[class*="row"][aria-rowindex]'
    ];
    const rows = [];
    const seen = new Set();
    for (const selector of selectors) {
      try {
        for (const row of Array.from(table.querySelectorAll(selector))) {
          if (!(row instanceof Element) || seen.has(row)) continue;
          seen.add(row);
          if (!isNodeVisible(row)) continue;
          if (row.closest && row.closest('#alpha-extension-engine-container')) continue;
          const cells = getOrderCells(row);
          if (cells.length < 4) continue;
          const text = readableOrderText(row);
          if (!text) continue;
          if (row.querySelector('[role="columnheader"], th') && !/(买入|卖出|Buy|Sell)/i.test(text)) continue;
          rows.push(row);
        }
      } catch (_) {}
    }
    return rows.sort((a, b) => {
      const ai = parseInt(a.getAttribute('aria-rowindex') || '0', 10);
      const bi = parseInt(b.getAttribute('aria-rowindex') || '0', 10);
      if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
      return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
    });
  }

  function scoreHistoryOrderTable(table, currentToken) {
    if (!(table instanceof Element) || !isNodeVisible(table)) return -100;
    if (table.closest && table.closest('#alpha-extension-engine-container')) return -100;
    const text = readableOrderText(table);
    const headerMap = buildOrderHeaderMap(table);
    const rows = getHistoryOrderRows(table);
    let score = Math.min(rows.length, 12);
    if (/(买入|卖出|Buy|Sell)/i.test(text)) score += 4;
    if (/(已成交|全部成交|Filled|Completed|状态|Status)/i.test(text)) score += 3;
    if (/(历史|订单|委托|Order|Trade)/i.test(text)) score += 2;
    if (currentToken && text.toUpperCase().includes(currentToken.toUpperCase())) score += 4;
    if (findOrderColumnIndex(headerMap, FILLED_AMOUNT_HEADERS, AMOUNT_COLUMN_EXCLUDES)) score += 5;
    else if (findOrderColumnIndex(headerMap, ORDER_AMOUNT_FALLBACK_HEADERS, AMOUNT_COLUMN_EXCLUDES)) score += 2;
    if (findOrderColumnIndex(headerMap, ['状态', 'Status'])) score += 2;
    return score;
  }

  function findHistoryOrdersTable(currentToken) {
    const candidates = [];
    const seen = new Set();
    const selector = '[role="grid"], table, [class*="bn-web-table"], [class*="bn-table"], [class*="table"], [class*="Table"]';
    try {
      for (const table of Array.from(document.querySelectorAll(selector))) {
        if (!(table instanceof Element) || seen.has(table)) continue;
        seen.add(table);
        candidates.push(table);
      }
    } catch (_) {}
    let best = null;
    let bestScore = -100;
    for (const table of candidates) {
      const score = scoreHistoryOrderTable(table, currentToken);
      if (score > bestScore) {
        bestScore = score;
        best = table;
      }
    }
    return bestScore > 0 ? best : null;
  }

  function getOrderRowKey(row, cells) {
    const directKey = row.getAttribute('data-row-key') || row.getAttribute('data-key') || row.getAttribute('id');
    if (directKey) return directKey;
    return cells.map(cell => normalizeOrderText(cell.textContent)).join('|').slice(0, 240);
  }

  function tokenMatchesOrderCell(tokenText, currentToken) {
    const token = String(currentToken || '').trim().toUpperCase();
    if (!token) return false;
    const text = String(tokenText || '').toUpperCase();
    const compact = text.replace(/\s+/g, '');
    if (compact === token) return true;
    if (compact.includes(`${token}USDT`) || compact.includes(`${token}/USDT`) || compact.includes(`${token}-USDT`)) return true;
    return new RegExp(`(^|[^A-Z0-9])${escapeRegExp(token)}([^A-Z0-9]|$)`).test(text);
  }

  function findOrderTimeText(row, cells, timeIndex) {
    const timeCell = getOrderCell(row, cells, timeIndex);
    if (timeCell && /\d{2}:\d{2}/.test(timeCell.textContent || '')) return readableOrderText(timeCell);
    const cell = cells.find(item => /\d{2}:\d{2}(?::\d{2})?/.test(item.textContent || ''));
    return cell ? readableOrderText(cell) : '';
  }

  function findOrderTokenText(row, cells, tokenIndex, currentToken) {
    const tokenCell = getOrderCell(row, cells, tokenIndex);
    if (tokenCell && tokenMatchesOrderCell(tokenCell.textContent, currentToken)) return readableOrderText(tokenCell);
    const cell = cells.find(item => tokenMatchesOrderCell(item.textContent, currentToken));
    if (cell) return readableOrderText(cell);
    return tokenMatchesOrderCell(row.textContent, currentToken) ? readableOrderText(row) : '';
  }

  function getOrderSide(row, cells, sideIndex, typeIndex) {
    const indexes = [sideIndex, typeIndex, 4, 3, 5].filter(Boolean);
    const texts = [];
    for (const index of indexes) {
      const cell = getOrderCell(row, cells, index);
      if (cell) texts.push(readableOrderText(cell));
    }
    texts.push(readableOrderText(row));
    for (const text of texts) {
      const isBuy = /(买入|买|Buy)/i.test(text);
      const isSell = /(卖出|卖|Sell)/i.test(text);
      if (isBuy !== isSell) return { isBuy, isSell };
    }
    return { isBuy: false, isSell: false };
  }

  function isSuccessfulOrderStatus(statusText, rowText = '') {
    const text = normalizeOrderText(statusText);
    const fullText = normalizeOrderText(`${statusText || ''} ${rowText || ''}`);
    if (!fullText) return false;
    if (/(新订单|当前委托|委托中|委托订单|挂单|未成交|处理中|排队|等待|已取消|已撤销|撤单|取消|拒绝|失败|过期|Pending|Open|New|Submitted|Created|Cancelled|Canceled|Rejected|Failed|Expired|部分成交|PartiallyFilled|Partial)/i.test(fullText)) return false;
    return /(已成交|完全成交|全部成交|成交成功|Filled|Completed|Executed)/i.test(text || fullText)
      || /(已成交|完全成交|全部成交|成交成功|Filled|Completed|Executed)/i.test(fullText);
  }

  function isTerminalFailedOrderStatus(statusText, rowText = '') {
    const fullText = normalizeOrderText(`${statusText || ''} ${rowText || ''}`);
    if (!fullText) return false;
    return /(已取消|已撤销|撤单|取消|拒绝|失败|过期|Cancelled|Canceled|Rejected|Failed|Expired)/i.test(fullText);
  }

  function pickOrderAmount(row, cells, amountIndex, statusIndex, fallbackAmountIndex) {
    const tried = new Set();
    const tryIndex = (index, preferFilledPart = false) => {
      if (!index || tried.has(index)) return NaN;
      tried.add(index);
      if (statusIndex && index === statusIndex && index !== amountIndex) return NaN;
      const cell = getOrderCell(row, cells, index);
      if (!cell) return NaN;
      const text = readableOrderText(cell);
      if (/(已取消|取消|撤单|拒绝|失败|过期|Cancelled|Canceled|Rejected|Failed|Expired)/i.test(text)) return NaN;
      if (/(Status|状态|买入|卖出|Buy|Sell)/i.test(text) && !/(?:\d+\.\d+|\d+|\.\d+)/.test(text)) return NaN;
      return parseOrderAmountValue(text, { preferFilledPart });
    };
    const preferred = [amountIndex, 9, 8, 7, 6].filter(Boolean);
    for (const index of preferred) {
      const value = tryIndex(index, true);
      if (Number.isFinite(value) && value > 0) return value;
    }
    const fallbackValue = tryIndex(fallbackAmountIndex, true);
    if (Number.isFinite(fallbackValue) && fallbackValue > 0) return fallbackValue;
    const usdtCell = cells.find(cell => /USDT|USD/i.test(cell.textContent || '') && Number.isFinite(parseOrderAmountValue(cell.textContent, { preferFilledPart: true })));
    if (usdtCell) {
      const value = parseOrderAmountValue(usdtCell.textContent, { preferFilledPart: true });
      if (Number.isFinite(value) && value > 0) return value;
    }
    return NaN;
  }

  async function parseHistoryOrders(options = {}) {
    const activeToken = (currentTokenDisplay && currentTokenDisplay.textContent || '').trim();
    if (!activeToken) {

      return { total: 0, count: 0 };
    }
    let totalAmount = 0;
    let newCount = 0;
    let terminalBuyCount = 0;
    const table = findHistoryOrdersTable(activeToken);
    if (!table) {

      return { total: 0, count: 0 };
    }
    const headerMap = buildOrderHeaderMap(table);
    const timeIndex = findOrderColumnIndex(headerMap, ['时间', '日期', 'Time', 'Date']) || 1;
    const tokenIndex = findOrderColumnIndex(headerMap, ['交易对', '币种', '代币', 'Pair', 'Symbol', 'Token']) || 2;
    const sideIndex = findOrderColumnIndex(headerMap, ['方向', '买卖', '买/卖', 'Side']);
    const typeIndex = findOrderColumnIndex(headerMap, ['类型', '订单类型', 'Type'], ['状态', 'Status']);
    const statusIndex = findOrderColumnIndex(headerMap, ['状态', 'Status']) || 13;
    const amountIndex = findOrderColumnIndex(headerMap, FILLED_AMOUNT_HEADERS, AMOUNT_COLUMN_EXCLUDES) || 9;
    const fallbackAmountIndex = findOrderColumnIndex(headerMap, ORDER_AMOUNT_FALLBACK_HEADERS, AMOUNT_COLUMN_EXCLUDES);
    const rows = getHistoryOrderRows(table);
    for (const row of rows) {
      try {
        if (!running && !options.allowStopped) break;
        const cells = getOrderCells(row);
        if (cells.length < 4) continue;
        const rowText = readableOrderText(row);
        if (/(新订单|当前委托|委托中|挂单|未成交|处理中|Pending|Open|New|Submitted|Created|部分成交|PartiallyFilled|Partial)/i.test(rowText)) continue;
        const rowKey = getOrderRowKey(row, cells);
        if (!rowKey) continue;
        const historyRecordKey = getFilledBuyRecordKey(activeToken, 'history', rowKey);
        const existingRecordedOrder = filledBuyOrderRecords.get(historyRecordKey);
        if (realtimeStatsRecordedKeys.has(historyRecordKey) && !existingRecordedOrder) continue;
        const timeText = findOrderTimeText(row, cells, timeIndex);
        if (!isValidTradeTime(timeText)) {

          continue;
        }
        const tradeTimeMs = parseTradeTimeMs(timeText);
        if (options.minTimeMs && (!Number.isFinite(tradeTimeMs) || tradeTimeMs < options.minTimeMs - 15000)) continue;
        const tokenText = findOrderTokenText(row, cells, tokenIndex, activeToken);
        if (!tokenText) continue;
        const { isBuy, isSell } = getOrderSide(row, cells, sideIndex, typeIndex);
        if (!isBuy || isSell) continue;
        const statusCell = getOrderCell(row, cells, statusIndex);
        const statusText = statusCell ? readableOrderText(statusCell) : '';
        if (isTerminalFailedOrderStatus(statusText, rowText)) {
          terminalBuyCount++;
          continue;
        }
        if (!isSuccessfulOrderStatus(statusText, rowText)) continue;
        const amount = pickOrderAmount(row, cells, amountIndex, statusIndex, fallbackAmountIndex);
        if (isNaN(amount) || amount <= 0) continue;
        if (!recordFilledBuyAmount(activeToken, amount, 'history', rowKey, tradeTimeMs)) continue;
        newCount++;
        totalAmount += amount;
        if (!running && !options.allowStopped) break;
      } catch (e) {

      }
    }
    if (newCount > 0) {

    }
    return { total: totalAmount, count: newCount, terminalBuyCount };
  }
  async function waitForStabilityIfNeeded(sessionToken) {
    try {
      if (!volatilityPauseEnabled) return true;
      if (!stableDetectEnabled) return true;
      const requireMs = Math.max(1, Math.floor(volatilityPauseSec)) * 1000;
      const startedAt = Date.now();
      const poll = 250;
      while (running && sessionToken === opToken) {
        if (stableStateIsStable && stableSinceMs > 0) {
          const elapsed = Date.now() - stableSinceMs;
          if (elapsed >= requireMs) return true;

        } else {

        }
        if (Date.now() - startedAt >= STABILITY_WAIT_TIMEOUT_MS) return false;
        await sleep(poll);
      }
    } catch (e) { }
    return false;
  }

  function isStabilityReadyForSubmit() {
    if (uptrendOrderEnabled) return uptrendConsecCount >= uptrendRequiredCount;
    if (!volatilityPauseEnabled || !stableDetectEnabled) return true;
    if (!stableStateIsStable || stableSinceMs <= 0) return false;
    const requireMs = Math.max(1, Math.floor(volatilityPauseSec)) * 1000;
    return Date.now() - stableSinceMs >= requireMs;
  }

  async function waitForUptrendIfNeeded(sessionToken) {
    try {
      if (!uptrendOrderEnabled) return true;
      const poll = 250;
      while (running && sessionToken === opToken) {
        if (uptrendConsecCount >= uptrendRequiredCount) return true;

        await sleep(poll);
      }
    } catch (e) { }
    return false;
  }

  function getFilledBuyFingerprint(token, amount, timeMs) {
    const value = Number(amount);
    if (!token || !Number.isFinite(value) || !Number.isFinite(timeMs)) return '';
    return `filled-buy:${token}:${Math.floor(timeMs / 1000)}:${value.toFixed(8)}`;
  }

  function isSameFilledBuyAmount(a, b) {
    const av = Number(a);
    const bv = Number(b);
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return false;
    return Math.abs(av - bv) <= Math.max(0.000001, Math.abs(av) * 0.0000001);
  }

  function hasRecentFilledBuyDuplicate(token, amount, timeMs) {
    const t = Number.isFinite(timeMs) ? timeMs : Date.now();
    const cutoff = t - 5 * 60 * 1000;
    filledBuyRecentRecords = filledBuyRecentRecords.filter(item => item && item.timeMs >= cutoff);
    return filledBuyRecentRecords.some(item =>
      item.token === token &&
      isSameFilledBuyAmount(item.amount, amount) &&
      Math.abs(item.timeMs - t) <= 5000
    );
  }

  function getImmediateBuyHistoryMatchWindowMs() {
    const buyWaitMs = Math.max(1, Number(buyOrderWaitSec) || DEFAULT_BUY_ORDER_WAIT_SEC) * 1000;
    return Math.min(
      IMMEDIATE_BUY_HISTORY_MATCH_MAX_WINDOW_MS,
      Math.max(IMMEDIATE_BUY_HISTORY_MATCH_MIN_WINDOW_MS, buyWaitMs + IMMEDIATE_BUY_HISTORY_MATCH_BUFFER_MS)
    );
  }

  function findRecentImmediateBuyRecord(token, timeMs) {
    const t = Number.isFinite(timeMs) ? timeMs : Date.now();
    const matchWindowMs = getImmediateBuyHistoryMatchWindowMs();
    let best = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const item of filledBuyRecentRecords) {
      if (!item || item.token !== token || item.source !== 'confirmed' || item.historyMatched) continue;
      const diff = Math.abs((Number(item.timeMs) || 0) - t);
      if (diff <= matchWindowMs && diff < bestDiff) {
        best = item;
        bestDiff = diff;
      }
    }
    return best;
  }

  function adjustRecordedBuyAmount(token, delta) {
    const value = Number(delta);
    if (!token || !Number.isFinite(value) || Math.abs(value) <= 0.000001) return false;
    const existingRecord = tokenRecords.get(token) || { total: 0, buy: 0 };
    const currentBuy = Number(existingRecord.buy) || 0;
    const newBuyAmount = Math.max(0, currentBuy + value);
    const calculatedTotal = newBuyAmount * currentMultiplier;
    tokenRecords.set(token, {
      total: calculatedTotal,
      buy: newBuyAmount
    });
    saveTokenRecords();
    if (!stopIfTargetTotalReached()) {
      refreshAmountDisplayNow({ skipFallbacks: true });
    }
    return true;
  }

  function getFilledBuyRecordKey(token, keyPrefix, uniqueKey) {
    return `${keyPrefix || 'buy'}:${token}:${uniqueKey || ''}`;
  }

  function reconcileHistoryBuyWithImmediate(token, amount, recordKey, fingerprint, timeMs) {
    const matched = findRecentImmediateBuyRecord(token, timeMs);
    if (!matched) return false;
    realtimeStatsRecordedKeys.add(recordKey);
    if (fingerprint) filledBuyFingerprints.add(fingerprint);
    matched.historyMatched = true;
    matched.historyKey = recordKey;
    const previousAmount = Number(matched.amount);
    matched.amount = amount;
    matched.timeMs = Number.isFinite(timeMs) ? timeMs : matched.timeMs;
    if (isSameFilledBuyAmount(previousAmount, amount)) return true;
    adjustRecordedBuyAmount(token, amount - previousAmount);
    return true;
  }

  function recordFilledBuyAmount(activeToken, amount, keyPrefix, uniqueKey, timeMs) {
    const token = String(activeToken || '').trim();
    const value = Number(amount);
    if (!token || !Number.isFinite(value) || value <= 0) return false;
    if (keyPrefix !== 'history') return false;
    const recordKey = getFilledBuyRecordKey(token, keyPrefix, uniqueKey || value);
    const recordTime = Number.isFinite(timeMs) ? timeMs : Date.now();
    const fingerprint = getFilledBuyFingerprint(token, value, recordTime);
    const existingOrder = filledBuyOrderRecords.get(recordKey);
    if (existingOrder) {
      realtimeStatsRecordedKeys.add(recordKey);
      const previousAmount = Number(existingOrder.amount);
      existingOrder.amount = value;
      existingOrder.timeMs = recordTime;
      existingOrder.token = token;
      filledBuyOrderRecords.set(recordKey, existingOrder);
      if (!isSameFilledBuyAmount(previousAmount, value)) {
        adjustRecordedBuyAmount(token, value - previousAmount);
        saveRealtimeStatsState();
        return true;
      }
      saveRealtimeStatsState();
      return false;
    }
    if (realtimeStatsRecordedKeys.has(recordKey)) return false;
    if (fingerprint && filledBuyFingerprints.has(fingerprint)) {
      realtimeStatsRecordedKeys.add(recordKey);
      saveRealtimeStatsState();
      return false;
    }
    realtimeStatsRecordedKeys.add(recordKey);
    if (fingerprint) filledBuyFingerprints.add(fingerprint);
    filledBuyOrderRecords.set(recordKey, { token, amount: value, timeMs: recordTime });
    filledBuyRecentRecords.push({ token, amount: value, timeMs: recordTime, source: keyPrefix || 'buy', recordKey });
    const existingRecord = tokenRecords.get(token) || { total: 0, buy: 0 };
    const newBuyAmount = (Number(existingRecord.buy) || 0) + value;
    const calculatedTotal = newBuyAmount * currentMultiplier;
    tokenRecords.set(token, {
      total: calculatedTotal,
      buy: newBuyAmount
    });
    saveTokenRecords();
    saveRealtimeStatsState();
    if (!stopIfTargetTotalReached()) {
      refreshAmountDisplayNow({ skipFallbacks: true });
    }
    buyStatsNeedsFinalScan = false;
    return true;
  }

  window.addEventListener('beforeunload', () => {
    ResourceManager.cleanupAll();
    DOMCache.clearAll();
    DebounceUtils.clearAll();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (stableDetectEnabled) {
        MonitorRegistry.stop('stable');
      }
    } else {
      if (stableDetectEnabled && running) {
        MonitorRegistry.start('stable');
      }
    }
  });

  function isMfaPopupPresent() {
    Logger.log('开始检测2FA弹窗...');
    const candidates = [
      '.bidscls-btnLink2',
      '#mfa-shadow-host',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) {
        Logger.log(`找到2FA元素: ${sel}`);
        return true;
      }
    }
    const mfaDiv = document.querySelector('div[class*="mfa"], div[class*="2fa"]');
    if (mfaDiv) {
      Logger.log('找到2FA元素: div[class*="mfa"] 或 div[class*="2fa"]');
      return true;
    }
    Logger.log('未找到2FA弹窗');
    return false;
  }
  async function fetchJSONNoCache(url) {
    const tsSep = url.includes('?') ? '&' : '?';
    const finalUrl = `${url}${tsSep}_t=${Date.now()}`;

    // 指数退避重试配置：3次尝试，间隔 100ms、300ms、900ms
    const retryDelays = [100, 300, 900];
    let lastError;

    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
      try {
        if (typeof GM_xmlhttpRequest === 'function') {
          return await new Promise((resolve, reject) => {
            try {
              GM_xmlhttpRequest({
                method: 'GET',
                url: finalUrl,
                timeout: 15000,
                headers: {
                  'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
                  'pragma': 'no-cache',
                  'accept': 'application/json, text/plain, */*'
                },
                onload: (r) => {
                  try {
                    if (r.status >= 200 && r.status < 300) {
                      resolve(JSON.parse(r.responseText || 'null'));
                    } else {
                      reject(new Error(`HTTP ${r.status}`));
                    }
                  } catch (e) { reject(e); }
                },
                onerror: () => reject(new Error('网络错误')),
                ontimeout: () => reject(new Error('请求超时')),
                onabort: () => reject(new Error('请求中止'))
              });
            } catch (e) { reject(e); }
          });
        } else {
          // 回退 fetch（可能受 CSP）
          const resp = await fetch(finalUrl, {
            cache: 'no-store',
            credentials: 'omit',
            headers: { 'cache-control': 'no-store' }
          });

          if (resp.status >= 200 && resp.status < 300) {
            return await resp.json();
          } else {
            throw new Error(`HTTP ${resp.status}`);
          }
        }
      } catch (error) {
        lastError = error;

        // 如果不是最后一次尝试，等待后重试
        if (attempt < retryDelays.length - 1) {
          await sleep(retryDelays[attempt]);
          continue;
        }
      }
    }

    // 所有重试都失败，抛出最后一个错误
    throw lastError;
  }

})();


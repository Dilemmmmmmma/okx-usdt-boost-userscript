# Boost & Alpha 交易助手 Chrome 扩展

这是由 OKX Boost 与 Binance Alpha 工具迁移出的 Manifest V3 Chrome 扩展。网页层只保留对应站点的交易执行与数据同步；所有可见交互都在 Chrome 侧边栏中完成。

## 安装

1. 打开 `chrome://extensions`。
2. 开启右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本目录：`okx-usdt-boost-chrome-extension`。
5. 访问 OKX 代币页、Binance CEX Alpha 或 `https://web3.binance.com/zh-CN/token/...`，点击浏览器工具栏中的扩展图标打开侧边栏。

请停用对应的旧篡改猴脚本，避免两个自动交易引擎同时运行。

## 架构

- `page-engine.js` / `content-bridge.js`：OKX Boost 的页面引擎与消息桥。
- `alpha-page-engine.js` / `alpha-content-bridge.js`：Binance Alpha 的页面引擎与消息桥。
- `wallet-alpha-page-engine.js` / `wallet-alpha-content-bridge.js`：Binance Wallet Alpha 的 DOM 交易引擎与消息桥。
- `sidepanel.*`：统一工作台，根据 OKX、Binance CEX Alpha、Binance Wallet 页面自动切换视图。

## 当前范围

- 支持 `web3.okx.com`、`web3.cnouxyex.co`、Binance CEX Alpha 与 Binance Wallet 代币页。
- 保留 OKX 的“一键买卖 / 右侧交易栏兜底”、订单历史、Boost records、达量警报、暂停统计和定时启动。
- CEX Alpha 保留目标交易额、滑块、随机循环、买卖等待和反向订单交易。
- Wallet Alpha 通过公开标签接口识别积分倍数，通过“我的订单”新增订单确认买卖结果；仅累计成功买入额乘以倍数。
- Alpha 的身份验证器自动填充、认证密钥存储和第三方 OTP 请求已禁用，不会被扩展使用。

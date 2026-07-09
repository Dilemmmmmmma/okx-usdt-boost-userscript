# Boost & Alpha 交易助手 Chrome 扩展

这是由 OKX Boost 与 Binance Alpha 工具迁移出的 Manifest V3 Chrome 扩展。网页层只保留对应站点的交易执行与数据同步；所有可见交互都在 Chrome 侧边栏中完成。

## 安装

1. 打开 `chrome://extensions`。
2. 开启右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本目录：`okx-usdt-boost-chrome-extension`。
5. 访问 OKX 代币页或 `https://www.binance.com/zh-CN/alpha/...`，点击浏览器工具栏中的扩展图标打开侧边栏。

请停用对应的旧篡改猴脚本，避免两个自动交易引擎同时运行。

## 架构

- `page-engine.js` / `content-bridge.js`：OKX Boost 的页面引擎与消息桥。
- `alpha-page-engine.js` / `alpha-content-bridge.js`：Binance Alpha 的页面引擎与消息桥。
- `sidepanel.*`：币安深色风格的统一工作台，用一个按钮切换 Boost / Alpha UI。

## 当前范围

- 支持 `web3.okx.com`、`web3.cnouxyex.co` 与 Binance Alpha 中文页面。
- 保留 OKX 的“一键买卖 / 右侧交易栏兜底”、订单历史、Boost records、达量警报、暂停统计和定时启动。
- Alpha 工作台保留目标交易额、滑块、随机循环、买卖等待、稳定监测、挂单监测、反向订单、波动限价、统计与余额磨损。
- Alpha 的身份验证器自动填充、认证密钥存储和第三方 OTP 请求已禁用，不会被扩展使用。

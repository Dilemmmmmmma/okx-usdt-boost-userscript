# OKX Boost 交易助手 Chrome 扩展

这是由原篡改猴脚本迁移出的 Manifest V3 Chrome 扩展。网页层只保留交易执行、订单历史与 Boost records 同步；所有可见交互都在 Chrome 侧边栏中完成。

## 安装

1. 打开 `chrome://extensions`。
2. 开启右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本目录：`okx-usdt-boost-chrome-extension`。
5. 访问 `https://web3.okx.com/zh-hans/token/...`，点击浏览器工具栏中的扩展图标打开侧边栏。

请停用旧的篡改猴脚本，避免两个自动交易引擎同时运行。

## 架构

- `page-engine.js`：在 OKX 页面主世界中执行，保留现有交易、订单和 Boost 同步逻辑。它使用不可见的兼容 DOM，不会把计算器插入网页。
- `content-bridge.js`：在扩展隔离环境中转发侧边栏与页面引擎的消息。
- `sidepanel.*`：OKX 深色风格的 Chrome Side Panel UI。

## 当前范围

- 支持 `web3.okx.com` 和 `web3.cnouxyex.co`。
- 支持现有的“一键买卖 / 右侧交易栏兜底”、自动交易、卖出同步、订单历史、Boost records、达量警报、暂停交易统计与定时启动。
- 侧边栏直接显示总交易额、总 Boost 交易额、返佣与 Boost 进度，并提供统一的设置入口。

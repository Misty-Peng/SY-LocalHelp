---
name: launch-debug-browser
description: 启动本地 Chromium 并开启远程调试端口（9222），供 Playwright 通过 CDP 复用。已存在则复用，避免重复启动导致登录态丢失。
---

# 启动本地调试浏览器（远程调试端口）

## 能力概述

**确保本地存在一个开启了远程调试端口的 Chromium 实例**（默认端口 `9222`）：

- 已存在则直接复用
- 不存在则使用 Playwright 自带 Chromium 启动一个带持久化用户目录的新实例

## 适用场景

- 脚本化登录后，继续用 Playwright 连接同一浏览器做业务操作
- 避免每次重启浏览器导致的登录/Cookie 丢失
- 与 `playwright-cli` 或自定义 `chromium.connectOverCDP(...)` 共享同一浏览器

## 前置条件

- 已安装 `playwright`（`node_modules/playwright` 存在）
- Node.js 可用
- 默认端口：`9222`
- 默认用户数据目录：`<项目根>/.pw-user-data`

## 核心逻辑

1. HTTP 请求 `http://127.0.0.1:<port>/json/version`：
   - 返回 JSON 即认为调试端口已就绪，直接复用
   - 2s 超时或连接错误判定不可用
2. 若不可用，使用 `chromium.executablePath()` 拿到 Playwright 自带 Chromium 路径，以 `spawn(..., { detached: true, stdio: 'ignore' })` 启动，关键参数：
   - `--remote-debugging-port=<port>`
   - `--user-data-dir=<持久目录>`（保持登录态）
   - `--no-first-run --no-default-browser-check`
   - 可选：追加起始 URL
3. 启动后轮询 `/json/version`（每秒一次，最多 30 次）直到就绪
4. 业务侧通过 `chromium.connectOverCDP('http://127.0.0.1:<port>')` 连接；`browser.close()` 仅断开 CDP，不会关闭浏览器

## 实现位置

- **核心模块**：`tools/debug_browser.js`
- **入口脚本**：`tools/connect_debug.js`

### `tools/debug_browser.js` 导出

- `checkDebugPort(port)` — 检测远程调试端口
- `launchChromeWithDebug({ port, userDataDir, url, timeoutMs })` — 启动
- `ensureDebugBrowser(opts)` — 检测 + 按需启动（**推荐入口**）
- `connectCDP(port)` — 建立 CDP 连接并返回 `{ browser, context, page, contexts, pages }`
- 常量 `DEFAULT_DEBUG_PORT`、`DEFAULT_USER_DATA_DIR`

## 使用

### 一键启动 + 连接

```bash
node tools/connect_debug.js
```

预期输出：

- 首次：`🚀 已启动新的调试浏览器: ...`
- 之后：`✅ 检测到已运行的调试浏览器: ...`

### 在自定义脚本中复用

```js
const { ensureDebugBrowser, connectCDP } = require('../tools/debug_browser');

(async () => {
  const { info, reused } = await ensureDebugBrowser({
    url: 'https://account.shouyangfruit.com',
  });
  console.log(reused ? '复用' : '新启', info.Browser);

  const { browser, page } = await connectCDP();
  console.log(page.url(), await page.title().catch(() => 'N/A'));

  await browser.close(); // 仅断开 CDP
})();
```

### 手动检测端口

```bash
curl http://127.0.0.1:9222/json/version
```

## 常见问题

- **端口被占用但不是调试浏览器**：更换端口或结束占用进程
- **登录态丢失**：确认 `--user-data-dir` 指向同一目录（默认 `<项目根>/.pw-user-data`）
- **Playwright Chromium 未安装**：执行 `npx playwright install chromium`
- **浏览器意外关闭**：仅 `browser.close()` 不会关闭浏览器进程；真正关闭需要结束进程或使用 `playwright-cli kill-all`

## 相关文件

- `tools/debug_browser.js` — 可复用模块
- `tools/connect_debug.js` — 入口脚本 / 使用示例
- `.pw-user-data/` — 持久化用户数据目录
- `.windsurf/workflows/launch-debug-browser.md` — Windsurf 工作流触发器（指向本 SKILL）

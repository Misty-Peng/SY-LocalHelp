# SY-LocalHelp

本地工具与能力库：以「SKILL + 工具」的方式组织可复用的本地自动化能力（当前主要围绕 Playwright 远程调试浏览器展开）。

## 目录结构

```text
SY-LocalHelp/
├─ skills/              # 可复用能力文档（SKILL），一个 SKILL 一个文件夹
│  ├─ README.md
│  └─ launch-debug-browser/
│     └─ SKILL.md
├─ tools/               # 可执行脚本 / 可 require 的模块（稳定）
│  ├─ README.md
│  ├─ debug_browser.js  # 核心模块：ensureDebugBrowser / connectCDP 等
│  └─ connect_debug.js  # 入口脚本：检测或启动调试浏览器并输出状态
├─ debug/               # 一次性 / 探索性调试脚本（不稳定，可能沉淀到 tools/ 或 skills/）
│  ├─ README.md
│  ├─ inspect_token.js
│  └─ clear_token_and_watch.js
├─ .windsurf/
│  └─ workflows/        # Windsurf 工作流触发器（/slash-command），通常指向 skills/
├─ .pw-user-data/       # Playwright Chromium 持久化用户目录（保持登录态）
├─ .playwright-cli/     # playwright-cli 的日志 / 快照缓存
├─ node_modules/
└─ README.md
```

## 设计原则

1. **`skills/` 存内容**：说明「怎么做、为什么这么做、边界条件」，一个 SKILL 一个子目录，必须包含 `SKILL.md`
2. **`tools/` 存稳定代码**：优先写成可 `require` 的模块，再附一个 CLI 入口
3. **`debug/` 存探索性脚本**：临时调试 / 抓接口 / 验证假设；有价值的结论要沉淀到 `skills/` 或提升为 `tools/`
4. **`.windsurf/workflows/` 只做触发器**：简短、指向 `skills/<name>/SKILL.md`
5. **根目录保持简洁**：只保留入口级说明和运行时持久化目录

## 快速开始

### 启动或复用调试浏览器

```bash
node tools/connect_debug.js
```

- 首次运行：启动 Playwright 自带 Chromium，监听远程调试端口 `9222`，用户数据写入 `.pw-user-data/`
- 之后运行：检测到端口已就绪，直接复用，登录态不丢失

详细说明：`skills/launch-debug-browser/SKILL.md`

### 在自定义脚本中复用

```js
const { ensureDebugBrowser, connectCDP } = require('./tools/debug_browser');

(async () => {
  await ensureDebugBrowser({ url: 'https://example.com' });
  const { browser, page } = await connectCDP();
  console.log(page.url(), await page.title().catch(() => 'N/A'));
  await browser.close(); // 仅断开 CDP，不关闭浏览器
})();
```

### 通过 Windsurf 触发

在 Cascade 中输入 `/launch-debug-browser` 或 `/lemo-login` 即可触发对应工作流。

## 扩展约定

新增一个能力时，建议同时补齐：

1. `tools/<xxx>.js` — 实现（模块 + 可选 CLI）
2. `skills/<xxx>/SKILL.md` — 使用规范与排错
3. `.windsurf/workflows/<xxx>.md` — 简短触发器，引用上面的 SKILL

## 相关文档

- `skills/README.md` — SKILL 目录约定与清单
- `tools/README.md` — 工具目录约定与清单
- `debug/README.md` — 调试脚本目录约定与清单

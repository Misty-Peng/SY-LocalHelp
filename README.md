# SY-LocalHelp

本地工具与能力库：以「SKILL + 工具」的方式组织可复用的本地自动化能力（当前主要围绕 Playwright 远程调试浏览器展开）。

## 目录结构

```text
SY-LocalHelp/
├─ skills/                    # 可复用能力文档（SKILL），一个 SKILL 一个文件夹
│  ├─ README.md
│  ├─ launch-debug-browser/
│  │  └─ SKILL.md             # 启动/复用远程调试浏览器
│  ├─ lemo-login/
│  │  └─ SKILL.md             # 乐檬登录、登录态检查、会话保活
│  └─ supplier-management/
│     └─ SKILL.md             # 供应商查询、新增、改名自动化
├─ tools/                     # 稳定、可复用的脚本和模块
│  ├─ README.md
│  ├─ config.js               # 共享配置（URL、token key、路径）
│  ├─ debug_browser.js        # 核心模块：ensureDebugBrowser / connectCDP / safeDisconnect
│  ├─ connect_debug.js        # 入口脚本：检测或启动调试浏览器并输出状态
│  ├─ session_monitor.js      # 乐檬登录态监控 + 10 分钟 keepalive
│  └─ supplier.js             # 供应商查询、新增、改名（CLI + 模块）
├─ debug/                     # 探索性调试脚本（临时，可能沉淀到 tools/ 或 skills/）
│  ├─ README.md
│  ├─ inspect_token.js        # 扫描 localStorage / Cookie 中的 token
│  └─ clear_token_and_watch.js# 清除 token 并观察刷新行为
├─ templates/                 # 可复制到其他项目的模板
│  ├─ README.md
│  └─ AGENTS.md               # 前后端通用 Agent 协作手册模板
├─ logs/                      # 运行时日志（已 gitignore）
├─ .windsurf/
│  └─ workflows/              # Windsurf 触发器（/slash-command）
├─ .pw-user-data/             # Chromium 持久化用户目录（已 gitignore）
├─ .playwright-cli/           # playwright-cli 缓存（已 gitignore）
├─ package.json
├─ .gitignore
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
npm run debug:browser
# 或 node tools/connect_debug.js
```

- 首次运行：启动 Playwright 自带 Chromium，监听远程调试端口 `9222`，用户数据写入 `.pw-user-data/`
- 之后运行：检测到端口已就绪，直接复用，登录态不丢失

详细说明：`skills/launch-debug-browser/SKILL.md`

### 登录态监控

```bash
npm run session:monitor
# 或 node tools/session_monitor.js
```

- 自动检测登录态 → 未登录则打开登录页等待用户操作 → 登录后校验 → 每 10 分钟保活

详细说明：`skills/lemo-login/SKILL.md`

### 在自定义脚本中复用

```js
const { ensureDebugBrowser, connectCDP, safeDisconnect } = require('./tools/debug_browser');

(async () => {
  await ensureDebugBrowser({ url: 'https://example.com' });
  const { browser, page } = await connectCDP();
  console.log(page.url(), await page.title().catch(() => 'N/A'));
  await safeDisconnect(browser); // 仅断开 CDP，不关闭浏览器
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
- `templates/README.md` — 可复制模板（AGENTS.md 等）

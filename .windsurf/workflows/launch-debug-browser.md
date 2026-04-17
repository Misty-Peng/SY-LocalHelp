---
description: 启动/复用本地 Chromium 并开启远程调试端口（9222），供 Playwright 通过 CDP 连接
---

# launch-debug-browser

完整说明见 SKILL：`skills/launch-debug-browser/SKILL.md`

## 一键执行

// turbo
```bash
node tools/connect_debug.js
```

## 手动检测端口

// turbo
```bash
curl http://127.0.0.1:9222/json/version
```

## 关键点

- 默认端口 `9222`，持久化目录 `.pw-user-data/`
- 已存在则复用，不存在则使用 Playwright 自带 Chromium 启动
- 在代码中复用：`require('./tools/debug_browser')`，推荐入口 `ensureDebugBrowser` / `connectCDP`

# skills/

本目录存放项目中的 **SKILL**（可复用的能力说明 / 操作手册）。

## 目录约定

- 一个 SKILL 一个文件夹：`skills/<skill-name>/`
- 每个 SKILL 必须包含 `SKILL.md`
- 可选地附带 `references/`、脚本片段、示意图等

```text
skills/
└─ <skill-name>/
   ├─ SKILL.md         # 必需：能力说明、适用场景、步骤、示例
   └─ ...              # 可选：辅助资料
```

## SKILL.md 建议结构

```markdown
---
name: <skill-name>
description: <一句话说明>
---

# 标题

## 能力概述 / 适用场景 / 前置条件 / 核心逻辑 / 使用 / 常见问题 / 相关文件
```

## 当前 SKILL 清单

- **`launch-debug-browser/`** — 启动并复用带远程调试端口的本地 Chromium，供 Playwright 通过 CDP 连接
- **`lemo-login/`** — 乐檬（lemo）系统登录、登录态检查与会话保活
- **`supplier-management/`** — 供应商查询、新增、改名自动化

## 与 `.windsurf/workflows/` 的关系

- `skills/` 是**内容**（可被人类或 AI 阅读的能力文档）
- `.windsurf/workflows/*.md` 是 Windsurf 的**触发器**（`/slash-command`），通常只做一句描述 + 指向对应 `skills/<name>/SKILL.md`

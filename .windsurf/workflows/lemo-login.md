---
description: 执行乐檬（lemo）系统登录、登录态检查与会话保活
---

# lemo-login

完整说明见 SKILL：`skills/lemo-login/SKILL.md`

## 一键执行

```bash
node tools/session_monitor.js
```

## 关键点

- 登录页：`https://account.shouyangfruit.com/user/login`
- 首页：`https://account-new.shouyangfruit.com/galaxy-group/setting-center/home`
- 登录结束后必须补做一次登录态检查
- 登录态检查依赖当前用户接口是否被捕获到
- 会话保持时每 10 分钟刷新并同步检查

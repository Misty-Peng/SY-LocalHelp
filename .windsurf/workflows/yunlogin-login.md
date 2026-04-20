---
description: 执行云之家（yunlogin）登录、登录态检查与会话保活
---

# yunlogin-login

完整说明见 SKILL：`skills/yunlogin-login/SKILL.md`

## 一键执行

```bash
node tools/yzj_session_monitor.js
```

## 关键点

- 登录页：`https://www.yunzhijia.com/home/?m=open&a=login&utm_source=&utm_medium=`
- 首页：`https://www.yunzhijia.com/home/`
- 登录结束后必须补做一次 `getMyAccount` 接口校验
- 判定条件是 `success=true` 且 `csrfToken` 非空
- 会话保持时每 10 分钟检查一次登录态

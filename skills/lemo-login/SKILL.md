---
name: lemo-login
description: 通过远程调试浏览器完成乐檬（lemo）系统登录，并在登录结束后自动执行登录态检查与持续保活。
---

# 乐檬（lemo）登录与登录态检查

## 能力概述

该 SKILL 用于乐檬（lemo）系统的浏览器登录流程、登录态校验和会话保活。

核心目标是确保：

1. 使用已开启远程调试端口的浏览器执行登录
2. 登录完成后自动跳转到业务首页
3. 在登录结束时补做一次登录态检查，确认会话可用
4. 进入保活模式后，每 10 分钟刷新一次页面并同步检查登录态

## 适用场景

- 需要人工在浏览器中完成登录，但希望脚本接管后续会话管理
- 需要确认当前登录态是否仍然有效
- 需要长时间保持 lemo 系统会话在线，避免静默失效

## 前置条件

- 本地存在可连接的远程调试浏览器，默认端口为 `9222`
- Playwright 环境可用
- 项目根目录下存在持久化用户目录 `.pw-user-data/`

## 页面与接口约定

- 登录页：`https://account.shouyangfruit.com/user/login`
- 业务首页：`https://account-new.shouyangfruit.com/galaxy-group/setting-center/home`
- 登录态检查接口：
  `https://account-new.shouyangfruit.com/earth-gateway/galaxy-group/business/nhsoft.galaxy.group.company.user.current.read`

## 核心流程

### 1. 连接远程调试浏览器

优先复用已存在的调试浏览器；如果没有，则自动启动一个带持久化用户目录的新实例。

### 1.1 定位工作页

优先寻找系统首页标签页 `HOME_URL`，其次寻找登录页 `LOGIN_URL`。

- 找到首页：置前首页，先做登录前校验
- 找到登录页：置前登录页，进入登录流程
- 两者都找不到：使用当前连接页作为工作页，并输出明确日志

### 1.2 状态机流程

建议按以下状态推进：

`bootstrap -> find-page -> precheck -> login -> post-check -> keepalive`

其中：

- `bootstrap`：确保调试浏览器、连接 CDP
- `find-page`：优先定位首页，其次定位登录页
- `precheck`：登录前校验，命中即直接返回已登录
- `login`：仅在未登录时执行
- `post-check`：登录成功后的接口级校验，必须执行
- `keepalive`：仅首页标签页可执行，首页标签不存在则默认登录失败并返回登录页

### 1.4 阻塞与非阻塞

默认情况下，登录成功且校验通过后，会继续进入前台保活循环，因此命令会持续运行。

如需仅执行一次登录与校验后退出，可通过环境变量关闭前台保活：

```bash
FOREGROUND_KEEPALIVE=0 node tools/session_monitor.js
```

### 1.3 阶段日志与落盘

每个阶段都应输出明确日志，便于排查，并且要落盘到 `logs/session_monitor-*.log`：

- `bootstrap`：浏览器启动/复用、CDP 连接
- `find-page`：页面定位结果、当前所有标签快照
- `precheck`：登录前校验结果、当前所有标签快照
- `login`：登录页复用、置前、等待登录、登录前后标签快照
- `post-check`：登录成功后的接口级校验结果、校验前标签快照
- `keepalive`：刷新周期、每轮检查结果、失败返回登录页

### 1.4 卡住排查建议

如果用户反馈“已登录但进程未流转”，优先查看日志文件中的最后一个 `PHASE`、`SNAPSHOT`、`LOGIN`、`CHECK` 或 `FAIL` 行，并结合当时的标签页快照判断：

- 页面是否已经跳转，但脚本仍在等待旧页面
- 当前是否只有登录页，没有首页页
- 登录成功后是否未找到新的首页标签页
- 当前是否进入了保活循环，因此表现为“阻塞”

### 2. 登录前校验

在真正进入登录流程前，先检查当前是否已经存在有效登录态：

- 若首页标签页存在
- 且接口级登录态校验通过
- 则直接返回“已登录”，不再重复引导登录

### 3. 执行登录

若登录前校验未通过，则打开登录页，让用户在浏览器中完成登录，并等待页面进入业务首页。

### 4. 登录成功后的补充校验

登录成功后，必须立刻执行一次登录态校验：

- 触发一次首页刷新
- 监听并捕获当前用户接口请求
- 以接口是否出现、以及返回是否正常作为最终判断依据

判定规则：

- **捕获到接口请求**，且接口返回正常：登录态正常
- **未捕获到接口请求**：视为登录态丢失或未建立成功
- **接口返回异常状态**：视为登录态异常

### 5. 登录态维持

校验完成后，才进入保活循环：

- 仅允许 `https://account-new.shouyangfruit.com/galaxy-group/setting-center/home` 标签页执行保活
- 每 10 分钟刷新一次首页
- 每次刷新后都立即执行登录态检查
- 若首页标签页不存在，默认判定为登录失败，并返回登录页
- 若检查失败，则停止保活并报告会话失效

### 6. 日志支撑

整个过程必须输出足够日志，至少包含：

- 浏览器是否复用/启动
- 当前标签页数量与首页标签页定位结果
- 登录页打开、进入首页、登录成功、校验开始、校验结果、保活开始、保活每轮刷新、失败原因
- 若没有首页标签页，明确输出“默认登录失败，返回登录页”

## 推荐实现

项目中可复用的实现位于：

- `tools/debug_browser.js` — 连接/启动远程调试浏览器
- `tools/session_monitor.js` — 乐檬登录、登录态检查、保活循环

## 使用方式

### 启动并接管登录态监控

```bash
node tools/session_monitor.js
```

### 在自定义脚本中复用

```javascript
const { ensureDebugBrowser, connectCDP } = require('../tools/debug_browser');
const { loginFlow, refreshAndCheck } = require('../tools/session_monitor');

(async () => {
  await ensureDebugBrowser({ url: 'https://account.shouyangfruit.com/user/login' });
  const { browser, page } = await connectCDP();
  await loginFlow(page);
  const result = await refreshAndCheck(page);
  console.log(result.alive ? '登录态正常' : '登录态失效');
  await browser.close();
})();
```

## 检查要点

- 登录流程结束后不要只看页面跳转成功，必须补做一次接口级登录态检查
- 每次刷新后应重新判断当前用户接口是否出现
- 如果页面进入首页但接口没有命中，也不能默认认为登录态有效
- 登录态检查应作为登录流程的收尾步骤，而不是可选步骤

## 常见问题

### 页面已经显示首页，但接口没有出现

这通常表示页面视觉状态和后端会话状态不一致，应该继续以接口检查为准。

### 刷新后偶尔没有立即命中接口

可适当等待网络空闲，但最终仍需以是否捕获到目标接口为准。

### 登录态突然失效

停止保活，重新引导用户回到登录页重新登录。

## 相关文件

- `tools/session_monitor.js`
- `tools/debug_browser.js`
- `.windsurf/workflows/lemo-login.md`

---
name: yunlogin-login
description: 通过远程调试浏览器完成云之家（yunlogin）登录，并在登录后执行接口级登录态校验与会话保活。
user-invocable: true
---

# 云之家（yunlogin）登录与登录态检查

## 能力概述

该 SKILL 用于云之家（yunlogin）系统的浏览器登录流程、登录态校验和会话保活。

核心目标是确保：

1. 使用已开启远程调试端口的浏览器执行登录
2. 登录完成后不只看页面跳转，而是补做一次接口级校验
3. 会话保持期间，周期性检查登录态是否仍然有效
4. 当登录态失效时，返回登录页重新引导登录

## 适用场景

- 需要人工在浏览器中完成云之家登录，但希望脚本接管后续登录态检查
- 需要确认当前云之家会话是否依然有效
- 需要持续保活云之家登录态

## 前置条件

- 本地存在可连接的远程调试浏览器，默认端口为 `9222`
- Playwright 环境可用
- 项目根目录下存在持久化用户目录 `.pw-user-data/`

## 页面与接口约定

- 登录页：`https://www.yunzhijia.com/home/?m=open&a=login&utm_source=&utm_medium=`
- 业务首页：`https://www.yunzhijia.com/home/`
- 登录成功元素：
  `.yl-home-nav_auto > .nav_auto_item[data-url="/manage-web"][data-app="manage"]`
- 登录态检查接口：
  `https://www.yunzhijia.com/space/c/rest/mycloudhome/getMyAccount`

## 核心流程

### 1. 连接远程调试浏览器

优先复用已存在的调试浏览器；如果没有，则自动启动一个带持久化用户目录的新实例。

### 2. 定位工作页

优先寻找云之家首页标签页，其次寻找登录页，再其次寻找空白页。

- 找到首页：置前首页，先做登录前校验
- 找到登录页：置前登录页，进入登录流程
- 找到空白页：复用空白页打开登录页
- 三者都找不到：新开一个专用页，避免覆盖用户现有页面

### 3. 状态机流程

建议按以下状态推进：

`bootstrap -> find-page -> precheck -> login -> post-check -> keepalive`

其中：

- `bootstrap`：确保调试浏览器、连接 CDP
- `find-page`：优先定位首页，其次定位登录页或空白页
- `precheck`：登录前校验，命中即直接返回已登录
- `login`：仅在未登录时执行
- `post-check`：登录成功后的接口级校验，必须执行
- `keepalive`：周期性检查首页会话，失败则返回登录页

### 4. 登录前校验

在真正进入登录流程前，先检查当前是否已经存在有效登录态：

- 若首页标签页存在
- 且 `getMyAccount` 接口返回 `success=true`
- 且 `csrfToken` 非空
- 则直接返回“已登录”，不再重复引导登录

### 5. 执行登录

若登录前校验未通过，则打开登录页，让用户在浏览器中完成登录，并等待登录成功元素出现。

### 6. 登录成功后的补充校验

登录成功后，必须立刻执行一次接口级校验：

- 调用 `getMyAccount`
- 要求 `success=true`
- 要求 `csrfToken` 非空

判定规则：

- **接口成功且 `csrfToken` 存在**：登录态正常
- **接口不可用**：视为登录态未建立成功
- **接口返回失败或缺少关键字段**：视为登录态异常

### 7. 登录态维持

校验完成后，才进入保活循环：

- 优先使用首页标签页执行保活
- 每 10 分钟检查一次登录态
- 每次检查都重新调用 `getMyAccount`
- 若首页标签页不存在，默认判定登录失败，并返回登录页
- 若检查失败，则停止保活并报告会话失效

## 推荐实现

项目中可复用的实现位于：

- `tools/debug_browser.js` — 连接/启动远程调试浏览器
- `tools/yzj_session_monitor.js` — 云之家登录、登录态检查、保活循环

## 使用方式

### 启动并接管云之家登录态监控

```bash
node tools/yzj_session_monitor.js
```

### 使用 npm script

```bash
npm run yzj:login
```

### 非阻塞执行一次登录与校验

```bash
FOREGROUND_KEEPALIVE=0 node tools/yzj_session_monitor.js
```

## 检查要点

- 登录流程结束后不要只看页面上像是成功，必须补做一次接口级登录态检查
- `getMyAccount` 返回 `success=true` 但没有 `csrfToken`，也不能视为已登录
- 如果首页标签页不存在，不应默默抢占用户当前任意标签页
- 保活循环失败后应回到登录页，而不是继续假定会话有效

## 相关文件

- `tools/yzj_session_monitor.js`
- `tools/debug_browser.js`
- `.windsurf/workflows/yunlogin-login.md`
- `skills/yunlogin-current-user-identity/SKILL.md`

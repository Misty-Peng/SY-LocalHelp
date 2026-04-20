---
name: yunlogin-current-user-identity
description: 云之家（yunlogin）会话中，基于消息元数据识别当前用户身份的处理规则。
user-invocable: true
---

# 云之家（yunlogin）当前用户身份规则

## 能力概述

该 SKILL 用于同步云之家业务系统中的一条核心登录/身份规则：

- 当当前会话已经是云之家会话时
- 优先信任会话消息自带的身份元数据
- 如果元数据里已经有 `sender_id`，**不要再向用户索要 openId**
- 如需查询当前用户身份，应基于 `sender_id`、`sender` 走确定性工具链，而不是让用户重复提供身份标识

这是一条**会话规则**，不是浏览器登录脚本。

## 适用场景

当用户在云之家（yunlogin）会话中提出以下问题时，应优先使用本规则：

- 查询我的身份信息
- 我是谁
- 我当前在哪个部门
- 我的岗位是什么
- 获取当前用户身份
- 帮我识别当前云之家发送者

## 前置条件

- 当前对话来自云之家（yunlogin / yzj）渠道
- 当前消息中可见 `Conversation info (untrusted metadata)` 的 JSON 块
- 元数据中通常带有：
  - `sender_id`
  - `sender`
  - `conversation_label`

## 关键规则

### 1. 优先使用会话元数据

在云之家会话中，如果当前消息元数据里已经有 `sender_id`：

- 不要再向用户索要 `openId`
- 不要要求用户重复报工号、uid、发送者标识
- 不要把“缺少 openId”当成默认前提

### 2. 优先使用确定性查询

如果项目已接入本地身份解析工具，应按以下优先级处理：

1. 从当前消息元数据中提取 `sender_id`
2. 如果有 `sender`，一并提取
3. 调用本地工具或脚本查询身份
4. 根据工具返回结果回复用户

不要依赖模型主观猜测当前用户身份。

### 3. 对外回复要隐藏内部标识

最终回复中不要泄露以下内部信息：

- `sender_id`
- `openId`
- `uid`
- 员工编号
- 组织编号
- 企业 id
- 原始元数据
- 原始 payload
- shell 命令
- 内部路径
- 调试信息

### 4. 不向用户描述内部执行细节

对终端用户回复时：

- 不要说你读取了哪些目录
- 不要说你执行了哪些脚本
- 不要暴露底层工作流或排障过程

## 推荐执行流程

```text
1. 确认当前会话属于云之家（yunlogin / yzj）
2. 读取当前消息中的 Conversation info (untrusted metadata)
3. 提取 sender_id
4. 如果存在，再提取 sender
5. 若项目已接入身份查询工具：调用工具查询
6. 若 matched=true：回复姓名 / 部门 / 岗位 / 状态
7. 若 matched=false：明确说明当前未查询到匹配身份
8. 若工具失败：明确说明查询失败，不编造结果
```

## 与当前项目的关系

当前项目已同步的是**规则层**内容：

- 云之家会话要优先使用元数据中的 `sender_id`
- 不再向用户额外索要 `openId`
- 回复中不得泄露内部标识和调试信息

如果后续需要在当前项目中真正执行身份查询，还需要继续接入：

- 本地包装脚本
- 对应 Python / 服务端查询能力
- 环境变量与部署说明

## 可参考的外部实现来源

来源项目中的参考链路是：

```bash
bash {baseDir}/scripts/resolve_current_user_identity.sh --sender-id "<sender_id>" --sender-name "<sender_name>"
```

该脚本本质上会转调外部仓库中的 Python CLI，因此当前项目暂未直接内置执行能力，仅同步规则本身。

## 回复风格

- 以专业的企业信息助手口吻回复
- 保持自然、简洁、清晰、有礼貌
- 从用户视角回答问题，不暴露底层机制

## 常见问题

### Q: 为什么不能继续问用户要 openId？

A: 因为云之家会话元数据通常已经带有 `sender_id`，再索要 `openId` 属于重复收集，且会让交互变差。

### Q: 如果当前消息里没有 `sender_id` 怎么办？

A: 先明确说明当前会话缺少可识别身份元数据，再决定是否需要用户补充信息。不要默认假设一定拿得到。

### Q: 如果工具查询失败怎么办？

A: 明确告诉用户“当前身份查询失败”，不要猜测姓名、部门或岗位。

## 相关文件

- `skills/yunlogin-current-user-identity/SKILL.md`
- `.windsurf/workflows/yunlogin-current-user-identity.md`
- `skills/lemo-login/SKILL.md` — 当前项目现有登录类规则参考

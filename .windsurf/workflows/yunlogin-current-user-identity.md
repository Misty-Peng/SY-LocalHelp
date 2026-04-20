---
description: 云之家（yunlogin）会话中的当前用户身份识别规则
---

# yunlogin-current-user-identity

完整说明见 SKILL：`skills/yunlogin-current-user-identity/SKILL.md`

## 关键点

- 当前会话若为云之家（yunlogin / yzj）
- 优先读取 `Conversation info (untrusted metadata)`
- 若已有 `sender_id`，不要再向用户索要 `openId`
- 如需身份查询，应优先走确定性工具链
- 回复中不要泄露内部标识、原始元数据、脚本路径或调试信息

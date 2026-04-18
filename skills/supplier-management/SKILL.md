---
name: supplier-management
description: 乐檬系统供应商查询、新增、改名自动化
user-invocable: true
---

# 供应商管理

## 交互规范

### 语气
- 用**友好、口语化**的方式和用户沟通，像同事之间对话一样自然
- 不要说"缺少参数"、"需要补充参数"这类程序员术语
- 用"你还需要告诉我…"、"帮我确认一下…"、"请问这个供应商是…"这样的说法

### 参数收集
- 用户提到新增供应商时，从用户的话中**主动推导**尽可能多的信息：
  - 供应商名称：用户给出的公司名 / 个人名
  - 供应商类型：根据名称和上下文猜测最可能的类型（如含"配送"→配送中心供应商，含"零食/休闲"→休闲食品供应商，不确定→默认供应商类别）
  - 归属区域（品牌）：根据用户习惯或上下文猜测，不确定时再问
- 如果信息不足，**一次性**问清所有缺少的内容，不要逐个追问
- 问的时候给出推荐选项，格式示例：

> 收到～帮你新增供应商「河北桃小二供应链管理有限公司」
> 还需要确认两个信息：
> 1. **供应商类型** — 我猜是「配送中心供应商」，对吗？
> 2. **归属区域** — 要关联哪个品牌？比如：首杨贵州、首杨广东、首杨测试账套…

### 结果反馈
- 成功时简洁告知结果，例如：「✅ 已新增！供应商编码 020305，类型配送中心，品牌首杨贵州，已启用」
- 失败时说明原因并给出建议，例如：「没有找到这个供应商，要不要换个关键词试试？」

### 可用的供应商类型（左侧分类树）
| 代码 | 名称 |
|------|------|
| 02 | 配送中心供应商 |
| 03 | 默认供应商类别 |
| 04 | 休闲食品供应商 |
| 05 | 首杨零食供应商 |
| 06 | 代卖产品供应商 |
| 07 | 司机运费供应商 |
| 08 | 市场现采供应商 |
| 09 | 内部调货供应商 |
| 10 | 外调货物供应商 |
| 11 | 耗材副食供应商 |
| 12 | 昆明配送供应商 |
| 13 | 配送中心内部调整 |
| 14 | 连锁事业部（一次性物料供应商） |
| 15 | 果茶项目供应商 |
| 16 | 临时供应商 |
| 17 | 首杨生活供应商 |
| 18 | 搬运费供应商 |
| 19 | 阳光食代供应商 |

### 可用的品牌（归属区域）
| 编号 | 品牌名 |
|------|--------|
| 4527 | 首杨贵州 |
| 3823 | 首杨广东 |
| 91999 | 首杨测试账套 |
| 6936 | 首杨甘肃 |
| 6503 | 首杨四川 |
| 6214 | 首杨广西 |
| 55226 | 怡果鲜批发部 |

## 能力概述

通过 Playwright CDP 连接调试浏览器，自动化操作乐檬系统的供应商设置页面，支持：

- **查询** — 按名称或代码搜索供应商
- **新增** — 创建供应商并关联品牌、启用
- **改名** — 修改已有供应商的名称

## 前置条件

1. 调试浏览器已启动（`node tools/connect_debug.js` 或 `/launch-debug-browser`）
2. 已完成乐檬系统登录（`node tools/session_monitor.js` 或 `/lemo-login`）
3. 所有操作在**新建标签页**中执行，完成后自动关闭，不干扰用户当前页面

## 页面地址

```
https://account-new.shouyangfruit.com/galaxy-group/setting-center/supplier
```

## 输入参数

| 操作 | 参数 | 说明 |
|------|------|------|
| 查询 | `name` | 供应商名称或代码 |
| 新增 | `name` | 供应商名称 |
|      | `type` | 供应商类型（左侧分类树节点名，如 `默认供应商类别`） |
|      | `region` | 归属区域（对应品牌弹窗中的品牌名，如 `首杨测试账套`） |
| 改名 | `oldNameOrCode` | 原供应商名称或代码 |

## 核心逻辑

### 1. 供应商查询

```
输入: name
流程:
  1. 检查登录态，未登录则抛出错误
  2. 导航到供应商列表页
  3. 在关键字输入框 (input#keyword) 输入 name
  4. 点击查询按钮 (button[type="submit"])
  5. 解析 ag-Grid 表格行，提取 code/name/category/enabled
  6. 若完整名称搜索无结果且含特殊字符，自动截取关键部分重试
输出: { exists, rows[], matched }
```

### 2. 供应商新增

```
输入: name, type, region
流程:
  1. 执行查询，判断供应商是否已存在
  2a. 若已存在:
      - 点击供应商代码进入详情
      - 点击所属品牌 (.lemon-popup-wrapper) 打开品牌弹窗
      - 在弹窗 ag-Grid 中勾选品牌名 === region 的行
      - 点击确定关闭弹窗
      - 点击保存
      - 返回 { added: false, updated: true }
  2b. 若不存在:
      - 在左侧分类树 (.earth-tree) 点击包含 type 的节点
      - 点击新增按钮
      - 填写供应商名称 (input#supplier_name)
      - 打开品牌弹窗，勾选匹配 region 的品牌，确定
      - 确保是否启用开关 (button#enable_flag[role="switch"]) 为开
      - 点击保存
      - 返回 { added: true }
```

### 3. 供应商改名

```
输入: oldNameOrCode, newName
流程:
  1. 执行查询，判断供应商是否存在
  2a. 若存在:
      - 点击供应商代码进入详情
      - 修改供应商名称输入框
      - 点击保存
      - 返回 { updated: true }
  2b. 若不存在:
      - 返回 { updated: false, reason: 'not-found' }
```

## 使用方式

### CLI

```bash
# 查询
node tools/supplier.js query "AI测试供应商"

# 新增（含品牌关联 + 启用）
node tools/supplier.js add "AI测试供应商" "默认供应商类别" "首杨测试账套"

# 改名
node tools/supplier.js rename "AI测试供应商" "AI测试供应商_新名"
```

### 代码调用

```js
const { querySupplier, addSupplier, updateSupplierName } = require('./tools/supplier');

// 查询
const result = await querySupplier({ name: 'AI测试供应商' });
// result: { exists: true, rows: [...], matched: { code, name, category, enabled } }

// 新增
await addSupplier({ name: 'AI测试供应商', type: '默认供应商类别', region: '首杨测试账套' });

// 改名
await updateSupplierName({ oldNameOrCode: 'AI测试供应商', newName: 'AI测试供应商_改名' });
```

## 页面技术栈

| 组件 | 技术 |
|------|------|
| UI 框架 | Earth（基于 Ant Design 定制，class 前缀 `earth-`） |
| 表格 | ag-Grid（列通过 `col-id` 属性标识） |
| 分类树 | `.earth-tree` + `.earth-tree-treenode` |
| 品牌弹窗 | `.earth-modal-wrap`，内嵌 ag-Grid，checkbox 多选 |
| 表单字段 | `.earth-form-item`，label 通过 `for` 属性关联 input |
| 开关组件 | `button[role="switch"]`，状态通过 `aria-checked` 判断 |

## 关键选择器速查

```js
keywordInput:    'input#keyword'
queryBtn:        'button[type="submit"].earth-btn-primary'
treeNodeTitle:   '.earth-tree-title'
agRow:           '.ag-center-cols-container .ag-row'
agCellCode:      '[col-id="supplier_code"]'     // 内含 <a> 可点击
agCellName:      '[col-id="supplier_name"]'
detailName:      'input#supplier_name'
brandPopup:      '.lemon-popup-wrapper'
enableSwitch:    'button#enable_flag[role="switch"]'
saveBtn:         'button.earth-btn-primary:has-text("保 存")'
brandModal:      '.earth-modal-wrap'
brandModalOk:    '.earth-modal-wrap button:has-text("确 定")'
```

## 已知限制

1. **系统搜索对特殊字符不友好** — 含下划线的名称可能搜不到，代码已加入截取关键字重试机制
2. **品牌弹窗 checkbox 在左侧固定列** — 不在 `.ag-center-cols-container` 中，需用 `.ag-row[row-id="xxx"]` 定位
3. **详情页与列表页同 URL** — 通过检测 `input#supplier_name` 和取消按钮判断当前处于哪个视图

## 常见问题

### Q: 执行报"未登录，已跳转到登录页"
A: 先运行 `node tools/session_monitor.js` 完成登录，或使用 `/lemo-login` 工作流。

### Q: 品牌弹窗中找不到匹配的品牌
A: 检查 region 参数是否与弹窗中的品牌名完全一致（区分大小写）。日志会列出所有可选品牌。

### Q: 新增后查询仍返回 exists: false
A: 页面可能需要刷新。尝试用供应商代码而非名称查询来验证。

## 相关文件

- `tools/supplier.js` — 核心实现
- `tools/config.js` — 共享配置（`SUPPLIER_URL` 等）
- `tools/debug_browser.js` — 调试浏览器连接
- `skills/lemo-login/SKILL.md` — 登录前置依赖

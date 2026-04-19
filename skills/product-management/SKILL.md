---
name: product-management
description: 乐檬系统商品查询、新增、改名自动化
user-invocable: true
---

# 商品管理

## 交互规范

### 语气
- 用**友好、口语化**的方式和用户沟通，像同事之间对话一样自然
- 不要说"缺少参数"、"需要补充参数"这类程序员术语
- 用"你还需要告诉我…"、"帮我确认一下…"这样的说法

### 参数收集
- 用户提到新增商品时，从用户的话中**主动推导**尽可能多的信息：
  - 商品名称：用户给出的名称
  - 归属区域：根据上下文猜测品牌，不确定时再问
  - 商品类别：根据名称猜测（如含"苹果"→苹果类，含"蓝莓"→莓类），不确定→问
  - 商品类型：不确定→直接拒绝
  - 商品部门：根据商品类别推导（水果类→水果部），不确定→问
  - 基本单位：默认「公斤」
  - 采购单位 + 换算率：默认「件」+「1」
  - 成本核算方式：默认「中心手工指定」
- 如果信息不足，**一次性**问清所有缺少的内容，不要逐个追问
- 问的时候给出推荐选项，格式示例：

> 收到～帮你新增商品「XX苹果」
> 还需要确认几个信息：
> 1. **归属区域** — 要关联哪个品牌？比如：首杨贵州、首杨广东…
> 2. **商品类别** — 我猜是「苹果类」，对吗？
> 3. **商品类型** — 默认「混合商品」，需要改吗？
> 4. **商品部门** — 水果部？
> 5. **基本单位** — 公斤？
> 6. **采购单位** — 件？换算率多少？

### 结果反馈
- 成功时简洁告知结果，例如：「✅ 已新增！商品代码 1101000020，类别苹果类，品牌首杨贵州」
- 失败时说明原因并给出建议，例如：「没有找到这个商品，要不要换个关键词试试？」

### 可用的商品类别（左侧分类树）
| 代码 | 名称 |
|------|------|
| 10 | 水果类 |
| 20 | 食品类 |
| 30 | 非食类 |
| 40 | 生鲜类（不含水果） |
| 90 | 耗材类 |
| 100 | 电商一件代发 |
| 101 | 临时电商类 |

> 注：每个大类下有子分类（如 水果类→苹果类、梨子类、莓类 等），具体子分类需点击展开后查看。
> 用户输入的商品类别可以是子分类名称（如「苹果类」而非「水果类」）。

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

通过 Playwright CDP 连接调试浏览器，自动化操作乐檬系统的商品信息页面，支持：

- **查询** — 按名称或代码搜索商品
- **新增** — 创建商品并关联品牌、设置商品类型、填写单位和换算率
- **改名** — 修改已有商品的名称（仅支持改名）

## 前置条件

1. 调试浏览器已启动（`node tools/connect_debug.js` 或 `/launch-debug-browser`）
2. 已完成乐檬系统登录（`node tools/session_monitor.js` 或 `/lemo-login`）
3. 所有操作在**新建标签页**中执行，完成后自动关闭，不干扰用户当前页面

## 页面地址

```
https://account-new.shouyangfruit.com/galaxy-group/setting-center/product/product-info
```

## 输入参数

| 操作 | 参数 | 必填 | 说明 |
|------|------|------|------|
| 查询 | `name` | ✅ | 商品名称或商品代码 |
| 新增 | `name` | ✅ | 商品名称 |
|      | `region` | ✅ | 归属区域（品牌名，如 `首杨贵州`） |
|      | `category` | ✅ | 商品类别（如 `苹果类`） |
|      | `itemType` | ✅ | 商品类型（如 `混合商品`） |
|      | `department` | ✅ | 商品部门（如 `水果部`） |
|      | `baseUnit` | ✅ | 基本单位（如 `公斤`） |
|      | `purchaseUnit` | ✅ | 采购单位（如 `件`） |
|      | `conversionRate` | ✅ | 换算率（数字，如 `1`） |
|      | `costMode` | ❌ | 成本核算方式（默认 `中心手工指定`） |
| 改名 | `oldNameOrCode` | ✅ | 原商品名称或商品代码 |
|      | `newName` | ✅ | 新商品名称 |

## 核心逻辑

### 1. 商品查询

```
输入: name（商品名称 OR 商品代码）
前置: 检查登录环境（乐檬系统），未登录则打回登录页面

流程:
  1. 打开商品列表页
  2. 查找关键字输入框 (input#keyword)，输入 name
  3. 点击查询按钮 (button[type="submit"])
  4. 解析 ag-Grid 表格行，提取 code/name/category/num
  5. 在结果中精确匹配 name（名称或代码完全一致）
  6. 若完整名称搜索无结果且含特殊字符，自动截取关键部分重试

输出: { exists, rows[], matched }
```

### 2. 商品新增

```
输入: name, region, category, itemType, department, baseUnit, purchaseUnit, conversionRate, costMode(默认:中心手工指定)

流程:
  1. 执行商品查询，判断商品是否已存在

  ── 若已存在 ──
  a. 点击商品的商品代码，进入详情页
  b. 点击下发品牌输入框，在弹窗 (.earth-modal-wrap) 的 ag-Grid 中
     勾选【品牌名】与【归属区域】一致的行，点击确定关闭弹窗
  c. 在详情页下方找到品牌名称与归属区域一致的数据行，
     点击同行的商品类型 earth-select，选择与【商品类型】一致的数据项
  d. 点击保存

  ── 若不存在 ──
  a. 点击左侧商品类别下的分类树，搜索并点击与【商品类别】一致的节点，
     从节点文本（格式 "代码|名称"）中提取商品类别代码
  b. 点击商品代码列头两次（降序排列），获取该分类下最大商品代码，
     顺序号 +1 生成新代码。代码格式：[商品类别代码]+[中间补0]+[顺序号]，总长10位
  c. 点击新增按钮
  d. 填写表单：
     - 商品代码：步骤 b 计算出的新代码
     - 商品名称：输入参数 name
     - 所属品牌：点击下发品牌弹窗，勾选【品牌名】与【归属区域】一致的行
     - 成本核算方式：选择与输入参数一致的下拉项
     - 商品部门：选择与输入参数一致的下拉项
     - 基本单位：在 lemon-popup 弹窗中选择与输入一致的项
     - 采购单位：选择与输入一致的下拉项，采购换算率填写 conversionRate
     - 配送单位 = 采购单位，配送换算率 = 换算率
     - 库存单位 = 采购单位，库存换算率 = 换算率
     - 批发单位 = 采购单位，批发换算率 = 换算率
  e. 再次点击下发品牌弹窗，确认勾选【归属区域】对应品牌
  f. 找到品牌名称与归属区域一致的数据行，设置商品类型
  g. 点击保存，返回新增结果
```

### 3. 商品改名（更新）

```
输入: oldNameOrCode（原商品名称或商品代码）, newName（现商品名称）
注意: 仅支持商品改名

流程:
  1. 执行商品查询，判断商品是否存在

  ── 若存在 ──
  a. 点击商品的商品代码，进入详情页
  b. 在商品名称输入框 (input#item_name) 输入新名称
  c. 检查下发品牌值是否是单个值：
     - 是 → 继续保存
     - 不是 → 返回警告，不保存（取消退出）
  d. 点击保存

  ── 若不存在 ──
  返回 { updated: false, reason: 'not-found' }
```

## 使用方式

### CLI

```bash
# 查询
node tools/product.js query "怡森苹果"
node tools/product.js query "150201"

# 新增（全部参数）
node tools/product.js add "测试苹果" "首杨测试账套" "苹果类" "混合商品" "水果部" "公斤" "件" "1"

# 新增（含可选参数 costMode）
node tools/product.js add "测试苹果" "首杨测试账套" "苹果类" "混合商品" "水果部" "公斤" "件" "1" "中心手工指定"

# 改名
node tools/product.js rename "测试苹果" "测试苹果_新名"
node tools/product.js rename "150201" "测试苹果_新名"
```

### 代码调用

```js
const { queryProduct, addProduct, updateProductName } = require('./tools/product');

// 查询
const result = await queryProduct({ name: '怡森苹果' });
// result: { exists: true, rows: [...], matched: { code, name, category, num } }

// 新增
await addProduct({
  name: '测试苹果',
  region: '首杨测试账套',
  category: '苹果类',
  itemType: '混合商品',
  department: '水果部',
  baseUnit: '公斤',
  purchaseUnit: '件',
  conversionRate: 1,
  costMode: '中心手工指定',  // 可选
});

// 改名
await updateProductName({ oldNameOrCode: '测试苹果', newName: '测试苹果_改名' });
```

## 页面技术栈

| 组件 | 技术 |
|------|------|
| UI 框架 | Earth（基于 Ant Design 定制，class 前缀 `earth-`） |
| 表格 | ag-Grid（列通过 `col-id` 属性标识） |
| 分类树 | `.earth-tree` + `.earth-tree-treenode`，节点文本格式 `代码\|名称` |
| 品牌弹窗 | `.earth-modal-wrap`，内嵌 ag-Grid，checkbox 在左侧固定列（`.ag-pinned-left-cols-container`） |
| 表单字段 | `.earth-form-item`，label 通过 `for` 属性关联 input |
| 下拉选择 | `.earth-select`，选项在 `.earth-select-dropdown .earth-select-item` |
| 弹窗选择 | `.lemon-popup-wrapper` 触发，弹出 `.earth-modal-wrap` |
| 开关组件 | `button[role="switch"]`，状态通过 `aria-checked` 判断 |

## 关键选择器速查

```js
// 列表页
keywordInput:      'input#keyword'                              // placeholder="代码 | 速记码 | 名称"
queryBtn:          'button[type="submit"].earth-btn-primary'    // "查 询"
addBtn:            'button.earth-btn-primary:has-text("新 增")'
treeNodeTitle:     '.earth-tree-title'                          // 节点文本格式 "代码|名称"
agRow:             '.ag-center-cols-container .ag-row'
agCellCode:        '[col-id="item_code"]'                      // 内含 <a> 可点击
agCellName:        '[col-id="item_name"]'
agCellCategory:    '[col-id="category_name"]'
agHeaderCode:      '.ag-header-cell[col-id="item_code"]'       // 点击可排序

// 详情/新增页
detailCode:        'input#item_code'
detailName:        'input#item_name'
detailPinyin:      'input#pinyin'
detailCostMode:    '#item_cost_mode'                            // earth-select
detailDept:        '#departments'                               // earth-select
detailPurchaseUnit:'#item_purchase_unit'                        // earth-select
detailPurchaseRate:'input#item_purchase_rate'
detailTransferUnit:'#item_transfer_unit'
detailTransferRate:'input#item_transfer_rate'
detailInventoryUnit:'#item_inventory_unit'
detailInventoryRate:'input#item_inventory_rate'
detailWholesaleUnit:'#item_wholesale_unit'
detailWholesaleRate:'input#item_wholesale_rate'
baseUnitPopup:     '.earth-form-item:has(label:has-text("基本单位")) .lemon-popup-wrapper'
brandPopupTrigger: '.earth-form-item:has(label:has-text("下发品牌")) .lemon-popup-wrapper'
saveBtn:           'button.earth-btn-primary:has-text("保 存")'
cancelBtn:         'button.earth-btn-default:has-text("取 消")'

// 品牌弹窗
brandModal:        '.earth-modal-wrap'
brandModalRow:     '.earth-modal-wrap .ag-center-cols-container .ag-row'  // col-id: company_id, name
brandModalCheckbox:'.earth-modal-wrap .ag-pinned-left-cols-container .ag-row[row-id="xxx"] input[type="checkbox"]'
brandModalOk:      '.earth-modal-wrap button.earth-btn-primary:has-text("确 定")'

// 详情页下方品牌+类型行
brandNameInput:    '.earth-form-item:has(label:has-text("品牌名称")) input'   // disabled, val=品牌名
itemTypeSelect:    '#item_types_N_item_type'                    // N=0,1,2... 对应每个品牌行
```

## 商品代码生成规则

| 字段 | 说明 |
|------|------|
| 总长度 | 10 位 |
| 格式 | `[商品类别代码]` + `[中间补0]` + `[顺序号]` |
| 示例 | 类别代码 `1101`（苹果类），当前最大 `1101000016` → 新代码 `1101000017` |
| 获取方式 | 点击商品代码列头两次（降序），取分类下最大代码的顺序号 +1 |

## 已知限制

1. **系统搜索对特殊字符不友好** — 含下划线的名称可能搜不到，代码已加入截取关键字重试机制
2. **品牌弹窗 checkbox 在左侧固定列** — 不在 `.ag-center-cols-container` 中，需用 `.ag-pinned-left-cols-container .ag-row[row-id="xxx"]` 定位
3. **详情页与列表页同 URL** — 通过检测 `input#item_name` 和取消按钮判断当前处于哪个视图
4. **换算率字段** — 选完单位后可能需等待字段变为可编辑
5. **商品类型行与品牌一一对应** — 品牌名称 input（disabled）与商品类型 select 成对出现，通过遍历 `.earth-form-item` 按 label 和 value 匹配

## 常见问题

### Q: 执行报"未登录，已跳转到登录页"
A: 先运行 `node tools/session_monitor.js` 完成登录，或使用 `/lemo-login` 工作流。

### Q: 品牌弹窗中找不到匹配的品牌
A: 检查 region 参数是否与弹窗中的品牌名完全一致。日志会列出所有可选品牌。

### Q: 商品类型下拉框找不到选项
A: 确认 itemType 参数与下拉框中的选项文本完全一致。日志会列出可选项。

### Q: 新增后查询仍返回 exists: false
A: 页面可能需要刷新。尝试用商品代码而非名称查询来验证。

### Q: 改名时提示"多品牌警告"
A: 当下发品牌有多个值时，改名操作会被中止并返回警告，需手动处理。

## 相关文件

- `tools/product.js` — 核心实现
- `tools/config.js` — 共享配置（`PRODUCT_URL` 等）
- `tools/debug_browser.js` — 调试浏览器连接
- `skills/lemo-login/SKILL.md` — 登录前置依赖

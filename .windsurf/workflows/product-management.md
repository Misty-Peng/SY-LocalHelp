---
description: 乐檬系统商品查询、新增、改名自动化
---

# product-management

完整说明见 SKILL：`skills/product-management/SKILL.md`

## 查询商品

// turbo
```bash
node tools/product.js query "商品名或代码"
```

## 新增商品

```bash
node tools/product.js add "商品名称" "归属区域" "商品类别" "商品类型" "商品部门" "基本单位" "采购单位" "换算率" "成本核算方式"
```

## 商品改名

```bash
node tools/product.js rename "旧名或代码" "新名称"
```

## 前置条件

1. 调试浏览器已启动：`node tools/connect_debug.js`
2. 已完成登录：`node tools/session_monitor.js`

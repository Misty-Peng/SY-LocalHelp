const { ensureDebugBrowser, connectCDP, DEFAULT_DEBUG_PORT, safeDisconnect } = require('./debug_browser');
const { PRODUCT_URL } = require('./config');

// ─── helpers ────────────────────────────────────────────────
function ts() { return new Date().toISOString(); }
function log(tag, msg) { console.log(`[${ts()}] [product] ${tag} ${msg}`); }

// ─── 页面选择器（基于 earth-* + ag-Grid DOM 探测结果） ──────
const S = {
  // 列表页 — 搜索区
  keywordInput:    'input#keyword',                             // placeholder="代码 | 速记码 | 名称"
  queryBtn:        'button[type="submit"].earth-btn-primary',   // "查 询"
  resetBtn:        'form button.earth-btn-default',             // "重 置"

  // 列表页 — 左侧分类树
  treeNode:        '.earth-tree .earth-tree-treenode',
  treeNodeTitle:   '.earth-tree-title',
  treeSearchInput: 'input[placeholder*="代码"]',                // 分类树上方搜索框

  // 列表页 — ag-Grid 表格
  agRow:           '.ag-center-cols-container .ag-row',
  agCellCode:      '[col-id="item_code"]',
  agCellName:      '[col-id="item_name"]',
  agCellCategory:  '[col-id="category_name"]',
  agCellNum:       '[col-id="item_num"]',
  agHeaderCode:    '.ag-header-cell[col-id="item_code"]',

  // 列表页 — 操作按钮
  addBtn:          'button.earth-btn-primary:has-text("新 增")',

  // 详情/新增页 — 表单字段
  detailNum:       'input#item_num',
  detailCode:      'input#item_code',
  detailName:      'input#item_name',
  detailPinyin:    'input#pinyin',
  detailEnName:    'input#item_en_name',
  detailCostMode:  '#item_cost_mode',                           // earth-select
  detailDept:      '#departments',                              // earth-select (也含 popup)
  detailPurchaseUnit: '#item_purchase_unit',                    // earth-select
  detailPurchaseRate: 'input#item_purchase_rate',
  detailTransferUnit: '#item_transfer_unit',
  detailTransferRate: 'input#item_transfer_rate',
  detailInventoryUnit:'#item_inventory_unit',
  detailInventoryRate:'input#item_inventory_rate',
  detailWholesaleUnit:'#item_wholesale_unit',
  detailWholesaleRate:'input#item_wholesale_rate',
  enableSwitch:    'button#enable_flag[role="switch"]',

  // 详情/新增页 — 商品类别（弹窗选择器）
  categoryPopup:   '.earth-form-item:has(label:has-text("商品类别")) .lemon-popup-wrapper',
  // 基本单位（弹窗选择器）
  baseUnitPopup:   '.earth-form-item:has(label:has-text("基本单位")) .lemon-popup-wrapper',

  // 详情/新增页 — 下发品牌
  brandPopupTrigger:'.earth-form-item:has(label:has-text("下发品牌")) .lemon-popup-wrapper',

  // 详情/新增页 — 按钮
  saveBtn:         'button.earth-btn-primary:has-text("保 存")',
  cancelBtn:       'button.earth-btn-default:has-text("取 消")',

  // 品牌弹窗（earth-modal，内部 ag-Grid）
  brandModal:      '.earth-modal-wrap',
  brandModalRow:   '.earth-modal-wrap .ag-center-cols-container .ag-row',
  brandModalOk:    '.earth-modal-wrap button.earth-btn-primary:has-text("确 定")',
  brandModalCancel:'.earth-modal-wrap button.earth-btn-default:has-text("取 消")',
};

// ─── 导航 & 登录检查 ───────────────────────────────────────
async function gotoProductList(page) {
  if (!page.url().startsWith(PRODUCT_URL)) {
    log('NAV', `打开商品列表: ${PRODUCT_URL}`);
    await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  if (/\/user\/login/.test(page.url())) {
    throw new Error('未登录，已跳转到登录页，请先执行 session_monitor 完成登录');
  }
  // 关闭可能打开的弹窗
  const modal = await page.$(S.brandModal + ':not([style*="display: none"])');
  if (modal) {
    log('NAV', '检测到弹窗，先关闭');
    const modalCancel = await page.$(S.brandModalCancel);
    if (modalCancel) {
      await modalCancel.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(1000);
  }
  // 如果当前在详情页（有取消按钮），先返回列表
  const cancelBtn = await page.$(S.cancelBtn);
  if (cancelBtn) {
    log('NAV', '当前在详情页，先返回列表');
    await cancelBtn.click();
    await page.waitForTimeout(1000);
  }
  log('NAV', `已到达商品列表页: ${page.url()}`);
}

// ─── 查询（内部，不做导航） ────────────────────────────────
async function _searchAndParse(page, keyword) {
  const kw = await page.waitForSelector(S.keywordInput, { timeout: 15000 });
  log('QUERY', `输入关键字: ${keyword}`);
  await kw.fill('');
  await kw.type(keyword, { delay: 30 });

  const btn = await page.waitForSelector(S.queryBtn, { timeout: 10000 });
  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('product') && resp.status() === 200).catch(() => null),
    btn.click(),
  ]);
  await page.waitForTimeout(1500);

  const rows = await page.$$eval(S.agRow, (rowEls) =>
    rowEls.map(row => ({
      code:     (row.querySelector('[col-id="item_code"]') || {}).textContent || '',
      name:     (row.querySelector('[col-id="item_name"]') || {}).textContent || '',
      category: (row.querySelector('[col-id="category_name"]') || {}).textContent || '',
      num:      (row.querySelector('[col-id="item_num"]') || {}).textContent || '',
    }))
  );
  log('QUERY', `结果行数: ${rows.length}`);
  rows.forEach((r, i) => log('QUERY', `  [${i}] code=${r.code} name=${r.name} category=${r.category}`));
  return rows;
}

// ─── 商品查询 ───────────────────────────────────────────────
async function queryProduct(page, { name }) {
  await gotoProductList(page);

  let rows = await _searchAndParse(page, name);
  let matched = rows.find(r => r.name === name || r.code === name) || null;

  // 特殊字符重试
  if (!matched && rows.length === 0 && name.length > 4) {
    const shortName = name.replace(/[_\-|]/g, '').slice(0, 6);
    log('QUERY', `完整名称无结果，用缩短关键字重试: ${shortName}`);
    rows = await _searchAndParse(page, shortName);
    matched = rows.find(r => r.name === name || r.code === name) || null;
  }

  return { exists: !!matched, rows, matched };
}

// ─── 点击商品代码进入详情 ─────────────────────────────────
async function openDetail(page, code) {
  log('DETAIL', `点击商品代码: ${code}`);
  const link = page.locator(`${S.agRow} ${S.agCellCode} a`, { hasText: code });
  await link.first().click();
  await page.waitForSelector(S.detailName, { timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  log('DETAIL', '已进入详情页');
}

// ─── 下发品牌弹窗：勾选匹配 region 的行 ────────────────────
async function pickBrand(page, region) {
  log('BRAND', `点击下发品牌，打开弹窗`);
  await page.locator(S.brandPopupTrigger).first().click();
  await page.waitForSelector(S.brandModal, { state: 'visible', timeout: 15000 });

  const brandRows = await page.$$eval(S.brandModalRow, (rowEls) =>
    rowEls.map((row, i) => {
      const cells = Array.from(row.querySelectorAll('.ag-cell'));
      const texts = cells.map(c => c.textContent.trim()).filter(Boolean);
      const checkbox = row.querySelector('input[type="checkbox"]');
      return {
        index: i,
        texts,
        checked: checkbox ? checkbox.checked : false,
        rowId: row.getAttribute('row-id'),
      };
    })
  );
  log('BRAND', `弹窗中共 ${brandRows.length} 个品牌:`);
  brandRows.forEach(r => log('BRAND', `  [${r.index}] texts=${JSON.stringify(r.texts)} checked=${r.checked}`));

  const target = brandRows.find(r => r.texts.some(t => t === region));
  if (!target) {
    const available = brandRows.map(r => r.texts.join('|')).join(', ');
    throw new Error(`未找到品牌名为 "${region}" 的行，可选: ${available}`);
  }

  if (!target.checked) {
    log('BRAND', `勾选品牌: ${target.texts.join('|')} (row-id=${target.rowId})`);
    // checkbox 在左侧固定列
    const checkbox = page.locator(`.earth-modal-wrap .ag-pinned-left-cols-container .ag-row[row-id="${target.rowId}"] input[type="checkbox"]`);
    await checkbox.click();
    await page.waitForTimeout(500);
  } else {
    log('BRAND', `品牌已勾选: ${target.texts.join('|')}`);
  }

  await page.locator(S.brandModalOk).click();
  await page.waitForSelector(S.brandModal, { state: 'hidden', timeout: 15000 }).catch(() => {});
  log('BRAND', '品牌弹窗已关闭');
}

// ─── 选择商品类型（详情页下方品牌行的 earth-select） ────────
async function pickItemType(page, region, itemType) {
  log('TYPE', `查找品牌名称="${region}"的数据行，设置商品类型="${itemType}"`);

  // 品牌行结构：label="品牌名称" + label="商品类型" 成对出现
  // 品牌名称 input 的 val 等于 region，其下一个 earth-form-item 就是对应的商品类型 select
  const formItems = await page.$$('.earth-form-item');
  let targetSelectId = null;

  for (let i = 0; i < formItems.length; i++) {
    const label = await formItems[i].$eval('label', el => el.textContent.trim()).catch(() => '');
    if (label === '品牌名称') {
      const val = await formItems[i].$eval('input', el => el.value).catch(() => '');
      if (val === region) {
        // 下一个 form-item 应该是商品类型
        if (i + 1 < formItems.length) {
          const nextLabel = await formItems[i + 1].$eval('label', el => el.textContent.trim()).catch(() => '');
          if (nextLabel === '商品类型') {
            targetSelectId = await formItems[i + 1].$eval('input', el => el.id).catch(() => null);
            log('TYPE', `找到匹配行: 品牌="${val}" → 商品类型 inputId=${targetSelectId}`);
            break;
          }
        }
      }
    }
  }

  if (!targetSelectId) {
    throw new Error(`未找到品牌名称为 "${region}" 的商品类型选择框`);
  }

  // 点击 select，选择选项
  await selectDropdownOption(page, `#${targetSelectId}`, itemType);
  log('TYPE', `商品类型已设置为: ${itemType}`);
}

// ─── earth-select 通用下拉选择 ─────────────────────────────
async function selectDropdownOption(page, selectInputSelector, optionText) {
  log('SELECT', `选择: selector=${selectInputSelector} option="${optionText}"`);
  const input = page.locator(selectInputSelector);
  await input.click();
  await page.waitForTimeout(500);

  // earth-select 下拉选项在 .earth-select-dropdown 中
  const option = page.locator(`.earth-select-dropdown .earth-select-item[title="${optionText}"]`);
  const optionCount = await option.count();

  if (optionCount === 0) {
    // 尝试模糊匹配
    const optionFuzzy = page.locator(`.earth-select-dropdown .earth-select-item`, { hasText: optionText });
    const fuzzyCount = await optionFuzzy.count();
    if (fuzzyCount > 0) {
      await optionFuzzy.first().click();
    } else {
      // 列出所有可选项
      const allOptions = await page.$$eval('.earth-select-dropdown .earth-select-item', els =>
        els.map(el => el.textContent.trim())
      );
      log('SELECT', `可选项: ${JSON.stringify(allOptions)}`);
      throw new Error(`下拉框中未找到选项 "${optionText}"，可选: ${allOptions.join(', ')}`);
    }
  } else {
    await option.first().click();
  }
  await page.waitForTimeout(500);
}

// ─── lemon-popup 弹窗选择（商品类别、基本单位等） ───────────
async function selectPopupOption(page, popupSelector, optionText) {
  log('POPUP', `点击弹窗触发器: ${popupSelector}, 选择 "${optionText}"`);
  await page.locator(popupSelector).first().click();
  await page.waitForTimeout(1000);

  // 弹窗可能是一个 modal 或 dropdown 面板
  const modal = await page.$('.earth-modal-wrap:not([style*="display: none"])');
  if (modal) {
    // 在 ag-Grid 弹窗中查找
    const rows = await page.$$eval('.earth-modal-wrap .ag-center-cols-container .ag-row', (rowEls) =>
      rowEls.map((row, i) => {
        const cells = Array.from(row.querySelectorAll('.ag-cell'));
        const texts = cells.map(c => c.textContent.trim()).filter(Boolean);
        return { index: i, texts, fullText: row.textContent.trim(), rowId: row.getAttribute('row-id') };
      })
    );
    log('POPUP', `弹窗中共 ${rows.length} 行`);

    const target = rows.find(r => r.texts.some(t => t === optionText) || r.fullText.includes(optionText));
    if (!target) {
      const available = rows.map(r => r.texts.join('|')).join(', ');
      throw new Error(`弹窗中未找到 "${optionText}"，可选: ${available}`);
    }

    // 点击该行
    const rowEl = page.locator(`.earth-modal-wrap .ag-center-cols-container .ag-row[row-id="${target.rowId}"]`);
    await rowEl.click();
    await page.waitForTimeout(500);

    // 点确定（如果有）
    const okBtn = await page.$('.earth-modal-wrap button.earth-btn-primary:has-text("确 定")');
    if (okBtn) {
      await okBtn.click();
      await page.waitForSelector('.earth-modal-wrap', { state: 'hidden', timeout: 10000 }).catch(() => {});
    }
  } else {
    // 可能是 tree-select 或 dropdown 面板
    const dropdownItem = page.locator(`.earth-select-dropdown .earth-select-item`, { hasText: optionText });
    const count = await dropdownItem.count();
    if (count > 0) {
      await dropdownItem.first().click();
    } else {
      // 尝试在 earth-tree-select 的 tree 中查找
      const treeItem = page.locator(`.earth-select-tree-node-content-wrapper`, { hasText: optionText });
      const treeCount = await treeItem.count();
      if (treeCount > 0) {
        await treeItem.first().click();
      } else {
        throw new Error(`弹窗/下拉中未找到 "${optionText}"`);
      }
    }
    await page.waitForTimeout(500);
  }
  log('POPUP', `已选择: "${optionText}"`);
}

// ─── 左侧树：点击商品类别，返回类别代码 ─────────────────────
async function clickTreeCategory(page, categoryName) {
  log('TREE', `点击左侧分类: ${categoryName}`);

  // 先尝试搜索分类树
  const searchInput = await page.$(S.treeSearchInput);
  if (searchInput) {
    await searchInput.fill('');
    await searchInput.type(categoryName, { delay: 30 });
    await page.waitForTimeout(1000);
  }

  const treeNodes = page.locator(`${S.treeNode} ${S.treeNodeTitle}`);
  const count = await treeNodes.count();
  let clicked = false;
  let categoryCode = '';

  for (let i = 0; i < count; i++) {
    const text = await treeNodes.nth(i).textContent();
    if (text.includes(categoryName)) {
      log('TREE', `匹配节点: "${text}"`);
      // 提取分类代码（格式: "代码|名称"）
      const parts = text.split('|');
      if (parts.length >= 2) {
        categoryCode = parts[0].trim();
      }
      await treeNodes.nth(i).click();
      await page.waitForTimeout(1500);
      clicked = true;
      break;
    }
  }

  if (!clicked) {
    throw new Error(`左侧树中未找到包含 "${categoryName}" 的节点`);
  }

  // 清空搜索（如果之前输入了）
  if (searchInput) {
    await searchInput.fill('');
    await page.waitForTimeout(500);
  }

  log('TREE', `商品类别代码: ${categoryCode}`);
  return categoryCode;
}

// ─── 获取当前分类下最大商品代码 ──────────────────────────────
async function getMaxItemCode(page, categoryCode) {
  log('CODE', `获取分类 "${categoryCode}" 下最大商品代码`);

  // 点击商品代码列头两次，降序排列
  const header = page.locator(S.agHeaderCode);
  await header.click();
  await page.waitForTimeout(1000);
  await header.click();
  await page.waitForTimeout(1500);

  // 读取所有可见行的商品代码
  const codes = await page.$$eval(S.agRow, (rowEls, prefix) => {
    return rowEls
      .map(row => (row.querySelector('[col-id="item_code"]') || {}).textContent || '')
      .filter(code => code.startsWith(prefix));
  }, categoryCode);

  log('CODE', `以 "${categoryCode}" 开头的商品代码: ${codes.slice(0, 10).join(', ')}${codes.length > 10 ? '...' : ''}`);

  if (codes.length === 0) {
    // 没有该分类下的商品，返回初始代码
    const targetLen = 10;
    const seqLen = targetLen - categoryCode.length;
    const newCode = categoryCode + '0'.repeat(seqLen - 1) + '1';
    log('CODE', `分类下无商品，生成初始代码: ${newCode}`);
    return newCode;
  }

  // 找最大的代码
  const maxCode = codes.sort().reverse()[0];
  log('CODE', `当前最大代码: ${maxCode}`);

  // 顺序号 +1
  const seqPart = maxCode.slice(categoryCode.length);
  const seqNum = parseInt(seqPart, 10) + 1;
  const targetLen = 10;
  const seqLen = targetLen - categoryCode.length;
  const newCode = categoryCode + String(seqNum).padStart(seqLen, '0');
  log('CODE', `新商品代码: ${newCode}`);
  return newCode;
}

// ─── 保存并验证 ─────────────────────────────────────────────
async function clickSaveAndVerify(page, action) {
  log('SAVE', `[${action}] 点击保存…`);

  const [resp] = await Promise.all([
    page.waitForResponse(
      r => /product/.test(r.url()) && ['POST', 'PUT', 'PATCH'].includes(r.request().method()),
      { timeout: 30000 }
    ).catch(() => null),
    page.locator(S.saveBtn).click(),
  ]);

  if (resp) {
    const status = resp.status();
    let body = null;
    try { body = await resp.json(); } catch { /* 非 JSON */ }
    log('SAVE', `[${action}] 接口响应: HTTP ${status}`);
    if (status >= 400) {
      const errMsg = body?.message || body?.msg || `HTTP ${status}`;
      log('SAVE', `[${action}] ❌ 接口返回错误: ${errMsg}`);
      return { ok: false, error: errMsg };
    }
    if (body && (body.success === false || (body.code !== undefined && body.code !== 0 && body.code !== 200))) {
      const errMsg = body.message || body.msg || JSON.stringify(body);
      log('SAVE', `[${action}] ❌ 业务返回失败: ${errMsg}`);
      return { ok: false, error: errMsg };
    }
  } else {
    log('SAVE', `[${action}] ⚠️ 未捕获到保存接口响应，继续等待页面反馈`);
  }

  const msgEl = await page.waitForSelector('.earth-message-notice, .earth-message', { timeout: 10000 }).catch(() => null);
  if (msgEl) {
    const msgText = await msgEl.textContent().catch(() => '');
    log('SAVE', `[${action}] 页面提示: "${msgText.trim()}"`);
  }

  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  log('SAVE', `[${action}] ✅ 保存完成`);
  return { ok: true };
}

// ─── 商品新增 ───────────────────────────────────────────────
async function addProduct(page, {
  name,           // 商品名称
  region,         // 归属区域（品牌名）
  category,       // 商品类别
  itemType,       // 商品类型
  department,     // 商品部门
  baseUnit,       // 基本单位
  purchaseUnit,   // 采购单位
  conversionRate, // 换算率
  costMode = '中心手工指定', // 成本核算方式
}) {
  await gotoProductList(page);

  // 1. 先查询是否已存在
  const result = await queryProduct(page, { name });

  if (result.exists) {
    // ── 已存在：补充品牌 + 设置商品类型 ──
    log('ADD', `商品 "${name}" 已存在(code=${result.matched.code})，进入详情补充品牌`);
    await openDetail(page, result.matched.code);

    // a. 下发品牌弹窗
    await pickBrand(page, region);

    // b. 设置商品类型
    await pickItemType(page, region, itemType);

    // c. 保存
    const saveResult = await clickSaveAndVerify(page, '更新品牌+类型');
    if (!saveResult.ok) {
      return { added: false, updated: false, error: saveResult.error };
    }
    log('ADD', '已保存（已存在，更新品牌+商品类型）');
    return { added: false, updated: true, code: result.matched.code, reason: 'already-exists-brand-updated' };
  }

  // 2. 不存在 → 新增流程
  log('ADD', `商品 "${name}" 不存在，开始新增`);

  // a. 点击左侧商品类别，获取类别代码
  const categoryCode = await clickTreeCategory(page, category);

  // b. 获取最大商品代码并+1
  const newItemCode = await getMaxItemCode(page, categoryCode);

  // c. 点击新增按钮
  await page.locator(S.addBtn).click();
  await page.waitForSelector(S.detailName, { timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  log('ADD', '已打开新增表单');

  // d. 填写表单
  // 商品代码
  const codeInput = page.locator(S.detailCode);
  await codeInput.fill(newItemCode);
  log('ADD', `商品代码: ${newItemCode}`);

  // 商品名称
  const nameInput = page.locator(S.detailName);
  await nameInput.fill(name);
  log('ADD', `商品名称: ${name}`);

  // 所属品牌（下发品牌弹窗）
  await pickBrand(page, region);

  // 成本核算方式
  await selectDropdownOption(page, S.detailCostMode, costMode);
  log('ADD', `成本核算方式: ${costMode}`);

  // 商品部门
  await selectDropdownOption(page, S.detailDept, department);
  log('ADD', `商品部门: ${department}`);

  // 基本单位（lemon-popup-wrapper）
  await selectPopupOption(page, S.baseUnitPopup, baseUnit);
  log('ADD', `基本单位: ${baseUnit}`);

  // 采购单位 + 换算率
  await selectDropdownOption(page, S.detailPurchaseUnit, purchaseUnit);
  const purchaseRateInput = page.locator(S.detailPurchaseRate);
  // 换算率字段初始可能 disabled，选完单位后应该可编辑
  await page.waitForTimeout(500);
  const isDisabled = await purchaseRateInput.isDisabled();
  if (!isDisabled) {
    await purchaseRateInput.fill(String(conversionRate));
  } else {
    log('ADD', `采购换算率字段不可编辑，跳过`);
  }
  log('ADD', `采购单位: ${purchaseUnit}, 换算率: ${conversionRate}`);

  // 配送单位 = 采购单位，配送换算率 = 换算率
  await selectDropdownOption(page, S.detailTransferUnit, purchaseUnit);
  const transferRateInput = page.locator(S.detailTransferRate);
  if (!(await transferRateInput.isDisabled())) {
    await transferRateInput.fill(String(conversionRate));
  }
  log('ADD', `配送单位: ${purchaseUnit}, 换算率: ${conversionRate}`);

  // 库存单位 = 采购单位，库存换算率 = 换算率
  await selectDropdownOption(page, S.detailInventoryUnit, purchaseUnit);
  const inventoryRateInput = page.locator(S.detailInventoryRate);
  if (!(await inventoryRateInput.isDisabled())) {
    await inventoryRateInput.fill(String(conversionRate));
  }
  log('ADD', `库存单位: ${purchaseUnit}, 换算率: ${conversionRate}`);

  // 批发单位 = 采购单位，批发换算率 = 换算率
  await selectDropdownOption(page, S.detailWholesaleUnit, purchaseUnit);
  const wholesaleRateInput = page.locator(S.detailWholesaleRate);
  if (!(await wholesaleRateInput.isDisabled())) {
    await wholesaleRateInput.fill(String(conversionRate));
  }
  log('ADD', `批发单位: ${purchaseUnit}, 换算率: ${conversionRate}`);

  // e. 下发品牌弹窗（再次确认勾选）
  await pickBrand(page, region);

  // f. 设置商品类型
  await pickItemType(page, region, itemType);

  // g. 保存
  const saveResult = await clickSaveAndVerify(page, '新增');
  if (!saveResult.ok) {
    return { added: false, error: saveResult.error };
  }

  log('ADD', `✅ 商品新增完成: code=${newItemCode} name=${name}`);
  return { added: true, code: newItemCode, name };
}

// ─── 商品更新（仅改名） ─────────────────────────────────────
async function updateProductName(page, { oldNameOrCode, newName }) {
  await gotoProductList(page);

  const result = await queryProduct(page, { name: oldNameOrCode });
  if (!result.exists) {
    log('UPDATE', `商品 "${oldNameOrCode}" 不存在`);
    return { updated: false, reason: 'not-found' };
  }

  await openDetail(page, result.matched.code);

  // 修改名称
  const nameInput = page.locator(S.detailName);
  const oldVal = await nameInput.inputValue();
  log('UPDATE', `当前名称: "${oldVal}" → 改为: "${newName}"`);
  await nameInput.fill(newName);

  // 检查下发品牌值是否单个
  const brandInput = await page.$('.earth-form-item:has(label:has-text("下发品牌")) input');
  if (brandInput) {
    const brandVal = await brandInput.evaluate(el => el.value);
    log('UPDATE', `下发品牌值: "${brandVal}"`);
    const brandCount = brandVal.split(',').filter(Boolean).length;
    if (brandCount > 1) {
      log('UPDATE', `⚠️ 下发品牌有 ${brandCount} 个值，返回警告`);
      // 点取消回退修改
      await page.locator(S.cancelBtn).click();
      await page.waitForTimeout(1000);
      return { updated: false, reason: 'multiple-brands', warning: `下发品牌有 ${brandCount} 个值(${brandVal})，请手动处理` };
    }
  }

  // 保存
  const saveResult = await clickSaveAndVerify(page, '改名');
  if (!saveResult.ok) {
    return { updated: false, error: saveResult.error };
  }
  log('UPDATE', '改名保存完成');
  return { updated: true, code: result.matched.code };
}

// ─── 连接包装器（新建标签页执行） ───────────────────────────
async function withConnectedPage(fn) {
  const { info, reused } = await ensureDebugBrowser({ port: DEFAULT_DEBUG_PORT });
  log('BROWSER', `${reused ? '复用' : '启动'}: ${info.Browser}`);
  const { browser, context } = await connectCDP(DEFAULT_DEBUG_PORT);
  const page = await context.newPage();
  log('TAB', '已新建标签页');
  try {
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
    log('TAB', '已关闭标签页');
    await safeDisconnect(browser);
  }
}

module.exports = {
  queryProduct:      (params) => withConnectedPage((page) => queryProduct(page, params)),
  addProduct:        (params) => withConnectedPage((page) => addProduct(page, params)),
  updateProductName: (params) => withConnectedPage((page) => updateProductName(page, params)),
};

// ─── CLI ────────────────────────────────────────────────────
// 查询：node tools/product.js query "商品名或代码"
// 新增：node tools/product.js add "商品名称" "归属区域" "商品类别" "商品类型" "商品部门" "基本单位" "采购单位" "换算率" ["成本核算方式"]
// 改名：node tools/product.js rename "旧名或代码" "新名称"
if (require.main === module) {
  (async () => {
    const [cmd, ...args] = process.argv.slice(2);
    if (!cmd) {
      console.log('用法:');
      console.log('  查询: node tools/product.js query  "商品名或代码"');
      console.log('  新增: node tools/product.js add    "商品名称" "归属区域" "商品类别" "商品类型" "商品部门" "基本单位" "采购单位" "换算率" ["成本核算方式"]');
      console.log('  改名: node tools/product.js rename "旧名或代码" "新名称"');
      process.exit(1);
    }
    if (cmd === 'query') {
      const [name] = args;
      if (!name) { console.error('缺少商品名称或代码'); process.exit(1); }
      const res = await module.exports.queryProduct({ name });
      log('RESULT', JSON.stringify(res, null, 2));
    } else if (cmd === 'add') {
      const [name, region, category, itemType, department, baseUnit, purchaseUnit, conversionRate, costMode] = args;
      if (!name || !region || !category || !itemType || !department || !baseUnit || !purchaseUnit || !conversionRate) {
        console.error('缺少参数: name region category itemType department baseUnit purchaseUnit conversionRate [costMode]');
        process.exit(1);
      }
      const res = await module.exports.addProduct({
        name, region, category, itemType, department, baseUnit, purchaseUnit,
        conversionRate: parseFloat(conversionRate),
        costMode: costMode || '中心手工指定',
      });
      log('RESULT', JSON.stringify(res, null, 2));
    } else if (cmd === 'rename') {
      const [oldNameOrCode, newName] = args;
      if (!oldNameOrCode || !newName) { console.error('缺少参数: oldNameOrCode newName'); process.exit(1); }
      const res = await module.exports.updateProductName({ oldNameOrCode, newName });
      log('RESULT', JSON.stringify(res, null, 2));
    } else {
      console.error('未知命令:', cmd);
      process.exit(1);
    }
  })().catch((e) => {
    console.error('❌ 失败:', e.stack || e.message);
    process.exit(1);
  });
}

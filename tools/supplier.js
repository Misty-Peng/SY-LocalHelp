const { ensureDebugBrowser, connectCDP, DEFAULT_DEBUG_PORT, safeDisconnect } = require('./debug_browser');
const { SUPPLIER_URL } = require('./config');

// ─── helpers ────────────────────────────────────────────────
function ts() { return new Date().toISOString(); }
function log(tag, msg) { console.log(`[${ts()}] [supplier] ${tag} ${msg}`); }

// ─── 真实页面选择器（基于 earth-* + ag-Grid DOM 分析） ─────
const S = {
  // 列表页 — 搜索区
  keywordInput:    'input#keyword',                             // placeholder="代码|速记码|名称"
  queryBtn:        'button[type="submit"].earth-btn-primary',   // 文案 "查 询"
  resetBtn:        'form button.earth-btn-default',             // 文案 "重 置"

  // 列表页 — 左侧分类树
  treeNode:        '.earth-tree .earth-tree-treenode',
  treeNodeTitle:   '.earth-tree-title',

  // 列表页 — ag-Grid 表格
  agRow:           '.ag-center-cols-container .ag-row',
  agCellCode:      '[col-id="supplier_code"]',
  agCellName:      '[col-id="supplier_name"]',
  agCellCategory:  '[col-id="supplier_category"]',
  agCellEnable:    '[col-id="enable_flag"]',

  // 列表页 — 操作按钮
  addBtn:          'button.earth-btn-primary:has-text("新 增")',

  // 详情页 — 表单字段
  detailName:      'input#supplier_name',                       // placeholder="请输入供应商名称"
  detailCode:      'input#supplier_code',
  brandPopup:      '.lemon-popup-wrapper',                      // 所属品牌点击触发弹窗
  enableSwitch:    'button#enable_flag[role="switch"]',         // aria-checked="true" / "false"
  saveBtn:         'button.earth-btn-primary:has-text("保 存")',
  cancelBtn:       'button.earth-btn-default:has-text("取 消")',

  // 品牌弹窗（earth-modal，内部 ag-Grid）
  brandModal:      '.earth-modal-wrap',
  brandModalRow:   '.earth-modal-wrap .ag-center-cols-container .ag-row',
  brandModalOk:    '.earth-modal-wrap button.earth-btn-primary:has-text("确 定")',
  brandModalCancel:'.earth-modal-wrap button.earth-btn-default:has-text("取 消")',
};

// ─── 导航 & 登录检查 ───────────────────────────────────────
async function gotoSupplierList(page) {
  if (!page.url().startsWith(SUPPLIER_URL)) {
    log('NAV', `打开供应商列表: ${SUPPLIER_URL}`);
    await page.goto(SUPPLIER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  if (/\/user\/login/.test(page.url())) {
    throw new Error('未登录，已跳转到登录页，请先执行 session_monitor 完成登录');
  }
  // 如果有弹窗打开，先关闭
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
  log('NAV', `已到达供应商列表页: ${page.url()}`);
}

// ─── 查询（内部，不做导航） ────────────────────────────────
async function _searchAndParse(page, keyword) {
  const kw = await page.waitForSelector(S.keywordInput, { timeout: 15000 });
  log('QUERY', `输入关键字: ${keyword}`);
  await kw.fill('');
  await kw.type(keyword, { delay: 30 });

  const btn = await page.waitForSelector(S.queryBtn, { timeout: 10000 });
  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('supplier') && resp.status() === 200).catch(() => null),
    btn.click(),
  ]);
  await page.waitForTimeout(1500);

  const rows = await page.$$eval(S.agRow, (rowEls) =>
    rowEls.map(row => ({
      code:     (row.querySelector('[col-id="supplier_code"]') || {}).textContent || '',
      name:     (row.querySelector('[col-id="supplier_name"]') || {}).textContent || '',
      category: (row.querySelector('[col-id="supplier_category"]') || {}).textContent || '',
      enabled:  (row.querySelector('[col-id="enable_flag"]') || {}).textContent || '',
    }))
  );
  log('QUERY', `结果行数: ${rows.length}`);
  rows.forEach((r, i) => log('QUERY', `  [${i}] code=${r.code} name=${r.name} category=${r.category} enabled=${r.enabled}`));
  return rows;
}

// ─── 查询 ───────────────────────────────────────────────────
async function querySupplier(page, { name }) {
  await gotoSupplierList(page);

  // 先用完整名称搜索
  let rows = await _searchAndParse(page, name);
  let matched = rows.find(r => r.name === name || r.code === name) || null;

  // 系统搜索可能对特殊字符（下划线等）不友好，若无精确匹配则截取关键部分重试
  if (!matched && rows.length === 0 && name.length > 4) {
    const shortName = name.replace(/[_\-|]/g, '').slice(0, 6);
    log('QUERY', `完整名称无结果，用缩短关键字重试: ${shortName}`);
    rows = await _searchAndParse(page, shortName);
    matched = rows.find(r => r.name === name || r.code === name) || null;
  }

  return { exists: !!matched, rows, matched };
}

// ─── 点击供应商代码进入详情 ─────────────────────────────────
async function openDetail(page, rowIndex = 0) {
  const link = page.locator(`${S.agRow}:nth-child(${rowIndex + 1}) ${S.agCellCode} a`);
  const codeText = await link.textContent();
  log('DETAIL', `点击供应商代码: ${codeText}`);
  await link.click();
  await page.waitForSelector(S.detailName, { timeout: 15000 });
  log('DETAIL', '已进入详情页');
}

// ─── 品牌弹窗：勾选匹配 region 的行 ────────────────────────
async function pickBrand(page, region) {
  // 打开品牌弹窗
  const brandTrigger = page.locator(S.brandPopup).first();
  log('BRAND', `点击所属品牌，打开弹窗`);
  await brandTrigger.click();
  await page.waitForSelector(S.brandModal, { state: 'visible', timeout: 15000 });

  // 在弹窗 ag-Grid 中找到品牌名匹配 region 的行并勾选
  const brandRows = await page.$$eval(S.brandModalRow, (rowEls) =>
    rowEls.map((row, i) => {
      const cells = Array.from(row.querySelectorAll('.ag-cell'));
      const texts = cells.map(c => c.textContent.trim()).filter(Boolean);
      const fullText = row.textContent.trim();
      const checkbox = row.querySelector('input[type="checkbox"]');
      return { index: i, texts, fullText, checked: checkbox ? checkbox.checked : false, rowId: row.getAttribute('row-id') };
    })
  );
  log('BRAND', `弹窗中共 ${brandRows.length} 个品牌:`);
  brandRows.forEach(r => log('BRAND', `  [${r.index}] texts=${JSON.stringify(r.texts)} checked=${r.checked}`));

  const target = brandRows.find(r => r.texts.some(t => t === region) || r.fullText.includes(region));
  if (!target) {
    const available = brandRows.map(r => r.texts.join('|')).join(', ');
    throw new Error(`未找到品牌名为 "${region}" 的行，可选: ${available}`);
  }

  if (!target.checked) {
    log('BRAND', `勾选品牌: ${target.texts.join('|')} (row-id=${target.rowId})`);
    const checkbox = page.locator(`.earth-modal-wrap .ag-row[row-id="${target.rowId}"] input[type="checkbox"]`);
    await checkbox.click();
    await page.waitForTimeout(500);
  } else {
    log('BRAND', `品牌已勾选: ${target.texts.join('|')}`);
  }

  // 确定
  await page.locator(S.brandModalOk).click();
  await page.waitForSelector(S.brandModal, { state: 'hidden', timeout: 15000 }).catch(() => {});
  log('BRAND', '品牌弹窗已关闭');
}

// ─── 左侧树：点击类型节点 ───────────────────────────────────
async function clickTreeType(page, typeName) {
  log('TREE', `点击左侧分类: ${typeName}`);
  // 分类树节点文本格式：如 "03|默认供应商类别"，需要模糊匹配
  const treeNodes = page.locator(`${S.treeNode} ${S.treeNodeTitle}`);
  const count = await treeNodes.count();
  let clicked = false;
  for (let i = 0; i < count; i++) {
    const text = await treeNodes.nth(i).textContent();
    if (text.includes(typeName)) {
      log('TREE', `匹配节点: "${text}"`);
      await treeNodes.nth(i).click();
      await page.waitForTimeout(1500);
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    throw new Error(`左侧树中未找到包含 "${typeName}" 的节点`);
  }
}

// ─── 保存并验证（拦截接口响应 + 等待提示消息） ────────────────
async function clickSaveAndVerify(page, action) {
  log('SAVE', `[${action}] 点击保存…`);

  // 同时监听保存接口响应和页面提示
  const [resp] = await Promise.all([
    page.waitForResponse(
      r => /supplier/.test(r.url()) && ['POST', 'PUT', 'PATCH'].includes(r.request().method()),
      { timeout: 30000 }
    ).catch(() => null),
    page.locator(S.saveBtn).click(),
  ]);

  // 检查接口响应
  if (resp) {
    const status = resp.status();
    let body = null;
    try { body = await resp.json(); } catch { /* 非 JSON 响应 */ }
    log('SAVE', `[${action}] 接口响应: HTTP ${status}`);
    if (status >= 400) {
      const errMsg = body?.message || body?.msg || `HTTP ${status}`;
      log('SAVE', `[${action}] ❌ 接口返回错误: ${errMsg}`);
      return { ok: false, error: errMsg };
    }
    if (body && (body.success === false || body.code !== undefined && body.code !== 0 && body.code !== 200)) {
      const errMsg = body.message || body.msg || JSON.stringify(body);
      log('SAVE', `[${action}] ❌ 业务返回失败: ${errMsg}`);
      return { ok: false, error: errMsg };
    }
  } else {
    log('SAVE', `[${action}] ⚠️ 未捕获到保存接口响应，继续等待页面反馈`);
  }

  // 等待页面提示消息（earth-message）出现
  const msgEl = await page.waitForSelector('.earth-message-notice, .earth-message', { timeout: 10000 }).catch(() => null);
  if (msgEl) {
    const msgText = await msgEl.textContent().catch(() => '');
    log('SAVE', `[${action}] 页面提示: "${msgText.trim()}"`);
  }

  // 等待网络空闲，确保所有请求完成
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  // 额外等待确保后端处理完成
  await page.waitForTimeout(2000);

  log('SAVE', `[${action}] ✅ 保存完成`);
  return { ok: true };
}

// ─── 保存后回列表验证数据存在 ─────────────────────────────────
async function _verifyAfterSave(page, name) {
  log('VERIFY', `回到列表页验证: "${name}"`);
  await gotoSupplierList(page);
  const rows = await _searchAndParse(page, name);
  let matched = rows.find(r => r.name === name) || null;

  // 重试：缩短关键字
  if (!matched && rows.length === 0 && name.length > 4) {
    const shortName = name.replace(/[_\-|]/g, '').slice(0, 6);
    log('VERIFY', `用缩短关键字重试: ${shortName}`);
    const rows2 = await _searchAndParse(page, shortName);
    matched = rows2.find(r => r.name === name) || null;
  }

  return { found: !!matched, code: matched ? matched.code : null };
}

// ─── 供应商新增 ─────────────────────────────────────────────
async function addSupplier(page, { name, type, region }) {
  await gotoSupplierList(page);

  // 1. 先查询是否已存在
  const result = await querySupplier(page, { name });

  if (result.exists) {
    // 已存在 → 点击代码进详情 → 设置品牌 → 保存
    log('ADD', `供应商 "${name}" 已存在，进入详情补充品牌`);
    await openDetail(page, 0);
    await pickBrand(page, region);
    const saveResult = await clickSaveAndVerify(page, '更新品牌');
    if (!saveResult.ok) {
      return { added: false, updated: false, error: saveResult.error };
    }
    log('ADD', '已保存（已存在，更新品牌）');
    return { added: false, updated: true, reason: 'already-exists-brand-updated' };
  }

  // 2. 不存在 → 选类型 → 新增
  log('ADD', `供应商 "${name}" 不存在，开始新增`);
  await clickTreeType(page, type);

  // 点击新增按钮
  await page.locator(S.addBtn).click();
  await page.waitForSelector(S.detailName, { timeout: 15000 });
  log('ADD', '已打开新增表单');

  // 填写供应商名称
  const nameInput = page.locator(S.detailName);
  await nameInput.fill(name);
  log('ADD', `填写供应商名称: ${name}`);

  // 选择品牌（弹出层）
  await pickBrand(page, region);

  // 是否启用 — 确保开启
  const sw = page.locator(S.enableSwitch);
  const checked = await sw.getAttribute('aria-checked');
  if (checked !== 'true') {
    log('ADD', '启用开关未开，点击开启');
    await sw.click();
    await page.waitForTimeout(500);
  } else {
    log('ADD', '启用开关已开');
  }

  // 保存并验证
  const saveResult = await clickSaveAndVerify(page, '新增');
  if (!saveResult.ok) {
    return { added: false, error: saveResult.error };
  }

  // 回到列表页验证数据确实存在
  const verify = await _verifyAfterSave(page, name);
  log('ADD', verify.found
    ? `✅ 验证通过，供应商已入库: code=${verify.code}`
    : `⚠️ 保存接口成功但列表未查到，可能需要等待同步`);
  return { added: true, code: verify.code || null };
}

// ─── 供应商改名 ─────────────────────────────────────────────
async function updateSupplierName(page, { oldNameOrCode, newName }) {
  await gotoSupplierList(page);

  const result = await querySupplier(page, { name: oldNameOrCode });
  if (!result.exists) {
    log('UPDATE', `供应商 "${oldNameOrCode}" 不存在`);
    return { updated: false, reason: 'not-found' };
  }

  await openDetail(page, 0);
  const nameInput = page.locator(S.detailName);
  const oldVal = await nameInput.inputValue();
  log('UPDATE', `当前名称: "${oldVal}" → 改为: "${newName}"`);
  await nameInput.fill(newName);

  const saveResult = await clickSaveAndVerify(page, '改名');
  if (!saveResult.ok) {
    return { updated: false, error: saveResult.error };
  }
  log('UPDATE', '改名保存完成');
  return { updated: true };
}

// ─── 连接包装器（新建标签页执行，不干扰用户当前页面） ────────
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
  querySupplier:    (params) => withConnectedPage((page) => querySupplier(page, params)),
  addSupplier:      (params) => withConnectedPage((page) => addSupplier(page, params)),
  updateSupplierName: (params) => withConnectedPage((page) => updateSupplierName(page, params)),
};

// ─── CLI ────────────────────────────────────────────────────
// 查询：node tools/supplier.js query "供应商名"
// 新增：node tools/supplier.js add   "供应商名" "供应商类型" "归属区域"
// 改名：node tools/supplier.js rename "旧名或代码" "新名称"
if (require.main === module) {
  (async () => {
    const [cmd, ...args] = process.argv.slice(2);
    if (!cmd) {
      console.log('用法:');
      console.log('  查询: node tools/supplier.js query  "供应商名"');
      console.log('  新增: node tools/supplier.js add    "供应商名" "供应商类型" "归属区域"');
      console.log('  改名: node tools/supplier.js rename "旧名或代码" "新名称"');
      process.exit(1);
    }
    if (cmd === 'query') {
      const [name] = args;
      if (!name) { console.error('缺少供应商名称'); process.exit(1); }
      const res = await module.exports.querySupplier({ name });
      log('RESULT', JSON.stringify(res, null, 2));
    } else if (cmd === 'add') {
      const [name, type, region] = args;
      if (!name || !type || !region) { console.error('缺少参数: name type region'); process.exit(1); }
      const res = await module.exports.addSupplier({ name, type, region });
      log('RESULT', JSON.stringify(res, null, 2));
    } else if (cmd === 'rename') {
      const [oldNameOrCode, newName] = args;
      if (!oldNameOrCode || !newName) { console.error('缺少参数: oldNameOrCode newName'); process.exit(1); }
      const res = await module.exports.updateSupplierName({ oldNameOrCode, newName });
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

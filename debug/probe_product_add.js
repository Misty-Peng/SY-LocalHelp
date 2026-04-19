/**
 * 探测商品新增页面 + 左侧分类树 + 下发品牌弹窗的 DOM 结构
 */
const { ensureDebugBrowser, connectCDP, DEFAULT_DEBUG_PORT, safeDisconnect } = require('../tools/debug_browser');

const PRODUCT_URL = 'https://account-new.shouyangfruit.com/galaxy-group/setting-center/product/product-info';

(async () => {
  const { info, reused } = await ensureDebugBrowser({ port: DEFAULT_DEBUG_PORT });
  console.log(`${reused ? '复用' : '启动'}调试浏览器: ${info.Browser}`);
  const { browser, context } = await connectCDP(DEFAULT_DEBUG_PORT);
  const page = await context.newPage();

  try {
    console.log('\n=== 导航到商品信息页 ===');
    await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    if (/\/user\/login/.test(page.url())) { console.log('未登录'); return; }

    // ── 1. 左侧分类树详细结构 ──
    console.log('\n=== 1. 左侧分类树（含子节点） ===');
    const treeData = await page.$$eval('.earth-tree .earth-tree-treenode', els =>
      els.map((el, i) => {
        const title = el.querySelector('.earth-tree-title');
        const switcher = el.querySelector('.earth-tree-switcher');
        return {
          index: i,
          text: title ? title.textContent.trim() : '',
          key: el.getAttribute('data-key') || el.getAttribute('key') || '',
          isLeaf: el.classList.contains('earth-tree-treenode-leaf'),
          level: el.getAttribute('aria-level') || '',
          expanded: switcher ? switcher.classList.contains('earth-tree-switcher_open') : false,
        };
      })
    );
    treeData.forEach(n => console.log(`  [${n.index}] text="${n.text}" key=${n.key} leaf=${n.isLeaf} level=${n.level} expanded=${n.expanded}`));

    // ── 2. 点击 "10|水果类" 展开查看子节点 ──
    console.log('\n=== 2. 展开 "10|水果类" 查看子分类 ===');
    const fruitNode = page.locator('.earth-tree-title:has-text("10|水果类")');
    await fruitNode.click();
    await page.waitForTimeout(2000);

    // 重新获取分类树
    const treeData2 = await page.$$eval('.earth-tree .earth-tree-treenode', els =>
      els.map((el, i) => {
        const title = el.querySelector('.earth-tree-title');
        return {
          index: i,
          text: title ? title.textContent.trim() : '',
          key: el.getAttribute('data-key') || '',
          isLeaf: el.classList.contains('earth-tree-treenode-leaf'),
          level: el.getAttribute('aria-level') || '',
        };
      })
    );
    console.log(`展开后节点数: ${treeData2.length}`);
    treeData2.forEach(n => console.log(`  [${n.index}] text="${n.text}" key=${n.key} leaf=${n.isLeaf} level=${n.level}`));

    // ── 3. 左侧分类树下面有没有搜索输入框 ──
    console.log('\n=== 3. 左侧区域输入框 ===');
    // 可能在树上面有搜索输入框
    const leftInputs = await page.$$eval('.earth-tree-list input, .earth-layout-sider input, .earth-card:first-child input', els =>
      els.map(el => ({
        id: el.id,
        placeholder: el.placeholder,
        type: el.type,
      }))
    );
    console.log(`左侧输入框: ${JSON.stringify(leftInputs)}`);

    // 同时查找带有 "代码 | 名称" placeholder 的输入框
    const treeSearchInput = await page.$('input[placeholder*="代码"]');
    if (treeSearchInput) {
      const ph = await treeSearchInput.getAttribute('placeholder');
      console.log(`分类树搜索框: placeholder="${ph}"`);
    }

    // ── 4. 表格排序：点击商品代码列头2次（降序） ──
    console.log('\n=== 4. 点击商品代码列头排序 ===');
    const codeHeader = page.locator('.ag-header-cell[col-id="item_code"]');
    await codeHeader.click();
    await page.waitForTimeout(1000);
    await codeHeader.click();
    await page.waitForTimeout(1000);

    // 查看排序后的前3行
    const sortedRows = await page.$$eval('.ag-center-cols-container .ag-row', (rowEls) =>
      rowEls.slice(0, 3).map(row => ({
        code: (row.querySelector('[col-id="item_code"]') || {}).textContent || '',
        name: (row.querySelector('[col-id="item_name"]') || {}).textContent || '',
        category: (row.querySelector('[col-id="category_name"]') || {}).textContent || '',
      }))
    );
    console.log('排序后前3行:');
    sortedRows.forEach((r, i) => console.log(`  [${i}] code=${r.code} name=${r.name} category=${r.category}`));

    // ── 5. 点击新增按钮，分析新增表单 ──
    console.log('\n=== 5. 点击新增按钮 ===');
    const addBtn = page.locator('button.earth-btn-primary:has-text("新 增")');
    await addBtn.click();
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // 新增页面的表单项
    console.log('\n=== 6. 新增页表单 (.earth-form-item) ===');
    const addFormItems = await page.$$eval('.earth-form-item', els =>
      els.map(el => {
        const label = el.querySelector('.earth-form-item-label label, .earth-form-item-label');
        const input = el.querySelector('input');
        const selectDiv = el.querySelector('.earth-select');
        const popup = el.querySelector('.lemon-popup-wrapper');
        const required = !!el.querySelector('.earth-form-item-required');
        return {
          label: label ? label.textContent.trim().slice(0, 40) : '',
          inputId: input ? input.id : '',
          inputPh: input ? (input.placeholder || '') : '',
          inputVal: input ? (input.value || '').slice(0, 30) : '',
          inputDisabled: input ? input.disabled : null,
          hasSelect: !!selectDiv,
          hasPopup: !!popup,
          required,
        };
      })
    );
    console.log(`新增页表单项数: ${addFormItems.length}`);
    addFormItems.forEach((f, i) => console.log(`  [${i}] label="${f.label}" id=${f.inputId} ph="${f.inputPh}" val="${f.inputVal}" disabled=${f.inputDisabled} select=${f.hasSelect} popup=${f.hasPopup} required=${f.required}`));

    // 新增页按钮
    console.log('\n=== 7. 新增页按钮 ===');
    const addBtns = await page.$$eval('button', els =>
      els.slice(0, 15).map(el => ({
        text: el.textContent.trim().slice(0, 30),
        type: el.type,
        className: el.className.slice(0, 60),
      }))
    );
    addBtns.forEach((b, i) => console.log(`  [${i}] text="${b.text}" type=${b.type}`));

    // ── 6. 下发品牌弹窗探测 ──
    console.log('\n=== 8. 点击下发品牌触发弹窗 ===');
    // 找到下发品牌的 popup-wrapper
    const brandPopups = await page.$$('.lemon-popup-wrapper');
    console.log(`lemon-popup-wrapper 数量: ${brandPopups.length}`);

    // 找到 label 包含"下发品牌"的 form-item 内的 popup
    const brandTrigger = page.locator('.earth-form-item:has(label:has-text("下发品牌")) .lemon-popup-wrapper');
    const brandCount = await brandTrigger.count();
    console.log(`下发品牌 popup 数量: ${brandCount}`);

    if (brandCount > 0) {
      await brandTrigger.first().click();
      await page.waitForTimeout(2000);

      // 检查是否有弹窗
      const modal = await page.$('.earth-modal-wrap:not([style*="display: none"])');
      if (modal) {
        console.log('品牌弹窗已打开');

        // 分析弹窗内容
        const modalHeaders = await page.$$eval('.earth-modal-wrap .ag-header-cell', els =>
          els.map(el => ({
            colId: el.getAttribute('col-id'),
            text: el.textContent.trim().slice(0, 30),
          }))
        );
        console.log('弹窗列头:');
        modalHeaders.forEach(h => console.log(`  col-id=${h.colId}: "${h.text}"`));

        const modalRows = await page.$$eval('.earth-modal-wrap .ag-center-cols-container .ag-row', (rowEls) =>
          rowEls.map((row, i) => {
            const cells = Array.from(row.querySelectorAll('.ag-cell'));
            return {
              index: i,
              rowId: row.getAttribute('row-id'),
              cells: cells.map(c => ({
                colId: c.getAttribute('col-id'),
                text: c.textContent.trim().slice(0, 40),
              })),
            };
          })
        );
        console.log(`弹窗行数: ${modalRows.length}`);
        modalRows.forEach(r => {
          console.log(`  Row[${r.index}] row-id=${r.rowId}`);
          r.cells.forEach(c => console.log(`    col-id=${c.colId}: "${c.text}"`));
        });

        // 检查 checkbox 位置
        const checkboxInFixed = await page.$$eval('.earth-modal-wrap .ag-pinned-left-cols-container .ag-row', rows =>
          rows.map((row, i) => ({
            index: i,
            rowId: row.getAttribute('row-id'),
            hasCheckbox: !!row.querySelector('input[type="checkbox"]'),
          }))
        );
        console.log('左侧固定列 checkbox:');
        checkboxInFixed.forEach(r => console.log(`  Row[${r.index}] row-id=${r.rowId} hasCheckbox=${r.hasCheckbox}`));

        // 关闭弹窗
        const cancelBtn = await page.$('.earth-modal-wrap button:has-text("取 消")');
        if (cancelBtn) await cancelBtn.click();
        await page.waitForTimeout(1000);
      } else {
        console.log('未检测到弹窗');
      }
    }

    // ── 7. 所属品牌弹窗（商品头部的所属品牌）──
    console.log('\n=== 9. 所属品牌 popup ===');
    const ownerBrandPopup = page.locator('.earth-form-item:has(label:has-text("商品类别")) .lemon-popup-wrapper');
    const ownerCount = await ownerBrandPopup.count();
    console.log(`商品类别 popup 数量: ${ownerCount}`);

    // 检查基本单位 popup
    console.log('\n=== 10. 基本单位 popup ===');
    const unitPopup = page.locator('.earth-form-item:has(label:has-text("基本单位")) .lemon-popup-wrapper');
    const unitCount = await unitPopup.count();
    console.log(`基本单位 popup 数量: ${unitCount}`);
    if (unitCount > 0) {
      await unitPopup.first().click();
      await page.waitForTimeout(2000);
      const unitModal = await page.$('.earth-modal-wrap:not([style*="display: none"])');
      if (unitModal) {
        console.log('基本单位弹窗已打开');
        const unitHeaders = await page.$$eval('.earth-modal-wrap .ag-header-cell', els =>
          els.map(el => ({ colId: el.getAttribute('col-id'), text: el.textContent.trim() }))
        );
        unitHeaders.forEach(h => console.log(`  col-id=${h.colId}: "${h.text}"`));

        const unitRows = await page.$$eval('.earth-modal-wrap .ag-center-cols-container .ag-row', (rowEls) =>
          rowEls.slice(0, 5).map((row, i) => {
            const cells = Array.from(row.querySelectorAll('.ag-cell'));
            return { index: i, cells: cells.map(c => ({ colId: c.getAttribute('col-id'), text: c.textContent.trim() })) };
          })
        );
        unitRows.forEach(r => {
          console.log(`  Row[${r.index}]:`);
          r.cells.forEach(c => console.log(`    col-id=${c.colId}: "${c.text}"`));
        });

        // 关闭
        const cancelBtn2 = await page.$('.earth-modal-wrap button:has-text("取 消")');
        if (cancelBtn2) await cancelBtn2.click();
        await page.waitForTimeout(1000);
      }
    }

  } finally {
    await page.close().catch(() => {});
    await safeDisconnect(browser);
    console.log('\n探测完成');
  }
})().catch(e => {
  console.error('失败:', e.stack || e.message);
  process.exit(1);
});

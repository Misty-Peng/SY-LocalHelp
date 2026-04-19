/**
 * 探测商品信息 - 详情页/新增页 的 DOM 结构
 * 先点击第一行商品代码进入详情页，分析表单结构
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

    if (/\/user\/login/.test(page.url())) {
      console.log('❌ 未登录');
      return;
    }

    // 点击第一行商品代码进入详情
    console.log('\n=== 点击第一行商品代码进入详情 ===');
    const codeLink = page.locator('.ag-center-cols-container .ag-row:first-child [col-id="item_code"] a');
    const codeText = await codeLink.textContent();
    console.log(`点击商品代码: ${codeText}`);
    await codeLink.click();
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // 1. 分析详情页表单
    console.log('\n=== 详情页 - 所有 input ===');
    const inputs = await page.$$eval('input', els =>
      els.map(el => ({
        id: el.id,
        name: el.name,
        placeholder: el.placeholder || '',
        type: el.type,
        value: el.value || '',
        disabled: el.disabled,
        readOnly: el.readOnly,
      }))
    );
    console.log(`输入框数: ${inputs.length}`);
    inputs.forEach((inp, i) => console.log(`  [${i}] id=${inp.id} name=${inp.name} ph="${inp.placeholder}" type=${inp.type} val="${inp.value.slice(0, 30)}" disabled=${inp.disabled}`));

    // 2. 分析 form-item + label
    console.log('\n=== 详情页 - .earth-form-item ===');
    const formItems = await page.$$eval('.earth-form-item', els =>
      els.map(el => {
        const label = el.querySelector('.earth-form-item-label label, .earth-form-item-label');
        const input = el.querySelector('input, select, textarea');
        const selectDiv = el.querySelector('.earth-select');
        const popup = el.querySelector('.lemon-popup-wrapper');
        return {
          label: label ? label.textContent.trim().slice(0, 40) : '',
          inputId: input ? input.id : '',
          inputPh: input ? input.placeholder : '',
          inputVal: input ? input.value?.slice(0, 30) : '',
          hasSelect: !!selectDiv,
          hasPopup: !!popup,
          inputTag: input ? input.tagName : '',
        };
      })
    );
    console.log(`表单项数: ${formItems.length}`);
    formItems.forEach((f, i) => console.log(`  [${i}] label="${f.label}" id=${f.inputId} ph="${f.inputPh}" val="${f.inputVal}" select=${f.hasSelect} popup=${f.hasPopup}`));

    // 3. 分析按钮
    console.log('\n=== 详情页 - 按钮 ===');
    const buttons = await page.$$eval('button', els =>
      els.map(el => ({
        text: el.textContent.trim().slice(0, 30),
        type: el.type,
        id: el.id,
        className: el.className.slice(0, 80),
      }))
    );
    buttons.forEach((b, i) => console.log(`  [${i}] text="${b.text}" type=${b.type} id=${b.id}`));

    // 4. 分析 earth-select 下拉框
    console.log('\n=== 详情页 - earth-select 下拉框 ===');
    const selects = await page.$$eval('.earth-select', els =>
      els.map(el => {
        const label = el.closest('.earth-form-item')?.querySelector('label')?.textContent?.trim() || '';
        const selectedText = el.querySelector('.earth-select-selection-item')?.textContent?.trim() || '';
        const input = el.querySelector('input');
        return {
          label,
          selectedText,
          inputId: input ? input.id : '',
          className: el.className.slice(0, 60),
        };
      })
    );
    console.log(`下拉框数: ${selects.length}`);
    selects.forEach((s, i) => console.log(`  [${i}] label="${s.label}" selected="${s.selectedText}" inputId=${s.inputId}`));

    // 5. 分析 lemon-popup-wrapper
    console.log('\n=== 详情页 - lemon-popup-wrapper ===');
    const popups = await page.$$eval('.lemon-popup-wrapper', els =>
      els.map(el => {
        const label = el.closest('.earth-form-item')?.querySelector('label')?.textContent?.trim() || '';
        const text = el.textContent.trim().slice(0, 60);
        return { label, text };
      })
    );
    console.log(`弹窗触发器数: ${popups.length}`);
    popups.forEach((p, i) => console.log(`  [${i}] label="${p.label}" text="${p.text}"`));

    // 6. 看看有没有下发品牌相关的 ag-Grid 表格（详情页底部）
    console.log('\n=== 详情页 - 下部区域 ag-Grid (下发品牌) ===');
    // 可能有多个 ag-Grid，找出所有
    const grids = await page.$$eval('.ag-root-wrapper', els =>
      els.map((el, i) => {
        const headers = Array.from(el.querySelectorAll('.ag-header-cell'));
        const cols = headers.map(h => ({
          colId: h.getAttribute('col-id'),
          text: h.textContent.trim().slice(0, 30),
        }));
        const rows = Array.from(el.querySelectorAll('.ag-center-cols-container .ag-row'));
        const rowData = rows.slice(0, 5).map(row => {
          const cells = Array.from(row.querySelectorAll('.ag-cell'));
          return cells.map(c => ({
            colId: c.getAttribute('col-id'),
            text: c.textContent.trim().slice(0, 50),
          }));
        });
        return { gridIndex: i, colCount: cols.length, rowCount: rows.length, cols, rowData };
      })
    );
    console.log(`ag-Grid 实例数: ${grids.length}`);
    grids.forEach(g => {
      console.log(`  Grid[${g.gridIndex}] 列数=${g.colCount} 行数=${g.rowCount}`);
      g.cols.forEach(c => console.log(`    col-id=${c.colId}: "${c.text}"`));
      g.rowData.forEach((row, ri) => {
        console.log(`    Row[${ri}]:`);
        row.forEach(c => console.log(`      col-id=${c.colId}: "${c.text}"`));
      });
    });

    // 7. 分析 earth-tabs（详情页可能有标签页切换）
    console.log('\n=== 详情页 - earth-tabs ===');
    const tabs = await page.$$eval('.earth-tabs-tab', els =>
      els.map(el => ({
        text: el.textContent.trim(),
        isActive: el.classList.contains('earth-tabs-tab-active'),
      }))
    );
    console.log(`标签页数: ${tabs.length}`);
    tabs.forEach((t, i) => console.log(`  [${i}] "${t.text}" active=${t.isActive}`));

  } finally {
    await page.close().catch(() => {});
    await safeDisconnect(browser);
    console.log('\n探测完成');
  }
})().catch(e => {
  console.error('❌ 失败:', e.stack || e.message);
  process.exit(1);
});

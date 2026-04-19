/**
 * 探测商品信息页面（product-info）的 DOM 结构，辅助编写自动化选择器
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

    const url = page.url();
    console.log(`当前URL: ${url}`);

    if (/\/user\/login/.test(url)) {
      console.log('❌ 未登录，请先执行 session_monitor');
      return;
    }

    // 1. 分析左侧分类树
    console.log('\n=== 左侧分类树 ===');
    const treeNodes = await page.$$eval('.earth-tree .earth-tree-treenode .earth-tree-title', els =>
      els.map((el, i) => ({ index: i, text: el.textContent.trim() }))
    );
    console.log(`树节点数: ${treeNodes.length}`);
    treeNodes.forEach(n => console.log(`  [${n.index}] ${n.text}`));

    // 2. 分析搜索区域
    console.log('\n=== 搜索区域 ===');
    const inputs = await page.$$eval('form input, input[type="text"], input[placeholder]', els =>
      els.slice(0, 20).map(el => ({
        id: el.id,
        name: el.name,
        placeholder: el.placeholder,
        type: el.type,
        className: el.className.slice(0, 80),
        tagName: el.tagName,
      }))
    );
    console.log(`输入框数: ${inputs.length}`);
    inputs.forEach((inp, i) => console.log(`  [${i}] id=${inp.id} name=${inp.name} placeholder="${inp.placeholder}" type=${inp.type}`));

    // 3. 分析按钮
    console.log('\n=== 按钮 ===');
    const buttons = await page.$$eval('button', els =>
      els.slice(0, 30).map(el => ({
        text: el.textContent.trim().slice(0, 30),
        type: el.type,
        className: el.className.slice(0, 80),
        id: el.id,
      }))
    );
    console.log(`按钮数: ${buttons.length}`);
    buttons.forEach((b, i) => console.log(`  [${i}] text="${b.text}" type=${b.type} id=${b.id} class=${b.className}`));

    // 4. 分析 ag-Grid 表格列
    console.log('\n=== ag-Grid 表格列头 ===');
    const headers = await page.$$eval('.ag-header-cell', els =>
      els.map(el => ({
        colId: el.getAttribute('col-id'),
        text: el.textContent.trim().slice(0, 30),
      }))
    );
    console.log(`列头数: ${headers.length}`);
    headers.forEach((h, i) => console.log(`  [${i}] col-id=${h.colId} text="${h.text}"`));

    // 5. 分析 ag-Grid 行数据（前5行）
    console.log('\n=== ag-Grid 表格行（前5行） ===');
    const rows = await page.$$eval('.ag-center-cols-container .ag-row', (rowEls) =>
      rowEls.slice(0, 5).map((row, i) => {
        const cells = Array.from(row.querySelectorAll('.ag-cell'));
        const cellData = cells.map(c => ({
          colId: c.getAttribute('col-id'),
          text: c.textContent.trim().slice(0, 50),
        }));
        return { index: i, rowId: row.getAttribute('row-id'), cells: cellData };
      })
    );
    console.log(`显示行数: ${rows.length}`);
    rows.forEach(r => {
      console.log(`  Row[${r.index}] row-id=${r.rowId}`);
      r.cells.forEach(c => console.log(`    col-id=${c.colId}: "${c.text}"`));
    });

    // 6. 检查是否有 form-item label
    console.log('\n=== 表单标签 (.earth-form-item) ===');
    const formItems = await page.$$eval('.earth-form-item', els =>
      els.slice(0, 20).map(el => {
        const label = el.querySelector('.earth-form-item-label, label');
        const input = el.querySelector('input, select, .earth-select');
        return {
          label: label ? label.textContent.trim().slice(0, 30) : '',
          inputId: input ? (input.id || '') : '',
          inputType: input ? input.tagName : '',
        };
      })
    );
    console.log(`表单项数: ${formItems.length}`);
    formItems.forEach((f, i) => console.log(`  [${i}] label="${f.label}" inputId=${f.inputId} type=${f.inputType}`));

    // 7. 额外：分析搜索栏（可能在 .earth-card 或专门的搜索区域）
    console.log('\n=== 搜索关键字输入框 ===');
    const kwInput = await page.$('input#keyword');
    if (kwInput) {
      const ph = await kwInput.getAttribute('placeholder');
      console.log(`找到 input#keyword, placeholder="${ph}"`);
    } else {
      console.log('未找到 input#keyword，尝试其他选择器...');
      const altInputs = await page.$$eval('input', els =>
        els.filter(el => el.placeholder && (el.placeholder.includes('代码') || el.placeholder.includes('名称') || el.placeholder.includes('速记'))).map(el => ({
          id: el.id,
          placeholder: el.placeholder,
          className: el.className.slice(0, 60),
        }))
      );
      console.log(`替代输入框: ${JSON.stringify(altInputs, null, 2)}`);
    }

  } finally {
    await page.close().catch(() => {});
    await safeDisconnect(browser);
    console.log('\n探测完成，标签页已关闭');
  }
})().catch(e => {
  console.error('❌ 探测失败:', e.message);
  process.exit(1);
});

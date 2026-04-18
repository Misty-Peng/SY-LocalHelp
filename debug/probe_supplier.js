const { connectCDP, safeDisconnect } = require('../tools/debug_browser');

(async () => {
  const { browser, context } = await connectCDP();
  const page = context.pages().find(p => p.url().includes('supplier'));
  if (!page) { console.log('未找到供应商页面'); process.exit(1); }
  console.log('URL:', page.url());

  // 1. 文本/搜索 input
  console.log('\n===== TEXT/SEARCH INPUT =====');
  const inputs = await page.$$eval('input[type="text"], input[type="search"]', els =>
    els.map(el => ({ type: el.type, ph: el.placeholder, cls: el.className.slice(0, 80), id: el.id, val: el.value.slice(0, 30) }))
  );
  inputs.forEach((x, i) => console.log(`  [${i}]`, JSON.stringify(x)));

  // 2. 左侧面板 — 尝试多种选择器
  console.log('\n===== LEFT PANEL =====');
  const leftPanel = await page.evaluate(() => {
    // 尝试找 earth-tree / ant-tree / 侧边栏
    const selectors = ['.earth-tree', '.ant-tree', '.lemon-tree', '[class*="tree"]', '[class*="category"]', '[class*="classify"]', '[class*="side"]'];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) {
        const items = el.querySelectorAll('[class*="title"], [class*="node"], li, .earth-tree-treenode, .ant-tree-treenode');
        const texts = [];
        items.forEach(item => {
          const t = item.textContent.trim();
          if (t && t.length < 50 && !texts.includes(t)) texts.push(t);
        });
        return { selector: s, className: el.className.slice(0, 100), itemCount: texts.length, texts: texts.slice(0, 20) };
      }
    }
    return null;
  });
  console.log(leftPanel ? JSON.stringify(leftPanel, null, 2) : '  (未找到)');

  // 3. ag-Grid 表头
  console.log('\n===== AG-GRID HEADERS =====');
  const headers = await page.$$eval('.ag-header-cell-text', els => els.map(el => el.textContent.trim()));
  console.log(headers);

  // 4. ag-Grid 第一行数据
  console.log('\n===== AG-GRID FIRST ROW =====');
  const firstRow = await page.$$eval('.ag-row:first-child .ag-cell', els =>
    els.map(el => ({ col: el.getAttribute('col-id'), text: el.textContent.trim().slice(0, 60), html: el.innerHTML.slice(0, 120) }))
  );
  firstRow.forEach((c, i) => console.log(`  [${i}]`, JSON.stringify(c)));

  // 5. 搜索区域的 form 结构
  console.log('\n===== SEARCH FORM AREA =====');
  const formArea = await page.evaluate(() => {
    const form = document.querySelector('form') || document.querySelector('[class*="filter"]') || document.querySelector('[class*="search"]');
    if (!form) return null;
    return {
      tag: form.tagName,
      className: form.className.slice(0, 100),
      labels: Array.from(form.querySelectorAll('label, .earth-form-item-label, .ant-form-item-label')).map(l => l.textContent.trim()).filter(Boolean),
      inputs: Array.from(form.querySelectorAll('input')).map(el => ({ ph: el.placeholder, cls: el.className.slice(0, 60), type: el.type })),
      html: form.innerHTML.slice(0, 500),
    };
  });
  console.log(formArea ? JSON.stringify(formArea, null, 2) : '  (未找到 form)');

  // 6. 关键字输入框精确定位
  console.log('\n===== KEYWORD INPUT PROBE =====');
  const kwProbe = await page.evaluate(() => {
    // 尝试通过 label 文本找关联 input
    const labels = document.querySelectorAll('label, [class*="label"]');
    const results = [];
    labels.forEach(l => {
      const text = l.textContent.trim();
      if (/关键字|供应商|名称|搜索|编码/.test(text)) {
        const parent = l.closest('[class*="form-item"]') || l.parentElement;
        const input = parent ? parent.querySelector('input') : null;
        results.push({
          labelText: text.slice(0, 40),
          inputPh: input ? input.placeholder : null,
          inputCls: input ? input.className.slice(0, 60) : null,
          inputId: input ? input.id : null,
          parentCls: parent ? parent.className.slice(0, 60) : null,
        });
      }
    });
    return results;
  });
  kwProbe.forEach((x, i) => console.log(`  [${i}]`, JSON.stringify(x)));

  await safeDisconnect(browser);
  console.log('\n✅ done');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });

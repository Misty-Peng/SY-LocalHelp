const { chromium } = require('playwright');

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDesignFrame(page) {
  return page.frames().find((frame) => /cloudflow\/formdesign/.test(frame.url()));
}

async function clickExactText(frame, text) {
  return frame.evaluate((targetText) => {
    const nodes = Array.from(document.querySelectorAll('*')).filter((el) => {
      const value = (el.textContent || '').replace(/\s+/g, ' ').trim();
      return value === targetText && el.offsetWidth > 0 && el.offsetHeight > 0;
    });
    const target = nodes.find((el) => typeof el.click === 'function');
    if (!target) {
      return false;
    }
    target.click();
    return true;
  }, text);
}

async function dragRelationData(page, frame) {
  const widget = frame.locator('.fd-widget-item.js-dar-item', { hasText: '关联数据' }).first();
  const canvas = frame.locator('.design-content.js-designer');
  const widgetBox = await widget.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!widgetBox || !canvasBox) {
    throw new Error('无法定位关联数据控件或画布');
  }
  const sx = widgetBox.x + widgetBox.width / 2;
  const sy = widgetBox.y + widgetBox.height / 2;
  const tx = canvasBox.x + canvasBox.width / 2;
  const ty = canvasBox.y + canvasBox.height - 40;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await wait(150);
  for (let i = 1; i <= 12; i += 1) {
    const p = i / 12;
    await page.mouse.move(sx + (tx - sx) * p, sy + (ty - sy) * p, { steps: 1 });
    await wait(50);
  }
  await wait(200);
  await page.mouse.up();
  await wait(1200);
}

async function collectState(frame) {
  return frame.evaluate(() => {
    const body = (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
    const selects = Array.from(document.querySelectorAll('*'))
      .filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0)
      .map((el) => ({
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 120),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 150),
      }))
      .filter((item) => item.text)
      .filter((item) => /关联表单|绑定控件|选择明细|展示字段|请选择|数据选择设置|过滤|字段/.test(item.text))
      .slice(0, 160);
    return { body, selects };
  });
}

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages().find((item) => /formdesign/.test(item.url()));
  if (!page) {
    throw new Error('未找到表单设计页面');
  }
  page.on('dialog', async (dialog) => {
    try {
      await dialog.dismiss();
    } catch {}
  });

  try {
    let frame = getDesignFrame(page);
    await clickExactText(frame, '移动端设计').catch(() => false);
    await wait(800);
    frame = getDesignFrame(page);
    await clickExactText(frame, '互联控件').catch(() => false);
    await wait(600);
    frame = getDesignFrame(page);
    await dragRelationData(page, frame);
    frame = getDesignFrame(page);

    const beforeOpen = await collectState(frame);

    const firstSelect = frame.locator('.select-core.dark-select, .yui-selectbox, .yui-selectbox__inner').first();
    if (await firstSelect.isVisible().catch(() => false)) {
      await firstSelect.click().catch(() => {});
      await wait(1200);
    }

    frame = getDesignFrame(page);
    const afterOpen = await collectState(frame);

    console.log(JSON.stringify({ beforeOpen, afterOpen }, null, 2));
  } finally {
    const currentPage = context.pages().find((item) => /formdesign/.test(item.url()));
    if (currentPage) {
      await currentPage.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await wait(1500);
    }
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

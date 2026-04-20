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

async function dragByTextToCanvas(page, frame, text) {
  const source = frame.locator(`text=${text}`).first();
  const canvas = frame.locator('.design-content.js-designer');
  await source.scrollIntoViewIfNeeded();
  await wait(300);
  const sourceBox = await source.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!sourceBox || !canvasBox) {
    throw new Error(`无法定位拖拽元素: ${text}`);
  }
  const sourceX = sourceBox.x + sourceBox.width / 2;
  const sourceY = sourceBox.y + sourceBox.height / 2;
  const targetX = canvasBox.x + canvasBox.width / 2;
  const targetY = canvasBox.y + canvasBox.height - 40;
  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await wait(150);
  for (let step = 1; step <= 12; step += 1) {
    const progress = step / 12;
    await page.mouse.move(
      sourceX + (targetX - sourceX) * progress,
      sourceY + (targetY - sourceY) * progress,
      { steps: 1 }
    );
    await wait(50);
  }
  await wait(200);
  await page.mouse.up();
  await wait(1200);
}

async function collectCurrentSetting(frame) {
  return frame.evaluate(() => {
    const body = (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 5000);
    const texts = Array.from(document.querySelectorAll('*'))
      .filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0)
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .filter((text) => /数据源|业务对象|基础资料|单据|业务单元|业务组织|关联数据|显示字段|过滤字段|多维度主表|请选择|标题|提示语|字段/.test(text))
      .slice(0, 120);
    const inputs = Array.from(document.querySelectorAll('input, textarea'))
      .filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0)
      .map((el) => ({
        cls: (el.className || '').toString(),
        placeholder: el.placeholder || '',
        value: el.value || '',
      }));
    return { body, texts, inputs };
  });
}

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages().find((item) => /formdesign/.test(item.url()));
  if (!page) {
    throw new Error('未找到表单设计页面');
  }

  try {
    let frame = getDesignFrame(page);
    if (!frame) {
      throw new Error('未找到设计器 frame');
    }

    await clickExactText(frame, '移动端设计').catch(() => false);
    await wait(1000);
    frame = getDesignFrame(page);

    await clickExactText(frame, '融合中心').catch(() => false);
    await wait(800);
    frame = getDesignFrame(page);
    await dragByTextToCanvas(page, frame, '基础资料');
    await wait(800);
    frame = getDesignFrame(page);
    const fusionBaseData = await collectCurrentSetting(frame);

    await clickExactText(frame, '互联控件').catch(() => false);
    await wait(800);
    frame = getDesignFrame(page);
    await dragByTextToCanvas(page, frame, '关联数据');
    await wait(800);
    frame = getDesignFrame(page);
    const relationData = await collectCurrentSetting(frame);

    console.log(JSON.stringify({ fusionBaseData, relationData }, null, 2));
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

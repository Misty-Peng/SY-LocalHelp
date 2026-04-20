const { chromium } = require('playwright');

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getDesignContext() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const designPage = context.pages().find((page) => /formdesign/.test(page.url()));
  if (!designPage) {
    throw new Error('未找到表单设计页');
  }
  const designFrame = designPage.frames().find((frame) => /cloudflow\/formdesign/.test(frame.url()));
  if (!designFrame) {
    throw new Error('未找到表单设计 iframe');
  }
  return { browser, context, designPage, designFrame };
}

async function getVisibleInlineInputs(frame) {
  const locator = frame.locator('input.inline-input');
  const count = await locator.count();
  const inputs = [];
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) {
      inputs.push(item);
    }
  }
  return inputs;
}

async function setActiveWidget(frame, config) {
  const inputs = await getVisibleInlineInputs(frame);
  if (!inputs.length) {
    throw new Error('未找到右侧配置输入框');
  }
  await inputs[0].fill(config.title);
  if (config.placeholder && inputs[1]) {
    await inputs[1].fill(config.placeholder);
  }
  if (Array.isArray(config.options) && config.options.length) {
    for (let i = 0; i < config.options.length; i += 1) {
      const target = inputs[i + 2];
      if (!target) {
        break;
      }
      await target.fill(config.options[i]);
    }
  }
  await wait(500);
}

async function getFieldCount(frame) {
  return frame.locator('.content-item.clearfix.js-dor-item.form-widget').count();
}

async function dragWidgetToCanvas(page, frame, widgetLabel) {
  const widget = frame.locator('.fd-widget-item.js-dar-item', { hasText: widgetLabel }).first();
  const canvas = frame.locator('.design-content.js-designer');
  await widget.scrollIntoViewIfNeeded();
  await wait(200);
  const widgetBox = await widget.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!widgetBox || !canvasBox) {
    throw new Error(`无法定位控件或画布: ${widgetLabel}`);
  }
  const sourceX = widgetBox.x + widgetBox.width / 2;
  const sourceY = widgetBox.y + widgetBox.height / 2;
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

async function addField(page, frame, widgetLabel, config) {
  const beforeCount = await getFieldCount(frame);
  await dragWidgetToCanvas(page, frame, widgetLabel);
  const afterCount = await getFieldCount(frame);
  if (afterCount <= beforeCount) {
    throw new Error(`拖拽控件失败: ${widgetLabel}`);
  }
  await setActiveWidget(frame, config);
  return { beforeCount, afterCount };
}

async function getFieldTitles(frame) {
  const locator = frame.locator('.content-item.clearfix.js-dor-item.form-widget .js-component-title');
  const count = await locator.count();
  const titles = [];
  for (let i = 0; i < count; i += 1) {
    const text = await locator.nth(i).innerText().catch(() => '');
    titles.push(text.trim());
  }
  return titles;
}

(async () => {
  const { browser, designPage, designFrame } = await getDesignContext();
  try {
    await designPage.bringToFront();
    await wait(1000);

    await setActiveWidget(designFrame, {
      title: '合同类型',
      placeholder: '请选择合同类型',
      options: ['销售合同', '采购合同', '服务合同'],
    });

    const plan = [
      { widgetLabel: '单行文本框', config: { title: '乙方名称', placeholder: '请输入乙方名称' } },
      { widgetLabel: '金额输入框', config: { title: '合同金额', placeholder: '请输入合同金额' } },
      { widgetLabel: '日期选择', config: { title: '签约日期', placeholder: '请选择签约日期' } },
      { widgetLabel: '日期区间', config: { title: '合同期限' } },
      { widgetLabel: '多行文本框', config: { title: '合同内容', placeholder: '请输入合同内容' } },
      { widgetLabel: '文件上传', config: { title: '合同附件' } },
    ];

    const steps = [];
    for (const item of plan) {
      const result = await addField(designPage, designFrame, item.widgetLabel, item.config);
      steps.push({ widgetLabel: item.widgetLabel, ...item.config, ...result });
    }

    const saveButton = designPage.locator('button', { hasText: '暂存' }).first();
    await saveButton.click();
    await wait(2500);

    const titles = await getFieldTitles(designFrame);
    console.log(JSON.stringify({
      ok: true,
      steps,
      titles,
      url: designPage.url(),
      title: await designPage.title(),
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

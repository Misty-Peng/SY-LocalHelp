const { chromium } = require('playwright');

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTexts(locator, limit = 30) {
  const count = await locator.count();
  const values = [];
  for (let i = 0; i < Math.min(count, limit); i += 1) {
    const text = await locator.nth(i).innerText().catch(() => '');
    values.push(text.trim());
  }
  return values.filter(Boolean);
}

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages().find((item) => /formdesign/.test(item.url()));
  if (!page) {
    throw new Error('未找到表单设计页面');
  }

  const report = {
    url: page.url(),
    title: await page.title(),
    topTabs: [],
    versionRecord: null,
  };

  const topTabLocator = page.locator('.form-tab-item');
  report.topTabs = await getTexts(topTabLocator, 10);

  const exploreTopTab = async (tabName) => {
    await page.locator('.form-tab-item', { hasText: tabName }).first().click();
    await wait(1500);
    const frameSummaries = [];
    for (const frame of page.frames()) {
      if (!frame.url()) {
        continue;
      }
      const bodyText = await frame.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 2500)).catch(() => '');
      if (bodyText) {
        frameSummaries.push({ url: frame.url(), bodyText });
      }
    }
    const pageText = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1500)).catch(() => '');
    report[tabName] = {
      activeTopTab: await page.locator('.form-tab-item.active').innerText().catch(() => ''),
      pageText,
      frames: frameSummaries,
    };
  };

  await exploreTopTab('表单设计');
  const designFrame = page.frames().find((frame) => /cloudflow\/formdesign/.test(frame.url()));
  if (designFrame) {
    const modeTabs = await getTexts(designFrame.locator('.fd-view-tab, .tab-item, .el-tabs__item, .pc-tab-item'), 20);
    const leftWidgets = await getTexts(designFrame.locator('.fd-widget-label'), 40);
    const rightTabs = await getTexts(designFrame.locator('.right-menu .el-tabs__item, .setting-tab-item, .tab-label'), 20);
    const currentFields = await getTexts(designFrame.locator('.content-item.clearfix.js-dor-item.form-widget .js-component-title'), 30);
    report['表单设计'].designer = {
      modeTabs,
      leftWidgets,
      rightTabs,
      currentFields,
    };
  }

  await exploreTopTab('视图设计');
  await exploreTopTab('业务规则');
  await exploreTopTab('表单设置');

  const versionBtn = page.locator('.icon-btn', { hasText: '版本记录' }).first();
  if (await versionBtn.isVisible().catch(() => false)) {
    await versionBtn.click();
    await wait(1500);
    const pageText = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 2000)).catch(() => '');
    report.versionRecord = { pageText };
    const closeBtn = page.locator('.el-dialog__headerbtn, .close, .icon-close').first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click().catch(() => {});
      await wait(500);
    }
  }

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

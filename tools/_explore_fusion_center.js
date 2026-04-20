const { chromium } = require('playwright');

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDesignFrame(page) {
  return page.frames().find((frame) => /cloudflow\/formdesign/.test(frame.url()));
}

async function clickByText(frame, text) {
  const clicked = await frame.evaluate((targetText) => {
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
  return clicked;
}

async function collect(frame) {
  return frame.evaluate(() => {
    const body = (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
    const clickable = Array.from(document.querySelectorAll('*'))
      .filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0)
      .map((el) => ({
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 120),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 150),
      }))
      .filter((item) => item.text)
      .slice(0, 120);
    return { url: location.href, body, clickable };
  });
}

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages().find((item) => /formdesign/.test(item.url()));
  if (!page) {
    throw new Error('未找到表单设计页面');
  }

  let frame = getDesignFrame(page);
  if (!frame) {
    throw new Error('未找到设计器 frame');
  }

  const report = {};

  await clickByText(frame, '移动端设计').catch(() => false);
  await wait(1200);
  frame = getDesignFrame(page);
  if (!frame) {
    throw new Error('切到移动端设计后未找到 frame');
  }

  await clickByText(frame, '融合中心').catch(() => false);
  await wait(1000);
  frame = getDesignFrame(page);
  if (!frame) {
    throw new Error('切到左侧融合中心后未找到 frame');
  }
  report.leftFusionCenter = await collect(frame);

  await clickByText(frame, '模板全局设置').catch(() => false);
  await wait(1200);
  frame = getDesignFrame(page);
  if (!frame) {
    throw new Error('切到模板全局设置后未找到 frame');
  }

  await clickByText(frame, '融合中心').catch(() => false);
  await wait(1000);
  frame = getDesignFrame(page);
  if (!frame) {
    throw new Error('切到全局设置融合中心后未找到 frame');
  }
  report.globalFusionCenter = await collect(frame);

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

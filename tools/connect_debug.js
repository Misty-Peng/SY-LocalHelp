const { ensureDebugBrowser, connectCDP, DEFAULT_DEBUG_PORT, safeDisconnect } = require('./debug_browser');

(async () => {
  const { info, reused } = await ensureDebugBrowser({
    url: 'https://account.shouyangfruit.com',
  });
  if (reused) {
    console.log(`✅ 检测到已运行的调试浏览器: ${info.Browser}`);
  } else {
    console.log(`🚀 已启动新的调试浏览器: ${info.Browser}`);
  }

  const wsOrHttp = info.webSocketDebuggerUrl || `http://127.0.0.1:${DEFAULT_DEBUG_PORT}`;
  console.log(`🔗 正在连接 CDP: ${wsOrHttp}`);

  const { browser, contexts, pages, page } = await connectCDP();

  console.log('\n--- 当前浏览器状态 ---');
  console.log(`打开的 Context 数: ${contexts.length}`);
  console.log(`打开的 Page 数: ${pages.length}`);
  console.log(`当前活跃页面 URL: ${page.url()}`);
  console.log(`页面标题: ${await page.title().catch(() => 'N/A')}`);

  console.log('\n✅ 已成功连接到调试浏览器。脚本不会关闭该浏览器。');
  await safeDisconnect(browser); // 仅断开 CDP 连接，不影响浏览器本身
})().catch((err) => {
  console.error('❌ 运行失败:', err.message);
  process.exit(1);
});

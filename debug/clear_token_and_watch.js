const { connectCDP, safeDisconnect } = require('../tools/debug_browser');
const { GALAXY_TOKEN_KEY, DOMAIN_REGEX } = require('../tools/config');

const AUTH_REGEX = /(oauth|token|login|auth|refresh|account)/i;
const TOKEN_KEY = GALAXY_TOKEN_KEY;

function short(s, n = 120) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '...' : s;
}

(async () => {
  const { browser, pages } = await connectCDP();
  const page =
    pages.find((p) => DOMAIN_REGEX.test(p.url()) && !p.url().startsWith('devtools://')) ||
    pages[0];

  console.log('目标页面:', page.url());

  // 1. 记录清理前的 localStorage
  const before = await page.evaluate((k) => ({
    token: localStorage.getItem(k),
    keys: Object.keys(localStorage),
  }), TOKEN_KEY);
  console.log('\n[BEFORE] localStorage keys:', before.keys);
  console.log('[BEFORE] token:', short(before.token));

  // 2. 挂请求/响应监听（仅命中鉴权相关的 URL）
  const hits = [];
  const onRequest = (req) => {
    const url = req.url();
    if (!AUTH_REGEX.test(url)) return;
    hits.push({ type: 'req', method: req.method(), url, headers: req.headers(), postData: req.postData() });
  };
  const onResponse = async (res) => {
    const url = res.url();
    if (!AUTH_REGEX.test(url)) return;
    let body = null;
    try {
      const ct = res.headers()['content-type'] || '';
      if (/json|text/.test(ct)) body = await res.text();
    } catch (e) {}
    hits.push({ type: 'res', status: res.status(), url, body: body && body.slice(0, 400) });
  };
  page.on('request', onRequest);
  page.on('response', onResponse);

  // 3. 清理 token
  const cleared = await page.evaluate((k) => {
    const v = localStorage.getItem(k);
    localStorage.removeItem(k);
    return !!v;
  }, TOKEN_KEY);
  console.log(`\n🧹 已清除 ${TOKEN_KEY}: ${cleared ? 'yes' : 'key 不存在'}`);

  // 4. 刷新页面触发前端重新拉取
  console.log('🔄 reload 页面，等待 10s 观察网络...');
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (e) {
    console.log('reload 异常（可能被登录重定向打断）:', e.message);
  }
  await new Promise((r) => setTimeout(r, 10000));

  // 5. 记录清理后的 localStorage
  const after = await page.evaluate((k) => ({
    token: localStorage.getItem(k),
    keys: Object.keys(localStorage),
    url: location.href,
  }), TOKEN_KEY).catch((e) => ({ error: e.message }));
  console.log('\n[AFTER ] url:', after.url);
  console.log('[AFTER ] localStorage keys:', after.keys);
  console.log('[AFTER ] token:', short(after.token));
  console.log('[AFTER ] token 是否被重新填充:', !!after.token);
  if (before.token && after.token) {
    console.log('[AFTER ] token 是否与之前一致:', before.token === after.token ? '一致（可能来自缓存/session）' : '不同（真正刷新了）');
  }

  // 6. 输出鉴权相关的请求/响应
  console.log(`\n===== 鉴权相关网络事件 (${hits.length}) =====`);
  for (const h of hits) {
    if (h.type === 'req') {
      console.log(`→ ${h.method} ${h.url}`);
      if (h.headers.authorization) console.log(`    Authorization: ${short(h.headers.authorization, 80)}`);
      if (h.postData) console.log(`    body: ${short(h.postData, 300)}`);
    } else {
      console.log(`← ${h.status} ${h.url}`);
      if (h.body) console.log(`    resp: ${short(h.body, 300)}`);
    }
  }

  page.off('request', onRequest);
  page.off('response', onResponse);
  await safeDisconnect(browser);
})().catch((e) => {
  console.error('❌ 失败:', e.stack || e.message);
  process.exit(1);
});

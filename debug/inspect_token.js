const { connectCDP, safeDisconnect } = require('../tools/debug_browser');

function tryDecodeJwt(v) {
  if (typeof v !== 'string') return null;
  const parts = v.split('.');
  if (parts.length !== 3) return null;
  try {
    const pad = (s) => s + '='.repeat((4 - (s.length % 4)) % 4);
    const payload = JSON.parse(
      Buffer.from(pad(parts[1].replace(/-/g, '+').replace(/_/g, '/')), 'base64').toString('utf8')
    );
    return payload;
  } catch (e) {
    return null;
  }
}

function looksLikeToken(key, value) {
  if (typeof value !== 'string' || value.length < 20) return false;
  const k = key.toLowerCase();
  if (/(token|auth|jwt|bearer|session|access|refresh)/.test(k)) return true;
  if (tryDecodeJwt(value)) return true;
  return false;
}

(async () => {
  const { browser, contexts, pages, page } = await connectCDP();

  console.log(`Contexts: ${contexts.length}, Pages: ${pages.length}`);
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const url = p.url();
    console.log(`\n===== Page [${i}] ${url} =====`);

    // localStorage + sessionStorage
    const storage = await p.evaluate(() => {
      const dump = (s) => {
        const o = {};
        for (let i = 0; i < s.length; i++) {
          const k = s.key(i);
          o[k] = s.getItem(k);
        }
        return o;
      };
      return { localStorage: dump(localStorage), sessionStorage: dump(sessionStorage) };
    }).catch((e) => ({ error: e.message }));

    if (storage.error) {
      console.log('  (无法读取 storage):', storage.error);
    } else {
      for (const area of ['localStorage', 'sessionStorage']) {
        const entries = Object.entries(storage[area]);
        console.log(`  --- ${area} (${entries.length} keys) ---`);
        for (const [k, v] of entries) {
          const isTok = looksLikeToken(k, v);
          const preview = v.length > 80 ? v.slice(0, 80) + '...' : v;
          console.log(`    [${isTok ? 'TOKEN?' : '      '}] ${k} = ${preview}`);
          const jwt = tryDecodeJwt(v);
          if (jwt) {
            console.log(
              `        -> JWT payload: user_name=${jwt.user_name || ''} user_id=${jwt.user_id || ''} company_id=${jwt.company_id || ''} exp=${jwt.exp ? new Date(jwt.exp * 1000).toISOString() : ''}`
            );
          }
          // 若 value 是 JSON 字符串，尝试解析寻找嵌套 token
          if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
            try {
              const obj = JSON.parse(v);
              const flat = JSON.stringify(obj);
              if (/access_token|refresh_token/i.test(flat)) {
                console.log(`        -> JSON 包含 access_token/refresh_token 字段`);
              }
            } catch (e) {}
          }
        }
      }
    }
  }

  // Cookies
  const ctx = contexts[0];
  if (ctx) {
    const cookies = await ctx.cookies();
    console.log(`\n===== Cookies (${cookies.length}) =====`);
    for (const c of cookies) {
      const isTok = looksLikeToken(c.name, c.value);
      const preview = c.value.length > 60 ? c.value.slice(0, 60) + '...' : c.value;
      console.log(`  [${isTok ? 'TOKEN?' : '      '}] ${c.domain}${c.path}  ${c.name}=${preview}`);
    }
  }

  await safeDisconnect(browser);
})().catch((e) => {
  console.error('❌ 失败:', e.message);
  process.exit(1);
});

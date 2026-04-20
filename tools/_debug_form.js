const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const dp = ctx.pages().find(p => /formdesign/.test(p.url()));
  const df = dp.frames().find(f => /cloudflow\/formdesign/.test(f.url()));

  // 1. Check Vue component tree for add-widget methods
  const r = await df.evaluate(() => {
    const root = document.querySelector('.form-design-root-app');
    const vm = root && root.__vue__;
    if (!vm) return { error: 'no vue root' };

    // Walk children to find designer component
    const walk = (v, depth = 0) => {
      if (depth > 5) return [];
      const result = [];
      const name = v.$options.name || v.$options._componentTag || 'anon';
      const methods = Object.keys(v.$options.methods || {});
      if (methods.length > 0) {
        result.push({ name, depth, methods: methods.slice(0, 30) });
      }
      for (const child of (v.$children || [])) {
        result.push(...walk(child, depth + 1));
      }
      return result;
    };

    const tree = walk(vm);
    return { tree: tree.slice(0, 30) };
  });

  console.log(JSON.stringify(r, null, 2));
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });

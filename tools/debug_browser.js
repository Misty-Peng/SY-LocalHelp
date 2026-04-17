const { chromium } = require('playwright');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const DEFAULT_DEBUG_PORT = 9222;
const DEFAULT_USER_DATA_DIR = path.resolve(__dirname, '..', '.pw-user-data');

/**
 * 检测指定端口上是否已运行带远程调试的 Chromium。
 * @param {number} port
 * @returns {Promise<object|null>} /json/version 响应或 null
 */
function checkDebugPort(port = DEFAULT_DEBUG_PORT) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * 以远程调试模式启动 Playwright 自带 Chromium。
 * @param {object} opts
 * @param {number} [opts.port]
 * @param {string} [opts.userDataDir]
 * @param {string} [opts.url]
 * @param {number} [opts.timeoutMs] 等待调试端口就绪的总时长
 */
async function launchChromeWithDebug({
  port = DEFAULT_DEBUG_PORT,
  userDataDir = DEFAULT_USER_DATA_DIR,
  url,
  timeoutMs = 30000,
} = {}) {
  const executablePath = chromium.executablePath();
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
  if (url) args.push(url);

  const child = spawn(executablePath, args, { detached: true, stdio: 'ignore' });
  child.unref();

  const steps = Math.max(1, Math.floor(timeoutMs / 1000));
  for (let i = 0; i < steps; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const info = await checkDebugPort(port);
    if (info) return { info, executablePath };
  }
  return { info: null, executablePath };
}

/**
 * 确保存在一个在指定端口上开启远程调试的浏览器实例：已存在则复用，否则启动。
 * @param {object} opts 见 launchChromeWithDebug
 * @returns {Promise<{info: object, reused: boolean}>}
 */
async function ensureDebugBrowser(opts = {}) {
  const port = opts.port || DEFAULT_DEBUG_PORT;
  const existing = await checkDebugPort(port);
  if (existing) return { info: existing, reused: true };
  const { info } = await launchChromeWithDebug(opts);
  if (!info) throw new Error(`调试浏览器启动失败或端口 ${port} 不可用`);
  return { info, reused: false };
}

/**
 * 通过 CDP 连接到调试浏览器，返回 { browser, context, page }。
 * 调用方负责在业务结束后 browser.close()（仅断开 CDP）。
 */
async function connectCDP(port = DEFAULT_DEBUG_PORT) {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const contexts = browser.contexts();
  const context = contexts[0] || (await browser.newContext());
  const pages = context.pages();
  const page = pages[0] || (await context.newPage());
  return { browser, context, page, contexts, pages };
}

/**
 * 安全断开 CDP 连接。browser.close() 对 CDP 连接可能同步抛错（browser.process is not a function），
 * Promise.catch() 无法捕获同步异常，因此需要 try-catch 包裹。
 */
async function safeDisconnect(browser) {
  try { await browser.close(); } catch (e) { /* CDP disconnect, safe to ignore */ }
}

module.exports = {
  DEFAULT_DEBUG_PORT,
  DEFAULT_USER_DATA_DIR,
  checkDebugPort,
  launchChromeWithDebug,
  ensureDebugBrowser,
  connectCDP,
  safeDisconnect,
};

const { ensureDebugBrowser, connectCDP, DEFAULT_DEBUG_PORT, safeDisconnect } = require('./debug_browser');
const { LOGIN_URL, HOME_URL, CURRENT_USER_API, LOG_DIR } = require('./config');
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

const DEFAULT_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 60 * 1000;
const LOG_FILE = path.join(LOG_DIR, `session_monitor-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
const PID_FILE = path.join(LOG_DIR, 'session_monitor.pid');
const STATE_FILE = path.join(LOG_DIR, 'session_monitor.state.json');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ts() {
  return new Date().toISOString();
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function appendLog(line) {
  ensureLogDir();
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
}

function log(tag, message) {
  const line = `[${ts()}] ${tag} ${message}`;
  console.log(line);
  appendLog(line);
}

function setPhase(phase, detail = '') {
  log('PHASE', detail ? `${phase} | ${detail}` : phase);
}

function isHomePage(page) {
  return page.url().startsWith(HOME_URL);
}

function findHomePage(pages) {
  return pages.find((p) => p.url().startsWith(HOME_URL)) || null;
}

function findLoginPage(pages) {
  return pages.find((p) => p.url().startsWith(LOGIN_URL)) || null;
}

function resolveWorkingPage(pages) {
  const homePage = findHomePage(pages);
  if (homePage) return { type: 'home', page: homePage };
  const loginPage = findLoginPage(pages);
  if (loginPage) return { type: 'login', page: loginPage };
  return { type: 'none', page: null };
}

function snapshotPages(pages) {
  return pages.map((p, index) => ({ index, url: p.url(), title: '(pending)' }));
}

function writeState(state) {
  ensureLogDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...state, ts: ts() }, null, 2), 'utf8');
}

function writePid(pid) {
  ensureLogDir();
  fs.writeFileSync(PID_FILE, String(pid), 'utf8');
}

function describeWorkingPage(resolved) {
  if (resolved.type === 'home') return `首页标签: ${resolved.page.url()}`;
  if (resolved.type === 'login') return `登录页标签: ${resolved.page.url()}`;
  return '未发现首页或登录页标签';
}

async function logBrowserSnapshot(context, label) {
  const pages = context.pages();
  log('SNAPSHOT', `${label} | tabs=${pages.length}`);
  for (let i = 0; i < pages.length; i += 1) {
    const p = pages[i];
    const title = await p.title().catch(() => '(no-title)');
    log('SNAPSHOT', `tab[${i}] url=${p.url()} title=${title}`);
  }
}

async function bringPageToFront(page, label) {
  if (!page) return false;
  try {
    await page.bringToFront();
    log('TAB', `${label} 已置前: ${page.url()}`);
    return true;
  } catch (error) {
    log('WARN', `${label} 置前失败: ${error.message}`);
    return false;
  }
}

function createSessionTracker(page) {
  const apiHits = [];

  const onResponse = async (response) => {
    try {
      const url = response.url();
      if (url === CURRENT_USER_API || url.includes('nhsoft.galaxy.group.company.user.current.read')) {
        const status = response.status();
        const bodyText = await response.text().catch(() => '');
        const record = {
          url,
          status,
          ok: response.ok(),
          bodyText,
          timestamp: ts(),
        };
        apiHits.push(record);
        log('API', `命中登录态接口 [${status}] ${bodyText ? bodyText.slice(0, 200) : '(empty body)'}`);
      }
    } catch (error) {
      log('WARN', `记录接口响应失败: ${error.message}`);
    }
  };

  page.on('response', onResponse);

  return {
    apiHits,
    stop() {
      page.off('response', onResponse);
    },
  };
}

async function refreshAndCheck(page, timeoutMs = DEFAULT_NAVIGATION_TIMEOUT_MS) {
  const tracker = createSessionTracker(page);
  try {
    log('REFRESH', `刷新页面: ${HOME_URL}`);
    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});

    const latest = tracker.apiHits[tracker.apiHits.length - 1] || null;
    if (!latest) {
      log('FAIL', '未捕获到登录态接口请求，判定为失去登录态');
      return { alive: false, latest: null };
    }

    const alive = latest.status >= 200 && latest.status < 400;
    log(alive ? 'OK' : 'FAIL', alive ? '登录态正常' : '登录态接口返回异常');
    return { alive, latest };
  } finally {
    tracker.stop();
  }
}

async function loginFlow(page, timeoutMs = DEFAULT_NAVIGATION_TIMEOUT_MS) {
  const sameLoginPage = page.url().startsWith(LOGIN_URL);
  if (sameLoginPage) {
    log('LOGIN', `复用已有登录页: ${page.url()}`);
  } else {
    log('LOGIN', `打开登录页: ${LOGIN_URL}`);
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  }
  await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});

  log('LOGIN', `等待用户完成登录并进入首页: ${HOME_URL}`);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (isHomePage(page)) {
      log('LOGIN', `已进入目标页面: ${page.url()}`);
      return true;
    }
    await sleep(1000);
  }

  log('WARN', `登录等待超时，当前页面: ${page.url()}`);
  return false;
}

async function ensureAlreadyLoggedIn(page, timeoutMs = DEFAULT_NAVIGATION_TIMEOUT_MS) {
  const currentPage = isHomePage(page) ? page : findHomePage(page.context().pages());
  if (!currentPage) {
    log('LOGIN', '执行登录前未发现首页标签页，继续进入登录流程');
    return { alreadyLoggedIn: false, page: null, latest: null };
  }

  log('TAB', `登录前校验定位到首页标签: ${currentPage.url()}`);

  if (currentPage !== page) {
    await bringPageToFront(currentPage, '首页');
  }

  log('CHECK', '执行登录前校验，检查当前登录态');
  const result = await refreshAndCheck(currentPage, timeoutMs);
  if (result.alive) {
    log('OK', '执行登录前已确认登录态有效，直接返回已登录');
    return { alreadyLoggedIn: true, page: currentPage, latest: result.latest };
  }

  log('LOGIN', '执行登录前校验未通过，继续登录流程');
  return { alreadyLoggedIn: false, page: currentPage, latest: result.latest };
}

async function ensureHomePageOrFail(pages) {
  const homePage = findHomePage(pages);
  if (homePage) {
    log('CHECK', `找到首页标签页: ${homePage.url()}`);
    return homePage;
  }
  log('FAIL', '不存在首页标签页，默认登录失败，返回登录页');
  return null;
}

async function runKeepaliveLoop({ browser, context, page, timeoutMs, refreshIntervalMs }) {
  setPhase('keepalive', `interval=${refreshIntervalMs}ms`);
  log('KEEPALIVE', `校验完成，进入保活；仅首页标签页执行保活，每 ${Math.round(refreshIntervalMs / 1000)} 秒刷新一次`);

  while (true) {
    const currentHomePage = findHomePage(context.pages());
    if (!currentHomePage) {
      log('FAIL', '首页标签页已不存在，判定登录失败，返回登录页');
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
      break;
    }

    const result = await refreshAndCheck(currentHomePage, timeoutMs);
    if (!result.alive) {
      log('FAIL', '保活检查失败，停止循环并返回登录页');
      await currentHomePage.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
      break;
    }

    log('KEEPALIVE', `下一轮检查将在 ${Math.round(refreshIntervalMs / 1000)} 秒后执行`);
    await sleep(refreshIntervalMs);
  }

  await safeDisconnect(browser);
}

async function startKeepAlive({ refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS, timeoutMs = DEFAULT_NAVIGATION_TIMEOUT_MS, foregroundKeepalive = false, forceLogin = false, spawnBackgroundKeepalive = false } = {}) {
  setPhase('bootstrap', 'ensure-debug-browser');
  const { info, reused } = await ensureDebugBrowser({ url: LOGIN_URL, port: DEFAULT_DEBUG_PORT });
  log('BROWSER', `${reused ? '复用' : '启动'}调试浏览器: ${info.Browser}`);

  setPhase('bootstrap', 'connect-cdp');
  const { browser, context, page, pages } = await connectCDP(DEFAULT_DEBUG_PORT);
  log('CDP', `已连接，当前标签页数: ${pages.length}`);
  await logBrowserSnapshot(context, 'connect-cdp');

  setPhase('find-page');
  const currentPages = context.pages();
  const resolved = resolveWorkingPage(currentPages);
  log('TAB', `页面定位结果: ${describeWorkingPage(resolved)}`);
  await logBrowserSnapshot(context, 'after-find-page');

  if (resolved.type === 'home') {
    await bringPageToFront(resolved.page, '首页');
  } else if (resolved.type === 'login') {
    await bringPageToFront(resolved.page, '登录页');
  } else {
    log('TAB', '未发现首页或登录页标签页，将使用当前连接页作为工作页');
  }

  let workingPage = resolved.type === 'home' ? resolved.page : null;
  if (!workingPage) {
    workingPage = resolved.type === 'login' ? resolved.page : page;
  }

  if (!forceLogin) {
    setPhase('precheck');
    await logBrowserSnapshot(context, 'before-precheck');
    const preCheck = await ensureAlreadyLoggedIn(workingPage, timeoutMs);
    if (preCheck.alreadyLoggedIn) {
      log('LOGIN', '登录前校验通过，直接返回已登录');
      writeState({ phase: 'precheck', status: 'already-logged-in', browserPid: null, pages: snapshotPages(context.pages()) });
      if (spawnBackgroundKeepalive) {
        return { alive: true, reason: 'already-logged-in', phase: 'precheck', latest: preCheck.latest, background: true };
      }
      if (foregroundKeepalive) {
        await runKeepaliveLoop({ browser, context, page, timeoutMs, refreshIntervalMs });
      } else {
        await safeDisconnect(browser);
      }
      return { alive: true, reason: 'already-logged-in', phase: 'precheck', latest: preCheck.latest };
    }
  } else {
    log('LOGIN', 'forceLogin=true，跳过登录前已登录短路，直接进入登录流程');
  }

  setPhase('login');
  log('FLOW', '进入登录状态机: login -> post-check -> keepalive');
  await logBrowserSnapshot(context, 'before-login');
  const loginEntryPage = resolved.type === 'login' ? workingPage : page;
  const loggedIn = await loginFlow(loginEntryPage, timeoutMs);
  await logBrowserSnapshot(context, 'after-login');
  const postLoginPage = findHomePage(context.pages()) || loginEntryPage;
  if (!loggedIn || !isHomePage(postLoginPage)) {
    log('FAIL', '登录后未成功进入首页，返回登录页');
    await postLoginPage.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
    await safeDisconnect(browser);
    return { alive: false, reason: 'login-failed', phase: 'login' };
  }

  setPhase('post-check');
  log('CHECK', '登录成功，立即执行校验');
  await bringPageToFront(postLoginPage, '登录后首页');
  await logBrowserSnapshot(context, 'before-post-check');
  const initialCheck = await refreshAndCheck(postLoginPage, timeoutMs);
  if (!initialCheck.alive) {
    log('FAIL', '登录后校验失败，返回登录页');
    await postLoginPage.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
    await safeDisconnect(browser);
    return { alive: false, reason: 'post-login-check-failed', phase: 'post-check', latest: initialCheck.latest };
  }

  if (spawnBackgroundKeepalive) {
    writePid(process.pid);
    writeState({ phase: 'post-check', status: 'keepalive-spawn-requested', browserPid: null, pages: snapshotPages(context.pages()) });
    log('KEEPALIVE', '已启动后台保活模式，主进程将退出');
    const childEnv = { ...process.env, SESSION_MONITOR_CHILD: '1', FOREGROUND_KEEPALIVE: '1', FORCE_LOGIN: '0', SPAWN_BACKGROUND_KEEPALIVE: '0', REFRESH_INTERVAL_MS: String(refreshIntervalMs), PAGE_TIMEOUT_MS: String(timeoutMs) };
    const child = fork(__filename, [], { detached: true, stdio: 'ignore', env: childEnv });
    child.unref();
    await safeDisconnect(browser);
    return { alive: true, reason: 'background-keepalive-spawned', phase: 'post-check', latest: initialCheck.latest, background: true };
  }

  if (!foregroundKeepalive) {
    log('KEEPALIVE', '登录完成且校验通过，但当前为非阻塞模式，已结束本次执行');
    writeState({ phase: 'post-check', status: 'completed-no-keepalive', browserPid: null, pages: snapshotPages(context.pages()) });
    await safeDisconnect(browser);
    return { alive: true, reason: 'post-check-passed', phase: 'post-check', latest: initialCheck.latest };
  }

  await runKeepaliveLoop({ browser, context, page, timeoutMs, refreshIntervalMs });
  return { alive: false, reason: 'keepalive-stopped', phase: 'keepalive' };
}

if (require.main === module) {
  const refreshIntervalMs = Number(process.env.REFRESH_INTERVAL_MS || DEFAULT_REFRESH_INTERVAL_MS);
  const timeoutMs = Number(process.env.PAGE_TIMEOUT_MS || DEFAULT_NAVIGATION_TIMEOUT_MS);
  const foregroundKeepalive = String(process.env.FOREGROUND_KEEPALIVE || '1') !== '0';
  const forceLogin = String(process.env.FORCE_LOGIN || '0') === '1';
  const spawnBackgroundKeepalive = String(process.env.SPAWN_BACKGROUND_KEEPALIVE || '0') === '1';

  startKeepAlive({ refreshIntervalMs, timeoutMs, foregroundKeepalive, forceLogin, spawnBackgroundKeepalive }).catch((error) => {
    log('ERROR', `执行失败: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  LOGIN_URL,
  HOME_URL,
  CURRENT_USER_API,
  DEFAULT_REFRESH_INTERVAL_MS,
  refreshAndCheck,
  loginFlow,
  startKeepAlive,
};

const { ensureDebugBrowser, connectCDP, DEFAULT_DEBUG_PORT, safeDisconnect } = require('./debug_browser');
const {
  YZJ_LOGIN_URL,
  YZJ_HOME_URL,
  YZJ_LOGIN_SUCCESS_SELECTOR,
  YZJ_ACCOUNT_API_PATH,
  LOG_DIR,
} = require('./config');
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

const DEFAULT_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 60 * 1000;
const DEFAULT_POST_LOGIN_RETRY_COUNT = 15;
const DEFAULT_POST_LOGIN_RETRY_INTERVAL_MS = 2000;
const LOG_FILE = path.join(LOG_DIR, `yzj_session_monitor-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
const PID_FILE = path.join(LOG_DIR, 'yzj_session_monitor.pid');
const STATE_FILE = path.join(LOG_DIR, 'yzj_session_monitor.state.json');
const MANAGED_HOSTS = new Set(['yunzhijia.com', 'www.yunzhijia.com']);

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

function log(tag, message, payload = null) {
  const suffix = payload ? ` ${JSON.stringify(payload)}` : '';
  const line = `[${ts()}] ${tag} ${message}${suffix}`;
  console.log(line);
  appendLog(line);
}

function setPhase(phase, detail = '') {
  log('PHASE', detail ? `${phase} | ${detail}` : phase);
}

function parseUrl(url) {
  if (!url) return null;
  try {
    return new URL(url);
  } catch (error) {
    return null;
  }
}

function isManagedUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  return MANAGED_HOSTS.has(parsed.host.toLowerCase());
}

function isLoginUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed || !MANAGED_HOSTS.has(parsed.host.toLowerCase())) return false;
  return parsed.pathname === '/home/' && parsed.searchParams.get('m') === 'open' && parsed.searchParams.get('a') === 'login';
}

function isHomeUrl(url) {
  return isManagedUrl(url) && !isLoginUrl(url);
}

function hasLoggedInHomeUrl(url) {
  return /\/yzj-layout\/home\//i.test(url || '');
}

function isHomePage(page) {
  return isHomeUrl(page.url());
}

function findHomePage(pages) {
  return pages.find((p) => isHomeUrl(p.url())) || null;
}

function findLoginPage(pages) {
  return pages.find((p) => isLoginUrl(p.url())) || null;
}

function resolveWorkingPage(pages) {
  const homePage = findHomePage(pages);
  if (homePage) return { type: 'home', page: homePage };
  const loginPage = findLoginPage(pages);
  if (loginPage) return { type: 'login', page: loginPage };
  const blankPage = pages.find((p) => !p.url() || p.url() === 'about:blank') || null;
  if (blankPage) return { type: 'blank', page: blankPage };
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
  if (resolved.type === 'blank') return '空白标签页';
  return '未发现首页、登录页或空白标签页';
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

async function fetchAccountProbe(page) {
  return page.evaluate(async (apiPath) => {
    try {
      const response = await fetch(apiPath, {
        method: 'GET',
        credentials: 'include',
      });
      const text = await response.text();
      let jsonData = null;
      try {
        jsonData = JSON.parse(text);
      } catch (_e) {
        jsonData = null;
      }
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        text,
        json: jsonData,
      };
    } catch (err) {
      return { ok: false, error: String(err), json: null };
    }
  }, YZJ_ACCOUNT_API_PATH);
}

function evaluateProbe(accountProbe) {
  if (!accountProbe) {
    return {
      loggedIn: false,
      reason: 'account_api_unavailable',
      matchedSignals: [],
      missingRequirements: [],
      csrfToken: null,
    };
  }

  const ok = Boolean(accountProbe.ok);
  const payload = accountProbe.json;
  if (!ok || !payload || typeof payload !== 'object') {
    return {
      loggedIn: false,
      reason: 'account_api_unavailable',
      matchedSignals: [],
      missingRequirements: [],
      csrfToken: null,
    };
  }

  const success = payload.success === true;
  const csrfToken = String(payload.csrfToken || '').trim() || null;
  if (success && csrfToken) {
    return {
      loggedIn: true,
      reason: 'account_api_ok',
      matchedSignals: ['api:getMyAccount', 'field:success', 'field:csrfToken'],
      missingRequirements: [],
      csrfToken,
    };
  }

  return {
    loggedIn: false,
    reason: 'account_api_failed',
    matchedSignals: [],
    missingRequirements: [success ? null : 'field:success', csrfToken ? null : 'field:csrfToken'].filter(Boolean),
    csrfToken,
  };
}

function summarizeProbe(accountProbe) {
  if (!accountProbe) {
    return { ok: false, status: null, url: null, text: '', error: null };
  }
  return {
    ok: Boolean(accountProbe.ok),
    status: accountProbe.status ?? null,
    url: accountProbe.url || null,
    text: String(accountProbe.text || '').slice(0, 200),
    error: accountProbe.error || null,
  };
}

const REFRESH_CHECK_RETRY_COUNT = 5;
const REFRESH_CHECK_RETRY_INTERVAL_MS = 2000;

async function refreshAndCheck(page, timeoutMs = DEFAULT_NAVIGATION_TIMEOUT_MS) {
  if (!isHomePage(page)) {
    log('REFRESH', `打开业务首页: ${YZJ_HOME_URL}`);
    await page.goto(YZJ_HOME_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  } else {
    log('REFRESH', `刷新业务首页: ${page.url()}`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs });
  }
  await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});

  for (let attempt = 1; attempt <= REFRESH_CHECK_RETRY_COUNT; attempt += 1) {
    const probe = await fetchAccountProbe(page).catch((error) => ({ ok: false, error: error.message, json: null }));
    const evaluated = evaluateProbe(probe);
    if (evaluated.loggedIn) {
      log('OK', `登录态正常 (attempt=${attempt})`);
      return { alive: true, latest: probe, evaluated };
    }
    log('CHECK', `接口复核 attempt=${attempt} reason=${evaluated.reason}`, summarizeProbe(probe));
    if (attempt < REFRESH_CHECK_RETRY_COUNT) await sleep(REFRESH_CHECK_RETRY_INTERVAL_MS);
  }

  log('FAIL', '登录态检查失败：接口复核多次重试后仍未通过');
  return { alive: false, latest: null, evaluated: { loggedIn: false, reason: 'account_api_failed' } };
}

async function hasSuccessSelector(page) {
  return page.locator(YZJ_LOGIN_SUCCESS_SELECTOR).first().isVisible({ timeout: 1000 }).catch(() => false);
}

async function waitForLoginSuccess(page, timeoutMs) {
  const started = Date.now();
  let attempt = 0;
  while (Date.now() - started < timeoutMs) {
    attempt += 1;
    const selectorMatched = await hasSuccessSelector(page);
    const homeUrlMatched = hasLoggedInHomeUrl(page.url());
    const probe = await fetchAccountProbe(page).catch((error) => ({ ok: false, error: error.message, json: null }));
    const evaluated = evaluateProbe(probe);
    log('CHECK', `登录后复核 attempt=${attempt} selectorMatched=${selectorMatched} homeUrlMatched=${homeUrlMatched} loggedIn=${evaluated.loggedIn} reason=${evaluated.reason}`, evaluated.loggedIn ? null : summarizeProbe(probe));
    if (selectorMatched || homeUrlMatched) {
      if (!evaluated.loggedIn) {
        log('CHECK', '页面成功信号已出现，接口复核留待 post-check 继续确认');
      }
      return { ok: true, probe, evaluated, selectorMatched, homeUrlMatched };
    }
    await sleep(DEFAULT_POST_LOGIN_RETRY_INTERVAL_MS);
  }
  return { ok: false, probe: null, evaluated: { loggedIn: false, reason: 'account_api_failed' }, selectorMatched: false, homeUrlMatched: false };
}

async function loginFlow(page, timeoutMs = DEFAULT_NAVIGATION_TIMEOUT_MS) {
  const sameLoginPage = isLoginUrl(page.url());
  if (sameLoginPage) {
    log('LOGIN', `复用已有登录页: ${page.url()}`);
  } else {
    log('LOGIN', `打开登录页: ${YZJ_LOGIN_URL}`);
    await page.goto(YZJ_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  }
  await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});

  log('LOGIN', '等待用户完成登录并命中登录成功元素');
  const verified = await waitForLoginSuccess(page, timeoutMs);
  if (!verified.ok) {
    log('WARN', `登录等待超时或接口复核失败，当前页面: ${page.url()}`);
    return { loggedIn: false, latest: verified.probe, evaluated: verified.evaluated };
  }

  log('LOGIN', `已完成登录复核: ${page.url()}`);
  return { loggedIn: true, latest: verified.probe, evaluated: verified.evaluated };
}

async function ensureAlreadyLoggedIn(page, timeoutMs = DEFAULT_NAVIGATION_TIMEOUT_MS) {
  const currentPage = isHomePage(page) ? page : findHomePage(page.context().pages());
  if (!currentPage) {
    log('LOGIN', '执行登录前未发现首页标签页，继续进入登录流程');
    return { alreadyLoggedIn: false, page: null, latest: null, evaluated: null };
  }

  log('TAB', `登录前校验定位到首页标签: ${currentPage.url()}`);
  if (currentPage !== page) {
    await bringPageToFront(currentPage, '首页');
  }

  log('CHECK', '执行登录前校验，检查当前登录态');
  const result = await refreshAndCheck(currentPage, timeoutMs);
  if (result.alive) {
    log('OK', '执行登录前已确认登录态有效，直接返回已登录');
    return { alreadyLoggedIn: true, page: currentPage, latest: result.latest, evaluated: result.evaluated };
  }

  log('LOGIN', '执行登录前校验未通过，继续登录流程');
  return { alreadyLoggedIn: false, page: currentPage, latest: result.latest, evaluated: result.evaluated };
}

async function runKeepaliveLoop({ browser, context, page, timeoutMs, refreshIntervalMs }) {
  setPhase('keepalive', `interval=${refreshIntervalMs}ms`);
  log('KEEPALIVE', `校验完成，进入保活；优先首页标签页，每 ${Math.round(refreshIntervalMs / 1000)} 秒检查一次`);

  while (true) {
    const currentHomePage = findHomePage(context.pages());
    if (!currentHomePage) {
      log('FAIL', '首页标签页已不存在，判定登录失败，返回登录页');
      await page.goto(YZJ_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
      break;
    }

    const result = await refreshAndCheck(currentHomePage, timeoutMs);
    if (!result.alive) {
      log('FAIL', '保活检查失败，停止循环并返回登录页');
      await currentHomePage.goto(YZJ_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
      break;
    }

    log('KEEPALIVE', `下一轮检查将在 ${Math.round(refreshIntervalMs / 1000)} 秒后执行`);
    await sleep(refreshIntervalMs);
  }

  await safeDisconnect(browser);
}

async function startKeepAlive({ refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS, timeoutMs = DEFAULT_NAVIGATION_TIMEOUT_MS, foregroundKeepalive = false, forceLogin = false, spawnBackgroundKeepalive = false } = {}) {
  setPhase('bootstrap', 'ensure-debug-browser');
  const { info, reused } = await ensureDebugBrowser({ url: YZJ_LOGIN_URL, port: DEFAULT_DEBUG_PORT });
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
  } else if (resolved.type === 'blank') {
    await bringPageToFront(resolved.page, '空白页');
  } else {
    log('TAB', '未发现首页、登录页或空白页，将新建工作页');
  }

  let workingPage = resolved.page;
  if (!workingPage) {
    workingPage = await context.newPage();
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
        await runKeepaliveLoop({ browser, context, page: workingPage, timeoutMs, refreshIntervalMs });
      } else {
        await safeDisconnect(browser);
      }
      return { alive: true, reason: 'already-logged-in', phase: 'precheck', latest: preCheck.latest, evaluated: preCheck.evaluated };
    }
  } else {
    log('LOGIN', 'forceLogin=true，跳过登录前已登录短路，直接进入登录流程');
  }

  setPhase('login');
  log('FLOW', '进入登录状态机: login -> post-check -> keepalive');
  await logBrowserSnapshot(context, 'before-login');
  const loginEntryPage = resolved.type === 'login' ? workingPage : workingPage;
  const loggedIn = await loginFlow(loginEntryPage, timeoutMs);
  await logBrowserSnapshot(context, 'after-login');
  const postLoginPage = findHomePage(context.pages()) || loginEntryPage;
  if (!loggedIn.loggedIn || !isHomePage(postLoginPage)) {
    log('FAIL', '登录后未成功进入首页，返回登录页');
    await postLoginPage.goto(YZJ_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
    await safeDisconnect(browser);
    return { alive: false, reason: 'login-failed', phase: 'login', latest: loggedIn.latest, evaluated: loggedIn.evaluated };
  }

  setPhase('post-check');
  log('CHECK', '登录成功，立即执行校验');
  await bringPageToFront(postLoginPage, '登录后首页');
  await logBrowserSnapshot(context, 'before-post-check');
  const initialCheck = await refreshAndCheck(postLoginPage, timeoutMs);
  if (!initialCheck.alive) {
    log('FAIL', '登录后校验失败，返回登录页');
    await postLoginPage.goto(YZJ_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
    await safeDisconnect(browser);
    return { alive: false, reason: 'post-login-check-failed', phase: 'post-check', latest: initialCheck.latest, evaluated: initialCheck.evaluated };
  }

  if (spawnBackgroundKeepalive) {
    writePid(process.pid);
    writeState({ phase: 'post-check', status: 'keepalive-spawn-requested', browserPid: null, pages: snapshotPages(context.pages()) });
    log('KEEPALIVE', '已启动后台保活模式，主进程将退出');
    const childEnv = { ...process.env, YZJ_SESSION_MONITOR_CHILD: '1', FOREGROUND_KEEPALIVE: '1', FORCE_LOGIN: '0', SPAWN_BACKGROUND_KEEPALIVE: '0', REFRESH_INTERVAL_MS: String(refreshIntervalMs), PAGE_TIMEOUT_MS: String(timeoutMs) };
    const child = fork(__filename, [], { detached: true, stdio: 'ignore', env: childEnv });
    child.unref();
    await safeDisconnect(browser);
    return { alive: true, reason: 'background-keepalive-spawned', phase: 'post-check', latest: initialCheck.latest, evaluated: initialCheck.evaluated, background: true };
  }

  if (!foregroundKeepalive) {
    log('KEEPALIVE', '登录完成且校验通过，但当前为非阻塞模式，已结束本次执行');
    writeState({ phase: 'post-check', status: 'completed-no-keepalive', browserPid: null, pages: snapshotPages(context.pages()) });
    await safeDisconnect(browser);
    return { alive: true, reason: 'post-check-passed', phase: 'post-check', latest: initialCheck.latest, evaluated: initialCheck.evaluated };
  }

  await runKeepaliveLoop({ browser, context, page: workingPage, timeoutMs, refreshIntervalMs });
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
  YZJ_LOGIN_URL,
  YZJ_HOME_URL,
  YZJ_ACCOUNT_API_PATH,
  DEFAULT_REFRESH_INTERVAL_MS,
  refreshAndCheck,
  loginFlow,
  startKeepAlive,
};

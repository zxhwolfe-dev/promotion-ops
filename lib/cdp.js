'use strict';
// 只连接人工启动的专用 Chrome；不启动/关闭浏览器，不清理默认 context。
const { OpsError, redact } = require('./ops');
const { withLock } = require('./state');
const CDP_ENDPOINT = process.env.PROMO_CDP || 'http://127.0.0.1:9234';
function endpointConfig(raw = CDP_ENDPOINT) {
  let url;
  try { url = new URL(raw); } catch { throw new OpsError('INVALID_CDP', 'CDP 地址格式无效'); }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new OpsError('UNSAFE_CDP', 'CDP 仅允许本机回环地址；远程访问请使用 SSH 本地隧道');
  }
  // HTTP discovery、WebSocket 地址和 localhost 别名都使用同一端口锁。
  return { endpoint: url.href, lockKey: `cdp:loopback:${url.port || (['https:', 'wss:'].includes(url.protocol) ? '443' : '80')}` };
}
async function withBrowser(fn, options = {}) {
  const config = endpointConfig(options.endpoint);
  return withLock(config.lockKey, async () => {
    const chromium = options.chromium || require('playwright-core').chromium;
    const browser = await chromium.connectOverCDP(config.endpoint, { timeout: 15000 });
    let primaryError;
    try {
      const context = browser.contexts()[0];
      if (!context) throw new OpsError('NO_DEFAULT_CONTEXT', '未找到常驻浏览器默认 context；不会另建无登录态的 context');
      return await fn(context);
    } catch (error) { primaryError = error; throw error; }
    finally {
      try { await browser.close(); } // CDP 连接：断开，不调用 context.close() / Browser.close CDP 命令。
      catch (error) {
        // 清理错误不能覆盖原始错误或已经获得的独立验证证据。
        console.error(JSON.stringify({ status: 'warning', code: 'CDP_DISCONNECT_FAILED', hadPrimaryError: !!primaryError, message: redact(error.message).split('\n')[0] }));
      }
    }
  });
}
async function withPage(fn, options = {}) {
  if (options.reuse) throw new OpsError('UNSAFE_REUSE', '不再支持任意标签匹配函数；请使用独立标签或明确的 reuseURL');
  return withBrowser(async context => {
    let page;
    if (options.reuseURL) {
      const target = new URL(options.reuseURL).href;
      const matches = context.pages().filter(candidate => candidate.url() === target && !candidate.isClosed());
      if (matches.length > 1) throw new OpsError('AMBIGUOUS_PAGE', '多个标签匹配 reuseURL，拒绝选择');
      page = matches[0];
    }
    const owned = !page;
    if (owned) page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(35000);
    let preserve = !!options.keepPage;
    try {
      if (options.foreground || process.env.PROMO_FOREGROUND === '1') await page.bringToFront();
      return await fn(page, context);
    } catch (error) { preserve ||= !!error.preservePage || !!options.keepOnError; throw error; }
    finally {
      if (owned && !preserve && !page.isClosed()) {
        try { await page.close({ runBeforeUnload: false }); }
        catch { console.error(JSON.stringify({ status: 'warning', code: 'PAGE_CLEANUP_FAILED' })); }
      }
    }
  }, options);
}
async function withReadPage(context, fn) {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(35000);
  try { return await fn(page); }
  finally { if (!page.isClosed()) await page.close({ runBeforeUnload: false }).catch(() => {}); }
}
module.exports = { CDP_ENDPOINT, endpointConfig, withBrowser, withPage, withReadPage };

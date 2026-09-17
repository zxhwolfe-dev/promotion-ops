'use strict';
const fs = require('node:fs/promises');
const { setTimeout: sleep } = require('node:timers/promises');

class OpsError extends Error {
  constructor(code, message, exitCode = 1, details = {}) {
    super(message);
    this.name = 'OpsError';
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
    this.preservePage = exitCode === 2 || exitCode === 3;
  }
}
function redact(value) {
  let text = String(value);
  for (const [key, secret] of Object.entries(process.env)) {
    if (/token|secret|password|api[_-]?key/i.test(key) && secret.length >= 4) {
      for (const variant of [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)]) text = text.split(variant).join('[REDACTED]');
    }
  }
  return text.replace(/([?&](?:token|key|password|secret)=)[^\s&#"']*/gi, '$1[REDACTED]')
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
}
function errorResult(error) {
  return { status: 'error', code: error.code || 'UNEXPECTED_ERROR',
    message: redact(String(error.message || error).split('\n')[0]).slice(0, 400),
    ...(error.details ? { details: error.details } : {}) };
}
async function run(main) {
  try {
    const result = await main();
    if (!result || typeof result !== 'object') throw new OpsError('NO_RESULT', '脚本未返回结构化结果');
    console.log(redact(JSON.stringify(result, null, 2)));
    if (['partial', 'unavailable'].includes(result.status)) process.exitCode = 2;
    return result;
  } catch (error) {
    console.error(redact(JSON.stringify(errorResult(error))));
    process.exitCode = error.exitCode || 1; // 不使用 process.exit：先完成 finally 清理。
  }
}
function requiredEnv(name, pattern) {
  const value = process.env[name]?.trim();
  if (!value || (pattern && !pattern.test(value))) throw new OpsError('CONFIG_REQUIRED', `请配置有效的 ${name}`);
  return value;
}
async function readText(file, maxBytes = 2 * 1024 * 1024) {
  if (!file) throw new OpsError('INPUT_REQUIRED', '请提供正文文件路径');
  const handle = await fs.open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maxBytes) throw new OpsError('INVALID_FILE', '输入须为不超过 2 MiB 的普通文本文件');
    const text = await handle.readFile('utf8');
    if (!text.trim()) throw new OpsError('EMPTY_CONTENT', '正文不能为空');
    return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  } finally { await handle.close(); }
}
function trustedURL(raw, hosts, pathPattern) {
  let url;
  try { url = new URL(raw); } catch { throw new OpsError('INVALID_URL', 'URL 格式无效'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      !hosts.includes(url.hostname) || (pathPattern && !pathPattern.test(url.pathname))) {
    throw new OpsError('UNTRUSTED_URL', 'URL 不属于本操作允许的 HTTPS 站点或路径');
  }
  return url;
}
const normalize = text => String(text || '').normalize('NFC').replace(/\s+/g, ' ').trim();
async function until(check, { timeout = 20000, interval = 400, code = 'UNVERIFIED', label = '未取得可靠验证结果', exitCode = 2 } = {}) {
  const deadline = Date.now() + timeout;
  do {
    const value = await check(); // 只用于只读探测；异常不吞掉，更不重复写操作。
    if (value) return value;
    if (Date.now() >= deadline) break;
    await sleep(Math.min(interval, deadline - Date.now()));
  } while (Date.now() <= deadline);
  throw new OpsError(code, label, exitCode);
}
async function assertNoChallenge(page) {
  const url = new URL(page.url());
  if (/^(accounts\.google\.com|passport\.|login\.|account\.aliyun\.com)/.test(url.hostname) ||
      /\/(?:login|signin)(?:\/|$)/i.test(url.pathname)) {
    throw new OpsError('LOGIN_REQUIRED', '登录页已出现，请在保留的标签页中人工登录；不要自动重发', 3);
  }
  const challenges = page.locator('#aliyunCaptcha-mask:visible, .passport-login-mark2:visible, .nc_wrapper:visible, iframe[src*="captcha"]:visible');
  if (await challenges.count()) throw new OpsError('HUMAN_REQUIRED', '验证码或扫码出现；保留页面交人工，完成后须独立核验', 3);
}
async function navigate(page, raw, hosts) {
  const target = trustedURL(raw, hosts);
  const response = await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await assertNoChallenge(page);
  trustedURL(page.url(), hosts); // 防止输入/重定向把有登录态的操作带到其他站点。
  if (response && response.status() >= 400) throw new OpsError('HTTP_ERROR', `页面 HTTP ${response.status()}`, 2);
}
async function choose(page, candidates, label, timeout = 15000) {
  return until(async () => {
    await assertNoChallenge(page);
    for (const candidate of candidates) {
      const locator = candidate.filter({ visible: true });
      const count = await locator.count();
      if (count > 1) throw new OpsError('AMBIGUOUS_SELECTOR', `${label} 匹配多个可见元素，拒绝猜测点击`);
      if (count === 1) return locator;
    }
    return null;
  }, { timeout, label: `${label} 未找到，可能未登录或页面已改版`, code: 'SELECTOR_MISSING', exitCode: 1 });
}
async function button(page, name, scope = page) {
  return choose(page, [scope.getByRole('button', { name, exact: typeof name === 'string' })], `按钮 ${name}`);
}
async function fillEmpty(locator, value, { keyboard = false } = {}) {
  const old = await locator.evaluate(el => 'value' in el ? el.value : el.innerText);
  if (normalize(old)) throw new OpsError('EXISTING_DRAFT', '编辑器已有内容，拒绝覆盖；请人工检查恢复的草稿', 3);
  if (keyboard) {
    await locator.click();
    await locator.pressSequentially(value, { delay: 1 });
  } else await locator.fill(value);
  const actual = await locator.evaluate(el => 'value' in el ? el.value : el.innerText);
  if (normalize(actual) !== normalize(value)) throw new OpsError('FILL_MISMATCH', '编辑器回读与输入不一致，停止发布');
}
module.exports = { OpsError, run, redact, errorResult, requiredEnv, readText, trustedURL, normalize, until, assertNoChallenge, navigate, choose, button, fillEmpty };

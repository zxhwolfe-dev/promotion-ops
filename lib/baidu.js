'use strict';
const { OpsError, trustedURL } = require('./ops');
function prepareURLs(text, rawSite) {
  let site;
  try { site = new URL(rawSite); } catch { throw new OpsError('INVALID_SITE', 'BAIDU_SITE 必须是 HTTPS 站点 URL'); }
  trustedURL(site.href, [site.hostname]);
  if (site.pathname !== '/' || site.search || site.hash) throw new OpsError('INVALID_SITE', 'BAIDU_SITE 必须为站点根地址');
  const urls = [...new Set(text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(raw => {
    const url = trustedURL(raw, [site.hostname]);
    if (url.origin !== site.origin || [...url.searchParams.keys()].some(key => /^(?:access_token|token|password|secret|api_key)$/i.test(key))) {
      throw new OpsError('UNSAFE_PUSH_URL', '推送 URL 须属于同一站点，且不得含凭据参数');
    }
    url.hash = '';
    return url.href;
  }))];
  if (!urls.length) throw new OpsError('EMPTY_URL_LIST', '推送列表不能为空');
  return { site: site.origin, urls };
}
function validateResponse(data, requested) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new OpsError('INVALID_API_RESPONSE', '百度返回的不是有效对象', 2);
  if (data.error) throw new OpsError('BAIDU_REJECTED', '百度拒绝本次推送，请检查站点、token 或配额；不自动重试', 2, { apiError: data.error });
  if (!Number.isInteger(data.success) || data.success < 0 || !Number.isInteger(data.remain) || data.remain < 0) {
    throw new OpsError('INVALID_API_RESPONSE', '百度响应缺少有效 success/remain，不能确认推送结果', 2);
  }
  const invalid = data.not_valid || [];
  const otherSite = data.not_same_site || [];
  if (!Array.isArray(invalid) || !Array.isArray(otherSite)) throw new OpsError('INVALID_API_RESPONSE', '百度拒绝列表格式改变', 2);
  if (data.success !== requested || invalid.length || otherSite.length) {
    throw new OpsError('PARTIAL_PUSH', '本次推送未全部确认接收；请核对，不要重发整个批次', 2, { requested, accepted: data.success, remain: data.remain, rejected: invalid.length + otherSite.length });
  }
  return { accepted: data.success, remain: data.remain };
}
async function pushURLs({ site, urls, token }, { fetchImpl = globalThis.fetch } = {}) {
  const endpoint = new URL('https://data.zz.baidu.com/urls');
  endpoint.searchParams.set('site', site);
  endpoint.searchParams.set('token', token);
  let response;
  try {
    response = await fetchImpl(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: urls.join('\n'), redirect: 'error', signal: AbortSignal.timeout(20000) });
  } catch { throw new OpsError('PUSH_OUTCOME_UNKNOWN', 'HTTPS 推送失败或超时，结果未知；不会降级到明文 HTTP 或自动重试', 2); }
  if (!response.ok) throw new OpsError('BAIDU_HTTP_ERROR', `百度 HTTP ${response.status}，请核对本次请求是否接收`, 2);
  let data;
  try {
    const text = await response.text();
    if (text.length > 65536) throw new Error('oversized');
    data = JSON.parse(text);
  } catch { throw new OpsError('INVALID_API_RESPONSE', '百度响应不是有效的小型 JSON，不能确认接收', 2); }
  return validateResponse(data, urls.length);
}
module.exports = { prepareURLs, validateResponse, pushURLs };

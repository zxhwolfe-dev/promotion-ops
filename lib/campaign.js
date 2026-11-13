'use strict';
const { OpsError } = require('./ops');
const ORIGINS = { zh: 'https://aiworkstation.cn', en: 'https://useaistation.com' };
const PRODUCT_ORIGINS = { aiworkstation: ORIGINS, ak: { zh: 'https://akaiagents.com', en: 'https://akaiagents.com' } };
const PRIVATE_QUERY = /^(?:token|(?:access|refresh|id)[_-]?token|password|secret|api[_-]?key|session(?:[_-]?id)?|email|auth|authorization|client[_-]?id|invite(?:[_-]?code)?)$/i;
const CHANNELS = new Set(['v2ex', 'zhihu', 'oschina', 'tencent', 'csdn', 'aliyun', 'tiktok', 'reddit', 'devto', 'youtube', 'pinterest', 'x', 'bilibili']);
function hasPrivateParameters(url) {
  const fragment = url.hash.slice(1).split('?').at(-1);
  return [url.searchParams, new URLSearchParams(fragment)].some(params => [...params.keys()].some(key => PRIVATE_QUERY.test(key)));
}
function label(value, name) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value)) throw new OpsError('INVALID_CAMPAIGN', `${name} 须为小写英文字母、数字、下划线或连字符，最多80字符`);
  return value;
}
function campaignURL({ language, path, channel, campaign, content, medium = 'social', product = 'aiworkstation' }) {
  if (!Object.hasOwn(PRODUCT_ORIGINS, product)) throw new OpsError('INVALID_PRODUCT', 'product 须为 aiworkstation 或 ak');
  if (!Object.hasOwn(ORIGINS, language)) throw new OpsError('INVALID_LANGUAGE', 'language 须为 zh 或 en');
  if (!CHANNELS.has(channel)) throw new OpsError('INVALID_CHANNEL', '渠道不在当前清单，小红书仍暂停');
  const origin = PRODUCT_ORIGINS[product][language];
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) throw new OpsError('INVALID_LANDING', 'path 须为站内绝对路径');
  const url = new URL(path, origin);
  if (url.origin !== origin || /^\/(?:v2|gaokao)(?:\/|$)/i.test(url.pathname)) throw new OpsError('INVALID_LANDING', '不允许站外或已停用落地页');
  if (hasPrivateParameters(url)) throw new OpsError('PRIVATE_LINK', '公开推广链接不得携带凭据、身份或邮箱参数');
  for (const [key, value] of Object.entries({ utm_source: channel, utm_medium: medium, utm_campaign: campaign, utm_content: content })) {
    url.searchParams.set(key, label(value, key));
  }
  return url.href;
}
function copyIssues(draft) {
  const issues = [];
  const fail = (code, message) => issues.push({ code, message });
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return [{ code: 'INVALID_DRAFT', message: '需要草稿对象' }];
  if (!CHANNELS.has(draft.channel)) fail('INVALID_CHANNEL', '渠道未登记或暂停（小红书不可发布）');
  if (!Object.hasOwn(ORIGINS, draft.language)) fail('INVALID_LANGUAGE', 'language 须为 zh 或 en');
  const product = draft.product === undefined ? 'aiworkstation' : draft.product;
  if (!Object.hasOwn(PRODUCT_ORIGINS, product)) fail('INVALID_PRODUCT', 'product 须为 aiworkstation 或 ak');
  const expectedOrigin = PRODUCT_ORIGINS[product]?.[draft.language];
  if (typeof draft.text !== 'string' || !draft.text.trim()) fail('EMPTY_COPY', '正文不能为空');
  if (draft.title !== undefined && typeof draft.title !== 'string') fail('INVALID_TITLE', 'title 须为字符串');
  if (draft.tags !== undefined && (!Array.isArray(draft.tags) || draft.tags.some(tag => typeof tag !== 'string'))) fail('INVALID_TAGS', 'tags 须为字符串数组');
  const copy = [draft.title || '', draft.text || '', ...(Array.isArray(draft.tags) ? draft.tags : [])].join('\n');
  if (draft.channel === 'tiktok') {
    if (draft.language !== 'en') fail('TIKTOK_LANGUAGE', 'TikTok 全部文案必须英文');
    if ([...copy].some(char => /\p{Letter}/u.test(char) && !/\p{Script=Latin}/u.test(char))) fail('TIKTOK_NON_ENGLISH_SCRIPT', 'TikTok 标题、描述或标签含非拉丁文字，需英文审校');
  }
  for (const raw of copy.match(/(?:https?:)?\/\/[^\s<>"'）)\]]+|(?<![\w@.-])(?:[a-z0-9-]+\.)*(?:aiworkstation\.cn|useaistation\.com|akaiagents\.com)\.?(?![\w.-])[^\s<>"'）)\]]*/gi) || []) {
    let url;
    const prefix = raw.startsWith('//') ? 'https:' : /^https?:/i.test(raw) ? '' : 'https://';
    try { url = new URL(prefix + raw.replace(/[.,;。；，]+$/, '').replaceAll('&amp;', '&')); } catch { continue; }
    url.hostname = url.hostname.replace(/\.$/, '');
    if (!Object.values(PRODUCT_ORIGINS).flatMap(origins => Object.values(origins)).some(origin => {
      const host = new URL(origin).hostname;
      return url.hostname === host || url.hostname.endsWith('.' + host);
    })) continue;
    if (url.origin !== expectedOrigin) fail('LANGUAGE_DOMAIN', '链接须匹配产品与文案语言对应的 HTTPS 域名');
    if (url.username || url.password || hasPrivateParameters(url)) fail('LINK_CREDENTIALS', '链接不得含凭据');
    if (url.searchParams.getAll('utm_source').length !== 1 || url.searchParams.get('utm_source') !== draft.channel) fail('UTM_SOURCE', '本站外链须有唯一且匹配本渠道的 utm_source');
    for (const field of ['utm_medium', 'utm_campaign', 'utm_content']) {
      if (url.searchParams.getAll(field).length !== 1 || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(url.searchParams.get(field) || '')) fail('UTM_DETAIL', `本站外链缺少有效 ${field}`);
    }
  }
  if (draft.channel === 'zhihu' && draft.accountWarning === true) fail('ZHIHU_WARNING', '收到 AI 生成等警告后暂停；先处理账号反馈');
  return issues;
}
function assertPromotionLinks(text, channel, language = process.env.PROMO_CONTENT_LANGUAGE || 'zh', product = 'aiworkstation') {
  const issues = copyIssues({ text, channel, language, product });
  if (issues.length) throw new OpsError('PROMOTION_PREFLIGHT', '发布前检查未通过', 1, { issues });
}
module.exports = { assertPromotionLinks, ORIGINS, CHANNELS, campaignURL, copyIssues };

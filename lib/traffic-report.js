'use strict';
const { OpsError } = require('./ops');
const SITES = new Map([['aiworkstation.cn', 'zh'], ['useaistation.com', 'en']]);
const AUTOMATED = /akai-v1|PromotionAudit|curl|wget|bot\b|spider|crawler|HeadlessChrome|uptime|monitor/i;
function trafficReport(rows, { start, end }) {
  const from = Date.parse(start), to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new OpsError('INVALID_WINDOW', '需要有效的 start/end，使用含时区的 ISO 时间');
  const groups = new Map(), counts = { rows: 0, excludedWindow: 0, excludedAutomated: 0, excludedNonPage: 0, invalid: 0, missingAttribution: 0 };
  for (const row of rows) {
    counts.rows++;
    if (!row || !Number.isFinite(Date.parse(row.at)) || !SITES.has(row.host) || typeof row.path !== 'string' || !row.path.startsWith('/') || typeof row.userAgent !== 'string' || !row.userAgent.trim() || typeof row.method !== 'string' || !Number.isInteger(row.status)) { counts.invalid++; continue; }
    const at = Date.parse(row.at);
    if (at < from || at >= to) { counts.excludedWindow++; continue; }
    if (AUTOMATED.test(row.userAgent)) { counts.excludedAutomated++; continue; }
    if (row.method !== 'GET' || row.status !== 200 || /\.(?:js|css|png|jpe?g|webp|svg|ico|woff2?|mp4|json|xml|txt)(?:\?|$)/i.test(row.path) || /^\/(?:api|health|assets)(?:\/|$)/.test(row.path)) { counts.excludedNonPage++; continue; }
    const source = /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(row.source || '') ? row.source : 'unattributed';
    const campaign = /^[a-z0-9][a-z0-9_-]{0,99}$/i.test(row.campaign || '') ? row.campaign : 'unattributed';
    if (source === 'unattributed') counts.missingAttribution++;
    const key = JSON.stringify([row.host, source, campaign]);
    if (!groups.has(key)) groups.set(key, { host: row.host, language: SITES.get(row.host), source, campaign, pageRequests: 0 });
    groups.get(key).pageRequests++;
  }
  return { status: counts.invalid ? 'partial' : 'ok', window: { start, end, endExclusive: true }, counts,
    groups: [...groups.values()].sort((a, b) => b.pageRequests - a.pageRequests),
    humanVisitors: null, uniqueVisitors: null, activations: null,
    limitation: '仅过滤已知自动请求后的页面请求数；UA过滤不能证明真人，不能据此推算UV、会话、注册或出图转化。' };
}
module.exports = { trafficReport };

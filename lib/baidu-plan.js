'use strict';
const { OpsError } = require('./ops');
const { prepareURLs } = require('./baidu');
// URL-level planning is intentionally separate from sending. History is explicit evidence,
// never reconstructed from the old cumulative submission counter.
function planPush({ inventory, history, site = 'https://aiworkstation.cn', limit = 10 }) {
  if (!Array.isArray(inventory) || !Array.isArray(history) || !Number.isInteger(limit) || limit < 0 || limit > 10) throw new OpsError('INVALID_PUSH_PLAN', '需要 inventory/history 数组和0–10条上限');
  const byURL = new Map(), selected = [], skipped = [], seen = new Set();
  for (const row of history) {
    if (!row || !['accepted', 'unknown'].includes(row.status) || !Number.isFinite(Date.parse(row.at)) || typeof row.url !== 'string') throw new OpsError('INVALID_PUSH_HISTORY', '历史须含 URL、有效 at 和 accepted/unknown 状态');
    const url = prepareURLs(row.url, site).urls[0];
    const old = byURL.get(url);
    // An unresolved outcome remains blocking even if a later row claims accepted.
    if (!old || row.status === 'unknown' || (old.status !== 'unknown' && Date.parse(row.at) > Date.parse(old.at))) byURL.set(url, row);
  }
  for (const row of inventory) {
    if (!row || typeof row.url !== 'string') throw new OpsError('INVALID_PUSH_INVENTORY', '清单项缺 URL');
    const url = prepareURLs(row.url, site).urls[0];
    if (seen.has(url)) { skipped.push({ url, reason: 'duplicate_inventory' }); continue; }
    seen.add(url);
    const prior = byURL.get(url);
    let reason;
    if (row.indexable !== true || row.canonicalVerified !== true) reason = 'indexability_or_canonical_unverified';
    else if (new URL(url).pathname.startsWith('/aitu-studio/') && new URL(url).pathname !== '/aitu-studio/intro/') reason = 'private_workspace_not_seo';
    else if (prior?.status === 'unknown') reason = 'prior_outcome_unknown';
    else if (prior && !(Number.isFinite(Date.parse(row.modifiedAt)) && Date.parse(row.modifiedAt) > Date.parse(prior.at))) reason = 'already_accepted_unchanged';
    else if (selected.length >= limit) reason = 'batch_limit';
    if (reason) skipped.push({ url, reason });
    else selected.push({ url, reason: prior ? 'verified_update' : 'not_in_supplied_history' });
  }
  const unverifiedHistoryCandidates = selected.filter(row => row.reason === 'not_in_supplied_history').length;
  const unverifiedInventory = skipped.filter(row => row.reason === 'indexability_or_canonical_unverified').length;
  const unresolvedOutcomes = skipped.filter(row => row.reason === 'prior_outcome_unknown').length;
  return { status: unverifiedHistoryCandidates || unverifiedInventory || unresolvedOutcomes ? 'partial' : 'ok', mode: 'plan_only', selected, skipped,
    historyCoverage: 'supplied_history_only', unverifiedHistoryCandidates, unverifiedInventory, unresolvedOutcomes,
    note: '仅依据所提供历史；历史缺失不能证明未推过。不发送请求；接口接收不等于索引收录。' };
}
module.exports = { planPush };

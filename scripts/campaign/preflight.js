'use strict';
// Local only. Does not connect to Chrome or publish anything.
const path = require('node:path');
const { run, readText, OpsError } = require('../../lib/ops');
const { copyIssues } = require('../../lib/campaign');
const { historicalTitles, inspectMedia } = require('../../lib/campaign-media');
async function main(args = process.argv.slice(2)) {
  const draft = JSON.parse(await readText(args[0]));
  const issues = copyIssues(draft);
  const assets = draft?.assets ?? [];
  if (!Array.isArray(assets)) throw new OpsError('INVALID_ASSETS', 'assets 必须为数组');
  if (draft?.channel === 'tiktok' && !assets.length) issues.push({ code: 'TIKTOK_MEDIA_REQUIRED', message: 'TikTok 发布准备必须包含实际媒体，大纲尚不能发布' });
  let media = { checks: [], issues: [] };
  if (assets.length) {
    if (!args[1]) throw new OpsError('ASSET_HISTORY_REQUIRED', '含素材时必须提供 promotion-metrics.md 和跨轮 SHA256 登记文件');
    if (!args[2]) throw new OpsError('ASSET_REGISTRY_REQUIRED', '含素材时必须提供跨轮 SHA256 登记；首次可显式创建空数组登记文件，历史标题检查仍保留');
    const titles = historicalTitles(await readText(args[1]));
    const records = args[2] ? JSON.parse(await readText(args[2])) : [];
    media = await inspectMedia(assets, { channel: draft.channel, titles, records, baseDir: path.dirname(path.resolve(args[0])) });
  }
  return { status: issues.length || media.issues.length ? 'partial' : 'ok', mode: 'offline_preflight',
    publishPerformed: false, issues: [...issues, ...media.issues], assets: media.checks,
    requiresLiveReview: ['当前平台规则与账号通知', '回答是否解决原问题、关联身份披露', '实际画质、英文自然程度与素材授权', '发布后公开链接及24h/72h回读'],
    dedupeScope: args[2] ? 'historical_titles_and_registered_sha256' : 'historical_titles_and_this_draft_sha256_only' };
}
if (require.main === module) run(main);
module.exports = main;

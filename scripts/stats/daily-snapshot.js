'use strict';
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { withPage } = require('../../lib/cdp');
const { run, readText, navigate, OpsError, errorResult } = require('../../lib/ops');
const { writeJSON } = require('../../lib/state');
const { SITES, articleURL } = require('../../lib/articles');
const { readMetric } = require('../../lib/metrics');
const { redditComments } = require('../../lib/comments');
async function main() {
  const file = process.env.PROMO_TARGETS_FILE || path.join(__dirname, '../../config/targets.example.json');
  const targets = JSON.parse(await readText(file));
  if (!Array.isArray(targets) || !targets.length || targets.length > 100) throw new OpsError('INVALID_TARGETS', '快照配置须包含 1–100 篇文章');
  const ids = new Set();
  for (const target of targets) {
    if (!target.id || ids.has(target.id) || !articleURL(target.kind, target.url)) throw new OpsError('INVALID_TARGET', '快照目标须有唯一 ID、已支持的平台和完整文章 URL，不能使用首页占位');
    ids.add(target.id);
  }
  const results = await withPage(async page => {
    const out = [];
    for (const target of targets) {
      const base = { id: target.id, kind: target.kind, url: target.url, collectedAt: new Date().toISOString() };
      try {
        await navigate(page, target.url, SITES[target.kind].hosts);
        if (articleURL(target.kind, page.url()) !== articleURL(target.kind, target.url)) throw new OpsError('TARGET_CHANGED', '文章跳转至其他目标，不能归入原文章统计', 2);
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); // 四平台均为 SPA：指标多为异步渲染
        await page.waitForTimeout(3000);
        const metrics = Object.fromEntries(await Promise.all(['reads', 'likes', 'comments'].map(async key => [key, await readMetric(page, target.metricSelectors?.[key], 10000)])));
        const known = Object.values(metrics).filter(metric => metric.value !== null).length;
        out.push({ ...base, status: known === 3 ? 'ok' : known ? 'partial' : 'unavailable', metrics });
      } catch (error) {
        out.push({ ...base, status: 'unavailable', metrics: { reads: { value: null }, likes: { value: null }, comments: { value: null } }, error: errorResult(error) });
      }
    }
    const user = process.env.REDDIT_USERNAME;
    if (user && /^[A-Za-z0-9_-]+$/.test(user)) {
      try {
        const url = `https://old.reddit.com/user/${user}/comments/`;
        await navigate(page, url, ['old.reddit.com']);
        const rows = await redditComments(page);
        out.push({ id: 'reddit-comments', kind: 'reddit', url, status: rows.length ? 'ok' : 'unavailable', coverage: 'first_5_comments', comments: rows.slice(0, 5).map(({ id, url, score }) => ({ id, url, score })) });
      } catch (error) { out.push({ id: 'reddit-comments', status: 'unavailable', error: errorResult(error) }); }
    }
    return out;
  });
  const collectedAt = new Date().toISOString();
  const outputFile = path.join(process.env.PROMO_OUTPUT_DIR || path.join(__dirname, '../../artifacts'), `snapshot-${collectedAt.replaceAll(':', '-')}-${randomUUID().slice(0, 8)}.json`);
  const snapshot = { schemaVersion: 1, status: results.every(row => row.status === 'ok') ? 'ok' : 'partial', collectedAt, coverage: 'configured_targets_only', usingExampleTargets: !process.env.PROMO_TARGETS_FILE, results, outputFile };
  await writeJSON(outputFile, snapshot);
  return snapshot;
}
if (require.main === module) run(main);
module.exports = main;

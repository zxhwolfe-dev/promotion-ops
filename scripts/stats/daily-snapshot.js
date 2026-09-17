'use strict';
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { withPage } = require('../../lib/cdp');
const { run, readText, navigate, OpsError, errorResult, until, assertNoChallenge } = require('../../lib/ops');
const { writeJSON } = require('../../lib/state');
const { SITES, articleURL } = require('../../lib/articles');
const { readMetric } = require('../../lib/metrics');
const { redditComments } = require('../../lib/comments');
const METRICS = ['reads', 'likes', 'comments'];
function validateTargets(targets) {
  if (!Array.isArray(targets) || !targets.length || targets.length > 100) throw new OpsError('INVALID_TARGETS', '快照配置须包含 1–100 篇文章');
  const ids = new Set(['reddit-comments']);
  for (const target of targets) {
    if (!target || typeof target !== 'object' || Array.isArray(target) || typeof target.id !== 'string' ||
        !target.id.trim() || target.id.length > 100 || ids.has(target.id) || !Object.hasOwn(SITES, target.kind) || !articleURL(target.kind, target.url)) {
      throw new OpsError('INVALID_TARGET', '快照目标须有唯一字符串 ID、已支持的平台和完整文章 URL');
    }
    ids.add(target.id);
    const selectors = target.metricSelectors ?? {};
    if (typeof selectors !== 'object' || Array.isArray(selectors) || Object.entries(selectors).some(([key, value]) =>
      !METRICS.includes(key) || typeof value !== 'string' || value.length > 500)) throw new OpsError('INVALID_METRIC_SELECTORS', '指标选择器须为 reads/likes/comments 到 CSS 字符串的映射');
    if (target.readySelector !== undefined && (typeof target.readySelector !== 'string' || !target.readySelector.trim() || target.readySelector.length > 500)) throw new OpsError('INVALID_READY_SELECTOR', 'readySelector 须为唯一可见的加载完成标记');
  }
  return targets;
}
async function collectTarget(page, target, { timeout = 10000 } = {}) {
  const url = articleURL(target.kind, target.url);
  const base = { id: target.id, kind: target.kind, url, startedAt: new Date().toISOString(),
    evidence: 'configured_dom_counters', readiness: target.readySelector ? 'configured_dom_marker' : 'parseable_dom_only' };
  let changed = false, watching = false;
  const checkTarget = () => {
    if (changed || articleURL(target.kind, page.url()) !== url) throw new OpsError('TARGET_CHANGED', '采样期间文章目标发生变化，整行数据作废', 2);
  };
  // Latch a main-frame target change, including A -> B -> A while sampling.
  const onNavigation = frame => {
    if (frame === page.mainFrame() && articleURL(target.kind, frame.url()) !== url) changed = true;
  };
  try {
    await navigate(page, url, SITES[target.kind].hosts);
    checkTarget();
    page.on('framenavigated', onNavigation); watching = true;
    if (target.readySelector) {
      await until(async () => {
        checkTarget(); await assertNoChallenge(page);
        const count = await page.locator(target.readySelector).filter({ visible: true }).count();
        if (count > 1) throw new OpsError('AMBIGUOUS_READY_SELECTOR', '加载完成标记不唯一', 2);
        return count === 1;
      }, { timeout, interval: 100, code: 'METRICS_NOT_READY', label: '未出现已配置的指标加载完成标记' });
    }
    // Wait for parseable, non-busy metric text, not network-idle or a fixed sleep.
    const metrics = Object.fromEntries(await Promise.all(METRICS.map(async metric => [metric,
      await readMetric(page, target.metricSelectors?.[metric], timeout, { metric, expectedUrl: url })])));
    checkTarget();
    await assertNoChallenge(page);
    checkTarget();
    if (Object.values(metrics).some(value => value.reason === 'target_changed_during_sample')) throw new OpsError('TARGET_CHANGED', '指标来自其他文档，不能计入当前文章', 2);
    const known = Object.values(metrics).filter(metric => metric.value !== null).length;
    return { ...base, collectedAt: new Date().toISOString(), status: known === 3 ? 'ok' : known ? 'partial' : 'unavailable', metrics };
  } catch (error) {
    return { ...base, collectedAt: new Date().toISOString(), status: 'unavailable',
      metrics: Object.fromEntries(METRICS.map(metric => [metric, { value: null, reason: error.code || 'collection_failed' }])), error: errorResult(error) };
  } finally { if (watching) page.off('framenavigated', onNavigation); }
}
async function main() {
  const file = process.env.PROMO_TARGETS_FILE || path.join(__dirname, '../../config/targets.example.json');
  const targets = validateTargets(JSON.parse(await readText(file)));
  const results = await withPage(async page => {
    const out = [];
    for (const target of targets) out.push(await collectTarget(page, target));
    const user = process.env.REDDIT_USERNAME;
    if (user && /^[A-Za-z0-9_-]+$/.test(user)) {
      try {
        const url = `https://old.reddit.com/user/${user}/comments/`;
        await navigate(page, url, ['old.reddit.com']);
        const rows = await redditComments(page);
        out.push({ id: 'reddit-comments', kind: 'reddit', url, collectedAt: new Date().toISOString(), status: rows.length ? 'ok' : 'unavailable', coverage: 'first_5_comments', comments: rows.slice(0, 5).map(({ id, url, score }) => ({ id, url, score })) });
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
module.exports.collectTarget = collectTarget;
module.exports.validateTargets = validateTargets;

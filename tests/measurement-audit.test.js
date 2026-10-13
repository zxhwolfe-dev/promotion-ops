'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planPush } = require('../lib/baidu-plan');
const { prepareURLs } = require('../lib/baidu');
const { trafficReport } = require('../lib/traffic-report');
const site = 'https://aiworkstation.cn';
test('push planning surfaces missing inventory evidence and unresolved submissions', () => {
  const row = { url: site + '/tools/', indexable: true, canonicalVerified: true };
  const absent = planPush({ inventory: [{ ...row, canonicalVerified: false }], history: [] });
  assert.equal(absent.status, 'partial'); assert.equal(absent.unverifiedInventory, 1);
  const unknown = planPush({ inventory: [row], history: [{ url: row.url, at: '2026-10-12T00:00:00Z', status: 'unknown' }] });
  assert.equal(unknown.status, 'partial'); assert.equal(unknown.unresolvedOutcomes, 1);
});
test('search submissions use canonical URLs and prioritize updates without daily repeat quotas', () => {
  assert.deepEqual(prepareURLs(site + '/tools/?utm_source=zhihu#x\n' + site + '/tools/', site).urls, [site + '/tools/']);
  const inventory = ['/tools/', '/aitu-studio/', '/aitu-studio/intro/'].map(p => ({ url: site + p, indexable: true, canonicalVerified: true }));
  const history = [{ url: site + '/tools/', at: '2026-10-10T00:00:00Z', status: 'accepted' }];
  assert.deepEqual(planPush({ inventory, history }).selected.map(row => row.url), [site + '/aitu-studio/intro/']);
  inventory[0].modifiedAt = '2026-10-12T00:00:00Z';
  assert.equal(planPush({ inventory, history }).selected[0].reason, 'verified_update');
  history.push({ url: site + '/tools/', at: '2026-10-09T00:00:00Z', status: 'unknown' });
  assert.equal(planPush({ inventory, history }).skipped[0].reason, 'prior_outcome_unknown');
  assert.equal(planPush({ inventory, history, limit: 0 }).selected.length, 0);
});
test('traffic counts exclude probes, missing sources stay unattributed, and requests never become humans', () => {
  const row = { at: '2026-10-13T01:00:00Z', host: 'useaistation.com', path: '/aitu-studio/intro/', method: 'GET', status: 200, userAgent: 'Mozilla/5.0', source: 'reddit', campaign: 'aitu30d' };
  const report = trafficReport([row, { ...row, userAgent: 'akai-v1-public-monitor' }, { ...row, path: '/app.js' }, { ...row, source: '' }, { ...row, at: '2026-10-14T00:00:00Z' }, null], { start: '2026-10-13T00:00:00Z', end: '2026-10-14T00:00:00Z' });
  assert.equal(report.status, 'partial');
  assert.equal(report.counts.invalid, 1); assert.equal(report.counts.excludedAutomated, 1);
  assert.equal(report.counts.excludedNonPage, 1); assert.equal(report.counts.excludedWindow, 1);
  assert.equal(report.counts.missingAttribution, 1); assert.equal(report.groups.length, 2);
  assert.equal(report.humanVisitors, null); assert.equal(report.activations, null);
});
test('daily snapshots require an explicitly selected inventory before any browser use', async () => {
  const old = process.env.PROMO_TARGETS_FILE; delete process.env.PROMO_TARGETS_FILE;
  try { await assert.rejects(require('../scripts/stats/daily-snapshot')(), { code: 'TARGETS_REQUIRED' }); }
  finally { if (old !== undefined) process.env.PROMO_TARGETS_FILE = old; }
});

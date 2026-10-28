'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { reportIdentity, reportContentHash } = require('../lib/ak-report-identity');
const { checkAKPackage } = require('../lib/ak-package-check');
const { reserveAKPackage } = require('../lib/ak-package-reservation');

async function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-logical-identity-'));
  try {
    const reports = ['battle', 'domestic-news', 'limitup'].map(id => {
      const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from(id)]);
      const file = path.join(dir, id + '.png'); fs.writeFileSync(file, bytes);
      return { id, path: file, sha256: createHash('sha256').update(bytes).digest('hex'),
        reportDate: '2026-10-23', reportAt: `2026-10-23T${id === 'domestic-news' ? '07:32' : '16:35'}:00+08:00`,
        downloadedAt: '2026-10-25T17:35:00+08:00', edition: id === 'domestic-news' ? 'morning' : null,
        nativeDownload: true, complete: true, visuallyVerified: true,
        cardText: `${id} actual source report ` + 'market breadth and dated original source information '.repeat(4),
        sourceUrl: `https://akaiagents.com/share-images/${id}/original.png` };
    });
    await fn({ asOf: '2026-10-25T18:00:00+08:00', publicationDate: '2026-10-25', tradingDay: false,
      caption: '历史对照，三份原报告均为2026-10-23。', channel: 'weibo', previousUses: [], reports }, dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('native report type/date/edition identity does not depend on filename or PNG bytes', () => {
  assert.equal(reportIdentity({ id: 'battle', reportDate: '2026-10-23' }), 'ak:battle:2026-10-23:postclose');
  assert.notEqual(reportIdentity({ id: 'domestic-news', reportDate: '2026-10-23', edition: 'morning' }),
    reportIdentity({ id: 'domestic-news', reportDate: '2026-10-23', edition: 'evening' }));
  assert.equal(reportIdentity({ id: 'battle', reportDate: '2026-02-30' }), null);
  assert.equal(reportIdentity({ id: 'domestic-news', reportDate: '2026-10-23' }), null);
});
test('different PNG hash cannot hide a previously published or unknown report edition', () => fixture(input => {
  for (const outcome of ['published', 'unknown', 'reserved']) {
    input.previousUses = [{ channel: 'weibo', sha256: '0'.repeat(64), outcome,
      reportMetadata: { id: 'battle', reportDate: '2026-10-23', edition: null } }];
    assert.ok(checkAKPackage(input).errors.some(e => e.code === 'REPORT_EDITION_ALREADY_RESERVED_OR_USED_ON_CHANNEL'));
  }
}));
test('cross-channel syndication is permitted but a repeated normalized source text is caught', () => fixture(input => {
  const base = input.reports[0];
  input.previousUses = [{ channel: 'xueqiu', reportMetadata: base, reportContentSha256: reportContentHash(base) }];
  assert.equal(checkAKPackage(input).status, 'ready_for_authorized_native_publish');
  input.previousUses[0].channel = 'weibo';
  input.previousUses[0].reportMetadata = { ...base, reportDate: '2026-10-22' };
  input.reports[0].cardText = base.cardText.replace(/ /g, '\n  ');
  assert.ok(checkAKPackage(input).errors.some(e => e.code === 'REPORT_CONTENT_ALREADY_RESERVED_OR_USED_ON_CHANNEL'));
}));
test('no source text means an unknown content hash, never an invented fingerprint', () => {
  assert.equal(reportContentHash({ cardText: '' }), null);
  assert.equal(reportContentHash({ cardText: 'too short' }), null);
});

function weekend(input) {
  input.nonTradingDayReuse = { mode: 'latest_trading_day', latestTradingDate: '2026-10-23' };
  input.caption = '2026-10-25非交易日，沿用最近交易日2026-10-23原报告，日期以各图标注为准。';
  input.previousUses = input.reports.map(report => ({ channel: input.channel, outcome: 'published',
    publishedAt: '2026-10-23T18:00:00+08:00', reportMetadata: report,
    sha256: report.sha256, reportContentSha256: reportContentHash(report) }));
  return input;
}
test('non-trading daily update permits the same last-trading-day images from prior publication days', () => fixture(input => {
  weekend(input);
  assert.equal(checkAKPackage(input).errors.length, 0);
  input.previousUses.forEach(use => { use.publishedAt = '2026-10-24T18:00:00+08:00'; });
  assert.equal(checkAKPackage(input).errors.length, 0);
}));
test('weekend reuse still blocks today, unknown outcomes and unverifiable old publication dates', () => fixture(input => {
  for (const patch of [{ publishedAt: '2026-10-25T17:40:00+08:00' },
    { outcome: 'unknown' }, { outcome: 'reserved' }, { publishedAt: null }]) {
    weekend(input); Object.assign(input.previousUses[0], patch);
    assert.equal(checkAKPackage(input).status, 'blocked');
  }
}));
test('weekend exception requires non-trading context, an actual latest report and visible date disclosure', () => fixture(input => {
  weekend(input); input.tradingDay = true;
  assert.ok(checkAKPackage(input).errors.some(e => e.code === 'NON_TRADING_DAY_REUSE_CONTEXT_INVALID'));
  input.tradingDay = false; input.caption = '2026-10-23历史报告';
  assert.equal(checkAKPackage(input).status, 'blocked');
  weekend(input); input.nonTradingDayReuse.latestTradingDate = '2026-10-22';
  input.caption += ' 2026-10-22';
  assert.ok(checkAKPackage(input).errors.some(e => e.code === 'NON_TRADING_REUSE_NOT_LATEST_REPORT'));
}));
test('today existing AK report prevents a second daily post even when the new images are different', () => fixture(input => {
  weekend(input); input.previousUses = [{ channel: input.channel, outcome: 'reserved',
    publicationDate: '2026-10-25', reportMetadata: { id: 'battle', reportDate: '2026-10-22' } }];
  assert.ok(checkAKPackage(input).errors.some(e => e.code === 'AK_ALREADY_RESERVED_OR_USED_ON_CHANNEL_TODAY'));
}));
test('weekend reservation keeps the publication day separate from the report day and stops a second submit', () => fixture(async (input, dir) => {
  weekend(input); const file = path.join(dir, 'registry-weekend.json');
  const prior = process.env.PROMO_STATE_DIR; process.env.PROMO_STATE_DIR = path.join(dir, 'weekend-state');
  fs.writeFileSync(file, JSON.stringify(input.previousUses));
  try {
    const result = await reserveAKPackage(input, file); assert.equal(result.status, 'reserved_for_single_authorized_native_submit');
    const rows = JSON.parse(fs.readFileSync(file)); assert.equal(rows.at(-1).publicationDate, '2026-10-25');
    assert.equal(rows.at(-1).reportMetadata.reportDate, '2026-10-23');
    assert.equal((await reserveAKPackage(input, file)).status, 'blocked');
    assert.equal(JSON.parse(fs.readFileSync(file)).length, 6);
  } finally { if (prior === undefined) delete process.env.PROMO_STATE_DIR; else process.env.PROMO_STATE_DIR = prior; }
}));
test('reservation persists logical identities and refuses an unchanged second attempt', () => fixture(async (input, dir) => {
  const file = path.join(dir, 'registry.json'), previousState = process.env.PROMO_STATE_DIR;
  process.env.PROMO_STATE_DIR = path.join(dir, 'state');
  fs.writeFileSync(file, '[]');
  try {
    const result = await reserveAKPackage(input, file);
    assert.equal(result.status, 'reserved_for_single_authorized_native_submit');
    const stored = fs.readFileSync(file, 'utf8');
    assert.equal(JSON.parse(stored).length, 3);
    assert.equal(JSON.parse(stored)[0].reportIdentity, 'ak:battle:2026-10-23:postclose');
    assert.equal(JSON.parse(stored)[0].outcome, 'reserved');
    const second = await reserveAKPackage(input, file);
    assert.equal(second.status, 'blocked');
    assert.equal(fs.readFileSync(file, 'utf8'), stored);
  } finally {
    if (previousState === undefined) delete process.env.PROMO_STATE_DIR;
    else process.env.PROMO_STATE_DIR = previousState;
  }
}));
test('empty caller history cannot override actual registry report usage', () => fixture(async (input, dir) => {
  const file = path.join(dir, 'registry.json'), previousState = process.env.PROMO_STATE_DIR;
  process.env.PROMO_STATE_DIR = path.join(dir, 'state');
  const stored = JSON.stringify([{ channel: 'weibo', sha256: '0'.repeat(64), outcome: 'unknown',
    reportMetadata: { id: 'battle', reportDate: '2026-10-23', edition: null } }]);
  fs.writeFileSync(file, stored);
  try {
    const result = await reserveAKPackage(input, file);
    assert.equal(result.status, 'blocked');
    assert.ok(result.errors.some(e => e.code === 'REPORT_EDITION_ALREADY_RESERVED_OR_USED_ON_CHANNEL'));
    assert.equal(fs.readFileSync(file, 'utf8'), stored);
  } finally {
    if (previousState === undefined) delete process.env.PROMO_STATE_DIR;
    else process.env.PROMO_STATE_DIR = previousState;
  }
}));

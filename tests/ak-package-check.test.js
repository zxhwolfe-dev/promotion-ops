'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { checkAKPackage } = require('../lib/ak-package-check');
function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promotion-ak-'));
  try {
    const reports = ['battle', 'domestic-news', 'limitup'].map((id, i) => {
      const bytes = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.from(id)]);
      const file = path.join(dir, `${id}.png`); fs.writeFileSync(file, bytes);
      return { id, path: file, reportDate: '2026-10-22', reportAt: `2026-10-22T${i === 1 ? '07:34' : '16:35'}:00+08:00`,
        downloadedAt: '2026-10-22T17:35:00+08:00', edition: i === 1 ? 'morning' : null,
        complete: true, visuallyVerified: true, nativeDownload: true,
        sourceUrl: `https://akaiagents.com/share-images/${id}/original.png`, sha256: createHash('sha256').update(bytes).digest('hex') };
    });
    fn({ asOf: '2026-10-22T18:00:00+08:00', publicationDate: '2026-10-22', tradingDay: true,
      channel: 'xueqiu', caption: '10月22日盘后复盘，新闻采用早报。', reports, previousUses: [] });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const codes = input => checkAKPackage(input).errors.map(item => item.code);
test('complete native three-card package passes without claiming publication', () => fixture(input => {
  const result = checkAKPackage(input); assert.equal(result.status, 'ready_for_authorized_native_publish');
  assert.equal(result.automaticPublish, false); assert.equal(result.checks.length, 3);
}));
test('17:30, actual download time and same trading date gates cannot use download date as report date', () => fixture(input => {
  assert.ok(codes({ ...input, asOf: '2026-10-22T17:00:00+08:00' }).includes('BEFORE_1730'));
  input.reports[0].reportDate = '2026-10-21'; input.reports[0].reportAt = '2026-10-21T16:30:00+08:00';
  input.reports[1].downloadedAt = '2026-10-22T16:00:00+08:00';
  assert.ok(codes(input).includes('STALE_TRADING_DAY_REPORT'));
  assert.ok(codes(input).includes('DOWNLOAD_NOT_AFTER_READY_TIME'));
}));
test('weekend explicit historic date comparison stays permitted, undeclared old card is blocked', () => fixture(input => {
  input.tradingDay = false; input.reports[0].reportDate = '2026-10-21'; input.reports[0].reportAt = '2026-10-21T16:30:00+08:00';
  assert.ok(codes(input).includes('HISTORICAL_DATE_NOT_DISCLOSED_IN_CAPTION'));
  input.caption += ' 作战卡使用2026-10-21历史数据作对照。';
  assert.equal(checkAKPackage(input).status, 'ready_for_authorized_native_publish');
}));
test('evening news needs actual evening generation and current clock after19:30', () => fixture(input => {
  input.reports[1].edition = 'evening';
  assert.ok(codes(input).includes('NEWS_EDITION_TIME_MISMATCH'));
  input.reports[1].reportAt = '2026-10-22T19:34:00+08:00';
  input.asOf = '2026-10-22T20:00:00+08:00'; input.reports[1].downloadedAt = '2026-10-22T19:40:00+08:00';
  assert.equal(checkAKPackage(input).status, 'ready_for_authorized_native_publish');
}));
test('caption product links blocked while source metadata original links are preserved', () => fixture(input => {
  input.caption += ' 产品：https://akaiagents.com/?utm_source=xueqiu';
  assert.ok(codes(input).includes('CAPTION_PRODUCT_LINK'));
  input.caption = '记录数据，不添加产品链接。';
  assert.equal(codes(input).length, 0);
}));
test('same-channel unknown reservation blocks duplicate; deliberate other-channel syndication allowed', () => fixture(input => {
  input.previousUses = [{ sha256: input.reports[0].sha256, channel: 'weibo', outcome: 'published' }];
  assert.equal(codes(input).length, 0);
  input.previousUses.push({ sha256: input.reports[0].sha256, channel: 'xueqiu', outcome: 'unknown' });
  assert.ok(codes(input).includes('ASSET_ALREADY_RESERVED_OR_USED_ON_CHANNEL'));
}));
test('wrong source, mutated bytes, repeated card, absent quality evidence fail preflight', () => fixture(input => {
  input.reports[0].sourceUrl = 'https://example.test/share-images/1.png';
  input.reports[0].sha256 = '0'.repeat(64); input.reports[0].complete = false;
  input.reports[2].path = input.reports[1].path;
  assert.ok(codes(input).includes('UNVERIFIED_NATIVE_SOURCE_URL'));
  assert.ok(codes(input).includes('HASH_MISMATCH')); assert.ok(codes(input).includes('DUPLICATE_CARD'));
  assert.ok(codes(input).includes('NATIVE_CONTENT_NOT_VERIFIED'));
}));
test('missing registry/channel cannot silently bypass duplicate verification', () => fixture(input => {
  delete input.previousUses; delete input.channel;
  assert.ok(codes(input).includes('MEDIA_HISTORY_REQUIRED')); assert.ok(codes(input).includes('DESTINATION_CHANNEL_REQUIRED'));
}));
test('limitup date-only report never requires an invented update timestamp', () => fixture(input => {
  input.reports[2].reportAt = null; input.reports[2].reportTimePrecision = 'day';
  assert.equal(checkAKPackage(input).status, 'ready_for_authorized_native_publish');
  input.reports[0].reportAt = null; input.reports[0].reportTimePrecision = 'day';
  assert.ok(codes(input).includes('REPORT_TIME_UNVERIFIED'));
}));

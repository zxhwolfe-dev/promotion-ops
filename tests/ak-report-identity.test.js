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

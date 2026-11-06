'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { validateNativeDailyRanks } = require('../lib/radar-native-rank');
const date = '2026-11-05';
const record = { id: 'nvidia-skillspector', text: '13\nNew entry\nNVIDIA/SkillSpector',
  url: 'https://useaistation.com/githubai/rankings/daily/?lang=en',
  capturedAt: '2026-11-05T10:00:00Z', nativeScreenshot: true, alteredDOM: false };
const image = { projectId: record.id, rank: 13 };
test('uses the captured English rank, rejecting a rank from another language', () => {
  assert.equal(validateNativeDailyRanks([image], [record], date)[0].rank, 13);
  assert.throws(() => validateNativeDailyRanks([{ ...image, rank: 15 }], [record], date), /Published rank differs/);
});
test('rejects the wrong view, language, date and altered DOM', () => {
  for (const patch of [{ url: record.url.replace('daily', 'weekly') }, { url: record.url.replace('lang=en', 'lang=zh') },
    { capturedAt: '2026-11-04T10:00:00Z' }, { alteredDOM: true }, { nativeScreenshot: false }]) {
    assert.throws(() => validateNativeDailyRanks([image], [{ ...record, ...patch }], date));
  }
});
test('requires unambiguous evidence and an explicit numeric native rank', () => {
  assert.throws(() => validateNativeDailyRanks([image], [record, record], date), /ambiguous/);
  assert.throws(() => validateNativeDailyRanks([image], [{ ...record, text: 'New entry\n13' }], date), /Published rank differs/);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decodedAttachmentMatches } = require('../lib/decoded-attachment');
const asset = { width: 1086, height: 1448 };
test('accepts a decoded 480x640 portrait display variant', () => {
  assert.equal(decodedAttachmentMatches({ width: 480, height: 640, complete: true }, asset), true);
});
test('rejects unloaded images and small placeholders', () => {
  assert.equal(decodedAttachmentMatches({ width: 480, height: 640, complete: false }, asset), false);
  assert.equal(decodedAttachmentMatches({ width: 300, height: 160, complete: true }, asset), false);
});
test('rejects another aspect ratio and malformed dimensions', () => {
  assert.equal(decodedAttachmentMatches({ width: 640, height: 480, complete: true }, asset), false);
  assert.equal(decodedAttachmentMatches({ width: NaN, height: 640, complete: true }, asset), false);
});

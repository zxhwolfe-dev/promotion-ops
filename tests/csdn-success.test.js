'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { csdnSuccessId } = require('../lib/csdn-success');
test('CSDN accepts current and legacy success routes but refuses conflicting or foreign IDs', () => {
  assert.equal(csdnSuccessId('https://mp.csdn.net/mp_blog/creation/success/166901860'), '166901860');
  assert.equal(csdnSuccessId('https://mp.csdn.net/mp_blog/creation/success?articleId=166901860'), '166901860');
  assert.equal(csdnSuccessId('https://mp.csdn.net/mp_blog/creation/success/166901860?articleId=123'), null);
  assert.equal(csdnSuccessId('https://example.com/mp_blog/creation/success/166901860'), null);
  assert.equal(csdnSuccessId('https://mp.csdn.net/mp_blog/creation/success'), null);
});

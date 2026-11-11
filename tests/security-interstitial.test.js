'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isSecurityInterstitial } = require('../lib/challenge-frames');
test('Chinese and English native interstitials stop without requiring an iframe', () => {
  for (const heading of ['正在进行安全验证', 'Verifying you are human', 'Verify you are human']) {
    assert.equal(isSecurityInterstitial({ text: `www.producthunt.com\n${heading}\nRay ID: test\nCloudflare` }), true);
  }
  assert.equal(isSecurityInterstitial({ title: 'Just a moment...', text: 'Cloudflare security' }), true);
  assert.equal(isSecurityInterstitial({ text: '', pathname: '/cdn-cgi/challenge-platform/test' }), true);
});
test('discussion, long articles, and uncorroborated phrases are not interstitials', () => {
  assert.equal(isSecurityInterstitial({ text: 'Cloudflare曾显示正在进行安全验证，本篇讨论原因。' }), false);
  assert.equal(isSecurityInterstitial({ text: '正在进行安全验证' }), false);
  assert.equal(isSecurityInterstitial({ text: '正在进行安全验证\nCloudflare\n' + 'x'.repeat(4000) }), false);
  assert.equal(isSecurityInterstitial({ text: 'Product Hunt\nAI Workstation', title: 'Product Hunt' }), false);
});

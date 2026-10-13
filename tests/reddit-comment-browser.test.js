'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { redditComments, findRedditComment } = require('../lib/comments');
test('Reddit profile binds comment identity to its own entry, not parent or nested reply', { skip: !process.env.PROMO_TEST_BROWSER }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.PROMO_TEST_BROWSER, headless: true, args: ['--no-sandbox', '--disable-background-networking'] });
  const page = await browser.newPage();
  try {
    await page.setContent(`<div class="thing comment" data-fullname="t1_ours">
      <p class="parent">post by <a class="author">AutoModerator</a></p>
      <div class="entry"><p class="tagline"><a class="author">zxhwolfe</a></p><div class="usertext-body">Our useful note.</div><a class="bylink" href="https://old.reddit.com/r/software/comments/thread/title/ours/">permalink</a></div>
      <div class="child"><div class="thing comment" data-fullname="t1_reply"><div class="entry"><p class="tagline"><a class="author">other_person</a></p><div class="usertext-body">Reply.</div></div></div></div></div>
      <div class="thing comment" data-fullname="t1_missing"><p class="parent"><a class="author">wrong_person</a></p><div class="entry"><div class="usertext-body">Missing comment author.</div></div></div>`);
    const rows = await redditComments(page);
    assert.deepEqual(rows.map(x => x.author), ['zxhwolfe', 'other_person', '']);
    assert.equal(rows[0].body, 'Our useful note.');
    assert.equal(findRedditComment(rows, { previousIds: new Set(), author: 'zxhwolfe', text: 'Our useful note.', threadId: 'thread' }).id, 't1_ours');
    assert.equal(findRedditComment(rows, { previousIds: new Set(), author: 'AutoModerator', text: 'Our useful note.', threadId: 'thread' }), undefined);
  } finally { await browser.close(); }
});

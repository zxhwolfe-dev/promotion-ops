'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { redditBodyMatches } = require('../lib/reddit-body');
const { findRedditComment } = require('../lib/comments');
const url = 'https://useaistation.com/githubai/?utm_source=reddit&utm_content=evidence-check';
test('literal and rendered lists retain exact bare URLs and their underscores', () => {
  const source = `A specific finding.\n- Check the source.\n\n${url}`;
  assert.equal(redditBodyMatches(`A specific finding. - Check the source.\n${url}`, source), true);
  assert.equal(redditBodyMatches(`A specific finding. Check the source. ${url}`, source), true);
  assert.equal(redditBodyMatches(`A specific finding. Check the source. ${url.replace('utm_source', 'utmsource')}`, source), false);
  assert.equal(redditBodyMatches(`A specific finding. Check the source. ${url.replace('reddit', 'x')}`, source), false);
});
test('body matching still binds full text, author, thread and native comment ID', () => {
  const row = { id:'t1_newid123',author:'zxhwolfe',body:`Useful **draft** ${url}`,url:'https://old.reddit.com/r/software/comments/thread123/title/newid123/' };
  const input = {previousIds:new Set(),author:'zxhwolfe',text:row.body,threadId:'thread123'};
  assert.equal(findRedditComment([row], input), row);
  for (const patch of [{author:'other'},{text:'different'},{threadId:'other'},{previousIds:new Set([row.id])}]) {
    assert.equal(findRedditComment([row], {...input,...patch}), undefined);
  }
});

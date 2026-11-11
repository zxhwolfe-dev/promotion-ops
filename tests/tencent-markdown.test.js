'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertTencentMarkdown } = require('../lib/tencent-markdown');

test('rejects the native-incompatible text fence with an actionable source line', () => {
  assert.throws(() => assertTencentMarkdown('Introduction\n\n```text\nA brief\n```'), error =>
    error.code === 'TENCENT_CODE_LANGUAGE_UNSUPPORTED' && error.message.includes('第3行') && error.message.includes('txt'));
});

test('checks CRLF, tilde fences and an unterminated incompatible block', () => {
  for (const body of ['~~~text\r\nA brief\r\n~~~', '  ```TEXT\nA brief', '```text extra\nA brief\n```']) {
    assert.throws(() => assertTencentMarkdown(body), { code: 'TENCENT_CODE_LANGUAGE_UNSUPPORTED' });
  }
});

test('allows authored txt and other languages without rewriting source', () => {
  for (const body of ['```txt\nA brief\n```', '```python\nprint("hello")\n```', 'Plain text and `text` inline.']) {
    assert.equal(assertTencentMarkdown(body), undefined);
  }
});

test('does not treat a literal fence example inside a longer code fence as a new block', () => {
  assert.doesNotThrow(() => assertTencentMarkdown('````markdown\n```text\nexample\n```\n````'));
});

test('only the matching fence character closes a block', () => {
  assert.doesNotThrow(() => assertTencentMarkdown('~~~txt\n```text\n~~~'));
  assert.throws(() => assertTencentMarkdown('```txt\n~~~\n```\n```text\nactual block\n```'),
    { code: 'TENCENT_CODE_LANGUAGE_UNSUPPORTED' });
});

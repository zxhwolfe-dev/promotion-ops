'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { OpsError } = require('../lib/ops');
const { articleIdFromURL, captureResponseArticleId, ARTICLE_ID_RESPONSES } = require('../lib/articles');

before(async () => { process.env.PROMO_STATE_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'promo-s5-')); });

test('articleIdFromURL extracts the trailing numeric id per platform', () => {
  assert.equal(articleIdFromURL('tencent', 'https://cloud.tencent.com/developer/article/2745764'), '2745764');
  assert.equal(articleIdFromURL('tencent', 'https://cloud.tencent.com/developer/article/2745764/'), '2745764');
  assert.equal(articleIdFromURL('aliyun', 'https://developer.aliyun.com/article/1764254'), '1764254');
  assert.equal(articleIdFromURL('csdn', 'https://blog.csdn.net/aiworkstation/article/details/165755044'), '165755044');
  assert.equal(articleIdFromURL('oschina', 'https://my.oschina.net/u/9763974/blog/19761935'), '19761935');
  assert.equal(articleIdFromURL('tencent', 'https://cloud.tencent.com/developer/article/'), null);
});

test('unverified platforms return absent capture instead of guessing fields', () => {
  const spec = ARTICLE_ID_RESPONSES.aliyun;
  assert.equal(spec, undefined);
  // captureResponseArticleId 对未核实平台必须显式 absent，不构造监听器
  const get = captureResponseArticleId({ on() {}, off() {} }, 'aliyun');
  assert.equal(get(), null);
});

test('tencent response parser accepts only verified business shape', () => {
  const parse = ARTICLE_ID_RESPONSES.tencent.parse;
  assert.equal(parse('{"code":0,"msg":"ok","data":{"articleId":2745764}}'), '2745764');
  assert.equal(parse('{"code":-1,"msg":"rejected","data":{"articleId":1}}'), null); // 业务失败不是成功
  assert.equal(parse('{"code":0,"data":{"articleId":"2745764"}}'), null); // 非数字字符串不算已核实形态
  assert.equal(parse('{"code":0}'), null);
  assert.equal(parse('not json'), null);
  assert.equal(parse('{"code":0,"data":{"otherId":5}}'), null); // 不臆造字段名
});

test('capture getter stops listening after read', async () => {
  const events = [];
  const page = { on: (_e, fn) => events.push(['on', fn]), off: (_e, fn) => events.push(['off', fn]) };
  const get = captureResponseArticleId(page, 'tencent');
  get();
  assert.equal(events.length, 2);
  assert.equal(events[0][0], 'on');
  assert.equal(events[1][0], 'off');
  assert.equal(events[0][1], events[1][1]);
});

test('queryFromHash matches real Gmail normalization (spaces become +)', async () => {
  process.env.PROMO_STATE_DIR = process.env.PROMO_STATE_DIR || (await fs.mkdtemp(path.join(os.tmpdir(), 'promo-s5b-')));
  const { queryFromHash } = require('../lib/gmail');
  assert.equal(queryFromHash('#search/in%3Aanywhere+newer_than%3A7d'), 'in:anywhere newer_than:7d');
  assert.equal(queryFromHash('#search/hello+world'), 'hello world');
  assert.equal(queryFromHash('#search/plain'), 'plain');
  assert.equal(queryFromHash('#inbox'), '');
});

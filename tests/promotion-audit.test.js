'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { campaignURL, copyIssues } = require('../lib/campaign');
const { historicalTitles, inspectMedia } = require('../lib/campaign-media');
const { sweepQuery } = require('../scripts/gmail/sweep');
const { queryFromHash } = require('../lib/gmail');

test('campaign URLs preserve intentional task query and fragment without crossing locale', () => {
  const url = new URL(campaignURL({ language: 'en', channel: 'reddit', path: '/aitu-studio/?entry=gallery#start', campaign: 'aitu-product', content: 'answer-01' }));
  assert.equal(url.hostname, 'useaistation.com');
  assert.equal(url.searchParams.get('entry'), 'gallery');
  assert.equal(url.searchParams.get('utm_source'), 'reddit');
  assert.equal(url.hash, '#start');
  for (const path of ['//evil.test/', '/\\evil.test/', '/v2/test']) {
    assert.throws(() => campaignURL({ language: 'en', channel: 'reddit', path, campaign: 'a', content: 'b' }));
  }
});
test('copy preflight catches Chinese TikTok title, wrong domain and missing attribution', () => {
  const draft = { channel: 'tiktok', language: 'en', title: '中文标题', text: 'Try https://aiworkstation.cn/aitu-studio/' };
  const codes = copyIssues(draft).map(row => row.code);
  for (const code of ['TIKTOK_NON_ENGLISH_SCRIPT', 'LANGUAGE_DOMAIN', 'UTM_SOURCE', 'UTM_DETAIL']) assert.ok(codes.includes(code));
  assert.deepEqual(copyIssues({ channel: 'reddit', language: 'en', text: 'Try masking only the background. Preserve the original and compare the edges.' }), []);
  assert.ok(copyIssues({ channel: 'xiaohongshu', language: 'zh', text: 'test' }).length);
});
test('media preflight detects historical titles and renamed bytes, even across channels', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'promo-media-'));
  try {
    await fs.writeFile(path.join(dir, 'a.png'), 'fixture media');
    await fs.writeFile(path.join(dir, 'b.png'), 'fixture media');
    const titles = historicalTitles('# 台账\n## 图片使用追踪（防重复）\n| 已用图 | 使用日期/渠道 |\n|---|---|\n| 老图 | 10/1 TikTok |\n## 平台\n');
    assert.deepEqual(titles, ['老图']);
    const result = await inspectMedia([{ id: 'one', title: '老图', path: 'a.png' }, { id: 'two', title: 'new name', path: 'b.png' }], { channel: 'tiktok', titles, baseDir: dir });
    assert.equal(result.issues.filter(row => row.code === 'REUSED_ASSET').length, 2);
    const again = await inspectMedia([{ id: 'third', title: 'renamed', path: 'b.png' }], { channel: 'x', records: result.checks, baseDir: dir });
    assert.equal(again.issues[0].code, 'REUSED_ASSET');
    await fs.writeFile(path.join(dir, '中文.mp4'), 'different');
    const chinese = await inspectMedia([{ id: 'four', title: 'new', path: '中文.mp4' }], { channel: 'tiktok', baseDir: dir });
    assert.equal(chinese.issues[0].code, 'TIKTOK_FILENAME');
    assert.throws(() => historicalTitles('# No table'), { code: 'ASSET_HISTORY_MISSING' });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('full sweeps include spam/trash and refuse keyword-only or unread-only searches', () => {
  assert.equal(sweepQuery(), 'in:anywhere');
  assert.equal(sweepQuery('in:anywhere after:2026/10/10 before:2026/10/14'), 'in:anywhere after:2026/10/10 before:2026/10/14');
  for (const query of ['in:inbox', 'is:unread', 'in:anywhere promotion', 'in:anywhere -in:spam']) assert.throws(() => sweepQuery(query));
  assert.equal(queryFromHash('#search/in%3Aanywhere/p2'), 'in:anywhere');
  assert.equal(queryFromHash('#search/subject%3A%2Fp2'), 'subject:/p2');
});
test('all existing publish entrypoints reject missing UTM before CDP or account lookup', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'promo-copy-'));
  const file = path.join(dir, 'body.md');
  try {
    await fs.writeFile(file, 'A detailed paragraph with https://aiworkstation.cn/aitu-studio/intro/');
    for (const script of ['aliyun', 'tencent-cloud', 'csdn', 'oschina']) {
      await assert.rejects(require(`../scripts/${script}/publish-article`)(['Test title', file]), { code: 'PROMOTION_PREFLIGHT' });
    }
    await assert.rejects(require('../scripts/reddit/post-comment')(['https://old.reddit.com/r/test/comments/abc/test/', file]), { code: 'PROMOTION_PREFLIGHT' });
    await assert.rejects(require('../scripts/oschina/reply-comment')(['https://my.oschina.net/u/123/blog/456', file]), { code: 'PROMOTION_PREFLIGHT' });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('public campaign links reject private query parameters and recognize equivalent site hosts', () => {
  for (const key of ['token', 'email', 'session_id', 'invite_code', 'api_key']) {
    assert.throws(() => campaignURL({ language: 'en', channel: 'reddit', path: `/aitu-studio/?${key}=private`, campaign: 'a', content: 'b' }), { code: 'PRIVATE_LINK' });
    const link = `https://useaistation.com/aitu-studio/?${key}=private&utm_source=reddit&utm_medium=answer&utm_campaign=a&utm_content=b`;
    assert.ok(copyIssues({ channel: 'reddit', language: 'en', text: link }).some(issue => issue.code === 'LINK_CREDENTIALS'));
  }
  for (const link of ['//aiworkstation.cn/aitu-studio/', 'https://aiworkstation.cn./aitu-studio/']) {
    const issues = copyIssues({ channel: 'reddit', language: 'en', text: link });
    assert.ok(issues.some(issue => issue.code === 'LANGUAGE_DOMAIN'));
    assert.ok(issues.some(issue => issue.code === 'UTM_SOURCE'));
  }
});
test('media preflight requires cross-run registry and local recording retains uncertain use', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'promo-registry-'));
  const previousState = process.env.PROMO_STATE_DIR;
  process.env.PROMO_STATE_DIR = path.join(dir, 'state');
  try {
    await fs.writeFile(path.join(dir, 'demo.mp4'), 'offline media fixture');
    const draft = path.join(dir, 'draft.json'), registry = path.join(dir, 'registry.json'), history = path.join(dir, 'history.md');
    await fs.writeFile(draft, JSON.stringify({ channel: 'tiktok', language: 'en', title: 'Edit demo', text: 'A real editing walkthrough.', assets: [{ id: 'test', title: 'new', path: './demo.mp4' }] }));
    await fs.writeFile(history, '## 图片使用追踪\n| 已用图 | 使用日期/渠道 |\n|---|---|\n| Old | 10/1 |');
    await fs.writeFile(registry, '[]');
    const preflight = require('../scripts/campaign/preflight');
    await assert.rejects(preflight([draft, history]), { code: 'ASSET_REGISTRY_REQUIRED' });
    assert.equal((await preflight([draft, history, registry])).status, 'ok');
    const record = require('../scripts/campaign/record-media');
    const result = await record([draft, registry, 'unknown', 'https://www.tiktok.com/@fixture/video/123']);
    assert.equal(result.recorded, 1); assert.equal(result.publishPerformed, false);
    const repeated = await preflight([draft, history, registry]);
    assert.equal(repeated.status, 'partial'); assert.ok(repeated.issues.some(row => row.code === 'REUSED_ASSET'));
    await fs.writeFile(registry, '[{"sha256":"damaged"}]');
    await assert.rejects(preflight([draft, history, registry]), { code: 'INVALID_ASSET_REGISTRY' });
    await fs.writeFile(draft, JSON.stringify({ channel: 'tiktok', language: 'en', text: 'Outline only.', assets: [] }));
    assert.equal((await preflight([draft])).status, 'partial');
  } finally {
    if (previousState === undefined) delete process.env.PROMO_STATE_DIR; else process.env.PROMO_STATE_DIR = previousState;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('public links reject private fragment parameters and audit bare site URLs', () => {
  for (const fragment of ['#access_token=abc', '#/callback?email=private%40example.test']) {
    assert.throws(() => campaignURL({ language: 'en', channel: 'reddit', path: '/aitu-studio/' + fragment, campaign: 'a', content: 'b' }), { code: 'PRIVATE_LINK' });
    assert.ok(copyIssues({ language: 'en', channel: 'reddit', text: 'https://useaistation.com/aitu-studio/' + fragment }).some(issue => issue.code === 'LINK_CREDENTIALS'));
  }
  for (const text of ['aiworkstation.cn/aitu-studio/', 'AIWORKSTATION.CN./aitu-studio/']) {
    const codes = copyIssues({ language: 'en', channel: 'reddit', text }).map(issue => issue.code);
    assert.ok(codes.includes('LANGUAGE_DOMAIN')); assert.ok(codes.includes('UTM_SOURCE'));
  }
  assert.deepEqual(copyIssues({ language: 'en', channel: 'reddit', text: 'Contact support@useaistation.com about your draft.' }), []);
});
test('site subdomains require the supported canonical origin instead of bypassing preflight', () => {
  for (const text of ['https://www.useaistation.com/aitu-studio/', 'www.useaistation.com/aitu-studio/', 'preview.aiworkstation.cn/']) {
    const codes = copyIssues({ language: 'en', channel: 'reddit', text }).map(issue => issue.code);
    assert.ok(codes.includes('LANGUAGE_DOMAIN')); assert.ok(codes.includes('UTM_SOURCE'));
  }
  assert.deepEqual(copyIssues({ language: 'en', channel: 'reddit', text: 'Reference: https://useaistation.com.example.test/article/' }), []);
});

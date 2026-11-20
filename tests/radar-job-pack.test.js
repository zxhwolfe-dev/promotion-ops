'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ORIGINS, copyIssues } = require('../lib/campaign');
const { buildJobPack } = require('../lib/radar-job-pack');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'radar-landing-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const historyFile = path.join(root, 'history.json');
  await fs.writeFile(historyFile, '[]');
  const day = '2026-11-20';
  const data = {
    episode: 23, publicationDate: day, ranking: 'daily',
    titles: { zh: '开源项目资料', en: 'Open source project briefs' },
    projects: Array.from({ length: 6 }, (_, index) => ({
      id: 'owner-repo-' + index,
      zh: { source: { url: ORIGINS.zh + '/githubai/rankings/daily/?lang=zh' } },
      en: { source: { url: ORIGINS.en + '/githubai/rankings/daily/?lang=en' } },
    })),
  };
  const qa = { versions: ['zh-CN-XiaoxiaoNeural', 'en-US-AriaNeural'].map(voice => ({
    voice, videoPath: path.join(root, voice + '.mp4'), sha256: 'a'.repeat(64), seconds: 65,
  })) };
  return { data, qa, packageRoot: root, accounts: {}, day, historyFile, queueFile: path.join(root, 'queue.json') };
}

test('new Radar captions use the original ranking and complete channel attribution', async t => {
  const input = await fixture(t);
  input.data.promotionLanding = { ranking: 'daily' };
  const jobs = await buildJobPack(input);
  assert.equal(jobs.length, 5);
  for (const { channel, landingUrl, title, caption } of jobs) {
    const language = ['douyin', 'bilibili'].includes(channel) ? 'zh' : 'en';
    const landing = new URL(landingUrl);
    assert.equal(landing.origin, ORIGINS[language]);
    assert.equal(landing.pathname, '/githubai/rankings/daily/');
    assert.equal(landing.searchParams.get('lang'), language);
    assert.equal(landing.searchParams.get('utm_source'), channel);
    assert.equal(landing.searchParams.get('utm_content'), 'ep23');
    assert.equal(landing.searchParams.get('utm_campaign'), 'radar_daily_20261120');
    assert.deepEqual(copyIssues({ channel, language, title, text: caption }), []);
    if (channel === 'youtube') {
      assert.equal(landing.searchParams.get('utm_medium'), 'profile');
      assert.match(caption, /Search AI Open Source Radar/);
      assert.doesNotMatch(caption, /https:\/\//);
    } else {
      assert.equal(landing.searchParams.get('utm_medium'), 'video');
      assert.ok(caption.includes(landingUrl));
    }
    if (channel === 'x') assert.ok(caption.replace(/https:\/\/\S+/g, 'x'.repeat(23)).length <= 280);
  }
});

test('mixed-source Radar packages can point to a featured project', async t => {
  const input = await fixture(t);
  input.data.projects[1].en.source.url = ORIGINS.en + '/githubai/rankings/rising/?lang=en';
  input.data.promotionLanding = { ranking: 'daily' };
  await assert.rejects(buildJobPack(input), /differs from the native sources/);
  input.data.promotionLanding = { projectId: 'owner-repo-2' };
  const jobs = await buildJobPack(input);
  assert.ok(jobs.every(job => new URL(job.landingUrl).pathname === '/githubai/projects/owner-repo-2'));
  input.data.promotionLanding = { projectId: 'owner-repo-outside-episode' };
  await assert.rejects(buildJobPack(input), /featured in this episode/);
});

test('legacy packages keep their original caption links for prepared-job verification', async t => {
  const input = await fixture(t);
  const jobs = await buildJobPack(input);
  const youtube = jobs.find(job => job.channel === 'youtube');
  assert.equal(youtube.landingUrl, undefined);
  assert.ok(youtube.caption.endsWith(
    'https://useaistation.com/githubai/?utm_source=youtube&utm_medium=video&utm_campaign=radar_daily_20261120',
  ));
});

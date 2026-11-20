'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { ORIGINS, campaignURL } = require('./campaign');
const { assertProjectCooldown } = require('./radar-project-cooldown');

function radarLanding(data, language) {
  const target = data.promotionLanding;
  if (target === undefined) return null;
  if (!target || typeof target !== 'object' || Array.isArray(target) ||
      Object.hasOwn(target, 'ranking') === Object.hasOwn(target, 'projectId')) {
    throw Error('Choose one Radar landing target: a source ranking or an episode project');
  }

  if (Object.hasOwn(target, 'projectId')) {
    const { projectId } = target;
    if (typeof projectId !== 'string' || !/^[a-z0-9_-]+$/i.test(projectId) ||
        !data.projects.some(project => project.id === projectId)) {
      throw Error('Radar landing project must be featured in this episode');
    }
    return {
      path: `/githubai/projects/${projectId}?lang=${language}`,
      label: language === 'zh' ? '查看本期项目详情' : 'See project details',
      youtube: `Search AI Open Source Radar for ${projectId} to see the project details.`,
    };
  }

  const { ranking } = target;
  if (typeof ranking !== 'string' || !/^[a-z0-9-]+$/.test(ranking)) {
    throw Error('Invalid Radar ranking landing');
  }
  const rankingPath = `/githubai/rankings/${ranking}/`;
  for (const project of data.projects) {
    const source = new URL(project[language]?.source?.url);
    const sourceLanguage = source.searchParams.get('lang');
    if (source.origin !== ORIGINS[language] || source.pathname !== rankingPath ||
        (sourceLanguage && sourceLanguage !== language)) {
      throw Error('Radar landing ranking differs from the native sources');
    }
  }
  return {
    path: `${rankingPath}?lang=${language}`,
    label: language === 'zh' ? '查看实时榜单' : 'Browse the live ranking',
    youtube: 'Search AI Open Source Radar, then open Rankings.',
  };
}

async function buildJobPack({ data, qa, packageRoot, accounts, day, queueFile, historyFile }) {
  await assertProjectCooldown({ data, historyFile });
  const destinations = { zh: radarLanding(data, 'zh'), en: radarLanding(data, 'en') };
  const campaign = 'radar_daily_' + day.replaceAll('-', '');
  const jobs = [];
  for (const [channel, language] of [['douyin', 'zh'], ['bilibili', 'zh'], ['tiktok', 'en'], ['youtube', 'en'], ['x', 'en']]) {
    const zh = language === 'zh';
    const quality = qa.versions.find(item => item.voice === (zh ? 'zh-CN-XiaoxiaoNeural' : 'en-US-AriaNeural'));
    if (!quality) throw Error('Missing language quality version');
    const landing = destinations[language];
    // Existing inputs reuse their original caption so old upload fingerprints stay valid.
    const url = landing ? campaignURL({
      language, path: landing.path, channel, campaign, content: 'ep' + data.episode,
      medium: channel === 'youtube' ? 'profile' : 'video',
    }) : `${ORIGINS[language]}/githubai/?utm_source=${channel}&utm_medium=video&utm_campaign=${campaign}`;
    const callToAction = landing ? (channel === 'youtube' ? landing.youtube : landing.label + '\n' + url)
      : (zh ? '完整项目卡与来源：' + url : url);
    const title = data.titles[language];
    const projectCount = landing ? String(data.projects.length) : 'Six';
    const caption = zh
      ? `${title}\n${day}雷达${data.rankingLabel || '日趋势榜'}精选，保留原始名次，不是榜单前六名。项目资料介绍，未逐项安装实测；使用前核对兼容环境、权限、许可和模型成本。声音素材需获授权。\n${callToAction}\nAI辅助整理；微软合成旁白。`
      : `${title}\n${projectCount} native Radar ${data.ranking || 'daily'} picks, ${day}; original ranks, not the top six. Source-based profiles, not hands-on tests. Check compatibility, permissions, licenses and model costs; obtain consent for voice material. I build Radar. Microsoft synthetic narration.\n${callToAction}`;
    const shortX = `${projectCount} Radar picks for different tasks, ${day}. Original project cards, not hands-on tests. Check setup, permissions and licenses. I build Radar. AI-assisted; synthetic voice.\n${callToAction}`;
    const account = accounts[channel] || null;
    const job = {
      version: 1, queueFile, channel, account,
      episodeId: 'ep' + data.episode + '-radar-daily', publicationDate: day, sourceDate: day,
      title, caption: channel === 'x' ? shortX : caption,
      ...(landing ? { landingUrl: url } : {}),
      videoPath: quality.videoPath, sha256: quality.sha256,
      qualityReport: path.join(packageRoot, language, 'quality-report.json'),
      tags: zh ? ['人工智能', '开源项目', 'AI工具'] : [],
      liveAdapterApproved: false, expectedDurationSeconds: quality.seconds,
      coverPath: path.join(packageRoot, language, 'cover-safe-4x3.png'),
      verticalCoverPath: path.join(packageRoot, language, 'cover-safe-3x4.png'),
    };
    if (account?.nativeListSelectors) job.nativeListSelectors = account.nativeListSelectors;
    jobs.push(job);
  }
  await fs.writeFile(path.join(packageRoot, 'publish-jobs.json'), JSON.stringify(jobs, null, 2) + '\n');
  return jobs;
}

module.exports = { buildJobPack };

'use strict';
const CORE_VIDEO = ['douyin', 'bilibili', 'tiktok', 'youtube'];
const DEFAULT_CONTRACT = {
  version: 1, effectiveFrom: '2026-11-11', timezone: 'Asia/Shanghai',
  provenance: 'User approved daily Radar video, Douyin inclusion and X video-or-images on 2026-11-11; six to eight native cards, free Xiaoxiao/Aria.',
  daily: [...CORE_VIDEO.map(channel => ({channel, kind:'workstation_short'})),
    ...['weibo','toutiao','taoguba'].map(channel => ({channel,kind:'ak_daily_three_native_cards',notBefore:'17:30:00'})),
    {channel:'x',kind:'radar_daily',alternatives:['radar_daily_three_images','radar_daily_video']}],
  paused: [{channel:'xueqiu',reason:'Existing security restriction; no new submissions until public access restored.'}],
  excluded: ['wechat-official','wechat-channels','xiaohongshu','capafy'],
  voices: {zh:'zh-CN-XiaoxiaoNeural',en:'en-US-AriaNeural'}, projects:{min:6,max:8}, cashBudgetCNY:0
};
const ALLOWED = new Set([...CORE_VIDEO,'weibo','toutiao','taoguba','x']);
const KINDS = new Set(['workstation_short','ak_daily_three_native_cards','radar_daily']);
function validateContract(value) {
  if (!value || value.version !== 1 || value.timezone !== 'Asia/Shanghai' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.effectiveFrom || '') ||
      !Array.isArray(value.daily) || !Array.isArray(value.paused) || !value.provenance) throw Error('Invalid active operating contract');
  if(new Date(value.effectiveFrom+'T00:00:00Z').toISOString().slice(0,10)!==value.effectiveFrom || value.cashBudgetCNY!==0 || value.voices?.zh!=='zh-CN-XiaoxiaoNeural' || value.voices?.en!=='en-US-AriaNeural' || !Number.isInteger(value.projects?.min) || !Number.isInteger(value.projects?.max) || value.projects.min<6 || value.projects.max>8 || value.projects.min>value.projects.max)throw Error('Unsupported date, budget, voice or project contract');
  const ids = new Set();
  for (const task of value.daily) {
    if (!ALLOWED.has(task.channel) || !KINDS.has(task.kind) || ids.has(task.channel) ||
        (task.notBefore && !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(task.notBefore))) throw Error('Invalid/duplicate daily contract task');
    ids.add(task.channel);
  }
  if (value.paused.some(x => ids.has(x.channel))) throw Error('Paused channel cannot be required daily');
  return value;
}
function activeContract(day, configured = DEFAULT_CONTRACT) {
  const value = validateContract(configured);
  return day >= value.effectiveFrom ? value : null;
}
module.exports = {DEFAULT_CONTRACT, activeContract, validateContract};

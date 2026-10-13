'use strict';
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { OpsError } = require('./ops');
const identity = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
function historicalTitles(markdown) {
  const section = markdown.split(/^## 图片使用追踪[^\n]*$/m)[1]?.split(/^## /m)[0];
  if (!section) throw new OpsError('ASSET_HISTORY_MISSING', '未找到图片使用追踪表，不能跳过历史查重');
  return section.split('\n').filter(line => /^\|/.test(line)).map(line => line.split('|')[1].trim())
    .filter(title => title && title !== '已用图' && !/^[-:]+$/.test(title));
}
async function sha256(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function inspectMedia(assets, { channel, titles = [], records = [], baseDir = process.cwd() } = {}) {
  if (!Array.isArray(assets) || assets.length > 32) throw new OpsError('INVALID_ASSETS', 'assets 须为最多32项的数组');
  if (!Array.isArray(records) || records.some(record => !record || typeof record !== 'object' || !/^[a-f0-9]{64}$/.test(record.sha256 || ''))) throw new OpsError('INVALID_ASSET_REGISTRY', '素材登记必须含有效 SHA256，损坏记录不可忽略');
  const usedTitles = new Set(titles.map(identity)), hashes = new Set(records.map(record => record.sha256));
  const ids = new Set(records.map(record => record.id).filter(Boolean));
  const checks = [], issues = [];
  for (const asset of assets) {
    if (!asset || typeof asset.id !== 'string' || !asset.id.trim() || typeof asset.title !== 'string' || !asset.title.trim() || typeof asset.path !== 'string' || !asset.path.trim()) {
      issues.push({ code: 'INVALID_ASSET', message: '每项素材须有稳定 id、原始 title 和本地 path' }); continue;
    }
    const filename = path.basename(asset.path);
    if (channel === 'tiktok' && !/^[A-Za-z0-9][A-Za-z0-9 ._-]*\.(?:mp4|mov|webm|png|jpe?g|webp)$/i.test(filename)) {
      issues.push({ code: 'TIKTOK_FILENAME', id: asset.id, message: 'TikTok 上传文件名只能使用英文字母、数字、空格及 ._-，并有媒体扩展名' });
    }
    try {
      const file = path.resolve(baseDir, asset.path);
      if (!(await fs.stat(file)).isFile()) throw new Error('not_file');
      const hash = await sha256(file);
      if (hashes.has(hash) || ids.has(asset.id) || usedTitles.has(identity(asset.title))) {
        issues.push({ code: 'REUSED_ASSET', id: asset.id, message: '素材标题、稳定编号或文件内容已用过；重新剪辑/跨渠道复用须单独记录用途' });
      }
      checks.push({ id: asset.id, title: asset.title, filename, sha256: hash });
      hashes.add(hash); ids.add(asset.id); usedTitles.add(identity(asset.title));
    } catch { issues.push({ code: 'ASSET_UNREADABLE', id: asset.id, message: '素材不是可读取的本地文件' }); }
  }
  return { checks, issues };
}
module.exports = { historicalTitles, inspectMedia, sha256 };

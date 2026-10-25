'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { copyIssues } = require('./campaign');

function readJSON(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw new Error('Expected bounded local JSON');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function strings(value) {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}
function loadImagePromptPost(file) {
  const draft = readJSON(file);
  if (!/^[a-z0-9-]{1,100}$/.test(draft.id || '') || draft.channel !== 'youtube' ||
      draft.kind !== 'aitu_image_and_prompt' || draft.language !== 'en') throw new Error('Unsupported image-prompt post identity');
  if (!draft.title || !draft.text?.startsWith(draft.title) || draft.text.length > 5000 || draft.qualityVerified !== true) {
    throw new Error('Title, text length or visual verification missing');
  }
  const issues = copyIssues(draft);
  if (issues.length) throw new Error('Copy/link preflight failed: ' + issues.map(x => x.code).join(','));
  if (!Array.isArray(draft.promptParts) || !draft.promptParts.length || draft.promptParts.some(p => typeof p !== 'string' || !p.trim())) {
    throw new Error('Actual prompt parts required');
  }
  const sources = Array.isArray(draft.promptSourceEvidence) ? draft.promptSourceEvidence : [draft.promptSourceEvidence];
  if (!sources.length || sources.length > 5) throw new Error('Bounded prompt source evidence required');
  const source = sources.flatMap(file => strings(readJSON(file)));
  if (!draft.promptParts.every(p => draft.text.includes(p) && source.some(s => s.includes(p)))) {
    throw new Error('Complete prompt must match both source evidence and public copy');
  }
  const origin = readJSON(draft.originEvidence);
  if (draft.origin === 'gallery_example_not_current_generation') {
    if (origin.source !== 'Aitu curated gallery example; not generated in this session') throw new Error('Gallery provenance differs');
  } else if (draft.origin === 'native_aitu_generation') {
    if (origin.operatorCreated !== true || origin.countAsCustomerConversion !== false) throw new Error('Native operator generation evidence missing');
  } else throw new Error('Explicit image origin required');
  if (!Array.isArray(draft.assets) || draft.assets.length < 1 || draft.assets.length > 5) throw new Error('Expected one to five images');
  for (const asset of draft.assets) {
    const stat = fs.statSync(asset.path);
    if (!stat.isFile() || stat.size > 30 * 1024 * 1024 || !/\.(png|jpe?g|webp)$/i.test(asset.path)) throw new Error('Image file invalid');
    const sha = createHash('sha256').update(fs.readFileSync(asset.path)).digest('hex');
    if (sha !== asset.sha256 || !asset.id || !asset.title || !(asset.width >= 800 && asset.height >= 600)) throw new Error('Image identity, hash or resolution invalid');
    const assetOrigin = asset.originEvidence ? readJSON(asset.originEvidence) : origin;
    if (assetOrigin.sha256 !== sha) throw new Error('Image differs from recorded source');
  }
  if (!path.isAbsolute(draft.evidenceDirectory || '')) throw new Error('Absolute evidence directory required');
  return draft;
}
module.exports = { loadImagePromptPost };

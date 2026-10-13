'use strict';
// Record an observed outcome locally after independently checking the platform.
// This command never publishes and does not turn an operator statement into remote proof.
const path = require('node:path');
const fs = require('node:fs/promises');
const { run, readText, OpsError, trustedURL } = require('../../lib/ops');
const { writeJSON, withLock } = require('../../lib/state');
const { inspectMedia } = require('../../lib/campaign-media');
async function main(args = process.argv.slice(2)) {
  const [draftPath, registryPath, outcome, evidenceUrl] = args;
  if (!registryPath || !['published', 'unknown'].includes(outcome)) throw new OpsError('USAGE', 'record-media.js <draft.json> <registry.json> <published|unknown> <platform evidence URL>');
  const draft = JSON.parse(await readText(draftPath));
  const hosts = { tiktok: ['www.tiktok.com', 'tiktok.com'], youtube: ['www.youtube.com', 'youtube.com', 'youtu.be'], x: ['x.com', 'twitter.com'], pinterest: ['www.pinterest.com', 'pinterest.com'] };
  const url = trustedURL(evidenceUrl, hosts[draft.channel] || []);
  if (url.search || url.hash || url.pathname === '/') throw new OpsError('INVALID_EVIDENCE_URL', '请提供无查询参数的具体平台结果链接');
  const file = path.resolve(registryPath);
  return withLock(`media-registry:${file}`, async () => {
    let records;
    try { records = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; records = []; }
    const checked = await inspectMedia(draft.assets, { channel: draft.channel, records, baseDir: path.dirname(path.resolve(draftPath)) });
    // Duplicate status updates are refused; editing a ledger is an explicit reconciliation.
    if (checked.issues.length) throw new OpsError('MEDIA_RECORD_REJECTED', '素材登记检查失败', 1, { issues: checked.issues });
    const additions = checked.checks.map(asset => ({ ...asset, channel: draft.channel, outcome,
      at: new Date().toISOString(), evidenceUrl: url.href, evidenceKind: 'operator_attested_not_automatically_verified' }));
    await writeJSON(file, [...records, ...additions]);
    return { status: 'ok', recorded: additions.length, registry: file, publishPerformed: false };
  });
}
if (require.main === module) run(main);
module.exports = main;

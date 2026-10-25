'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { withLock, writeJSON } = require('./state');
const { checkAKPackage } = require('./ak-package-check');

// Local durable preparation only. This function has no browser or publishing capability.
async function reserveAKPackage(input, registryFile) {
  const file = path.resolve(registryFile);
  return withLock(`media-registry:${file}`, async () => {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024) throw new Error('Expected a regular bounded local media registry');
    const records = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(records)) throw new Error('Media registry must be an array');
    // The authoritative file overrides a caller's incomplete or empty previousUses.
    const result = checkAKPackage({ ...input, previousUses: records });
    if (result.errors.length) return { ...result, nextAction: 'resolve_preflight_or_existing_reservation_do_not_submit' };
    const operationId = createHash('sha256').update(JSON.stringify({
      date: input.publicationDate, channel: input.channel,
      reports: result.checks.map(x => [x.reportIdentity, x.sha256])
    })).digest('hex');
    const at = new Date().toISOString();
    const additions = result.checks.map(check => {
      const report = input.reports.find(x => x.id === check.id);
      return { id: `${operationId}:${check.id}`, operationId, channel: input.channel,
        title: input.caption.split('\n')[0], filename: path.basename(report.path),
        sha256: check.sha256, reportIdentity: check.reportIdentity,
        reportContentSha256: check.reportContentSha256, reportMetadata: check.reportMetadata,
        sourcePaths: [report.path], sourceURL: report.sourceUrl, outcome: 'reserved', at,
        publishedAt: null, evidenceKind: 'local_preflight_reservation_not_publication' };
    });
    await writeJSON(file, [...records, ...additions]);
    return { ...result, readOnly: false, status: 'reserved_for_single_authorized_native_submit',
      operationId, reservationIds: additions.map(x => x.id), automaticPublish: false,
      nextAction: 'use_existing_write_once_native_submit_then_independently_verify_and_resolve_reservation' };
  });
}
module.exports = { reserveAKPackage };

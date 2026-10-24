'use strict';
const { timestamp } = require('./daily-execution');
const HOURS = [24, 72, 168];
function reviewTasks(publications, observations, now) {
  const seen = new Set(), tasks = [];
  for (const receipt of publications) {
    if (!receipt.url || !receipt.channel || !receipt.status?.startsWith('published_native_') || !receipt.evidenceFilePresent) continue;
    const key = `${receipt.channel}:${receipt.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const published = timestamp(receipt.publishedAt);
    if (published === null || published > now) continue;
    for (let i = 0; i < HOURS.length; i++) {
      const hours = HOURS[i], due = published + hours * 3600000;
      const end = i < HOURS.length - 1 ? published + HOURS[i + 1] * 3600000 : Infinity;
      const samples = observations.filter(row => row.channel === receipt.channel && row.url === receipt.url &&
        row.evidenceFilePresent === true && row.scope === 'single_content' && row.windowType === 'cumulative' &&
        timestamp(row.observedAt) !== null && timestamp(row.observedAt) >= due && timestamp(row.observedAt) < end &&
        timestamp(row.observedAt) <= now).sort((a, b) => timestamp(a.observedAt) - timestamp(b.observedAt));
      const measured = samples.find(row => Object.values(row.metrics || {}).some(value => typeof value === 'number' && Number.isFinite(value) && value >= 0));
      const sample = measured || samples[0];
      let status = due > now ? 'upcoming' : 'due_for_evidence_check';
      if (sample) status = measured ? (timestamp(sample.observedAt) <= due + 6 * 3600000 ? 'reviewed' : 'reviewed_late') : 'visibility_only_metrics_unknown';
      else if (end <= now) status = 'missed_observation_window';
      tasks.push({ channel: receipt.channel, url: receipt.url, windowHours: hours, dueAt: new Date(due).toISOString(), status,
        observedAt: sample?.observedAt || null, elapsedHours: sample ? (timestamp(sample.observedAt) - published) / 3600000 : null,
        evidence: sample?.evidence || null, metrics: sample?.metrics || null,
        note: 'Actual elapsed hours are retained; a late sample is not an exact 24h/72h/7d result. Unknown counters remain null; no repeat publishing.' });
    }
  }
  return tasks;
}
module.exports = { reviewTasks };

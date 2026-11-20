'use strict';
const { timestamp } = require('./daily-execution');
const { videoPerformanceReview, ON_TIME_HOURS } = require('./video-performance-review');
const HOURS = [24, 72, 168];
const keyFor = row => `${row.channel}:${row.url}`;

function reviewTasks(publications, observations, now) {
  const originals = new Map();
  for (const receipt of publications) {
    if (!receipt.url || !receipt.channel || !receipt.status?.startsWith('published_native_') || !receipt.evidenceFilePresent) continue;
    if (timestamp(receipt.verifiedAt) > now || timestamp(receipt.publishedAt) > now) continue;
    const key = keyFor(receipt);
    const existing = originals.get(key);
    if (!existing || (timestamp(existing.publishedAt) === null && timestamp(receipt.publishedAt) !== null)) {
      originals.set(key, receipt);
    }
  }

  const byOriginal = new Map();
  for (const row of observations) {
    const key = keyFor(row);
    if (!originals.has(key) || row.evidenceFilePresent !== true ||
        row.scope !== 'single_content' || row.windowType !== 'cumulative') continue;
    const at = timestamp(row.observedAt);
    if (at === null || at > now) continue;
    const samples = byOriginal.get(key) || [];
    samples.push({ row, at });
    byOriginal.set(key, samples);
  }

  const tasks = [];
  for (const [key, receipt] of originals) {
    const samples = (byOriginal.get(key) || []).sort((a, b) => a.at - b.at);
    const { channel, url } = receipt;
    const published = timestamp(receipt.publishedAt);
    if (published === null) {
      const latest = samples.at(-1)?.row;
      tasks.push({ channel, url, windowHours: null, dueAt: null, status: 'publication_time_missing',
        observedAt: latest?.observedAt || null, elapsedHours: null,
        evidence: latest?.evidence || null, metrics: latest?.metrics || null,
        note: 'Publication time is unavailable. Keep the sampled values without assigning a post age.' });
      continue;
    }
    for (let i = 0; i < HOURS.length; i++) {
      const hours = HOURS[i], due = published + hours * 3600000;
      const end = i < HOURS.length - 1 ? published + HOURS[i + 1] * 3600000 : Infinity;
      const windowSamples = samples.filter(sample => sample.at >= due && sample.at < end).map(sample => sample.row);
      const measured = windowSamples.find(row => Object.values(row.metrics || {}).some(value => typeof value === 'number' && Number.isFinite(value) && value >= 0));
      const sample = measured || windowSamples[0];
      let status = due > now ? 'upcoming' : 'due_for_evidence_check';
      if (sample) status = measured ? (timestamp(sample.observedAt) <= due + ON_TIME_HOURS * 3600000 ? 'reviewed' : 'reviewed_late') : 'visibility_only_metrics_unknown';
      else if (end <= now) status = 'missed_observation_window';
      tasks.push({ channel, url, windowHours: hours, dueAt: new Date(due).toISOString(), status,
        observedAt: sample?.observedAt || null, elapsedHours: sample ? (timestamp(sample.observedAt) - published) / 3600000 : null,
        evidence: sample?.evidence || null, metrics: sample?.metrics || null,
        ...(['short_video', 'workstation_short','radar_daily_video'].includes(receipt.kind) ? {
          performanceReview: videoPerformanceReview(channel, windowSamples, { due, end, now })
        } : {}),
        note: 'Actual elapsed hours are retained; a late sample is not an exact 24h/72h/7d result. Unknown counters remain null; no repeat publishing.' });
    }
  }
  return tasks;
}
function reviewsDueNow(reviews, now) {
  const current = new Map();
  for (const review of reviews) {
    const due = timestamp(review.dueAt);
    if (due === null || due > now) continue;
    const key = keyFor(review);
    if (!current.has(key) || due > timestamp(current.get(key).dueAt)) current.set(key, review);
  }
  return [...current.values()]
    .filter(review => ['due_for_evidence_check', 'visibility_only_metrics_unknown'].includes(review.status) ||
      review.performanceReview?.status === 'metrics_incomplete')
    .sort((a, b) => timestamp(b.dueAt) - timestamp(a.dueAt))
    .map(({ channel, url, windowHours, dueAt, observedAt, performanceReview }) => ({
      channel, url, windowHours, dueAt, observedAt,
      missingMetrics: performanceReview?.missingMetrics || [],
    }));
}

module.exports = { reviewTasks, reviewsDueNow };

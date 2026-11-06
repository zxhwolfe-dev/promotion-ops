'use strict';

const REQUIRED = {
  tiktok: ['views', 'averageWatchSeconds', 'nativeRoundedCompletionPercent', 'mainExitSecond'],
  youtube: ['views'],
  bilibili: ['views', 'favorites']
};
const OPTIONAL = ['likes', 'comments', 'averageWatchSeconds', 'nativeRoundedCompletionPercent', 'mainExitSecond', 'favorites'];

// Inputs are already restricted to one publication, verified evidence and one age window.
// Keep metric provenance: retention and the latest view count may be sampled separately.
function videoPerformanceReview(channel, samples, { due, end, now }) {
  if (!REQUIRED[channel]) return null;
  const requiredMetrics = REQUIRED[channel];
  const fields = [...new Set([...requiredMetrics, ...OPTIONAL])];
  const metrics = Object.fromEntries(fields.map(field => [field, null]));
  const evidenceByMetric = {};
  const eligible = samples.filter(sample => {
    const at = Date.parse(sample.observedAt);
    return Number.isFinite(at) && at >= due && at < end && at <= now;
  }).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  for (const field of fields) {
    const sample = eligible.find(row => {
      const value = row.metrics?.[field];
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 &&
        (field !== 'nativeRoundedCompletionPercent' || value <= 100);
    });
    if (!sample) continue;
    metrics[field] = sample.metrics[field];
    evidenceByMetric[field] = { observedAt: sample.observedAt, evidence: sample.evidence || null };
  }
  const missingMetrics = requiredMetrics.filter(field => metrics[field] === null);
  const status = now < due ? 'not_due' : !eligible.length ? 'no_window_sample'
    : missingMetrics.length ? 'metrics_incomplete' : 'required_metrics_observed';
  return { status, requiredMetrics, missingMetrics, metrics, evidenceByMetric,
    viewCountThresholdMet: metrics.views === null ? null : metrics.views >= 200,
    interpretation: 'Metric availability only. 200 views is an exploratory minimum, not proof of improvement or conversion. Keep actual sample ages; no automatic publishing or expansion.',
    nextAction: now < due ? 'wait_for_actual_observation_window'
      : status === 'no_window_sample' ? 'read_native_metrics_when_authorized_do_not_republish'
      : missingMetrics.length ? 'read_missing_native_metrics_or_record_unavailable'
      : metrics.views < 200 ? 'retain_small_sample_caveat_do_not_expand'
      : 'compare_same_platform_same_age_retention_and_useful_actions' };
}

module.exports = { videoPerformanceReview };

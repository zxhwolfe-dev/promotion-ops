'use strict';

const REQUIRED = {
  douyin: ['views', 'twoSecondExitRatePercent', 'completionRatePercent'],
  tiktok: ['views', 'averageWatchSeconds', 'nativeRoundedCompletionPercent', 'mainExitSecond'],
  youtube: ['views'],
  bilibili: ['views', 'favorites']
};
const OPTIONAL = ['likes', 'comments', 'averageWatchSeconds', 'nativeRoundedCompletionPercent', 'mainExitSecond', 'favorites'];
const TIKTOK_FIELDS = {
  nativeRoundedCompletionPercent: ['nativeRoundedCompletionPercent', 'completionRatePercent'],
  mainExitSecond: ['mainExitSecond', 'peakDropOffSecond'],
};
const validMetric = (value, field) => typeof value === 'number' && Number.isFinite(value) && value >= 0 &&
  (!field.endsWith('Percent') || value <= 100);
const ON_TIME_HOURS = 6;
const EXPERIMENT_MIN_VIEWS = 200;

function collectMetrics(channel, fields, samples) {
  const metrics = Object.fromEntries(fields.map(field => [field, null]));
  const evidenceByMetric = {};
  const aliases = channel === 'tiktok' ? TIKTOK_FIELDS : {};
  for (const field of fields) {
    const sources = aliases[field] || [field];
    for (const sample of samples) {
      const sourceMetric = sources.find(key => validMetric(sample.metrics?.[key], field));
      if (!sourceMetric) continue;
      metrics[field] = sample.metrics[sourceMetric];
      evidenceByMetric[field] = { observedAt: sample.observedAt, evidence: sample.evidence || null, sourceMetric };
      break;
    }
  }
  return { metrics, evidenceByMetric };
}

// Inputs are restricted to one publication and one observation window.
function videoPerformanceReview(channel, samples, { due, end, now }) {
  const requiredMetrics = REQUIRED[channel];
  if (!requiredMetrics) return null;
  const fields = [...new Set([...requiredMetrics, ...OPTIONAL])];
  const eligible = samples.filter(sample => {
    const at = Date.parse(sample.observedAt);
    return Number.isFinite(at) && at >= due && at < end && at <= now;
  }).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  const latest = collectMetrics(channel, fields, eligible);
  const { metrics, evidenceByMetric } = latest;
  const missingMetrics = requiredMetrics.filter(field => metrics[field] === null);
  const status = now < due ? 'not_due' : !eligible.length ? 'no_window_sample'
    : missingMetrics.length ? 'metrics_incomplete' : 'required_metrics_observed';
  const onTime = eligible.filter(sample => Date.parse(sample.observedAt) <= due + ON_TIME_HOURS * 3600000);
  const comparison = onTime.length === eligible.length ? latest : collectMetrics(channel, fields, onTime);
  const comparisonReady = comparison.metrics.views >= EXPERIMENT_MIN_VIEWS &&
    requiredMetrics.every(field => comparison.metrics[field] !== null);
  return { status, requiredMetrics, missingMetrics, metrics, evidenceByMetric,
    viewCountThresholdMet: metrics.views === null ? null : metrics.views >= EXPERIMENT_MIN_VIEWS,
    comparisonReady,
    comparisonSample: comparisonReady ? comparison : null,
    interpretation: 'Metric availability only. 200 views is an exploratory minimum, not proof of improvement or conversion. Keep actual sample ages; no automatic publishing or expansion.',
    nextAction: now < due ? 'wait_for_actual_observation_window'
      : status === 'no_window_sample' ? 'read_native_metrics_when_authorized_do_not_republish'
      : missingMetrics.length ? 'read_missing_native_metrics_or_record_unavailable'
      : comparisonReady ? 'compare_same_platform_same_age_retention_and_useful_actions'
      : metrics.views < EXPERIMENT_MIN_VIEWS ? 'retain_small_sample_caveat_do_not_expand'
      : 'retain_actual_sample_age_and_wait_for_comparable_samples' };
}

module.exports = { videoPerformanceReview, ON_TIME_HOURS };

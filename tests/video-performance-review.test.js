'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewTasks } = require('../lib/receipt-reviews');

const publishedAt = '2026-11-06T19:00:00+08:00';
const url = 'https://www.tiktok.com/@example/video/14';
const receipt = { channel: 'tiktok', kind: 'short_video', url, publishedAt,
  status: 'published_native_owner_row_verified', evidenceFilePresent: true };
const observation = (metrics, extra = {}) => ({ channel: 'tiktok', url, metrics,
  observedAt: '2026-11-07T19:02:00+08:00', scope: 'single_content', windowType: 'cumulative',
  evidence: '/native/views.json', evidenceFilePresent: true, ...extra });
const run = (samples, asOf = '2026-11-07T20:00:00+08:00', source = receipt) =>
  reviewTasks([source], samples, Date.parse(asOf))[0];

test('view count alone does not complete the TikTok performance review', () => {
  const task = run([observation({ views: 41 })]);
  assert.equal(task.status, 'reviewed'); // Preserve the existing counter-sampling contract.
  assert.equal(task.performanceReview.status, 'metrics_incomplete');
  assert.deepEqual(task.performanceReview.missingMetrics,
    ['averageWatchSeconds', 'nativeRoundedCompletionPercent', 'mainExitSecond']);
  assert.equal(task.performanceReview.metrics.averageWatchSeconds, null);
});

test('later retention sample completes availability and preserves each metric source', () => {
  const task = run([observation({ views: 45 }), observation({ views: 41, averageWatchSeconds: 3.22,
    nativeRoundedCompletionPercent: 0, mainExitSecond: 2 }, {
    observedAt: '2026-11-07T19:01:00+08:00', evidence: '/native/retention.json' })]);
  const review = task.performanceReview;
  assert.equal(review.status, 'required_metrics_observed');
  assert.equal(review.metrics.views, 45);
  assert.equal(review.metrics.nativeRoundedCompletionPercent, 0);
  assert.equal(review.evidenceByMetric.views.evidence, '/native/views.json');
  assert.equal(review.evidenceByMetric.averageWatchSeconds.evidence, '/native/retention.json');
  assert.equal(review.viewCountThresholdMet, false);
});

test('early, future, other-content, missing-evidence and account samples cannot fill gaps', () => {
  const invalid = [
    { observedAt: '2026-11-07T18:59:00+08:00' },
    { observedAt: '2026-11-07T21:00:00+08:00' },
    { url: url + '0' }, { evidenceFilePresent: false }, { scope: 'account' },
    { windowType: 'daily' }, { channel: 'youtube' }
  ].map(extra => observation({ averageWatchSeconds: 6, nativeRoundedCompletionPercent: 5, mainExitSecond: 9 }, extra));
  assert.equal(run([observation({ views: 0 }), ...invalid]).performanceReview.status, 'metrics_incomplete');
  assert.equal(run([observation({ views: 0 }), ...invalid]).performanceReview.metrics.views, 0);
});

test('72-hour sample never fills the missed 24-hour window', () => {
  const sample = observation({ views: 200 }, { observedAt: '2026-11-09T19:00:00+08:00' });
  const tasks = reviewTasks([receipt], [sample], Date.parse('2026-11-09T20:00:00+08:00'));
  assert.equal(tasks[0].performanceReview.status, 'no_window_sample');
  assert.equal(tasks[1].performanceReview.metrics.views, 200);
  assert.equal(tasks[1].performanceReview.status, 'metrics_incomplete');
});

test('unelapsed review windows stay not due and unknown', () => {
  const review = run([], '2026-11-06T20:00:00+08:00').performanceReview;
  assert.equal(review.status, 'not_due');
  assert.equal(review.metrics.views, null);
  assert.equal(review.viewCountThresholdMet, null);
});

test('invalid metric values do not complete a review', () => {
  for (const value of [null, -1, '3.22', NaN, Infinity]) {
    const review = run([observation({ views: 200, averageWatchSeconds: value,
      nativeRoundedCompletionPercent: 101, mainExitSecond: 2 })]).performanceReview;
    assert.equal(review.status, 'metrics_incomplete');
    assert.equal(review.metrics.averageWatchSeconds, null);
    assert.equal(review.metrics.nativeRoundedCompletionPercent, null);
  }
});

test('YouTube does not require a TikTok-only metric and Bilibili keeps missing favorites unknown', () => {
  const yt = run([observation({ views: 5 }, { channel: 'youtube' })], undefined,
    { ...receipt, channel: 'youtube' }).performanceReview;
  assert.equal(yt.status, 'required_metrics_observed');
  assert.equal(yt.viewCountThresholdMet, false);
  const bili = run([observation({ views: 11 }, { channel: 'bilibili' })], undefined,
    { ...receipt, channel: 'bilibili' }).performanceReview;
  assert.deepEqual(bili.missingMetrics, ['favorites']);
});

test('image posts retain the existing review shape', () => {
  assert.equal('performanceReview' in run([observation({ views: 5 })], undefined,
    { ...receipt, kind: 'image_prompt' }), false);
});

'use strict';
const { setTimeout: sleep } = require('node:timers/promises');
const LABELS = {
  reads: /阅读|浏览|reads?|views?/i,
  likes: /点赞?|赞|likes?/i,
  comments: /评论|comments?/i,
};
function parseCount(raw, metric) {
  const text = String(raw ?? '').trim();
  // A configured "reads" selector must not silently turn "评论 2" into two reads.
  if (metric && (!Object.hasOwn(LABELS, metric) || Object.entries(LABELS).some(([key, re]) => key !== metric && re.test(text)))) return null;
  const match = text.match(/^(?:(?:阅读量?|浏览量?|点赞?|评论|reads?|views?|likes?|comments?)\s*[:：]?\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)([kmb万亿])?(?:\s*(?:次|阅读量?|浏览量?|赞|评论|reads?|views?|likes?|comments?))?$/i);
  if (!match) return null;
  const units = { k: 1e3, m: 1e6, b: 1e9, 万: 1e4, 亿: 1e8 };
  const unit = match[2]?.toLowerCase();
  const value = Number(match[1].replaceAll(',', '')) * (units[unit] || 1);
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER || (!unit && !Number.isInteger(value))) return null;
  return { value: Math.round(value), approximate: !!unit, raw: text };
}
function canonicalPageURL(raw) {
  try { const url = new URL(raw); url.search = ''; url.hash = ''; return url.href; }
  catch { return null; }
}
async function readMetric(page, selector, timeout = 3000, { metric, expectedUrl } = {}) {
  if (!selector) return { value: null, reason: 'selector_not_configured' };
  if (typeof selector !== 'string' || !selector.trim() || selector.length > 500 ||
      !Number.isFinite(timeout) || timeout < 0 || timeout > 60000) return { value: null, reason: 'invalid_metric_config' };
  const deadline = performance.now() + timeout;
  let reason = 'selector_missing';
  try {
    const locator = page.locator(selector).filter({ visible: true });
    do {
      const count = await locator.count();
      if (count > 1) return { value: null, reason: 'selector_ambiguous', selector };
      if (count === 1) {
        // Read uniqueness, value and document identity together. No long auto-wait
        // after count(): detachment is retried as a read, never as a write.
        const sample = await locator.evaluateAll(els => {
          if (els.length !== 1) return null;
          const el = els[0];
          return { text: el.innerText, url: el.ownerDocument.location.href,
            busy: !!el.closest('[aria-busy="true"]') };
        });
        if (sample) {
          const sourceUrl = canonicalPageURL(sample.url);
          if (expectedUrl && sourceUrl !== canonicalPageURL(expectedUrl)) return { value: null, reason: 'target_changed_during_sample', selector };
          const parsed = !sample.busy && parseCount(sample.text, metric);
          if (parsed) return { ...parsed, selector, sourceUrl, evidence: 'visible_dom_counter' };
          reason = sample.busy ? 'metric_busy' : 'unrecognized_metric_text';
        } else reason = 'selector_changed';
      }
      const remaining = deadline - performance.now();
      if (remaining <= 0) break;
      await sleep(Math.min(100, remaining));
    } while (performance.now() <= deadline);
  } catch {
    // Keep failures local so one missing/invalid counter does not erase other metrics.
    return { value: null, reason: 'metric_read_failed', selector };
  }
  return { value: null, reason, selector };
}
module.exports = { parseCount, readMetric };

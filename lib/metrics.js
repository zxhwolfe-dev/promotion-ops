'use strict';
function parseCount(raw) {
  const text = String(raw ?? '').trim();
  const match = text.match(/^(?:(?:阅读量?|浏览量?|点赞?|评论|reads?|views?|likes?|comments?)\s*[:：]?\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)([kmb万亿])?(?:\s*(?:次|阅读量?|浏览量?|赞|评论|reads?|views?|likes?|comments?))?$/i);
  if (!match) return null;
  const units = { k: 1e3, m: 1e6, b: 1e9, 万: 1e4, 亿: 1e8 };
  const unit = match[2]?.toLowerCase();
  const value = Number(match[1].replaceAll(',', '')) * (units[unit] || 1);
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER || (!unit && !Number.isInteger(value))) return null;
  return { value: Math.round(value), approximate: !!unit, raw: text };
}
async function readMetric(page, selector) {
  if (!selector) return { value: null, reason: 'selector_not_configured' };
  const locator = page.locator(selector).filter({ visible: true });
  try { await locator.waitFor({ state: 'visible', timeout: 3000 }); }
  catch { return { value: null, reason: 'selector_missing_or_ambiguous', selector }; }
  if (await locator.count() !== 1) return { value: null, reason: 'selector_ambiguous', selector };
  const parsed = parseCount(await locator.innerText());
  return parsed ? { ...parsed, selector } : { value: null, reason: 'unrecognized_metric_text', selector };
}
module.exports = { parseCount, readMetric };

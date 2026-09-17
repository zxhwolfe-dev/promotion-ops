'use strict';
// Read-only probe. Optional selectors: one CSS selector/list, or a JSON string array.
// Usage: node --env-file=.env scripts/ops/probe-article.js <kind> <url> <firstNeedle> <lastNeedle> '[".body"]'
const { withBrowser, withReadPage } = require('../../lib/cdp');
const { run, OpsError, normalize, navigate, until, assertNoChallenge } = require('../../lib/ops');
const { SITES, articleURL, articleDOMProof } = require('../../lib/articles');

function probeConfig(args) {
  if (!Array.isArray(args) || args.length < 4 || args.length > 5) throw new OpsError('PROBE_USAGE', '需要平台、文章 URL、首段文本、尾段文本及可选选择器');
  const [kind, rawUrl, first, last, rawSelectors] = args;
  if (!Object.hasOwn(SITES, kind)) throw new OpsError('UNKNOWN_KIND', '不支持的平台');
  const url = articleURL(kind, rawUrl);
  if (!url) throw new OpsError('INVALID_URL', '文章链接不符合该平台模式');
  if ([first, last].some(value => typeof value !== 'string' || normalize(value).replace(/\s/g, '').length < 12 || value.length > 500)) {
    throw new OpsError('INVALID_NEEDLE', '首尾文本均须包含至少 12 个非空白字符，且各不超过 500 字符');
  }
  let selectors = [];
  if (rawSelectors !== undefined) {
    if (typeof rawSelectors !== 'string' || !rawSelectors.trim()) throw new OpsError('INVALID_SELECTORS', '选择器不能为空');
    if (/^\[\s*"/.test(rawSelectors.trim())) {
      try { selectors = JSON.parse(rawSelectors); } catch { throw new OpsError('INVALID_SELECTORS', '选择器 JSON 无效'); }
    } else selectors = [rawSelectors]; // Do NOT split commas inside :is() or attribute values.
  }
  if (!Array.isArray(selectors) || selectors.length > 5 || selectors.some(s => typeof s !== 'string' || !s.trim() || s.length > 300)) throw new OpsError('INVALID_SELECTORS', '选择器须为最多 5 项的非空 CSS 字符串');
  return { kind, url, firstNeedle: normalize(first), lastNeedle: normalize(last), selectors };
}
function probeDOM({ firstNeedle, lastNeedle, selectors }) {
  const norm = v => String(v || '').normalize('NFC').replace(/\s+/g, '').trim();
  const nf = norm(firstNeedle);
  const visible = el => !!el && !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const excluded = 'script,style,nav,header,footer,form,textarea,input,[contenteditable],aside,[role="complementary"],.comments,#comments,[data-comment-id],[id^="comment_"]';
  const selectorFor = el => el.tagName.toLowerCase() + (el.id ? '#' + CSS.escape(el.id) :
    [...el.classList].slice(0, 2).map(name => '.' + CSS.escape(name)).join(''));
  const summary = selector => {
    try {
      const all = [...document.querySelectorAll(selector)], roots = all.filter(visible);
      return { selector, totalCount: all.length, visibleCount: roots.length,
        isDocumentRoot: roots.some(el => el === document.body || el === document.documentElement) };
    } catch { return { selector, error: 'invalid_css_selector', visibleCount: 0 }; }
  };
  const headings = [...document.querySelectorAll('h1')].filter(visible);
  const out = { documentUrl: location.href, h1: { count: headings.length, text: headings.length === 1 ? headings[0].innerText.normalize('NFC').replace(/\s+/g, ' ').trim() : null },
    ancestors: [], containers: [], metrics: [], discoveryTruncated: false };
  // One bounded traversal, not 32 whole-document passes. Fragments only DISCOVER
  // candidates; the publishing proof below validates BOTH complete needles.
  const fragments = [12, 8, 6, 4].flatMap(size => [0, 2, 4, 6].map(offset => nf.slice(offset, offset + size))).filter(s => s.length >= 4);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seenAncestors = new Set(), seenMetrics = new Set();
  let visited = 0;
  while (walker.nextNode()) {
    if (++visited > 20000) { out.discoveryTruncated = true; break; }
    const node = walker.currentNode, el = node.parentElement;
    if (!visible(el) || el.closest(excluded)) continue;
    const text = norm(node.textContent);
    if (fragments.some(fragment => text.includes(fragment))) {
      for (let root = el, depth = 0; root && root !== document.body && depth < 10; root = root.parentElement, depth++) {
        const selector = selectorFor(root);
        if (seenAncestors.has(selector) || !visible(root)) continue;
        if (out.ancestors.length >= 40) { out.discoveryTruncated = true; break; }
        seenAncestors.add(selector);
        out.ancestors.push({ ...summary(selector), depth, candidateOnly: true });
      }
    }
    if (/阅读|浏览|点赞|评论|\b(?:views?|reads?|likes?|comments?)\b/i.test(node.textContent || '') && /\d/.test(text)) {
      const selector = selectorFor(el);
      if (!seenMetrics.has(selector) && out.metrics.length < 12) {
        seenMetrics.add(selector);
        out.metrics.push({ ...summary(selector), sample: (el.innerText || '').trim().slice(0, 80), candidateOnly: true });
      }
    }
  }
  const selected = new Set([...selectors, 'article', '[role="article"]']);
  for (const selector of new Set([...selected, ...out.ancestors.map(a => a.selector)])) {
    out.containers.push({ ...summary(selector), candidateOnly: !selected.has(selector) });
  }
  return out;
}
function assertTarget(page, config) {
  if (articleURL(config.kind, page.url()) !== config.url) throw new OpsError('TARGET_CHANGED', '探针已离开原文章，拒绝使用其他页面的 DOM 契约', 2);
}
async function inspectPage(page, config) {
  assertTarget(page, config);
  await assertNoChallenge(page);
  const data = await page.evaluate(probeDOM, config);
  if (articleURL(config.kind, data.documentUrl) !== config.url) throw new OpsError('TARGET_CHANGED', '探针读取到其他文章文档', 2);
  delete data.documentUrl; // Avoid logging query-string credentials from a redirect.
  if (data.containers.some(entry => entry.error && config.selectors.includes(entry.selector))) throw new OpsError('INVALID_SELECTORS', '指定 CSS 选择器语法无效');
  for (const entry of data.containers) {
    entry.bodySamplesMatched = !entry.error && entry.visibleCount === 1 && !entry.isDocumentRoot && data.h1.count === 1 &&
      await page.evaluate(articleDOMProof, { title: data.h1.text, needles: [config.firstNeedle, config.lastNeedle], bodySelectors: [entry.selector], expectedUrl: config.url });
    entry.isBody = !entry.candidateOnly && entry.bodySamplesMatched;
  }
  assertTarget(page, config);
  const matched = data.h1.count === 1 && data.containers.some(entry => entry.isBody);
  return { status: matched && !data.discoveryTruncated ? 'ok' : 'partial', readOnly: true, url: config.url,
    proofScope: 'current_document_title_and_body_samples_only', ...data,
    metricsNote: '候选不是已验证的统计来源，采用前须核对该文章指标语义、唯一性与加载状态；不会自动写入配置' };
}
async function main(args = process.argv.slice(2)) {
  const config = probeConfig(args); // All required text/shape validation before connecting.
  return withBrowser(context => withReadPage(context, async page => {
    await navigate(page, config.url, SITES[config.kind].hosts);
    assertTarget(page, config);
    let result;
    try {
      await until(async () => { result = await inspectPage(page, config); return result.status === 'ok'; },
        { timeout: 20000, interval: 500, code: 'PROBE_INCOMPLETE', label: '未找到满足发布验证契约的局部正文' });
    } catch (error) {
      if (error.code !== 'PROBE_INCOMPLETE' || !result) throw error;
    }
    assertTarget(page, config);
    return result;
  }));
}
if (require.main === module) run(main);
module.exports = main;
module.exports.probeConfig = probeConfig;
module.exports.probeDOM = probeDOM;
module.exports.inspectPage = inspectPage;

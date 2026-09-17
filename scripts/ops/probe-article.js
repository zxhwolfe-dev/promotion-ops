'use strict';
// 只读 DOM 契约探针：在真实已发布文章页面上验证 h1 唯一性、候选正文容器、指标元素。
// 用法: node --env-file=.env scripts/ops/probe-article.js <kind> <articleUrl> <firstNeedle> <lastNeedle> [selector1,selector2,...]
// 绝不点击、不提交；只导航和读取。结果用于填写 PROMO_ARTICLE_BODY_SELECTORS 与 targets.local.json。
const { withBrowser } = require('../../lib/cdp');
const { run, OpsError } = require('../../lib/ops');
const { SITES, articleURL } = require('../../lib/articles');

async function main(args = process.argv.slice(2)) {
  const [kind, rawUrl, firstNeedle, lastNeedle, selectorList] = args;
  if (!kind || !SITES[kind]) throw new OpsError('UNKNOWN_KIND', 'kind 必须是 ' + Object.keys(SITES).join('/'));
  const url = articleURL(kind, rawUrl);
  if (!url) throw new OpsError('INVALID_URL', '文章链接不符合该平台模式');
  const selectors = (selectorList || '').split(',').map(s => s.trim()).filter(Boolean);
  return withBrowser(async context => {
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(6000);
      const { until } = require('../../lib/ops');
      await until(async () => {
        try { return await page.evaluate(nf => document.body.innerText.normalize().replace(/\s+/g, '').includes(nf), firstNeedle.normalize('NFC').slice(0, 20).replace(/\s+/g, '')); }
        catch { return false; }
      }, { timeout: 20000, interval: 1000, code: 'ARTICLE_TEXT_NOT_FOUND', exitCode: 2, label: '页面上未出现首段针文本（可能未登录/未审核/选择器失效）' });
      return await page.evaluate(({ firstNeedle, lastNeedle, selectors }) => {
        const norm = v => String(v || '').normalize('NFC').replace(/\s+/g, ' ').trim();
        const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
        const out = { status: 'ok', readOnly: true, url: location.href, bodyHead: norm(document.body.innerText).slice(0, 150), h1Raw: document.querySelectorAll('h1').length, h1: null, containers: [], metrics: [], ancestors: [] };
        // 等待 SPA 渲染：由外层 until 处理；此处从针文本自动发现祖先链。
        const nf = norm(firstNeedle).replace(/\s/g, ''), nl = norm(lastNeedle).replace(/\s/g, '');
        const allText = () => norm(document.body.innerText).replace(/\s/g, '');
        let anchor = null;
        // 内联标记会把首段切进多个文本节点（如 "RAG" 独立成节点）：不同偏移×窗口尝试片段。
        outer: for (const windowSize of [12, 8, 6, 4]) {
          for (const offset of [0, 2, 4, 6]) {
            const fragment = nf.slice(offset, offset + windowSize);
            if (fragment.length < 4) continue;
            const walker0 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while (walker0.nextNode()) {
              if (norm(walker0.currentNode.textContent || '').replace(/\s/g, '').includes(fragment)) { anchor = walker0.currentNode.parentElement; break; }
            }
            if (anchor) break outer;
          }
        }
        if (anchor) {
          let el = anchor;
          for (let depth = 0; depth < 10 && el && el !== document.body; depth++, el = el.parentElement) {
            if (!visible(el)) continue;
            let sel = el.tagName.toLowerCase();
            if (el.id) sel += '#' + el.id;
            else if (typeof el.className === 'string' && el.className.trim()) sel += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
            const text = norm(el.innerText).replace(/\s/g, '');
            let uniqueInPage = null;
            try { uniqueInPage = document.querySelectorAll(el.tagName.toLowerCase() + (el.id ? '#' + CSS.escape(el.id) : '')).length; }
            catch { uniqueInPage = null; } // 数字开头等非常规 id：只报告，不用于匹配
            out.ancestors.push({ depth, selector: sel, tag: el.tagName, hasFirst: text.includes(nf), hasLast: text.includes(nl), textLength: text.length, uniqueInPage });
          }
        }
        const h1s = [...document.querySelectorAll('h1')].filter(visible);
        out.h1 = { count: h1s.length, text: h1s.length ? norm(h1s[0].innerText).slice(0, 80) : null };
        for (const selector of [...selectors, 'article', '[role="article"]']) {
          const roots = [...document.querySelectorAll(selector)].filter(visible);
          const entry = { selector, visibleCount: roots.length, isBody: false, isDocumentRoot: false };
          if (roots.length === 1) {
            const root = roots[0];
            entry.isDocumentRoot = root === document.body || root === document.documentElement;
            const text = norm(root.innerText).replace(/\s/g, '');
            entry.containsFirst = text.includes(nf);
            entry.containsLast = text.includes(nl);
            entry.isBody = !entry.isDocumentRoot && entry.containsFirst && entry.containsLast;
            entry.textLength = text.length;
          }
          if (!out.containers.find(c => c.selector === selector)) out.containers.push(entry);
        }
        const metricText = /((?:\d[\d,]*)\s*(?:阅读|浏览|views?)|阅读[：（:]\s*\d[\d,]*|(?:\d[\d,]*)\s*(?:人点赞|点赞|赞|likes?)|评论[：（]\s*\d[\d,]*|\d[\d,]*\s*(?:条评论|评论|comments?))/i;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const seen = new Set();
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!metricText.test(node.textContent || '')) { metricText.lastIndex = 0; continue; }
          metricText.lastIndex = 0;
          const el = node.parentElement;
          if (!el || !visible(el)) continue;
          let sel = el.tagName.toLowerCase();
          if (el.id) sel += '#' + el.id;
          else if (typeof el.className === 'string' && el.className.trim()) sel += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
          const key = sel + '|' + node.textContent.trim().slice(0, 20);
          if (!seen.has(key)) { seen.add(key); out.metrics.push({ selector: sel, sample: node.textContent.trim().slice(0, 40) }); }
          if (out.metrics.length >= 12) break;
        }
        out.metricsNote = 'metrics 是候选；targets.local.json 采用前须人工核对唯一性';
        return out;
      }, { firstNeedle, lastNeedle, selectors });
    } finally { await page.close({ runBeforeUnload: false }).catch(() => {}); }
  });
}

if (require.main === module) run(main);
module.exports = main;

'use strict';
const { withReadPage } = require('./cdp');
const { OpsError, trustedURL, normalize, until, assertNoChallenge, navigate, choose } = require('./ops');
const SITES = {
  tencent: { hosts: ['cloud.tencent.com'], pattern: /^\/developer\/article\/\d+\/?$/ },
  aliyun: { hosts: ['developer.aliyun.com'], pattern: /^\/article\/\d+\/?$/ },
  csdn: { hosts: ['blog.csdn.net'], pattern: /^\/[^/]+\/article\/details\/\d+\/?$/ },
  oschina: { hosts: ['my.oschina.net'], pattern: /^\/(?:u\/\d+|[^/]+)\/blog\/\d+\/?$/ },
};
function articleURL(kind, raw, base) {
  try {
    const site = SITES[kind];
    const url = trustedURL(new URL(raw, base).href, site.hosts, site.pattern);
    url.search = ''; url.hash = '';
    return url.href;
  } catch { return null; }
}
function plainMarkdown(text) {
  return text.replace(/^\s*```[^\n]*$/gm, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:#{1,6}|>|[-*+] |\d+\. )\s*/gm, '').replace(/[*_`~]/g, '');
}
function fingerprints(text) {
  const lines = text.split(/\n+/).map(normalize).filter(line => line.length >= 12);
  if (!lines.length) throw new OpsError('INSUFFICIENT_CONTENT', '正文需至少包含一段 12 字符的可核验文字');
  return [...new Set([lines[0].slice(0, 80), lines[lines.length - 1].slice(-80)])];
}
function validateTitle(title) {
  if (!title?.trim() || /[\r\n]/.test(title) || [...title].length > 200) throw new OpsError('INVALID_TITLE', '请提供单行、非空且不超过 200 字符的标题');
  return title.trim();
}
async function insertEmpty(page, locator, text) {
  const before = await locator.evaluate(el => 'value' in el ? el.value : el.innerText);
  if (normalize(before)) throw new OpsError('EXISTING_DRAFT', '编辑器已有草稿，拒绝覆盖；请人工处理', 3);
  await locator.click();
  await page.keyboard.insertText(text);
  const after = await locator.evaluate(el => 'value' in el ? el.value : el.innerText);
  if (normalize(after) !== normalize(text)) throw new OpsError('FILL_MISMATCH', '正文回读不一致，停止发布');
}
async function insertSafeHTML(page, editor, html) {
  const checked = await page.evaluate(source => {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const tags = new Set('HTML HEAD BODY P DIV SPAN H1 H2 H3 H4 H5 H6 STRONG EM B I U S UL OL LI BLOCKQUOTE PRE CODE BR HR A IMG TABLE THEAD TBODY TR TH TD'.split(' '));
    const attrs = new Set(['href', 'src', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan']);
    for (const el of doc.querySelectorAll('*')) {
      if (!tags.has(el.tagName)) return { error: '不允许的 HTML 标签' };
      for (const attr of el.attributes) {
        if (!attrs.has(attr.name)) return { error: '不允许的 HTML 属性（包括事件、style、iframe）' };
        if (['href', 'src'].includes(attr.name)) {
          try { const url = new URL(attr.value); if (url.protocol !== 'https:' || url.username || url.password) return { error: '链接和图片必须使用无凭据 HTTPS URL' }; }
          catch { return { error: 'HTML 包含无效链接' }; }
        }
      }
    }
    return { text: doc.body.textContent || '' };
  }, html);
  if (checked.error) throw new OpsError('UNSAFE_HTML', checked.error);
  if (normalize(await editor.innerText())) throw new OpsError('EXISTING_DRAFT', '编辑器已有草稿，拒绝覆盖', 3);
  await editor.click();
  const inserted = await editor.evaluate((el, source) => { el.focus(); return document.execCommand('insertHTML', false, source); }, html);
  if (!inserted) throw new OpsError('HTML_INSERT_FAILED', '编辑器拒绝 insertHTML');
  const text = await editor.innerText();
  if (!normalize(text) || normalize(checked.text).replace(/\s/g, '') !== normalize(text).replace(/\s/g, '')) {
    throw new OpsError('FILL_MISMATCH', 'HTML 正文回读异常');
  }
  return text;
}
async function selectTag(page, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const option = await choose(page, [
    page.getByRole('option', { name: tag, exact: true }),
    page.locator('li, [class*="sug"], [class*="tag-item"]').filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`) }),
  ], '官方标签建议项');
  await option.click();
}
function articleBodySelectors(kind) {
  let configured = {};
  try { configured = JSON.parse(process.env.PROMO_ARTICLE_BODY_SELECTORS || '{}'); }
  catch { throw new OpsError('INVALID_BODY_SELECTORS', 'PROMO_ARTICLE_BODY_SELECTORS 必须为平台到选择器数组的 JSON'); }
  if (!configured || Array.isArray(configured) || typeof configured !== 'object') throw new OpsError('INVALID_BODY_SELECTORS', '正文选择器配置必须是对象');
  const selectors = configured[kind] ?? ['article', '[role="article"]'];
  if (!Array.isArray(selectors) || !selectors.length || selectors.length > 5 || selectors.some(value =>
    typeof value !== 'string' || !value.trim() || value.length > 300 || /^(?:body|html|:root|\*)$/i.test(value.trim()))) {
    throw new OpsError('INVALID_BODY_SELECTORS', '正文选择器须为 1–5 个局部 CSS 选择器，不能使用整页');
  }
  return selectors;
}
function articleDOMProof({ title, needles, bodySelectors = ['article', '[role="article"]'] }) {
  const norm = value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const headings = [...document.querySelectorAll('h1')].filter(visible);
  if (headings.length !== 1 || norm(headings[0].innerText) !== norm(title)) return false;
  for (const selector of bodySelectors) {
    const roots = [...document.querySelectorAll(selector)].filter(visible);
    if (roots.length > 1) return false; // Ambiguity is not a reason to fall back to the whole page.
    if (!roots.length) continue;
    const root = roots[0];
    if (root === document.body || root === document.documentElement) return false;
    const excluded = 'script,style,nav,header,footer,form,textarea,input,[contenteditable],aside,[role="complementary"],.comments,#comments,[data-comment-id],[id^="comment_"]';
    const parts = [];
    const walk = node => {
      if (node.nodeType === Node.TEXT_NODE) { parts.push(node.textContent); return; }
      if (!(node instanceof Element) || node.matches(excluded) || !visible(node)) return;
      for (const child of node.childNodes) walk(child);
    };
    walk(root);
    const text = norm(parts.join(' ')).replace(/\s/g, '');
    return Array.isArray(needles) && needles.length > 0 && needles.every(needle => text.includes(norm(needle).replace(/\s/g, '')));
  }
  return false;
}
async function verifyArticle(page, kind, title, bodyText, { expectedOwner, discoveryTimeout = 30000, readbackTimeout = 25000 } = {}) {
  const needles = fingerprints(bodyText);
  const bodySelectors = articleBodySelectors(kind);
  const url = await until(async () => {
    await assertNoChallenge(page);
    const current = articleURL(kind, page.url());
    if (current) return current;
    if (kind === 'csdn' && /\/creation\/success/.test(new URL(page.url()).pathname)) {
      const id = new URL(page.url()).searchParams.get('articleId');
      if (id && /^\d+$/.test(id) && expectedOwner) return articleURL(kind, `https://blog.csdn.net/${expectedOwner}/article/details/${id}`);
    }
    const hrefs = await page.locator('#dialog-root .c-modal:visible a[href], [role="dialog"]:visible a[href], .modal:visible a[href]').evaluateAll(links => links.map(link => link.href));
    return hrefs.map(href => articleURL(kind, href, page.url())).find(Boolean);
  }, { timeout: discoveryTimeout, label: '提交后未发现可信文章永久链接；需人工核验，禁止重发' });
  if (expectedOwner && ((kind === 'oschina' && !new URL(url).pathname.startsWith(`/u/${expectedOwner}/blog/`)) ||
      (kind === 'csdn' && new URL(url).pathname.split('/')[1] !== expectedOwner))) {
    throw new OpsError('AUTHOR_MISMATCH', '发布结果作者路径与预期账号不符', 2);
  }
  return withReadPage(page.context(), async verificationPage => {
    await navigate(verificationPage, url, SITES[kind].hosts);
    if (articleURL(kind, verificationPage.url()) !== url) throw new OpsError('ARTICLE_REDIRECT', '独立回读跳转到了其他文章', 2);
    await until(async () => {
      await assertNoChallenge(verificationPage);
      return verificationPage.evaluate(articleDOMProof, { title, needles, bodySelectors });
    }, { timeout: readbackTimeout, label: '独立页面未核验到对应标题及正文；可能待审核或提交失败，禁止重发' });
    return { status: 'verified', articleUrl: url, evidence: { kind: 'independent_page_readback', titleMatched: true, bodyScope: 'unique_visible_article_container', bodySamplesMatched: needles.length, visibility: 'current_session' } };
  });
}
module.exports = { SITES, articleURL, plainMarkdown, fingerprints, validateTitle, insertEmpty, insertSafeHTML, selectTag, articleBodySelectors, articleDOMProof, verifyArticle };

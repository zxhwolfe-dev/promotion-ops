'use strict';
const { normalize, trustedURL } = require('./ops');
function redditThread(raw) {
  const url = trustedURL(raw, ['reddit.com', 'www.reddit.com', 'old.reddit.com'], /^\/r\/[A-Za-z0-9_]+\/comments\/[A-Za-z0-9]+(?:\/[^/]+)?\/?$/);
  url.hostname = 'old.reddit.com'; url.search = ''; url.hash = '';
  return { url: url.href, id: url.pathname.split('/')[4].toLowerCase() };
}
async function redditComments(page) {
  return page.locator('.thing.comment').evaluateAll(nodes => nodes.map(node => ({
    id: node.getAttribute('data-fullname') || node.id,
    author: node.querySelector('a.author')?.textContent?.trim() || '',
    body: node.querySelector('.usertext-body')?.innerText || '',
    url: node.querySelector('a.bylink[href*="/comments/"]')?.href || '',
    score: node.querySelector('.score.unvoted')?.textContent?.trim() || null,
  })));
}
function findRedditComment(rows, { previousIds, author, text, threadId }) {
  return rows.find(row => {
    if (!row.id || previousIds.has(row.id) || row.author.toLowerCase() !== author.toLowerCase() || normalize(row.body) !== normalize(text)) return false;
    try {
      const url = trustedURL(row.url, ['old.reddit.com', 'www.reddit.com', 'reddit.com']);
      const match = url.pathname.match(/^\/r\/[^/]+\/comments\/([^/]+)\/[^/]+\/([^/]+)\/?$/);
      return !!match && match[1].toLowerCase() === threadId.toLowerCase() &&
        row.id.replace(/^(?:t1_|thing_t1_)/, '').toLowerCase() === match[2].toLowerCase();
    } catch { return false; }
  });
}
async function oschinaComments(page) {
  const selector = process.env.OSCHINA_COMMENT_SELECTOR || '[data-comment-id], [id^="comment_"], .comment-item';
  return page.locator(selector).evaluateAll(nodes => nodes.map(node => ({
    id: node.getAttribute('data-comment-id') || node.id || '',
    body: node.querySelector('.comment-content, .comment-text, .content')?.innerText || '',
    authors: [...node.querySelectorAll('a.author[href], .comment-author a[href], a.user-name[href]')].map(link => link.href),
  })).filter(row => row.id && row.body));
}
function findOSChinaComment(rows, { previousIds, author, text }) {
  return rows.find(row => row.id && !previousIds.has(row.id) && normalize(row.body) === normalize(text) && row.authors.some(raw => {
    try { return trustedURL(raw, ['my.oschina.net']).pathname.replace(/\/$/, '') === `/u/${author}`; } catch { return false; }
  }));
}
module.exports = { redditThread, redditComments, findRedditComment, oschinaComments, findOSChinaComment };

'use strict';
const { normalize } = require('./ops');
const { plainMarkdown } = require('./articles');

// Reddit may render a dash as literal text or as a list. Preserve bare URLs:
// stripping Markdown underscores from utm_source changes the actual link text.
function redditBodyMatches(body, source) {
  if (normalize(body) === normalize(source)) return true;
  let prefix = 'PROMOURLPLACEHOLDER';
  while (source.includes(prefix)) prefix += 'X';
  const urls = [];
  const protectedText = source.replace(/https?:\/\/[^\s<>"\])]+/g, url => {
    const index = urls.push(url) - 1;
    return `${prefix}${index}END`;
  });
  let rendered = plainMarkdown(protectedText);
  urls.forEach((url, index) => { rendered = rendered.replace(`${prefix}${index}END`, url); });
  return normalize(body) === normalize(rendered);
}
module.exports = { redditBodyMatches };

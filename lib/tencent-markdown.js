'use strict';
const { OpsError } = require('./ops');

// Native Tencent validation observed 2026-11-11: text fences must be authored as txt.
// Reject the known incompatible input before opening Chrome or reserving a submit.
// Do not guess a full language whitelist or silently rewrite the author's draft.
function assertTencentMarkdown(body) {
  let fence = null;
  for (const [index, line] of body.split(/\r?\n/).entries()) {
    if (fence) {
      const closing = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) fence = null;
      continue;
    }
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!opening) continue;
    fence = opening[1];
    if (/^text(?:\s|$)/i.test(opening[2].trim())) {
      throw new OpsError('TENCENT_CODE_LANGUAGE_UNSUPPORTED',
        `第${index + 1}行：腾讯云不接受 text 代码块语言，请在稿件中改为 txt 后再发布`, 1);
    }
  }
}

module.exports = { assertTencentMarkdown };

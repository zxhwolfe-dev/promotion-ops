'use strict';
const { withPage } = require('../../lib/cdp');
const { run, navigate, OpsError } = require('../../lib/ops');
const { editorProbeDOM } = require('../../lib/editors');
async function main(args = process.argv.slice(2)) {
  const pages = { aliyun: 'https://developer.aliyun.com/article/new', tencent: 'https://cloud.tencent.com/developer/article/write' };
  if (!Object.hasOwn(pages, args[0])) throw new OpsError('INVALID_PLATFORM', '只支持 aliyun 或 tencent');
  const url = pages[args[0]];
  return withPage(async page => {
    await navigate(page, url, [new URL(url).hostname]);
    const candidates = await page.evaluate(editorProbeDOM);
    return { status: candidates.length ? 'ok' : 'partial', readOnly: true, candidates,
      note: '仅列当前已渲染候选；未自动选择，不含正文；需确认编辑器类型及草稿状态后配置' };
  }, { keepOnError: true });
}
if (require.main === module) run(main);
module.exports = main;

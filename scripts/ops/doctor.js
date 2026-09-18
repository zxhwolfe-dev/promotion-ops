'use strict';
const { withBrowser, endpointConfig } = require('../../lib/cdp');
const { stateDir } = require('../../lib/state');
const { run } = require('../../lib/ops');
async function main() {
  const config = endpointConfig();
  return withBrowser(async context => ({ status: 'ok', nodeVersion: process.version,
    playwrightVersion: require('playwright-core/package.json').version, cdp: config.endpoint,
    stateDirectory: stateDir(), existingPages: context.pages().length,
    note: '仅证明 CDP 可连接；不证明任一平台登录有效，也没有执行发布或发送。' }));
}
if (require.main === module) run(main);
module.exports = main;

'use strict';
// 默认只读。人工确认命令见 README；本命令从不发送、发布或绕过验证码。
const { run } = require('../../lib/ops');
const { reconcile } = require('../../lib/state');
async function main(args = process.argv.slice(2)) {
  const [id, decision, url, confirmation] = args;
  return reconcile(id, decision, url, confirmation === '--i-checked-the-remote-result');
}
if (require.main === module) run(main);
module.exports = main;

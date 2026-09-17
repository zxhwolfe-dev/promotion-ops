// scripts/baidu-ziyuan/read-stats.js — 读索引量/关键词（需百度网页登录态；会话易过期）
// 用法: node read-stats.js
const { withPage } = require('../../lib/cdp');

withPage(async (page) => {
  const S = encodeURIComponent('https://aiworkstation.cn/');
  const out = {};
  // 数据看板路径（直链工具页会报 "site is wrong"，必须从 dashboard 侧栏进）
  await page.goto(`https://ziyuan.baidu.com/dashboard/index?site=${S}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(9000);
  out.dashboard = await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 600));
  console.log(out.dashboard);
});

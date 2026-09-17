#!/usr/bin/env node
// scripts/baidu-ziyuan/push-urls.js — 百度搜索资源平台普通收录 API 推送（唯一无需登录的杠杆）
// 用法: BAIDU_PUSH_TOKEN=xxx node push-urls.js urls.txt   （每行一个 URL，每日配额 10 条，无备案站）
// 注意: 正确域名是 ziyuan.baidu.com（ziyan.baidu.com 已下线，别再访问）
const { execFileSync } = require('child_process');

const token = process.env.BAIDU_PUSH_TOKEN;
const site = process.env.BAIDU_SITE || 'https://aiworkstation.cn';
const file = process.argv[2];
if (!token) { console.error('missing BAIDU_PUSH_TOKEN'); process.exit(1); }
if (!file) { console.error('usage: push-urls.js <urlsFile>'); process.exit(1); }

const out = execFileSync('curl', [
  '-s', '-H', 'Content-Type:text/plain', '--data-binary', '@' + file,
  `http://data.zz.baidu.com/urls?site=${site}&token=${token}`,
], { encoding: 'utf8' });
console.log(out); // {"remain":N,"success":M}

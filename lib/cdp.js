// lib/cdp.js — 公共：连接常驻推广浏览器（复用登录态，绝不新开浏览器实例）
// 用法: const { withPage } = require('../lib/cdp'); withPage(async page => { ... });
const { chromium } = require('playwright');

const CDP_ENDPOINT = process.env.PROMO_CDP || 'http://127.0.0.1:9234';

async function withBrowser(fn) {
  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  try {
    return await fn(browser.contexts()[0]);
  } finally {
    // 只断开连接，不关浏览器（保住登录态）
    await browser.close();
  }
}

async function withPage(fn, { reuse = (p) => false } = {}) {
  return withBrowser(async (context) => {
    let page = context.pages().find(reuse) || (await context.newPage());
    await page.bringToFront();
    return fn(page, context);
  });
}

// Windows 侧启动命令（浏览器未运行时手工执行一次）：
//   chrome.exe --remote-debugging-port=9234 \
//     --user-data-dir="C:\Users\<you>\AppData\Local\AIWorkstationPromotionBrowser" \
//     --no-first-run
module.exports = { withBrowser, withPage, CDP_ENDPOINT };

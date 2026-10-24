'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { timestamp, localDay } = require('./daily-execution');
const { writeJSON } = require('./state');
const { OpsError, until, assertNoChallenge, trustedURL } = require('./ops');
const CARDS = [ ['battle', 'klinechat', '#battleCardContainer'],
  ['domestic-news', 'news', '#newsAnalysisCard'], ['limitup', 'limitup', '#limitUpCard'] ];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function checkRunDate(date, now = Date.now()) {
  if (timestamp(`${date}T17:30:00+08:00`) === null || date !== localDay(now)) throw new OpsError('DATE_NOT_TODAY', '下载日期必须是当前北京时间日期');
  if (now < timestamp(`${date}T17:30:00+08:00`)) throw new OpsError('BEFORE_1730', '17:30后再下载完整当日原生卡，未连接浏览器');
}
function nativeURL(raw) {
  const url = trustedURL(raw, ['akaiagents.com'], /^\/share-images\//);
  if (url.search || url.hash) throw new OpsError('UNTRUSTED_DOWNLOAD_URL', '原生下载URL不能带未知参数');
  return url.href;
}
function sourceMetadata(id, text, title, date, allowHistorical = false, now = Date.now()) {
  const header = `${title || ''}\n${text.slice(0, 500)}`;
  const match = header.match(/(20\d{2})[-年](\d{1,2})[-月](\d{1,2})(?:日)?(?:[ T·]*(\d{2}):(\d{2}))?/);
  if (!match || text.trim().length < 200) throw new OpsError('CARD_NOT_READY', `${id}日期或完整内容未就绪`);
  const reportDate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  if (timestamp(`${reportDate}T00:00:00+08:00`) === null || reportDate > date || (!allowHistorical && reportDate !== date)) throw new OpsError('REPORT_DATE_MISMATCH', `${id}实际报告日期${reportDate}与本次要求不符`);
  if (id === 'battle' && !header.includes('收盘')) throw new OpsError('NOT_POSTCLOSE', '作战卡必须是收盘版');
  const reportAt = match[4] ? `${reportDate}T${match[4]}:${match[5]}:00+08:00` : null;
  if (reportAt && (timestamp(reportAt) === null || timestamp(reportAt) > now)) throw new OpsError('REPORT_TIME_INVALID', `${id}报告时间无效或未来`);
  let edition = null;
  if (id === 'domestic-news') {
    if (!reportAt || timestamp(reportAt) < timestamp(`${reportDate}T07:30:00+08:00`)) throw new OpsError('NEWS_NOT_READY', '新闻必须有07:30后或19:30后真实更新时间');
    edition = timestamp(reportAt) >= timestamp(`${reportDate}T19:30:00+08:00`) ? 'evening' : 'morning';
  }
  return { reportDate, reportAt, reportTimePrecision: reportAt ? 'minute' : 'day', edition, historical: reportDate !== date };
}
async function storedRecord(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function reuseDownloaded(record, { id, date, dest }) {
  if (record.id !== id || record.publicationDate !== date || path.resolve(record.path || dest) !== dest) throw new OpsError('DOWNLOAD_STATE_MISMATCH', '已有下载状态与日期/路径不同，不能覆盖');
  nativeURL(record.downloadURL);
  const bytes = await fs.readFile(dest);
  if (hash(bytes) !== record.sha256 || !/^[a-f0-9]{64}$/.test(record.sha256 || '')) throw new OpsError('DOWNLOADED_FILE_CHANGED', '已下载文件散列不匹配，保留现场');
  return record;
}
async function fetchReceipt(record, { file, dest, request, now = () => Date.now() }) {
  const url = nativeURL(record.downloadURL);
  try {
    const response = await request.get(url, { timeout: 45000 });
    if (!response.ok()) throw new Error(`Native PNG HTTP ${response.status()}`);
    const bytes = await response.body();
    if (bytes.length < 24 || bytes.length > 30 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Native download did not return a PNG');
    const digest = hash(bytes);
    try { await fs.writeFile(dest, bytes, { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if (error.code !== 'EEXIST' || hash(await fs.readFile(dest)) !== digest) throw error;
    }
    Object.assign(record, { status: 'downloaded', path: dest, bytes: bytes.length,
      width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), sha256: digest, downloadedAt: new Date(now()).toISOString() });
    await writeJSON(file, record);
    return record;
  } catch (error) {
    record.status = 'download_event_received_fetch_failed'; record.error = String(error.message).slice(0, 250);
    await writeJSON(file, record); throw error;
  }
}
async function downloadCard(page, { id, view, selector, date, baseDir, allowHistorical = false, now = () => Date.now() }) {
  const directory = path.join(baseDir, 'native-cards');
  const file = path.join(directory, `${id}-source.json`), dest = path.join(directory, `ak-${id}-${date.replaceAll('-', '')}-daily.png`);
  const old = await storedRecord(file);
  if (old) {
    if (old.status === 'downloaded') return reuseDownloaded(old, { id, date, dest });
    if (old.id === id && old.publicationDate === date && ['native_download_event_received', 'download_event_received_fetch_failed'].includes(old.status)) {
      return fetchReceipt(old, { file, dest, request: page.request, now });
    }
    throw new OpsError('DOWNLOAD_RECONCILE_REQUIRED', `${id}已有未核验点击状态，不能再次点击原生下载`, 2);
  }
  await page.locator(`.nav-btn[data-view="${view}"]`).click();
  if (id === 'domestic-news') await page.locator('#newsPaneSwitch button[data-pane="domestic"]').click();
  const card = page.locator(selector);
  await card.waitFor({ state: 'visible', timeout: 15000 });
  const ready = await until(async () => {
    await assertNoChallenge(page);
    const buttons = card.locator('button.share-btn:visible');
    if (await buttons.count() !== 1) return null;
    const button = buttons.first(), text = await card.innerText();
    try {
      const buttonTitle = await button.getAttribute('data-share-title');
      const metadata = sourceMetadata(id, text, buttonTitle, date, allowHistorical, now());
      const buttonURL = await button.getAttribute('data-share-url');
      nativeURL(new URL(buttonURL, 'https://akaiagents.com').href);
      return { button, text, buttonTitle, buttonURL, metadata };
    } catch (error) { if (['CARD_NOT_READY', 'REPORT_DATE_MISMATCH', 'NEWS_NOT_READY'].includes(error.code)) return null; throw error; }
  }, { timeout: 20000, interval: 500, code: 'CARD_NOT_READY', label: `${id}实际报告未完整就绪，未点击下载` });
  await card.screenshot({ path: path.join(baseDir, 'evidence', `${id}-card.png`) });
  const record = { id, publicationDate: date, at: new Date(now()).toISOString(), cardText: ready.text,
    buttonTitle: ready.buttonTitle, buttonURL: ready.buttonURL, ...ready.metadata,
    nativeDownload: true, downloadMethod: 'website_native_button_once_then_GET_its_exact_download_URL', status: 'native_click_reserved' };
  const reserve = await fs.open(file, 'wx', 0o600);
  try { await reserve.writeFile(JSON.stringify(record, null, 2)); await reserve.sync(); } finally { await reserve.close(); }
  // Persist a reservation before the one native click. Attach both promise handlers immediately.
  try {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 45000 }), ready.button.click()]);
    record.downloadURL = nativeURL(download.url()); record.originalFilename = download.suggestedFilename();
    record.status = 'native_download_event_received'; await writeJSON(file, record);
  } catch (error) {
    record.status = 'unknown_after_native_click'; record.error = String(error.message).split('\n')[0].slice(0, 250);
    await writeJSON(file, record); throw error;
  }
  return fetchReceipt(record, { file, dest, request: page.request, now });
}
async function downloadPackage(context, { date, baseDir, allowHistorical = false, now = () => Date.now() }) {
  checkRunDate(date, now());
  await fs.mkdir(path.join(baseDir, 'native-cards'), { recursive: true });
  await fs.mkdir(path.join(baseDir, 'evidence'), { recursive: true });
  const page = await context.newPage(); page.setDefaultTimeout(15000); await page.bringToFront();
  let success = false;
  try {
    await page.goto('https://akaiagents.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await assertNoChallenge(page); await page.locator('.nav-btn[data-view="klinechat"]').waitFor({ state: 'visible', timeout: 20000 });
    const records = [];
    for (const [id, view, selector] of CARDS) {
      const result = await downloadCard(page, { id, view, selector, date, baseDir, allowHistorical, now });
      records.push(result); await writeJSON(path.join(baseDir, 'native-cards', 'manifest.json'), records);
    }
    success = true;
    return { status: 'ok', date, manifest: path.join(baseDir, 'native-cards', 'manifest.json'),
      cards: records.map(({ id, reportDate, reportAt, edition, path: file, sha256 }) => ({ id, reportDate, reportAt, edition, path: file, sha256 })),
      published: false, visualReviewStillRequired: true };
  } finally { if (success) await page.close(); }
}
module.exports = { checkRunDate, sourceMetadata, reuseDownloaded, fetchReceipt, downloadCard, downloadPackage };

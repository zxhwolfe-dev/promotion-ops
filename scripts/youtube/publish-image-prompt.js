'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { withBrowser } = require('../../lib/cdp');
const { writeOnce, writeJSON, withLock } = require('../../lib/state');
const { insertEditorText } = require('../../lib/editor-text');
const { inspectMedia } = require('../../lib/campaign-media');
const { loadImagePromptPost } = require('../../lib/image-prompt-post');
const BASE = '/home/zxhwolfe/creative_work';
const OWNER = 'https://www.youtube.com/channel/UCPOdZVHyFUCS1_P1GggqMtA/posts';
const REGISTRY = BASE + '/promotion-media-registry.json';
const norm = value => value.replace(/\s+/g, ' ').trim();
const evidence = (draft, name) => path.join(draft.evidenceDirectory, name + '.json');

async function ownerPage(context) {
  const matches = context.pages().filter(p => p.url() === OWNER);
  if (matches.length > 1) throw new Error('Ambiguous owner page');
  const page = matches[0] || await context.newPage();
  await page.bringToFront();
  if (!matches.length) await page.goto(OWNER, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('ytd-backstage-post-thread-renderer').first().waitFor({ timeout: 30000 });
  const body = await page.locator('body').innerText();
  if (!body.includes('@useaistation') || !body.includes('自定义频道')) throw new Error('YouTube owner not verified');
  return page;
}
async function imageProof(page, draft) {
  const images = await page.locator('ytd-backstage-post-dialog-renderer img').evaluateAll(es => es
    .filter(e => e.getClientRects().length && e.complete && e.naturalWidth >= 800)
    .map(e => ({ url: e.currentSrc, width: e.naturalWidth, height: e.naturalHeight })));
  const unique = [...new Map(images.map(x => [x.url, x])).values()];
  if (unique.length !== draft.assets.length || !draft.assets.every(a => unique.some(x => x.width === a.width && x.height === a.height))) {
    throw new Error('Native prepared image count or dimensions differ');
  }
  return unique;
}
async function prepare(context, draft) {
  const file = evidence(draft, 'prepared');
  if (fs.existsSync(file)) throw new Error('Preparation exists; inspect current draft without uploading again');
  const records = JSON.parse(fs.readFileSync(REGISTRY));
  const media = await inspectMedia(draft.assets, { channel: 'youtube',
    titles: records.map(x => x?.title).filter(Boolean), records });
  if (media.issues.length) throw new Error('Reused or invalid image: ' + media.issues.map(x => x.code).join(','));
  const page = await ownerPage(context);
  if (await page.locator('ytd-backstage-post-thread-renderer').filter({ hasText: draft.title }).count()) throw new Error('Matching post exists; reconcile');
  const editor = page.locator('#contenteditable-root[contenteditable=true]:visible');
  if (await editor.count() && (await editor.innerText()).trim()) throw new Error('Preserve existing draft');
  await writeJSON(file, { at: new Date().toISOString(), status: 'preparing_native_draft_do_not_reupload', id: draft.id, assets: draft.assets });
  const choose = page.getByText('从你的计算机中选择', { exact: true });
  if (!await choose.isVisible().catch(() => false)) await page.getByRole('button', { name: '添加图片', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), choose.click()]);
  await chooser.setFiles(draft.assets.map(a => ({ name: path.basename(a.path),
    mimeType: /\.webp$/i.test(a.path) ? 'image/webp' : /\.png$/i.test(a.path) ? 'image/png' : 'image/jpeg', buffer: fs.readFileSync(a.path) })));
  await editor.waitFor({ timeout: 30000 });
  if ((await editor.innerText()).trim()) throw new Error('Preserve restored nonempty editor');
  await insertEditorText(page, editor, draft.text);
  const images = await imageProof(page, draft);
  const result = { at: new Date().toISOString(), status: 'native_draft_ready_not_published', id: draft.id,
    text: await editor.innerText(), images, assets: draft.assets, ownerURL: page.url(),
    historySource: REGISTRY, historyRecordsChecked: records.length,
    submitEnabled: await page.getByRole('button', { name: '发布', exact: true }).filter({ visible: true }).isEnabled() };
  await page.screenshot({ path: path.join(draft.evidenceDirectory, 'prepared.png') });
  await writeJSON(file, result);
  return { status: result.status, images: images.length, submitEnabled: result.submitEnabled };
}
async function submit(context, draft) {
  const ready = JSON.parse(fs.readFileSync(evidence(draft, 'prepared')));
  if (ready.status !== 'native_draft_ready_not_published' || ready.id !== draft.id) throw new Error('Prepared evidence missing');
  const page = await ownerPage(context), editor = page.locator('#contenteditable-root[contenteditable=true]:visible');
  if (norm(await editor.innerText()) !== norm(draft.text)) throw new Error('Native caption differs');
  if (!norm(await page.locator('body').innerText()).includes('公开范围： 公开')) throw new Error('Native public visibility not verified');
  await imageProof(page, draft);
  return writeOnce({ kind: 'youtube.image-prompt', account: 'UCPOdZVHyFUCS1_P1GggqMtA',
    id: draft.id, text: draft.text, images: draft.assets.map(a => a.sha256) }, async ({ operationId, submit: click }) => {
    await withLock('media-registry:' + REGISTRY, async () => {
      const rows = JSON.parse(fs.readFileSync(REGISTRY));
      const checked = await inspectMedia(draft.assets, { channel: 'youtube', records: rows,
        titles: rows.map(x => x?.title).filter(Boolean) });
      if (checked.issues.length) throw new Error('Media became used or unknown after preparation');
      await writeJSON(REGISTRY, [...rows, ...draft.assets.map(a => ({ ...a, channel: 'youtube', operationId,
        outcome: 'reserved', at: new Date().toISOString(), sourceGalleryId: draft.sourceGalleryId || null,
        origin: draft.origin, evidence: evidence(draft, 'prepared') }))]);
    });
    await writeJSON(evidence(draft, 'submit'), { at: new Date().toISOString(), status: 'reserved_single_native_submit', id: draft.id });
    await click(() => page.getByRole('button', { name: '发布', exact: true }).filter({ visible: true }).click());
    await writeJSON(evidence(draft, 'submit'), { at: new Date().toISOString(), status: 'submitted_requires_readback', id: draft.id });
    const card = page.locator('ytd-backstage-post-thread-renderer').filter({ hasText: draft.title });
    await card.waitFor({ timeout: 45000 });
    if (await card.count() !== 1) throw new Error('Ambiguous submitted post');
    const link = card.locator('a[href*="/post/"]').first();
    const url = await link.evaluate(e => e.href);
    if (!/^https:\/\/www\.youtube\.com\/post\/[A-Za-z0-9_-]+$/.test(url)) throw new Error('Native permalink absent');
    await writeJSON(evidence(draft, 'native-sent'), { at: new Date().toISOString(), url, text: await card.innerText() });
    // The operation remains unknown until independent permalink verification completes.
    const verified = await verify(context, draft, url);
    await withLock('media-registry:' + REGISTRY, async () => {
      const rows = JSON.parse(fs.readFileSync(REGISTRY));
      for (const row of rows) if (row.operationId === operationId) Object.assign(row, {
        outcome: 'published', evidenceUrl: verified.url, evidence: evidence(draft, 'permalink'),
        verifiedAt: new Date().toISOString(), liveVerification: true });
      await writeJSON(REGISTRY, rows);
    });
    return verified;
  });
}
async function verify(context, draft, url) {
  if (!/^https:\/\/www\.youtube\.com\/post\/[A-Za-z0-9_-]+$/.test(url)) throw new Error('Expected native YouTube post permalink');
  const page = await context.newPage();
  await page.bringToFront();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const post = page.locator('ytd-backstage-post-renderer').filter({ hasText: draft.title });
  await post.waitFor({ timeout: 30000 });
  if (await post.count() !== 1) throw new Error('Independent original ambiguous');
  const more = post.getByRole('button', { name: '了解详情', exact: true });
  if (await more.count()) await more.click();
  const text = await post.innerText(), owner = await post.locator('a[href*="@useaistation"]').count();
  if (!owner || !draft.promptParts.every(p => norm(text).includes(norm(p)))) throw new Error('Original owner or complete prompt differs');
  const attachment = post.locator('ytd-backstage-image-renderer:visible');
  if (await attachment.count() !== 1) throw new Error('Native image attachment not unique');
  await attachment.scrollIntoViewIfNeeded();
  const image = attachment.locator('img:visible');
  await image.waitFor({ timeout: 20000 });
  const deadline = Date.now() + 20000;
  while (!await image.evaluate(e => e.complete && e.naturalWidth >= 600 && e.naturalHeight > 0)) {
    if (Date.now() >= deadline) throw new Error('Native image still loading; reconcile without resubmitting');
    await page.waitForTimeout(300);
  }
  const images = await attachment.locator('img:visible').evaluateAll(es => es.filter(e => e.complete && e.naturalWidth >= 600)
    .map(e => ({ url: e.currentSrc, width: e.naturalWidth, height: e.naturalHeight })));
  if (images.length !== draft.assets.length) throw new Error('Original images differ');
  if (Math.abs(images[0].width / images[0].height - draft.assets[0].width / draft.assets[0].height) > 0.02) throw new Error('Published image aspect differs');
  const record = { at: new Date().toISOString(), status: 'published_native_owner_and_permalink_verified', url,
    title: draft.title, text, images, origin: draft.origin, promptSourceEvidence: draft.promptSourceEvidence,
    operatorReadbackMayAffectCounts: true, humanVisitors: null, conversions: null };
  await writeJSON(evidence(draft, 'permalink'), record);
  await page.screenshot({ path: path.join(draft.evidenceDirectory, 'permalink.png') });
  await page.close();
  return { status: 'verified', url, evidence: { kind: 'native_original_author_full_prompt_images', path: evidence(draft, 'permalink') } };
}
async function main(args = process.argv.slice(2)) {
  if (args.length !== 2 || !['prepare', 'submit', 'verify'].includes(args[0])) throw new Error('Usage: publish-image-prompt.js <prepare|submit|verify> <local-draft.json>');
  const draft = loadImagePromptPost(args[1]);
  if (draft.assets.length !== 1) throw new Error('This native YouTube path is validated for one image; multi-image publication is not enabled');
  return withBrowser(context => args[0] === 'prepare' ? prepare(context, draft) : args[0] === 'submit' ? submit(context, draft)
    : verify(context, draft, JSON.parse(fs.readFileSync(evidence(draft, 'native-sent'))).url));
}
if (require.main === module) main().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
module.exports = main;
module.exports.main = main;
module.exports.verify = verify;

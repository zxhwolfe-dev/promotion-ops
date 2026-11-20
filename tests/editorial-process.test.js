'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { executeReview, validateReviewConfig } = require('../lib/editorial-process');

const threadId = '11111111-1111-4111-8111-111111111111';

async function fixture(t, body) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'promotion-review-process-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const codex = path.join(directory, 'codex');
  const image = path.join(directory, 'frame.png');
  await Promise.all([
    fs.writeFile(codex, '#!/usr/bin/env node\n' + body, { mode: 0o700 }),
    fs.writeFile(image, 'fixture'),
    fs.writeFile(path.join(directory, 'schema.json'), '{}'),
  ]);
  const config = validateReviewConfig({
    codex, workspace: directory, creativeRoot: directory, reviewRoot: directory,
    publisherStateRoot: directory, model: 'gpt-6.1-sol', effort: 'medium', maxMillis: 10000,
  });
  const request = { directory, prompt: 'Editorial review only', imagePaths: [image] };
  return { config, request };
}

test('an explicit review uses a fresh read-only process and the supplied attachment', async t => {
  const { config, request } = await fixture(t, `
    const fs = require('node:fs');
    const path = require('node:path');
    const args = process.argv.slice(2);
    if (args[args.indexOf('-s') + 1] !== 'read-only' || args.includes('resume') ||
        args.includes('--add-dir') || args[args.indexOf('--image') + 1] !== path.resolve('frame.png') ||
        process.env.PROMO_REVIEW_ONLY !== '1') process.exit(9);
    if (fs.readFileSync(0, 'utf8') !== 'Editorial review only') process.exit(10);
    fs.writeFileSync(args[args.indexOf('-o') + 1], JSON.stringify({ decision: 'approve' }));
    console.log(JSON.stringify({ type: 'thread.started', thread_id: '${threadId}' }));
    console.log(JSON.stringify({ type: 'turn.completed' }));
  `);
  const result = await executeReview(config, request);
  assert.equal(result.turnCompleted, true);
  assert.equal(result.threadId, threadId);
  assert.equal(result.final.decision, 'approve');
  assert.match(await fs.readFile(path.join(request.directory, 'events.jsonl'), 'utf8'), /turn.completed/);
});

test('exit zero and a final file without completed-turn evidence cannot approve', async t => {
  const { config, request } = await fixture(t, `
    const fs = require('node:fs');
    fs.writeFileSync(process.argv[process.argv.indexOf('-o') + 1], '{"decision":"approve"}');
    console.log(JSON.stringify({ type: 'thread.started', thread_id: '${threadId}' }));
  `);
  await assert.rejects(executeReview(config, request), /verified completed turn/);
});

test('review timeout stops its local process with no retry', async t => {
  const { config, request } = await fixture(t, 'setInterval(() => {}, 1000)');
  await assert.rejects(executeReview({ ...config, maxMillis: 150 }, request), /timed out/);
});

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { finished } = require('node:stream/promises');

const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

function validateReviewConfig(config) {
  for (const key of ['codex', 'workspace', 'creativeRoot', 'reviewRoot', 'publisherStateRoot']) {
    if (!path.isAbsolute(config?.[key] || '')) throw Error('Absolute ' + key + ' required');
  }
  if (!fs.existsSync(config.codex)) throw Error('Approved Codex CLI missing');
  if (config.model !== 'gpt-6.1-sol' || config.effort !== 'medium') {
    throw Error('Approved editorial reviewer model and effort required');
  }
  return config;
}

async function executeReview(config, { directory, prompt, imagePaths = [] }) {
  const args = [
    '--no-daemon', '-a', 'never', '-s', 'read-only', '-C', config.workspace,
    '-c', `model_reasoning_effort="${config.effort}"`, 'exec',
    '--output-schema', path.join(directory, 'schema.json'),
  ];
  for (const image of imagePaths) args.push('--image', image);
  const finalFile = path.join(directory, 'final.json');
  args.push('--model', config.model, '--json', '-o', finalFile, '-');

  const env = { ...process.env, PROMO_REVIEW_ONLY: '1' };
  env.PATH = path.dirname(config.codex) + path.delimiter + (env.PATH || '/usr/bin:/bin');
  delete env.CODEX_THREAD_ID;
  delete env.CODEX_SESSION_ID;
  const stdout = fs.createWriteStream(path.join(directory, 'events.jsonl'), { mode: 0o600 });
  const stderr = fs.createWriteStream(path.join(directory, 'stderr.log'), { mode: 0o600 });
  const child = spawn(config.codex, args, {
    cwd: config.workspace, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true,
  });
  let threadId, turnCompleted = false, failed = false, bytes = 0, pending = '', reason, escalation;
  const stop = message => {
    if (reason) return;
    reason = message;
    if (!child.pid) return;
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    escalation = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }, 5000);
  };
  const onInterrupt = () => stop('Editorial review interrupted');
  const onLogError = () => stop('Cannot record editorial review evidence');
  const timeout = setTimeout(() => stop('Editorial review timed out'), config.maxMillis ?? 7200000);
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onInterrupt);
  const logs = Promise.allSettled([finished(stdout), finished(stderr)]);
  stdout.on('error', onLogError);
  stderr.on('error', onLogError);
  child.stdout.setEncoding('utf8');
  const parse = line => {
    try {
      const event = JSON.parse(line);
      if (event.type === 'thread.started') threadId = event.thread_id;
      if (event.type === 'turn.completed') turnCompleted = true;
      if (event.type === 'turn.failed' || event.type === 'error') failed = true;
    } catch {}
  };
  child.stdout.on('data', chunk => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > MAX_OUTPUT_BYTES) return stop('Editorial review output exceeded limit');
    stdout.write(chunk);
    const lines = (pending + chunk).split('\n');
    pending = lines.pop();
    for (const line of lines) parse(line);
  });
  child.stderr.pipe(stderr, { end: false });
  child.stdin.on('error', () => {});
  let exitCode;
  try {
    exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
      child.stdin.end(prompt);
    });
  } finally {
    clearTimeout(timeout);
    clearTimeout(escalation);
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onInterrupt);
    stdout.end();
    stderr.end();
  }
  const logResults = await logs;
  if (pending) parse(pending);
  if (reason || exitCode !== 0 || !threadId || !turnCompleted || failed ||
      logResults.some(log => log.status === 'rejected')) {
    throw Error(reason || 'Codex did not produce a verified completed turn');
  }
  return { threadId, final: JSON.parse(await fsp.readFile(finalFile, 'utf8')), exitCode, turnCompleted };
}

module.exports = { executeReview, validateReviewConfig };

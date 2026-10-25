'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { loadImagePromptPost } = require('../lib/image-prompt-post');

function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-prompt-contract-'));
  try {
    const image = path.join(dir, 'example.png'), origin = path.join(dir, 'origin.json');
    const source = path.join(dir, 'source.json'), file = path.join(dir, 'draft.json');
    fs.writeFileSync(image, 'fixture-image-bytes');
    const sha = createHash('sha256').update(fs.readFileSync(image)).digest('hex');
    fs.writeFileSync(source, JSON.stringify({ actualPrompt: 'A moss-covered desk lamp in natural light.' }));
    fs.writeFileSync(origin, JSON.stringify({ source: 'Aitu curated gallery example; not generated in this session', sha256: sha }));
    const draft = { id: 'gallery-example', channel: 'youtube', kind: 'aitu_image_and_prompt', language: 'en',
      title: 'A moss lamp', text: 'A moss lamp\nA moss-covered desk lamp in natural light.\nAI-generated gallery example.',
      qualityVerified: true, promptParts: ['A moss-covered desk lamp in natural light.'],
      promptSourceEvidence: source, originEvidence: origin, origin: 'gallery_example_not_current_generation',
      evidenceDirectory: path.join(dir, 'evidence'), assets: [{ id: 'gallery-source-id', title: 'Moss lamp', path: image, sha256: sha, width: 1200, height: 900 }] };
    const save = () => fs.writeFileSync(file, JSON.stringify(draft));
    save(); fn({ draft, file, save, dir, origin });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('complete original prompt and recorded image form one verifiable package', () => fixture(({ file }) => {
  assert.equal(loadImagePromptPost(file).id, 'gallery-example');
}));
test('unverified rewritten prompt cannot be presented as the original', () => fixture(({ draft, file, save }) => {
  draft.promptParts[0] = 'An invented replacement prompt.';
  draft.text += '\n' + draft.promptParts[0]; save();
  assert.throws(() => loadImagePromptPost(file), /match both source evidence/);
}));
test('leaving the actual prompt out of the public copy blocks preparation', () => fixture(({ draft, file, save }) => {
  draft.text = draft.title + '\nAn attractive picture without its promised prompt.'; save();
  assert.throws(() => loadImagePromptPost(file), /match both source evidence/);
}));
test('gallery provenance cannot become a claimed native operator generation', () => fixture(({ draft, file, save }) => {
  draft.origin = 'native_aitu_generation'; save();
  assert.throws(() => loadImagePromptPost(file), /operator generation evidence/);
}));
test('each carousel image needs its own matching source, not just the first', () => fixture(({ draft, file, save, dir }) => {
  const second = path.join(dir, 'second.png'); fs.writeFileSync(second, 'different-image-bytes');
  draft.assets.push({ ...draft.assets[0], id: 'other-id', path: second,
    sha256: createHash('sha256').update(fs.readFileSync(second)).digest('hex') }); save();
  assert.throws(() => loadImagePromptPost(file), /differs from recorded source/);
}));

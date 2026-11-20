'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {sourceSentence,draftCard}=require('../scripts/radar/capture-daily');
test('automatic narration uses a whole published source sentence; it never truncates a long sentence',()=>{assert.equal(sourceSentence('This tool organizes your local notes. A second point.','en'),'This tool organizes your local notes.');assert.equal(sourceSentence('A'.repeat(400)+'.','en'),null);assert.equal(sourceSentence('该项目将会议录音转为便于检索的文字。第二个完整句子。','zh'),'该项目将会议录音转为便于检索的文字。');assert.equal(sourceSentence('没有完整句号的材料','zh'),null);});

test('.NET and decimals inside the source do not discard the beginning of a sentence',()=>{const s='Rea connects an AI agent to native binaries, JavaScript and .NET assemblies, returning evidence. Next sentence.';assert.equal(sourceSentence(s,'en'),'Rea connects an AI agent to native binaries, JavaScript and .NET assemblies, returning evidence.');assert.equal(sourceSentence('Tool version 1.2 processes complete native files. Next point.','en'),'Tool version 1.2 processes complete native files.');});

test('the first bilingual draft card starts its narration with sourced use and preserves the native rank', () => {
  for (const [lang, sentence, lead] of [
    ['zh', '把会议录音转成可搜索的文字稿。', '第3名，Demo。'],
    ['en', 'Turn meeting audio into a searchable transcript.', 'At rank 3, Demo. '],
  ]) {
    const card = { id: 'demo', headline: 'Demo', sentence, source: { lang, rank: 3 } };
    const opening = draftCard(card, true);
    assert.equal(opening.narration, sentence);
    assert.equal(opening.source.rank, 3);
    assert.equal(draftCard(card, false).narration, lead + sentence);
  }
});

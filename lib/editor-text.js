'use strict';
const { OpsError, normalize } = require('./ops');
const meaningfulLines = text => String(text).replace(/\r\n/g, '\n').split('\n').filter(line => line.trim()).map(line => line.normalize('NFC').trimEnd());
async function insertEditorText(page, editor, text) {
  await editor.click();
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Explicit line breaks go through the editor's native key handler. A single
    // Input.insertText(multiline) can collapse Markdown sections in custom editors.
    if (lines[i]) await page.keyboard.insertText(lines[i]);
    await page.waitForTimeout(120);
    if (i < lines.length - 1) await editor.press('Enter');
  }
  const after = await editor.evaluate(el => typeof el.value === 'string' ? el.value : el.innerText);
  const matches = lines.length > 1 ? JSON.stringify(meaningfulLines(after)) === JSON.stringify(meaningfulLines(text)) : normalize(after) === normalize(text);
  if (!matches) throw new OpsError('FILL_MISMATCH', '正文行结构或内容回读不一致，停止发布');
  return after;
}
module.exports = { insertEditorText };

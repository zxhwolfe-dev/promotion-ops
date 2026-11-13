'use strict';
const { OpsError, normalize } = require('./ops');
const meaningfulLines = text => String(text).replace(/\r\n/g, '\n').split('\n').filter(line => line.trim()).map(line => line.normalize('NFC').trimEnd());
async function insertEditorText(page, editor, text, { clearNativeIndent = false } = {}) {
  await editor.click();
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Explicit line breaks go through the editor's native key handler. A single
    // Input.insertText(multiline) can collapse Markdown sections in custom editors.
    if (lines[i]) await page.keyboard.insertText(lines[i]);
    await page.waitForTimeout(120);
    if (i < lines.length - 1) {
      await editor.press('Enter');
      if (clearNativeIndent) {
        // Some Markdown editors copy the previous line's indentation on Enter.
        // Our source already contains that indentation; remove only the copied
        // whitespace on this newly-created line before inserting the next line.
        await editor.press('Shift+Home');
        const prefix = await editor.evaluate(el => typeof el.value === 'string'
          ? el.value.slice(el.selectionStart, el.selectionEnd)
          : window.getSelection()?.toString() || '');
        if (prefix && !/^[\t ]+$/.test(prefix)) throw new OpsError('UNEXPECTED_EDITOR_PREFIX', '编辑器自动插入了非缩进内容，停止填入');
        if (prefix) await editor.press('Backspace');
        else await editor.press('ArrowRight');
      }
    }
  }
  const after = await editor.evaluate(el => typeof el.value === 'string' ? el.value : el.innerText);
  const matches = lines.length > 1 ? JSON.stringify(meaningfulLines(after)) === JSON.stringify(meaningfulLines(text)) : normalize(after) === normalize(text);
  if (!matches) throw new OpsError('FILL_MISMATCH', '正文行结构或内容回读不一致，停止发布');
  return after;
}
module.exports = { insertEditorText };

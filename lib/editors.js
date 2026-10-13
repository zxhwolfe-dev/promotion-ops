'use strict';
const { OpsError, choose } = require('./ops');
function editorSelectors(kind) {
  let config;
  try { config = JSON.parse(process.env.PROMO_EDITOR_SELECTORS || '{}'); }
  catch { throw new OpsError('INVALID_EDITOR_SELECTORS', 'PROMO_EDITOR_SELECTORS 须为平台到选择器数组的 JSON'); }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new OpsError('INVALID_EDITOR_SELECTORS', '编辑器配置须为对象');
  const defaults = { aliyun: ['.mditor textarea.textarea'] };
  const selectors = config[kind] ?? defaults[kind];
  if (!Array.isArray(selectors) || !selectors.length || selectors.length > 5 || selectors.some(s => typeof s !== 'string' || !s.trim() || s.length > 300 || /^(?:body|html|:root|\*)$/i.test(s.trim()))) {
    throw new OpsError('INVALID_EDITOR_SELECTORS', '编辑器选择器须为1–5个局部候选，需先核验当前页面');
  }
  return selectors;
}
async function chooseEditor(page, kind) {
  const editor = await choose(page, editorSelectors(kind).map(s => page.locator(s)), `${kind} 正文编辑器`);
  if (!await editor.evaluate(el => el.tagName === 'TEXTAREA' || el.isContentEditable)) throw new OpsError('EDITOR_NOT_EDITABLE', '候选不是 textarea 或可编辑正文，停止填充');
  return editor;
}
function isEmptyEditor(value) {
  return typeof value === 'string' && !value.replace(/[\s\u200B\u200C\u200D\u2060\uFEFF]/gu, '');
}
async function fillMonaco(page, body) {
  const result = await page.evaluate(({ body }) => {
    const models = window.monaco?.editor?.getModels() || [];
    if (models.length !== 1) return 'ambiguous';
    const model = models[0];
    if (model.getValue().replace(/[\s\u200B\u200C\u200D\u2060\uFEFF]/gu, '')) return 'draft';
    // Clear placeholder-only content through Monaco's model API, which fires its change event.
    model.setValue(body);
    return model.getValue().replace(/\r\n/g, '\n') === body.replace(/\r\n/g, '\n') ? 'ok' : 'mismatch';
  }, { body });
  if (result === 'ambiguous') throw new OpsError('MONACO_MODEL_AMBIGUOUS', '没有唯一的 Monaco 模型');
  if (result === 'draft') throw new OpsError('EXISTING_DRAFT', 'Monaco 已有草稿，拒绝覆盖', 3);
  if (result !== 'ok') throw new OpsError('FILL_MISMATCH', 'Monaco 正文回读不一致');
}
function editorProbeDOM() {
  return [...document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]')]
    .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
    .slice(0, 30).map(el => ({ tag: el.tagName.toLowerCase(), id: el.id, classes: [...el.classList].slice(0, 4),
      role: el.getAttribute('role'), contenteditable: el.isContentEditable,
      contentLength: String('value' in el ? el.value : el.textContent).length,
      candidateOnly: true }));
}
module.exports = { editorSelectors, chooseEditor, isEmptyEditor, fillMonaco, editorProbeDOM };

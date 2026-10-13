'use strict';
const { trustedURL } = require('./ops');
function csdnSuccessId(raw) {
  try {
    const url = trustedURL(raw, ['mp.csdn.net'], /^\/mp_blog\/creation\/success(?:\/\d+)?\/?$/);
    const pathId = url.pathname.match(/\/success\/(\d+)\/?$/)?.[1];
    const queryId = url.searchParams.get('articleId');
    if (pathId && queryId && pathId !== queryId) return null;
    const id = pathId || queryId;
    return id && /^\d+$/.test(id) ? id : null;
  } catch { return null; }
}
module.exports = { csdnSuccessId };

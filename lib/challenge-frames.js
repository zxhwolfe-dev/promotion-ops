'use strict';
// A passive reCAPTCHA branding badge is not an interactive challenge.
async function hasBlockingCaptchaFrame(page) {
  return page.locator('iframe[src*="captcha"]:visible').evaluateAll(frames => frames.some(frame => {
    const rect = frame.getBoundingClientRect();
    let source;
    try { source = new URL(frame.src); } catch { return true; }
    const badge = frame.closest('.grecaptcha-badge');
    const passiveBadge = badge && frame.title === 'reCAPTCHA' &&
      /^(?:www\.)?(?:google\.com|recaptcha\.net)$/.test(source.hostname) &&
      /^\/recaptcha\/(?:api2|enterprise)\/anchor$/.test(source.pathname) &&
      rect.width > 0 && rect.width <= 300 && rect.height > 0 && rect.height <= 70;
    return !passiveBadge;
  }));
}
// Cloudflare can serve a localized interstitial without a visible CAPTCHA frame.
// Match the short interstitial, not an article merely discussing verification.
function isSecurityInterstitial({ text, title = '', pathname = '' }) {
  if (/^\/cdn-cgi\/challenge-platform\//.test(pathname)) return true;
  if (typeof text !== 'string' || text.length > 4000) return false;
  const hasProvider = /Cloudflare|Ray ID:/i.test(text);
  const challenge = /(?:^|\n)\s*(?:正在进行安全验证|正在验证您是否是真人|验证您是真人|Performing security verification|Verifying you are human|Verify you are human)\s*[.!。！]?\s*(?:\n|$)/i.test(text);
  return hasProvider && (challenge || /^(?:Just a moment|Attention Required)[.!…\s|-]*$/i.test(title.trim()));
}
async function hasBlockingSecurityInterstitial(page) {
  const snapshot = await page.evaluate(() => ({
    text: (document.body?.innerText || '').slice(0, 4001),
    title: document.title, pathname: location.pathname,
  }));
  return isSecurityInterstitial(snapshot);
}
module.exports = { hasBlockingCaptchaFrame, hasBlockingSecurityInterstitial, isSecurityInterstitial };

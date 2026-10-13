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
module.exports = { hasBlockingCaptchaFrame };

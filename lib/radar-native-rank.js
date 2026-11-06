'use strict';

// Rank is scoped to the actual captured language/view, not another directory.
function validateNativeDailyRanks(images, captures, date, locale = 'en') {
  if (!Array.isArray(images) || !images.length || !Array.isArray(captures)) throw new Error('Native rank evidence required');
  const usedRanks = new Set();
  return images.map(image => {
    const matches = captures.filter(row => row.id === image.projectId);
    if (matches.length !== 1) throw new Error('Native project evidence is missing or ambiguous');
    const capture = matches[0], url = new URL(capture.url);
    const observed = new Date(capture.capturedAt);
    if (!['useaistation.com', 'aiworkstation.cn'].includes(url.hostname) ||
        url.pathname !== '/githubai/rankings/daily/' || url.searchParams.get('lang') !== locale ||
        capture.nativeScreenshot !== true || capture.alteredDOM !== false ||
        !Number.isFinite(observed.getTime()) || observed.getTime() > Date.now() ||
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(observed) !== date) {
      throw new Error('Native rank language, view, date or provenance differs');
    }
    const firstLine = String(capture.text || '').trim().split(/\r?\n/, 1)[0];
    const rank = /^\d+$/.test(firstLine) ? Number(firstLine) : NaN;
    if (!Number.isInteger(rank) || rank < 1 || rank > 100 || image.rank !== rank || usedRanks.has(rank)) {
      throw new Error('Published rank differs from the actual captured native card');
    }
    usedRanks.add(rank);
    return { projectId: image.projectId, rank, locale, sourceURL: capture.url, capturedAt: capture.capturedAt };
  });
}

module.exports = { validateNativeDailyRanks };

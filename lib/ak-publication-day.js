'use strict';
const { timestamp, localDay } = require('./daily-execution');

// Report dates describe the source; publication dates describe daily distribution.
function publicationDay(record) {
  if (typeof record?.publicationDate === 'string' &&
      timestamp(`${record.publicationDate}T00:00:00+08:00`) !== null) return record.publicationDate;
  const at = timestamp(record?.publishedAt);
  return at === null ? null : localDay(at);
}
function validNonTradingReuse(input) {
  const mode = input.nonTradingDayReuse;
  return input.tradingDay === false && mode?.mode === 'latest_trading_day' &&
    timestamp(`${mode.latestTradingDate}T00:00:00+08:00`) !== null &&
    mode.latestTradingDate < input.publicationDate &&
    typeof input.caption === 'string' && input.caption.includes('非交易日') &&
    input.caption.includes(mode.latestTradingDate);
}
function blocksReuse(input, record) {
  if (!validNonTradingReuse(input) || record.outcome !== 'published') return true;
  const day = publicationDay(record);
  // Unknown outcomes/dates stay blocking. A new date never clears an old unknown.
  return day === null || day >= input.publicationDate;
}
module.exports = { publicationDay, validNonTradingReuse, blocksReuse };

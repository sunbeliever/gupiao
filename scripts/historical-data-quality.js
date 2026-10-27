'use strict';
// Read-only quality gate. A price discontinuity is not a verified corporate action.
// Never infer a split/dividend and alter holdings from adjusted prices alone.
const Calendar = require('../assets/trading-calendar.js');
const Audit = require('../assets/audit-identity.js');
const finitePositive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
function auditDataset(data, {start, end, overnightDifferenceThreshold = 0.025} = {}) {
  if (!data || !data.histories || !data.raw || !Calendar.isSession(start) ||
      !Calendar.isSession(end) || start > end || !Number.isFinite(overnightDifferenceThreshold) ||
      overnightDifferenceThreshold <= 0 || overnightDifferenceThreshold > 0.1) throw Error('Invalid data audit request');
  const symbols = Object.keys(data.histories).sort();
  if (!symbols.length || Audit.hash(symbols) !== Audit.hash(Object.keys(data.raw).sort())) throw Error('Raw/HFQ universe mismatch');
  let calendar = null;
  const events = [];
  for (const symbol of symbols) {
    const h = data.histories[symbol], r = data.raw[symbol];
    if (!Array.isArray(h) || !h.length || !Array.isArray(r) || h.length !== r.length) throw Error('Missing paired histories: ' + symbol);
    const dates = h.map(b => b.date);
    if (calendar && Audit.hash(dates) !== Audit.hash(calendar)) throw Error('Unaligned universe calendar');
    calendar = dates;
    for (let i = 0; i < h.length; i++) {
      if (r[i].date !== h[i].date || !Calendar.isSession(h[i].date) ||
          (i && Calendar.nextSession(h[i - 1].date) !== h[i].date)) throw Error('Missing, duplicate or unordered session: ' + symbol);
      for (const b of [h[i], r[i]]) {
        if (!['open', 'high', 'low', 'close'].every(k => finitePositive(b[k])) ||
            !Number.isFinite(b.volume) || b.volume < 0 || b.low > Math.min(b.open, b.close) ||
            b.high < Math.max(b.open, b.close)) throw Error('Invalid OHLCV: ' + symbol + ' ' + b.date);
      }
      if (!i || h[i].date < start || h[i].date > end) continue;
      const adjustedReturn = h[i].open / h[i - 1].close - 1;
      const rawReturn = r[i].open / r[i - 1].close - 1;
      if (Math.abs(rawReturn - adjustedReturn) > overnightDifferenceThreshold) {
        events.push({symbol, date: h[i].date, previousRawClose: r[i - 1].close, rawOpen: r[i].open,
          rawOvernightReturn: rawReturn, adjustedOvernightReturn: adjustedReturn,
          returnDifference: rawReturn - adjustedReturn,
          adjustmentRatioBefore: h[i - 1].close / r[i - 1].close,
          adjustmentRatioAfter: h[i].open / r[i].open,
          reason: 'unreconciled_raw_adjusted_overnight_discontinuity',
          confirmedCorporateAction: false, automaticallyCorrected: false});
      }
    }
  }
  if (!calendar.includes(start) || !calendar.includes(end) || !calendar.includes(Calendar.previousSession(start))) throw Error('Requested period lacks opening/prior-session coverage');
  return {schema: 1, start, end, symbols, sessions: calendar.filter(d => d >= start && d <= end).length,
    dataHash: Audit.hash(data), overnightDifferenceThreshold, events,
    priceDiscontinuityGatePassed: events.length === 0,
    performanceStatus: events.length ? 'blocked_unreconciled_prices' : 'exploratory_only_no_large_discontinuity_detected',
    corporateActionCoverageVerified: false, firstAvailabilityVerified: false,
    investmentReady: false, promoted: false,
    limitations: ['This diagnostic is not proof that corporate actions are complete.',
      'Small dividends and additive adjusted-price conventions may not cross this threshold.',
      'Do not substitute HFQ prices for raw fills or multiply real shares by HFQ prices.',
      'Already inspected history is not a fresh blind test.']};
}
function requireComparable(audit) {
  if (!audit || audit.priceDiscontinuityGatePassed !== true || !Array.isArray(audit.events) || audit.events.length) {
    const e = Error('Unreconciled raw/HFQ events: economic promotion/comparison blocked');
    e.code = 'UNRECONCILED_PRICES'; throw e;
  }
  return true;
}
module.exports = {auditDataset, requireComparable};

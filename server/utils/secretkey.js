'use strict';
const { istParts } = require('../loanMath');

/** VK + DDMMYYYY (IST creation date) + order number (min. 2 digits)
 *  e.g. seq 3 on 12 Oct 2026 → VK1210202603 */
function makeSecretKey(seq, now = new Date()) {
  const [y, m, d] = istParts(now).date.split('-');
  return `VK${d}${m}${y}${String(seq).padStart(2, '0')}`;
}

module.exports = { makeSecretKey };
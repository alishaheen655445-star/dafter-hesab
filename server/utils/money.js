// -----------------------------------------------------------------------------
//  Money utilities — integer minor units (cents) to avoid float drift.
//  NEVER store money as float. All currencies here use a 100-subunit scale.
//
//  Supported currency codes (users pick one in Settings):
//    toman | rial | dinar | dollar | dirham | euro | afghani
//  The scale is the same for all — the code only affects the display label.
// -----------------------------------------------------------------------------

/** Convert a decimal string/number to integer minor units. */
const toMinor = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
};

/** Convert integer minor units to a decimal number (for display / JSON). */
const toMajor = (minor) => (Number(minor) || 0) / 100;

/** Format integer minor units as a fixed-2 string, e.g. "12500.75". */
const formatMinor = (minor) => toMajor(minor).toFixed(2);

module.exports = { toMinor, toMajor, formatMinor };

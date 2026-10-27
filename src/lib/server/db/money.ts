/**
 * Money is stored as INTEGER in the smallest unit this app prices in:
 *   INR → whole rupees (fees are rounded to the rupee), GBP/USD and others → pence/cents.
 * Convert only here, at the repository boundary; the app works in ordinary amounts.
 */
const WHOLE_UNIT = new Set(["INR", "JPY"]);
const scale = (currency: string) => (WHOLE_UNIT.has(currency) ? 1 : 100);

export const toDbAmount = (amount: number, currency: string) => Math.round(amount * scale(currency));
export const fromDbAmount = (stored: number, currency: string) => stored / scale(currency);
export const toDbAmountOrNull = (amount: number | null | undefined, currency: string) => (amount === null || amount === undefined ? null : toDbAmount(amount, currency));
export const fromDbAmountOrNull = (stored: number | null, currency: string) => (stored === null ? null : fromDbAmount(stored, currency));

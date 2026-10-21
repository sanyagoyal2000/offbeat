/**
 * Ticket pricing and booking fees (all "Demo fee": no real charge is made).
 * Fee rules come from the event's city: e.g. 5% + 18% GST in India, 5% elsewhere in the samples.
 */
import type { Category } from "./categories";
import type { FeeRule } from "./events";

export type Range = { min: number; max: number };

/** Sample price ranges for INR listings (per ticket). Music is split by scale via `musicScale`. */
export const INR_RANGES: Record<Category, Range> = {
  Music: { min: 799, max: 14999 },
  Movies: { min: 199, max: 899 },
  Comedy: { min: 699, max: 2499 },
  Theatre: { min: 799, max: 2999 },
  Performances: { min: 599, max: 1999 },
  "Workshops & classes": { min: 1499, max: 4500 },
  "Treks & outdoors": { min: 999, max: 3999 },
  Meetups: { min: 0, max: 799 },
  Kids: { min: 599, max: 1499 },
  Sports: { min: 999, max: 6000 },
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Fee per ticket. INR rounds to the rupee; other currencies to the cent. */
export function bookingFee(price: number, rule: FeeRule, currency: string): number {
  const fee = price * rule.rate * (1 + rule.taxRate);
  return currency === "INR" ? Math.round(fee) : round2(fee);
}

export function feeLabel(rule: FeeRule) {
  const pct = `${Math.round(rule.rate * 100)}%`;
  return rule.taxRate > 0 && rule.taxName ? `Demo fee (${pct} + ${rule.taxName})` : `Demo fee (${pct})`;
}

export type OrderCost = { quantity: number; unitPrice: number; feePerTicket: number; subtotal: number; fees: number; total: number };

export function orderCost(unitPrice: number, quantity: number, rule: FeeRule, currency: string): OrderCost {
  const feePerTicket = bookingFee(unitPrice, rule, currency);
  const subtotal = round2(unitPrice * quantity);
  const fees = round2(feePerTicket * quantity);
  return { quantity, unitPrice, feePerTicket, subtotal, fees, total: round2(subtotal + fees) };
}

/** Per-person cost including the fee, for budget checks. */
export const perPersonWithFee = (price: number, rule: FeeRule, currency: string) => round2(price + bookingFee(price, rule, currency));

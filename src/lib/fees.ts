/** Booking fee rules per city (demo values). Cities not listed use a plain 5% fee. */
import type { FeeRule } from "./events";

export const CITY_FEES: Record<string, FeeRule> = {
  "bengaluru-in": {
    "rate": 0.05,
    "taxRate": 0.18,
    "taxName": "GST"
  },
  "london-gb": {
    "rate": 0.05,
    "taxRate": 0,
    "taxName": null
  },
  "new-york-us": {
    "rate": 0.05,
    "taxRate": 0,
    "taxName": null
  }
};

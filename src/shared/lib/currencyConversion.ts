// Converts an MYR (base-currency) monetary amount into a project's display
// currency and rounds to 2dp — the single multiply-and-round used by both
// the Excel export and the in-app quotation table. Only pass monetary
// amounts (list price, cost, total, quote) — never margin (a ratio) or qty.
export function convertFromBase(amountInMyr: number, exchangeRate: number): number {
  return Math.round(amountInMyr * exchangeRate * 100) / 100
}

// Inverse of convertFromBase — converts an amount in the project's display
// currency back into MYR (base currency) for storage, e.g. when a user types
// a new catalog item's price in their project's currency.
export function convertToBase(amountInDisplayCurrency: number, exchangeRate: number): number {
  return Math.round((amountInDisplayCurrency / exchangeRate) * 100) / 100
}

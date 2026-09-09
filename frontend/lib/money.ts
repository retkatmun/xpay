/**
 * Money handling for XPay.
 *
 * Every amount in this app is a bigint in *base units* — the smallest indivisible
 * piece of the token. USDC is 6-decimal, so $1.00 is 1_000_000n.
 * Amounts are parsed from strings at the input boundary and formatted
 * back to strings at the display boundary; they are never JavaScript numbers in
 * between.
 *
 * FX rates come from the backend quote API — never hardcoded here.
 */

export const DECIMALS = 6;
const UNIT = 10n ** BigInt(DECIMALS);

/** Display precision for USD. Users enter and read cents, not micro-dollars. */
const USD_DP = 2;

/**
 * Parse user input into base units. Returns null for anything not a clean
 * non-negative amount.
 */
export function parseAmount(input: string): bigint | null {
  const cleaned = input.trim().replace(/,/g, "");
  if (cleaned === "") return null;
  if (!/^\d*(\.\d*)?$/.test(cleaned)) return null;

  const [whole = "", frac = ""] = cleaned.split(".");
  if (whole === "" && frac === "") return null;
  if (frac.length > DECIMALS) return null;

  const padded = frac.padEnd(DECIMALS, "0");
  return BigInt(whole || "0") * UNIT + BigInt(padded || "0");
}

/** Group an integer-valued string with thousands separators. */
function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format base units as a plain decimal string: 40500000n → "40.50".
 * Truncates rather than rounds — never show a user more money than they have.
 */
export function formatAmount(value: bigint, dp: number = USD_DP): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;

  const whole = abs / UNIT;
  const frac = abs % UNIT;

  const fracStr = frac.toString().padStart(DECIMALS, "0").slice(0, dp);
  const body = dp > 0 ? `${group(whole.toString())}.${fracStr}` : group(whole.toString());

  return negative ? `-${body}` : body;
}

/** "$40.50" */
export function formatUSD(value: bigint, dp: number = USD_DP): string {
  const negative = value < 0n;
  const body = formatAmount(negative ? -value : value, dp);
  return `${negative ? "-" : ""}$${body}`;
}

/**
 * Naira equivalent, computed in bigint so the conversion is exact.
 * Rate must be provided — never use a hardcoded default.
 */
export function toNGN(value: bigint, rate: number): bigint {
  return (value * BigInt(rate)) / UNIT;
}

/** "₦62,400" — rate must be provided from the backend quote */
export function formatNGN(value: bigint, rate: number): string {
  const naira = toNGN(value, rate);
  const negative = naira < 0n;
  const body = group((negative ? -naira : naira).toString());
  return `${negative ? "-" : ""}₦${body}`;
}

/** "₦1,560/$" — rate must be provided from the backend quote */
export function formatRate(rate: number): string {
  return `₦${group(String(rate))}/$`;
}

/**
 * Constrain raw keystrokes in an amount field.
 */
export function sanitizeAmountInput(raw: string): string {
  let next = raw.replace(/[^\d.]/g, "");

  const firstDot = next.indexOf(".");
  if (firstDot !== -1) {
    next =
      next.slice(0, firstDot + 1) + next.slice(firstDot + 1).replace(/\./g, "");
  }

  const [whole, frac] = next.split(".");
  if (frac !== undefined) {
    return `${whole.slice(0, 9)}.${frac.slice(0, USD_DP)}`;
  }
  return whole.slice(0, 9);
}

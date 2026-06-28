/**
 * Fixed-decimal formatting matching Java `DecimalFormat` / Python `%.10f`.
 *
 * Both Java (default `RoundingMode.HALF_EVEN`) and Python's float formatting
 * round the *exact* binary value of the double to the requested number of
 * fraction digits using round-half-to-even. `Number.prototype.toFixed` does not
 * (it rounds differently in several cases), so we reproduce HALF_EVEN exactly
 * via BigInt on the IEEE-754 decomposition. This must match byte-for-byte or
 * the `priority` strings — and thus the golden parity — diverge.
 */

/** Decompose |x| into integer mantissa `m` and exponent `e` with |x| = m * 2^e. */
function decompose(x: number): { m: bigint; e: number } {
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  dv.setFloat64(0, x);
  const hi = dv.getUint32(0);
  const lo = dv.getUint32(4);
  const rawExp = (hi >>> 20) & 0x7ff;
  const hiFrac = BigInt(hi & 0xfffff); // top 20 bits of the 52-bit fraction
  let mant = (hiFrac << 32n) | BigInt(lo >>> 0);
  let e: number;
  if (rawExp === 0) {
    e = -1074; // subnormal: value = mant * 2^-1074
  } else {
    mant |= 1n << 52n; // normal: value = (2^52 + frac) * 2^(rawExp-1075)
    e = rawExp - 1075;
  }
  return { m: mant, e };
}

/** Format `value` with exactly `digits` fraction digits, round-half-to-even. */
export function toFixedHalfEven(value: number, digits: number): string {
  if (!Number.isFinite(value)) return String(value);
  const neg = value < 0;
  const { m, e } = decompose(Math.abs(value));
  const P = 10n ** BigInt(digits);

  let scaled: bigint; // round_half_even(|value| * 10^digits)
  if (m === 0n) {
    scaled = 0n;
  } else if (e >= 0) {
    scaled = m * P * (1n << BigInt(e)); // exact integer, no rounding needed
  } else {
    const denom = 1n << BigInt(-e); // 2^(-e)
    const num = m * P;
    let q = num / denom;
    const twiceRem = (num % denom) * 2n;
    if (twiceRem > denom) {
      q += 1n;
    } else if (twiceRem === denom && q % 2n === 1n) {
      q += 1n; // exactly halfway -> round to even
    }
    scaled = q;
  }

  const intPart = scaled / P;
  const frac = (scaled % P).toString().padStart(digits, "0");
  const s = `${intPart.toString()}.${frac}`;
  return neg && scaled !== 0n ? `-${s}` : s;
}

/** Match Java `DecimalFormat` with 10 fixed fraction digits. */
export function fmtFreq(value: number): string {
  return toFixedHalfEven(value, 10);
}

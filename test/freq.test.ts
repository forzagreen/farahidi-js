/**
 * The `priority` field is a frequency formatted to exactly 10 fixed decimals
 * with round-half-to-even (Java `DecimalFormat` / Python `%.10f`). Expected
 * strings below come from Python's `format(v, ".10f")` (the parity oracle).
 */
import { describe, expect, it } from "vitest";

import { fmtFreq, toFixedHalfEven } from "../src/freq.js";

describe("fmtFreq (10-digit half-even, matches Python %.10f)", () => {
  const cases: Array<[number, string]> = [
    [0.0, "0.0000000000"],
    [1.0, "1.0000000000"],
    [0.0001100101, "0.0001100101"], // toolword constant
    [0.01100101, "0.0110010100"], // propernoun constant
    [(0.0000076531 + 0.0001829798 + 0.0007322669 + 0.0301805273 + 0.0526644252) / 5.0, "0.0167535705"],
    [0.123456789012345, "0.1234567890"],
    [1.00000000005, "1.0000000001"],
    [2.5e-10, "0.0000000003"],
    [1.5e-10, "0.0000000001"],
    [5e-11, "0.0000000001"],
    [3.5e-10, "0.0000000003"],
  ];

  it.each(cases)("fmtFreq(%d) === %s", (v, expected) => {
    expect(fmtFreq(v)).toBe(expected);
  });

  it("formats with arbitrary digit counts", () => {
    expect(toFixedHalfEven(0.5, 2)).toBe("0.50");
    expect(toFixedHalfEven(0, 4)).toBe("0.0000");
  });
});

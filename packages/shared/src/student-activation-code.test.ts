import { describe, expect, it } from "vitest";
import {
  encodeStudentActivationCode,
  normalizeStudentActivationCode,
} from "./student-activation-code.js";

describe("student activation card codes", () => {
  it("encodes exactly 80 bits into 16 canonical Crockford symbols", () => {
    expect(encodeStudentActivationCode(new Uint8Array(10))).toBe(
      "0000000000000000",
    );
    expect(encodeStudentActivationCode(new Uint8Array(10).fill(255))).toBe(
      "ZZZZZZZZZZZZZZZZ",
    );
    expect(() => encodeStudentActivationCode(new Uint8Array(9))).toThrow(
      /exactly 10 bytes/,
    );
    expect(() => encodeStudentActivationCode(new Uint8Array(11))).toThrow(
      /exactly 10 bytes/,
    );
  });

  it("ignores display separators and normalizes Crockford aliases", () => {
    expect(normalizeStudentActivationCode(" oi2j-3456 789a-bcde ")).toBe(
      "012J3456789ABCDE",
    );
    expect(
      normalizeStudentActivationCode("ＯＩ２Ｊ－３４５６ ７８９Ａ－ＢＣＤＥ"),
    ).toBe("012J3456789ABCDE");
  });

  it.each([
    "012J3456789ABCD",
    "012J3456789ABCDEF",
    "012J3456789ABCDU",
    "012J3456789ABCD!",
    "012J3456/789ABCDE",
  ])("rejects noncanonical input %s", (input) => {
    expect(normalizeStudentActivationCode(input)).toBeNull();
  });
});

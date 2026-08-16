import { describe, expect, it } from "vitest";
import { normalizeStudentNumber } from "./student-number.js";

describe("normalizeStudentNumber", () => {
  it("stores student identities in one uppercase canonical form", () => {
    expect(normalizeStudentNumber("  f202600123  ")).toBe("F202600123");
    expect(normalizeStudentNumber("daust-cs-25-0033")).toBe("DAUST-CS-25-0033");
  });
});

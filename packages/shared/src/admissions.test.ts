import { describe, expect, it } from "vitest";
import {
  ApplicationInput,
  FEE_STRUCTURE,
  referralDetailKind,
} from "./admissions.js";

describe("FEE_STRUCTURE", () => {
  it("keeps tuition per-semester as exactly half the annual figure", () => {
    expect(FEE_STRUCTURE.tuitionPerSemester * 2).toBe(FEE_STRUCTURE.tuitionPerYear);
  });
});

describe("ApplicationInput sanitization", () => {
  const base = { firstName: "Awa", lastName: "Diallo", email: "awa@example.com" };
  it("trims and lowercases emails", () => {
    const out = ApplicationInput.parse({
      ...base,
      email: "  AWA@Example.COM ",
      parentEmail: " Parent@Example.COM ",
    });
    expect(out.email).toBe("awa@example.com");
    expect(out.parentEmail).toBe("parent@example.com");
  });
  it("requires a country code on phones", () => {
    expect(
      ApplicationInput.safeParse({ ...base, phone: "+221 77 123 45 67" }).success,
    ).toBe(true);
    expect(ApplicationInput.safeParse({ ...base, phone: "77 123 45 67" }).success).toBe(
      false,
    );
    expect(ApplicationInput.safeParse({ ...base, parentPhone: "771234567" }).success).toBe(
      false,
    );
  });
  it("keeps the entrance score capped at 0–20", () => {
    expect(ApplicationInput.safeParse({ ...base, score: 21 }).success).toBe(false);
    expect(ApplicationInput.safeParse({ ...base, score: 17.5 }).success).toBe(true);
  });
});

describe("referralDetailKind", () => {
  it("asks for a name when referred by a person (EN + FR labels)", () => {
    expect(referralDetailKind("Friend / family")).toBe("person");
    expect(referralDetailKind("Ami / famille")).toBe("person");
    expect(referralDetailKind("Alumni referral")).toBe("person");
    expect(referralDetailKind("School counselor")).toBe("person");
    expect(referralDetailKind("Conseiller scolaire")).toBe("person");
  });
  it("asks for the site when found online", () => {
    expect(referralDetailKind("Website")).toBe("online");
    expect(referralDetailKind("Réseaux sociaux")).toBe("online");
    expect(referralDetailKind("DAUST open day")).toBe("online");
  });
  it("returns null when no follow-up applies", () => {
    expect(referralDetailKind(null)).toBe(null);
    expect(referralDetailKind("")).toBe(null);
    expect(referralDetailKind(undefined)).toBe(null);
  });
});

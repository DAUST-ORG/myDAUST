import { describe, expect, it } from "vitest";
import {
  RegistrationConfigurationValue,
  admissionAcademicYearStart,
  academicYearStart,
  normalizeRegistrationSemester,
  readRegistrationConfiguration,
  registrationClosedReason,
} from "./registration-configuration.js";

describe("readRegistrationConfiguration", () => {
  it("preserves legacy behavior only when the setting is absent", async () => {
    await expect(
      readRegistrationConfiguration({
        appSetting: { findUnique: async () => null },
      }),
    ).resolves.toEqual({
      state: "absent",
      mode: "legacy",
      termId: null,
      recommendationsEnabled: false,
    });
  });

  it("distinguishes explicit closure from an absent setting", async () => {
    await expect(
      readRegistrationConfiguration({
        appSetting: {
          findUnique: async () => ({
            valueJson: { termId: null, recommendationsEnabled: false },
          }),
        },
      }),
    ).resolves.toMatchObject({
      state: "valid",
      mode: "configured",
      termId: null,
      recommendationsEnabled: false,
    });
  });

  it("treats an enabled-but-closed persisted setting as invalid", async () => {
    expect(
      RegistrationConfigurationValue.safeParse({
        termId: null,
        recommendationsEnabled: true,
      }).success,
    ).toBe(false);
  });

  it("fails closed on malformed persisted JSON", async () => {
    await expect(
      readRegistrationConfiguration({
        appSetting: {
          findUnique: async () => ({ valueJson: { termId: 42 } }),
        },
      }),
    ).resolves.toEqual({
      state: "invalid",
      mode: "configured",
      termId: null,
      recommendationsEnabled: false,
    });
  });
});

describe("registration configuration helpers", () => {
  it("normalizes only supported semesters", () => {
    expect(normalizeRegistrationSemester(" spring ")).toBe("Spring");
    expect(normalizeRegistrationSemester("winter")).toBeNull();
    expect(normalizeRegistrationSemester(null)).toBeNull();
  });

  it("derives chronology from dates and falls back to a year label", () => {
    expect(
      academicYearStart({
        label: "ignored",
        startsOn: new Date("2026-08-20T00:00:00Z"),
      }),
    ).toBe(2026);
    expect(academicYearStart({ label: "2025–2026", startsOn: null })).toBe(
      2025,
    );
  });

  it("maps admission terms onto their academic-year start", () => {
    expect(admissionAcademicYearStart("Fall 2026")).toBe(2026);
    expect(admissionAcademicYearStart("Spring 2027")).toBe(2026);
    expect(admissionAcademicYearStart("Summer 2027")).toBe(2026);
    expect(admissionAcademicYearStart("2026–2027")).toBe(2026);
    expect(admissionAcademicYearStart("unknown")).toBeNull();
  });

  it("reports term closure in enforcement order", () => {
    const now = new Date("2026-09-02T12:00:00Z");
    expect(
      registrationClosedReason(
        {
          endDate: new Date("2026-09-01T00:00:00Z"),
          addDeadline: new Date("2026-08-20T00:00:00Z"),
        },
        now,
      ),
    ).toBe("term_ended");
    expect(
      registrationClosedReason(
        {
          endDate: new Date("2027-01-01T00:00:00Z"),
          addDeadline: new Date("2026-09-01T00:00:00Z"),
        },
        now,
      ),
    ).toBe("add_deadline_passed");
  });
});

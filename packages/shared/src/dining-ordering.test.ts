import { describe, expect, it } from "vitest";
import { dakarMinutesNow, orderingOpenNow } from "./dining.js";

describe("dakarMinutesNow", () => {
  it("reads the Dakar wall clock, not UTC", () => {
    // 10:30 UTC is 10:30 in Dakar year-round (UTC+0).
    expect(dakarMinutesNow(new Date("2026-09-05T10:30:00Z"))).toBe(630);
    expect(dakarMinutesNow(new Date("2026-09-05T00:00:00Z"))).toBe(0);
    expect(dakarMinutesNow(new Date("2026-09-05T23:59:00Z"))).toBe(1439);
  });
});

describe("orderingOpenNow", () => {
  const open = { weekendOrdering: true, orderCutoff: "11:00" };

  it("is open before the Dakar cutoff", () => {
    expect(orderingOpenNow(open, new Date("2026-09-05T10:59:00Z"))).toEqual({
      open: true,
      reason: null,
    });
  });

  it("closes at exactly the cutoff", () => {
    const closed = orderingOpenNow(open, new Date("2026-09-05T11:00:00Z"));
    expect(closed.open).toBe(false);
    expect(closed.reason).toContain("11:00");
  });

  it("stays closed until midnight rolls the Dakar day over", () => {
    expect(orderingOpenNow(open, new Date("2026-09-05T23:00:00Z")).open).toBe(
      false,
    );
    expect(orderingOpenNow(open, new Date("2026-09-06T08:00:00Z")).open).toBe(
      true,
    );
  });

  it("the weekend switch closes ordering regardless of time", () => {
    const closed = orderingOpenNow(
      { weekendOrdering: false, orderCutoff: "23:59" },
      new Date("2026-09-05T08:00:00Z"),
    );
    expect(closed).toEqual({
      open: false,
      reason: "Weekend ordering is currently closed",
    });
  });

  it("a 23:59 cutoff effectively disables the time gate", () => {
    expect(
      orderingOpenNow(
        { weekendOrdering: true, orderCutoff: "23:59" },
        new Date("2026-09-05T23:58:00Z"),
      ).open,
    ).toBe(true);
  });
});

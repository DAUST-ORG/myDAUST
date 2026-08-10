import { describe, expect, it } from "vitest";
import { isExactMaterialOrder } from "./academics.service.js";

describe("isExactMaterialOrder", () => {
  it("accepts each section material exactly once", () => {
    expect(isExactMaterialOrder(["b", "a"], ["a", "b"])).toBe(true);
  });

  it("rejects duplicate, missing, and foreign material ids", () => {
    expect(isExactMaterialOrder(["a", "a"], ["a", "b"])).toBe(false);
    expect(isExactMaterialOrder(["a"], ["a", "b"])).toBe(false);
    expect(isExactMaterialOrder(["a", "c"], ["a", "b"])).toBe(false);
  });
});

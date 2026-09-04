import assert from "node:assert/strict";
import test from "node:test";
import {
  facultyMaterialsHref,
  resolveFacultyMaterialsSectionId,
} from "../src/lib/faculty-materials-routing.ts";

test("faculty course links target the selected section's Materials page", () => {
  assert.equal(
    facultyMaterialsHref("section/one?active=true"),
    "/faculty/materials?section=section%2Fone%3Factive%3Dtrue",
  );
});

test("a valid URL selection survives hydration and course changes", () => {
  const sections = [{ id: "section-a" }, { id: "section-b" }];

  assert.equal(
    resolveFacultyMaterialsSectionId(sections, "section-b"),
    "section-b",
  );
  assert.equal(
    resolveFacultyMaterialsSectionId(sections, "section-a"),
    "section-a",
  );
});

test("an absent or unassigned URL selection uses the first assigned section", () => {
  const sections = [{ id: "section-a" }, { id: "section-b" }];

  assert.equal(resolveFacultyMaterialsSectionId(sections, null), "section-a");
  assert.equal(
    resolveFacultyMaterialsSectionId(sections, "not-the-teacher-section"),
    "section-a",
  );
  assert.equal(resolveFacultyMaterialsSectionId([], "section-a"), "");
});

import assert from "node:assert/strict";
import test from "node:test";
import { admissionsWorkspacePath } from "../src/app/admissions/workspace-path.ts";

test("keeps registrar applicant navigation inside the admin workspace", () => {
  assert.equal(
    admissionsWorkspacePath("/admin/admissions"),
    "/admin/admissions",
  );
  assert.equal(
    admissionsWorkspacePath("/admin/admissions/applicant-1/notes"),
    "/admin/admissions",
  );
});

test("keeps admissions officers in their dedicated workspace", () => {
  assert.equal(admissionsWorkspacePath("/admissions"), "/admissions");
  assert.equal(
    admissionsWorkspacePath("/admissions/applicant-1"),
    "/admissions",
  );
});

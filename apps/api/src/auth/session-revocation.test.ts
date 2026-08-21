import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Every write to Person.passwordHash must also bump sessionVersion, or a session signed with
 * the replaced password stays valid for the remaining life of its 7-day cookie. That is the
 * whole point of the column, and it is the kind of rule a new provisioning path breaks
 * silently -- so this asserts the population rather than any one call site.
 *
 * createFaculty is the one deliberate exemption: it writes the hash while creating the Person,
 * so there is no prior session to end.
 */
const EXEMPT = [
  // path -> why it needs no bump
  { file: "faculty/faculty.service.ts", reason: "createFaculty: brand-new Person" },
];

function ripgrep(pattern: string): string[] {
  const out = execFileSync(
    "grep",
    ["-rn", "--include=*.ts", pattern, "src"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  return out.split("\n").filter(Boolean);
}

describe("session revocation coverage", () => {
  it("bumps sessionVersion at every site that replaces a password", () => {
    const writes = ripgrep("passwordHash: await bcrypt.hash")
      .concat(ripgrep("data: { passwordHash"))
      .concat(ripgrep("^\\s*passwordHash,$"))
      .filter((l) => !l.includes(".test.ts"));

    expect(writes.length).toBeGreaterThan(0);

    // Each write site should sit within a few lines of a sessionVersion bump. Read the file
    // once per hit and look at the surrounding statement rather than the single line.
    const missing: string[] = [];
    for (const hit of writes) {
      const [file, lineNo] = hit.split(":");
      if (!file || !lineNo) continue;
      if (EXEMPT.some((e) => file.endsWith(e.file) && Number(lineNo) < 140)) continue;
      const body = execFileSync(
        "sed",
        [
          "-n",
          `${Math.max(1, Number(lineNo) - 6)},${Number(lineNo) + 8}p`,
          file,
        ],
        { encoding: "utf8" },
      );
      if (!body.includes("sessionVersion")) missing.push(hit);
    }

    expect(missing, `password writes with no sessionVersion bump:\n${missing.join("\n")}`).toEqual([]);
  });
});

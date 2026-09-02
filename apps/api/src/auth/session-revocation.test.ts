import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Every write to Person.passwordHash must also bump sessionVersion, or a session signed with
 * the replaced password stays valid for the remaining life of its 7-day cookie. That is the
 * whole point of the column, and it is exactly the rule a new provisioning path breaks
 * silently -- so this asserts the whole population rather than any one call site.
 *
 * A write that creates the Person in the same statement has no prior session to end. Those
 * mark themselves with SESSION_EXEMPT below, so the exemption is a deliberate, reviewable
 * line in the code being exempted rather than a list kept in this file.
 */
const SESSION_EXEMPT = "session-revocation-exempt";

function grep(pattern: string): string[] {
  try {
    return execFileSync("grep", ["-rn", "--include=*.ts", pattern, "src"], {
      cwd: process.cwd(),
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return []; // grep exits 1 when nothing matches
  }
}

describe("session revocation coverage", () => {
  it("bumps sessionVersion at every site that replaces a password", () => {
    const writes = [
      ...grep("passwordHash: await bcrypt.hash"),
      ...grep("data: { passwordHash"),
      ...grep("^ *passwordHash,$"),
    ].filter((line) => !line.includes(".test.ts"));

    expect(
      writes.length,
      "found no password writes at all — has the idiom changed?",
    ).toBeGreaterThan(3);

    const missing = writes.filter((hit) => {
      const [file, lineNo] = hit.split(":");
      if (!file || !lineNo) return false;
      const from = Math.max(1, Number(lineNo) - 8);
      const body = execFileSync(
        "sed",
        ["-n", `${from},${Number(lineNo) + 8}p`, file],
        {
          encoding: "utf8",
        },
      );
      return !body.includes("sessionVersion") && !body.includes(SESSION_EXEMPT);
    });

    expect(
      missing,
      `password writes with neither a sessionVersion bump nor a "${SESSION_EXEMPT}" note:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("timestamps the password installed for workbook-created students", () => {
    const source = execFileSync(
      "sed",
      [
        "-n",
        "/^async function createNewStudent(/,/^}/p",
        "src/finance/workbook-cutover.runner.ts",
      ],
      { encoding: "utf8" },
    );
    expect(source).toMatch(
      /passwordHash,\s+mustChangePassword: true,\s+passwordChangedAt: createdAt/,
    );
    expect(source).toMatch(/createdAt,\s+student:/);
  });
});

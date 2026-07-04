import { describe, expect, it } from "vitest";
import { signPass, verifyPass } from "./pass-token.js";

const SECRET = "campus-pass-secret";

describe("campus pass token", () => {
  it("round-trips a signed pass", () => {
    const token = signPass("stu_demo_aissatou", SECRET);
    expect(verifyPass(token, SECRET)).toBe("stu_demo_aissatou");
  });

  it("rejects a forged signature", () => {
    expect(verifyPass("stu_demo_aissatou.deadbeef", SECRET)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signPass("stu_demo_aissatou", "other-secret");
    expect(verifyPass(token, SECRET)).toBeNull();
  });

  it("rejects a swapped student id on a valid signature", () => {
    const token = signPass("stu_demo_aissatou", SECRET);
    const sig = token.split(".").pop()!;
    expect(verifyPass(`stu_mamadou.${sig}`, SECRET)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyPass("", SECRET)).toBeNull();
    expect(verifyPass("no-dot-here", SECRET)).toBeNull();
    expect(verifyPass(".justasig", SECRET)).toBeNull();
  });
});

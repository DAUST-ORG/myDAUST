import { describe, expect, it } from "vitest";
import { MessageAttachment, SendMessageInput } from "./comms.js";

const uploaded = "/uploads/6f1c8f2e-6a1e-4a4a-9b6d-1c2f3a4b5c6d.pdf";

describe("MessageAttachment.url", () => {
  it("accepts what the uploads endpoint returns", () => {
    expect(
      MessageAttachment.parse({ url: uploaded, name: "Transcript.pdf" }).url,
    ).toBe(uploaded);
    // An upload keeps no extension when the original name had none.
    expect(
      MessageAttachment.safeParse({
        url: "/uploads/6f1c8f2e-6a1e-4a4a-9b6d-1c2f3a4b5c6d",
        name: "scan",
      }).success,
    ).toBe(true);
  });

  it.each([
    ["an absolute external link", "https://evil.example/sso"],
    ["a protocol-relative link", "//evil.example/sso"],
    ["a javascript url", "javascript:alert(1)"],
    ["a data url", "data:text/html,<script>alert(1)</script>"],
    ["a path outside uploads", "/api/auth/logout"],
    ["traversal out of uploads", "/uploads/../api/health"],
    ["a nested path", "/uploads/site-media/promo.mp4"],
    ["an empty url", ""],
  ])("rejects %s", (_label, url) => {
    expect(
      MessageAttachment.safeParse({ url, name: "Transcript.pdf" }).success,
    ).toBe(false);
  });

  it("rejects an unbounded display name", () => {
    expect(
      MessageAttachment.safeParse({ url: uploaded, name: "a".repeat(256) })
        .success,
    ).toBe(false);
  });

  it("rejects a message whose attachment carries an external link", () => {
    expect(
      SendMessageInput.safeParse({
        body: "Your transcript is ready",
        attachments: [
          { url: "https://evil.example/sso", name: "Transcript_2026.pdf" },
        ],
      }).success,
    ).toBe(false);
  });
});

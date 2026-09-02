import assert from "node:assert/strict";
import test from "node:test";
import { parseSuccessfulApiResponse } from "../src/lib/api-response.ts";

test("normalizes a successful empty nullable response to null", () => {
  assert.equal(
    parseSuccessfulApiResponse<unknown>("", "application/octet-stream"),
    null,
  );
});

test("parses successful JSON and preserves non-JSON text", () => {
  assert.deepEqual(
    parseSuccessfulApiResponse<{ ok: boolean }>(
      '{"ok":true}',
      "application/json; charset=utf-8",
    ),
    { ok: true },
  );
  assert.equal(
    parseSuccessfulApiResponse<string>("ready", "text/plain"),
    "ready",
  );
});

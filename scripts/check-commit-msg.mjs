#!/usr/bin/env node
// scripts/check-commit-msg.mjs
//
// Validate a commit subject against the Conventional Commits convention
// used in AGENTS.md §16. The (AI-generated) suffix documented there is
// stripped before validation; the release: promotion prefix is accepted
// before the parser runs.
//
// Usage:
//   pnpm commit:check "feat(api): add foo"
//   pnpm commit:check "feat(api): add foo (AI-generated)"
//   pnpm commit:check "release: api v0.2.0"

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ALLOWED_TYPES = new Set([
  "feat",
  "fix",
  "chore",
  "docs",
  "refactor",
  "test",
  "perf",
  "style",
  "build",
  "ci",
  "release",
]);

const AI_SUFFIX_RE = /\s*\(AI-generated\)\s*$/i;
const RELEASE_PREFIX_RE = /^release:\s*/i;

function readSubject(arg) {
  if (arg && arg !== "-") {
    return arg;
  }
  // Read from stdin (git invokes hooks with the message on stdin).
  return readFileSync(0, "utf8").split(/\r?\n/, 1)[0] ?? "";
}

function stripAiSuffix(subject) {
  return subject.replace(AI_SUFFIX_RE, "");
}

function isReleasePromotion(subject) {
  return RELEASE_PREFIX_RE.test(subject);
}

function parseConventional(subject) {
  // `type(scope): subject` or `type: subject`
  const match = subject.match(/^([a-z]+)(?:\(([^)]+)\))?:\s+(.+)$/);
  if (!match) {
    return { ok: false, reason: "missing or malformed `type(scope): subject` prefix" };
  }
  const [, type, scope, rest] = match;
  if (!ALLOWED_TYPES.has(type)) {
    return { ok: false, reason: `unknown type \`${type}\` (allowed: ${[...ALLOWED_TYPES].join(", ")})` };
  }
  if (!rest || rest.trim().length === 0) {
    return { ok: false, reason: "subject after the colon is empty" };
  }
  return { ok: true, type, scope: scope ?? null, subject: rest.trim() };
}

function main() {
  const arg = process.argv[2];
  const raw = readSubject(arg).trim();
  if (!raw) {
    console.error("commit-msg: empty subject");
    process.exit(1);
  }

  // 1. release: prefix — accept as-is (AGENTS.md §16).
  if (isReleasePromotion(raw)) {
    process.exit(0);
  }

  // 2. Strip the (AI-generated) suffix (AGENTS.md §16) before parsing.
  const subject = stripAiSuffix(raw);

  const result = parseConventional(subject);
  if (!result.ok) {
    console.error(`commit-msg: ${raw}`);
    console.error(`  ${result.reason}. Use \`pnpm commit:check "feat(api): <subject>"\` for the expected shape.`);
    process.exit(1);
  }

  process.exit(0);
}

main();

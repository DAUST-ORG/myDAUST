// Tests for the GitHub sync seam. The service is pure — no Prisma, no NestJS
// DI — so we instantiate it directly and inject a fake `fetch` and a fake
// env.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HelpdeskGithubSync } from "./helpdesk.github.js";

beforeEach(() => {
  // env.ts requires DATABASE_URL; the GitHub service reads two extra keys.
  process.env.DATABASE_URL = "postgresql://localhost:5432/mydaust";
});

const baseTicket = {
  id: "ticket-1",
  title: "Need transcript",
  description: "Please send an official copy.",
  category: "academics",
  priority: "normal",
  routingType: "engineering",
  githubIssueNumber: null,
  githubIssueUrl: null,
  githubSyncState: "pending",
  githubSyncError: null,
};

function setEnv(repo?: string, token?: string) {
  process.env.HELPDESK_GITHUB_REPO = repo ?? "";
  process.env.HELPDESK_GITHUB_TOKEN = token ?? "";
}

describe("HelpdeskGithubSync.buildIssueBody", () => {
  it("prefixes the title, embeds ticket id + meta, and lists labels", () => {
    const sync = new HelpdeskGithubSync();
    const body = sync.buildIssueBody(baseTicket);
    expect(body.title).toBe("[helpdesk] Need transcript");
    expect(body.body).toContain("`ticket-1`");
    expect(body.body).toContain("**Category:** academics");
    expect(body.body).toContain("**Priority:** normal");
    expect(body.labels).toEqual(
      expect.arrayContaining(["it-backlog", "helpdesk", "in-app", "academics"]),
    );
  });
});

describe("HelpdeskGithubSync.isConfigured", () => {
  beforeEach(() => setEnv());
  afterEach(() => setEnv());

  it("reports false when env is missing", () => {
    setEnv();
    expect(new HelpdeskGithubSync().isConfigured()).toBe(false);
  });

  it("reports true when both repo and token are set", () => {
    setEnv("acme/helpdesk", "ghp_secret_token_value");
    expect(new HelpdeskGithubSync().isConfigured()).toBe(true);
  });
});

describe("HelpdeskGithubSync.sync", () => {
  beforeEach(() => setEnv());
  afterEach(() => setEnv());

  it("returns the existing sync state for non-engineering routing", async () => {
    const sync = new HelpdeskGithubSync();
    const result = await sync.sync({
      ...baseTicket,
      routingType: "support",
      githubSyncState: "linked",
      githubIssueNumber: 7,
      githubIssueUrl: "https://example/7",
    });
    expect(result.state).toBe("linked");
    expect(result.issueNumber).toBe(7);
    expect(result.issueUrl).toBe("https://example/7");
    expect(result.disabled).toBe(false);
  });

  it("returns pending + disabled when env is not configured", async () => {
    setEnv();
    const sync = new HelpdeskGithubSync();
    const result = await sync.sync({ ...baseTicket, routingType: "engineering" });
    expect(result.state).toBe("pending");
    expect(result.disabled).toBe(true);
    expect(result.error).toBeNull();
  });

  it("is idempotent for an already-linked ticket", async () => {
    setEnv("acme/helpdesk", "ghp_secret_token_value");
    const fetchMock = vi.fn();
    const sync = new HelpdeskGithubSync();
    const result = await sync.sync(
      {
        ...baseTicket,
        routingType: "engineering",
        githubSyncState: "linked",
        githubIssueNumber: 99,
        githubIssueUrl: "https://example/99",
      },
      fetchMock as unknown as typeof fetch,
    );
    expect(result.state).toBe("linked");
    expect(result.issueNumber).toBe(99);
    expect(result.issueUrl).toBe("https://example/99");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates an issue and returns linked state on success", async () => {
    setEnv("acme/helpdesk", "ghp_secret_token_value");
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        number: 42,
        html_url: "https://github.com/acme/helpdesk/issues/42",
      }),
    });
    const sync = new HelpdeskGithubSync();
    const result = await sync.sync(
      { ...baseTicket, routingType: "engineering" },
      fetchMock as unknown as typeof fetch,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0]!;
    const [url, init] = call as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/acme/helpdesk/issues");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer ghp_secret_token_value");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
    expect(result.state).toBe("linked");
    expect(result.issueNumber).toBe(42);
    expect(result.issueUrl).toBe("https://github.com/acme/helpdesk/issues/42");
    expect(result.error).toBeNull();
    expect(result.syncedAt).toBeInstanceOf(Date);
  });

  it("returns failed + upstream error when GitHub answers non-2xx", async () => {
    setEnv("acme/helpdesk", "ghp_secret_token_value");
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: "Bad credentials" }),
    });
    const sync = new HelpdeskGithubSync();
    const result = await sync.sync(
      { ...baseTicket, routingType: "engineering" },
      fetchMock as unknown as typeof fetch,
    );
    expect(result.state).toBe("failed");
    expect(result.error).toBe("Bad credentials");
  });

  it("returns failed when fetch throws", async () => {
    setEnv("acme/helpdesk", "ghp_secret_token_value");
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("ECONNRESET"));
    const sync = new HelpdeskGithubSync();
    const result = await sync.sync(
      { ...baseTicket, routingType: "engineering" },
      fetchMock as unknown as typeof fetch,
    );
    expect(result.state).toBe("failed");
    expect(result.error).toBe("ECONNRESET");
  });

  it("truncates long upstream error messages to 500 chars", async () => {
    setEnv("acme/helpdesk", "ghp_secret_token_value");
    const longMessage = "x".repeat(1200);
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: longMessage }),
    });
    const sync = new HelpdeskGithubSync();
    const result = await sync.sync(
      { ...baseTicket, routingType: "engineering" },
      fetchMock as unknown as typeof fetch,
    );
    expect(result.error?.length).toBe(500);
  });

  it("returns failed when GitHub response is missing number or html_url", async () => {
    setEnv("acme/helpdesk", "ghp_secret_token_value");
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ message: "no issue returned" }),
    });
    const sync = new HelpdeskGithubSync();
    const result = await sync.sync(
      { ...baseTicket, routingType: "engineering" },
      fetchMock as unknown as typeof fetch,
    );
    expect(result.state).toBe("failed");
    expect(result.error).toMatch(/number\/url/);
  });
});

import { describe, expect, it } from "vitest";
import {
  CreateHelpdeskCommentInput,
  CreateHelpdeskTicketInput,
  HELPDESK_CATEGORIES,
  HELPDESK_PRIORITIES,
  HELPDESK_ROUTING_TYPES,
  HELPDESK_STATUSES,
  HELPDESK_STATUS_TRANSITIONS,
  HelpdeskCategory,
  HelpdeskPriority,
  HelpdeskRoutingType,
  HelpdeskStatus,
  HELP_DESK_STATUS_LABELS,
  HELP_DESK_CATEGORY_LABELS,
  HELP_DESK_PRIORITY_LABELS,
  HELP_DESK_ROUTING_LABELS,
  UpdateHelpdeskTicketInput,
  isValidHelpdeskStatusTransition,
  type HelpdeskQueueItem,
  type HelpdeskTicketDetail,
  type HelpdeskTicketSummary,
} from "./helpdesk.js";

describe("HELPDESK_CATEGORIES", () => {
  it("lists the five approved categories in the approved order", () => {
    expect(HELPDESK_CATEGORIES).toEqual([
      "admissions",
      "academics",
      "student_affairs",
      "it_portal",
      "other",
    ]);
  });

  it("has a typed label for every category", () => {
    for (const category of HELPDESK_CATEGORIES) {
      expect(typeof HELP_DESK_CATEGORY_LABELS[category]).toBe("string");
      expect(HELP_DESK_CATEGORY_LABELS[category].length).toBeGreaterThan(0);
    }
  });

  it("rejects unknown category values via the Zod enum", () => {
    const parsed = HelpdeskCategory.safeParse("not_a_category");
    expect(parsed.success).toBe(false);
  });
});

describe("HELPDESK_PRIORITIES", () => {
  it("lists low, normal, high", () => {
    expect(HELPDESK_PRIORITIES).toEqual(["low", "normal", "high"]);
  });

  it("has a typed label for every priority", () => {
    for (const priority of HELPDESK_PRIORITIES) {
      expect(typeof HELP_DESK_PRIORITY_LABELS[priority]).toBe("string");
      expect(HELP_DESK_PRIORITY_LABELS[priority].length).toBeGreaterThan(0);
    }
  });

  it("defaults creation priority to normal", () => {
    const parsed = CreateHelpdeskTicketInput.parse({
      title: "Need my transcript",
      description: "Admissions said to request it here.",
      category: "academics",
    });
    expect(parsed.priority).toBe("normal");
  });
});

describe("HELPDESK_ROUTING_TYPES", () => {
  it("lists support, engineering", () => {
    expect(HELPDESK_ROUTING_TYPES).toEqual(["support", "engineering"]);
  });

  it("has a typed label for every routing type", () => {
    for (const routing of HELPDESK_ROUTING_TYPES) {
      expect(typeof HELP_DESK_ROUTING_LABELS[routing]).toBe("string");
      expect(HELP_DESK_ROUTING_LABELS[routing].length).toBeGreaterThan(0);
    }
  });

  it("rejects unknown routing values via the Zod enum", () => {
    const parsed = HelpdeskRoutingType.safeParse("devops");
    expect(parsed.success).toBe(false);
  });
});

describe("HELPDESK_STATUSES", () => {
  it("lists new, in_progress, waiting_on_requester, resolved", () => {
    expect(HELPDESK_STATUSES).toEqual([
      "new",
      "in_progress",
      "waiting_on_requester",
      "resolved",
    ]);
  });

  it("has a typed label for every status", () => {
    for (const status of HELPDESK_STATUSES) {
      expect(typeof HELP_DESK_STATUS_LABELS[status]).toBe("string");
      expect(HELP_DESK_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it("rejects unknown status values via the Zod enum", () => {
    const parsed = HelpdeskStatus.safeParse("archived");
    expect(parsed.success).toBe(false);
  });
});

describe("CreateHelpdeskTicketInput", () => {
  it("trims title and rejects too-short and too-long titles", () => {
    const short = CreateHelpdeskTicketInput.safeParse({
      title: "  ab  ",
      description: "hello",
      category: "other",
    });
    expect(short.success).toBe(false);

    const ok = CreateHelpdeskTicketInput.parse({
      title: "  Need help with portal login  ",
      description: "I cannot reset my password.",
      category: "it_portal",
    });
    expect(ok.title).toBe("Need help with portal login");

    const tooLong = CreateHelpdeskTicketInput.safeParse({
      title: "x".repeat(161),
      description: "hello",
      category: "other",
    });
    expect(tooLong.success).toBe(false);

    const longest = CreateHelpdeskTicketInput.parse({
      title: "x".repeat(160),
      description: "hello",
      category: "other",
    });
    expect(longest.title).toHaveLength(160);
  });

  it("trims description and rejects empty and oversized descriptions", () => {
    const empty = CreateHelpdeskTicketInput.safeParse({
      title: "A valid title here",
      description: "   ",
      category: "other",
    });
    expect(empty.success).toBe(false);

    const ok = CreateHelpdeskTicketInput.parse({
      title: "A valid title here",
      description: "  Please help me with this.  ",
      category: "other",
    });
    expect(ok.description).toBe("Please help me with this.");

    const tooLong = CreateHelpdeskTicketInput.safeParse({
      title: "A valid title here",
      description: "x".repeat(8001),
      category: "other",
    });
    expect(tooLong.success).toBe(false);

    const longest = CreateHelpdeskTicketInput.parse({
      title: "A valid title here",
      description: "x".repeat(8000),
      category: "other",
    });
    expect(longest.description).toHaveLength(8000);
  });

  it("accepts an optional studentId of at least one character", () => {
    const none = CreateHelpdeskTicketInput.parse({
      title: "A valid title here",
      description: "General question.",
      category: "other",
    });
    expect(none.studentId).toBeUndefined();

    const withStudent = CreateHelpdeskTicketInput.parse({
      title: "A valid title here",
      description: "On behalf of my child.",
      category: "academics",
      studentId: "student-42",
    });
    expect(withStudent.studentId).toBe("student-42");

    const emptyStudent = CreateHelpdeskTicketInput.safeParse({
      title: "A valid title here",
      description: "On behalf of my child.",
      category: "academics",
      studentId: "",
    });
    expect(emptyStudent.success).toBe(false);
  });

  it("rejects unknown category and unknown priority values", () => {
    const badCategory = CreateHelpdeskTicketInput.safeParse({
      title: "A valid title here",
      description: "Body text.",
      category: "billing",
    });
    expect(badCategory.success).toBe(false);

    const badPriority = CreateHelpdeskTicketInput.safeParse({
      title: "A valid title here",
      description: "Body text.",
      category: "other",
      priority: "urgent",
    });
    expect(badPriority.success).toBe(false);
  });

  it("priority defaults to normal when omitted", () => {
    const parsed = CreateHelpdeskTicketInput.parse({
      title: "A valid title here",
      description: "Body text.",
      category: "admissions",
    });
    expect(parsed.priority).toBe("normal");
  });
});

describe("UpdateHelpdeskTicketInput", () => {
  it("requires both a changed field and a positive baseRevision", () => {
    expect(UpdateHelpdeskTicketInput.safeParse({}).success).toBe(false);
    expect(
      UpdateHelpdeskTicketInput.safeParse({ baseRevision: 3 }).success,
    ).toBe(false);
  });

  it("accepts a field update with its base revision", () => {
    const parsed = UpdateHelpdeskTicketInput.parse({
      status: "in_progress",
      baseRevision: 4,
    });
    expect(parsed.status).toBe("in_progress");
    expect(parsed.baseRevision).toBe(4);
  });

  it("accepts explicit unassignment with a base revision", () => {
    const parsed = UpdateHelpdeskTicketInput.parse({
      assigneeId: null,
      baseRevision: 4,
    });
    expect(parsed.assigneeId).toBeNull();
    expect(parsed.baseRevision).toBe(4);
  });

  it("accepts multiple fields and preserves null assignment", () => {
    const parsed = UpdateHelpdeskTicketInput.parse({
      status: "in_progress",
      assigneeId: null,
      routingType: "support",
      baseRevision: 4,
    });
    expect(parsed.status).toBe("in_progress");
    expect(parsed.assigneeId).toBeNull();
    expect(parsed.routingType).toBe("support");
  });

  it("rejects an empty assigneeId and invalid revision values", () => {
    expect(
      UpdateHelpdeskTicketInput.safeParse({
        assigneeId: "",
        baseRevision: 1,
      }).success,
    ).toBe(false);
    for (const baseRevision of [0, -1, 1.5, "1"]) {
      expect(
        UpdateHelpdeskTicketInput.safeParse({
          status: "in_progress",
          baseRevision,
        }).success,
      ).toBe(false);
    }
  });
});

describe("CreateHelpdeskCommentInput", () => {
  it("trims the body and rejects empty or oversized bodies", () => {
    const empty = CreateHelpdeskCommentInput.safeParse({ body: "   " });
    expect(empty.success).toBe(false);

    const ok = CreateHelpdeskCommentInput.parse({ body: "  Public reply.  " });
    expect(ok.body).toBe("Public reply.");
    expect(ok.isInternal).toBe(false);

    const internal = CreateHelpdeskCommentInput.parse({
      body: "Staff note.",
      isInternal: true,
    });
    expect(internal.isInternal).toBe(true);

    const tooLong = CreateHelpdeskCommentInput.safeParse({
      body: "x".repeat(8001),
    });
    expect(tooLong.success).toBe(false);

    const longest = CreateHelpdeskCommentInput.parse({
      body: "x".repeat(8000),
    });
    expect(longest.body).toHaveLength(8000);
  });
});

describe("HELPDESK_STATUS_TRANSITIONS", () => {
  it("maps every status to an exact array of allowed next statuses", () => {
    expect(HELPDESK_STATUS_TRANSITIONS).toEqual({
      new: ["in_progress", "waiting_on_requester"],
      in_progress: ["waiting_on_requester", "resolved"],
      waiting_on_requester: ["in_progress", "resolved"],
      resolved: ["in_progress"],
    });
  });

  it("forbids direct new -> resolved", () => {
    expect(isValidHelpdeskStatusTransition("new", "resolved")).toBe(false);
  });

  it("forbids reopening a resolved ticket to anything other than in_progress", () => {
    expect(isValidHelpdeskStatusTransition("resolved", "new")).toBe(false);
    expect(
      isValidHelpdeskStatusTransition("resolved", "waiting_on_requester"),
    ).toBe(false);
    expect(isValidHelpdeskStatusTransition("resolved", "resolved")).toBe(
      false,
    );
    expect(isValidHelpdeskStatusTransition("resolved", "in_progress")).toBe(
      true,
    );
  });

  it("allows the remaining approved transitions", () => {
    expect(isValidHelpdeskStatusTransition("new", "in_progress")).toBe(true);
    expect(isValidHelpdeskStatusTransition("new", "waiting_on_requester")).toBe(
      true,
    );
    expect(
      isValidHelpdeskStatusTransition("in_progress", "waiting_on_requester"),
    ).toBe(true);
    expect(isValidHelpdeskStatusTransition("in_progress", "resolved")).toBe(
      true,
    );
    expect(
      isValidHelpdeskStatusTransition("waiting_on_requester", "in_progress"),
    ).toBe(true);
    expect(
      isValidHelpdeskStatusTransition("waiting_on_requester", "resolved"),
    ).toBe(true);
  });

  it("rejects every status staying on itself", () => {
    for (const status of HELPDESK_STATUSES) {
      expect(isValidHelpdeskStatusTransition(status, status)).toBe(false);
    }
  });

  it("rejects transitions from unknown statuses", () => {
    // The validator is bounded to the four known statuses.
    expect(
      isValidHelpdeskStatusTransition(
        "archived" as unknown as HelpdeskStatus,
        "in_progress",
      ),
    ).toBe(false);
    expect(
      isValidHelpdeskStatusTransition(
        "new",
        "archived" as unknown as HelpdeskStatus,
      ),
    ).toBe(false);
  });
});

describe("read-model interfaces", () => {
  it("summary has the requester-facing ticket fields", () => {
    const summary: HelpdeskTicketSummary = {
      id: "t1",
      title: "Need transcript",
      category: "academics",
      priority: "normal",
      status: "new",
      routingType: "support",
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
    };
    expect(summary.id).toBe("t1");
    expect(summary.status).toBe("new");
  });

  it("queue item adds assignee, resolvedAt, and studentId hints to the summary", () => {
    const item: HelpdeskQueueItem = {
      id: "t1",
      title: "Need transcript",
      category: "academics",
      priority: "normal",
      status: "in_progress",
      routingType: "support",
      requesterId: "p1",
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
    };
    expect(item.requesterId).toBe("p1");
    expect(item.assigneeId).toBeUndefined();
    expect(item.resolvedAt).toBeUndefined();
  });

  it("detail extends the queue item with comments, attachments, sync state, and assignee fields", () => {
    const detail: HelpdeskTicketDetail = {
      id: "t1",
      title: "Need transcript",
      description: "Please send an official copy.",
      category: "academics",
      priority: "normal",
      status: "new",
      routingType: "support",
      requesterId: "p1",
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
      comments: [],
      attachments: [],
      githubSyncState: "pending",
    };
    expect(detail.description).toBe("Please send an official copy.");
    expect(detail.githubSyncState).toBe("pending");
    expect(detail.githubIssueNumber).toBeUndefined();
    expect(detail.githubIssueUrl).toBeUndefined();
    expect(detail.githubSyncError).toBeUndefined();
    expect(detail.githubSyncedAt).toBeUndefined();
    expect(detail.resolvedAt).toBeUndefined();
  });
});
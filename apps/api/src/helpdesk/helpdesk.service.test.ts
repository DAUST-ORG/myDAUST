// Tests for the helpdesk service. The service is constructed with mocked
// Prisma, UploadsStorage, and HelpdeskGithubSync so each scenario is fully
// observable. Notification calls are optional — we always pass a fake.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HelpdeskService } from "./helpdesk.service.js";
import type { HelpdeskGithubSync } from "./helpdesk.github.js";
import type { NotificationsService } from "../notifications/notifications.service.js";
import type { MailDelivery } from "../notifications/mail-delivery.js";
import type { UploadsStorage } from "../uploads/uploads.storage.js";

beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://localhost:5432/mydaust";
});

// ---------------------------------------------------------------------------
// Typed mock helpers. Each builder returns a typed mock that satisfies the
// production type — `as unknown as PrismaService` is still used at the
// injection site because we are deliberately narrowing a real PrismaService
// to a test double.
// ---------------------------------------------------------------------------

type MockFn = ReturnType<typeof vi.fn>;

interface PrismaDoubles {
  helpdeskTicket: {
    findUnique: MockFn;
    findMany: MockFn;
    findFirst: MockFn;
    create: MockFn;
    update: MockFn;
    updateMany: MockFn;
    count: MockFn;
  };
  helpdeskComment: {
    create: MockFn;
    findMany: MockFn;
  };
  helpdeskAttachment: {
    create: MockFn;
    findUnique: MockFn;
  };
  guardianStudent: {
    findFirst: MockFn;
    findMany: MockFn;
  };
  person: {
    findUnique: MockFn;
    findMany: MockFn;
  };
  auditLog: { create: MockFn };
  $transaction: MockFn;
}

function makeTicketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ticket-1",
    requesterId: "person-student",
    attachments: [],
    title: "Need help",
    description: "Please assist.",
    category: "other",
    priority: "normal",
    status: "new",
    routingType: "support",
    githubIssueNumber: null,
    githubIssueUrl: null,
    githubSyncState: "pending",
    githubSyncError: null,
    githubSyncedAt: null,
    resolvedAt: null,
    version: 1,
    createdAt: new Date("2026-08-31T00:00:00Z"),
    updatedAt: new Date("2026-08-31T00:00:00Z"),
    comments: [],
    attachments: [],
    ...overrides,
  };
}

function makePrisma(rows: {
  ticket?: ReturnType<typeof makeTicketRow>;
  person?: { id: string; roles: string[]; student: { id: string } | null } | null;
  guardianStudent?: { id: string } | null;
}): PrismaDoubles {
  const ticket = rows.ticket ?? makeTicketRow();
  const person = rows.person ?? null;
  const link = rows.guardianStudent ?? null;
  const txRef = { current: null as PrismaDoubles | null };

  const base: PrismaDoubles = {
    helpdeskTicket: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === ticket.id ? ticket : null,
      ),
      findMany: vi.fn(async () => [ticket]),
      findFirst: vi.fn(async () => ticket),
      create: vi.fn(async () => ticket),
      update: vi.fn(async () => ticket),
      updateMany: vi.fn(async () => ({ count: 1 })),
      count: vi.fn(async () => 1),
    },
    helpdeskComment: {
      create: vi.fn(async () => ({
        id: "comment-1",
        ticketId: ticket.id,
        authorId: "person-1",
        body: "Hello",
        isInternal: false,
        createdAt: new Date(),
      })),
      findMany: vi.fn(async () => []),
    },
    helpdeskAttachment: {
      create: vi.fn(async () => ({
        id: "attach-1",
        ticketId: ticket.id,
        uploaderId: "person-1",
        url: "",
        storageKey: "helpdesk/abc.png",
        name: "screenshot.png",
        size: 1024,
        mimeType: "image/png",
        createdAt: new Date(),
      })),
      findUnique: vi.fn(async () => null),
    },
    guardianStudent: {
      findFirst: vi.fn(async () => link),
      findMany: vi.fn(async () => []),
    },
    person: {
      findUnique: vi.fn(async () => person),
      findMany: vi.fn(async () => []),
    },
    auditLog: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async () => null),
  };
  txRef.current = base;
  // $transaction calls the inner work with a fresh PrismaDoubles that behaves
  // like the same mock set; tests that need to inspect tx.* calls use
  // `txRef.current` to read them after the call.
  base.$transaction.mockImplementation(
    async (work: (tx: PrismaDoubles) => unknown) => work(base),
  );
  return base;
}

function makeGithub(overrides: {
  syncResult?: {
    state: "pending" | "linked" | "failed";
    issueNumber: number | null;
    issueUrl: string | null;
    syncedAt: Date | null;
    error: string | null;
    disabled: boolean;
  };
  isConfigured?: boolean;
} = {}) {
  return {
    sync: vi.fn(async () => overrides.syncResult ?? {
      state: "pending" as const,
      issueNumber: null,
      issueUrl: null,
      syncedAt: null,
      error: null,
      disabled: overrides.isConfigured === false,
    }),
    isConfigured: vi.fn(() => overrides.isConfigured ?? true),
  } as unknown as HelpdeskGithubSync;
}
interface UploadsMock {
  put: MockFn;
  putHelpdeskImage: MockFn;
  putSiteVideo: MockFn;
  streamSiteVideo: MockFn;
  get: MockFn;
  getHelpdeskImage: MockFn;
}

function makeUploads(): UploadsMock {
  return {
    put: vi.fn(async () => "abc.png"),
    putHelpdeskImage: vi.fn(async () => "helpdesk/abc.png"),
    putSiteVideo: vi.fn(async () => "site-media/abc.mp4"),
    streamSiteVideo: vi.fn(async () => ({
      body: Buffer.alloc(0),
      contentType: "video/mp4",
      size: 0,
      start: 0,
      end: 0,
      partial: false,
    })),
    get: vi.fn(async () => ({
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      contentType: "image/png",
    })),
    getHelpdeskImage: vi.fn(async () => ({
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      contentType: "image/png",
    })),
  };
}

function makeNotifications(overrides: {
  emitForAudienceImpl?: (
    recipients: ReadonlyArray<{
      personId: string;
      channels: ReadonlyArray<"in_app" | "email">;
    }>,
    template: { kind: string; title: string; body?: string; href?: string },
    mail: { deliver: (inputs: unknown) => Promise<unknown> },
  ) => Promise<{ created: number; mailed: number }>;
} = {}) {
  const emitForAudience = vi.fn(
    overrides.emitForAudienceImpl ??
      (async () => ({ created: 1, mailed: 0 })),
  );
  return {
    emit: vi.fn(async () => ({ created: 0 })),
    emitForAudience,
  } as unknown as NotificationsService;
}

function makeMail(overrides: { enabled?: boolean } = {}) {
  return {
    isEnabled: vi.fn(async () => overrides.enabled ?? false),
    deliver: vi.fn(async () => ({
      attempted: 0,
      sent: 0,
      deferred: 0,
      skipped: 1,
    })),
  } as unknown as MailDelivery;
}

interface ServiceHarness {
  service: HelpdeskService;
  prisma: PrismaDoubles;
  notify: ReturnType<typeof makeNotifications>;
  mail: ReturnType<typeof makeMail>;
}

function makeService(opts: {
  ticket?: ReturnType<typeof makeTicketRow>;
  person?: { id: string; roles: string[]; student: { id: string } | null } | null;
  link?: { id: string } | null;
  github?: HelpdeskGithubSync;
  notify?: ReturnType<typeof makeNotifications>;
  mail?: ReturnType<typeof makeMail>;
} = {}): ServiceHarness {
  const prisma = makePrisma({
    ticket: opts.ticket ?? makeTicketRow(),
    person: opts.person ?? null,
    guardianStudent: opts.link ?? null,
  });
  const notify = opts.notify ?? makeNotifications();
  const mail = opts.mail ?? makeMail();
  const service = new HelpdeskService(
    prisma as unknown as PrismaService,
    makeUploads() as unknown as UploadsStorage,
    opts.github ?? makeGithub(),
    notify,
    mail,
  );
  return { service, prisma, notify, mail };
}

const studentUser = {
  personId: "person-student",
  email: "student@daust.org",
  name: "Student One",
  roles: ["student"],
  studentId: "student-1",
};

const parentUser = {
  personId: "person-parent",
  email: "parent@daust.org",
  name: "Parent One",
  roles: ["parent"],
};

const registrarUser = {
  personId: "person-registrar",
  email: "registrar@daust.org",
  name: "Registrar One",
  roles: ["registrar"],
};

const adminUser = {
  personId: "person-admin",
  email: "admin@daust.org",
  name: "Admin One",
  roles: ["admin"],
};

// ---------------------------------------------------------------------------
// createTicket
// ---------------------------------------------------------------------------

describe("HelpdeskService.createTicket", () => {
  it("emits a staff notification after creation via emitForAudience", async () => {
    const notify = makeNotifications();
    const mail = makeMail({ enabled: false });
    const prisma = makePrisma({
      ticket: makeTicketRow(),
      person: { id: "p-staff-1", roles: ["registrar"], student: null },
    });
    prisma.person.findMany.mockResolvedValueOnce([
      { id: "p-staff-1" },
      { id: "p-staff-2" },
    ]);
    const svc = new HelpdeskService(
      prisma as unknown as PrismaService,
      makeUploads() as unknown as UploadsStorage,
      makeGithub(),
      notify,
      mail,
    );
    await svc.createTicket(registrarUser, {
      title: "General",
      description: "No student.",
      category: "other",
      priority: "normal",
    });
    expect(notify.emitForAudience).toHaveBeenCalledOnce();
    const call = notify.emitForAudience.mock.calls[0]!;
    const recipients = call[0] as ReadonlyArray<{
      personId: string;
      channels: ReadonlyArray<"in_app" | "email">;
    }>;
    expect(recipients.length).toBe(2);
    expect(recipients[0]).toMatchObject({
      personId: "p-staff-1",
      channels: ["in_app"],
    });
    const template = call[1] as {
      kind: string;
      title: string;
      href?: string;
    };
    expect(template).toMatchObject({
      kind: "helpdesk_ticket_created",
      href: "/helpdesk/ticket-1",
    });
  });
  it("accepts a parent whose GuardianStudent link matches", async () => {
    const prisma = makePrisma({ guardianStudent: { id: "link-1" } });
    const ticket = makeTicketRow({
      requesterId: "person-parent",
      studentId: "student-1",
    });
    prisma.helpdeskTicket.create.mockResolvedValueOnce(ticket);
    prisma.helpdeskTicket.findUnique.mockResolvedValueOnce(ticket);
    prisma.helpdeskComment.findMany.mockResolvedValueOnce([]);
    prisma.helpdeskAttachment.findUnique.mockResolvedValueOnce(null);
    const svc = new HelpdeskService(
      prisma as unknown as PrismaService,
      makeUploads() as unknown as UploadsStorage,
      makeGithub(),
      makeNotifications(),
    );
    await svc.createTicket(parentUser, {
      title: "For my child",
      description: "He needs help.",
      category: "academics",
      priority: "normal",
      studentId: "student-1",
    });
    const data = prisma.helpdeskTicket.create.mock.calls[0]![0].data;
    expect(data.studentId).toBe("student-1");
    expect(data.requesterId).toBe("person-parent");
  });

  it("requires parents to specify a studentId", async () => {
    const { service } = makeService();
    await expect(
      service.createTicket(parentUser, {
        title: "Question",
        description: "No student.",
        category: "other",
        priority: "normal",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("stores null studentId for staff who omit a student", async () => {
    const { service, prisma } = makeService({
      person: {
        id: "person-registrar",
        roles: ["registrar"],
        student: null,
      },
    });
    await service.createTicket(registrarUser, {
      title: "General",
      description: "No student.",
      category: "other",
      priority: "normal",
    });
    const data = prisma.helpdeskTicket.create.mock.calls[0]![0].data;
    expect(data.studentId).toBeNull();
    expect(data.requesterId).toBe("person-registrar");
  });

  it("emits a staff notification with mail channels when mail is enabled", async () => {
    const notify = makeNotifications();
    const mail = makeMail({ enabled: true });
    const prisma = makePrisma({
      ticket: makeTicketRow(),
      person: { id: "p-staff-1", roles: ["registrar"], student: null },
    });
    prisma.person.findMany.mockResolvedValueOnce([
      { id: "p-staff-1" },
      { id: "p-staff-2" },
    ]);
    const svc = new HelpdeskService(
      prisma as unknown as PrismaService,
      makeUploads() as unknown as UploadsStorage,
      makeGithub(),
      notify,
      mail,
    );
    await svc.createTicket(registrarUser, {
      title: "General",
      description: "No student.",
      category: "other",
      priority: "normal",
    });
    expect(notify.emitForAudience).toHaveBeenCalledOnce();
    const call = notify.emitForAudience.mock.calls[0]!;
    const recipients = call[0] as ReadonlyArray<{
      personId: string;
      channels: ReadonlyArray<"in_app" | "email">;
    }>;
    expect(recipients[0]).toMatchObject({
      personId: "p-staff-1",
      channels: ["in_app", "email"],
    });
    const template = call[1] as { kind: string; href?: string };
    expect(template).toMatchObject({
      kind: "helpdesk_ticket_created",
      href: "/helpdesk/ticket-1",
    });
  });
});

// ---------------------------------------------------------------------------
// getTicket
// ---------------------------------------------------------------------------

describe("HelpdeskService.getTicket", () => {
  it("returns null for an unknown id", async () => {
    const { service } = makeService();
    await expect(service.getTicket(studentUser, "missing")).resolves.toBeNull();
  });

  it("blocks a student from reading another student's ticket", async () => {
    const { service } = makeService({
      ticket: makeTicketRow({ studentId: "student-99" }),
    });
    await expect(
      service.getTicket(studentUser, "ticket-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lets staff read any ticket", async () => {
    const { service } = makeService();
    const detail = await service.getTicket(registrarUser, "ticket-1");
    expect(detail?.id).toBe("ticket-1");
  });
});

// ---------------------------------------------------------------------------
// listMine / listQueue
// ---------------------------------------------------------------------------

describe("HelpdeskService.listMine", () => {
  it("scopes a student to their own studentId", async () => {
    const { service, prisma } = makeService();
    await service.listMine(studentUser);
    const where = prisma.helpdeskTicket.findMany.mock.calls[0]![0].where;
    expect(where).toEqual({ studentId: "student-1" });
  });

  it("scopes a parent to their own requesterId", async () => {
    const { service, prisma } = makeService();
    await service.listMine(parentUser);
    const where = prisma.helpdeskTicket.findMany.mock.calls[0]![0].where;
    expect(where).toEqual({ requesterId: "person-parent" });
  });
});

describe("HelpdeskService.listQueue", () => {
  it("blocks non-staff", async () => {
    const { service } = makeService();
    await expect(service.listQueue(studentUser, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("filters by status and category for staff", async () => {
    const { service, prisma } = makeService();
    await service.listQueue(registrarUser, {
      status: "new",
      category: "it_portal",
      priority: undefined,
      routingType: undefined,
      assigneeId: undefined,
      mineOnly: false,
    });
    const where = prisma.helpdeskTicket.findMany.mock.calls[0]![0].where;
    expect(where.status).toBe("new");
    expect(where.category).toBe("it_portal");
  });

  it("honors mineOnly=true by narrowing assigneeId", async () => {
    const { service, prisma } = makeService();
    await service.listQueue(registrarUser, {
      status: undefined,
      category: undefined,
      priority: undefined,
      routingType: undefined,
      assigneeId: undefined,
      mineOnly: true,
    });
    const where = prisma.helpdeskTicket.findMany.mock.calls[0]![0].where;
    expect(where.assigneeId).toBe("person-registrar");
  });
});

// ---------------------------------------------------------------------------
// addComment
// ---------------------------------------------------------------------------

describe("HelpdeskService.addComment", () => {
  it("strips isInternal for non-staff authors", async () => {
    const { service, prisma } = makeService({
      ticket: makeTicketRow({ studentId: "student-1" }),
    });
    await service.addComment(studentUser, "ticket-1", {
      body: "I have a follow-up",
      isInternal: true,
    });
    const data = prisma.helpdeskComment.create.mock.calls[0]![0].data;
    expect(data.isInternal).toBe(false);
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("honors isInternal=true for staff", async () => {
    const { service, prisma } = makeService({
      ticket: makeTicketRow({ requesterId: "person-student", studentId: "student-1" }),
    });
    await service.addComment(registrarUser, "ticket-1", {
      body: "Internal note",
      isInternal: true,
    });
    const data = prisma.helpdeskComment.create.mock.calls[0]![0].data;
    expect(data.isInternal).toBe(true);
  });

  it("throws NotFound when the ticket is missing", async () => {
    const { service } = makeService({
      ticket: makeTicketRow({ id: "other" }),
    });
    await expect(
      service.addComment(registrarUser, "missing", { body: "x", isInternal: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// updateTicket
// ---------------------------------------------------------------------------

describe("HelpdeskService.updateTicket", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-staff callers", async () => {
    const { service } = makeService();
    await expect(
      service.updateTicket(studentUser, "ticket-1", {
        status: "in_progress",
        baseRevision: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects routing to engineering for non-allowed roles", async () => {
    const { service } = makeService();
    await expect(
      service.updateTicket(
        { ...registrarUser, roles: ["dining"] },
        "ticket-1",
        { routingType: "engineering", baseRevision: 1 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects an invalid status transition", async () => {
    const { service } = makeService({
      ticket: makeTicketRow({ status: "new" }),
    });
    await expect(
      service.updateTicket(registrarUser, "ticket-1", {
        status: "resolved",
        baseRevision: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws ConflictException on a stale baseRevision", async () => {
    const { service } = makeService({
      ticket: makeTicketRow({ status: "new", version: 2 }),
    });
    await expect(
      service.updateTicket(registrarUser, "ticket-1", {
        status: "in_progress",
        baseRevision: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("applies a valid transition and bumps the version", async () => {
    const txTicket = { ...makeTicketRow({ status: "new", version: 3 }) };
    const prisma = makePrisma({ ticket: txTicket });
    const svc = new HelpdeskService(
      prisma as unknown as PrismaService,
      makeUploads() as unknown as UploadsStorage,
      makeGithub(),
      makeNotifications(),
    );
    await svc.updateTicket(registrarUser, "ticket-1", {
      status: "in_progress",
      baseRevision: 3,
    });
    expect(prisma.helpdeskTicket.updateMany).toHaveBeenCalledOnce();
    const updateData = prisma.helpdeskTicket.updateMany.mock.calls[0]![0].data;
    expect(updateData.version).toBe(4);
    expect(updateData.status).toBe("in_progress");
  });

  it("rejects an assignee who lacks any helpdesk role", async () => {
    const { service, prisma } = makeService({
      ticket: makeTicketRow(),
      person: {
        id: "person-bystander",
        roles: ["student"],
        student: { id: "student-99" },
      },
    });
    await expect(
      service.updateTicket(registrarUser, "ticket-1", {
        assigneeId: "person-bystander",
        baseRevision: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("supports explicit unassignment with null", async () => {
    const txTicket = { ...makeTicketRow({ assigneeId: "person-registrar", version: 1 }) };
    const prisma = makePrisma({ ticket: txTicket });
    const svc = new HelpdeskService(
      prisma as unknown as PrismaService,
      makeUploads() as unknown as UploadsStorage,
      makeGithub(),
      makeNotifications(),
    );
    await svc.updateTicket(registrarUser, "ticket-1", {
      assigneeId: null,
      baseRevision: 1,
    });
    const updateData = prisma.helpdeskTicket.updateMany.mock.calls[0]![0].data;
    expect(updateData.assigneeId).toBeNull();
  });

  it("triggers a GitHub sync when routed to engineering", async () => {
    const txTicket = { ...makeTicketRow({ routingType: "support", version: 1 }) };
    const prisma = makePrisma({ ticket: txTicket });
    const github = makeGithub();
    const svc = new HelpdeskService(
      prisma as unknown as PrismaService,
      makeUploads() as unknown as UploadsStorage,
      github,
      makeNotifications(),
    );
    await svc.updateTicket(adminUser, "ticket-1", {
      routingType: "engineering",
      baseRevision: 1,
    });
    await vi.waitFor(() => expect(github.sync).toHaveBeenCalledOnce());
  });
});

// ---------------------------------------------------------------------------
// syncTicketToGithub
// ---------------------------------------------------------------------------

describe("HelpdeskService.syncTicketToGithub", () => {
  it("rejects non-staff", async () => {
    const { service } = makeService();
    await expect(service.syncTicketToGithub(studentUser, "ticket-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("returns the disabled flag when env is not configured", async () => {
    const github = makeGithub({ isConfigured: false });
    const { service, prisma } = makeService({ github });
    const result = await service.syncTicketToGithub(registrarUser, "ticket-1");
    expect(result.state).toBe("pending");
    expect(result.disabled).toBe(true);
    expect(github.sync).toHaveBeenCalledOnce();
    expect(prisma.helpdeskTicket.update).toHaveBeenCalled();
  });

  it("catches sync crashes and persists the failed state", async () => {
    // Throw inside the github seam — DB updates must still record `failed`.
    const github = {
      sync: vi.fn(async () => {
        throw new Error("upstream blew up");
      }),
      isConfigured: vi.fn(() => true),
    } as unknown as HelpdeskGithubSync;
    const prisma = makePrisma({
      ticket: makeTicketRow({ routingType: "engineering" }),
    });
    const svc = new HelpdeskService(
      prisma as unknown as PrismaService,
      makeUploads() as unknown as UploadsStorage,
      github,
      makeNotifications(),
    );
    // Must not throw — fire-and-forget semantics.
    await expect(
      svc.syncTicketToGithub(registrarUser, "ticket-1"),
    ).resolves.toBeDefined();
    const updateCalls = prisma.helpdeskTicket.update.mock.calls;
    const last = updateCalls[updateCalls.length - 1]![0].data;
    expect(last.githubSyncState).toBe("failed");
    expect(last.githubSyncError).toBe("upstream blew up");
  });
});

// ---------------------------------------------------------------------------
// createAttachment / streamAttachment
// ---------------------------------------------------------------------------

describe("HelpdeskService.createAttachment", () => {
  it("rejects unknown ticket ids", async () => {
    const { service } = makeService();
    await expect(
      service.createAttachment(
        studentUser,
        "missing-ticket",
        {
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          size: 8,
          mimetype: "image/png",
          originalname: "x.png",
        } as Express.Multer.File,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("stores the upload in private helpdesk storage and writes an audit row", async () => {
    const { prisma } = makeService({
      ticket: makeTicketRow({ studentId: "student-1" }),
    });
    const uploads = makeUploads();
    const svc = new HelpdeskService(
      prisma as unknown as PrismaService,
      uploads,
      makeGithub(),
      makeNotifications(),
    );
    const summary = await svc.createAttachment(
      studentUser,
      "ticket-1",
      {
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        size: 8,
        mimetype: "image/png",
        originalname: "screenshot.png",
      } as Express.Multer.File,
    );
    // Public storage must never be touched — `put` serves the
    // `/uploads/:filename` route, which is exactly the read path we are
    // closing off.
    expect(uploads.put).not.toHaveBeenCalled();
    expect(uploads.putHelpdeskImage).toHaveBeenCalledOnce();
    expect(summary.url).toBe("");
    expect(prisma.auditLog.create).toHaveBeenCalled();
    // The private key is persisted on the row.
    const createArgs = prisma.helpdeskAttachment.create.mock.calls[0]![0]
      .data as { storageKey?: unknown; url?: unknown };
    expect(typeof createArgs.storageKey).toBe("string");
    expect(createArgs.storageKey as string).toMatch(/^helpdesk\//);
    expect(createArgs.url).toBe("");
  });

  it("rejects PDF uploads even though the generic uploader accepts them", async () => {
    const { service } = makeService({
      ticket: makeTicketRow({ studentId: "student-1" }),
    });
    // PDF magic bytes "%PDF-".
    const pdfBytes = Buffer.from("%PDF-1.4\nhello");
    await expect(
      service.createAttachment(studentUser, "ticket-1", {
        buffer: pdfBytes,
        size: pdfBytes.length,
        mimetype: "application/pdf",
        originalname: "doc.pdf",
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("HelpdeskService.streamAttachment", () => {
  it("returns null for an unknown attachment", async () => {
    const { service } = makeService();
    await expect(
      service.streamAttachment(studentUser, "missing"),
    ).resolves.toBeNull();
  });

  it("reads bytes through the private helpdesk storage helper", async () => {
    const prisma = makePrisma({
      ticket: makeTicketRow({ studentId: "student-1" }),
    });
    prisma.helpdeskAttachment.findUnique.mockImplementation(async () => ({
      id: "attach-1",
      ticketId: "ticket-1",
      uploaderId: "person-student",
      url: "",
      storageKey: "helpdesk/abc.png",
      name: "shot.png",
      size: 4,
      mimeType: "image/png",
      createdAt: new Date(),
    }));
    const uploads = makeUploads();
    const svc = new HelpdeskService(
      prisma as unknown as PrismaService,
      uploads,
      makeGithub(),
      makeNotifications(),
    );
    const out = await svc.streamAttachment(studentUser, "attach-1");
    expect(out?.ticketId).toBe("ticket-1");
    expect(out?.contentType).toBe("image/png");
    // Only the private reader is hit; the public `get` is never invoked for
    // helpdesk attachments, which would have served the row unconditionally.
    expect(uploads.get).not.toHaveBeenCalled();
    expect(uploads.getHelpdeskImage).toHaveBeenCalledWith("helpdesk/abc.png");
  });

  it("refuses to serve rows without a private storage key", async () => {
    const prisma = makePrisma({
      ticket: makeTicketRow({ studentId: "student-1" }),
    });
    prisma.helpdeskAttachment.findUnique.mockImplementation(async () => ({
      id: "attach-1",
      ticketId: "ticket-1",
      uploaderId: "person-student",
      url: "",
      storageKey: "",
      name: "shot.png",
      size: 4,
      mimeType: "image/png",
      createdAt: new Date(),
    }));
    const svc = new HelpdeskService(
      prisma as unknown as PrismaService,
      makeUploads() as unknown as UploadsStorage,
      makeGithub(),
      makeNotifications(),
    );
    await expect(
      svc.streamAttachment(studentUser, "attach-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a non-owner requester", async () => {
    const prisma = makePrisma({
      ticket: makeTicketRow({ studentId: "student-other" }),
    });
    prisma.helpdeskAttachment.findUnique.mockImplementation(async () => ({
      id: "attach-1",
      ticketId: "ticket-1",
      uploaderId: "person-student",
      url: "",
      storageKey: "helpdesk/abc.png",
      name: "shot.png",
      size: 4,
      mimeType: "image/png",
      createdAt: new Date(),
    }));
    const svc = new HelpdeskService(
      prisma as unknown as PrismaService,
      makeUploads() as unknown as UploadsStorage,
      makeGithub(),
      makeNotifications(),
    );
    await expect(
      svc.streamAttachment(studentUser, "attach-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

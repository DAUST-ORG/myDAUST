import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { EMPTY_SITE_OVERRIDES, sanitizeSiteOverrides, type SiteOverrides } from "@mydaust/shared";
import { PrismaService } from "../prisma/prisma.service.js";

const KEY = "site";

/** The site CMS content store: a single row holding draft + published override docs. */
@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  private row() {
    return this.prisma.siteContent.findUnique({ where: { key: KEY } });
  }

  /** Public: what the live vitrine serves (published, else empty defaults). */
  async published(): Promise<SiteOverrides> {
    const row = await this.row();
    return (row?.publishedJson as SiteOverrides | null | undefined) ?? EMPTY_SITE_OVERRIDES;
  }

  /** CMS: the working draft plus its timestamps for the editor's status bar. */
  async draft(): Promise<{ overrides: SiteOverrides; updatedAt: string | null; publishedAt: string | null }> {
    const row = await this.row();
    return {
      overrides: (row?.draftJson as SiteOverrides | null | undefined) ?? EMPTY_SITE_OVERRIDES,
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
      publishedAt: row?.publishedAt ? row.publishedAt.toISOString() : null,
    };
  }

  async saveDraft(input: SiteOverrides, actorId: string) {
    // Strip anything outside the editable allowlist before it is ever persisted.
    const overrides = sanitizeSiteOverrides(input);
    const row = await this.prisma.siteContent.upsert({
      where: { key: KEY },
      create: { key: KEY, draftJson: overrides, updatedById: actorId },
      update: { draftJson: overrides, updatedById: actorId },
    });
    return { ok: true, updatedAt: row.updatedAt.toISOString() };
  }

  /** Rotate a capability token so the (cross-domain) public site can render the current draft. */
  async setPreview(actorId: string): Promise<{ token: string }> {
    const token = randomUUID();
    const draft = (await this.row())?.draftJson ?? EMPTY_SITE_OVERRIDES;
    await this.prisma.siteContent.upsert({
      where: { key: KEY },
      create: { key: KEY, draftJson: draft, previewToken: token, updatedById: actorId },
      update: { previewToken: token },
    });
    return { token };
  }

  /** Public: the draft doc, gated by the capability token (no session needed). */
  async byPreviewToken(token: string): Promise<SiteOverrides> {
    if (!token) throw new NotFoundException("Preview not found");
    const row = await this.prisma.siteContent.findFirst({ where: { key: KEY, previewToken: token } });
    if (!row) throw new NotFoundException("Preview not found");
    return (row.draftJson as SiteOverrides | null | undefined) ?? EMPTY_SITE_OVERRIDES;
  }

  /** Flip the current draft live. Audit-logged. */
  async publish(actorId: string) {
    const row = await this.row();
    const draft = (row?.draftJson as SiteOverrides | null | undefined) ?? EMPTY_SITE_OVERRIDES;
    const updated = await this.prisma.siteContent.upsert({
      where: { key: KEY },
      create: { key: KEY, draftJson: draft, publishedJson: draft, publishedById: actorId, publishedAt: new Date() },
      update: { publishedJson: draft, publishedById: actorId, publishedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: { entity: "SiteContent", entityId: KEY, action: "site-published", actorId },
    });
    return { ok: true, publishedAt: updated.publishedAt?.toISOString() ?? null };
  }
}

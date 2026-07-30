import { Injectable, NotFoundException } from "@nestjs/common";
import { type NewsArticleInput, slugify } from "@mydaust/shared";
import { PrismaService } from "../prisma/prisma.service.js";

const PUBLIC_SELECT = {
  id: true, slug: true, titleEn: true, titleFr: true,
  excerptEn: true, excerptFr: true, imageUrl: true, tag: true, date: true,
} as const;

@Injectable()
export class NewsService {
  constructor(private readonly prisma: PrismaService) {}

  publishedList() {
    return this.prisma.newsArticle.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: PUBLIC_SELECT,
    });
  }

  async publishedBySlug(slug: string) {
    const a = await this.prisma.newsArticle.findFirst({ where: { slug, published: true } });
    if (!a) throw new NotFoundException("Article not found");
    return a;
  }

  adminList() {
    return this.prisma.newsArticle.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
  }

  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    const root = base || "article";
    let slug = root;
    let n = 1;
    // Bounded loop; slugs collide rarely, and each check is a unique-index hit.
    while (n < 1000) {
      const existing = await this.prisma.newsArticle.findUnique({ where: { slug } });
      if (!existing || existing.id === excludeId) return slug;
      n += 1;
      slug = `${root}-${n}`;
    }
    return `${root}-${Date.now()}`;
  }

  async create(input: NewsArticleInput, actorId: string) {
    const slug = await this.uniqueSlug(slugify(input.slug || input.titleEn));
    const a = await this.prisma.newsArticle.create({ data: { ...this.data(input), slug } });
    await this.prisma.auditLog.create({ data: { entity: "NewsArticle", entityId: a.id, action: "news-created", actorId } });
    return a;
  }

  async update(id: string, input: NewsArticleInput, actorId: string) {
    const existing = await this.prisma.newsArticle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Article not found");
    const slug = input.slug ? await this.uniqueSlug(slugify(input.slug), id) : existing.slug;
    const a = await this.prisma.newsArticle.update({ where: { id }, data: { ...this.data(input), slug } });
    await this.prisma.auditLog.create({ data: { entity: "NewsArticle", entityId: id, action: "news-updated", actorId } });
    return a;
  }

  async remove(id: string, actorId: string) {
    const existing = await this.prisma.newsArticle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Article not found");
    await this.prisma.newsArticle.delete({ where: { id } });
    await this.prisma.auditLog.create({ data: { entity: "NewsArticle", entityId: id, action: "news-deleted", actorId } });
    return { ok: true };
  }

  private data(input: NewsArticleInput) {
    return {
      titleEn: input.titleEn, titleFr: input.titleFr,
      excerptEn: input.excerptEn, excerptFr: input.excerptFr,
      bodyEn: input.bodyEn, bodyFr: input.bodyFr,
      imageUrl: input.imageUrl ?? null, tag: input.tag ?? null,
      date: input.date, published: input.published, sortOrder: input.sortOrder ?? 0,
    };
  }
}

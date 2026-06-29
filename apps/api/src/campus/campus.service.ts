import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class CampusService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public announcements for the vitrine, optionally filtered by audience. */
  async announcements(audience?: string) {
    return this.prisma.announcement.findMany({
      where: audience ? { audience: { in: [audience, "all"] } } : undefined,
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  /** Upcoming campus events (today onward). */
  async events() {
    const since = new Date(Date.now() - 86_400_000);
    return this.prisma.event.findMany({
      where: { startsAt: { gte: since } },
      orderBy: { startsAt: "asc" },
      take: 50,
    });
  }

  /** Library catalog, optionally filtered by a free-text query over title/author/subject. */
  async library(q?: string) {
    const query = q?.trim();
    return this.prisma.libraryResource.findMany({
      where: query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { author: { contains: query, mode: "insensitive" } },
              { subject: { contains: query, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { title: "asc" },
      take: 100,
    });
  }
}

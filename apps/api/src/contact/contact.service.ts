import { Injectable, NotFoundException } from "@nestjs/common";
import type { ContactInput } from "@mydaust/shared";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class ContactService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: ContactInput) {
    const row = await this.prisma.contactMessage.create({
      data: { name: input.name, email: input.email, message: input.message },
    });
    return { ok: true, id: row.id };
  }

  list() {
    return this.prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  }

  async markRead(id: string, read: boolean) {
    const existing = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Message not found");
    return this.prisma.contactMessage.update({ where: { id }, data: { read } });
  }
}

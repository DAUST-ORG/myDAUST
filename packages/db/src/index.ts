import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

/** Shared Prisma client. One instance per process (NestJS wraps it in a provider). */
export const prisma = new PrismaClient();

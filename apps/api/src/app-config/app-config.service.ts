import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  FEE_STRUCTURE,
  SCHOLARSHIP_TIERS,
  type ScholarshipTierDef,
  type UpdateFeeInput,
  type ScholarshipTierInput,
  scholarshipForBac,
} from "@mydaust/shared";
import { PrismaService } from "../prisma/prisma.service.js";

/** Seed rows derived from the former hardcoded constants. Created once; director edits win after that. */
const DEFAULT_FEES = [
  { key: "tuition", label: "Tuition", minXof: FEE_STRUCTURE.tuitionPerYear, maxXof: null, period: "year", note: "Half per semester · monthly installments available", sortOrder: 0 },
  { key: "housing", label: "Housing", minXof: FEE_STRUCTURE.housingPerYear, maxXof: null, period: "year", note: "Optional · on-campus residence", sortOrder: 1 },
  { key: "cafeteria", label: "Cafeteria", minXof: FEE_STRUCTURE.cafeteriaPerYear, maxXof: null, period: "year", note: "Optional · full pension meal plan", sortOrder: 2 },
  { key: "application_fee", label: "Application Fee", minXof: FEE_STRUCTURE.applicationFee, maxXof: null, period: "one-time", note: "One-time, paid with your application", sortOrder: 3 },
  { key: "insurance", label: "Insurance", minXof: FEE_STRUCTURE.insurancePerYear, maxXof: null, period: "year", note: "Annual student insurance", sortOrder: 4 },
];

@Injectable()
export class AppConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent: creates missing defaults without touching director-edited rows. */
  private async ensureSeeded() {
    const count = await this.prisma.feeItem.count();
    if (count === 0) await this.prisma.feeItem.createMany({ data: DEFAULT_FEES });
    const tiers = await this.prisma.scholarshipTier.count();
    if (tiers === 0) {
      await this.prisma.scholarshipTier.createMany({
        data: SCHOLARSHIP_TIERS.map((t) => ({ minScore: t.minScore, pct: t.pct, band: t.band, note: t.note ?? null })),
      });
    }
  }

  async fees() {
    await this.ensureSeeded();
    return this.prisma.feeItem.findMany({ orderBy: { sortOrder: "asc" } });
  }

  async scholarships(): Promise<(ScholarshipTierDef & { id: string })[]> {
    await this.ensureSeeded();
    const rows = await this.prisma.scholarshipTier.findMany({ orderBy: { minScore: "desc" } });
    return rows.map((r) => ({ id: r.id, minScore: r.minScore, pct: r.pct, band: r.band, note: r.note }));
  }

  /** The live award function: DB tiers, shared pure logic, constant fallback if the table is empty. */
  async awardFor(score: number | null | undefined) {
    const tiers = await this.scholarships();
    return scholarshipForBac(score, tiers.length > 0 ? tiers : SCHOLARSHIP_TIERS);
  }

  /** Current application fee (fixed amount) for checkout + revenue derivation. */
  async applicationFee(): Promise<number> {
    await this.ensureSeeded();
    const row = await this.prisma.feeItem.findUnique({ where: { key: "application_fee" } });
    return row?.minXof ?? FEE_STRUCTURE.applicationFee;
  }

  async updateFee(key: string, patch: UpdateFeeInput, actorId: string) {
    const existing = await this.prisma.feeItem.findUnique({ where: { key } });
    if (!existing) throw new NotFoundException("Unknown fee item");
    if (patch.maxXof != null && patch.minXof != null && patch.maxXof < patch.minXof) {
      throw new BadRequestException("maxXof must be ≥ minXof");
    }
    const updated = await this.prisma.feeItem.update({
      where: { key },
      data: {
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.minXof !== undefined ? { minXof: patch.minXof } : {}),
        ...(patch.maxXof !== undefined ? { maxXof: patch.maxXof } : {}),
        ...(patch.period !== undefined ? { period: patch.period } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
      },
    });
    await this.prisma.auditLog.create({
      data: { entity: "FeeItem", entityId: key, action: "fee-updated", actorId, data: { from: existing, to: patch } },
    });
    return updated;
  }

  async createTier(input: ScholarshipTierInput, actorId: string) {
    const tier = await this.prisma.scholarshipTier.create({
      data: { minScore: input.minScore, pct: input.pct, band: input.band, note: input.note ?? null },
    });
    await this.prisma.auditLog.create({
      data: { entity: "ScholarshipTier", entityId: tier.id, action: "tier-created", actorId, data: input },
    });
    return tier;
  }

  async updateTier(id: string, input: ScholarshipTierInput, actorId: string) {
    const existing = await this.prisma.scholarshipTier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Tier not found");
    const tier = await this.prisma.scholarshipTier.update({
      where: { id },
      data: { minScore: input.minScore, pct: input.pct, band: input.band, note: input.note ?? null },
    });
    await this.prisma.auditLog.create({
      data: { entity: "ScholarshipTier", entityId: id, action: "tier-updated", actorId, data: { from: existing, to: input } },
    });
    return tier;
  }

  async deleteTier(id: string, actorId: string) {
    const existing = await this.prisma.scholarshipTier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Tier not found");
    await this.prisma.scholarshipTier.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: { entity: "ScholarshipTier", entityId: id, action: "tier-deleted", actorId, data: existing },
    });
    return { ok: true };
  }
}

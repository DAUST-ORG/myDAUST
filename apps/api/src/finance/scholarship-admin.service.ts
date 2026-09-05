import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ScholarshipCatalogResponse } from "@mydaust/shared";
import { type AuthUser } from "../auth/current-user.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { FinanceApprovalsService } from "./finance-approvals.service.js";
import {
  validateScholarships,
  type ScholarshipDefinition,
} from "./scholarship-catalog.js";

/**
 * A validated catalog entry on its way into an approval. The `id` rides along so
 * the apply step can tell an edit of an approved award from a brand new one, the
 * way `GlobalFeeComponentInput` already does for components.
 */
export type ProposedScholarship = ScholarshipDefinition & { id?: string };

/** The shape the portal PUTs. Mirrors ScholarshipCatalogRevisionInput in shared. */
export type ScholarshipCatalogProposal = {
  academicYearLabel?: string;
  reason: string;
  scholarships: Array<{
    id?: string;
    key: string;
    label: string;
    description?: string | null;
    basis: ScholarshipDefinition["basis"];
    rateMode: ScholarshipDefinition["rateMode"];
    pctBps?: number;
    flatXof?: number;
    costCenterCode: string;
    active: boolean;
    sortOrder: number;
  }>;
};

@Injectable()
export class ScholarshipAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: FinanceApprovalsService,
  ) {}

  /**
   * The catalog as it stands on the latest approved schedule for the year. A year
   * with no approved schedule reads back as an empty catalog rather than a 404,
   * matching the fee-plan read the same screen already calls.
   */
  async listScholarships(
    academicYearLabel?: string,
  ): Promise<ScholarshipCatalogResponse> {
    const year = await this.resolveYear(academicYearLabel);
    if (!year) return emptyCatalog(null);
    const schedule = await this.findApprovedSchedule(year);
    if (!schedule) return emptyCatalog(year);
    return {
      academicYearLabel: year,
      scheduleId: schedule.id,
      revision: schedule.revision,
      status: schedule.status,
      approvedAt: schedule.approvedAt?.toISOString() ?? null,
      scholarships: schedule.scholarships.map((scholarship) => ({
        id: scholarship.id,
        key: scholarship.key,
        label: scholarship.label,
        description: scholarship.description,
        basis: scholarship.basis,
        rateMode: scholarship.rateMode,
        pctBps: scholarship.pctBps,
        flatXof: scholarship.flatXof,
        costCenterCode: scholarship.costCenterCode,
        active: scholarship.active,
        sortOrder: scholarship.sortOrder,
      })),
    };
  }

  /**
   * Files a catalog edit for administrator approval.
   *
   * Scholarships live on the same versioned `FeeSchedule` as the components, so
   * this reuses the `global_fee_schedule` kind rather than introducing a new one:
   * the snapshot, the `baseRevision` staleness check and the supersede-and-recreate
   * apply step are already written against that schedule row.
   */
  async proposeCatalog(actor: AuthUser, input: ScholarshipCatalogProposal) {
    const year = await this.resolveYear(input.academicYearLabel);
    if (!year) throw new NotFoundException("No active academic year");
    const schedule = await this.findApprovedSchedule(year);
    if (!schedule) {
      throw new NotFoundException(
        `No approved fee schedule for ${year} to attach scholarships to`,
      );
    }
    const scholarships = this.validate(input.scholarships);
    await this.assertKnownCostCenters(scholarships);
    const request = await this.approvals.request(actor, {
      kind: "global_fee_schedule",
      targetType: "FeeSchedule",
      targetId: schedule.id,
      academicYearLabel: year,
      reason: input.reason,
      after: { scholarships },
    });
    return { ...request, approvalKind: "global_fee_schedule" as const };
  }

  /**
   * One validator for the catalog, shared with the resolver that prices an award
   * onto a student. `description` is optional on the wire and required by the
   * catalog type, so an absent one becomes the empty string.
   */
  private validate(
    scholarships: ScholarshipCatalogProposal["scholarships"],
  ): ProposedScholarship[] {
    const candidates: ScholarshipDefinition[] = scholarships.map(
      (scholarship) => ({
        key: scholarship.key,
        label: scholarship.label,
        description: scholarship.description?.trim() ?? "",
        basis: scholarship.basis,
        rateMode: scholarship.rateMode,
        pctBps: scholarship.pctBps,
        flatXof: scholarship.flatXof,
        costCenterCode: scholarship.costCenterCode,
        active: scholarship.active,
        sortOrder: scholarship.sortOrder,
      }),
    );
    return validateScholarships(candidates).map((scholarship, index) => {
      const id = scholarships[index]!.id;
      return id ? { ...scholarship, id } : scholarship;
    });
  }

  /**
   * The `costCenterCode` foreign key is RESTRICT, so an unknown code would only
   * fail once the approver commits the revision. Reject it while the requester is
   * still on the screen.
   */
  private async assertKnownCostCenters(
    scholarships: readonly ProposedScholarship[],
  ) {
    const codes = [
      ...new Set(scholarships.map((scholarship) => scholarship.costCenterCode)),
    ];
    if (codes.length === 0) return;
    const known = await this.prisma.costCenter.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });
    const knownCodes = new Set(known.map((center) => center.code));
    const unknown = scholarships.find(
      (scholarship) => !knownCodes.has(scholarship.costCenterCode),
    );
    if (unknown) {
      throw new BadRequestException(
        `Unknown cost center ${unknown.costCenterCode} for ${unknown.label}`,
      );
    }
  }

  private async resolveYear(academicYearLabel?: string) {
    if (academicYearLabel) return academicYearLabel;
    const active = await this.prisma.academicYear.findFirst({
      where: { status: "active" },
      select: { label: true },
    });
    return active?.label ?? null;
  }

  private findApprovedSchedule(academicYearLabel: string) {
    return this.prisma.feeSchedule.findFirst({
      where: { academicYearLabel, status: "approved" },
      orderBy: { revision: "desc" },
      include: {
        scholarships: { orderBy: [{ sortOrder: "asc" }, { key: "asc" }] },
      },
    });
  }
}

function emptyCatalog(
  academicYearLabel: string | null,
): ScholarshipCatalogResponse {
  return {
    academicYearLabel,
    scheduleId: null,
    revision: null,
    status: null,
    approvedAt: null,
    scholarships: [],
  };
}

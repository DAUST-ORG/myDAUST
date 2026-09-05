import { BadRequestException } from "@nestjs/common";
import {
  resolveAward,
  type ScholarshipAward,
  type ScholarshipDefinition,
} from "./scholarship-catalog.js";

/**
 * The slice of a student's standard package an award is priced against.
 *
 * The basis is the student's own bill, deliberately not the reference constants
 * in student-billing-import.pricing.ts. Those exist so the workbook import
 * reconciles against fixed figures; reusing them here would misprice every
 * student who is not on the reference package, which is the whole point of the
 * housing tiers now in the catalog.
 */
export interface AwardableInvoice {
  totalAmount: number;
  components: readonly { kind: string; amountXof: number }[];
  scholarships: readonly ScholarshipDefinition[];
}

export interface ResolvedCredit {
  key: string;
  label: string;
  costCenterCode: string;
  amountXof: number;
  basisXof: number;
}

/**
 * A catalog award carries its own label, cost center and — when the rate is
 * fixed — its own rate, so none of those come from the client: the bursar
 * proposing a credit does not get to set its percentage.
 */
export function resolveStudentCredit(
  award: ScholarshipAward,
  invoice: AwardableInvoice,
): ResolvedCredit {
  const resolved = resolveAward(award, invoice.scholarships);
  const basisXof =
    resolved.basis === "tuition"
      ? (invoice.components.find((row) => row.kind === "tuition")?.amountXof ??
        0)
      : invoice.totalAmount;
  if (basisXof <= 0) {
    throw new BadRequestException(
      `This student's bill carries no ${resolved.basis} amount to award against`,
    );
  }
  const amountXof =
    Math.round((basisXof * resolved.pctBps) / 10_000) + resolved.flatXof;
  if (amountXof <= 0) {
    throw new BadRequestException("This award reduces the bill by nothing");
  }
  if (amountXof > basisXof) {
    throw new BadRequestException(
      `This award of ${amountXof} XOF exceeds the student's ${resolved.basis} of ${basisXof} XOF`,
    );
  }
  return {
    key: resolved.key,
    label: resolved.label,
    costCenterCode: resolved.costCenterCode,
    amountXof,
    basisXof,
  };
}

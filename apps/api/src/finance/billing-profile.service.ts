import { createHash } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@mydaust/db";
import {
  INITIAL_BILLING_ADJUSTMENT_DEFINITIONS,
  INITIAL_BILLING_CATALOG_ACADEMIC_YEAR,
  INITIAL_BILLING_SERVICE_OPTIONS,
  toDakarDateKey,
} from "@mydaust/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { deriveApiAccountPosition } from "./account-position.js";
import { allocateProportionallyXof } from "./component-allocation.js";
import { splitEvenlyXof } from "./fee-components.js";
import { projectedInstallmentStatus } from "./account-position.js";

export type BillingProfileChangeInput = {
  academicYearLabel: string;
  expectedRevision?: number;
  housingOptionCode: string;
  cafeteriaOptionCode: string;
  insuranceSelected: boolean;
  cautionSelected: boolean;
  awardDefinitionIds?: string[];
  manualAdjustments?: {
    definitionId?: string;
    label: string;
    amountXof: number;
    reason: string;
  }[];
};

export type BillingCatalogChangeInput = {
  academicYearLabel: string;
  serviceOptions: {
    id?: string;
    kind: "housing" | "cafeteria" | "insurance" | "housing_caution";
    code: string;
    label: string;
    description?: string | null;
    calculation: "fixed" | "percentage_of_service";
    amountXof?: number | null;
    percentageBasisPoints?: number | null;
    basisServiceKind?:
      "housing" | "cafeteria" | "insurance" | "housing_caution" | null;
    costCenterCode: string;
    refundable: boolean;
    defaultSelected: boolean;
    active: boolean;
    sortOrder: number;
  }[];
  adjustmentDefinitions: {
    id?: string;
    key: string;
    label: string;
    description?: string | null;
    basis:
      | "tuition"
      | "housing"
      | "cafeteria"
      | "insurance"
      | "housing_caution"
      | "gross_charges"
      | "manual";
    calculation: "percentage" | "fixed" | "manual";
    stacking: "additive" | "sequential" | "exclusive";
    effect: "discount" | "charge";
    percentageBasisPoints?: number | null;
    fixedAmountXof?: number | null;
    requiresApproval: boolean;
    active: boolean;
    sortOrder: number;
  }[];
  expectedCatalogFingerprint?: string;
};

export type BillingProfilePricingClaims = {
  feeScheduleId: string;
  feeScheduleRevision: number;
  feeScheduleFingerprintSha256: string;
  billingCatalogFingerprintSha256: string;
};

type DbClient = Prisma.TransactionClient | PrismaService;

type PlannedComponent = {
  key: "tuition" | "housing" | "cafeteria" | "insurance" | "housing_caution";
  label: string;
  costCenterCode: string;
  grossAmountXof: number;
  netAmountXof: number;
  scheduleComponentId: string | null;
};

type PlannedAdjustment = {
  definitionId: string | null;
  code: string;
  label: string;
  source: "scholarship" | "manual_reconciliation" | "workbook" | "admissions";
  basis:
    | "tuition"
    | "housing"
    | "cafeteria"
    | "insurance"
    | "housing_caution"
    | "gross_charges"
    | "manual";
  calculation: "percentage" | "fixed" | "manual";
  stacking: "additive" | "sequential" | "exclusive";
  effect: "discount" | "charge";
  requiresApproval: boolean;
  basisAmountXof: number | null;
  percentageBasisPoints: number | null;
  amountXof: number;
  reason: string | null;
  isAward: boolean;
};

export type BillingOperationalSelection = {
  kind: "housing" | "cafeteria" | "insurance" | "housing_caution";
  serviceOptionId: string;
  optionCode: string;
  percentageBasisOptionId: string | null;
  percentageBasisOptionCode: string | null;
  percentageBasisServiceKind:
    "housing" | "cafeteria" | "insurance" | "housing_caution" | null;
  label: string;
  amountXof: number;
  refundable: boolean;
};

type ResolvedPlan = {
  academicYearLabel: string;
  feeScheduleId: string;
  feeScheduleRevision: number;
  feeScheduleFingerprintSha256: string;
  billingCatalogFingerprintSha256: string;
  components: PlannedComponent[];
  selections: BillingOperationalSelection[];
  adjustments: PlannedAdjustment[];
  grossChargesXof: number;
  netBilledXof: number;
};

const COMPONENT_KEYS = [
  "tuition",
  "housing",
  "cafeteria",
  "insurance",
  "housing_caution",
] as const;
const MAX_PRISMA_INT_XOF = 2_147_483_647;
const CANONICAL_INSURANCE_CODE = "annual";
const CANONICAL_CAUTION_CODE = "housing_10_percent";

function mealPlanTypeForBillingOption(code: string) {
  return code === "none" || code === "half" || code === "full" ? code : null;
}

function completeInstallmentComponentGrid(
  installments: readonly { id: string; amountDue: number }[],
  components: readonly { id: string; amountXof: number }[],
) {
  const remainingByComponent = new Map(
    components.map((component) => [component.id, component.amountXof]),
  );
  const rows: {
    installmentId: string;
    invoiceComponentId: string;
    amountDue: number;
  }[] = [];
  for (const installment of installments) {
    let installmentRemaining = installment.amountDue;
    for (const component of components) {
      const componentRemaining = remainingByComponent.get(component.id) ?? 0;
      const amountDue = Math.min(installmentRemaining, componentRemaining);
      rows.push({
        installmentId: installment.id,
        invoiceComponentId: component.id,
        amountDue,
      });
      installmentRemaining -= amountDue;
      remainingByComponent.set(component.id, componentRemaining - amountDue);
    }
    if (installmentRemaining !== 0) {
      throw new BadRequestException(
        "The billing-profile installment/component schedule does not reconcile",
      );
    }
  }
  if ([...remainingByComponent.values()].some((amount) => amount !== 0)) {
    throw new BadRequestException(
      "The billing-profile component schedule has an unallocated balance",
    );
  }
  return rows;
}

/**
 * Project an already-created authoritative profile into Dining and Housing.
 * Cutover callers use this inside their own SERIALIZABLE confirmation transaction.
 */
export async function syncBillingProfileOperationsInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    profileId: string;
    academicYearLabel: string;
    selections: readonly BillingOperationalSelection[];
  },
) {
  const cafeteria = input.selections.find(
    (selection) => selection.kind === "cafeteria",
  );
  const housing = input.selections.find(
    (selection) => selection.kind === "housing",
  );
  if (!cafeteria || !housing) {
    throw new BadRequestException(
      "Billing profile operations require housing and cafeteria selections",
    );
  }
  const mealPlanType = mealPlanTypeForBillingOption(cafeteria.optionCode);
  if (!mealPlanType) {
    throw new BadRequestException(
      `Cafeteria option ${cafeteria.optionCode} has no supported Dining access mapping`,
    );
  }
  await tx.mealPlan.upsert({
    where: {
      studentId_academicYearLabel: {
        studentId: input.studentId,
        academicYearLabel: input.academicYearLabel,
      },
    },
    create: {
      studentId: input.studentId,
      academicYearLabel: input.academicYearLabel,
      type: mealPlanType,
      term: input.academicYearLabel,
      active: mealPlanType !== "none",
      billingProfileId: input.profileId,
    },
    update: {
      type: mealPlanType,
      term: input.academicYearLabel,
      active: mealPlanType !== "none",
      billingProfileId: input.profileId,
    },
  });
  if (housing.amountXof > 0) {
    await tx.housingAssignment.upsert({
      where: {
        studentId_academicYearLabel: {
          studentId: input.studentId,
          academicYearLabel: input.academicYearLabel,
        },
      },
      create: {
        studentId: input.studentId,
        academicYearLabel: input.academicYearLabel,
        billedServiceOptionId: housing.serviceOptionId,
        status: "pending",
      },
      update: {
        academicYearLabel: input.academicYearLabel,
        billedServiceOptionId: housing.serviceOptionId,
      },
    });
    // A previously released room becomes pending assignment again when housing
    // is newly selected. Preserve an existing assigned room on ordinary profile
    // revisions; pricing changes must not silently evict an active resident.
    await tx.housingAssignment.updateMany({
      where: {
        studentId: input.studentId,
        academicYearLabel: input.academicYearLabel,
        status: "unassigned",
      },
      data: { status: "pending" },
    });
  } else {
    await tx.housingAssignment.updateMany({
      where: {
        studentId: input.studentId,
        academicYearLabel: input.academicYearLabel,
      },
      data: {
        academicYearLabel: input.academicYearLabel,
        billedServiceOptionId: null,
        status: "unassigned",
      },
    });
  }
}

function asWarnings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((warning) => {
    if (typeof warning === "string") {
      return [
        {
          code: "source_warning",
          message: warning,
          severity: "warning" as const,
        },
      ];
    }
    if (!warning || typeof warning !== "object") return [];
    const row = warning as Record<string, unknown>;
    const message = typeof row.message === "string" ? row.message : null;
    if (!message) return [];
    const severity = ["info", "warning", "error"].includes(String(row.severity))
      ? (String(row.severity) as "info" | "warning" | "error")
      : ("warning" as const);
    return [
      {
        code: typeof row.code === "string" ? row.code : "source_warning",
        message,
        severity,
      },
    ];
  });
}

@Injectable()
export class BillingProfileService {
  constructor(private readonly prisma: PrismaService) {}

  private async academicYearLabel(db: DbClient, requested?: string) {
    const label = requested?.trim();
    const year = label
      ? await db.academicYear.findUnique({ where: { label } })
      : await db.academicYear.findFirst({
          where: { status: "active" },
          orderBy: [{ startsOn: "desc" }, { label: "desc" }],
        });
    if (!year) throw new NotFoundException("Academic year not found");
    return year.label;
  }

  /** Idempotent bootstrap when the cutover year is created after migration. */
  private async ensureCatalog(db: DbClient, academicYearLabel: string) {
    // These defaults are approved only for the workbook cutover year. A future
    // year must be configured through the catalog approval workflow; merely
    // viewing options must never create an authoritative financial catalog.
    if (academicYearLabel !== INITIAL_BILLING_CATALOG_ACADEMIC_YEAR) return;
    const [optionCount, definitionCount] = await Promise.all([
      db.billingServiceOption.count({ where: { academicYearLabel } }),
      db.billingAdjustmentDefinition.count({ where: { academicYearLabel } }),
    ]);
    if (optionCount === 0) {
      await db.billingServiceOption.createMany({
        data: INITIAL_BILLING_SERVICE_OPTIONS.map((option) => ({
          ...option,
          academicYearLabel,
          active: true,
        })),
        skipDuplicates: true,
      });
    }
    if (definitionCount === 0) {
      await db.billingAdjustmentDefinition.createMany({
        data: INITIAL_BILLING_ADJUSTMENT_DEFINITIONS.map((definition) => ({
          ...definition,
          academicYearLabel,
          active: true,
        })),
        skipDuplicates: true,
      });
    }
  }

  async options(academicYearLabel?: string) {
    const year = await this.academicYearLabel(this.prisma, academicYearLabel);
    await this.ensureCatalog(this.prisma, year);
    const [academicYear, options, definitions, schedule, catalogState] =
      await Promise.all([
        this.prisma.academicYear.findUniqueOrThrow({
          where: { label: year },
          select: { id: true },
        }),
        this.prisma.billingServiceOption.findMany({
          where: { academicYearLabel: year, active: true },
          orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
        }),
        this.prisma.billingAdjustmentDefinition.findMany({
          where: { academicYearLabel: year, active: true },
          orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
        }),
        this.prisma.feeSchedule.findFirst({
          where: { academicYearLabel: year, status: "approved" },
          orderBy: { revision: "desc" },
          include: {
            rows: { orderBy: { sequence: "asc" } },
            components: { orderBy: { sortOrder: "asc" } },
          },
        }),
        this.catalogState(this.prisma, year),
      ]);
    const present = (option: (typeof options)[number]) => ({
      id: option.id,
      code: option.code,
      label: option.label,
      amountXof: option.amountXof ?? 0,
      calculation: option.calculation,
      percentageBasisPoints: option.percentageBasisPoints,
      refundable: option.refundable,
      defaultSelected: option.defaultSelected,
      active: option.active,
    });
    const byKind = (kind: (typeof options)[number]["kind"]) =>
      options.filter((option) => option.kind === kind).map(present);
    return {
      academicYearId: academicYear.id,
      academicYearLabel: year,
      revision: schedule?.revision ?? 0,
      feeScheduleId: schedule?.id ?? null,
      feeScheduleRevision: schedule?.revision ?? 0,
      feeScheduleFingerprintSha256: schedule
        ? this.valueFingerprint(schedule)
        : null,
      billingCatalogFingerprintSha256:
        catalogState.serviceOptions.length > 0 ||
        catalogState.adjustmentDefinitions.length > 0
          ? this.catalogFingerprint(catalogState)
          : null,
      housingOptions: byKind("housing"),
      cafeteriaOptions: byKind("cafeteria"),
      insuranceOption:
        byKind("insurance").find(
          (option) => option.code === CANONICAL_INSURANCE_CODE,
        ) ?? null,
      cautionOption:
        byKind("housing_caution").find(
          (option) => option.code === CANONICAL_CAUTION_CODE,
        ) ?? null,
      awardDefinitions: definitions.map((definition) => ({
        id: definition.id,
        code: definition.key,
        label: definition.label,
        basis: definition.basis,
        calculation: definition.calculation,
        value:
          definition.calculation === "percentage"
            ? (definition.percentageBasisPoints ?? 0) / 100
            : definition.fixedAmountXof,
        percentageBasisPoints: definition.percentageBasisPoints,
        fixedAmountXof: definition.fixedAmountXof,
        stacking: definition.stacking,
        effect: definition.effect,
        requiresApproval: definition.requiresApproval,
        active: definition.active,
      })),
    };
  }

  private validateCatalog(
    input: BillingCatalogChangeInput,
    existing?: Awaited<ReturnType<BillingProfileService["catalogState"]>>,
  ) {
    if (input.serviceOptions.length < 4 || input.serviceOptions.length > 100) {
      throw new BadRequestException(
        "A billing catalog needs between 4 and 100 service options",
      );
    }
    const serviceKeys = new Set<string>();
    const serviceByKey = new Map<
      string,
      BillingCatalogChangeInput["serviceOptions"][number]
    >();
    const defaults = new Map<string, number>();
    const requiredNone = new Set([
      "housing:none",
      "cafeteria:none",
      "insurance:none",
      "housing_caution:none",
    ]);
    const costCenterByKind = {
      housing: "3700",
      cafeteria: "3600",
      insurance: "9100",
      housing_caution: "3700",
    } as const;
    for (const option of input.serviceOptions) {
      const key = `${option.kind}:${option.code}`;
      if (serviceKeys.has(key)) {
        throw new BadRequestException(`Duplicate service option ${key}`);
      }
      serviceKeys.add(key);
      serviceByKey.set(key, option);
      requiredNone.delete(key);
      if (option.costCenterCode !== costCenterByKind[option.kind]) {
        throw new BadRequestException(
          `${option.kind} must use cost center ${costCenterByKind[option.kind]}`,
        );
      }
      if (option.defaultSelected && option.active) {
        defaults.set(option.kind, (defaults.get(option.kind) ?? 0) + 1);
      }
      if (option.calculation === "fixed") {
        if (
          !Number.isSafeInteger(option.amountXof) ||
          (option.amountXof ?? -1) < 0 ||
          (option.amountXof ?? 0) > 2_000_000_000 ||
          (option.percentageBasisPoints !== null &&
            option.percentageBasisPoints !== undefined) ||
          (option.basisServiceKind !== null &&
            option.basisServiceKind !== undefined)
        ) {
          throw new BadRequestException(
            `${key} needs a non-negative whole-XOF fixed amount`,
          );
        }
      } else if (
        !Number.isInteger(option.percentageBasisPoints) ||
        (option.percentageBasisPoints ?? 0) <= 0 ||
        (option.percentageBasisPoints ?? 0) > 10_000 ||
        (option.amountXof !== null && option.amountXof !== undefined) ||
        option.kind !== "housing_caution" ||
        option.basisServiceKind !== "housing"
      ) {
        throw new BadRequestException(
          `${key} must be a housing caution percentage based on housing`,
        );
      }
      if (
        option.code === "none" &&
        (option.calculation !== "fixed" || option.amountXof !== 0)
      ) {
        throw new BadRequestException(`${key} must have a zero amount`);
      }
      if (
        option.active &&
        option.code !== "none" &&
        option.calculation === "fixed" &&
        (option.amountXof ?? 0) === 0
      ) {
        throw new BadRequestException(
          `${key} cannot be active without an approved price`,
        );
      }
      if (
        option.kind === "cafeteria" &&
        !mealPlanTypeForBillingOption(option.code)
      ) {
        throw new BadRequestException(
          `Cafeteria option ${option.code} has no supported Dining access mapping`,
        );
      }
      if (
        option.kind === "cafeteria" &&
        option.code === "half" &&
        option.active &&
        (option.amountXof ?? 0) <= 0
      ) {
        throw new BadRequestException(
          "The cafeteria half plan cannot be activated without an approved price",
        );
      }
    }
    if (requiredNone.size > 0) {
      throw new BadRequestException(
        `Required zero-charge options are missing: ${[...requiredNone].join(", ")}`,
      );
    }
    const requiredActive = [
      "housing:none",
      "cafeteria:none",
      "insurance:none",
      `insurance:${CANONICAL_INSURANCE_CODE}`,
      "housing_caution:none",
      `housing_caution:${CANONICAL_CAUTION_CODE}`,
    ];
    const missingActive = requiredActive.filter(
      (key) => !serviceByKey.get(key)?.active,
    );
    if (missingActive.length > 0) {
      throw new BadRequestException(
        `Required active billing options are missing: ${missingActive.join(", ")}`,
      );
    }
    const insurance = serviceByKey.get(
      `insurance:${CANONICAL_INSURANCE_CODE}`,
    )!;
    if (insurance.calculation !== "fixed" || (insurance.amountXof ?? 0) <= 0) {
      throw new BadRequestException(
        `insurance:${CANONICAL_INSURANCE_CODE} must be the supported active paid annual insurance option`,
      );
    }
    const caution = serviceByKey.get(
      `housing_caution:${CANONICAL_CAUTION_CODE}`,
    )!;
    if (
      caution.calculation !== "percentage_of_service" ||
      caution.basisServiceKind !== "housing" ||
      (caution.percentageBasisPoints ?? 0) <= 0
    ) {
      throw new BadRequestException(
        `housing_caution:${CANONICAL_CAUTION_CODE} must be the supported active housing percentage caution`,
      );
    }
    const unsupportedActiveToggle = input.serviceOptions.find(
      (option) =>
        option.active &&
        ((option.kind === "insurance" &&
          option.code !== "none" &&
          option.code !== CANONICAL_INSURANCE_CODE) ||
          (option.kind === "housing_caution" &&
            option.code !== "none" &&
            option.code !== CANONICAL_CAUTION_CODE)),
    );
    if (unsupportedActiveToggle) {
      throw new BadRequestException(
        `${unsupportedActiveToggle.kind}:${unsupportedActiveToggle.code} is not supported by billing-profile selection`,
      );
    }
    for (const [kind, count] of defaults) {
      if (count > 1) {
        throw new BadRequestException(
          `${kind} has more than one active default option`,
        );
      }
    }

    const definitionKeys = new Set<string>();
    for (const definition of input.adjustmentDefinitions) {
      if (definitionKeys.has(definition.key)) {
        throw new BadRequestException(
          `Duplicate adjustment definition ${definition.key}`,
        );
      }
      definitionKeys.add(definition.key);
      if (
        definition.calculation === "percentage" &&
        (!Number.isInteger(definition.percentageBasisPoints) ||
          (definition.percentageBasisPoints ?? 0) <= 0 ||
          (definition.percentageBasisPoints ?? 0) > 10_000)
      ) {
        throw new BadRequestException(
          `${definition.key} needs a percentage between 0.01% and 100%`,
        );
      }
      if (
        definition.calculation === "fixed" &&
        (!Number.isSafeInteger(definition.fixedAmountXof) ||
          (definition.fixedAmountXof ?? 0) <= 0)
      ) {
        throw new BadRequestException(
          `${definition.key} needs a positive whole-XOF fixed amount`,
        );
      }
      if (
        definition.calculation === "manual" &&
        ((definition.percentageBasisPoints !== null &&
          definition.percentageBasisPoints !== undefined) ||
          (definition.fixedAmountXof !== null &&
            definition.fixedAmountXof !== undefined))
      ) {
        throw new BadRequestException(
          `${definition.key} is manual and cannot carry a configured amount`,
        );
      }
      if (definition.calculation === "manual" && !definition.requiresApproval) {
        throw new BadRequestException(
          `${definition.key} is manual and must require Director approval`,
        );
      }
    }
    if (existing) {
      const existingOptionById = new Map(
        existing.serviceOptions.map((option) => [option.id, option]),
      );
      for (const option of input.serviceOptions) {
        if (!option.id) continue;
        const current = existingOptionById.get(option.id);
        if (!current) {
          throw new BadRequestException(
            `Billing service option ${option.id} is not part of this catalog`,
          );
        }
        if (current.kind !== option.kind || current.code !== option.code) {
          throw new BadRequestException(
            `${current.kind}:${current.code} is a stable catalog identifier and cannot be renamed`,
          );
        }
      }
      const existingDefinitionById = new Map(
        existing.adjustmentDefinitions.map((definition) => [
          definition.id,
          definition,
        ]),
      );
      for (const definition of input.adjustmentDefinitions) {
        if (!definition.id) continue;
        const current = existingDefinitionById.get(definition.id);
        if (!current) {
          throw new BadRequestException(
            `Billing adjustment definition ${definition.id} is not part of this catalog`,
          );
        }
        if (current.key !== definition.key) {
          throw new BadRequestException(
            `${current.key} is a stable adjustment identifier and cannot be renamed`,
          );
        }
      }
    }
    return input;
  }

  private async catalogState(db: DbClient, academicYearLabel: string) {
    const [serviceOptions, adjustmentDefinitions] = await Promise.all([
      db.billingServiceOption.findMany({
        where: { academicYearLabel },
        orderBy: [{ kind: "asc" }, { code: "asc" }],
      }),
      db.billingAdjustmentDefinition.findMany({
        where: { academicYearLabel },
        orderBy: { key: "asc" },
      }),
    ]);
    return { serviceOptions, adjustmentDefinitions };
  }

  private catalogFingerprint(
    state: Awaited<ReturnType<BillingProfileService["catalogState"]>>,
  ) {
    return this.valueFingerprint(state);
  }

  private catalogInputMatchesState(
    state: Awaited<ReturnType<BillingProfileService["catalogState"]>>,
    input: BillingCatalogChangeInput,
  ) {
    const serviceKey = (row: { kind: string; code: string }) =>
      `${row.kind}:${row.code}`;
    const currentServices = new Map(
      state.serviceOptions.map((option) => [serviceKey(option), option]),
    );
    const submittedServiceKeys = new Set(input.serviceOptions.map(serviceKey));
    for (const submitted of input.serviceOptions) {
      const current = currentServices.get(serviceKey(submitted));
      if (
        !current ||
        current.label !== submitted.label ||
        current.description !== (submitted.description ?? null) ||
        current.calculation !== submitted.calculation ||
        current.amountXof !== (submitted.amountXof ?? null) ||
        current.percentageBasisPoints !==
          (submitted.percentageBasisPoints ?? null) ||
        current.basisServiceKind !== (submitted.basisServiceKind ?? null) ||
        current.costCenterCode !== submitted.costCenterCode ||
        current.refundable !== submitted.refundable ||
        current.defaultSelected !== submitted.defaultSelected ||
        current.active !== submitted.active ||
        current.sortOrder !== submitted.sortOrder
      ) {
        return false;
      }
    }
    for (const current of state.serviceOptions) {
      if (submittedServiceKeys.has(serviceKey(current))) continue;
      if (current.active || current.defaultSelected) return false;
    }

    const currentDefinitions = new Map(
      state.adjustmentDefinitions.map((definition) => [
        definition.key,
        definition,
      ]),
    );
    const submittedDefinitionKeys = new Set(
      input.adjustmentDefinitions.map((definition) => definition.key),
    );
    for (const submitted of input.adjustmentDefinitions) {
      const current = currentDefinitions.get(submitted.key);
      if (
        !current ||
        current.label !== submitted.label ||
        current.description !== (submitted.description ?? null) ||
        current.basis !== submitted.basis ||
        current.calculation !== submitted.calculation ||
        current.stacking !== submitted.stacking ||
        current.effect !== submitted.effect ||
        current.percentageBasisPoints !==
          (submitted.percentageBasisPoints ?? null) ||
        current.fixedAmountXof !== (submitted.fixedAmountXof ?? null) ||
        current.requiresApproval !== submitted.requiresApproval ||
        current.active !== submitted.active ||
        current.sortOrder !== submitted.sortOrder
      ) {
        return false;
      }
    }
    for (const current of state.adjustmentDefinitions) {
      if (submittedDefinitionKeys.has(current.key)) continue;
      if (current.active) return false;
    }
    return true;
  }

  private valueFingerprint(value: unknown) {
    const json = JSON.stringify(value, (_key, item: unknown) =>
      item instanceof Date ? item.toISOString() : item,
    );
    return createHash("sha256").update(json).digest("hex");
  }

  private resolvedPlanFingerprint(plan: ResolvedPlan) {
    return this.valueFingerprint(plan);
  }

  async catalog(academicYearLabel?: string) {
    const year = await this.academicYearLabel(this.prisma, academicYearLabel);
    await this.ensureCatalog(this.prisma, year);
    const state = await this.catalogState(this.prisma, year);
    return {
      academicYearLabel: year,
      catalogFingerprint: this.catalogFingerprint(state),
      ...state,
    };
  }

  async catalogApprovalSnapshot(input: BillingCatalogChangeInput) {
    const academicYearLabel = await this.academicYearLabel(
      this.prisma,
      input.academicYearLabel,
    );
    await this.ensureCatalog(this.prisma, academicYearLabel);
    const before = await this.catalogState(this.prisma, academicYearLabel);
    this.validateCatalog(input, before);
    const fingerprint = this.catalogFingerprint(before);
    if (
      input.expectedCatalogFingerprint &&
      input.expectedCatalogFingerprint !== fingerprint
    ) {
      throw new BadRequestException(
        "The billing catalog changed; refresh it before requesting another update",
      );
    }
    if (this.catalogInputMatchesState(before, input)) {
      throw new BadRequestException(
        "No change requested: the billing catalog already has these services and adjustment definitions.",
      );
    }
    const schedule = await this.prisma.feeSchedule.findFirst({
      where: { academicYearLabel, status: "approved" },
      orderBy: { revision: "desc" },
      select: { revision: true },
    });
    return {
      before,
      baseRevision: schedule?.revision ?? 0,
      after: {
        ...input,
        academicYearLabel,
        expectedCatalogFingerprint: fingerprint,
      },
    };
  }

  async catalogStaleReason(
    tx: Prisma.TransactionClient,
    academicYearLabel: string,
    expectedFingerprint: string,
  ) {
    const state = await this.catalogState(tx, academicYearLabel);
    return this.catalogFingerprint(state) === expectedFingerprint
      ? null
      : "The billing catalog changed after this request was submitted";
  }

  async applyCatalogChange(
    tx: Prisma.TransactionClient,
    input: BillingCatalogChangeInput,
    actorId: string,
    approvalRequestId: string,
  ) {
    const existing = await this.catalogState(tx, input.academicYearLabel);
    this.validateCatalog(input, existing);
    const submittedServiceKeys = new Set(
      input.serviceOptions.map((option) => `${option.kind}:${option.code}`),
    );
    const submittedDefinitionKeys = new Set(
      input.adjustmentDefinitions.map((definition) => definition.key),
    );
    for (const option of input.serviceOptions) {
      await tx.billingServiceOption.upsert({
        where: {
          academicYearLabel_kind_code: {
            academicYearLabel: input.academicYearLabel,
            kind: option.kind,
            code: option.code,
          },
        },
        create: {
          academicYearLabel: input.academicYearLabel,
          ...option,
          id: undefined,
        },
        update: {
          label: option.label,
          description: option.description ?? null,
          calculation: option.calculation,
          amountXof: option.amountXof ?? null,
          percentageBasisPoints: option.percentageBasisPoints ?? null,
          basisServiceKind: option.basisServiceKind ?? null,
          costCenterCode: option.costCenterCode,
          refundable: option.refundable,
          defaultSelected: option.defaultSelected,
          active: option.active,
          sortOrder: option.sortOrder,
        },
      });
    }
    const omittedOptionIds = existing.serviceOptions
      .filter(
        (option) => !submittedServiceKeys.has(`${option.kind}:${option.code}`),
      )
      .map((option) => option.id);
    if (omittedOptionIds.length > 0) {
      await tx.billingServiceOption.updateMany({
        where: { id: { in: omittedOptionIds } },
        data: { active: false, defaultSelected: false },
      });
    }
    for (const definition of input.adjustmentDefinitions) {
      await tx.billingAdjustmentDefinition.upsert({
        where: {
          academicYearLabel_key: {
            academicYearLabel: input.academicYearLabel,
            key: definition.key,
          },
        },
        create: {
          academicYearLabel: input.academicYearLabel,
          ...definition,
          id: undefined,
        },
        update: {
          label: definition.label,
          description: definition.description ?? null,
          basis: definition.basis,
          calculation: definition.calculation,
          stacking: definition.stacking,
          effect: definition.effect,
          percentageBasisPoints: definition.percentageBasisPoints ?? null,
          fixedAmountXof: definition.fixedAmountXof ?? null,
          requiresApproval: definition.requiresApproval,
          active: definition.active,
          sortOrder: definition.sortOrder,
        },
      });
    }
    const omittedDefinitionIds = existing.adjustmentDefinitions
      .filter((definition) => !submittedDefinitionKeys.has(definition.key))
      .map((definition) => definition.id);
    if (omittedDefinitionIds.length > 0) {
      await tx.billingAdjustmentDefinition.updateMany({
        where: { id: { in: omittedDefinitionIds } },
        data: { active: false },
      });
    }
    await tx.auditLog.create({
      data: {
        entity: "BillingCatalog",
        entityId: input.academicYearLabel,
        action: "billing-catalog-approved-revision-applied",
        actorId,
        data: {
          approvalRequestId,
          serviceOptionCount: input.serviceOptions.length,
          adjustmentDefinitionCount: input.adjustmentDefinitions.length,
        },
      },
    });
    return {
      academicYearLabel: input.academicYearLabel,
      serviceOptionCount: input.serviceOptions.length,
      adjustmentDefinitionCount: input.adjustmentDefinitions.length,
    };
  }

  async get(studentId: string, academicYearLabel?: string) {
    const profile = await this.prisma.annualBillingProfile.findFirst({
      where: {
        studentId,
        ...(academicYearLabel
          ? { academicYearLabel: academicYearLabel.trim() }
          : { status: "active" as const }),
      },
      orderBy: [{ academicYear: { startsOn: "desc" } }, { createdAt: "desc" }],
      include: {
        selections: { orderBy: { kind: "asc" } },
        awards: {
          orderBy: { createdAt: "asc" },
          include: { invoiceAdjustment: true },
        },
        invoiceAdjustments: { orderBy: { createdAt: "asc" } },
        mealPlan: true,
        student: { include: { housingAssignments: true } },
        canonicalInvoice: {
          include: {
            term: true,
            components: true,
            payments: true,
            plan: { include: { installments: true } },
          },
        },
      },
    });
    if (!profile) return null;
    const annualInvoices = await this.prisma.invoice.findMany({
      where: {
        studentId: profile.studentId,
        academicYearLabel: profile.academicYearLabel,
        status: { not: "void" },
      },
      include: { plan: { include: { installments: true } } },
    });

    const revisionReference = `billing-profile:${profile.id}:revision:${profile.revision}`;
    const hasRevisionTaggedAdjustments = profile.invoiceAdjustments.some(
      (adjustment) =>
        adjustment.sourceReference?.startsWith(
          `billing-profile:${profile.id}:revision:`,
        ) ?? false,
    );
    const currentAdjustments = hasRevisionTaggedAdjustments
      ? profile.invoiceAdjustments.filter(
          (adjustment) => adjustment.sourceReference === revisionReference,
        )
      : profile.invoiceAdjustments;
    const invoice = profile.canonicalInvoice;
    const warnings = asWarnings(profile.mismatchWarnings);
    if (!invoice) {
      warnings.push({
        code: "canonical_invoice_missing",
        message: "This billing profile is not linked to a canonical invoice.",
        severity: "error",
      });
    } else {
      const gross = invoice.components.reduce(
        (sum, component) =>
          sum + (component.grossAmountXof ?? component.amountXof),
        0,
      );
      const net = invoice.components.reduce(
        (sum, component) => sum + component.amountXof,
        0,
      );
      if (gross !== profile.grossChargesXof) {
        warnings.push({
          code: "gross_component_mismatch",
          message:
            "Gross component snapshots do not reconcile to the billing profile.",
          severity: "error",
        });
      }
      if (
        net !== profile.netBilledXof ||
        invoice.totalAmount !== profile.netBilledXof
      ) {
        warnings.push({
          code: "net_invoice_mismatch",
          message:
            "Net components or invoice total do not reconcile to the billing profile.",
          severity: "error",
        });
      }
      const adjustmentNetXof = currentAdjustments.reduce(
        (sum, adjustment) =>
          sum +
          (adjustment.effect === "discount" ? -1 : 1) * adjustment.amountXof,
        0,
      );
      if (gross + adjustmentNetXof !== profile.netBilledXof) {
        warnings.push({
          code: "gross_adjustment_mismatch",
          message:
            "Gross charges plus current adjustments do not reconcile to the net bill.",
          severity: "error",
        });
      }
      if (invoice.status === "void") {
        warnings.push({
          code: "canonical_invoice_void",
          message: "The canonical invoice is void.",
          severity: "error",
        });
      }
    }

    const selection = (kind: (typeof profile.selections)[number]["kind"]) =>
      profile.selections.find((row) => row.kind === kind) ?? null;
    const housing = selection("housing");
    const cafeteria = selection("cafeteria");
    const insurance = selection("insurance");
    const caution = selection("housing_caution");
    const operationalHousing = profile.student.housingAssignments.find(
      (assignment) =>
        assignment.academicYearLabel === profile.academicYearLabel,
    );
    for (const [kind, row] of [
      ["housing", housing],
      ["cafeteria", cafeteria],
      ["insurance", insurance],
      ["housing_caution", caution],
    ] as const) {
      if (!row) {
        warnings.push({
          code: `missing_${kind}_selection`,
          message: `The billing profile has no ${kind.replaceAll("_", " ")} selection.`,
          severity: "error",
        });
      }
    }
    const expectedMealPlan = cafeteria
      ? mealPlanTypeForBillingOption(cafeteria.optionCode)
      : null;
    if (cafeteria && !expectedMealPlan) {
      warnings.push({
        code: "unsupported_cafeteria_option",
        message:
          "The approved cafeteria option has no supported Dining access mapping.",
        severity: "error",
      });
    } else if (expectedMealPlan !== "none" && !profile.mealPlan) {
      warnings.push({
        code: "dining_plan_missing",
        message: "Dining access is missing for the approved cafeteria plan.",
        severity: "error",
      });
    } else if (
      profile.mealPlan &&
      (profile.mealPlan.type !== expectedMealPlan ||
        profile.mealPlan.active !== (expectedMealPlan !== "none"))
    ) {
      warnings.push({
        code: "dining_plan_mismatch",
        message:
          "Dining access does not match the approved cafeteria selection.",
        severity: "error",
      });
    }
    if (
      housing &&
      housing.amountXof > 0 &&
      operationalHousing?.billedServiceOptionId !== housing.serviceOptionId
    ) {
      warnings.push({
        code: "housing_option_mismatch",
        message:
          "Housing operations do not reference the billed housing option.",
        severity: "warning",
      });
    }
    if (
      housing &&
      housing.amountXof > 0 &&
      operationalHousing?.academicYearLabel !== profile.academicYearLabel
    ) {
      warnings.push({
        code: "housing_year_mismatch",
        message: "Housing operations reference a different academic year.",
        severity: "warning",
      });
    }
    if (
      housing &&
      housing.amountXof === 0 &&
      operationalHousing &&
      operationalHousing.status === "assigned"
    ) {
      warnings.push({
        code: "housing_assignment_without_billing",
        message:
          "Housing operations still show a room assignment although this profile has no housing charge.",
        severity: "warning",
      });
    }

    const activeAdjustmentIds = new Set(
      currentAdjustments.map((adjustment) => adjustment.id),
    );
    const awardAdjustmentIds = new Set(
      profile.awards.flatMap((award) =>
        award.invoiceAdjustmentId &&
        activeAdjustmentIds.has(award.invoiceAdjustmentId)
          ? [award.invoiceAdjustmentId]
          : [],
      ),
    );
    const genericAdjustments = currentAdjustments.filter(
      (adjustment) => !awardAdjustmentIds.has(adjustment.id),
    );
    const signed = (effect: string, amountXof: number) =>
      effect === "discount" ? -amountXof : amountXof;
    const position = deriveApiAccountPosition(annualInvoices).summary;
    const serviceView = (row: (typeof profile.selections)[number] | null) =>
      row
        ? {
            kind: row.kind,
            optionCode: row.optionCode,
            code: row.optionCode,
            percentageBasisOptionCode: row.percentageBasisOptionCode,
            percentageBasisServiceKind: row.percentageBasisServiceKind,
            label: row.label,
            amountXof: row.amountXof,
            refundable: row.refundable,
          }
        : null;
    const detailedWarnings = warnings;
    const sourceAsOfDate = profile.sourceAsOfDate
      ? toDakarDateKey(profile.sourceAsOfDate)
      : null;
    return {
      id: profile.id,
      studentId: profile.studentId,
      academicYearLabel: profile.academicYearLabel,
      revision: profile.revision,
      status: profile.status,
      source: {
        kind: profile.sourceKind,
        workbookRow: profile.sourceRowNumber,
        workbookFileHash: profile.sourceWorkbookSha256,
        sourceAsOfDate,
        workbookSha256: profile.sourceWorkbookSha256,
        sheet: profile.sourceSheet,
        rowNumber: profile.sourceRowNumber,
        asOfDate: sourceAsOfDate,
      },
      housing: serviceView(housing),
      cafeteria: serviceView(cafeteria),
      insurance: {
        ...(serviceView(insurance) ?? {
          kind: "insurance" as const,
          optionCode: "none",
          code: "none",
          percentageBasisOptionCode: null,
          percentageBasisServiceKind: null,
          label: "No insurance",
          amountXof: 0,
          refundable: false,
        }),
        selected: insurance ? insurance.optionCode !== "none" : false,
        amountXof: insurance?.amountXof ?? 0,
      },
      caution: {
        ...(serviceView(caution) ?? {
          kind: "housing_caution" as const,
          optionCode: "none",
          code: "none",
          percentageBasisOptionCode: null,
          percentageBasisServiceKind: null,
          label: "No housing caution",
          amountXof: 0,
          refundable: true,
        }),
        selected: caution ? caution.optionCode !== "none" : false,
        amountXof: caution?.amountXof ?? 0,
        refundable: caution?.refundable ?? false,
      },
      awards: profile.awards
        .filter(
          (award) =>
            !award.invoiceAdjustmentId ||
            activeAdjustmentIds.has(award.invoiceAdjustmentId),
        )
        .map((award) => ({
          id: award.id,
          code: award.definitionKey,
          definitionKey: award.definitionKey,
          label: award.label,
          source: award.source,
          effect: award.effect,
          basis: award.basis,
          calculation: award.calculation,
          stacking: award.stacking,
          basisAmountXof: award.basisAmountXof,
          percentageBasisPoints: award.percentageBasisPoints,
          requiresApproval: award.requiresApproval,
          amountXof: award.amountXof,
          reason: award.reason,
        })),
      adjustments: genericAdjustments.map((adjustment) => ({
        id: adjustment.id,
        code: adjustment.code,
        label: adjustment.label,
        source: adjustment.source,
        basis: adjustment.basis,
        calculation: adjustment.calculation,
        amountXof: signed(adjustment.effect, adjustment.amountXof),
        kind: adjustment.effect,
        reason: adjustment.reason,
      })),
      grossChargesXof: profile.grossChargesXof,
      netBilledXof: profile.netBilledXof,
      paidXof:
        invoice?.payments
          .filter((payment) => payment.status === "success")
          .reduce((sum, payment) => sum + payment.amount, 0) ?? 0,
      outstandingXof: position.outstandingXof,
      accountCreditXof: position.creditXof,
      warnings: detailedWarnings,
      mismatchWarnings: detailedWarnings.map((warning) => warning.code),
    };
  }

  private preparedPlanStaleReason(
    plan: ResolvedPlan,
    input: BillingProfileChangeInput,
  ): string | null {
    const claims = input as BillingProfileChangeInput & Record<string, unknown>;
    const expectedCatalogFingerprint =
      typeof claims.billingCatalogFingerprintSha256 === "string"
        ? claims.billingCatalogFingerprintSha256
        : "";
    const expectedScheduleFingerprint =
      typeof claims.feeScheduleFingerprintSha256 === "string"
        ? claims.feeScheduleFingerprintSha256
        : "";
    const expectedPlanFingerprint =
      typeof claims.preparedPlanSha256 === "string"
        ? claims.preparedPlanSha256
        : "";
    const preparedGrossChargesXof = claims.preparedGrossChargesXof;
    const preparedNetBilledXof = claims.preparedNetBilledXof;
    if (
      !/^[a-f0-9]{64}$/.test(expectedCatalogFingerprint) ||
      !/^[a-f0-9]{64}$/.test(expectedScheduleFingerprint) ||
      !/^[a-f0-9]{64}$/.test(expectedPlanFingerprint) ||
      !Number.isSafeInteger(preparedGrossChargesXof) ||
      !Number.isSafeInteger(preparedNetBilledXof) ||
      typeof claims.feeScheduleId !== "string" ||
      !Number.isSafeInteger(claims.feeScheduleRevision)
    ) {
      return "The billing profile request is missing its prepared pricing claims";
    }
    if (
      plan.feeScheduleId !== claims.feeScheduleId ||
      plan.feeScheduleRevision !== claims.feeScheduleRevision ||
      plan.feeScheduleFingerprintSha256 !== expectedScheduleFingerprint
    ) {
      return "The approved fee schedule changed after this billing profile request was submitted";
    }
    if (plan.billingCatalogFingerprintSha256 !== expectedCatalogFingerprint) {
      return "The billing catalog changed after this billing profile request was submitted";
    }
    if (
      plan.grossChargesXof !== preparedGrossChargesXof ||
      plan.netBilledXof !== preparedNetBilledXof ||
      this.resolvedPlanFingerprint(plan) !== expectedPlanFingerprint
    ) {
      return "The prepared billing profile price changed after this request was submitted";
    }
    return null;
  }

  private async resolvePlanForStudent(
    db: DbClient,
    studentId: string,
    input: BillingProfileChangeInput,
    awardSource: "scholarship" | "admissions",
  ) {
    const plan = await this.resolvePlan(db, input, awardSource);
    const profile = await db.annualBillingProfile.findUnique({
      where: {
        studentId_academicYearLabel: {
          studentId,
          academicYearLabel: plan.academicYearLabel,
        },
      },
      include: { invoiceAdjustments: { orderBy: { createdAt: "asc" } } },
    });
    if (!profile) return plan;
    const revisionReference = `billing-profile:${profile.id}:revision:${profile.revision}`;
    const hasRevisionTags = profile.invoiceAdjustments.some((adjustment) =>
      adjustment.sourceReference?.startsWith(
        `billing-profile:${profile.id}:revision:`,
      ),
    );
    const available = profile.invoiceAdjustments.filter(
      (adjustment) =>
        !hasRevisionTags || adjustment.sourceReference === revisionReference,
    );
    const used = new Set<string>();
    for (const planned of plan.adjustments) {
      const current = available.find(
        (adjustment) =>
          !used.has(adjustment.id) &&
          adjustment.definitionId === planned.definitionId &&
          adjustment.label === planned.label &&
          adjustment.effect === planned.effect &&
          adjustment.amountXof === planned.amountXof &&
          (adjustment.reason ?? null) === (planned.reason ?? null),
      );
      if (!current) continue;
      used.add(current.id);
      planned.source = current.source;
    }
    return plan;
  }

  async approvalSnapshot(studentId: string, input: BillingProfileChangeInput) {
    const plan = await this.resolvePlanForStudent(
      this.prisma,
      studentId,
      input,
      "scholarship",
    );
    const profile = await this.prisma.annualBillingProfile.findUnique({
      where: {
        studentId_academicYearLabel: {
          studentId,
          academicYearLabel: plan.academicYearLabel,
        },
      },
      include: { selections: true, awards: true, invoiceAdjustments: true },
    });
    const baseRevision = profile?.revision ?? 0;
    if (
      input.expectedRevision !== undefined &&
      input.expectedRevision !== baseRevision
    ) {
      throw new BadRequestException(
        "The billing profile changed; refresh it before requesting another update",
      );
    }
    if (profile) {
      const revisionReference = `billing-profile:${profile.id}:revision:${profile.revision}`;
      const hasRevisionTags = profile.invoiceAdjustments.some((adjustment) =>
        adjustment.sourceReference?.startsWith(
          `billing-profile:${profile.id}:revision:`,
        ),
      );
      const currentAdjustmentIds = new Set(
        profile.invoiceAdjustments
          .filter(
            (adjustment) =>
              !hasRevisionTags ||
              adjustment.sourceReference === revisionReference,
          )
          .map((adjustment) => adjustment.id),
      );
      const awardByAdjustmentId = new Map(
        profile.awards.flatMap((award) =>
          award.invoiceAdjustmentId &&
          currentAdjustmentIds.has(award.invoiceAdjustmentId)
            ? [[award.invoiceAdjustmentId, award] as const]
            : [],
        ),
      );
      const currentAdjustments = profile.invoiceAdjustments
        .filter(
          (adjustment) =>
            !hasRevisionTags ||
            adjustment.sourceReference === revisionReference,
        )
        .map((adjustment) => ({
          definitionId: adjustment.definitionId,
          code: adjustment.code,
          label: adjustment.label,
          source: adjustment.source,
          basis: adjustment.basis,
          calculation: adjustment.calculation,
          stacking: adjustment.stacking,
          effect: adjustment.effect,
          requiresApproval:
            awardByAdjustmentId.get(adjustment.id)?.requiresApproval ?? true,
          basisAmountXof: adjustment.basisAmountXof,
          percentageBasisPoints: adjustment.percentageBasisPoints,
          amountXof: adjustment.amountXof,
          reason: adjustment.reason,
          isAward: awardByAdjustmentId.has(adjustment.id),
        }))
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        );
      const proposedAdjustments = plan.adjustments
        .map((adjustment) => ({
          definitionId: adjustment.definitionId,
          code: adjustment.code,
          label: adjustment.label,
          source: adjustment.source,
          basis: adjustment.basis,
          calculation: adjustment.calculation,
          stacking: adjustment.stacking,
          effect: adjustment.effect,
          requiresApproval: adjustment.requiresApproval,
          basisAmountXof: adjustment.basisAmountXof,
          percentageBasisPoints: adjustment.percentageBasisPoints,
          amountXof: adjustment.amountXof,
          reason: adjustment.reason,
          isAward: adjustment.isAward,
        }))
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        );
      const currentSelections = profile.selections
        .map((selection) => ({
          kind: selection.kind,
          serviceOptionId: selection.serviceOptionId,
          optionCode: selection.optionCode,
          percentageBasisOptionId: selection.percentageBasisOptionId,
          percentageBasisOptionCode: selection.percentageBasisOptionCode,
          percentageBasisServiceKind: selection.percentageBasisServiceKind,
          label: selection.label,
          amountXof: selection.amountXof,
          refundable: selection.refundable,
        }))
        .sort((left, right) => left.kind.localeCompare(right.kind));
      const proposedSelections = plan.selections
        .map((selection) => ({
          kind: selection.kind,
          serviceOptionId: selection.serviceOptionId,
          optionCode: selection.optionCode,
          percentageBasisOptionId: selection.percentageBasisOptionId,
          percentageBasisOptionCode: selection.percentageBasisOptionCode,
          percentageBasisServiceKind: selection.percentageBasisServiceKind,
          label: selection.label,
          amountXof: selection.amountXof,
          refundable: selection.refundable,
        }))
        .sort((left, right) => left.kind.localeCompare(right.kind));
      if (
        profile.grossChargesXof === plan.grossChargesXof &&
        profile.netBilledXof === plan.netBilledXof &&
        JSON.stringify(currentSelections) ===
          JSON.stringify(proposedSelections) &&
        JSON.stringify(currentAdjustments) ===
          JSON.stringify(proposedAdjustments)
      ) {
        throw new BadRequestException(
          "No change requested: the Annual profile already has these services, awards, and adjustments.",
        );
      }
    }
    return {
      before: profile,
      baseRevision,
      after: {
        ...input,
        academicYearLabel: plan.academicYearLabel,
        preparedGrossChargesXof: plan.grossChargesXof,
        preparedNetBilledXof: plan.netBilledXof,
        preparedSelections: plan.selections.map((selection) => ({
          kind: selection.kind,
          optionCode: selection.optionCode,
          percentageBasisOptionCode: selection.percentageBasisOptionCode,
          percentageBasisServiceKind: selection.percentageBasisServiceKind,
          label: selection.label,
          amountXof: selection.amountXof,
          refundable: selection.refundable,
        })),
        preparedAdjustments: plan.adjustments.map((adjustment) => ({
          label: adjustment.label,
          source: adjustment.source,
          basis: adjustment.basis,
          calculation: adjustment.calculation,
          stacking: adjustment.stacking,
          effect: adjustment.effect,
          requiresApproval: adjustment.requiresApproval,
          basisAmountXof: adjustment.basisAmountXof,
          percentageBasisPoints: adjustment.percentageBasisPoints,
          amountXof: adjustment.amountXof,
          reason: adjustment.reason,
          isAward: adjustment.isAward,
        })),
        feeScheduleId: plan.feeScheduleId,
        feeScheduleRevision: plan.feeScheduleRevision,
        feeScheduleFingerprintSha256: plan.feeScheduleFingerprintSha256,
        billingCatalogFingerprintSha256: plan.billingCatalogFingerprintSha256,
        preparedPlanSha256: this.resolvedPlanFingerprint(plan),
      },
    };
  }

  async staleReason(
    tx: Prisma.TransactionClient,
    studentId: string,
    academicYearLabel: string,
    baseRevision: number,
    change: BillingProfileChangeInput,
  ) {
    const profile = await tx.annualBillingProfile.findUnique({
      where: {
        studentId_academicYearLabel: { studentId, academicYearLabel },
      },
      include: { selections: true, awards: true, invoiceAdjustments: true },
    });
    if ((profile?.revision ?? 0) !== baseRevision) {
      return "The annual billing profile changed after this request was submitted";
    }
    if (change.academicYearLabel !== academicYearLabel) {
      return "The billing profile request academic year no longer matches its target";
    }
    const plan = await this.resolvePlanForStudent(
      tx,
      studentId,
      change,
      "scholarship",
    );
    const preparedReason = this.preparedPlanStaleReason(plan, change);
    if (preparedReason || !profile) return preparedReason;
    const revisionReference = `billing-profile:${profile.id}:revision:${profile.revision}`;
    const hasRevisionTags = profile.invoiceAdjustments.some((adjustment) =>
      adjustment.sourceReference?.startsWith(
        `billing-profile:${profile.id}:revision:`,
      ),
    );
    const normalizedAdjustments = (
      rows: readonly {
        definitionId: string | null;
        code: string;
        label: string;
        source: string;
        basis: string;
        calculation: string;
        stacking: string;
        effect: string;
        requiresApproval?: boolean;
        basisAmountXof: number | null;
        percentageBasisPoints: number | null;
        amountXof: number;
        reason: string | null;
        isAward?: boolean;
      }[],
    ) =>
      rows
        .map((row) => ({
          definitionId: row.definitionId,
          code: row.code,
          label: row.label,
          source: row.source,
          basis: row.basis,
          calculation: row.calculation,
          stacking: row.stacking,
          effect: row.effect,
          requiresApproval: row.requiresApproval ?? false,
          basisAmountXof: row.basisAmountXof,
          percentageBasisPoints: row.percentageBasisPoints,
          amountXof: row.amountXof,
          reason: row.reason,
          isAward: row.isAward ?? false,
        }))
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        );
    const currentSelections = profile.selections
      .map((selection) => ({
        kind: selection.kind,
        serviceOptionId: selection.serviceOptionId,
        optionCode: selection.optionCode,
        percentageBasisOptionId: selection.percentageBasisOptionId,
        percentageBasisOptionCode: selection.percentageBasisOptionCode,
        percentageBasisServiceKind: selection.percentageBasisServiceKind,
        label: selection.label,
        amountXof: selection.amountXof,
        refundable: selection.refundable,
      }))
      .sort((left, right) => left.kind.localeCompare(right.kind));
    const proposedSelections = plan.selections
      .map((selection) => ({
        kind: selection.kind,
        serviceOptionId: selection.serviceOptionId,
        optionCode: selection.optionCode,
        percentageBasisOptionId: selection.percentageBasisOptionId,
        percentageBasisOptionCode: selection.percentageBasisOptionCode,
        percentageBasisServiceKind: selection.percentageBasisServiceKind,
        label: selection.label,
        amountXof: selection.amountXof,
        refundable: selection.refundable,
      }))
      .sort((left, right) => left.kind.localeCompare(right.kind));
    const currentRows = profile.invoiceAdjustments.filter(
      (adjustment) =>
        !hasRevisionTags || adjustment.sourceReference === revisionReference,
    );
    const currentIds = new Set(currentRows.map((adjustment) => adjustment.id));
    const awardsByAdjustmentId = new Map(
      profile.awards.flatMap((award) =>
        award.invoiceAdjustmentId && currentIds.has(award.invoiceAdjustmentId)
          ? [[award.invoiceAdjustmentId, award] as const]
          : [],
      ),
    );
    const currentAdjustments = normalizedAdjustments(
      currentRows.map((adjustment) => ({
        ...adjustment,
        requiresApproval:
          awardsByAdjustmentId.get(adjustment.id)?.requiresApproval ?? true,
        isAward: awardsByAdjustmentId.has(adjustment.id),
      })),
    );
    const proposedAdjustments = normalizedAdjustments(plan.adjustments);
    return profile.grossChargesXof === plan.grossChargesXof &&
      profile.netBilledXof === plan.netBilledXof &&
      JSON.stringify(currentSelections) ===
        JSON.stringify(proposedSelections) &&
      JSON.stringify(currentAdjustments) === JSON.stringify(proposedAdjustments)
      ? "The Annual profile already has these services, awards, and adjustments; there is no change to apply"
      : null;
  }

  async applyApprovedChange(
    tx: Prisma.TransactionClient,
    input: {
      studentId: string;
      actorId: string;
      approvalRequestId: string;
      change: BillingProfileChangeInput;
    },
  ) {
    const plan = await this.resolvePlanForStudent(
      tx,
      input.studentId,
      input.change,
      "scholarship",
    );
    const staleReason = this.preparedPlanStaleReason(plan, input.change);
    if (staleReason) throw new BadRequestException(staleReason);
    return this.applyPlan(tx, {
      studentId: input.studentId,
      actorId: input.actorId,
      approvalRequestId: input.approvalRequestId,
      sourceKind: "staff",
      plan,
    });
  }

  async createAdmissionProfile(
    tx: Prisma.TransactionClient,
    input: {
      studentId: string;
      actorId: string;
      academicYearLabel: string;
      selection: Omit<BillingProfileChangeInput, "academicYearLabel">;
      automaticAwardKey?: string | null;
      pricingClaims: BillingProfilePricingClaims;
    },
  ) {
    const requested = input.selection;
    const extraDefinitionIds = [...(requested.awardDefinitionIds ?? [])];
    if (input.automaticAwardKey) {
      const automatic = await tx.billingAdjustmentDefinition.findUnique({
        where: {
          academicYearLabel_key: {
            academicYearLabel: input.academicYearLabel,
            key: input.automaticAwardKey,
          },
        },
        select: { id: true, active: true },
      });
      if (!automatic?.active) {
        throw new BadRequestException(
          `Automatic BAC award ${input.automaticAwardKey} is not configured for ${input.academicYearLabel}`,
        );
      }
      extraDefinitionIds.push(automatic.id);
    }
    const plan = await this.resolvePlan(
      tx,
      {
        ...requested,
        academicYearLabel: input.academicYearLabel,
        awardDefinitionIds: [...new Set(extraDefinitionIds)],
      },
      "admissions",
    );
    const pricingChanged =
      plan.feeScheduleId !== input.pricingClaims.feeScheduleId ||
      plan.feeScheduleRevision !== input.pricingClaims.feeScheduleRevision ||
      plan.feeScheduleFingerprintSha256 !==
        input.pricingClaims.feeScheduleFingerprintSha256 ||
      plan.billingCatalogFingerprintSha256 !==
        input.pricingClaims.billingCatalogFingerprintSha256;
    if (pricingChanged) {
      throw new BadRequestException(
        "The approved admission pricing changed; refresh the applicant billing options before accepting",
      );
    }
    return this.applyPlan(tx, {
      studentId: input.studentId,
      actorId: input.actorId,
      approvalRequestId: null,
      sourceKind: "admissions",
      plan,
    });
  }

  private async resolvePlan(
    db: DbClient,
    input: BillingProfileChangeInput,
    awardSource: "scholarship" | "admissions",
  ): Promise<ResolvedPlan> {
    const academicYearLabel = await this.academicYearLabel(
      db,
      input.academicYearLabel,
    );
    await this.ensureCatalog(db, academicYearLabel);
    const requestedDefinitionIds = [...new Set(input.awardDefinitionIds ?? [])];
    const manualDefinitionIds = [
      ...new Set(
        (input.manualAdjustments ?? []).flatMap((adjustment) =>
          adjustment.definitionId ? [adjustment.definitionId] : [],
        ),
      ),
    ];
    const allRequestedDefinitionIds = [
      ...new Set([...requestedDefinitionIds, ...manualDefinitionIds]),
    ];
    const [schedule, catalogServiceOptions, catalogDefinitions] =
      await Promise.all([
        db.feeSchedule.findFirst({
          where: { academicYearLabel, status: "approved" },
          orderBy: { revision: "desc" },
          include: {
            rows: { orderBy: { sequence: "asc" } },
            components: { orderBy: { sortOrder: "asc" } },
          },
        }),
        db.billingServiceOption.findMany({
          where: { academicYearLabel },
          orderBy: [{ kind: "asc" }, { code: "asc" }],
        }),
        db.billingAdjustmentDefinition.findMany({
          where: { academicYearLabel },
          orderBy: { key: "asc" },
        }),
      ]);
    if (!schedule) {
      throw new BadRequestException(
        `No approved fee schedule exists for ${academicYearLabel}`,
      );
    }
    const tuition = schedule.components.find(
      (component) => component.key === "tuition",
    );
    if (!tuition) {
      throw new BadRequestException(
        "The approved fee schedule has no tuition component",
      );
    }
    const serviceOptions = catalogServiceOptions.filter(
      (option) => option.active,
    );
    const requestedDefinitionIdSet = new Set(allRequestedDefinitionIds);
    const definitions = catalogDefinitions.filter(
      (definition) =>
        definition.active && requestedDefinitionIdSet.has(definition.id),
    );
    if (definitions.length !== allRequestedDefinitionIds.length) {
      throw new BadRequestException(
        "One or more selected award definitions are unavailable for this academic year",
      );
    }
    if (
      awardSource === "admissions" &&
      definitions.some((definition) => definition.requiresApproval)
    ) {
      throw new BadRequestException(
        "Awards requiring approval must use the Finance approval workflow before they can be applied",
      );
    }
    const definitionById = new Map(
      definitions.map((definition) => [definition.id, definition]),
    );
    if (
      requestedDefinitionIds.some(
        (id) => definitionById.get(id)?.calculation === "manual",
      )
    ) {
      throw new BadRequestException(
        "A manual award must include its reviewed amount and reason",
      );
    }
    const exclusives = definitions.filter(
      (definition) => definition.stacking === "exclusive",
    );
    if (
      exclusives.length > 1 ||
      (exclusives.length === 1 && definitions.length > 1)
    ) {
      throw new BadRequestException(
        "An exclusive award cannot be combined with another award",
      );
    }

    const select = (
      kind: (typeof serviceOptions)[number]["kind"],
      code: string,
    ) => {
      const option = serviceOptions.find(
        (candidate) => candidate.kind === kind && candidate.code === code,
      );
      if (!option) {
        throw new BadRequestException(
          `Billing option ${kind}:${code} is unavailable for ${academicYearLabel}`,
        );
      }
      return option;
    };
    const housing = select("housing", input.housingOptionCode);
    const cafeteria = select("cafeteria", input.cafeteriaOptionCode);
    if (!mealPlanTypeForBillingOption(cafeteria.code)) {
      throw new BadRequestException(
        `Cafeteria option ${cafeteria.code} has no supported Dining access mapping`,
      );
    }
    if (cafeteria.code === "half" && (cafeteria.amountXof ?? 0) <= 0) {
      throw new BadRequestException(
        "The cafeteria half plan is unavailable until an approved price exists",
      );
    }
    const insurance = select(
      "insurance",
      input.insuranceSelected ? CANONICAL_INSURANCE_CODE : "none",
    );
    const caution = select(
      "housing_caution",
      input.cautionSelected ? CANONICAL_CAUTION_CODE : "none",
    );
    if (input.cautionSelected && housing.code === "none") {
      throw new BadRequestException(
        "Housing caution cannot be selected without a housing option",
      );
    }
    const fixedAmount = (option: typeof housing) => {
      if (option.calculation === "fixed") return option.amountXof ?? 0;
      const basis =
        option.basisServiceKind === "housing" ? (housing.amountXof ?? 0) : 0;
      return Math.round((basis * (option.percentageBasisPoints ?? 0)) / 10_000);
    };
    const selections = [housing, cafeteria, insurance, caution].map(
      (option) => {
        const percentageBasisOption =
          option.calculation === "percentage_of_service" &&
          option.basisServiceKind === "housing"
            ? housing
            : null;
        return {
          kind: option.kind,
          serviceOptionId: option.id,
          optionCode: option.code,
          percentageBasisOptionId: percentageBasisOption?.id ?? null,
          percentageBasisOptionCode: percentageBasisOption?.code ?? null,
          percentageBasisServiceKind: percentageBasisOption?.kind ?? null,
          label: option.label,
          amountXof: fixedAmount(option),
          refundable: option.refundable,
        };
      },
    );

    const components: PlannedComponent[] = [
      {
        key: "tuition",
        label: tuition.label,
        costCenterCode: tuition.costCenterCode,
        grossAmountXof: tuition.annualAmountXof,
        netAmountXof: tuition.annualAmountXof,
        scheduleComponentId: tuition.id,
      },
      ...selections.map((selection) => ({
        key: selection.kind,
        label: selection.label,
        costCenterCode: serviceOptions.find(
          (option) => option.id === selection.serviceOptionId,
        )!.costCenterCode,
        grossAmountXof: selection.amountXof,
        netAmountXof: selection.amountXof,
        scheduleComponentId: null,
      })),
    ];
    const grossChargesXof = components.reduce(
      (sum, component) => sum + component.grossAmountXof,
      0,
    );
    if (grossChargesXof > MAX_PRISMA_INT_XOF) {
      throw new BadRequestException(
        "The selected annual services exceed the supported whole-XOF invoice limit",
      );
    }
    const adjustments: PlannedAdjustment[] = [];
    const component = (key: string) =>
      components.find((candidate) => candidate.key === key);
    const basisAmount = (
      basis: PlannedAdjustment["basis"],
      sequential: boolean,
    ) => {
      if (basis === "gross_charges" || basis === "manual") {
        return components.reduce(
          (sum, row) =>
            sum + (sequential ? row.netAmountXof : row.grossAmountXof),
          0,
        );
      }
      const row = component(basis);
      return row ? (sequential ? row.netAmountXof : row.grossAmountXof) : 0;
    };
    const applyMagnitude = (
      basis: PlannedAdjustment["basis"],
      effect: PlannedAdjustment["effect"],
      magnitude: number,
    ) => {
      if (magnitude === 0) return;
      const direct =
        basis !== "gross_charges" && basis !== "manual"
          ? component(basis)
          : null;
      if (effect === "charge") {
        (direct ?? component("tuition"))!.netAmountXof += magnitude;
        return;
      }
      const targets = direct ? [direct] : components;
      const capacity = targets.reduce((sum, row) => sum + row.netAmountXof, 0);
      if (magnitude > capacity) {
        throw new BadRequestException(
          "Selected discounts exceed the charges on their configured basis",
        );
      }
      for (const allocation of allocateProportionallyXof(
        magnitude,
        targets.map((row) => ({ id: row.key, availableXof: row.netAmountXof })),
      )) {
        component(allocation.id)!.netAmountXof -= allocation.amountXof;
      }
    };

    for (const definitionId of requestedDefinitionIds) {
      const definition = definitionById.get(definitionId)!;
      const sequential = definition.stacking === "sequential";
      const basisXof = basisAmount(definition.basis, sequential);
      const magnitude =
        definition.calculation === "percentage"
          ? Math.round(
              (basisXof * (definition.percentageBasisPoints ?? 0)) / 10_000,
            )
          : (definition.fixedAmountXof ?? 0);
      if (!Number.isSafeInteger(magnitude) || magnitude < 0) {
        throw new BadRequestException(
          "Award amount is not a valid whole-XOF value",
        );
      }
      applyMagnitude(definition.basis, definition.effect, magnitude);
      adjustments.push({
        definitionId: definition.id,
        code: definition.key,
        label: definition.label,
        source: awardSource,
        basis: definition.basis,
        calculation: definition.calculation,
        stacking: definition.stacking,
        effect: definition.effect,
        basisAmountXof: basisXof,
        percentageBasisPoints: definition.percentageBasisPoints,
        requiresApproval: definition.requiresApproval,
        amountXof: magnitude,
        reason: null,
        isAward: true,
      });
    }
    for (const [index, manual] of (input.manualAdjustments ?? []).entries()) {
      if (
        !Number.isSafeInteger(manual.amountXof) ||
        manual.amountXof === 0 ||
        Math.abs(manual.amountXof) > MAX_PRISMA_INT_XOF
      ) {
        throw new BadRequestException(
          "Manual adjustments must be non-zero whole XOF within the supported invoice limit",
        );
      }
      const definition = manual.definitionId
        ? definitionById.get(manual.definitionId)
        : null;
      if (definition && definition.calculation !== "manual") {
        throw new BadRequestException(
          `${definition.label} has a configured amount and cannot be entered manually`,
        );
      }
      const signedEffect = manual.amountXof < 0 ? "discount" : "charge";
      const effect = definition?.effect ?? signedEffect;
      if (definition && effect !== signedEffect) {
        throw new BadRequestException(
          `${definition.label} must be entered as a ${effect === "discount" ? "negative discount" : "positive charge"}`,
        );
      }
      const magnitude = Math.abs(manual.amountXof);
      const basis = definition?.basis ?? "manual";
      const reason = manual.reason.trim();
      const label = definition?.label ?? manual.label.trim();
      if (!reason || !label) {
        throw new BadRequestException(
          "Manual adjustments require a label and reviewed reason",
        );
      }
      const manualBasisXof = basisAmount(
        basis,
        definition?.stacking === "sequential",
      );
      applyMagnitude(basis, effect, magnitude);
      adjustments.push({
        definitionId: definition?.id ?? null,
        code: definition?.key ?? `manual_${index + 1}`,
        label,
        source: definition ? awardSource : "manual_reconciliation",
        basis,
        calculation: "manual",
        stacking: definition?.stacking ?? "additive",
        effect,
        basisAmountXof: manualBasisXof,
        percentageBasisPoints: null,
        requiresApproval: definition?.requiresApproval ?? true,
        amountXof: magnitude,
        reason,
        isAward: Boolean(definition),
      });
    }
    const netBilledXof = components.reduce(
      (sum, row) => sum + row.netAmountXof,
      0,
    );
    if (
      !Number.isSafeInteger(netBilledXof) ||
      netBilledXof < 0 ||
      netBilledXof > MAX_PRISMA_INT_XOF
    ) {
      throw new BadRequestException("The resulting annual bill is invalid");
    }
    return {
      academicYearLabel,
      feeScheduleId: schedule.id,
      feeScheduleRevision: schedule.revision,
      feeScheduleFingerprintSha256: this.valueFingerprint(schedule),
      billingCatalogFingerprintSha256: this.catalogFingerprint({
        serviceOptions: catalogServiceOptions,
        adjustmentDefinitions: catalogDefinitions,
      }),
      components,
      selections,
      adjustments,
      grossChargesXof,
      netBilledXof,
    };
  }

  private async applyPlan(
    tx: Prisma.TransactionClient,
    input: {
      studentId: string;
      actorId: string;
      approvalRequestId: string | null;
      sourceKind: "staff" | "admissions";
      plan: ResolvedPlan;
    },
  ) {
    const student = await tx.student.findFirst({
      where: {
        id: input.studentId,
        recordStatus: { in: ["active", "pending_payment"] },
      },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("Billable student not found");
    const existingProfile = await tx.annualBillingProfile.findUnique({
      where: {
        studentId_academicYearLabel: {
          studentId: input.studentId,
          academicYearLabel: input.plan.academicYearLabel,
        },
      },
    });
    const invoice = existingProfile?.canonicalInvoiceId
      ? await tx.invoice.findUnique({
          where: { id: existingProfile.canonicalInvoiceId },
          include: {
            components: { include: { allocations: true } },
            plan: { include: { installments: true } },
          },
        })
      : await tx.invoice.findFirst({
          where: {
            studentId: input.studentId,
            academicYearLabel: input.plan.academicYearLabel,
            status: { not: "void" },
            packageType: "standard_full",
          },
          orderBy: { createdAt: "desc" },
          include: {
            components: { include: { allocations: true } },
            plan: { include: { installments: true } },
          },
        });
    if (!invoice) {
      throw new BadRequestException(
        "Assign the approved annual package before applying a billing profile",
      );
    }
    if (invoice.status === "void") {
      throw new BadRequestException("The canonical annual invoice is void");
    }
    if (invoice.amountPaid > input.plan.netBilledXof) {
      throw new BadRequestException(
        "The requested net bill is below cash already applied to the invoice",
      );
    }
    const plannedByKey = new Map<string, PlannedComponent>(
      input.plan.components.map((component) => [component.key, component]),
    );
    for (const current of invoice.components) {
      const allocatedXof = current.allocations.reduce(
        (sum, allocation) =>
          sum + allocation.amountXof - allocation.refundedAmountXof,
        0,
      );
      const next = plannedByKey.get(current.kind)?.netAmountXof ?? 0;
      if (allocatedXof > next) {
        throw new BadRequestException(
          `${current.label || current.kind} cannot be reduced below its settled allocation`,
        );
      }
    }

    const nextRevision = (existingProfile?.revision ?? 0) + 1;
    const profile = existingProfile
      ? await tx.annualBillingProfile.update({
          where: { id: existingProfile.id },
          data: {
            status: "active",
            revision: nextRevision,
            sourceKind: input.sourceKind,
            feeScheduleId: input.plan.feeScheduleId,
            canonicalInvoiceId: invoice.id,
            grossChargesXof: input.plan.grossChargesXof,
            netBilledXof: input.plan.netBilledXof,
            mismatchWarnings: [],
          },
        })
      : await tx.annualBillingProfile.create({
          data: {
            studentId: input.studentId,
            academicYearLabel: input.plan.academicYearLabel,
            status: "active",
            revision: nextRevision,
            sourceKind: input.sourceKind,
            feeScheduleId: input.plan.feeScheduleId,
            canonicalInvoiceId: invoice.id,
            grossChargesXof: input.plan.grossChargesXof,
            netBilledXof: input.plan.netBilledXof,
            mismatchWarnings: [],
            createdById: input.actorId,
          },
        });

    await tx.billingProfileSelection.deleteMany({
      where: { profileId: profile.id },
    });
    await tx.billingProfileSelection.createMany({
      data: input.plan.selections.map((selection) => ({
        profileId: profile.id,
        academicYearLabel: input.plan.academicYearLabel,
        ...selection,
      })),
    });

    for (const planned of input.plan.components) {
      await tx.invoiceComponent.upsert({
        where: {
          invoiceId_kind: { invoiceId: invoice.id, kind: planned.key },
        },
        create: {
          invoiceId: invoice.id,
          scheduleComponentId: planned.scheduleComponentId,
          kind: planned.key,
          label: planned.label,
          costCenterCode: planned.costCenterCode,
          grossAmountXof: planned.grossAmountXof,
          amountXof: planned.netAmountXof,
        },
        update: {
          scheduleComponentId: planned.scheduleComponentId,
          label: planned.label,
          costCenterCode: planned.costCenterCode,
          grossAmountXof: planned.grossAmountXof,
          amountXof: planned.netAmountXof,
        },
      });
    }
    for (const current of invoice.components) {
      if (plannedByKey.has(current.kind)) continue;
      await tx.invoiceComponent.update({
        where: { id: current.id },
        data: { grossAmountXof: 0, amountXof: 0 },
      });
    }
    const components = await tx.invoiceComponent.findMany({
      where: { invoiceId: invoice.id },
      select: { id: true, kind: true, amountXof: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const componentIdByKind = new Map(
      components.map((component) => [component.kind, component.id]),
    );
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        totalAmount: input.plan.netBilledXof,
        feeScheduleId: input.plan.feeScheduleId,
        feeScheduleRevision: input.plan.feeScheduleRevision,
        revision: { increment: 1 },
        status:
          invoice.amountPaid >= input.plan.netBilledXof
            ? "paid"
            : invoice.amountPaid > 0
              ? "partial"
              : "open",
      },
    });

    if (invoice.plan) {
      const installments = invoice.plan.installments.sort(
        (left, right) => left.sequence - right.sequence,
      );
      if (installments.length === 0) {
        throw new BadRequestException(
          "The canonical annual invoice has no installments to reconcile",
        );
      }
      const allocatedPaid = installments.reduce(
        (sum, installment) => sum + installment.amountPaid,
        0,
      );
      if (allocatedPaid > input.plan.netBilledXof) {
        throw new BadRequestException(
          "The requested bill is below installment cash allocations",
        );
      }
      const outstanding = splitEvenlyXof(
        input.plan.netBilledXof - allocatedPaid,
        installments.length,
      );
      const updatedInstallments: { id: string; amountDue: number }[] = [];
      for (const [index, installment] of installments.entries()) {
        const amountDue = installment.amountPaid + outstanding[index]!;
        await tx.installment.update({
          where: { id: installment.id },
          data: {
            amountDue,
            status: projectedInstallmentStatus({
              dueDate: installment.dueDate,
              amountDue,
              amountPaid: installment.amountPaid,
            }),
          },
        });
        updatedInstallments.push({ id: installment.id, amountDue });
      }
      const grid = completeInstallmentComponentGrid(
        updatedInstallments,
        components,
      );
      await tx.installmentComponent.deleteMany({
        where: { installment: { planId: invoice.plan.id } },
      });
      await tx.installmentComponent.createMany({ data: grid });
    }

    const revisionReference = `billing-profile:${profile.id}:revision:${nextRevision}`;
    for (const adjustment of input.plan.adjustments) {
      const componentKey =
        adjustment.basis === "gross_charges" || adjustment.basis === "manual"
          ? null
          : adjustment.basis;
      const created = await tx.invoiceAdjustment.create({
        data: {
          invoiceId: invoice.id,
          invoiceComponentId: componentKey
            ? (componentIdByKind.get(componentKey) ?? null)
            : null,
          billingProfileId: profile.id,
          definitionId: adjustment.definitionId,
          code: adjustment.code,
          label: adjustment.label,
          source: adjustment.source,
          basis: adjustment.basis,
          calculation: adjustment.calculation,
          stacking: adjustment.stacking,
          effect: adjustment.effect,
          basisAmountXof: adjustment.basisAmountXof,
          percentageBasisPoints: adjustment.percentageBasisPoints,
          amountXof: adjustment.amountXof,
          reason: adjustment.reason,
          sourceReference: revisionReference,
          approvalRequestId: input.approvalRequestId,
          createdById: input.actorId,
        },
      });
      if (adjustment.isAward) {
        await tx.billingProfileAward.create({
          data: {
            profileId: profile.id,
            definitionId: adjustment.definitionId,
            definitionKey: adjustment.code,
            label: adjustment.label,
            source: adjustment.source,
            basis: adjustment.basis,
            calculation: adjustment.calculation,
            stacking: adjustment.stacking,
            effect: adjustment.effect,
            requiresApproval: adjustment.requiresApproval,
            basisAmountXof: adjustment.basisAmountXof,
            percentageBasisPoints: adjustment.percentageBasisPoints,
            amountXof: adjustment.amountXof,
            reason: adjustment.reason,
            approvalRequestId: input.approvalRequestId,
            invoiceAdjustmentId: created.id,
          },
        });
      }
    }

    await syncBillingProfileOperationsInTransaction(tx, {
      studentId: input.studentId,
      profileId: profile.id,
      academicYearLabel: input.plan.academicYearLabel,
      selections: input.plan.selections,
    });
    await tx.auditLog.create({
      data: {
        entity: "AnnualBillingProfile",
        entityId: profile.id,
        action: existingProfile
          ? "billing-profile-approved-revision-applied"
          : "billing-profile-created",
        actorId: input.actorId,
        data: {
          academicYearLabel: input.plan.academicYearLabel,
          revision: nextRevision,
          canonicalInvoiceId: invoice.id,
          grossChargesXof: input.plan.grossChargesXof,
          netBilledXof: input.plan.netBilledXof,
          approvalRequestId: input.approvalRequestId,
        },
      },
    });
    return {
      profileId: profile.id,
      revision: nextRevision,
      canonicalInvoiceId: invoice.id,
      grossChargesXof: input.plan.grossChargesXof,
      netBilledXof: input.plan.netBilledXof,
    };
  }
}

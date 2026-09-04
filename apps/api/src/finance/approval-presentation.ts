import type { ApprovalRequestKind } from "@mydaust/db";
import {
  requireCoreFeeComponents,
  type FeeComponentDefinition,
  validateFeeComponents,
} from "./fee-components.js";

export type ApprovalPresentationChange = {
  label: string;
  type: "create" | "update" | "remove" | "unchanged";
  previous?: string | null;
  proposed?: string | null;
  detail?: string | null;
};

export type ApprovalPresentation = {
  subject: string;
  summary: string;
  changes: ApprovalPresentationChange[];
  canApprove: boolean;
  blockingMessage?: string | null;
};

type PresentationInput = {
  kind: ApprovalRequestKind;
  status: string;
  academicYearLabel: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  events?: unknown[];
};

const MISSING_REQUIRED_VALUE = "\u0000MISSING\u0000";

export type ApprovalPresentationContext = {
  subject: string;
  studentNames?: string[];
  invoiceLabel?: string | null;
  componentLabel?: string | null;
  componentLabels?: Record<string, string>;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(record).filter((row) => Object.keys(row).length > 0)
    : [];
}

function text(value: unknown, fallback = MISSING_REQUIRED_VALUE) {
  return value === null || value === undefined || value === ""
    ? fallback
    : String(value);
}

function human(value: unknown, fallback = MISSING_REQUIRED_VALUE) {
  return text(value, fallback)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function yesNo(value: unknown) {
  return value === true
    ? "Yes"
    : value === false
      ? "No"
      : MISSING_REQUIRED_VALUE;
}

function safeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integerInRange(value: unknown, minimum: number, maximum: number) {
  const parsed = safeInteger(value);
  return parsed !== null && parsed >= minimum && parsed <= maximum;
}

function numberText(value: unknown, minimum: number, maximum: number) {
  const parsed = safeNumber(value);
  return parsed !== null && parsed >= minimum && parsed <= maximum
    ? String(parsed)
    : MISSING_REQUIRED_VALUE;
}

function integerText(
  value: unknown,
  minimum = Number.MIN_SAFE_INTEGER,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  const parsed = safeInteger(value);
  return parsed === null || parsed < minimum || parsed > maximum
    ? MISSING_REQUIRED_VALUE
    : String(parsed);
}

function enumHuman(value: unknown, allowed: readonly string[]) {
  return typeof value === "string" && allowed.includes(value)
    ? human(value)
    : MISSING_REQUIRED_VALUE;
}

function hasMissing(value: string | null | undefined) {
  return typeof value === "string" && value.includes(MISSING_REQUIRED_VALUE);
}

function amount(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function xof(value: unknown) {
  const parsed = safeInteger(value);
  return parsed !== null
    ? `${new Intl.NumberFormat("fr-FR").format(parsed)} XOF`
    : MISSING_REQUIRED_VALUE;
}

function date(value: unknown) {
  const shown = text(value);
  if (hasMissing(shown)) return shown;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(shown);
  if (!match) return MISSING_REQUIRED_VALUE;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? `${match[1]}-${match[2]}-${match[3]}`
    : MISSING_REQUIRED_VALUE;
}

function optionalDate(value: unknown) {
  return value === null || value === undefined || value === ""
    ? "No date set"
    : date(value);
}

function sum(values: Record<string, unknown>[], key: string) {
  return values.reduce((total, row) => total + amount(row[key]), 0);
}

function blocked(
  context: ApprovalPresentationContext,
  message = "A clear before-and-after summary could not be prepared. Reload the request or contact IT.",
): ApprovalPresentation {
  return {
    subject: context.subject,
    summary: "This request cannot be reviewed safely.",
    changes: [],
    canApprove: false,
    blockingMessage: message,
  };
}

function finish(
  context: ApprovalPresentationContext,
  summary: string,
  changes: ApprovalPresentationChange[],
) {
  if (changes.length === 0) return blocked(context);
  if (
    changes.some((change) =>
      [change.previous, change.proposed, change.detail].some(
        (value) =>
          typeof value === "string" && value.includes(MISSING_REQUIRED_VALUE),
      ),
    )
  ) {
    return blocked(
      context,
      "Required money, date, status, or identity details are missing from the human-readable review.",
    );
  }
  return {
    subject: context.subject,
    summary,
    changes,
    canApprove: true,
    blockingMessage: null,
  } satisfies ApprovalPresentation;
}

function addChange(
  changes: ApprovalPresentationChange[],
  label: string,
  previous: string | null,
  proposed: string,
  options: { creation?: boolean; removal?: boolean; detail?: string } = {},
) {
  if (!options.creation && !options.removal && previous === proposed) return;
  changes.push({
    label,
    type: options.removal ? "remove" : options.creation ? "create" : "update",
    previous,
    proposed: options.removal ? "Removed" : proposed,
    detail: options.detail ?? null,
  });
}

function splitEvenly(total: number, count: number) {
  if (count < 1) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from(
    { length: count },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

function selectedComponentTotal(value: unknown) {
  return rows(value)
    .filter((row) => row.defaultSelected !== false)
    .reduce((total, row) => total + amount(row.annualAmountXof), 0);
}

function scheduleRowValue(row: Record<string, unknown>) {
  return [
    text(row.label, "Payment"),
    date(row.dueOn),
    `Full ${xof(row.amountFullXof)}`,
    `Tuition ${xof(row.amountTuitionXof)}`,
    `Housing ${xof(row.amountHousingXof)}`,
    `Cafeteria ${xof(row.amountCafeteriaXof)}`,
  ].join(" · ");
}

function normalizedScheduleRow(
  current: Record<string, unknown>,
  submitted: Record<string, unknown>,
) {
  const readAmount = (key: string) =>
    safeInteger(submitted[key] === undefined ? current[key] : submitted[key]);
  const tuition = readAmount("amountTuitionXof");
  let housing = readAmount("amountHousingXof");
  let cafeteria = readAmount("amountCafeteriaXof");
  const requestedFull =
    submitted.amountFullXof === undefined
      ? null
      : safeInteger(submitted.amountFullXof);
  if (
    tuition === null ||
    housing === null ||
    cafeteria === null ||
    (submitted.amountFullXof !== undefined && requestedFull === null)
  )
    return null;
  if (
    requestedFull !== null &&
    submitted.amountHousingXof === undefined &&
    submitted.amountCafeteriaXof === undefined
  ) {
    const remainder = requestedFull - tuition;
    if (remainder < 0) return null;
    const oldHousing = safeInteger(current.amountHousingXof) ?? 0;
    const oldCafeteria = safeInteger(current.amountCafeteriaXof) ?? 0;
    const auxiliaryBase = oldHousing + oldCafeteria;
    const housingWeight = auxiliaryBase > 0 ? oldHousing : 680_000;
    const cafeteriaWeight = auxiliaryBase > 0 ? oldCafeteria : 630_000;
    housing = Math.floor(
      (remainder * housingWeight) / (housingWeight + cafeteriaWeight),
    );
    cafeteria = remainder - housing;
  }
  const full = tuition + housing + cafeteria;
  if (
    [tuition, housing, cafeteria, full].some(
      (value) => !Number.isSafeInteger(value) || value < 0,
    ) ||
    (requestedFull !== null && requestedFull !== full)
  )
    return null;
  return {
    ...current,
    ...submitted,
    label: submitted.label === undefined ? current.label : submitted.label,
    dueOn: submitted.dueOn === undefined ? current.dueOn : submitted.dueOn,
    amountFullXof: full,
    amountTuitionXof: tuition,
    amountHousingXof: housing,
    amountCafeteriaXof: cafeteria,
  };
}

function normalizedFeeComponent(
  current: Record<string, unknown> | undefined,
  submitted: Record<string, unknown>,
  index: number,
) {
  const annualAmountXof = safeInteger(
    submitted.annualAmountXof ?? current?.annualAmountXof,
  );
  const sortOrder = safeInteger(
    submitted.sortOrder ?? current?.sortOrder ?? index,
  );
  const defaultSelected =
    submitted.defaultSelected === undefined
      ? (current?.defaultSelected ?? true)
      : submitted.defaultSelected;
  if (
    annualAmountXof === null ||
    annualAmountXof <= 0 ||
    sortOrder === null ||
    sortOrder < 0 ||
    typeof defaultSelected !== "boolean"
  )
    return null;
  return {
    ...current,
    ...submitted,
    id: submitted.id === undefined ? (current?.id ?? null) : submitted.id,
    key: submitted.key ?? current?.key,
    label: submitted.label ?? current?.label,
    description:
      submitted.description === undefined
        ? (current?.description ?? null)
        : submitted.description,
    costCenterCode: submitted.costCenterCode ?? current?.costCenterCode,
    annualAmountXof,
    defaultSelected,
    sortOrder,
  };
}

function normalizedFeeSchedule(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const oldRows = rows(before.rows);
  const oldComponents = rows(before.components);
  let candidateRows: Record<string, unknown>[];
  if (typeof after.rowId === "string") {
    const changed = oldRows.find((row) => row.id === after.rowId);
    if (!changed) return null;
    const input = record(after.input);
    candidateRows = [];
    for (const row of oldRows) {
      const normalized = normalizedScheduleRow(
        row,
        row === changed ? input : {},
      );
      if (!normalized) return null;
      candidateRows.push(normalized);
    }
  } else {
    const requestedRows = rows(after.rows);
    if (!requestedRows.length) return null;
    if (oldRows.length) {
      if (requestedRows.length !== oldRows.length) return null;
      const requestedById = new Map(
        requestedRows.map((row) => [text(row.id, ""), row]),
      );
      if (requestedById.has("") || requestedById.size !== oldRows.length)
        return null;
      candidateRows = [];
      for (const row of oldRows) {
        const submitted = requestedById.get(text(row.id, ""));
        if (!submitted) return null;
        const normalized = normalizedScheduleRow(row, submitted);
        if (!normalized) return null;
        candidateRows.push(normalized);
      }
    } else {
      candidateRows = [];
      for (const [index, submitted] of requestedRows.entries()) {
        const normalized = normalizedScheduleRow(
          {
            sequence: index + 1,
            amountFullXof: 0,
            amountTuitionXof: 0,
            amountHousingXof: 0,
            amountCafeteriaXof: 0,
          },
          submitted,
        );
        if (!normalized) return null;
        candidateRows.push(normalized);
      }
    }
  }

  if (Array.isArray(after.components) && after.components.length === 0)
    return null;
  const componentsProvided = Array.isArray(after.components);
  let proposedComponents: Record<string, unknown>[];
  if (componentsProvided) {
    const submitted = rows(after.components);
    if (submitted.length !== (after.components as unknown[]).length)
      return null;
    const oldById = new Map(
      oldComponents.map((row) => [text(row.id, ""), row]),
    );
    const oldByKey = new Map(
      oldComponents.map((row) => [text(row.key, ""), row]),
    );
    proposedComponents = [];
    for (const [index, raw] of submitted.entries()) {
      const id = raw.id === undefined ? null : text(raw.id, "");
      const requestedKey = text(raw.key, "");
      const current = id ? oldById.get(id) : oldByKey.get(requestedKey);
      if (
        (id && !current) ||
        (current && id && requestedKey && current.key !== requestedKey) ||
        (current &&
          raw.costCenterCode !== undefined &&
          raw.costCenterCode !== current.costCenterCode)
      )
        return null;
      const normalized = normalizedFeeComponent(current, raw, index);
      if (!normalized) return null;
      proposedComponents.push(normalized);
    }
  } else if (oldComponents.length) {
    const annualCoreTotals = new Map([
      ["tuition", sum(candidateRows, "amountTuitionXof")],
      ["housing", sum(candidateRows, "amountHousingXof")],
      ["cafeteria", sum(candidateRows, "amountCafeteriaXof")],
    ]);
    proposedComponents = oldComponents.map((component, index) => {
      const normalized = normalizedFeeComponent(component, {}, index);
      return {
        ...(normalized ?? component),
        annualAmountXof:
          annualCoreTotals.get(text(component.key, "")) ??
          component.annualAmountXof,
      };
    });
  } else {
    const core = [
      ["tuition", "Tuition", "9100", "amountTuitionXof"],
      ["housing", "Housing", "3700", "amountHousingXof"],
      ["cafeteria", "Cafeteria", "3600", "amountCafeteriaXof"],
    ] as const;
    proposedComponents = core.flatMap(
      ([key, label, costCenterCode, amountKey], index) => {
        const annualAmountXof = sum(candidateRows, amountKey);
        return annualAmountXof > 0
          ? [
              {
                id: null,
                key,
                label,
                description: null,
                costCenterCode,
                annualAmountXof,
                defaultSelected: true,
                sortOrder: index,
              },
            ]
          : [];
      },
    );
  }
  try {
    const validated = validateFeeComponents(
      proposedComponents as FeeComponentDefinition[],
    );
    proposedComponents = componentsProvided
      ? requireCoreFeeComponents(validated)
      : validated;
  } catch {
    return null;
  }
  if (!proposedComponents.length) return null;
  const selected = proposedComponents.filter(
    (component) => component.defaultSelected === true,
  );
  if (!selected.length) return null;
  if (
    proposedComponents.some((component) =>
      hasMissing(feeComponentValue(component)),
    )
  )
    return null;
  const componentTotal = (key: string) =>
    safeInteger(
      selected.find((component) => component.key === key)?.annualAmountXof ?? 0,
    ) ?? 0;
  const fullAmounts = splitEvenly(
    selected.reduce(
      (total, component) =>
        total + (safeInteger(component.annualAmountXof) ?? 0),
      0,
    ),
    candidateRows.length,
  );
  const tuitionAmounts = splitEvenly(
    componentTotal("tuition"),
    candidateRows.length,
  );
  const housingAmounts = splitEvenly(
    componentTotal("housing"),
    candidateRows.length,
  );
  const cafeteriaAmounts = splitEvenly(
    componentTotal("cafeteria"),
    candidateRows.length,
  );
  const nextRows: Record<string, unknown>[] = candidateRows.map(
    (row, index) => ({
      ...row,
      amountFullXof: fullAmounts[index],
      amountTuitionXof: tuitionAmounts[index],
      amountHousingXof: housingAmounts[index],
      amountCafeteriaXof: cafeteriaAmounts[index],
    }),
  );
  if (
    [...oldRows, ...nextRows].some((row) =>
      hasMissing(scheduleRowValue(row)),
    ) ||
    oldComponents.some((row) => hasMissing(feeComponentValue(row)))
  )
    return null;
  return { oldRows, nextRows, oldComponents, proposedComponents };
}

function feeComponentValue(row: Record<string, unknown>) {
  return [
    `Label ${text(row.label)}`,
    `Key ${text(row.key)}`,
    text(row.description, "No description"),
    xof(row.annualAmountXof),
    row.defaultSelected === false
      ? "Optional"
      : row.defaultSelected === true
        ? "Included by default"
        : MISSING_REQUIRED_VALUE,
    `Cost center ${text(row.costCenterCode)}`,
    `Display order ${integerText(row.sortOrder, 0, 999)}`,
  ].join(" · ");
}

function serviceOptionValue(row: Record<string, unknown>) {
  const calculation =
    row.calculation === "fixed" || row.calculation === "percentage_of_service"
      ? row.calculation
      : null;
  const percentage = safeInteger(row.percentageBasisPoints);
  const price =
    calculation === "percentage_of_service"
      ? percentage !== null
        ? `${percentage / 100}% of ${human(row.basisServiceKind)}`
        : MISSING_REQUIRED_VALUE
      : calculation === "fixed"
        ? xof(row.amountXof)
        : MISSING_REQUIRED_VALUE;
  return [
    `Label ${text(row.label)}`,
    `Code ${text(row.code)}`,
    `Service ${human(row.kind)}`,
    text(row.description, "No description"),
    `Calculation ${calculation ? human(calculation) : MISSING_REQUIRED_VALUE}`,
    price,
    `Cost center ${text(row.costCenterCode)}`,
    `Refundable ${yesNo(row.refundable)}`,
    `Default selection ${yesNo(row.defaultSelected)}`,
    row.active === true
      ? "Active"
      : row.active === false
        ? "Inactive"
        : MISSING_REQUIRED_VALUE,
    `Display order ${integerText(row.sortOrder, 0, 999)}`,
  ].join(" · ");
}

function adjustmentDefinitionValue(row: Record<string, unknown>) {
  const calculation =
    row.calculation === "percentage" ||
    row.calculation === "fixed" ||
    row.calculation === "manual"
      ? row.calculation
      : null;
  const percentage = safeInteger(row.percentageBasisPoints);
  const value =
    calculation === "percentage"
      ? percentage !== null
        ? `${percentage / 100}% of ${human(row.basis)}`
        : MISSING_REQUIRED_VALUE
      : calculation === "fixed"
        ? xof(row.fixedAmountXof)
        : calculation === "manual"
          ? "Amount entered on annual profile"
          : MISSING_REQUIRED_VALUE;
  return [
    `Label ${text(row.label)}`,
    `Key ${text(row.key)}`,
    text(row.description, "No description"),
    enumHuman(row.effect, ["discount", "charge"]),
    `Calculation ${calculation ? human(calculation) : MISSING_REQUIRED_VALUE}`,
    value,
    `Basis ${human(row.basis)}`,
    `Stacking ${human(row.stacking)}`,
    `Director approval required ${yesNo(row.requiresApproval)}`,
    row.active === true
      ? "Active"
      : row.active === false
        ? "Inactive"
        : MISSING_REQUIRED_VALUE,
    `Display order ${integerText(row.sortOrder, 0, 999)}`,
  ].join(" · ");
}

function profileAdjustmentValue(row: Record<string, unknown>) {
  const signed =
    row.effect === "discount" ? `−${xof(row.amountXof)}` : xof(row.amountXof);
  const percentageValue = safeInteger(row.percentageBasisPoints);
  const percentage =
    row.calculation === "percentage"
      ? percentageValue === null
        ? MISSING_REQUIRED_VALUE
        : `${percentageValue / 100}% of ${human(row.basis)}`
      : null;
  return [
    row.isAward === true ? "Award" : "Adjustment",
    text(row.label, "Adjustment"),
    `Source ${human(row.source, row.isAward === true ? "Catalog award" : "Manual reconciliation")}`,
    human(row.effect),
    signed,
    percentage,
    `Basis ${human(row.basis)}`,
    `Calculation ${enumHuman(row.calculation, ["percentage", "fixed", "manual"])}`,
    `Stacking ${human(row.stacking)}`,
    `Director approval required ${yesNo(row.requiresApproval)}`,
    `Reason: ${text(row.reason, "No reason supplied")}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function profileSelectionValue(row: Record<string, unknown>) {
  const percentageBasis = row.percentageBasisOptionCode
    ? `Percentage basis ${text(row.percentageBasisOptionCode)} (${human(row.percentageBasisServiceKind)})`
    : null;
  return [
    text(row.label, human(row.optionCode)),
    `Option ${text(row.optionCode)}`,
    xof(row.amountXof),
    percentageBasis,
    `Refundable ${yesNo(row.refundable)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function levelsValue(value: unknown) {
  return rows(value)
    .map(
      (row) =>
        `${text(row.name, human(row.code))} (${text(row.code)}) through ${integerText(row.creditCeiling, 0, 1_000)} credits`,
    )
    .join("; ");
}

function standingsValue(value: unknown) {
  return rows(value)
    .map(
      (row) =>
        `${text(row.label, human(row.code))} (${text(row.code)}): GPA ${numberText(row.minimumGpa, 0, 4)}+, ${human(row.tone)}, order ${integerText(row.order, 0, 100)}`,
    )
    .join("; ");
}

function programValue(program: Record<string, unknown>) {
  const curriculum = rows(program.curriculum);
  if (
    curriculum.some(
      (entry) =>
        !entry.courseCode ||
        !integerInRange(entry.yearIndex, 1, 8) ||
        !["Fall", "Spring", "Summer"].includes(String(entry.semester)) ||
        !integerInRange(entry.position, 0, 999),
    )
  )
    return null;
  const customLevels = rows(program.customLevels);
  const requirements = rows(program.requirements);
  const customStanding = rows(program.customStandingRules);
  return [
    `Name ${text(program.programName)}`,
    `${human(program.progressionMode)} progression`,
    customLevels.length
      ? `Levels: ${levelsValue(customLevels)}`
      : "Default levels",
    `Requirements: ${requirements.map((row) => `${text(row.category)} ${integerText(row.requiredCredits, 1, 1_000)} credits`).join("; ") || "None"}`,
    `Curriculum: ${curriculum.map((row) => `${text(row.courseCode)} — year ${integerText(row.yearIndex, 1, 8)}, ${text(row.semester)}, position ${(safeInteger(row.position) ?? -1) + 1}`).join("; ") || "None"}`,
    `${human(program.standingMode)} standing rules`,
    customStanding.length
      ? `Standing: ${standingsValue(customStanding)}`
      : "Default standing rules",
  ].join(" · ");
}

function budgetSnapshot(value: unknown) {
  const root = record(value);
  const draft = record(root.draft);
  return Object.keys(draft).length ? draft : root;
}

function budgetTotals(value: unknown) {
  const snapshot = budgetSnapshot(value);
  const income = new Set([
    "bursar",
    "research_grants",
    "service_contracts",
    "donations_sponsorships",
    "scholarships",
    "others",
  ]);
  return rows(snapshot.lines).reduce(
    (totals: { opening: number; income: number; expense: number }, line) => {
      totals[income.has(text(line.categoryKey, "")) ? "income" : "expense"] +=
        amount(line.amountXof);
      return totals;
    },
    {
      opening: amount(snapshot.openingBalanceXof),
      income: 0,
      expense: 0,
    },
  );
}

function budgetMonth(year: string, index: number) {
  const names = [
    "August",
    "September",
    "October",
    "November",
    "December",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
  ];
  const start = Number(year.match(/\d{4}/)?.[0]);
  const calendarYear = Number.isSafeInteger(start)
    ? start + (index >= 5 ? 1 : 0)
    : null;
  return `${names[index] ?? `Month ${index + 1}`}${calendarYear ? ` ${calendarYear}` : ""}`;
}

function approvedNoOp(events: unknown[] | undefined) {
  return (events ?? []).some((event) => {
    const result = record(record(record(event).data).result);
    return result.alreadySelected === true || result.alreadyStandard === true;
  });
}

function paymentComponentSummary(
  value: unknown,
  context: ApprovalPresentationContext,
) {
  const result: string[] = [];
  for (const component of rows(value)) {
    const label =
      context.componentLabels?.[text(component.invoiceComponentId, "")];
    if (!label) return null;
    result.push(`${label} ${xof(component.amountXof ?? component.amountDue)}`);
  }
  return result.sort().join(", ");
}

function paymentInstallmentValue(
  row: Record<string, unknown>,
  context: ApprovalPresentationContext,
) {
  const componentRows = rows(row.components);
  const components = paymentComponentSummary(componentRows, context);
  if (componentRows.length && components === null) return null;
  return [
    `Label ${text(row.label, "Payment")}`,
    date(row.dueDate),
    xof(row.amountDue),
    components ? `Allocation: ${components}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function enrollmentFailureValue(failure: Record<string, unknown>) {
  switch (String(failure.gate ?? "")) {
    case "prerequisite": {
      const courses = rows(failure.courses);
      if (!courses.length || courses.some((course) => !course.code))
        return null;
      return `Missing prerequisite: ${rows(failure.courses)
        .map(
          (course) =>
            `${text(course.code, "Course")}${course.minGrade ? ` with grade ${text(course.minGrade)}` : ""}`,
        )
        .join(", ")}`;
    }
    case "corequisite": {
      const courses = Array.isArray(failure.courses)
        ? failure.courses.filter(
            (course): course is string =>
              typeof course === "string" && course.trim().length > 0,
          )
        : [];
      return courses.length
        ? `Missing corequisite: ${courses.join(", ")}`
        : null;
    }
    case "capacity":
      if (
        !Number.isSafeInteger(Number(failure.taken)) ||
        !Number.isSafeInteger(Number(failure.capacity))
      )
        return null;
      return `Section capacity: ${text(failure.taken)} enrolled of ${text(failure.capacity)} seats`;
    case "holds": {
      const kinds = Array.isArray(failure.kinds)
        ? failure.kinds.filter(
            (kind): kind is string =>
              typeof kind === "string" && kind.trim().length > 0,
          )
        : [];
      return kinds.length
        ? `Active holds: ${kinds.map((value) => human(value)).join(", ")}`
        : null;
    }
    case "credit_cap":
      if (
        [failure.currentCredits, failure.afterAdd, failure.ceiling].some(
          (value) => !Number.isFinite(Number(value)),
        )
      )
        return null;
      return `Credit load: ${text(failure.currentCredits)} current, ${text(failure.afterAdd)} after enrollment, ${text(failure.ceiling)} allowed`;
    case "standing":
      if (!failure.required || !failure.actual) return null;
      return `Academic standing: requires ${human(failure.required)}, student has ${human(failure.actual)}`;
    case "major_restriction":
      return failure.required
        ? `Programme restriction: ${text(failure.required)}`
        : null;
    case "record_status":
      if (!failure.status) return null;
      return `Student record status: ${human(failure.status)}`;
    case "add_deadline":
      if (!failure.closedOn) return null;
      return `Add deadline closed on ${date(failure.closedOn)}`;
    default:
      return null;
  }
}

export function buildApprovalPresentation(
  input: PresentationInput,
  context: ApprovalPresentationContext,
): ApprovalPresentation {
  const before = record(input.beforeJson);
  const after = record(input.afterJson);
  const year = input.academicYearLabel ?? text(after.academicYearLabel, "");

  switch (input.kind) {
    case "academic_catalog": {
      const changes: ApprovalPresentationChange[] = [];
      const creating = !before.yearLabel;
      addChange(
        changes,
        "Academic year",
        creating ? null : text(before.yearLabel),
        text(after.yearLabel, year),
        { creation: creating },
      );
      addChange(
        changes,
        "Catalog dates",
        creating
          ? null
          : `${optionalDate(before.startsOn)} to ${optionalDate(before.endsOn)}`,
        `${optionalDate(after.startsOn)} to ${optionalDate(after.endsOn)}`,
        { creation: creating },
      );
      addChange(
        changes,
        "Activate academic year",
        creating ? null : yesNo(before.activateYear),
        yesNo(after.activateYear),
        { creation: creating },
      );
      addChange(
        changes,
        "Default progression levels",
        creating ? null : levelsValue(before.defaultLevels),
        levelsValue(after.defaultLevels),
        { creation: creating },
      );
      addChange(
        changes,
        "Default academic standing",
        creating ? null : standingsValue(before.defaultStandingRules),
        standingsValue(after.defaultStandingRules),
        { creation: creating },
      );
      const oldUngraded = record(before.notYetGradedStanding);
      const nextUngraded = record(after.notYetGradedStanding);
      addChange(
        changes,
        "Not-yet-graded standing",
        creating
          ? null
          : `${text(oldUngraded.label)} · ${human(oldUngraded.tone)}`,
        `${text(nextUngraded.label)} · ${human(nextUngraded.tone)}`,
        { creation: creating },
      );
      const oldPrograms = rows(before.programs);
      const nextPrograms = rows(after.programs);
      const oldByCode = new Map(
        oldPrograms.map((row) => [text(row.programCode), row]),
      );
      const nextCodes = new Set(
        nextPrograms.map((row) => text(row.programCode)),
      );
      for (const next of nextPrograms) {
        const code = text(next.programCode, "");
        const old = oldByCode.get(code);
        const proposed = programValue(next);
        const previous = old ? programValue(old) : null;
        if (!code || !proposed || (old && !previous))
          return blocked(
            context,
            "A programme or curriculum entry could not be translated into a complete human-readable review.",
          );
        addChange(
          changes,
          `${text(next.programName, "Programme")} (${code})`,
          previous,
          proposed,
          { creation: !old },
        );
      }
      for (const old of oldPrograms) {
        const code = text(old.programCode, "");
        if (nextCodes.has(code)) continue;
        const previous = programValue(old);
        if (!previous) return blocked(context);
        addChange(
          changes,
          `${text(old.programName, "Programme")} (${code})`,
          previous,
          "Removed",
          { removal: true },
        );
      }
      return finish(
        context,
        `Academic catalog for ${text(after.yearLabel, year)}`,
        changes,
      );
    }

    case "global_fee_schedule": {
      const normalized = normalizedFeeSchedule(before, after);
      if (!normalized)
        return blocked(
          context,
          "The fee schedule is missing a required installment or component value.",
        );
      const { oldRows, nextRows, oldComponents, proposedComponents } =
        normalized;
      const changes: ApprovalPresentationChange[] = [];
      const oldTotal = oldComponents.length
        ? selectedComponentTotal(oldComponents)
        : sum(oldRows, "amountFullXof");
      const nextTotal = selectedComponentTotal(proposedComponents);
      addChange(
        changes,
        "Annual standard package",
        xof(oldTotal),
        xof(nextTotal),
      );
      const oldById = new Map(
        oldRows.map((row, index) => [
          text(row.id, `sequence-${index + 1}`),
          row,
        ]),
      );
      const nextIds = new Set(
        nextRows.map((row, index) => text(row.id, `sequence-${index + 1}`)),
      );
      const changedRowId = typeof after.rowId === "string" ? after.rowId : null;
      for (const [index, next] of nextRows.entries()) {
        const old = oldById.get(text(next.id, `sequence-${index + 1}`));
        if (old && changedRowId === next.id) {
          addChange(
            changes,
            "Payment label",
            text(old.label, "Payment"),
            text(next.label, "Payment"),
          );
          addChange(changes, "Due date", date(old.dueOn), date(next.dueOn));
          addChange(
            changes,
            "Full package",
            xof(old.amountFullXof),
            xof(next.amountFullXof),
          );
          addChange(
            changes,
            "Tuition",
            xof(old.amountTuitionXof),
            xof(next.amountTuitionXof),
          );
          addChange(
            changes,
            "Housing",
            xof(old.amountHousingXof),
            xof(next.amountHousingXof),
          );
          addChange(
            changes,
            "Cafeteria",
            xof(old.amountCafeteriaXof),
            xof(next.amountCafeteriaXof),
          );
        } else {
          addChange(
            changes,
            `Installment ${integerText(next.sequence)}`,
            old ? scheduleRowValue(old) : null,
            scheduleRowValue(next),
            { creation: !old },
          );
        }
      }
      for (const [index, old] of oldRows.entries()) {
        if (nextIds.has(text(old.id, `sequence-${index + 1}`))) continue;
        addChange(
          changes,
          `Installment ${integerText(old.sequence)}`,
          scheduleRowValue(old),
          "Removed",
          { removal: true },
        );
      }
      const componentKey = (row: Record<string, unknown>) => text(row.key, "");
      const oldByKey = new Map(
        oldComponents.map((row) => [componentKey(row), row]),
      );
      const nextKeys = new Set(proposedComponents.map(componentKey));
      for (const next of proposedComponents) {
        const old = oldByKey.get(componentKey(next));
        addChange(
          changes,
          text(next.label, "Fee component"),
          old ? feeComponentValue(old) : null,
          feeComponentValue(next),
          { creation: !old },
        );
      }
      for (const old of oldComponents) {
        if (nextKeys.has(componentKey(old))) continue;
        addChange(
          changes,
          text(old.label, "Fee component"),
          feeComponentValue(old),
          "Removed",
          { removal: true },
        );
      }
      return finish(
        context,
        changedRowId
          ? `Update ${text(nextRows.find((row) => row.id === changedRowId)?.label, "payment")}${year ? ` for ${year}` : ""}`
          : `Fees and payment schedule${year ? ` for ${year}` : ""}`,
        changes,
      );
    }

    case "custom_charge": {
      const billingContext = record(after.billingContext);
      const count =
        context.studentNames?.length ??
        (Array.isArray(after.studentIds) ? after.studentIds.length : 0);
      const changes: ApprovalPresentationChange[] = [
        {
          label: "Billing period",
          type: "create",
          previous: null,
          // billingContext is captured at submission time by this release, so a
          // request queued before it shipped carries none. A missing term name
          // must not make an otherwise-reviewable charge unapprovable.
          proposed: `${text(billingContext.termName, "Term not recorded")} · ${text(billingContext.academicYearLabel, year)}`,
        },
        {
          label: "Charge",
          type: "create",
          previous: null,
          proposed: `${text(after.description, "Custom charge")} · ${xof(after.amountXof)} · Cost center ${text(after.costCenterCode, "Default tuition center")}`,
        },
        {
          label: "Students",
          type: "create",
          previous: null,
          proposed:
            context.studentNames?.join(", ") ||
            `${count || 1} selected student${count === 1 ? "" : "s"}`,
        },
      ];
      const schedule = rows(after.installments);
      if (schedule.length)
        schedule.forEach((row, index) =>
          changes.push({
            label: text(row.label, `Payment ${index + 1}`),
            type: "create",
            previous: null,
            proposed: `${date(row.dueDate)} · ${xof(row.amountXof)}`,
          }),
        );
      else
        changes.push({
          label: "Due date",
          type: "create",
          previous: null,
          proposed: date(after.dueDate),
        });
      return finish(
        context,
        `Create ${text(after.description, "a custom charge")}`,
        changes,
      );
    }

    case "charge_removal": {
      const installments = rows(record(before.plan).installments);
      const paid = amount(before.amountPaid);
      const detail = [
        before.number ? `Invoice ${text(before.number)}` : null,
        before.academicYearLabel
          ? `Academic year ${text(before.academicYearLabel)}`
          : null,
        `Status ${human(before.status)}`,
        `Total ${xof(before.totalAmount)}`,
        `Paid ${xof(before.amountPaid)}`,
        `Outstanding ${xof(amount(before.totalAmount) - amount(before.amountPaid))}`,
        paid > 0
          ? `${xof(paid)} already paid becomes an account credit; this is not a cash refund`
          : null,
        before.costCenterCode
          ? `Cost center ${text(before.costCenterCode)}`
          : null,
        installments.length
          ? `Schedule: ${installments.map((row) => `${date(row.dueDate)} ${xof(row.amountDue)}`).join("; ")}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return finish(context, `Remove ${context.invoiceLabel ?? "a charge"}`, [
        {
          label: "Charge",
          type: "remove",
          previous:
            context.invoiceLabel ?? text(before.description, "Student charge"),
          proposed: "Removed",
          detail,
        },
      ]);
    }

    case "payment_plan": {
      const mode =
        typeof after.mode === "string" &&
        [
          "create",
          "update",
          "replace",
          "restore_standard",
          "add_component",
          "remove_component",
        ].includes(after.mode)
          ? after.mode
          : null;
      if (!mode) return blocked(context);
      const label =
        context.componentLabel ??
        text(record(after.catalogSnapshot).label, "Annual charge");
      if (
        ["add_component", "remove_component"].includes(mode) &&
        input.status === "approved" &&
        approvedNoOp(input.events)
      ) {
        const included = mode === "add_component";
        return finish(
          context,
          `No change applied — ${label} was already ${included ? "included" : "not included"}.`,
          [
            {
              label,
              type: "unchanged",
              previous: included ? "Included" : "Not included",
              proposed: included ? "Included" : "Not included",
              detail:
                "The approval was recorded, but the approved bill did not change.",
            },
          ],
        );
      }
      if (mode === "add_component" || mode === "remove_component") {
        const adding = mode === "add_component";
        return finish(context, `${adding ? "Add" : "Remove"} ${label}`, [
          {
            label,
            type: adding ? "create" : "remove",
            previous: adding ? null : "Included",
            proposed: adding ? "Included" : "Removed",
            detail: `${xof(record(after.catalogSnapshot).annualAmountXof)} · Cost center ${text(record(after.catalogSnapshot).costCenterCode)}`,
          },
        ]);
      }
      if (mode === "restore_standard")
        return finish(context, "Restore the approved standard payment plan", [
          {
            label: "Payment plan",
            type: "update",
            previous: "Individual plan",
            proposed: "Approved standard plan",
          },
        ]);

      const oldRows = rows(record(before.plan).installments).sort(
        (left, right) => amount(left.sequence) - amount(right.sequence),
      );
      const requested = rows(after.installments);
      if (!requested.length) return blocked(context);
      let nextRows: Record<string, unknown>[];
      if (mode === "create") {
        const totalAmount = safeInteger(before.totalAmount);
        if (totalAmount === null) return blocked(context);
        const normalized: Record<string, unknown>[] = [];
        for (const row of requested) {
          const sequence = safeInteger(row.sequence);
          const hasFixed = row.amount !== undefined;
          const hasPercent = row.percent !== undefined;
          const fixed = hasFixed ? safeInteger(row.amount) : null;
          const percent = hasPercent ? safeNumber(row.percent) : null;
          if (
            sequence === null ||
            sequence < 1 ||
            hasFixed === hasPercent ||
            (hasFixed && fixed === null) ||
            (hasPercent && percent === null) ||
            (fixed !== null && fixed < 0) ||
            (percent !== null && (percent < 0 || percent > 100))
          )
            return blocked(context);
          normalized.push({
            ...row,
            sequence,
            label: null,
            amountDue:
              fixed ?? Math.round((totalAmount * (percent as number)) / 100),
            components: [],
          });
        }
        if (
          new Set(normalized.map((row) => row.sequence)).size !==
          normalized.length
        )
          return blocked(context);
        nextRows = normalized;
      } else if (mode === "update") {
        const updates = new Map(
          requested.map((row) => [text(row.id, ""), row]),
        );
        const existingIds = new Set(oldRows.map((row) => text(row.id, "")));
        if (
          updates.has("") ||
          updates.size !== requested.length ||
          [...updates.keys()].some((id) => !existingIds.has(id))
        )
          return blocked(context);
        nextRows = oldRows.map((old) => {
          const patch = updates.get(text(old.id, ""));
          return patch
            ? {
                ...old,
                ...patch,
                sequence: old.sequence,
                label:
                  patch.label === undefined
                    ? old.label
                    : String(patch.label ?? "").trim() || null,
                components:
                  patch.components === undefined
                    ? old.components
                    : patch.components,
              }
            : old;
        });
      } else
        nextRows = requested
          .map((row) => {
            const sequence = safeInteger(row.sequence);
            return {
              ...row,
              sequence:
                sequence !== null && sequence > 0
                  ? sequence
                  : MISSING_REQUIRED_VALUE,
            };
          })
          .sort(
            (left, right) => amount(left.sequence) - amount(right.sequence),
          );

      if (
        mode === "replace" &&
        new Set(nextRows.map((row) => row.sequence)).size !== nextRows.length
      )
        return blocked(context);

      const renderedOld = oldRows.map((row) =>
        paymentInstallmentValue(row, context),
      );
      const renderedNext = nextRows.map((row) =>
        paymentInstallmentValue(row, context),
      );
      if (
        renderedOld.some((value) => value === null || hasMissing(value)) ||
        renderedNext.some((value) => value === null || hasMissing(value)) ||
        nextRows.some((row) => safeInteger(row.sequence) === null)
      )
        return blocked(
          context,
          "An installment is missing a valid sequence, date, amount, percentage, or component allocation.",
        );

      const changes: ApprovalPresentationChange[] = [];
      addChange(
        changes,
        "Installments",
        oldRows.length
          ? `${oldRows.length} payments · ${xof(sum(oldRows, "amountDue"))}`
          : null,
        `${nextRows.length} payments · ${xof(sum(nextRows, "amountDue"))}`,
        { creation: oldRows.length === 0 },
      );
      const oldById = new Map(oldRows.map((row) => [text(row.id, ""), row]));
      const oldBySequence = new Map(
        oldRows.map((row) => [amount(row.sequence), row]),
      );
      const matched = new Set<Record<string, unknown>>();
      for (const [index, next] of nextRows.entries()) {
        const id = text(next.id, "");
        const old =
          (id && oldById.get(id)) || oldBySequence.get(amount(next.sequence));
        if (old) matched.add(old);
        const previous = old ? paymentInstallmentValue(old, context) : null;
        const proposed = paymentInstallmentValue(next, context);
        if (proposed === null || (old && previous === null))
          return blocked(
            context,
            "An installment allocation could not be matched to a human charge label.",
          );
        addChange(
          changes,
          text(next.label, `Payment ${index + 1}`),
          previous,
          proposed,
          { creation: !old },
        );
      }
      for (const [index, old] of oldRows.entries()) {
        if (matched.has(old)) continue;
        const previous = paymentInstallmentValue(old, context);
        if (previous === null) return blocked(context);
        addChange(
          changes,
          text(old.label, `Payment ${index + 1}`),
          previous,
          "Removed",
          { removal: true },
        );
      }
      return finish(
        context,
        `${mode === "create" ? "Create" : mode === "replace" ? "Replace" : "Update"} the student payment plan`,
        changes,
      );
    }

    case "discount":
    case "scholarship": {
      const billingContext = record(after.billingContext);
      const label = text(
        after.label,
        input.kind === "scholarship" ? "Scholarship" : "Discount",
      );
      return finish(context, `Add ${label}`, [
        {
          label: "Billing period",
          type: "create",
          previous: null,
          // billingContext is captured at submission time by this release, so a
          // request queued before it shipped carries none. A missing term name
          // must not make an otherwise-reviewable charge unapprovable.
          proposed: `${text(billingContext.termName, "Term not recorded")} · ${text(billingContext.academicYearLabel, year)}`,
        },
        {
          label,
          type: "create",
          previous: null,
          proposed: `−${xof(after.amountXof)}`,
          detail: `Credit applied to the approved student account · Cost center ${text(after.costCenterCode, "Default tuition center")}`,
        },
      ]);
    }

    case "billing_profile": {
      const creating = !before.id;
      const oldSelections = rows(before.selections);
      const nextSelections = rows(after.preparedSelections);
      if (!nextSelections.length)
        return blocked(
          context,
          "The annual-profile service amounts are missing from this request. Refresh and submit it again.",
        );
      const oldByKind = new Map(
        oldSelections.map((row) => [text(row.kind), row]),
      );
      const nextByKind = new Map(
        nextSelections.map((row) => [text(row.kind), row]),
      );
      const labels: Record<string, string> = {
        housing: "Housing",
        cafeteria: "Cafeteria",
        insurance: "Insurance",
        housing_caution: "Housing caution",
      };
      const changes: ApprovalPresentationChange[] = [];
      for (const kind of Object.keys(labels)) {
        const old = oldByKind.get(kind);
        const next = nextByKind.get(kind);
        if (!next) return blocked(context);
        addChange(
          changes,
          labels[kind]!,
          old ? profileSelectionValue(old) : null,
          profileSelectionValue(next),
          { creation: !old },
        );
      }
      const beforeAdjustments = rows(before.invoiceAdjustments);
      const prefix = `billing-profile:${text(before.id)}:revision:`;
      const currentReference = `${prefix}${text(before.revision)}`;
      const tagged = beforeAdjustments.some((row) =>
        text(row.sourceReference, "").startsWith(prefix),
      );
      const currentAdjustments = beforeAdjustments.filter(
        (row) => !tagged || row.sourceReference === currentReference,
      );
      const activeIds = new Set(
        currentAdjustments.map((row) => text(row.id, "")),
      );
      const awardIds = new Set(
        rows(before.awards)
          .filter((row) => activeIds.has(text(row.invoiceAdjustmentId, "")))
          .map((row) => text(row.invoiceAdjustmentId, "")),
      );
      const awardByAdjustmentId = new Map(
        rows(before.awards)
          .filter((row) => activeIds.has(text(row.invoiceAdjustmentId, "")))
          .map((row) => [text(row.invoiceAdjustmentId, ""), row]),
      );
      const orderedCurrent = [
        ...currentAdjustments.filter((row) => awardIds.has(text(row.id, ""))),
        ...currentAdjustments.filter((row) => !awardIds.has(text(row.id, ""))),
      ].map((row) => {
        const award = awardByAdjustmentId.get(text(row.id, ""));
        return award
          ? { ...row, ...award, isAward: true }
          : {
              ...row,
              isAward: false,
              requiresApproval: true,
            };
      });
      if (
        (Array.isArray(after.awardDefinitionIds) ||
          Array.isArray(after.manualAdjustments)) &&
        !Array.isArray(after.preparedAdjustments)
      )
        return blocked(context);
      const nextAdjustments = rows(after.preparedAdjustments);
      addChange(
        changes,
        "Awards & adjustments",
        creating
          ? null
          : orderedCurrent.length
            ? orderedCurrent.map(profileAdjustmentValue).join("; ")
            : "None",
        nextAdjustments.length
          ? nextAdjustments.map(profileAdjustmentValue).join("; ")
          : "None",
        { creation: creating },
      );
      const mutationCountBeforeBridge = changes.length;
      addChange(
        changes,
        "Gross charges",
        creating ? null : xof(before.grossChargesXof),
        xof(after.preparedGrossChargesXof),
        { creation: creating },
      );
      addChange(
        changes,
        "Net bill",
        creating ? null : xof(before.netBilledXof),
        xof(after.preparedNetBilledXof),
        { creation: creating },
      );
      if (
        mutationCountBeforeBridge > 0 &&
        !creating &&
        xof(before.grossChargesXof) === xof(after.preparedGrossChargesXof)
      ) {
        changes.push({
          label: "Gross charges",
          type: "unchanged",
          previous: xof(before.grossChargesXof),
          proposed: xof(after.preparedGrossChargesXof),
          detail: "Gross charges remain unchanged after this proposal.",
        });
      }
      if (mutationCountBeforeBridge === 0 && changes.length === 0) {
        return blocked(
          context,
          "This annual-profile request does not contain a material change.",
        );
      }
      return finish(
        context,
        `Annual billing profile${year ? ` for ${year}` : ""}`,
        changes,
      );
    }

    case "billing_catalog": {
      const oldServices = rows(before.serviceOptions);
      const nextServices = rows(after.serviceOptions);
      const serviceKey = (row: Record<string, unknown>) =>
        `${text(row.kind)}:${text(row.code)}`;
      const oldByKey = new Map(
        oldServices.map((row) => [serviceKey(row), row]),
      );
      const nextByKey = new Map(
        nextServices.map((row) => [serviceKey(row), row]),
      );
      const changes: ApprovalPresentationChange[] = [];
      for (const next of nextServices) {
        const old = oldByKey.get(serviceKey(next));
        addChange(
          changes,
          `${text(next.label, "Service option")} (${human(next.kind)})`,
          old ? serviceOptionValue(old) : null,
          serviceOptionValue(next),
          { creation: !old },
        );
      }
      for (const old of oldServices) {
        if (nextByKey.has(serviceKey(old))) continue;
        addChange(
          changes,
          `${text(old.label, "Service option")} (${human(old.kind)})`,
          serviceOptionValue(old),
          "Removed",
          { removal: true },
        );
      }
      const oldAdjustments = rows(before.adjustmentDefinitions);
      const nextAdjustments = rows(after.adjustmentDefinitions);
      const adjustmentKey = (row: Record<string, unknown>) =>
        text(row.key, text(row.label));
      const oldAdjustmentByKey = new Map(
        oldAdjustments.map((row) => [adjustmentKey(row), row]),
      );
      const nextAdjustmentByKey = new Map(
        nextAdjustments.map((row) => [adjustmentKey(row), row]),
      );
      for (const next of nextAdjustments) {
        const old = oldAdjustmentByKey.get(adjustmentKey(next));
        addChange(
          changes,
          text(next.label, "Award or adjustment"),
          old ? adjustmentDefinitionValue(old) : null,
          adjustmentDefinitionValue(next),
          { creation: !old },
        );
      }
      for (const old of oldAdjustments) {
        if (nextAdjustmentByKey.has(adjustmentKey(old))) continue;
        addChange(
          changes,
          text(old.label, "Award or adjustment"),
          adjustmentDefinitionValue(old),
          "Removed",
          { removal: true },
        );
      }
      return finish(
        context,
        `Billing catalog${year ? ` for ${year}` : ""}`,
        changes,
      );
    }

    case "operating_budget": {
      const oldBudget = budgetSnapshot(input.beforeJson);
      const nextBudget = budgetSnapshot(input.afterJson);
      const oldTotals = budgetTotals(input.beforeJson);
      const nextTotals = budgetTotals(input.afterJson);
      const creating = !before.id;
      const changes: ApprovalPresentationChange[] = [];
      addChange(
        changes,
        "Opening balance",
        creating ? null : xof(oldTotals.opening),
        xof(nextTotals.opening),
        { creation: creating },
      );
      addChange(
        changes,
        "Planned income",
        creating ? null : xof(oldTotals.income),
        xof(nextTotals.income),
        { creation: creating },
      );
      addChange(
        changes,
        "Planned expenses",
        creating ? null : xof(oldTotals.expense),
        xof(nextTotals.expense),
        { creation: creating },
      );
      const lineKey = (row: Record<string, unknown>) =>
        `${text(row.categoryKey)}:${amount(row.monthIndex)}`;
      const oldLines = rows(oldBudget.lines);
      const nextLines = rows(nextBudget.lines);
      const oldByKey = new Map(oldLines.map((row) => [lineKey(row), row]));
      const nextByKey = new Map(nextLines.map((row) => [lineKey(row), row]));
      for (const next of nextLines) {
        const old = oldByKey.get(lineKey(next));
        addChange(
          changes,
          `${human(next.categoryKey)} — ${budgetMonth(year, amount(next.monthIndex))}`,
          old ? xof(old.amountXof) : null,
          xof(next.amountXof),
          { creation: !old },
        );
      }
      for (const old of oldLines) {
        if (nextByKey.has(lineKey(old))) continue;
        addChange(
          changes,
          `${human(old.categoryKey)} — ${budgetMonth(year, amount(old.monthIndex))}`,
          xof(old.amountXof),
          "Removed",
          { removal: true },
        );
      }
      return finish(
        context,
        `Operating budget${year ? ` for ${year}` : ""}`,
        changes,
      );
    }

    case "management_actual": {
      const mode = text(after.mode, "update");
      const removing = mode === "void_expense" || mode === "void_entry";
      const creating = mode === "create_income" || mode === "create_expense";
      const adjustment = mode === "adjustment";
      const changes: ApprovalPresentationChange[] = [];

      if (removing) {
        const expense = mode === "void_expense";
        // Older void snapshots carry a bare academicYearId and no label. That is
        // no reason to block review of what is being voided — the amount, date,
        // category and payee below all still resolve.
        const academicYear = text(
          record(before.academicYear).label,
          text(before.academicYearLabel, "Not recorded"),
        );
        const categoryRelation = record(
          before.managementCategory ?? before.category,
        );
        const category = text(
          categoryRelation.label,
          typeof before.category === "string" && before.category.trim()
            ? before.category
            : human(before.managementCategoryKey ?? before.categoryKey),
        );
        const amountBefore = xof(expense ? before.amount : before.amountXof);
        const dateBefore = date(
          expense ? before.incurredOn : before.occurredOn,
        );
        const description =
          before.description === null
            ? "No description"
            : text(before.description);
        const removalRows: Array<[string, string]> = [
          ["Academic year", academicYear],
          ["Category", category],
          ["Cost center", text(before.costCenterCode)],
          ["Amount", amountBefore],
          ["Date", dateBefore],
          ["Description", description],
        ];
        if (expense) {
          removalRows.push(
            [
              "Payee",
              before.payee === null ? "None" : text(before.payee),
            ],
            ["Estimate", yesNo(before.isEstimate)],
          );
        } else {
          removalRows.push([
            "Record type",
            enumHuman(before.type, ["manual_income", "adjustment"]),
          ]);
        }
        for (const [label, previous] of removalRows) {
          addChange(changes, label, previous, previous, { removal: true });
        }
        return finish(
          context,
          "Remove this record from reported actuals",
          changes,
        );
      }

      const options = { creation: creating, removal: removing };
      const contextOptions = {
        creation: creating || adjustment,
        removal: removing,
      };
      addChange(
        changes,
        "Academic year",
        creating || adjustment
          ? null
          : text(record(before.academicYear).label, year),
        text(after.academicYear, year),
        contextOptions,
      );
      addChange(
        changes,
        "Category",
        creating || adjustment
          ? null
          : human(
              before.managementCategoryKey ??
                before.categoryKey ??
                before.category,
            ),
        human(after.categoryLabel ?? after.categoryKey),
        contextOptions,
      );
      addChange(
        changes,
        "Cost center",
        creating || adjustment ? null : text(before.costCenterCode),
        text(after.costCenterCode),
        contextOptions,
      );
      addChange(
        changes,
        "Amount",
        creating
          ? null
          : xof(
              adjustment
                ? after.baseActualXof
                : (before.amountXof ?? before.amount),
            ),
        xof(
          adjustment
            ? after.targetActualXof
            : (after.amountXof ?? after.amount),
        ),
        options,
      );
      addChange(
        changes,
        "Date",
        creating || adjustment
          ? null
          : date(before.occurredOn ?? before.incurredOn),
        date(after.occurredOn ?? after.month),
        contextOptions,
      );
      addChange(
        changes,
        "Description",
        creating || adjustment ? null : text(before.description),
        text(after.description),
        contextOptions,
      );
      if (mode.includes("expense")) {
        addChange(
          changes,
          "Payee",
          creating ? null : text(before.payee, "None"),
          text(after.payee, "None"),
          options,
        );
        addChange(
          changes,
          "Estimate",
          creating ? null : yesNo(before.isEstimate),
          yesNo(after.isEstimate),
          options,
        );
      }
      if (adjustment)
        changes.push({
          label: "Adjustment amount",
          type: "create",
          previous: null,
          proposed: xof(after.amountXof),
          detail: "Difference between the approved actual and proposed total",
        });
      return finish(
        context,
        removing
          ? "Remove this record from reported actuals"
          : `${creating ? "Record" : adjustment ? "Adjust" : "Update"} management actual`,
        changes,
      );
    }

    case "student_enrollment_override": {
      const changes: ApprovalPresentationChange[] = [
        {
          label: "Requested exceptions",
          type: "create",
          previous: null,
          proposed: Array.isArray(after.requestedWaivers)
            ? after.requestedWaivers.map((value) => human(value)).join(", ") ||
              "No exceptions selected"
            : "No exceptions selected",
        },
      ];
      for (const [index, failure] of rows(after.failures).entries()) {
        const proposed = enrollmentFailureValue(failure);
        if (!proposed)
          return blocked(
            context,
            "An enrollment rule failure could not be translated into a human-readable review.",
          );
        changes.push({
          label: `Rule failure ${index + 1}`,
          type: "create",
          previous: null,
          proposed,
        });
      }
      return finish(context, "Enrollment rule exception", changes);
    }
  }

  return blocked(context, "This approval kind does not have a safe reviewer.");
}

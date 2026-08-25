import type { MealPeriod, MealPlanType } from "./dining.js";

/**
 * Why a scan was allowed or refused. `INVALID` and `UNKNOWN` are decided before this
 * module runs — the pass has to resolve to an active student first.
 */
export const DINING_VERDICT_CODES = [
  "OK",
  "INVALID",
  "UNKNOWN",
  "NO_PLAN",
  "UNPAID",
  "NOT_COVERED",
  "SERVED",
] as const;

export type DiningVerdictCode = (typeof DINING_VERDICT_CODES)[number];

export type DiningVerdict = {
  code: DiningVerdictCode;
  reason: string;
  /** Whether the door opens. */
  serve: boolean;
  /** Whether staff may waive this refusal. Never true for a verdict that opens the door. */
  overridable: boolean;
};

export type DiningEligibilityInput = {
  planType: MealPlanType | null;
  planActive: boolean;
  period: MealPeriod;
  /** Total overdue across the student's account, from deriveApiAccountPosition(). */
  overdueXof: number;
  alreadyServed: boolean;
  /** Ops kill-switch: AppSetting["dining.enforcePayment"]. */
  enforcePayment: boolean;
  /** Ops kill-switch: AppSetting["dining.blockSecondScan"]. */
  blockSecondScan?: boolean;
};

const PERIOD_LABELS: Record<MealPeriod, string> = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
};

const PLAN_LABELS: Record<Exclude<MealPlanType, "none">, string> = {
  full: "Full pension",
  half: "Half pension",
};

/**
 * The entrance rule, in one place, so the scanner and the student's own screen can never
 * disagree about whether the door will open. Order is significant: a student with no plan
 * is refused before we look at their balance, so the reason they are shown is the one they
 * can act on.
 */
export function diningEligibility(
  input: DiningEligibilityInput,
): DiningVerdict {
  const {
    planType,
    planActive,
    period,
    overdueXof,
    alreadyServed,
    enforcePayment,
    blockSecondScan = true,
  } = input;

  if (!planActive || planType === null || planType === "none") {
    return refuse("NO_PLAN", "No active meal plan", false);
  }

  if (enforcePayment && overdueXof > 0) {
    return refuse("UNPAID", "Payment not confirmed for this term", true);
  }

  if (planType === "half" && period === "dinner") {
    return refuse("NOT_COVERED", "Half plan — dinner not covered", true);
  }

  if (blockSecondScan && alreadyServed) {
    return refuse(
      "SERVED",
      `Already served ${PERIOD_LABELS[period]} today`,
      true,
    );
  }

  return {
    code: "OK",
    reason: `Meal plan active · ${PLAN_LABELS[planType]}`,
    serve: true,
    overridable: false,
  };
}

function refuse(
  code: DiningVerdictCode,
  reason: string,
  overridable: boolean,
): DiningVerdict {
  return { code, reason, serve: false, overridable };
}
